const mongoose = require("mongoose");

/* ============================================================
   SOHIFY — DATA MODELS
   All app data lives in MongoDB.
   All files (audio, covers, avatars) live in Supabase Storage;
   MongoDB only stores their public URLs.
   ============================================================ */

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, required: true, minlength: 8 },   // bcrypt hash
        isAdmin: { type: Boolean, default: false },
        isEmailVerified: { type: Boolean, default: false },
        termsAccepted: { type: Boolean, default: false },
        termsAcceptedAt: { type: Date },
        passwordChangedAt: { type: Date },                          // sessions issued before this are rejected
        avatarUrl: { type: String, default: "" },                   // Supabase URL
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
        description: { type: String, default: "", trim: true },
        isPrivate: { type: Boolean, default: true },
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
        duration: { type: String, default: "--:--" },               // "m:ss"
        audioUrl: { type: String, required: true },                 // Supabase URL
        coverUrl: { type: String, default: "" },                    // Supabase URL
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        isPrivate: { type: Boolean, default: false }
    },
    { timestamps: true }
);

/* Pending sign-ups waiting for their email code (auto-deleted after 15 min). */
const emailVerificationSchema = new mongoose.Schema(
    {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        codeHash: { type: String, required: true },                  // sha256 of the 6-digit code
        fullName: { type: String, required: true, trim: true },
        password: { type: String, required: true },                  // bcrypt hash
        termsAccepted: { type: Boolean, default: false },
        termsAcceptedAt: { type: Date },
        attempts: { type: Number, default: 0 },
        createdAt: { type: Date, default: Date.now, expires: 900 }   // TTL: 15 minutes
    },
    { timestamps: true }
);

/* Forgot-password requests (auto-deleted after 15 min). */
const passwordResetSchema = new mongoose.Schema(
    {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        codeHash: { type: String, required: true },                  // sha256 of the 6-digit code
        attempts: { type: Number, default: 0 },
        resetTokenHash: { type: String, default: "" },               // set after the code is confirmed
        resetTokenExpiresAt: { type: Date },
        createdAt: { type: Date, default: Date.now, expires: 900 }   // TTL: 15 minutes
    },
    { timestamps: true }
);

/* ------------------------------------------------------------
   INDEXES — keep the hot queries fast as the catalog grows.
   ------------------------------------------------------------ */
songSchema.index({ isPrivate: 1, createdAt: -1 });   // public catalog, newest first
songSchema.index({ uploadedBy: 1, createdAt: -1 });  // "My uploads"
playlistSchema.index({ user: 1 });                   // a user's playlists
playlistSchema.index({ songs: 1 });                  // clean-up when a song is deleted
userSchema.index({ likedSongs: 1 });                 // clean-up when a song is deleted

module.exports = {
    userSchema,
    songSchema,
    playlistSchema,
    emailVerificationSchema,
    passwordResetSchema
};
