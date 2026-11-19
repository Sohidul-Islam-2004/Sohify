const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const {
    userSchema,
    songSchema,
    playlistSchema,
    emailVerificationSchema,
    passwordResetSchema
} = require("./schema");
const { sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangedEmail } = require("./mailer");

const User = mongoose.model("User", userSchema);
const Song = mongoose.model("Song", songSchema);
const Playlist = mongoose.model("Playlist", playlistSchema);
const EmailVerification = mongoose.model("EmailVerification", emailVerificationSchema);
const PasswordReset = mongoose.model("PasswordReset", passwordResetSchema);

const PORT = process.env.PORT || 5000;
const DB_URL = process.env.DB_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET;

const MIN_PASSWORD = 8;
const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 45 * 1000;
const MAX_CODE_ATTEMPTS = 5;

/* ============================================================
   APP + STATIC FILES
   Only the public/ folder is served. (Serving __dirname used to
   expose server.js, mailer.js and schema.js to anyone.)
   ============================================================ */
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Basic security headers (no extra package needed).
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
});

// gzip/brotli for HTML, CSS, JS and JSON — optional: `npm install compression` to enable.
try {
    app.use(require("compression")());
} catch {
    console.warn("ℹ️  Tip: run `npm install compression` to gzip responses (about 70% smaller pages and API replies).");
}

// The app calls its own API from the same site, so CORS stays closed unless CORS_ORIGINS lists other sites.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : false }));
app.use(express.json({ limit: "1mb" }));

const PUBLIC_DIR = [path.join(__dirname, "..", "public"), path.join(__dirname, "public")].find((p) =>
    fs.existsSync(path.join(p, "index.html"))
) || path.join(__dirname, "..", "public");

// HTML, CSS and JS are revalidated every time (cheap 304s thanks to ETags) so updates show up at once;
// images and fonts are cached for a week.
app.use(
    express.static(PUBLIC_DIR, {
        etag: true,
        setHeaders(res, filePath) {
            if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(filePath)) res.setHeader("Cache-Control", "public, max-age=604800");
            else res.setHeader("Cache-Control", "no-cache");
            if (filePath.endsWith("sw.js")) res.setHeader("Service-Worker-Allowed", "/");
        }
    })
);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// Uploaded files get unique names and never change, so browsers can cache them for a year.
const MEDIA_CACHE_SECONDS = "31536000";

/* ============================================================
   SMALL HELPERS
   ============================================================ */
const isId = (id) => mongoose.isValidObjectId(id);
const cleanEmail = (v) => String(v || "").toLowerCase().trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");
const newCode = () => String(crypto.randomInt(100000, 1000000));
const sameHash = (a, b) => {
    const A = Buffer.from(String(a));
    const B = Buffer.from(String(b));
    return A.length === B.length && crypto.timingSafeEqual(A, B);
};
const secondsLeft = (since, windowMs) => Math.ceil((windowMs - (Date.now() - new Date(since).getTime())) / 1000);

function publicUser(user) {
    return {
        id: String(user._id),
        name: user.name,
        email: user.email,
        isAdmin: !!user.isAdmin,
        avatarUrl: user.avatarUrl || ""
    };
}

/* ============================================================
   SESSION TOKENS (signed with HMAC — no extra dependency)
   "Remember me" → 30-day token, otherwise 1 day.
   Tokens issued before a password change are rejected.
   ============================================================ */
let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
    SESSION_SECRET = crypto.randomBytes(32).toString("hex");
    console.warn("⚠️  SESSION_SECRET not set in Server/.env — using a temporary one. Everyone will be signed out on restart.");
}

function signToken(userId, remember) {
    const now = Date.now();
    const payload = { uid: String(userId), iat: now, exp: now + (remember ? 30 : 1) * 24 * 60 * 60 * 1000 };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
    return `${body}.${sig}`;
}

function readToken(token) {
    if (!token || typeof token !== "string" || !token.includes(".")) return null;
    const [body, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
    if (!sameHash(sig, expected)) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
        if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}

// Attaches req.user when a valid Bearer token is present. Never blocks.
async function attachUser(req, res, next) {
    req.user = null;
    const header = req.headers.authorization || "";
    const payload = readToken(header.startsWith("Bearer ") ? header.slice(7) : "");
    if (payload && isId(payload.uid)) {
        try {
            // Skip the big arrays (likes, history…) — routes that need them query them directly.
            const user = await User.findById(payload.uid).select("-likedSongs -recentSongs -localSong -playlists");
            const changedAt = user?.passwordChangedAt ? user.passwordChangedAt.getTime() : 0;
            if (user && payload.iat >= changedAt) {
                req.user = user;
                req.tokenRemember = payload.exp - payload.iat > 2 * 24 * 60 * 60 * 1000;
            }
        } catch {
            /* treat as signed-out */
        }
    }
    next();
}

function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ authError: true, message: "Your session has expired. Please sign in again." });
    }
    next();
}

// For /users/:userId/... routes — you can only touch your own account.
function requireSelf(req, res, next) {
    if (!isId(req.params.userId)) return res.status(400).json({ message: "Invalid user id." });
    if (String(req.user._id) !== req.params.userId) {
        return res.status(403).json({ message: "You can only manage your own account." });
    }
    next();
}

app.use("/api", attachUser);

/* ============================================================
   TINY IN-MEMORY RATE LIMITER (per IP + key)
   ============================================================ */
const hits = new Map();
function tooMany(bucket, key, max, windowMs) {
    const k = `${bucket}|${key}`;
    const now = Date.now();
    const entry = hits.get(k);
    if (!entry || now - entry.start > windowMs) {
        hits.set(k, { start: now, count: 1 });
        return false;
    }
    entry.count += 1;
    return entry.count > max;
}
function clearHits(bucket, key) {
    hits.delete(`${bucket}|${key}`);
}
setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [k, v] of hits) if (v.start < cutoff) hits.delete(k);
}, 10 * 60 * 1000).unref();

/* ============================================================
   FILE UPLOAD (memory -> Supabase Storage)
   ============================================================ */
const AUDIO_EXT_REGEX = /\.(mp3|wav|ogg|m4a|flac|aac|webm)$/i;
const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|gif|avif)$/i; // SVG removed: it can carry scripts

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
    fileFilter: (req, file, cb) => {
        const isAudio =
            file.fieldname === "audio" &&
            (file.mimetype.startsWith("audio/") || AUDIO_EXT_REGEX.test(file.originalname));
        const isImage =
            (file.fieldname === "cover" || file.fieldname === "avatar") &&
            file.mimetype !== "image/svg+xml" &&
            (file.mimetype.startsWith("image/") || IMAGE_EXT_REGEX.test(file.originalname));

        const ok = isAudio || isImage;
        cb(ok ? null : new Error(`Invalid file type for "${file.fieldname}".`), ok);
    }
});

const sanitize = (name) => name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);

const uniqueName = (name) => `${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${sanitize(name || "file")}`;

async function uploadToSupabase(folder, file) {
    const filePath = `${folder}/${uniqueName(file.originalname)}`;
    const { error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(filePath, file.buffer, { contentType: file.mimetype || "application/octet-stream", cacheControl: MEDIA_CACHE_SECONDS });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filePath).data.publicUrl;
}

/* ============================================================
   SIGN-UP WITH EMAIL CONFIRMATION
   ============================================================ */
app.post("/api/users/send-verification", async (req, res) => {
    try {
        const { fullName, email, password, confirmPassword, acceptedTerms } = req.body;
        const name = String(fullName || "").trim();
        const mail = cleanEmail(email);
        const pass = String(password || "");

        if (!name) return res.status(400).json({ field: "fullName", message: "Please enter your full name." });
        if (name.length > 60) return res.status(400).json({ field: "fullName", message: "Name is too long." });
        if (!EMAIL_RE.test(mail)) return res.status(400).json({ field: "email", message: "Please enter a valid email address." });
        if (pass.length < MIN_PASSWORD) {
            return res.status(400).json({ field: "password", message: `Password must be at least ${MIN_PASSWORD} characters.` });
        }
        if (confirmPassword !== undefined && pass !== String(confirmPassword)) {
            return res.status(400).json({ field: "confirmPassword", message: "Passwords do not match." });
        }
        if (acceptedTerms !== true) {
            return res.status(400).json({ field: "terms", message: "Please agree to the Terms & Conditions to continue." });
        }

        if (await User.exists({ email: mail })) {
            return res.status(409).json({ field: "email", message: "An account with this email already exists. Please sign in." });
        }

        const pending = await EmailVerification.findOne({ email: mail });
        if (pending?.updatedAt && Date.now() - pending.updatedAt.getTime() < RESEND_COOLDOWN_MS) {
            return res.status(429).json({
                message: `Please wait ${secondsLeft(pending.updatedAt, RESEND_COOLDOWN_MS)}s before requesting a new code.`
            });
        }

        const code = newCode();
        await EmailVerification.findOneAndUpdate(
            { email: mail },
            {
                email: mail,
                fullName: name,
                password: await bcrypt.hash(pass, 10),
                codeHash: sha256(code),
                termsAccepted: true,
                termsAcceptedAt: new Date(),
                attempts: 0,
                createdAt: new Date()
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        const mail_ = await sendVerificationEmail(mail, name, code);
        res.json({
            success: true,
            message: `We sent a 6-digit code to ${mail}.`,
            email: mail,
            simulated: !!mail_.simulated
        });
    } catch (err) {
        console.error("send-verification error:", err);
        res.status(500).json({ message: err.message || "Could not send the confirmation email." });
    }
});

app.post("/api/users/resend-verification", async (req, res) => {
    try {
        const mail = cleanEmail(req.body.email);
        if (!mail) return res.status(400).json({ message: "Email address is required." });

        const pending = await EmailVerification.findOne({ email: mail });
        if (!pending) {
            return res.status(404).json({ message: "Your sign-up session expired. Please fill out the form again." });
        }
        if (pending.updatedAt && Date.now() - pending.updatedAt.getTime() < RESEND_COOLDOWN_MS) {
            return res.status(429).json({
                message: `Please wait ${secondsLeft(pending.updatedAt, RESEND_COOLDOWN_MS)}s before requesting another code.`
            });
        }

        const code = newCode();
        pending.codeHash = sha256(code);
        pending.attempts = 0;
        pending.createdAt = new Date();
        await pending.save();

        const result = await sendVerificationEmail(mail, pending.fullName, code);
        res.json({ success: true, message: `A new code was sent to ${mail}.`, email: mail, simulated: !!result.simulated });
    } catch (err) {
        console.error("resend-verification error:", err);
        res.status(500).json({ message: err.message || "Could not resend the code." });
    }
});

async function verifyAndRegister(req, res) {
    try {
        const mail = cleanEmail(req.body.email);
        const code = String(req.body.code || "").trim();
        if (!mail || !/^\d{6}$/.test(code)) {
            return res.status(400).json({ message: "Please enter the 6-digit code from your email." });
        }

        const pending = await EmailVerification.findOne({ email: mail });
        if (!pending) {
            return res.status(400).json({ message: "This code has expired. Please request a new one." });
        }
        if (pending.attempts >= MAX_CODE_ATTEMPTS) {
            await pending.deleteOne();
            return res.status(429).json({ message: "Too many wrong attempts. Please sign up again to get a fresh code." });
        }
        if (!sameHash(pending.codeHash, sha256(code))) {
            pending.attempts += 1;
            await pending.save();
            const left = MAX_CODE_ATTEMPTS - pending.attempts;
            return res.status(400).json({
                message: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Incorrect code. No attempts left — please sign up again."
            });
        }

        if (await User.exists({ email: mail })) {
            await pending.deleteOne();
            return res.status(409).json({ message: "An account with this email already exists. Please sign in." });
        }

        const user = await User.create({
            name: pending.fullName,
            email: pending.email,
            password: pending.password,
            isEmailVerified: true,
            termsAccepted: !!pending.termsAccepted,
            termsAcceptedAt: pending.termsAcceptedAt || new Date()
        });
        await pending.deleteOne();

        res.status(201).json({
            success: true,
            message: "Email confirmed! Your account is ready.",
            token: signToken(user._id, false),
            data: publicUser(user)
        });
    } catch (err) {
        console.error("verify-and-register error:", err);
        res.status(500).json({ message: "Something went wrong while creating your account." });
    }
}

app.post("/api/users/verify-and-register", verifyAndRegister);

// Legacy route: registration always needs the email code.
app.post("/api/users/register", (req, res) => {
    if (req.body.code) return verifyAndRegister(req, res);
    res.status(400).json({ needsVerification: true, message: "Please confirm your email with the code we sent you." });
});

/* ============================================================
   SIGN IN / SESSION
   ============================================================ */
app.post("/api/users/login", async (req, res) => {
    try {
        const mail = cleanEmail(req.body.email);
        const password = String(req.body.password || "");
        const remember = req.body.remember === true;
        if (!mail || !password) return res.status(400).json({ message: "Email and password are required." });

        const limiterKey = `${req.ip}|${mail}`;
        if (tooMany("login", limiterKey, 8, 15 * 60 * 1000)) {
            return res.status(429).json({ message: "Too many sign-in attempts. Please wait 15 minutes or reset your password." });
        }

        const user = await User.findOne({ email: mail });
        const ok = user ? await bcrypt.compare(password, user.password) : false;
        if (!ok) {
            // Same message for "no account" and "wrong password" so emails can't be probed.
            return res.status(401).json({ field: "password", message: "Incorrect email or password." });
        }
        if (user.isEmailVerified === false) {
            return res.status(403).json({ unverified: true, message: "Please confirm your email address before signing in." });
        }

        clearHits("login", limiterKey);
        res.json({ success: true, token: signToken(user._id, remember), remember, data: publicUser(user) });
    } catch (err) {
        console.error("login error:", err);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

// Used by the dashboard to confirm the stored session is still valid.
app.get("/api/users/me", requireAuth, (req, res) => {
    res.json({ success: true, data: publicUser(req.user) });
});

/* ============================================================
   FORGOT PASSWORD (email code → reset token → new password)
   ============================================================ */
app.post("/api/users/forgot-password", async (req, res) => {
    try {
        const mail = cleanEmail(req.body.email);
        if (!EMAIL_RE.test(mail)) {
            return res.status(400).json({ field: "email", message: "Please enter a valid email address." });
        }
        if (tooMany("forgot", req.ip, 10, 60 * 60 * 1000)) {
            return res.status(429).json({ message: "Too many reset requests. Please try again later." });
        }

        // Always answer the same way so nobody can check which emails are registered.
        const generic = {
            success: true,
            email: mail,
            message: `If an account exists for ${mail}, we've sent a 6-digit reset code to it.`
        };

        const user = await User.findOne({ email: mail });
        if (!user) return res.json(generic);

        const existing = await PasswordReset.findOne({ email: mail });
        if (existing?.updatedAt && Date.now() - existing.updatedAt.getTime() < RESEND_COOLDOWN_MS) {
            return res.status(429).json({
                message: `Please wait ${secondsLeft(existing.updatedAt, RESEND_COOLDOWN_MS)}s before requesting another code.`
            });
        }

        const code = newCode();
        await PasswordReset.findOneAndUpdate(
            { email: mail },
            {
                email: mail,
                user: user._id,
                codeHash: sha256(code),
                attempts: 0,
                resetTokenHash: "",
                resetTokenExpiresAt: null,
                createdAt: new Date()
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        const result = await sendPasswordResetEmail(mail, user.name, code);
        res.json({ ...generic, simulated: !!result.simulated });
    } catch (err) {
        console.error("forgot-password error:", err);
        res.status(500).json({ message: err.message || "Could not send the reset email." });
    }
});

app.post("/api/users/verify-reset-code", async (req, res) => {
    try {
        const mail = cleanEmail(req.body.email);
        const code = String(req.body.code || "").trim();
        if (!mail || !/^\d{6}$/.test(code)) {
            return res.status(400).json({ message: "Please enter the 6-digit code from your email." });
        }

        const reset = await PasswordReset.findOne({ email: mail });
        if (!reset) {
            return res.status(400).json({ message: "This code is invalid or has expired. Please request a new one." });
        }
        if (reset.attempts >= MAX_CODE_ATTEMPTS) {
            await reset.deleteOne();
            return res.status(429).json({ message: "Too many wrong attempts. Please request a new code." });
        }
        if (!sameHash(reset.codeHash, sha256(code))) {
            reset.attempts += 1;
            await reset.save();
            const left = MAX_CODE_ATTEMPTS - reset.attempts;
            return res.status(400).json({
                message: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Incorrect code. Please request a new one."
            });
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        reset.resetTokenHash = sha256(resetToken);
        reset.resetTokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        reset.codeHash = sha256(crypto.randomBytes(16)); // the code can't be reused
        await reset.save();

        res.json({ success: true, resetToken, message: "Code confirmed. Choose a new password." });
    } catch (err) {
        console.error("verify-reset-code error:", err);
        res.status(500).json({ message: "Could not verify the code. Please try again." });
    }
});

app.post("/api/users/reset-password", async (req, res) => {
    try {
        const mail = cleanEmail(req.body.email);
        const resetToken = String(req.body.resetToken || "");
        const newPassword = String(req.body.newPassword || "");
        const confirmPassword = req.body.confirmPassword;

        if (newPassword.length < MIN_PASSWORD) {
            return res.status(400).json({ field: "newPassword", message: `Password must be at least ${MIN_PASSWORD} characters.` });
        }
        if (confirmPassword !== undefined && newPassword !== String(confirmPassword)) {
            return res.status(400).json({ field: "confirmPassword", message: "Passwords do not match." });
        }

        const reset = await PasswordReset.findOne({ email: mail });
        const valid =
            reset &&
            reset.resetTokenHash &&
            reset.resetTokenExpiresAt &&
            reset.resetTokenExpiresAt.getTime() > Date.now() &&
            sameHash(reset.resetTokenHash, sha256(resetToken));
        if (!valid) {
            return res.status(400).json({ expired: true, message: "Your reset session expired. Please request a new code." });
        }

        const user = await User.findById(reset.user);
        if (!user) {
            await reset.deleteOne();
            return res.status(404).json({ message: "Account not found." });
        }
        if (await bcrypt.compare(newPassword, user.password)) {
            return res.status(400).json({ field: "newPassword", message: "Please choose a password you haven't used here before." });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.passwordChangedAt = new Date();
        user.isEmailVerified = true; // they just proved they own the inbox
        await user.save();
        await reset.deleteOne();
        clearHits("login", `${req.ip}|${mail}`);

        sendPasswordChangedEmail(user.email, user.name).catch(() => {});
        res.json({ success: true, message: "Password updated! You can now sign in with your new password." });
    } catch (err) {
        console.error("reset-password error:", err);
        res.status(500).json({ message: "Could not reset your password. Please try again." });
    }
});

/* ============================================================
   CHANGE PASSWORD (signed in, needs current password)
   ============================================================ */
app.post("/api/users/:userId/verify-password", requireAuth, requireSelf, async (req, res) => {
    try {
        const oldPassword = String(req.body.oldPassword || "");
        if (!oldPassword) {
            return res.status(400).json({ field: "oldPassword", message: "Enter your current password to continue." });
        }
        if (tooMany("verify-pw", String(req.user._id), 8, 15 * 60 * 1000)) {
            return res.status(429).json({ field: "oldPassword", message: "Too many attempts. Please wait a few minutes." });
        }
        if (!(await bcrypt.compare(oldPassword, req.user.password))) {
            return res.status(400).json({ field: "oldPassword", message: "That password is incorrect." });
        }
        res.json({ success: true, message: "Identity confirmed." });
    } catch (err) {
        res.status(500).json({ message: "Server error while verifying your password." });
    }
});

app.post("/api/users/:userId/change-password", requireAuth, requireSelf, async (req, res) => {
    try {
        const user = req.user;
        const oldPassword = String(req.body.oldPassword || "");
        const newPassword = String(req.body.newPassword || "");
        const { confirmPassword } = req.body;

        if (!oldPassword) return res.status(400).json({ field: "oldPassword", message: "Enter your current password." });
        if (!(await bcrypt.compare(oldPassword, user.password))) {
            return res.status(400).json({ field: "oldPassword", message: "That password is incorrect." });
        }
        if (newPassword.length < MIN_PASSWORD) {
            return res.status(400).json({ field: "newPassword", message: `New password must be at least ${MIN_PASSWORD} characters.` });
        }
        if (confirmPassword !== undefined && newPassword !== String(confirmPassword)) {
            return res.status(400).json({ field: "confirmPassword", message: "New passwords do not match." });
        }
        if (oldPassword === newPassword) {
            return res.status(400).json({ field: "newPassword", message: "New password must be different from the current one." });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.passwordChangedAt = new Date(Date.now() - 1000);
        await user.save();

        sendPasswordChangedEmail(user.email, user.name).catch(() => {});
        // Other devices are signed out; this device gets a fresh token.
        res.json({ success: true, message: "Password updated!", token: signToken(user._id, !!req.tokenRemember) });
    } catch (err) {
        console.error("change-password error:", err);
        res.status(500).json({ message: "Server error while updating your password." });
    }
});

/* ============================================================
   SONGS
   ============================================================ */
app.get("/api/songs", async (req, res) => {
    try {
        const filter = req.user
            ? { $or: [{ isPrivate: { $ne: true } }, { uploadedBy: req.user._id }] }
            : { isPrivate: { $ne: true } };
        const songs = await Song.find(filter)
            .select("title artist album duration audioUrl coverUrl uploadedBy isPrivate createdAt")
            .sort({ createdAt: -1 })
            .lean();
        res.json(songs);
    } catch (err) {
        res.status(500).json({ message: "Failed to load songs." });
    }
});

/* Direct upload: the browser sends the audio straight to Supabase with a one-time signed URL,
   so a 50 MB file never sits in this server's memory. The old multipart upload still works as a fallback. */
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

app.post("/api/uploads/audio-url", requireAuth, async (req, res) => {
    try {
        const filename = String(req.body.filename || "");
        const contentType = String(req.body.contentType || "");
        const size = Number(req.body.size || 0);
        if (!AUDIO_EXT_REGEX.test(filename) && !contentType.startsWith("audio/")) {
            return res.status(400).json({ message: "That isn't an audio file." });
        }
        if (!size || size > MAX_AUDIO_BYTES) return res.status(413).json({ message: "File too large (max 50 MB)." });
        if (tooMany("sign-upload", String(req.user._id), 30, 60 * 60 * 1000)) {
            return res.status(429).json({ message: "Too many uploads. Please try again later." });
        }

        const filePath = `audio/${req.user._id}/${uniqueName(filename)}`;
        const bucket = supabase.storage.from(SUPABASE_BUCKET);
        if (typeof bucket.createSignedUploadUrl !== "function") {
            return res.status(501).json({ fallback: true, message: "Direct upload not supported — update @supabase/supabase-js." });
        }
        const { data, error } = await bucket.createSignedUploadUrl(filePath);
        if (error) return res.status(502).json({ fallback: true, message: error.message });
        res.json({ uploadUrl: data.signedUrl, path: data.path || filePath, cacheControl: MEDIA_CACHE_SECONDS });
    } catch (err) {
        res.status(500).json({ fallback: true, message: err.message });
    }
});

// Confirms that an audio file uploaded with a signed URL exists and belongs to this user.
async function verifyUploadedAudio(user, audioPath) {
    const p = String(audioPath || "");
    const prefix = `audio/${user._id}/`;
    if (!p.startsWith(prefix) || p.includes("..") || p.slice(prefix.length).includes("/")) return null;
    const name = p.slice(prefix.length);
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list(`audio/${user._id}`, { search: name, limit: 5 });
    if (error || !data?.some((f) => f.name === name)) return null;
    return supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(p).data.publicUrl;
}

app.post(
    "/api/songs",
    requireAuth,
    upload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]),
    async (req, res) => {
        try {
            const user = req.user;
            const { title, artist, album, duration, isPrivate, audioPath } = req.body;
            if (!req.files?.audio && !audioPath) return res.status(400).json({ message: "Please choose an audio file." });
            if (!title || !String(title).trim()) return res.status(400).json({ message: "Song title is required." });

            const priv = isPrivate === "true" || isPrivate === true;
            if (!priv && !user.isAdmin) {
                return res.status(403).json({ message: "Only admins can publish to the public catalog." });
            }

            let audioUrl;
            if (req.files?.audio) {
                audioUrl = await uploadToSupabase("audio", req.files.audio[0]);
            } else {
                audioUrl = await verifyUploadedAudio(user, audioPath);
                if (!audioUrl) return res.status(400).json({ message: "The uploaded audio file wasn't found. Please try again." });
            }
            const coverUrl = req.files?.cover ? await uploadToSupabase("covers", req.files.cover[0]) : "";

            const song = await Song.create({
                title: String(title).trim().slice(0, 100),
                artist: String(artist || "Unknown Artist").trim().slice(0, 100) || "Unknown Artist",
                album: String(album || "").trim().slice(0, 100),
                duration: duration || "--:--",
                audioUrl,
                coverUrl,
                uploadedBy: user._id,
                isPrivate: priv
            });

            if (priv) await User.updateOne({ _id: user._id }, { $push: { localSong: song._id } });
            res.status(201).json(song);
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    }
);

// Only the uploader (or an admin) can edit or delete a song.
async function getEditableSong(req, res) {
    const { songId } = req.params;
    if (!isId(songId)) {
        res.status(400).json({ message: "Invalid song id." });
        return null;
    }
    const song = await Song.findById(songId);
    if (!song) {
        res.status(404).json({ message: "Song not found." });
        return null;
    }
    const isOwner = song.uploadedBy && String(song.uploadedBy) === String(req.user._id);
    if (!isOwner && !req.user.isAdmin) {
        res.status(403).json({ message: "You can only change songs you uploaded." });
        return null;
    }
    return song;
}

function storagePathFromUrl(url) {
    const marker = `/storage/v1/object/public/${SUPABASE_BUCKET}/`;
    const i = String(url || "").indexOf(marker);
    return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

app.patch("/api/songs/:songId", requireAuth, upload.single("cover"), async (req, res) => {
    try {
        const song = await getEditableSong(req, res);
        if (!song) return;

        const { title, artist, album } = req.body;
        if (title !== undefined) {
            const t = String(title).trim();
            if (!t) return res.status(400).json({ message: "Song title is required." });
            song.title = t.slice(0, 100);
        }
        if (artist !== undefined) song.artist = String(artist).trim().slice(0, 100) || "Unknown Artist";
        if (album !== undefined) song.album = String(album).trim().slice(0, 100);
        if (req.file) {
            const old = storagePathFromUrl(song.coverUrl);
            song.coverUrl = await uploadToSupabase("covers", req.file);
            if (old) supabase.storage.from(SUPABASE_BUCKET).remove([old]).catch(() => {});
        }
        await song.save();
        res.json(song);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete("/api/songs/:songId", requireAuth, async (req, res) => {
    try {
        const song = await getEditableSong(req, res);
        if (!song) return;

        const files = [storagePathFromUrl(song.audioUrl), storagePathFromUrl(song.coverUrl)].filter(Boolean);
        await song.deleteOne();
        await User.updateMany(
            { $or: [{ likedSongs: song._id }, { recentSongs: song._id }, { localSong: song._id }] },
            { $pull: { likedSongs: song._id, recentSongs: song._id, localSong: song._id } }
        );
        await Playlist.updateMany({ songs: song._id }, { $pull: { songs: song._id } });
        if (files.length) supabase.storage.from(SUPABASE_BUCKET).remove(files).catch(() => {});

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/* ============================================================
   USER LIBRARY
   ============================================================ */
app.post("/api/users/:userId/avatar", requireAuth, requireSelf, upload.single("avatar"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "Please choose an image." });
        const avatarUrl = await uploadToSupabase("avatars", req.file);
        const old = storagePathFromUrl(req.user.avatarUrl);
        await User.updateOne({ _id: req.user._id }, { $set: { avatarUrl } });
        if (old) supabase.storage.from(SUPABASE_BUCKET).remove([old]).catch(() => {});
        res.json({ avatarUrl });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/users/:userId/library", requireAuth, requireSelf, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate("playlists").lean();
        res.json({
            avatarUrl: user.avatarUrl || "",
            likedSongs: (user.likedSongs || []).map(String),
            recentSongs: (user.recentSongs || []).map(String),
            localSongs: (user.localSong || []).map(String),
            playlists: (user.playlists || []).filter(Boolean).map((p) => ({
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

app.post("/api/users/:userId/like", requireAuth, requireSelf, async (req, res) => {
    try {
        const { songId } = req.body;
        if (!isId(songId)) return res.status(400).json({ message: "Invalid song id." });
        if (!(await Song.exists({ _id: songId }))) return res.status(404).json({ message: "Song not found." });

        // Atomic toggle: two quick taps can't overwrite each other.
        const uid = req.user._id;
        const removed = await User.updateOne({ _id: uid, likedSongs: songId }, { $pull: { likedSongs: songId } });
        let liked = false;
        if (!removed.modifiedCount) {
            await User.updateOne({ _id: uid }, { $addToSet: { likedSongs: songId } });
            liked = true;
        }
        res.json({ liked });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post("/api/users/:userId/recent", requireAuth, requireSelf, async (req, res) => {
    try {
        const { songId } = req.body;
        if (!isId(songId)) return res.status(400).json({ message: "Invalid song id." });

        // Move the song to the front and keep the 20 newest, in one atomic update.
        const oid = new mongoose.Types.ObjectId(songId);
        await User.updateOne({ _id: req.user._id }, [
            {
                $set: {
                    recentSongs: {
                        $slice: [
                            { $concatArrays: [[oid], { $filter: { input: { $ifNull: ["$recentSongs", []] }, cond: { $ne: ["$$this", oid] } } }] },
                            20
                        ]
                    }
                }
            }
        ]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/* ============================================================
   PLAYLISTS
   ============================================================ */
async function getOwnedPlaylist(req, res) {
    const { playlistId } = req.params;
    if (!isId(playlistId)) {
        res.status(400).json({ message: "Invalid playlist id." });
        return null;
    }
    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        res.status(404).json({ message: "Playlist not found." });
        return null;
    }
    if (playlist.user.toString() !== String(req.user._id)) {
        res.status(403).json({ message: "This isn't your playlist." });
        return null;
    }
    return playlist;
}

// Shared link view. Private playlists are only visible to their owner.
app.get("/api/playlists/:playlistId", async (req, res) => {
    try {
        if (!isId(req.params.playlistId)) return res.status(400).json({ message: "Invalid playlist id." });
        const playlist = await Playlist.findById(req.params.playlistId)
            .populate("songs")
            .populate("user", "name avatarUrl");
        if (!playlist) return res.status(404).json({ message: "Playlist not found." });

        const isOwner = req.user && String(playlist.user?._id) === String(req.user._id);
        if (playlist.isPrivate && !isOwner) {
            return res.status(403).json({ message: "This playlist is private." });
        }
        res.json(playlist);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post("/api/users/:userId/playlists", requireAuth, requireSelf, async (req, res) => {
    try {
        const name = String(req.body.name || "").trim().slice(0, 60);
        if (!name) return res.status(400).json({ message: "Playlist name is required." });

        const playlist = await Playlist.create({ name, user: req.user._id });
        await User.updateOne({ _id: req.user._id }, { $push: { playlists: playlist._id } });
        res.status(201).json(playlist);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete("/api/playlists/:playlistId", requireAuth, async (req, res) => {
    try {
        const playlist = await getOwnedPlaylist(req, res);
        if (!playlist) return;
        await playlist.deleteOne();
        await User.updateMany({ playlists: playlist._id }, { $pull: { playlists: playlist._id } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put("/api/playlists/:playlistId", requireAuth, upload.single("cover"), async (req, res) => {
    try {
        const playlist = await getOwnedPlaylist(req, res);
        if (!playlist) return;

        const { name, description, isPrivate } = req.body;
        if (name && String(name).trim()) playlist.name = String(name).trim().slice(0, 60);
        if (description !== undefined) playlist.description = String(description).trim().slice(0, 300);
        if (isPrivate !== undefined) playlist.isPrivate = isPrivate === "true" || isPrivate === true;
        if (req.file) {
            const old = storagePathFromUrl(playlist.coverUrl);
            playlist.coverUrl = await uploadToSupabase("covers", req.file);
            if (old) supabase.storage.from(SUPABASE_BUCKET).remove([old]).catch(() => {});
        }

        await playlist.save();
        res.json(playlist);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put("/api/playlists/:playlistId/toggle-song", requireAuth, async (req, res) => {
    try {
        const { songId } = req.body;
        if (!isId(songId)) return res.status(400).json({ message: "Invalid song id." });

        const playlist = await getOwnedPlaylist(req, res);
        if (!playlist) return;
        if (!(await Song.exists({ _id: songId }))) return res.status(404).json({ message: "Song not found." });

        // Atomic toggle (safe against double clicks and two open tabs).
        const opts = { new: true, projection: { songs: 1 } };
        let updated = await Playlist.findOneAndUpdate({ _id: playlist._id, songs: songId }, { $pull: { songs: songId } }, opts);
        let added = false;
        if (!updated) {
            updated = await Playlist.findOneAndUpdate({ _id: playlist._id }, { $addToSet: { songs: songId } }, opts);
            added = true;
        }
        res.json({ added, songs: updated.songs.map(String) });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/* ============================================================
   HEALTH CHECK (for Render / uptime monitors)
   ============================================================ */
app.get("/api/health", (req, res) => {
    const db = mongoose.connection.readyState === 1;
    res.status(db ? 200 : 503).json({ ok: db, uptime: Math.round(process.uptime()) });
});

/* ============================================================
   PAGE ROUTES
   ============================================================ */
const page = (folder) => (req, res) => res.sendFile(path.join(PUBLIC_DIR, folder, "index.html"));
for (const folder of ["Login", "Sign-Up", "Dashboard", "Terms"]) {
    app.get([`/${folder}`, `/${folder}/`], page(folder));
}
app.get(["/login", "/signup", "/sign-up", "/dashboard", "/terms"], (req, res) => {
    const map = { "/login": "/Login", "/signup": "/Sign-Up", "/sign-up": "/Sign-Up", "/dashboard": "/Dashboard", "/terms": "/Terms" };
    res.redirect(301, map[req.path]);
});

/* ============================================================
   ERRORS
   ============================================================ */
app.use("/api", (req, res) => res.status(404).json({ message: "Route not found." }));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, "index.html")));

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "File too large (max 50 MB)." });
    }
    res.status(400).json({ message: err.message || "Request failed." });
});

/* ============================================================
   START-UP & SHUTDOWN
   Connect to MongoDB first, then accept traffic. If the database is
   unreachable the process exits so the host restarts it.
   ============================================================ */
let server;
mongoose.set("strictQuery", true);
mongoose
    .connect(DB_URL, { maxPoolSize: 20, serverSelectionTimeoutMS: 10000 })
    .then(() => {
        console.log("✅ MongoDB connected");
        server = app.listen(PORT, () => console.log(`🎧 Sohify running on http://localhost:${PORT}`));
    })
    .catch((err) => {
        console.error("❌ MongoDB connection failed:", err.message);
        process.exit(1);
    });

function shutdown(signal) {
    console.log(`${signal} received — closing…`);
    const done = () => mongoose.connection.close(false).finally(() => process.exit(0));
    if (server) server.close(done);
    else done();
    setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
