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

const { userSchema, songSchema, cloudSongSchema } = require("./schema");
const User = mongoose.model("User", userSchema);
const Song = mongoose.model("Song", songSchema);
const Cloud = mongoose.model("CloudSong", cloudSongSchema);

const PORT = process.env.PORT || 5000;
const DB_URL = process.env.DB_URL;

// ---- Supabase client (server-side) ----
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "MusicPlayer"; // Uses your single bucket

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
});

// ---- Multer: keep files in memory ----
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB cap per file
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

mongoose
    .connect(DB_URL)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));

/* ============================================================
   USER AUTHENTICATION ROUTES
   ============================================================ */

app.post("/api/users/register", async (req, res) => {
    // ... (Keep your existing register route code here) ...
});

app.post("/api/users/login", async (req, res) => {
    // ... (Keep your existing login route code here) ...
});

/* ============================================================
   ONLINE SONGS ROUTES (Single Supabase Bucket + MongoDB)
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

// Admin upload: multipart/form-data
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

            // 1. Upload audio to Supabase Storage (inside /audio folder)
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

            // 2. Upload cover to Supabase Storage (inside /covers folder)
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

// Multer error handler
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