const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: { type: String, required: true, minlength: 8 },
        isAdmin: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// Song schema for online tracks uploaded by Admin
const songSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        artist: { type: String, required: true, trim: true },
        album: { type: String, default: "Cloud Single" },
        duration: { type: String, default: "3:30" },
        audioUrl: { type: String, required: true }, // Supabase public URL
        coverUrl: { type: String, default: "" },   // Supabase public URL
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

module.exports = {
    userSchema,
    songSchema,
};