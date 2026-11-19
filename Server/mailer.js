const nodemailer = require("nodemailer");

/* ============================================================
   SOHIFY — TRANSACTIONAL EMAIL (Google SMTP via Nodemailer)
   Env:
     EMAIL_USER   your Gmail address
     EMAIL_PASS   16-char Google App Password (spaces are fine)
     SMTP_HOST    optional, default smtp.gmail.com
     SMTP_PORT    optional, default 465 (SSL) — use 587 for STARTTLS
     APP_URL      optional, e.g. https://sohify.app (used for links)
   ============================================================ */

const BRAND = "Sohify";
const IS_PROD = process.env.NODE_ENV === "production";

let cachedTransporter = null;

function createTransporter() {
    if (cachedTransporter) return cachedTransporter;

    const user = process.env.EMAIL_USER || process.env.GMAIL_USER || process.env.SMTP_USER;
    const pass = process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;
    if (!user || !pass) return null;

    const port = parseInt(process.env.SMTP_PORT || "465", 10);
    cachedTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port,
        secure: process.env.SMTP_SECURE === "true" || port === 465,
        auth: {
            user: user.trim(),
            // Google shows App Passwords as "abcd efgh ijkl mnop" — strip the spaces.
            pass: pass.trim().replace(/\s+/g, "")
        },
        tls: { rejectUnauthorized: true }
    });
    return cachedTransporter;
}

function senderAddress() {
    const user = process.env.EMAIL_USER || process.env.GMAIL_USER || process.env.SMTP_USER || "no-reply@sohify.app";
    return `"${BRAND}" <${user.trim()}>`;
}

const escape = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ------------------------------------------------------------
   Shared email layout — inline styles so Gmail/Outlook render it.
   ------------------------------------------------------------ */
function layout({ preheader, heading, intro, code, codeLabel, note, outro }) {
    const year = new Date().getFullYear();
    const appUrl = process.env.APP_URL || "";
    const codeBlock = code
        ? `
        <tr><td style="padding:8px 32px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0720;border:1px solid #3b2a6b;border-radius:12px;">
            <tr><td align="center" style="padding:20px 16px 6px;font:600 11px/1 Inter,Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#c4b5fd;">${escape(codeLabel)}</td></tr>
            <tr><td align="center" style="padding:6px 16px 8px;font:700 36px/1.2 'Courier New',Courier,monospace;letter-spacing:10px;color:#ffffff;">${escape(code)}</td></tr>
            <tr><td align="center" style="padding:0 16px 18px;font:400 12px/1.4 Inter,Arial,sans-serif;color:#8b87a8;">Expires in 15 minutes</td></tr>
          </table>
        </td></tr>`
        : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<title>${escape(heading)} – ${BRAND}</title>
</head>
<body style="margin:0;padding:0;background:#030014;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#030014;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0e0a26;border:1px solid #2a1f4d;border-radius:16px;">
      <tr><td style="padding:28px 32px 8px;font:700 22px/1 'Plus Jakarta Sans',Inter,Arial,sans-serif;color:#ffffff;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#a855f7;margin-right:8px;vertical-align:middle;"></span>${BRAND}
      </td></tr>
      <tr><td style="padding:16px 32px 4px;font:700 20px/1.3 Inter,Arial,sans-serif;color:#ffffff;">${escape(heading)}</td></tr>
      <tr><td style="padding:8px 32px 8px;font:400 15px/1.6 Inter,Arial,sans-serif;color:#b8b4d4;">${intro}</td></tr>
      ${codeBlock}
      ${note ? `<tr><td style="padding:16px 32px 4px;">
        <div style="border-left:3px solid #a855f7;background:#150f33;border-radius:6px;padding:12px 14px;font:400 13px/1.5 Inter,Arial,sans-serif;color:#d8d2f5;">${note}</div>
      </td></tr>` : ""}
      <tr><td style="padding:16px 32px 28px;font:400 13px/1.6 Inter,Arial,sans-serif;color:#8b87a8;">${outro}</td></tr>
      <tr><td style="padding:18px 32px;border-top:1px solid #2a1f4d;font:400 12px/1.5 Inter,Arial,sans-serif;color:#6b6788;">
        &copy; ${year} ${BRAND} Music${appUrl ? ` · <a href="${escape(appUrl)}" style="color:#a78bfa;text-decoration:none;">${escape(appUrl.replace(/^https?:\/\//, ""))}</a>` : ""}<br>
        You're receiving this because of activity on your ${BRAND} account.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/* ------------------------------------------------------------
   Core send helper. Falls back to the terminal in development
   when SMTP credentials are missing, so local testing still works.
   ------------------------------------------------------------ */
async function deliver({ to, subject, text, html, devLabel, devCode }) {
    const transporter = createTransporter();

    if (!transporter) {
        if (IS_PROD) {
            throw new Error("Email service is not configured. Please try again later.");
        }
        console.log("\n──────────────── SOHIFY DEV MAIL ────────────────");
        console.log(`  EMAIL_USER / EMAIL_PASS not set in Server/.env`);
        console.log(`  To:      ${to}`);
        console.log(`  Subject: ${subject}`);
        if (devCode) console.log(`  ${devLabel || "Code"}: >> ${devCode} <<`);
        console.log("─────────────────────────────────────────────────\n");
        return { delivered: false, simulated: true };
    }

    try {
        const info = await transporter.sendMail({ from: senderAddress(), to, subject, text, html });
        console.log(`✅ [SMTP] "${subject}" sent to ${to} (${info.messageId})`);
        return { delivered: true, messageId: info.messageId };
    } catch (err) {
        console.error(`❌ [SMTP] Failed to send "${subject}" to ${to}:`, err.message);
        if (!IS_PROD && devCode) console.warn(`   ${devLabel || "Code"} (dev fallback): >> ${devCode} <<`);
        throw new Error("We couldn't send the email right now. Please try again in a moment.");
    }
}

/* ------------------------------------------------------------
   1. Sign-up confirmation code
   ------------------------------------------------------------ */
function sendVerificationEmail(email, fullName, code) {
    const name = fullName || "there";
    return deliver({
        to: email,
        subject: `${code} is your ${BRAND} confirmation code`,
        text:
            `Hi ${name},\n\nYour ${BRAND} confirmation code is: ${code}\n\n` +
            `It expires in 15 minutes. Enter it on the sign-up page to activate your account.\n\n` +
            `If you didn't create a ${BRAND} account, you can ignore this email.\n\n— The ${BRAND} Team`,
        html: layout({
            preheader: `Your ${BRAND} confirmation code is ${code}`,
            heading: "Confirm your email",
            intro: `Hi ${escape(name)}, welcome to ${BRAND}! Enter this code on the sign-up page to activate your account.`,
            code,
            codeLabel: "Confirmation code",
            note: `<strong style="color:#fff;">Never share this code.</strong> ${BRAND} will never ask you for it.`,
            outro: `If you didn't create a ${BRAND} account, no action is needed — you can safely ignore this email.`
        }),
        devLabel: "Sign-up code",
        devCode: code
    });
}

/* ------------------------------------------------------------
   2. Forgot-password reset code
   ------------------------------------------------------------ */
function sendPasswordResetEmail(email, fullName, code) {
    const name = fullName || "there";
    return deliver({
        to: email,
        subject: `${code} is your ${BRAND} password reset code`,
        text:
            `Hi ${name},\n\nWe received a request to reset your ${BRAND} password.\n\n` +
            `Your reset code is: ${code}\n\nIt expires in 15 minutes.\n\n` +
            `If you didn't ask to reset your password, ignore this email — your password won't change.\n\n— The ${BRAND} Team`,
        html: layout({
            preheader: `Your ${BRAND} password reset code is ${code}`,
            heading: "Reset your password",
            intro: `Hi ${escape(name)}, we received a request to reset the password for your ${BRAND} account. Enter this code on the sign-in page to choose a new one.`,
            code,
            codeLabel: "Password reset code",
            note: `<strong style="color:#fff;">Didn't request this?</strong> Ignore this email — your password stays the same. Someone may have typed your email by mistake.`,
            outro: `For your security, this code can only be used once and stops working after 5 wrong attempts.`
        }),
        devLabel: "Reset code",
        devCode: code
    });
}

/* ------------------------------------------------------------
   3. "Your password was changed" security notice
   ------------------------------------------------------------ */
function sendPasswordChangedEmail(email, fullName) {
    const name = fullName || "there";
    const when = new Date().toUTCString();
    return deliver({
        to: email,
        subject: `Your ${BRAND} password was changed`,
        text:
            `Hi ${name},\n\nThe password for your ${BRAND} account was changed on ${when}.\n` +
            `All other devices have been signed out.\n\n` +
            `If this wasn't you, reset your password right away using "Forgot password?" on the sign-in page.\n\n— The ${BRAND} Team`,
        html: layout({
            preheader: `Your ${BRAND} password was just changed`,
            heading: "Your password was changed",
            intro: `Hi ${escape(name)}, the password for your ${BRAND} account was changed on <strong style="color:#fff;">${escape(when)}</strong>. Other devices have been signed out.`,
            note: `<strong style="color:#fff;">Wasn't you?</strong> Use “Forgot password?” on the sign-in page right away to secure your account.`,
            outro: `No action is needed if you made this change.`
        })
    });
}

module.exports = {
    createTransporter,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendPasswordChangedEmail
};
