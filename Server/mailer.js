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
 * Generates an elegant, high-contrast, dark-mode HTML email template
 * matching the Sohify / SoundPulse cyberpunk and neon music design.
 */
function generateEmailHtml(fullName, code) {
    const safeName = (fullName || "Music Lover").replace(/[<>&"]/g, "");
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Email - Sohify</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0b0f;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #0b0b0f;
      padding: 40px 16px;
    }
    .card {
      max-width: 540px;
      margin: 0 auto;
      background: #15151c;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7);
    }
    .header {
      background: linear-gradient(135deg, #1ed760 0%, #10b981 100%);
      padding: 30px 24px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 26px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #000000;
    }
    .header p {
      margin: 4px 0 0;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: rgba(0, 0, 0, 0.75);
    }
    .body {
      padding: 36px 30px;
      background: #15151c;
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
      color: #a0a0b2;
      margin: 0 0 24px;
    }
    .code-box {
      background: #0f0f13;
      border: 2px dashed #1ed760;
      border-radius: 14px;
      padding: 24px 16px;
      text-align: center;
      margin: 28px 0;
    }
    .code-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #1ed760;
      margin-bottom: 8px;
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
      color: #71717a;
      margin-top: 10px;
    }
    .callout {
      background: rgba(139, 92, 246, 0.1);
      border-left: 4px solid #8b5cf6;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 24px;
      font-size: 13px;
      line-height: 1.5;
      color: #c4b5fd;
    }
    .footer {
      background: #0f0f13;
      padding: 24px 30px;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .footer p {
      font-size: 12px;
      color: #52525b;
      margin: 0 0 6px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>Sohify</h1>
        <p>SoundPulse · Lossless Audio Streaming</p>
      </div>
      <div class="body">
        <h2 class="greeting">Hey ${safeName},</h2>
        <p class="text">
          Welcome to Sohify! We're excited to have you on board.
          Please enter the following 6-digit confirmation code on the sign-up page to verify that this is your original email address and activate your account.
        </p>

        <div class="code-box">
          <div class="code-label">Your Confirmation Code</div>
          <div class="code-digits">${code}</div>
          <div class="code-expiry">⏱️ Valid for the next 15 minutes</div>
        </div>

        <div class="callout">
          <strong>Security Note:</strong> Never share this code with anyone. Sohify support will never ask you for your confirmation code.
        </div>

        <p class="text" style="margin-bottom: 0;">
          If you did not request this email or never created an account on Sohify, no action is needed — you can safely ignore this message.
        </p>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Sohify · SoundPulse. All rights reserved.</p>
        <p>Stream endless music, lossless soundscapes & curated mixes.</p>
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
    const sender = process.env.EMAIL_USER || process.env.GMAIL_USER || "no-reply@sohify.app";

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
        from: `"Sohify · SoundPulse" <${process.env.EMAIL_USER || sender}>`,
        to: email,
        subject: `${code} is your Sohify confirmation code`,
        text: `Hey ${fullName || "Listener"},\n\nYour confirmation code is: ${code}\n\nThis code is valid for 15 minutes. Enter it on the sign-up page to verify your email and activate your account.\n\nIf you did not create a Sohify account, please ignore this email.\n\n— The Sohify Team`,
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

module.exports = {
    sendVerificationEmail,
    createTransporter
};
