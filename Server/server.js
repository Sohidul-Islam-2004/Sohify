const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const { userSchema } = require("./schema");
const User = mongoose.model("User", userSchema);

const PORT = process.env.PORT || 5000;
const DB_URL = process.env.DB_URL;

mongoose
    .connect(DB_URL)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));

app.post("/api/users/register", async (req, res) => {
    try {
        const { fullName, name, email, password, confirmPassword } = req.body;
        const displayName = (fullName || name || "").trim();

        if (!displayName)
            return res
                .status(400)
                .json({ field: "fullName", message: "Please enter your full name." });

        if (!email || !email.trim())
            return res
                .status(400)
                .json({ field: "email", message: "Please enter an email address." });

        if (!password || password.length < 8)
            return res.status(400).json({
                field: "password",
                message: "Password must be at least 8 characters.",
            });

        if (password !== confirmPassword)
            return res
                .status(400)
                .json({ field: "confirmPassword", message: "Passwords do not match." });

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing)
            return res.status(409).json({
                field: "email",
                message: "An account with this email already exists.",
            });

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
            return res.status(409).json({
                field: "email",
                message: "An account with this email already exists.",
            });

        if (err.name === "ValidationError") {
            const first = Object.values(err.errors)[0];
            return res
                .status(400)
                .json({ field: first.path, message: first.message });
        }

        res.status(500).json({ message: "Server error. Please try again." });
    }
});

app.post("/api/users/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !email.trim())
            return res
                .status(400)
                .json({ field: "email", message: "Please enter your email address." });

        if (!password)
            return res
                .status(400)
                .json({ field: "password", message: "Please enter your password." });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user)
            return res.status(404).json({
                field: "email",
                message: "No account found with this email.",
            });
        console.log(password, user.password);
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            return res.status(401).json({
                field: "password",
                message: "Incorrect password. Please try again.",
            });

        res.json({
            success: true,
            message: "Logged in successfully",
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin,
                createdAt: user.createdAt,
            },
        });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

app.use((req, res) =>
    res.status(404).json({ success: false, message: "Route not found" })
);

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});

module.exports = app;