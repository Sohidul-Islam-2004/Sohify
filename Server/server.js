const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: __dirname + "/.env" });

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files whether server.js is inside a subfolder or project root
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

const { userSchema, songSchema, playlistSchema, emailVerificationSchema } = require("./schema");
const User = mongoose.model("User", userSchema);
const Song = mongoose.model("Song", songSchema);
const Playlist = mongoose.model("Playlist", playlistSchema);
const EmailVerification = mongoose.model("EmailVerification", emailVerificationSchema);
const { sendVerificationEmail } = require("./mailer");

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
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
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
    });

/* ============================================================
   HELPERS
   ============================================================ */
const isId = (id) => mongoose.isValidObjectId(id);

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
   AUTHENTICATION & EMAIL VERIFICATION (Google SMTP)
   ============================================================ */

/**
 * Step 1: Request 6-digit confirmation code via Google SMTP.
 * Validates credentials and sends the OTP to the user's original email.
 */
app.post("/api/users/send-verification", async (req, res) => {
    try {
        const { fullName, email, password, confirmPassword } = req.body;
        if (!fullName || !email || !password) {
            return res.status(400).json({ field: "fullName", message: "All fields are required." });
        }

        const cleanName = String(fullName).trim();
        const cleanEmail = String(email).toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({ field: "email", message: "Please enter a valid email address." });
        }

        if (password.length < 8) {
            return res.status(400).json({ field: "password", message: "Password must be at least 8 characters." });
        }
        if (confirmPassword !== undefined && password !== confirmPassword) {
            return res.status(400).json({ field: "confirmPassword", message: "Passwords do not match." });
        }

        // Check if an account already exists
        const existing = await User.findOne({ email: cleanEmail });
        if (existing) {
            return res.status(409).json({ field: "email", message: "An account with this email already exists. Please log in." });
        }

        // Rate limit: 45-second cooldown per email
        const pending = await EmailVerification.findOne({ email: cleanEmail });
        if (pending && pending.updatedAt && (Date.now() - new Date(pending.updatedAt).getTime() < 45000)) {
            const waitSecs = Math.ceil((45000 - (Date.now() - new Date(pending.updatedAt).getTime())) / 1000);
            return res.status(429).json({
                message: `Please wait ${waitSecs} seconds before requesting a new code.`
            });
        }

        // Generate 6-digit verification code
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const hashedPassword = await bcrypt.hash(password, 10);

        await EmailVerification.findOneAndUpdate(
            { email: cleanEmail },
            {
                email: cleanEmail,
                fullName: cleanName,
                password: hashedPassword,
                code,
                attempts: 0,
                createdAt: new Date(),
                updatedAt: new Date()
            },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
        );

        const mailResult = await sendVerificationEmail(cleanEmail, cleanName, code);

        res.status(200).json({
            success: true,
            message: `A 6-digit confirmation code was sent to ${cleanEmail}.`,
            email: cleanEmail,
            simulated: Boolean(mailResult.simulated)
        });
    } catch (err) {
        console.error("send-verification error:", err);
        res.status(500).json({ message: err.message || "Failed to send confirmation email." });
    }
});

/**
 * Resend 6-digit confirmation code with rate limiting
 */
app.post("/api/users/resend-verification", async (req, res) => {
    try {
        const cleanEmail = String(req.body.email || "").toLowerCase().trim();
        if (!cleanEmail) {
            return res.status(400).json({ message: "Email address is required." });
        }

        const pending = await EmailVerification.findOne({ email: cleanEmail });
        if (!pending) {
            return res.status(404).json({
                message: "Verification session expired or not found. Please fill out the registration form again."
            });
        }

        if (pending.updatedAt && (Date.now() - new Date(pending.updatedAt).getTime() < 45000)) {
            const waitSecs = Math.ceil((45000 - (Date.now() - new Date(pending.updatedAt).getTime())) / 1000);
            return res.status(429).json({
                message: `Please wait ${waitSecs} seconds before requesting another code.`
            });
        }

        const code = String(Math.floor(100000 + Math.random() * 900000));
        pending.code = code;
        pending.attempts = 0;
        pending.createdAt = new Date();
        pending.updatedAt = new Date();
        await pending.save();

        const mailResult = await sendVerificationEmail(cleanEmail, pending.fullName, code);

        res.json({
            success: true,
            message: `A new 6-digit confirmation code was sent to ${cleanEmail}.`,
            email: cleanEmail,
            simulated: Boolean(mailResult.simulated)
        });
    } catch (err) {
        console.error("resend-verification error:", err);
        res.status(500).json({ message: err.message || "Failed to resend confirmation email." });
    }
});

/**
 * Step 2: Confirm 6-digit code and create user in database
 */
app.post("/api/users/verify-and-register", async (req, res) => {
    try {
        const cleanEmail = String(req.body.email || "").toLowerCase().trim();
        const cleanCode = String(req.body.code || "").trim();

        if (!cleanEmail || !cleanCode) {
            return res.status(400).json({ message: "Email and 6-digit code are required." });
        }

        const pending = await EmailVerification.findOne({ email: cleanEmail });
        if (!pending) {
            return res.status(400).json({
                message: "Confirmation code has expired or does not exist. Please request a new code."
            });
        }

        if (pending.attempts >= 5) {
            await EmailVerification.deleteOne({ _id: pending._id });
            return res.status(429).json({
                message: "Too many failed attempts. For security, please sign up again to receive a fresh code."
            });
        }

        if (pending.code !== cleanCode) {
            pending.attempts += 1;
            await pending.save();
            const remaining = 5 - pending.attempts;
            return res.status(400).json({
                message: `Invalid confirmation code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
            });
        }

        const existing = await User.findOne({ email: cleanEmail });
        if (existing) {
            await EmailVerification.deleteOne({ _id: pending._id });
            return res.status(409).json({ message: "An account with this email already exists. Please log in." });
        }

        const user = await User.create({
            name: pending.fullName,
            email: pending.email,
            password: pending.password,
            isEmailVerified: true
        });

        await EmailVerification.deleteOne({ _id: pending._id });

        res.status(201).json({
            success: true,
            message: "Email confirmed successfully! Your account is active.",
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin,
                avatarUrl: user.avatarUrl || ""
            }
        });
    } catch (err) {
        console.error("verify-and-register error:", err);
        res.status(500).json({ message: "Server error during registration." });
    }
});

/**
 * Legacy/Standard registration router:
 * Requires code to finalize registration, ensuring email confirmation is strictly enforced.
 */
app.post("/api/users/register", async (req, res) => {
    if (req.body.code) {
        // Forward to verify-and-register
        req.url = "/api/users/verify-and-register";
        return app._router.handle(req, res);
    }
    return res.status(400).json({
        needsVerification: true,
        message: "Email verification is required. Please use the confirmation code sent to your email."
    });
});

app.post("/api/users/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: "Email and password are required." });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(404).json({ message: "User not found." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Incorrect password." });

        if (user.isEmailVerified === false) {
            return res.status(403).json({
                unverified: true,
                message: "Please confirm your email address before logging in."
            });
        }

        res.json({
            success: true,
            data: { id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin, avatarUrl: user.avatarUrl || "" }
        });
    } catch (err) {
        res.status(500).json({ message: "Server error." });
    }
});

/* ============================================================
   SONGS
   ============================================================ */
app.get("/api/songs", async (req, res) => {
    try {
        const { userId } = req.query;
        const filter = isId(userId)
            ? { $or: [{ isPrivate: false }, { isPrivate: { $exists: false } }, { uploadedBy: userId }] }
            : { isPrivate: { $ne: true } };

        const songs = await Song.find(filter).sort({ createdAt: -1 }).lean();
        res.json(songs);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch songs" });
    }
});

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
   USER DATA & PLAYLISTS
   ============================================================ */
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
                description: p.description,
                isPrivate: p.isPrivate,
                coverUrl: p.coverUrl,
                songs: (p.songs || []).map(String)
            }))
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

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

// GET Shared Playlist (Populates tracks, including private ones)
app.get("/api/playlists/:playlistId", async (req, res) => {
    try {
        if (!isId(req.params.playlistId)) return res.status(400).json({ message: "Invalid id." });
        const playlist = await Playlist.findById(req.params.playlistId)
            .populate("songs")
            .populate("user", "name avatarUrl");
        if (!playlist) return res.status(404).json({ message: "Playlist not found." });
        res.json(playlist);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

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

app.put("/api/playlists/:playlistId", upload.single("cover"), async (req, res) => {
    try {
        const { playlistId } = req.params;
        const { userId, name, description, isPrivate } = req.body;

        if (!isId(playlistId) || !isId(userId)) return res.status(400).json({ message: "Invalid id." });

        const playlist = await Playlist.findById(playlistId);
        if (!playlist) return res.status(404).json({ message: "Playlist not found." });
        if (playlist.user.toString() !== userId) return res.status(403).json({ message: "Not your playlist." });

        if (name) playlist.name = name.trim();
        if (description !== undefined) playlist.description = description.trim();
        if (isPrivate !== undefined) playlist.isPrivate = isPrivate === "true" || isPrivate === true;

        if (req.file) {
            playlist.coverUrl = await uploadToSupabase("covers", req.file);
        }

        await playlist.save();
        res.json(playlist);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

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
   HTML ROUTES (SPA-like navigation for Login, Sign-Up, Dashboard)
   ============================================================ */
app.get("/Login", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Login", "index.html")));
app.get("/Login/", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Login", "index.html")));
app.get("/Sign-Up", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Sign-Up", "index.html")));
app.get("/Sign-Up/", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Sign-Up", "index.html")));
app.get("/Dashboard", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Dashboard", "index.html")));
app.get("/Dashboard/", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Dashboard", "index.html")));

/* ============================================================
   ERRORS
   ============================================================ */
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "File too large (max 50 MB)." });
    }
    res.status(400).json({ message: err.message || "Request failed." });
});

app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));