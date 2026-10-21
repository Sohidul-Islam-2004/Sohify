const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files whether server.js is inside a subfolder or project root
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

const { userSchema, songSchema, playlistSchema } = require("./schema");
const User = mongoose.model("User", userSchema);
const Song = mongoose.model("Song", songSchema);
const Playlist = mongoose.model("Playlist", playlistSchema);

const PORT = process.env.PORT || 5000;
const DB_URL = process.env.DB_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

/* ============================================================
   FILE UPLOAD (memory -> Supabase Storage)
   ============================================================ */
const AUDIO_EXT_REGEX = /\.(mp3|wav|ogg|m4a|flac|aac|webm)$/i;
const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|gif|avif|svg)$/i;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file (supports WAV/FLAC)
    fileFilter: (req, file, cb) => {
        const isAudio =
            file.fieldname === "audio" &&
            (file.mimetype.startsWith("audio/") || AUDIO_EXT_REGEX.test(file.originalname));
        const isImage =
            (file.fieldname === "cover" || file.fieldname === "avatar") &&
            (file.mimetype.startsWith("image/") || IMAGE_EXT_REGEX.test(file.originalname));

        const ok = isAudio || isImage;
        cb(ok ? null : new Error(`Invalid file type for "${file.fieldname}".`), ok);
    }
});

const sanitize = (name) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

/** Uploads one multer file to Supabase and returns its public URL. */
async function uploadToSupabase(folder, file) {
    const filePath = `${folder}/${Date.now()}_${sanitize(file.originalname)}`;
    const { error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(filePath, file.buffer, { contentType: file.mimetype || "application/octet-stream" });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filePath).data.publicUrl;
}

mongoose
    .connect(DB_URL)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => {
        console.error("❌ MongoDB connection failed:", err.message);
        process.exit(1);
    });

/* ============================================================
   HELPERS
   ============================================================ */
const isId = (id) => mongoose.isValidObjectId(id);

/** Loads a user or sends the right error response. Returns null if it responded. */
async function getUserOr404(userId, res) {
    if (!isId(userId)) {
        res.status(400).json({ message: "Invalid user id." });
        return null;
    }
    const user = await User.findById(userId);
    if (!user) {
        res.status(404).json({ message: "User not found." });
        return null;
    }
    return user;
}

/* ============================================================
   AUTHENTICATION
   ============================================================ */
app.post("/api/users/register", async (req, res) => {
    try {
        const { fullName, email, password, confirmPassword } = req.body;
        if (!fullName || !email || !password) return res.status(400).json({ message: "All fields are required." });
        if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters." });
        if (confirmPassword !== undefined && password !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match." });
        }

        const existing = await User.findOne({ email: email.toLowerCase().trim() });
        if (existing) return res.status(409).json({ message: "Email already exists." });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({
            name: fullName.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword
        });

        res.status(201).json({
            success: true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin,
                avatarUrl: user.avatarUrl || ""
            }
        });
    } catch (err) {
        res.status(500).json({ message: "Server error." });
    }
});

app.post("/api/users/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: "Email and password are required." });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(404).json({ message: "User not found." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Incorrect password." });

        res.json({
            success: true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin,
                avatarUrl: user.avatarUrl || ""
            }
        });
    } catch (err) {
        res.status(500).json({ message: "Server error." });
    }
});

/* ============================================================
   SONGS
   ============================================================ */

// Public songs + (if ?userId=... is given) that user's own private songs
app.get("/api/songs", async (req, res) => {
    try {
        const { userId } = req.query;
        const filter = isId(userId)
            ? { $or: [{ isPrivate: false }, { isPrivate: {$exists: false } }, { uploadedBy: userId }] }
            : { isPrivate: { $ne: true } };

        const songs = await Song.find(filter).sort({ createdAt: -1 }).lean();
        res.json(songs);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch songs" });
    }
});

// Upload: admins -> public catalog, any logged-in user -> private song
app.post(
    "/api/songs",
    upload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]),
    async (req, res) => {
        try {
            const { title, artist, album, duration, userId, isPrivate } = req.body;
            if (!req.files?.audio) return res.status(400).json({ message: "Audio is required." });
            if (!title || !artist) return res.status(400).json({ message: "Title and artist are required." });

            const user = await getUserOr404(userId, res);
            if (!user) return;

            const priv = isPrivate === "true" || isPrivate === true;
            if (!priv && !user.isAdmin) {
                return res.status(403).json({ message: "Only admins can publish to the cloud catalog." });
            }

            const audioUrl = await uploadToSupabase("audio", req.files.audio[0]);
            const coverUrl = req.files.cover ? await uploadToSupabase("covers", req.files.cover[0]) : "";

            const song = await Song.create({
                title: title.trim(),
                artist: artist.trim(),
                album: (album || "").trim(),
                duration: duration || "--:--",
                audioUrl,
                coverUrl,
                uploadedBy: user._id,
                isPrivate: priv
            });

            if (priv) {
                user.localSong.push(song._id);
                await user.save();
            }

            res.status(201).json(song);
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    }
);

/* ============================================================
   USER DATA (AVATAR, LIBRARY, LIKES, RECENTS, PLAYLISTS)
   ============================================================ */

// Upload / change profile picture (Supabase + MongoDB)
app.post("/api/users/:userId/avatar", upload.single("avatar"), async (req, res) => {
    try {
        const user = await getUserOr404(req.params.userId, res);
        if (!user) return;
        if (!req.file) return res.status(400).json({ message: "Image is required." });

        user.avatarUrl = await uploadToSupabase("avatars", req.file);
        await user.save();
        res.json({ avatarUrl: user.avatarUrl });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Full library: likes, recents, playlists, avatar
app.get("/api/users/:userId/library", async (req, res) => {
    try {
        if (!isId(req.params.userId)) return res.status(400).json({ message: "Invalid user id." });

        const user = await User.findById(req.params.userId).populate("playlists").lean();
        if (!user) return res.status(404).json({ message: "User not found" });

        res.json({
            avatarUrl: user.avatarUrl || "",
            likedSongs: (user.likedSongs || []).map(String),
            recentSongs: (user.recentSongs || []).map(String),
            localSongs: (user.localSong || []).map(String),
            playlists: (user.playlists || []).map((p) => ({
                _id: String(p._id),
                name: p.name,
                coverUrl: p.coverUrl,
                songs: (p.songs || []).map(String)
            }))
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Toggle Like
app.post("/api/users/:userId/like", async (req, res) => {
    try {
        const { songId } = req.body;
        if (!isId(songId)) return res.status(400).json({ message: "Invalid song id." });

        const user = await getUserOr404(req.params.userId, res);
        if (!user) return;
        if (!(await Song.exists({ _id: songId }))) return res.status(404).json({ message: "Song not found." });

        const isLiked = user.likedSongs.some((id) => id.toString() === songId);
        if (isLiked) user.likedSongs.pull(songId);
        else user.likedSongs.push(songId);

        await user.save();
        res.json({ liked: !isLiked, likedSongs: user.likedSongs.map(String) });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add to Recent (newest first, max 10)
app.post("/api/users/:userId/recent", async (req, res) => {
    try {
        const { songId } = req.body;
        if (!isId(songId)) return res.status(400).json({ message: "Invalid song id." });

        const user = await getUserOr404(req.params.userId, res);
        if (!user) return;

        const rest = user.recentSongs.filter((id) => id.toString() !== songId);
        user.recentSongs = [songId, ...rest].slice(0, 10);

        await user.save();
        res.json(user.recentSongs.map(String));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Create Playlist
app.post("/api/users/:userId/playlists", async (req, res) => {
    try {
        const name = (req.body.name || "").trim();
        if (!name) return res.status(400).json({ message: "Playlist name is required." });

        const user = await getUserOr404(req.params.userId, res);
        if (!user) return;

        const playlist = await Playlist.create({ name, user: user._id });
        user.playlists.push(playlist._id);
        await user.save();

        res.status(201).json(playlist);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete Playlist (owner only)  ->  DELETE /api/playlists/:id?userId=...
app.delete("/api/playlists/:playlistId", async (req, res) => {
    try {
        const { playlistId } = req.params;
        const { userId } = req.query;
        if (!isId(playlistId) || !isId(userId)) return res.status(400).json({ message: "Invalid id." });

        const playlist = await Playlist.findById(playlistId);
        if (!playlist) return res.status(404).json({ message: "Playlist not found." });
        if (playlist.user.toString() !== userId) return res.status(403).json({ message: "Not your playlist." });

        await playlist.deleteOne();
        await User.updateMany({ playlists: playlistId }, { $pull: { playlists: playlistId } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add/Remove Song in Playlist (owner only)
app.put("/api/playlists/:playlistId/toggle-song", async (req, res) => {
    try {
        const { songId, userId } = req.body;
        if (!isId(req.params.playlistId) || !isId(songId) || !isId(userId)) {
            return res.status(400).json({ message: "Invalid id." });
        }

        const playlist = await Playlist.findById(req.params.playlistId);
        if (!playlist) return res.status(404).json({ message: "Playlist not found." });
        if (playlist.user.toString() !== userId) return res.status(403).json({ message: "Not your playlist." });
        if (!(await Song.exists({ _id: songId }))) return res.status(404).json({ message: "Song not found." });

        const isIncluded = playlist.songs.some((id) => id.toString() === songId);
        if (isIncluded) playlist.songs.pull(songId);
        else playlist.songs.push(songId);

        await playlist.save();
        res.json({ added: !isIncluded, songs: playlist.songs.map(String) });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/* ============================================================
   ERRORS
   ============================================================ */
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

// Multer / unexpected errors -> JSON instead of an HTML error page
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "File too large (max 50 MB)." });
    }
    res.status(400).json({ message: err.message || "Request failed." });
});

app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));