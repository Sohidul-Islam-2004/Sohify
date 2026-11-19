const nodemailer = require("nodemailer");

/**
 * Creates and configures the Nodemailer transport for Google SMTP.
 * Supports standard Gmail SMTP (smtp.gmail.com) with SSL (port 465) or TLS (port 587).
 * Uses Google App Passwords for secure, password-less account authentication.
 */
function createTransporter() {
    const user = process.env.EMAIL_USER || process.env.GMAIL_USER || process.env.SMTP_USER;
    const pass = process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;

    if (!user || !pass) {
        return null;
    }

    const cleanUser = user.trim();
    // Google App Passwords often contain spaces like "abcd efgh ijkl mnop". Remove all whitespace.
    const cleanPass = pass.trim().replace(/\s+/g, "");

    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = parseInt(process.env.SMTP_PORT || "465", 10);
    const secure = process.env.SMTP_SECURE === "true" || port === 465;

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
            user: cleanUser,
            pass: cleanPass
        },
        tls: {
            rejectUnauthorized: true
        }
    });
}

/**
 * Resolves SMTP configuration for Forgot Password / Reset Code emails.
 * Prefers dedicated RESET_EMAIL_USER / RESET_EMAIL_PASS credentials when set;
 * falls back cleanly to primary EMAIL_USER / EMAIL_PASS so reset works immediately.
 */
function getResetMailConfig() {
    const dedicatedUser = (
        process.env.RESET_EMAIL_USER ||
        process.env.RESET_GMAIL_USER ||
        process.env.RESET_SMTP_USER ||
        ""
    ).trim();
    const dedicatedPass = (
        process.env.RESET_EMAIL_PASS ||
        process.env.RESET_GMAIL_APP_PASSWORD ||
        process.env.RESET_SMTP_PASS ||
        ""
    )
        .trim()
        .replace(/\s+/g, "");

    if (dedicatedUser && dedicatedPass) {
        const host = (process.env.RESET_SMTP_HOST || process.env.SMTP_HOST || "smtp.gmail.com").trim();
        const port = parseInt(process.env.RESET_SMTP_PORT || process.env.SMTP_PORT || "465", 10);
        const secure =
            (process.env.RESET_SMTP_SECURE || process.env.SMTP_SECURE) === "true" || port === 465;
        return {
            user: dedicatedUser,
            pass: dedicatedPass,
            host,
            port,
            secure,
            senderMode: "dedicated"
        };
    }

    const fallbackUser = (
        process.env.EMAIL_USER ||
        process.env.GMAIL_USER ||
        process.env.SMTP_USER ||
        ""
    ).trim();
    const fallbackPass = (
        process.env.EMAIL_PASS ||
        process.env.GMAIL_APP_PASSWORD ||
        process.env.SMTP_PASS ||
        ""
    )
        .trim()
        .replace(/\s+/g, "");

    if (fallbackUser && fallbackPass) {
        if (dedicatedUser && !dedicatedPass) {
            console.warn(
                "⚠️  [Reset SMTP] RESET_EMAIL_USER is set without RESET_EMAIL_PASS — falling back to primary EMAIL_USER."
            );
        }
        const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
        const port = parseInt(process.env.SMTP_PORT || "465", 10);
        const secure = process.env.SMTP_SECURE === "true" || port === 465;
        return {
            user: fallbackUser,
            pass: fallbackPass,
            host,
            port,
            secure,
            senderMode: "fallback"
        };
    }

    return null;
}

function createResetTransporter() {
    const cfg = getResetMailConfig();
    if (!cfg) return null;

    return {
        transporter: nodemailer.createTransport({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            auth: {
                user: cfg.user,
                pass: cfg.pass
            },
            tls: {
                rejectUnauthorized: true
            }
        }),
        user: cfg.user,
        senderMode: cfg.senderMode
    };
}

/**
 * Generates an elegant, high-contrast, dark-mode HTML email template
 * matching the Sound Pulse cyberpunk neon cyan & magenta music design.
 */
function generateEmailHtml(fullName, code) {
    const safeName = (fullName || "Music Lover").replace(/[<>&"]/g, "");
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Email - Sound Pulse</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #05050b;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #05050b;
      padding: 40px 16px;
    }
    .card {
      max-width: 540px;
      margin: 0 auto;
      background: #0d0e1a;
      border: 1px solid rgba(0, 245, 212, 0.25);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 35px rgba(0, 245, 212, 0.12);
    }
    .header {
      background: linear-gradient(135deg, #00f5d4 0%, #38bdf8 45%, #9d4edd 85%, #ff2a85 100%);
      padding: 32px 24px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #05050b;
      text-transform: uppercase;
    }
    .header p {
      margin: 5px 0 0;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: rgba(5, 5, 11, 0.85);
    }
    .body {
      padding: 36px 30px;
      background: #0d0e1a;
    }
    .greeting {
      font-size: 20px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 12px;
    }
    .text {
      font-size: 15px;
      line-height: 1.6;
      color: #a6aec8;
      margin: 0 0 24px;
    }
    .code-box {
      background: #06070e;
      border: 2px dashed #00f5d4;
      border-radius: 14px;
      padding: 24px 16px;
      text-align: center;
      margin: 28px 0;
      box-shadow: inset 0 0 24px rgba(0, 245, 212, 0.08);
    }
    .code-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #00f5d4;
      margin-bottom: 10px;
    }
    .code-digits {
      font-family: 'Courier New', Courier, monospace;
      font-size: 40px;
      font-weight: 900;
      letter-spacing: 12px;
      color: #ffffff;
      display: inline-block;
      text-indent: 12px;
    }
    .code-expiry {
      font-size: 12px;
      color: #7c85a2;
      margin-top: 10px;
    }
    .callout {
      background: rgba(255, 42, 133, 0.08);
      border-left: 4px solid #ff2a85;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 24px;
      font-size: 13px;
      line-height: 1.5;
      color: #fbcfe8;
    }
    .footer {
      background: #070811;
      padding: 24px 30px;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .footer p {
      font-size: 12px;
      color: #646b82;
      margin: 0 0 6px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>Sound Pulse</h1>
        <p>Neon Hi-Fi · Audio Streaming</p>
      </div>
      <div class="body">
        <h2 class="greeting">Hey ${safeName},</h2>
        <p class="text">
          Welcome to Sound Pulse! We're excited to tune you in.
          Please enter the following 6-digit confirmation code on the sign-up page to verify your original email address and activate your account.
        </p>

        <div class="code-box">
          <div class="code-label">Your Confirmation Code</div>
          <div class="code-digits">${code}</div>
          <div class="code-expiry">⏱️ Valid for the next 15 minutes</div>
        </div>

        <div class="callout">
          <strong>Security Note:</strong> Never share this code with anyone. Sound Pulse support will never ask you for your confirmation code.
        </div>

        <p class="text" style="margin-bottom: 0;">
          If you did not request this email or never created an account on Sound Pulse, no action is needed — you can safely ignore this message.
        </p>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Sound Pulse Music. All rights reserved.</p>
        <p>Stream endless music, cyber soundscapes & curated neon mixes.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();
}

/**
 * Sends a 6-digit verification code to the user's email address.
 * If Google SMTP credentials are missing in Server/.env, logs the code clearly
 * to the terminal console so testing and local development work out-of-the-box.
 *
 * @param {string} email - Recipient email
 * @param {string} fullName - Recipient full name
 * @param {string} code - 6-digit numeric OTP
 * @returns {Promise<{ delivered: boolean, simulated?: boolean, messageId?: string }>}
 */
async function sendVerificationEmail(email, fullName, code) {
    const transporter = createTransporter();
    const sender = process.env.EMAIL_USER || process.env.GMAIL_USER || "no-reply@soundpulse.app";

    if (!transporter) {
        console.log("\n=======================================================");
        console.log("⚠️  [GOOGLE SMTP NOTICE] EMAIL_USER / EMAIL_PASS not yet set in Server/.env");
        console.log(`➡️  [DEV OTP CODE] Code for ${email} (${fullName}): >> ${code} <<`);
        console.log("💡 To receive real emails via Google SMTP:");
        console.log("   1. Open Server/.env");
        console.log("   2. Set EMAIL_USER=yourgmail@gmail.com");
        console.log("   3. Set EMAIL_PASS=your-16-char-google-app-password");
        console.log("=======================================================\n");

        return {
            delivered: false,
            simulated: true,
            message: "Google SMTP credentials not configured. Verification code logged to terminal console."
        };
    }

    const mailOptions = {
        from: `"Sound Pulse" <${process.env.EMAIL_USER || sender}>`,
        to: email,
        subject: `${code} is your Sound Pulse confirmation code`,
        text: `Hey ${fullName || "Listener"},\n\nYour Sound Pulse confirmation code is: ${code}\n\nThis code is valid for 15 minutes. Enter it on the sign-up page to verify your email and activate your account.\n\nIf you did not create a Sound Pulse account, please ignore this email.\n\n— The Sound Pulse Team`,
        html: generateEmailHtml(fullName, code)
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ [Google SMTP] Verification code sent to ${email} (Message ID: ${info.messageId})`);
        return {
            delivered: true,
            messageId: info.messageId
        };
    } catch (err) {
        console.error(`❌ [Google SMTP Error] Failed to send email to ${email}:`, err.message);
        console.warn(`➡️  [FALLBACK DEV CODE] Code for ${email}: >> ${code} <<\n`);
        throw new Error(`Google SMTP error: ${err.message}. Please check your EMAIL_USER and EMAIL_PASS (App Password) in Server/.env.`);
    }
}

/**
 * Generates a Cosmic Obsidian + Violet/Cyan HTML email template for Password Reset OTP codes.
 */
function generateResetEmailHtml(fullName, code) {
    const safeName = (fullName || "Listener").replace(/[<>&"]/g, "");
    const safeCode = String(code || "").replace(/[<>&"]/g, "");
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Code - Sound Pulse</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #030014;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #f4f2ff;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #030014;
      padding: 40px 16px;
    }
    .card {
      max-width: 540px;
      margin: 0 auto;
      background: #0b071e;
      border: 1px solid rgba(168, 85, 247, 0.35);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85), 0 0 40px rgba(139, 92, 246, 0.16);
    }
    .header {
      background: linear-gradient(135deg, #9333ea 0%, #6d28d9 48%, #00f5d4 100%);
      padding: 30px 24px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.4px;
      color: #ffffff;
      text-transform: uppercase;
    }
    .header p {
      margin: 6px 0 0;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2.2px;
      text-transform: uppercase;
      color: rgba(244, 242, 255, 0.9);
    }
    .body {
      padding: 34px 30px;
      background: #0b071e;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 12px;
    }
    .text {
      font-size: 15px;
      line-height: 1.62;
      color: #b7b3d6;
      margin: 0 0 22px;
    }
    .code-box {
      background: #050218;
      border: 2px dashed #a855f7;
      border-radius: 14px;
      padding: 24px 16px;
      text-align: center;
      margin: 26px 0;
      box-shadow: inset 0 0 28px rgba(139, 92, 246, 0.12);
    }
    .code-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #c4b5fd;
      margin-bottom: 10px;
    }
    .code-digits {
      font-family: 'Courier New', Courier, monospace;
      font-size: 40px;
      font-weight: 900;
      letter-spacing: 12px;
      color: #ffffff;
      display: inline-block;
      text-indent: 12px;
    }
    .code-expiry {
      font-size: 12px;
      color: #9894b8;
      margin-top: 10px;
    }
    .callout {
      background: rgba(251, 113, 133, 0.08);
      border-left: 4px solid #fb7185;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 22px;
      font-size: 13px;
      line-height: 1.5;
      color: #fecdd3;
    }
    .footer {
      background: #060317;
      padding: 22px 30px;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
    }
    .footer p {
      font-size: 12px;
      color: #797599;
      margin: 0 0 5px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>Sound Pulse</h1>
        <p>Account Security · Password Reset</p>
      </div>
      <div class="body">
        <h2 class="greeting">Hello ${safeName},</h2>
        <p class="text">
          We received a request to reset the password for your Sound Pulse account.
          Enter the 6-digit verification code below on the sign-in reset dialog to confirm your identity and choose a new password.
        </p>

        <div class="code-box">
          <div class="code-label">Password Reset Code</div>
          <div class="code-digits">${safeCode}</div>
          <div class="code-expiry">Valid for 15 minutes · Single use</div>
        </div>

        <div class="callout">
          <strong>Didn't request this?</strong> Someone may have entered your email by mistake. Your password has not been changed — you can safely ignore this email.
        </div>

        <p class="text" style="margin-bottom: 0;">
          Never share this reset code with anyone.
        </p>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Sound Pulse Music. All rights reserved.</p>
        <p>Neon Hi-Fi Audio Streaming</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();
}

/**
 * Sends a 6-digit password reset OTP email using dedicated RESET_EMAIL_USER/RESET_EMAIL_PASS
 * when configured, falling back to primary EMAIL_USER/EMAIL_PASS or terminal console log.
 *
 * @param {string} email - Recipient email
 * @param {string} fullName - Account display name
 * @param {string} code - 6-digit numeric OTP
 * @returns {Promise<{ delivered: boolean, simulated?: boolean, senderMode: string, messageId?: string }>}
 */
async function sendPasswordResetEmail(email, fullName, code) {
    const resetConfig = createResetTransporter();

    if (!resetConfig) {
        console.log("\n=======================================================");
        console.log("⚠️  [RESET SMTP NOTICE] RESET_EMAIL_USER / EMAIL_USER not configured in Server/.env");
        console.log(`➡️  [DEV RESET CODE] Password reset code for ${email} (${fullName}): >> ${code} <<`);
        console.log("💡 To send password reset codes from a second Gmail:");
        console.log("   1. Open Server/.env");
        console.log("   2. Set RESET_EMAIL_USER=your-reset-sender@gmail.com");
        console.log("   3. Set RESET_EMAIL_PASS=your-16-char-google-app-password");
        console.log("=======================================================\n");

        return {
            delivered: false,
            simulated: true,
            senderMode: "simulated",
            message: "SMTP credentials not configured. Password reset code logged to terminal console."
        };
    }

    const { transporter, user, senderMode } = resetConfig;

    const mailOptions = {
        from: `"Sound Pulse Security" <${user}>`,
        to: email,
        subject: `${code} is your Sound Pulse password reset code`,
        text: `Hello ${fullName || "Listener"},\n\nWe received a request to reset your Sound Pulse password.\nYour 6-digit password reset code is: ${code}\n\nThis code expires in 15 minutes.\nIf you did not request a password reset, you can safely ignore this email.\n\n— Sound Pulse Security`,
        html: generateResetEmailHtml(fullName, code)
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(
            `✅ [Reset SMTP:${senderMode}] Password reset code sent to ${email} from ${user} (Message ID: ${info.messageId})`
        );
        return {
            delivered: true,
            senderMode,
            messageId: info.messageId
        };
    } catch (err) {
        console.error(`❌ [Reset SMTP:${senderMode} Error] Failed sending to ${email}:`, err.message);
        console.warn(`➡️  [FALLBACK RESET CODE] Code for ${email}: >> ${code} <<\n`);
        throw new Error(
            `Password reset email failed via ${senderMode} SMTP: ${err.message}. Please check RESET_EMAIL_USER / RESET_EMAIL_PASS in Server/.env.`
        );
    }
}

module.exports = {
    sendVerificationEmail,
    createTransporter,
    sendPasswordResetEmail,
    createResetTransporter,
    getResetMailConfig
};
