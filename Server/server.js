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
app.use(express.static(path.join(__dirname, "..", "public")));

// ---- Import Mongoose Schemas ----
const { userSchema, songSchema, cloudSongSchema } = require("./schema");
const User = mongoose.model("User", userSchema);
const Song = mongoose.model("Song", songSchema);
const Cloud = mongoose.model("CloudSong", cloudSongSchema);

const PORT = process.env.PORT;
const DB_URL = process.env.DB_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
});

// ---- Multer Setup (Memory Storage for Supabase Forwarding) ----
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB cap (matches Supabase Free Tier limit)
    fileFilter: (req, file, cb) => {
        if (file.fieldname === "audio") {
            if (file.mimetype.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac)$/i.test(file.originalname)) {
                return cb(null, true);
            }
            return cb(new Error("Only audio files are allowed for 'audio' field."));
        }
        if (file.fieldname === "cover") {
            if (file.mimetype.startsWith("image/")) return cb(null, true);
            return cb(new Error("Only image files are allowed for 'cover' field."));
        }
        cb(new Error("Unexpected file field."));
    },
});

// ---- MongoDB Connection ----
mongoose
    .connect(DB_URL)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));

/* ============================================================
   USER AUTHENTICATION ROUTES
   ============================================================ */

app.post("/api/users/register", async (req, res) => {
    try {
        const { fullName, name, email, password, confirmPassword } = req.body;
        const displayName = (fullName || name || "").trim();

        if (!displayName)
            return res.status(400).json({ field: "fullName", message: "Please enter your full name." });

        if (!email || !email.trim())
            return res.status(400).json({ field: "email", message: "Please enter an email address." });

        if (!password || password.length < 8)
            return res.status(400).json({ field: "password", message: "Password must be at least 8 characters." });

        if (password !== confirmPassword)
            return res.status(400).json({ field: "confirmPassword", message: "Passwords do not match." });

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing)
            return res.status(409).json({ field: "email", message: "An account with this email already exists." });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            name: displayName,
            email: email.toLowerCase().trim(),
            password: hashedPassword,
        });

        res.status(201).json({
            success: true,
            message: "Account created successfully",
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin,
                registeredAt: user.createdAt,
            },
        });
    } catch (err) {
        console.error("Register error:", err);
        if (err.code === 11000)
            return res.status(409).json({ field: "email", message: "An account with this email already exists." });
        if (err.name === "ValidationError") {
            const first = Object.values(err.errors)[0];
            return res.status(400).json({ field: first.path, message: first.message });
        }
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

app.post("/api/users/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !email.trim())
            return res.status(400).json({ field: "email", message: "Please enter your email address." });

        if (!password)
            return res.status(400).json({ field: "password", message: "Please enter your password." });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user)
            return res.status(404).json({ field: "email", message: "No account found with this email." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            return res.status(401).json({ field: "password", message: "Incorrect password. Please try again." });

        res.json({
            success: true,
            message: "Logged in successfully",
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: Boolean(user.isAdmin),
                createdAt: user.createdAt,
            },
        });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

/* ============================================================
   ONLINE SONGS ROUTES (Supabase Storage + MongoDB + Cloud list)
   ============================================================ */

// Get all songs
app.get("/api/songs", async (req, res) => {
    try {
        const songs = await Song.find().sort({ createdAt: -1 }).lean();
        res.json(songs);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch songs" });
    }
});

// Admin upload: multipart/form-data with `audio` and optional `cover` files
app.post(
    "/api/songs",
    upload.fields([
        { name: "audio", maxCount: 1 },
        { name: "cover", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const { title, artist, userId } = req.body;

            if (!req.files || !req.files.audio || !req.files.audio[0]) {
                return res.status(400).json({ message: "Audio file is required (field name: 'audio')." });
            }

            const audioFile = req.files.audio[0];
            const coverFile = req.files.cover ? req.files.cover[0] : null;

            // 1. Upload audio to Supabase Storage (inside /audio folder in MusicPlayer bucket)
            const audioExt = path.extname(audioFile.originalname) || ".mp3";
            const audioPath = `audio/${Date.now()}_${Math.random().toString(36).slice(2, 8)}${audioExt}`;

            const { error: audioUploadErr } = await supabase.storage
                .from(SUPABASE_BUCKET)
                .upload(audioPath, audioFile.buffer, {
                    contentType: audioFile.mimetype,
                    cacheControl: "3600",
                    upsert: false,
                });

            if (audioUploadErr) {
                console.error("Supabase audio upload error:", audioUploadErr);
                return res.status(500).json({ message: "Audio upload failed: " + audioUploadErr.message });
            }

            const { data: audioPublic } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(audioPath);
            const audioUrl = audioPublic.publicUrl;

            // 2. Upload cover to Supabase Storage (inside /covers folder in MusicPlayer bucket)
            let coverUrl = "";
            if (coverFile) {
                const coverExt = path.extname(coverFile.originalname) || ".jpg";
                const coverPath = `covers/${Date.now()}_${Math.random().toString(36).slice(2, 8)}${coverExt}`;

                const { error: coverUploadErr } = await supabase.storage
                    .from(SUPABASE_BUCKET)
                    .upload(coverPath, coverFile.buffer, {
                        contentType: coverFile.mimetype,
                        cacheControl: "3600",
                        upsert: false,
                    });

                if (coverUploadErr) {
                    console.warn("Supabase cover upload error:", coverUploadErr);
                    // Don't fail the whole request — just proceed without a cover
                } else {
                    const { data: coverPublic } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(coverPath);
                    coverUrl = coverPublic.publicUrl;
                }
            }

            // 3. Create the Song in MongoDB
            const song = await Song.create({
                title: (title || "Untitled").trim(),
                artist: (artist || "Sohify Artist").trim(),
                audioUrl: audioUrl.trim(),
                coverUrl: coverUrl ? coverUrl.trim() : "",
                uploadedBy: userId || null,
            });

            // 4. Push song._id into the single Cloud doc's `list`
            //    - {} matches the one cloud doc
            //    - $addToSet prevents duplicates
            //    - upsert:true creates it if it doesn't exist yet
            await Cloud.findOneAndUpdate(
                {},
                { $addToSet: { list: song._id } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            res.status(201).json(song);
        } catch (err) {
            console.error("Song upload error:", err);
            res.status(500).json({ message: err.message || "Failed to save song." });
        }
    }
);

// Multer error handler (file too large, wrong type, etc.)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    if (err) {
        return res.status(400).json({ message: err.message });
    }
    next();
});

app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});

module.exports = app;