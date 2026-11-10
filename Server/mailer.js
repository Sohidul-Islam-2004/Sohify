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

module.exports = {
    sendVerificationEmail,
    createTransporter
};
