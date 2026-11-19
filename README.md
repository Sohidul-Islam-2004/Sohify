# Sohify

Music streaming web app — Express + MongoDB + Supabase Storage + Google SMTP.

## Folder layout

```
Server/   server.js · schema.js · mailer.js · .env (copy from .env.example)
public/   index.html · style.css · script.js · favicon.svg
          Login/ · Sign-Up/ · Dashboard/ · Terms/
```

No new npm packages are needed (express, mongoose, bcryptjs, cors, multer,
@supabase/supabase-js, nodemailer, dotenv — same as before).

## Setup

1. `cp Server/.env.example Server/.env` and fill it in.
   **Set `SESSION_SECRET`** — without it everyone is signed out whenever the server restarts.
2. `node Server/server.js` → http://localhost:5000

If `EMAIL_USER` / `EMAIL_PASS` are missing and `NODE_ENV` isn't `production`,
codes are printed in the terminal so you can test without email.

## Auth behaviour

| Action | What happens |
| --- | --- |
| Sign in, **Remember me ticked** | Session in `localStorage`, valid 30 days; email pre-filled next time |
| Sign in, **not ticked** | Session in `sessionStorage`; ends when the browser closes (max 24 h); saved email forgotten |
| **Forgot password?** | Email → 6-digit code (15 min, 5 tries) → new password → "password changed" email; other devices signed out |
| Change password (dashboard) | Needs current password; other devices signed out, this one stays in |
| Wrong email *or* password | Same message ("Incorrect email or password") — no account probing |
| 8 failed sign-ins / 15 min | Temporarily blocked for that IP + email |

## API added / changed

- `POST /api/users/forgot-password` `{ email }`
- `POST /api/users/verify-reset-code` `{ email, code }` → `{ resetToken }`
- `POST /api/users/reset-password` `{ email, resetToken, newPassword, confirmPassword }`
- `GET  /api/users/me` (Bearer token)
- `PATCH /api/songs/:id` (title, artist, album, cover) and `DELETE /api/songs/:id` — uploader or admin only
- `POST /api/users/login` now takes `remember` and returns a real signed `token`
- Every account / playlist / upload route now requires `Authorization: Bearer <token>`
  and only lets you touch your own data. Client-sent `userId` is ignored.

## Performance setup (recommended)

1. **Install compression** (gzip makes pages and API replies about 70% smaller):
   `npm install compression` — the server picks it up automatically.
2. **Supabase bucket settings** (Storage → your bucket → Edit):
   - Public bucket: **on**
   - File size limit: **50 MB**
   - Allowed MIME types: `audio/*, image/*`
   - `SUPABASE_KEY` must be the **service_role** key (needed to sign direct uploads). Never put it in front-end code.
3. Keep `@supabase/supabase-js` on v2.x (any recent version has `createSignedUploadUrl`).
   If it's missing, uploads automatically fall back to going through the server.

### What was optimised
| Area | Before | Now |
| --- | --- | --- |
| Audio upload | Whole file held in server RAM, then re-sent | Browser uploads straight to Supabase with a one-time signed URL (server fallback kept) |
| Media caching | Supabase default 1 hour | `Cache-Control` 1 year (file names are unique, never change) |
| Cover / avatar images | Uploaded at full size (often 3–5 MB) | Resized in the browser to 800 px / 400 px WebP (~50–150 KB) |
| Like, recent, playlist add/remove | Read whole user → modify → save (two quick taps could overwrite each other) | Single atomic MongoDB updates |
| Every API request | Loaded the full user incl. all liked/recent ids | Loads only the fields needed |
| Database | No indexes | Indexes for catalog, uploads, playlists and clean-up |
| Long song lists | All rows rendered at once | First 100 rows instantly, more as you scroll |
| Dashboard start | Songs, then library (one after the other) | Both requests in parallel |
| Static files | No cache headers | ETag revalidation for HTML/CSS/JS, 7-day cache for images/fonts |
| Offline / install | — | Service worker (offline app shell) + web app manifest ("Install Sohify") |
| Start-up | Accepted traffic before MongoDB connected | Connects first; `/api/health` for uptime checks; graceful shutdown |
