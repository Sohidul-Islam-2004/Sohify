const express = require("express");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const multer = require("multer");
const dns = require("dns");
try {
    dns.setServers(["2001:4860:4860::8888", "2001:4860:4860::8844", "8.8.8.8", "1.1.1.1"]);
} catch {}
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: __dirname + "/.env" });

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Serve static files whether server.js is inside a subfolder or project root
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

const { userSchema, songSchema, playlistSchema, emailVerificationSchema, passwordResetSchema } = require("./schema");
const User = mongoose.model("User", userSchema);
const Song = mongoose.model("Song", songSchema);
const Playlist = mongoose.model("Playlist", playlistSchema);
const EmailVerification = mongoose.model("EmailVerification", emailVerificationSchema);
const PasswordReset = mongoose.model("PasswordReset", passwordResetSchema);
const { sendVerificationEmail, sendPasswordResetEmail } = require("./mailer");

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_COOKIE_NAME = "sohify_session";
const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    crypto
        .createHash("sha256")
        .update(`sound-pulse-session:${process.env.DB_URL || ""}:${process.env.EMAIL_PASS || "dev-secret"}`)
        .digest("hex");

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

function passwordFingerprint(passwordHash) {
    return crypto.createHash("sha256").update(String(passwordHash || "")).digest("hex").slice(0, 12);
}

function signSessionToken(user, rememberMe = false) {
    const now = Date.now();
    const ttl = rememberMe ? THIRTY_DAYS_MS : ONE_DAY_MS;
    const expiresAt = now + ttl;
    const payload = {
        sub: String(user._id),
        email: user.email,
        rememberMe: Boolean(rememberMe),
        pwv: passwordFingerprint(user.password),
        iat: now,
        exp: expiresAt
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
    return { token: `${encoded}.${sig}`, expiresAt };
}

function verifySessionToken(token) {
    if (!token || typeof token !== "string" || !token.includes(".")) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    if (!encoded || !sig) return null;

    const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
        if (!payload || !payload.sub || !payload.exp || Date.now() > Number(payload.exp)) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}

function parseCookies(req) {
    const header = req.headers.cookie;
    const cookies = {};
    if (!header) return cookies;
    header.split(";").forEach((part) => {
        const idx = part.indexOf("=");
        if (idx === -1) return;
        const key = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        try {
            cookies[key] = decodeURIComponent(val);
        } catch {
            cookies[key] = val;
        }
    });
    return cookies;
}

function getRequestToken(req) {
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
        return authHeader.slice(7).trim();
    }
    const cookies = parseCookies(req);
    return cookies[SESSION_COOKIE_NAME] || "";
}

function setSessionCookie(res, req, token, rememberMe) {
    const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
    const opts = {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: Boolean(isHttps)
    };
    if (rememberMe) {
        opts.maxAge = THIRTY_DAYS_MS;
    }
    res.cookie(SESSION_COOKIE_NAME, token, opts);
}

function clearSessionCookie(res, req) {
    const isHttps = req?.secure || req?.headers?.["x-forwarded-proto"] === "https";
    res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: Boolean(isHttps)
    });
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
        const { fullName, email, password, confirmPassword, acceptedTerms } = req.body;
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
        if (acceptedTerms !== true) {
            return res.status(400).json({
                field: "terms",
                message: "You must agree to the Terms & Conditions to create an account."
            });
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
        const code = String(crypto.randomInt(100000, 1000000));
        const hashedPassword = await bcrypt.hash(password, 10);

        await EmailVerification.findOneAndUpdate(
            { email: cleanEmail },
            {
                email: cleanEmail,
                fullName: cleanName,
                password: hashedPassword,
                code,
                termsAccepted: true,
                termsAcceptedAt: new Date(),
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

        const code = String(crypto.randomInt(100000, 1000000));
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
async function handleVerifyAndRegister(req, res) {
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
            isEmailVerified: true,
            termsAccepted: Boolean(pending.termsAccepted),
            termsAcceptedAt: pending.termsAcceptedAt || new Date()
        });

        await EmailVerification.deleteOne({ _id: pending._id });

        const { token, expiresAt } = signSessionToken(user, true);
        setSessionCookie(res, req, token, true);

        res.status(201).json({
            success: true,
            message: "Email confirmed successfully! Your account is active.",
            token,
            rememberMe: true,
            expiresAt,
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
}

app.post("/api/users/verify-and-register", handleVerifyAndRegister);

/**
 * Legacy/Standard registration router:
 * Requires code to finalize registration, ensuring email confirmation is strictly enforced.
 */
app.post("/api/users/register", async (req, res) => {
    if (req.body?.code) {
        return handleVerifyAndRegister(req, res);
    }
    return res.status(400).json({
        needsVerification: true,
        message: "Email verification is required. Please use the confirmation code sent to your email."
    });
});

app.post("/api/users/login", async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        if (!email || !password) return res.status(400).json({ message: "Email and password are required." });

        const user = await User.findOne({ email: String(email).toLowerCase().trim() });
        if (!user) return res.status(404).json({ field: "email", message: "User not found." });

        const isMatch = await bcrypt.compare(String(password), user.password);
        if (!isMatch) return res.status(401).json({ field: "password", message: "Incorrect password." });

        if (user.isEmailVerified === false) {
            return res.status(403).json({
                unverified: true,
                field: "email",
                message: "Please confirm your email address before logging in."
            });
        }

        const remember = rememberMe === true || rememberMe === "true";
        const { token, expiresAt } = signSessionToken(user, remember);
        setSessionCookie(res, req, token, remember);

        res.json({
            success: true,
            token,
            rememberMe: remember,
            expiresAt,
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

app.get("/api/users/session", async (req, res) => {
    try {
        const token = getRequestToken(req);
        const payload = verifySessionToken(token);
        if (!payload || !isId(payload.sub)) {
            return res.status(401).json({ authenticated: false, message: "No active session." });
        }

        const user = await User.findById(payload.sub);
        if (!user || user.isEmailVerified === false) {
            clearSessionCookie(res, req);
            return res.status(401).json({ authenticated: false, message: "Session is no longer valid." });
        }

        if (payload.pwv && payload.pwv !== passwordFingerprint(user.password)) {
            clearSessionCookie(res, req);
            return res.status(401).json({ authenticated: false, message: "Session expired after password update." });
        }

        res.json({
            authenticated: true,
            rememberMe: Boolean(payload.rememberMe),
            expiresAt: Number(payload.exp),
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin,
                avatarUrl: user.avatarUrl || ""
            }
        });
    } catch (err) {
        res.status(500).json({ authenticated: false, message: "Failed to verify session." });
    }
});

app.post("/api/users/logout", (req, res) => {
    clearSessionCookie(res, req);
    res.json({ success: true, message: "Logged out successfully." });
});

/* ============================================================
   FORGOT PASSWORD (Dedicated Reset SMTP OTP Flow)
   ============================================================ */

/**
 * Step 1: Request 6-digit password reset code via dedicated RESET_EMAIL_USER SMTP (or primary fallback).
 */
app.post("/api/users/forgot-password/send-code", async (req, res) => {
    try {
        const cleanEmail = String(req.body?.email || "").toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!cleanEmail || !emailRegex.test(cleanEmail)) {
            return res.status(400).json({ field: "email", message: "Please enter a valid account email address." });
        }

        const user = await User.findOne({ email: cleanEmail });
        if (!user) {
            return res.status(404).json({ field: "email", message: "No Sound Pulse account found with this email address." });
        }

        const pending = await PasswordReset.findOne({ email: cleanEmail });
        const lastSentMs = pending?.lastSentAt ? new Date(pending.lastSentAt).getTime() : 0;
        if (pending && lastSentMs && Date.now() - lastSentMs < 45000) {
            const waitSecs = Math.ceil((45000 - (Date.now() - lastSentMs)) / 1000);
            return res.status(429).json({
                message: `Please wait ${waitSecs} seconds before requesting another reset code.`
            });
        }

        const code = String(crypto.randomInt(100000, 1000000));
        await PasswordReset.findOneAndUpdate(
            { email: cleanEmail },
            {
                email: cleanEmail,
                code,
                attempts: 0,
                verified: false,
                resetToken: "",
                lastSentAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
            },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
        );

        const mailResult = await sendPasswordResetEmail(cleanEmail, user.name, code);

        res.json({
            success: true,
            email: cleanEmail,
            simulated: Boolean(mailResult.simulated),
            senderMode: mailResult.senderMode || "fallback",
            message: `A 6-digit password reset code was sent to ${cleanEmail}.`
        });
    } catch (err) {
        console.error("forgot-password send-code error:", err);
        res.status(500).json({ message: err.message || "Failed to send password reset email." });
    }
});

/**
 * Resend 6-digit password reset code with 45s cooldown.
 */
app.post("/api/users/forgot-password/resend-code", async (req, res) => {
    try {
        const cleanEmail = String(req.body?.email || "").toLowerCase().trim();
        if (!cleanEmail) {
            return res.status(400).json({ message: "Email address is required." });
        }

        const user = await User.findOne({ email: cleanEmail });
        if (!user) {
            return res.status(404).json({ message: "No Sound Pulse account found with this email address." });
        }

        const pending = await PasswordReset.findOne({ email: cleanEmail });
        if (!pending) {
            return res.status(404).json({
                message: "Reset session expired or not found. Please enter your email again."
            });
        }

        const lastSentMs = pending.lastSentAt ? new Date(pending.lastSentAt).getTime() : 0;
        if (lastSentMs && Date.now() - lastSentMs < 45000) {
            const waitSecs = Math.ceil((45000 - (Date.now() - lastSentMs)) / 1000);
            return res.status(429).json({
                message: `Please wait ${waitSecs} seconds before requesting another reset code.`
            });
        }

        const code = String(crypto.randomInt(100000, 1000000));
        pending.code = code;
        pending.attempts = 0;
        pending.verified = false;
        pending.resetToken = "";
        pending.lastSentAt = new Date();
        pending.createdAt = new Date();
        await pending.save();

        const mailResult = await sendPasswordResetEmail(cleanEmail, user.name, code);

        res.json({
            success: true,
            email: cleanEmail,
            simulated: Boolean(mailResult.simulated),
            senderMode: mailResult.senderMode || "fallback",
            message: `A fresh 6-digit password reset code was sent to ${cleanEmail}.`
        });
    } catch (err) {
        console.error("forgot-password resend-code error:", err);
        res.status(500).json({ message: err.message || "Failed to resend reset code." });
    }
});

/**
 * Step 2: Verify the 6-digit reset OTP code and issue a short-lived resetToken.
 */
app.post("/api/users/forgot-password/verify-code", async (req, res) => {
    try {
        const cleanEmail = String(req.body?.email || "").toLowerCase().trim();
        const cleanCode = String(req.body?.code || "").replace(/\D/g, "").slice(0, 6);

        if (!cleanEmail || cleanCode.length !== 6) {
            return res.status(400).json({ message: "Please enter the full 6-digit reset code." });
        }

        const pending = await PasswordReset.findOne({ email: cleanEmail });
        if (!pending) {
            return res.status(400).json({
                message: "Reset code has expired or does not exist. Please request a new code."
            });
        }

        if (pending.attempts >= 5) {
            await PasswordReset.deleteOne({ _id: pending._id });
            return res.status(429).json({
                message: "Too many failed attempts. Please request a fresh password reset code."
            });
        }

        if (pending.code !== cleanCode) {
            pending.attempts += 1;
            await pending.save();
            const remaining = 5 - pending.attempts;
            if (remaining <= 0) {
                await PasswordReset.deleteOne({ _id: pending._id });
                return res.status(429).json({
                    message: "Too many failed attempts. Please request a fresh password reset code."
                });
            }
            return res.status(400).json({
                message: `Invalid reset code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
            });
        }

        const resetToken = crypto.randomBytes(24).toString("hex");
        pending.verified = true;
        pending.resetToken = resetToken;
        await pending.save();

        res.json({
            success: true,
            email: cleanEmail,
            resetToken,
            message: "Reset code confirmed! Enter your new password."
        });
    } catch (err) {
        console.error("forgot-password verify-code error:", err);
        res.status(500).json({ message: "Server error verifying reset code." });
    }
});

/**
 * Step 3: Set a new password after OTP verification.
 */
app.post("/api/users/forgot-password/reset", async (req, res) => {
    try {
        const cleanEmail = String(req.body?.email || "").toLowerCase().trim();
        const resetToken = String(req.body?.resetToken || "").trim();
        const newPassword = String(req.body?.newPassword || "");
        const confirmPassword = req.body?.confirmPassword;

        if (!cleanEmail || !resetToken) {
            return res.status(400).json({ message: "Reset session missing or expired. Please request a new reset code." });
        }

        const pending = await PasswordReset.findOne({ email: cleanEmail });
        if (!pending || !pending.verified || !pending.resetToken) {
            return res.status(400).json({ message: "Reset session expired or not verified. Please request a new code." });
        }

        const storedBuf = Buffer.from(pending.resetToken);
        const givenBuf = Buffer.from(resetToken);
        if (storedBuf.length !== givenBuf.length || !crypto.timingSafeEqual(storedBuf, givenBuf)) {
            return res.status(403).json({ message: "Invalid password reset authorization token." });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ field: "newPassword", message: "New password must be at least 8 characters." });
        }
        if (confirmPassword !== undefined && newPassword !== String(confirmPassword)) {
            return res.status(400).json({ field: "confirmPassword", message: "Passwords do not match." });
        }

        const user = await User.findOne({ email: cleanEmail });
        if (!user) {
            await PasswordReset.deleteOne({ _id: pending._id });
            return res.status(404).json({ message: "User account not found." });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.isEmailVerified = true;
        await user.save();

        await PasswordReset.deleteOne({ _id: pending._id });
        clearSessionCookie(res, req);

        res.json({
            success: true,
            email: cleanEmail,
            message: "Password reset successfully! You can now sign in with your new password."
        });
    } catch (err) {
        console.error("forgot-password reset error:", err);
        res.status(500).json({ message: "Server error while resetting password." });
    }
});

/**
 * Step 1: Confirm user identity by checking their current password.
 */
app.post("/api/users/:userId/verify-password", async (req, res) => {
    try {
        const user = await getUserOr404(req.params.userId, res);
        if (!user) return;

        const { oldPassword, email } = req.body;
        if (!oldPassword) {
            return res.status(400).json({ field: "oldPassword", message: "Current password is required to confirm your identity." });
        }

        if (email && String(email).toLowerCase().trim() !== user.email) {
            return res.status(403).json({ field: "oldPassword", message: "Account identity mismatch." });
        }

        const isMatch = await bcrypt.compare(String(oldPassword), user.password);
        if (!isMatch) {
            return res.status(401).json({ field: "oldPassword", message: "Incorrect current password. Identity verification failed." });
        }

        res.json({ success: true, message: "Identity verified. You can now set a new password." });
    } catch (err) {
        res.status(500).json({ message: "Server error while verifying identity." });
    }
});

/**
 * Step 2: Change user password (strictly requires oldPassword identity verification).
 */
app.post("/api/users/:userId/change-password", async (req, res) => {
    try {
        const user = await getUserOr404(req.params.userId, res);
        if (!user) return;

        const { oldPassword, newPassword, confirmPassword, email } = req.body;
        if (!oldPassword) {
            return res.status(400).json({ field: "oldPassword", message: "Current password is required to confirm your identity." });
        }
        if (!newPassword) {
            return res.status(400).json({ field: "newPassword", message: "Please enter a new password." });
        }

        if (email && String(email).toLowerCase().trim() !== user.email) {
            return res.status(403).json({ field: "oldPassword", message: "Account identity mismatch." });
        }

        // Always confirm identity with old password before changing password
        const isMatch = await bcrypt.compare(String(oldPassword), user.password);
        if (!isMatch) {
            return res.status(401).json({ field: "oldPassword", message: "Incorrect current password. Identity could not be verified." });
        }

        const newPassStr = String(newPassword);
        if (newPassStr.length < 8) {
            return res.status(400).json({ field: "newPassword", message: "New password must be at least 8 characters." });
        }

        if (confirmPassword !== undefined && newPassStr !== String(confirmPassword)) {
            return res.status(400).json({ field: "confirmPassword", message: "New passwords do not match." });
        }

        if (String(oldPassword) === newPassStr) {
            return res.status(400).json({ field: "newPassword", message: "New password must be different from your current password." });
        }

        user.password = await bcrypt.hash(newPassStr, 10);
        await user.save();

        // Keep the active browser logged in cleanly with a refreshed signature after password change
        const activeToken = getRequestToken(req);
        const activePayload = verifySessionToken(activeToken);
        const isSameSession = Boolean(activePayload && activePayload.sub === String(user._id));
        const keepRemembered = isSameSession ? Boolean(activePayload.rememberMe) : false;
        const { token: freshToken, expiresAt: freshExpiresAt } = signSessionToken(user, keepRemembered);
        if (isSameSession) {
            setSessionCookie(res, req, freshToken, keepRemembered);
        }

        res.json({
            success: true,
            message: "Password updated successfully!",
            ...(isSameSession ? { token: freshToken, rememberMe: keepRemembered, expiresAt: freshExpiresAt } : {})
        });
    } catch (err) {
        console.error("change-password error:", err);
        res.status(500).json({ message: "Server error while updating password." });
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

app.delete("/api/songs/:songId", async (req, res) => {
    try {
        const { songId } = req.params;
        if (!isId(songId)) {
            return res.status(400).json({ message: "Invalid song id." });
        }

        const song = await Song.findById(songId);
        if (!song) {
            return res.status(404).json({ message: "Song not found or already deleted." });
        }

        // Authenticate caller (Admin or Uploader)
        const token = getRequestToken(req);
        const payload = verifySessionToken(token);
        let callerUser = null;
        if (payload && isId(payload.sub)) {
            callerUser = await User.findById(payload.sub);
        }
        if (!callerUser && isId(req.query.userId || req.body?.userId)) {
            callerUser = await User.findById(req.query.userId || req.body.userId);
        }

        if (!callerUser) {
            return res.status(401).json({ message: "Authentication required to delete a song." });
        }

        // Admins cannot delete private vault songs under any circumstances
        if (song.isPrivate) {
            return res.status(403).json({ message: "Admin cannot delete private songs. Private vault songs are protected." });
        }

        if (!callerUser.isAdmin) {
            return res.status(403).json({ message: "Only administrators can delete public catalog songs." });
        }

        // 1. Delete from MongoDB
        await song.deleteOne();

        // 2. Clean up references in User library & Playlists
        await Promise.all([
            User.updateMany(
                { $or: [{ likedSongs: songId }, { recentSongs: songId }, { localSong: songId }] },
                { $pull: { likedSongs: songId, recentSongs: songId, localSong: songId } }
            ),
            Playlist.updateMany(
                { songs: songId },
                { $pull: { songs: songId } }
            )
        ]);

        // 3. Best-effort Supabase storage removal
        async function deleteSupabaseStorageFile(fileUrl) {
            if (!fileUrl || typeof fileUrl !== "string") return;
            try {
                const marker = `/${SUPABASE_BUCKET}/`;
                const idx = fileUrl.indexOf(marker);
                if (idx !== -1) {
                    const storagePath = decodeURIComponent(fileUrl.slice(idx + marker.length));
                    if (storagePath) {
                        await supabase.storage.from(SUPABASE_BUCKET).remove([storagePath]);
                    }
                }
            } catch (storageErr) {
                console.warn("Could not remove file from Supabase storage:", storageErr.message);
            }
        }

        await deleteSupabaseStorageFile(song.audioUrl);
        await deleteSupabaseStorageFile(song.coverUrl);

        res.json({
            success: true,
            deletedId: songId,
            message: `"${song.title}" was permanently deleted.`
        });
    } catch (err) {
        console.error("delete-song error:", err);
        res.status(500).json({ message: err.message || "Failed to delete song." });
    }
});

/* ============================================================
   ADMIN DASHBOARD & PLATFORM MANAGEMENT
   ============================================================ */

async function getAdminUserOr403(req, res) {
    const token = getRequestToken(req);
    const payload = verifySessionToken(token);
    let user = null;
    if (payload && isId(payload.sub)) {
        user = await User.findById(payload.sub);
    }
    if (!user && isId(req.query.userId || req.body?.userId)) {
        user = await User.findById(req.query.userId || req.body.userId);
    }
    if (!user) {
        res.status(401).json({ message: "Authentication required." });
        return null;
    }
    if (!user.isAdmin) {
        res.status(403).json({ message: "Access restricted to administrators." });
        return null;
    }
    return user;
}

app.get("/api/admin/stats", async (req, res) => {
    try {
        const admin = await getAdminUserOr403(req, res);
        if (!admin) return;

        const [totalSongs, publicSongs, privateSongs, totalUsers, adminUsers, regularUsers] = await Promise.all([
            Song.countDocuments(),
            Song.countDocuments({ isPrivate: { $ne: true } }),
            Song.countDocuments({ isPrivate: true }),
            User.countDocuments(),
            User.countDocuments({ isAdmin: true }),
            User.countDocuments({ isAdmin: { $ne: true } })
        ]);

        res.json({
            success: true,
            stats: {
                totalSongs,
                publicSongs,
                privateSongs,
                totalUsers,
                adminUsers,
                regularUsers
            }
        });
    } catch (err) {
        console.error("admin-stats error:", err);
        res.status(500).json({ message: "Failed to fetch admin stats" });
    }
});

app.get("/api/admin/songs", async (req, res) => {
    try {
        const admin = await getAdminUserOr403(req, res);
        if (!admin) return;

        const songs = await Song.find()
            .populate("uploadedBy", "name email isAdmin")
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            success: true,
            count: songs.length,
            songs: songs.map((s) => ({
                id: String(s._id),
                title: s.title,
                artist: s.artist,
                album: s.album || "Sound Pulse",
                duration: s.duration || "--:--",
                audioUrl: s.audioUrl,
                coverUrl: s.coverUrl,
                isPrivate: Boolean(s.isPrivate),
                createdAt: s.createdAt,
                uploadedBy: s.uploadedBy
                    ? {
                          id: String(s.uploadedBy._id),
                          name: s.uploadedBy.name,
                          email: s.uploadedBy.email,
                          isAdmin: Boolean(s.uploadedBy.isAdmin)
                      }
                    : null
            }))
        });
    } catch (err) {
        console.error("admin-songs error:", err);
        res.status(500).json({ message: "Failed to fetch songs list" });
    }
});

app.get("/api/admin/users", async (req, res) => {
    try {
        const admin = await getAdminUserOr403(req, res);
        if (!admin) return;

        const users = await User.find()
            .select("name email isAdmin isEmailVerified avatarUrl createdAt")
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            success: true,
            count: users.length,
            users: users.map((u) => ({
                id: String(u._id),
                name: u.name,
                email: u.email,
                isAdmin: Boolean(u.isAdmin),
                isEmailVerified: Boolean(u.isEmailVerified),
                avatarUrl: u.avatarUrl || "",
                createdAt: u.createdAt
            }))
        });
    } catch (err) {
        console.error("admin-users error:", err);
        res.status(500).json({ message: "Failed to fetch users list" });
    }
});

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
   HTML ROUTES (SPA-like navigation for Login, Sign-Up, Dashboard, Terms)
   ============================================================ */
app.get("/Login", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Login", "index.html")));
app.get("/Login/", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Login", "index.html")));
app.get("/Sign-Up", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Sign-Up", "index.html")));
app.get("/Sign-Up/", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Sign-Up", "index.html")));
app.get("/Dashboard", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Dashboard", "index.html")));
app.get("/Dashboard/", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Dashboard", "index.html")));
app.get("/Terms", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Terms", "index.html")));
app.get("/Terms/", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "Terms", "index.html")));

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