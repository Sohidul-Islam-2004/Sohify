const mongoose = require("mongoose");

/* ============================================================
   All app data lives in MongoDB.
   All files (audio, covers, avatars) live in Supabase Storage;
   MongoDB only stores their public URLs.
   ============================================================ */

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, required: true, minlength: 8 }, // bcrypt hash
        isAdmin: { type: Boolean, default: false },
        avatarUrl: { type: String, default: "" },                 // Supabase URL
        likedSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Song" }],
        recentSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Song" }],
        localSong: [{ type: mongoose.Schema.Types.ObjectId, ref: "Song" }],
        playlists: [{ type: mongoose.Schema.Types.ObjectId, ref: "Playlist" }]
    },
    { timestamps: true }
);

const playlistSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        coverUrl: { type: String, default: "" },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        songs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Song" }]
    },
    { timestamps: true }
);

const songSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        artist: { type: String, required: true, trim: true },
        album: { type: String, default: "", trim: true },
        duration: { type: String, default: "--:--" },             // "m:ss"
        audioUrl: { type: String, required: true },               // Supabase URL
        coverUrl: { type: String, default: "" },                  // Supabase URL
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        isPrivate: { type: Boolean, default: false }
    },
    { timestamps: true }
);

module.exports = {
    userSchema,
    songSchema,
    playlistSchema
};