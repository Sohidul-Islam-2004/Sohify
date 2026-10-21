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


const cloudSongSchema = new mongoose.Schema(
    {
        list: [
            {
                type: mongoose.Schema.Types.ObjectId, ref: "Songs"
            }
        ]
    },
    { timestamps: true }
);

const songSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        artist: { type: String, required: true, trim: true },
        audioUrl: { type: String, required: true },
        coverUrl: { type: String, default: "" },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

module.exports = {
    userSchema,
    songSchema,
    cloudSongSchema
};