function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = btn?.querySelector("i");
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    if (icon) {
        icon.className = isPassword ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    }
}

const API_BASE = "/api/users";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD = 8;

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberCheckbox = document.getElementById("remember");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const loginStatusAlert = document.getElementById("loginStatusAlert");

const sessionResumeBanner = document.getElementById("sessionResumeBanner");
const sessionResumeText = document.getElementById("sessionResumeText");
const sessionDismissBtn = document.getElementById("sessionDismissBtn");

// Forgot Password Modal Elements
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const forgotPasswordModal = document.getElementById("forgotPasswordModal");
const fpCloseModalBtn = document.getElementById("fpCloseModalBtn");
const fpAlertBanner = document.getElementById("fpAlertBanner");

const fpStepBadge1 = document.getElementById("fpStepBadge1");
const fpStepBadge2 = document.getElementById("fpStepBadge2");
const fpStepBadge3 = document.getElementById("fpStepBadge3");
const fpStepLine1 = document.getElementById("fpStepLine1");
const fpStepLine2 = document.getElementById("fpStepLine2");

const fpStepEmailForm = document.getElementById("fpStepEmailForm");
const fpEmailInput = document.getElementById("fpEmail");
const fpEmailError = document.getElementById("fpEmailError");
const fpSendCodeBtn = document.getElementById("fpSendCodeBtn");

const fpStepCodeForm = document.getElementById("fpStepCodeForm");
const fpTargetEmail = document.getElementById("fpTargetEmail");
const fpOtpDigits = document.querySelectorAll(".fp-otp-digit");
const fpCodeError = document.getElementById("fpCodeError");
const fpVerifyCodeBtn = document.getElementById("fpVerifyCodeBtn");
const fpResendBtn = document.getElementById("fpResendBtn");
const fpBackToEmailBtn = document.getElementById("fpBackToEmailBtn");

const fpStepNewPassForm = document.getElementById("fpStepNewPassForm");
const fpVerifiedEmailText = document.getElementById("fpVerifiedEmailText");
const fpNewPasswordInput = document.getElementById("fpNewPassword");
const fpConfirmPasswordInput = document.getElementById("fpConfirmPassword");
const fpStrengthMeter = document.getElementById("fpStrengthMeter");
const fpNewPasswordError = document.getElementById("fpNewPasswordError");
const fpConfirmPasswordError = document.getElementById("fpConfirmPasswordError");
const fpResetSubmitBtn = document.getElementById("fpResetSubmitBtn");

let currentResetEmail = "";
let currentResetToken = "";
let fpResendTimer = null;

function clearPersistentAuthKeys() {
    localStorage.removeItem("sohify_token");
    localStorage.removeItem("sohify_user");
    localStorage.removeItem("sohify_username");
    localStorage.removeItem("sohify_user_id");
    localStorage.removeItem("sohify_is_admin");
    localStorage.removeItem("sohify_remember_me");
    localStorage.removeItem("sohify_remember_expires_at");
    localStorage.removeItem("sohify_remember_email");
}

function purgeExpiredRememberedSession() {
    const expiresRaw = localStorage.getItem("sohify_remember_expires_at");
    const hasRememberFlag = localStorage.getItem("sohify_remember_me") === "true";
    if (expiresRaw) {
        const expiresAt = Number(expiresRaw);
        if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
            clearPersistentAuthKeys();
            return true;
        }
    } else if (!hasRememberFlag && localStorage.getItem("sohify_user")) {
        // Legacy un-remembered localStorage entry without expiry -> clear cleanly
        localStorage.removeItem("sohify_token");
        localStorage.removeItem("sohify_user");
        localStorage.removeItem("sohify_username");
        localStorage.removeItem("sohify_user_id");
        localStorage.removeItem("sohify_is_admin");
    }
    return false;
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showLoginStatus(message, type = "success") {
    if (!loginStatusAlert) return;
    if (!message) {
        loginStatusAlert.style.display = "none";
        loginStatusAlert.textContent = "";
        loginStatusAlert.className = "login-status-alert";
        return;
    }
    loginStatusAlert.className = `login-status-alert ${type}`;
    loginStatusAlert.innerHTML = `<i class="fa-solid ${type === "success" ? "fa-circle-check" : "fa-circle-info"}"></i> <span>${escapeHtml(message)}</span>`;
    loginStatusAlert.style.display = "flex";
}

function showFieldError(field, message) {
    if (field === "email") emailError.textContent = message;
    else if (field === "password") passwordError.textContent = message;
    else emailError.textContent = message;
}

emailInput?.addEventListener("input", () => {
    emailError.textContent = "";
    showLoginStatus("");
});
passwordInput?.addEventListener("input", () => {
    passwordError.textContent = "";
});

window.addEventListener("DOMContentLoaded", async () => {
    purgeExpiredRememberedSession();

    const signupEmail = localStorage.getItem("sohify_signup_email");
    const rememberedEmail = localStorage.getItem("sohify_remember_email");
    const isRemembered = localStorage.getItem("sohify_remember_me") === "true";

    if (signupEmail) {
        emailInput.value = signupEmail;
        localStorage.removeItem("sohify_signup_email");
        localStorage.removeItem("sohify_signup_name");
    } else if (rememberedEmail && isRemembered) {
        emailInput.value = rememberedEmail;
        if (rememberCheckbox) rememberCheckbox.checked = true;
    }

    // Check if there is an active 30-day session cookie or remembered token on the server
    try {
        const storedToken = sessionStorage.getItem("sohify_token") || localStorage.getItem("sohify_token") || "";
        const res = await fetch(`${API_BASE}/session`, {
            credentials: "same-origin",
            headers: storedToken && storedToken.includes(".") ? { Authorization: `Bearer ${storedToken}` } : {}
        });

        if (res.ok) {
            const payload = await res.json();
            if (payload.authenticated && payload.data && payload.rememberMe) {
                const u = payload.data;
                if (sessionResumeText) {
                    sessionResumeText.textContent = `${u.name || "Listener"} (${u.email})`;
                }
                if (sessionResumeBanner) {
                    sessionResumeBanner.style.display = "flex";
                }
                if (!emailInput.value) emailInput.value = u.email;
                if (rememberCheckbox) rememberCheckbox.checked = true;

                // Keep localStorage synced with verified server expiry
                const username = u.name || u.email.split("@")[0];
                localStorage.setItem("sohify_user", u.email);
                localStorage.setItem("sohify_username", username);
                localStorage.setItem("sohify_user_id", u.id);
                localStorage.setItem("sohify_is_admin", String(Boolean(u.isAdmin)));
                localStorage.setItem("sohify_remember_me", "true");
                localStorage.setItem("sohify_remember_email", u.email);
                if (payload.expiresAt) {
                    localStorage.setItem("sohify_remember_expires_at", String(payload.expiresAt));
                }
            }
        } else if (res.status === 401 && isRemembered) {
            // Server rejected expired/invalidated remembered session -> clean stale local keys
            clearPersistentAuthKeys();
        }
    } catch {
        // Offline / server busy: stay graceful
    }

    if (emailInput.value) {
        passwordInput.focus();
    } else {
        emailInput.focus();
    }
});

sessionDismissBtn?.addEventListener("click", async () => {
    clearPersistentAuthKeys();
    sessionStorage.clear();
    if (sessionResumeBanner) sessionResumeBanner.style.display = "none";
    if (rememberCheckbox) rememberCheckbox.checked = false;
    try {
        await fetch(`${API_BASE}/logout`, { method: "POST", credentials: "same-origin" });
    } catch {
        // Ignore network errors during switch
    }
    emailInput.value = "";
    passwordInput.value = "";
    emailInput.focus();
});

loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    emailError.textContent = "";
    passwordError.textContent = "";
    showLoginStatus("");

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const rememberMe = Boolean(rememberCheckbox && rememberCheckbox.checked);

    if (!email) return (emailError.textContent = "Please enter your email address.");
    if (!password) return (passwordError.textContent = "Please enter your password.");

    const submitBtn = loginForm.querySelector("button[type='submit']");
    const originalHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Signing in...</span>';

    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, rememberMe })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            showFieldError(data.field, data.message || "Login failed.");
            return;
        }

        const user = data.data;
        const username = user.name || user.email.split("@")[0];
        const isAdminStr = String(Boolean(user.isAdmin));
        const token = data.token || "";
        const expiresAt = Number(data.expiresAt) || Date.now() + THIRTY_DAYS_MS;

        // Always populate current browser tab sessionStorage
        sessionStorage.setItem("sohify_token", token);
        sessionStorage.setItem("sohify_user", user.email);
        sessionStorage.setItem("sohify_username", username);
        sessionStorage.setItem("sohify_user_id", user.id);
        sessionStorage.setItem("sohify_is_admin", isAdminStr);

        if (rememberMe) {
            // Persist 30-day session across restarts & track explicit expiration timestamp
            localStorage.setItem("sohify_token", token);
            localStorage.setItem("sohify_user", user.email);
            localStorage.setItem("sohify_username", username);
            localStorage.setItem("sohify_user_id", user.id);
            localStorage.setItem("sohify_is_admin", isAdminStr);
            localStorage.setItem("sohify_remember_me", "true");
            localStorage.setItem("sohify_remember_email", user.email);
            localStorage.setItem("sohify_remember_expires_at", String(expiresAt));
        } else {
            // Unchecked: ensure localStorage has NO persistent login keys once browser closes
            clearPersistentAuthKeys();
        }

        window.location.href = "/Dashboard";
    } catch (err) {
        console.error("Login error:", err);
        emailError.textContent = "Network error. Please check your connection and try again.";
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
    }
});

/* ==========================================================================
   FORGOT PASSWORD 3-STEP MODAL CONTROLLER
   ========================================================================== */
function setFpAlert(message = "", type = "info") {
    if (!fpAlertBanner) return;
    if (!message) {
        fpAlertBanner.style.display = "none";
        fpAlertBanner.innerHTML = "";
        fpAlertBanner.className = "fp-alert";
        return;
    }
    fpAlertBanner.className = `fp-alert ${type}`;
    fpAlertBanner.innerHTML = message;
    fpAlertBanner.style.display = "block";
}

function clearFpErrors() {
    if (fpEmailError) fpEmailError.textContent = "";
    if (fpCodeError) fpCodeError.textContent = "";
    if (fpNewPasswordError) fpNewPasswordError.textContent = "";
    if (fpConfirmPasswordError) fpConfirmPasswordError.textContent = "";
}

function resetFpPasswordVisibility() {
    forgotPasswordModal?.querySelectorAll(".toggle-btn").forEach((btn) => {
        const i = btn.querySelector("i");
        if (i) i.className = "fa-solid fa-eye";
    });
    if (fpNewPasswordInput) fpNewPasswordInput.type = "password";
    if (fpConfirmPasswordInput) fpConfirmPasswordInput.type = "password";
}

function updateFpStrengthMeter(pw) {
    const bars = fpStrengthMeter?.querySelectorAll("span") || [];
    let score = 0;
    if (pw.length >= MIN_PASSWORD) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    bars.forEach((bar, i) => {
        bar.classList.remove("weak", "medium", "strong");
        if (i < score) {
            if (score <= 2) bar.classList.add("weak");
            else if (score === 3) bar.classList.add("medium");
            else bar.classList.add("strong");
        }
    });
}

function setFpStep(stepNum) {
    clearFpErrors();

    if (fpStepEmailForm) fpStepEmailForm.style.display = stepNum === 1 ? "block" : "none";
    if (fpStepCodeForm) fpStepCodeForm.style.display = stepNum === 2 ? "block" : "none";
    if (fpStepNewPassForm) fpStepNewPassForm.style.display = stepNum === 3 ? "block" : "none";

    [fpStepBadge1, fpStepBadge2, fpStepBadge3].forEach((el, idx) => {
        if (!el) return;
        const s = idx + 1;
        el.classList.toggle("active", s === stepNum);
        el.classList.toggle("done", s < stepNum);
    });
    if (fpStepLine1) fpStepLine1.classList.toggle("done", stepNum > 1);
    if (fpStepLine2) fpStepLine2.classList.toggle("done", stepNum > 2);

    if (stepNum === 1) {
        if (fpResendTimer) clearInterval(fpResendTimer);
        setTimeout(() => fpEmailInput?.focus(), 60);
    } else if (stepNum === 2) {
        if (fpTargetEmail) fpTargetEmail.textContent = currentResetEmail;
        fpOtpDigits.forEach((d) => {
            d.value = "";
            d.classList.remove("filled");
            d.style.borderColor = "";
        });
        setTimeout(() => fpOtpDigits[0]?.focus(), 80);
    } else if (stepNum === 3) {
        if (fpResendTimer) clearInterval(fpResendTimer);
        if (fpVerifiedEmailText) fpVerifiedEmailText.textContent = currentResetEmail;
        setTimeout(() => fpNewPasswordInput?.focus(), 80);
    }
}

function startFpResendCountdown(seconds = 45) {
    if (fpResendTimer) clearInterval(fpResendTimer);
    if (!fpResendBtn) return;

    let timeLeft = seconds;
    fpResendBtn.disabled = true;
    fpResendBtn.innerHTML = `Resend (<span id="fpResendCountdown">${timeLeft}</span>s)`;

    fpResendTimer = setInterval(() => {
        timeLeft -= 1;
        const span = document.getElementById("fpResendCountdown");
        if (span) span.textContent = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(fpResendTimer);
            fpResendBtn.disabled = false;
            fpResendBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Resend Code';
        }
    }, 1000);
}

function openForgotPasswordModal() {
    if (!forgotPasswordModal) return;
    currentResetEmail = "";
    currentResetToken = "";
    setFpAlert("");
    clearFpErrors();
    resetFpPasswordVisibility();
    if (fpNewPasswordInput) fpNewPasswordInput.value = "";
    if (fpConfirmPasswordInput) fpConfirmPasswordInput.value = "";
    updateFpStrengthMeter("");

    const prefill = emailInput?.value.trim().toLowerCase();
    if (fpEmailInput) fpEmailInput.value = prefill || "";

    setFpStep(1);
    forgotPasswordModal.classList.add("active");
    forgotPasswordModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeForgotPasswordModal() {
    if (!forgotPasswordModal) return;
    forgotPasswordModal.classList.remove("active");
    forgotPasswordModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (fpResendTimer) clearInterval(fpResendTimer);
    resetFpPasswordVisibility();
}

forgotPasswordBtn?.addEventListener("click", openForgotPasswordModal);
fpCloseModalBtn?.addEventListener("click", closeForgotPasswordModal);
forgotPasswordModal?.addEventListener("click", (e) => {
    if (e.target === forgotPasswordModal) closeForgotPasswordModal();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && forgotPasswordModal?.classList.contains("active")) {
        closeForgotPasswordModal();
    }
});

fpEmailInput?.addEventListener("input", () => {
    fpEmailError.textContent = "";
    setFpAlert("");
});

fpNewPasswordInput?.addEventListener("input", () => {
    fpNewPasswordError.textContent = "";
    setFpAlert("");
    updateFpStrengthMeter(fpNewPasswordInput.value);
});

fpConfirmPasswordInput?.addEventListener("input", () => {
    if (fpNewPasswordInput.value === fpConfirmPasswordInput.value) {
        fpConfirmPasswordError.textContent = "";
    }
    setFpAlert("");
});

// Step 1 Submit: Send Reset Code
fpStepEmailForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFpErrors();
    setFpAlert("");

    const email = (fpEmailInput?.value || "").trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        fpEmailError.textContent = "Please enter a valid account email address.";
        fpEmailInput?.focus();
        return;
    }

    const originalHtml = fpSendCodeBtn.innerHTML;
    fpSendCodeBtn.disabled = true;
    fpSendCodeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Sending reset code...</span>';

    try {
        const res = await fetch(`${API_BASE}/forgot-password/send-code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            if (data.field === "email" && fpEmailError) {
                fpEmailError.textContent = data.message || "Account not found.";
            } else {
                setFpAlert(escapeHtml(data.message || "Could not send password reset code."), "error");
            }
            return;
        }

        currentResetEmail = data.email || email;
        setFpStep(2);
        startFpResendCountdown(45);

        if (data.simulated) {
            setFpAlert(
                "<strong>Dev Notice:</strong> SMTP is in preview mode. Your 6-digit password reset code was logged to the server console.",
                "info"
            );
        } else {
            setFpAlert(
                `A 6-digit password reset code was sent to <strong>${escapeHtml(currentResetEmail)}</strong>. Check your inbox and spam folder.`,
                "success"
            );
        }
    } catch (err) {
        console.error("Forgot password send-code error:", err);
        setFpAlert("Network error. Please check your connection and try again.", "error");
    } finally {
        fpSendCodeBtn.disabled = false;
        fpSendCodeBtn.innerHTML = originalHtml;
    }
});

// Step 2: OTP Digit Interactions
function getFpEnteredOtp() {
    return Array.from(fpOtpDigits).map((input) => input.value.trim()).join("");
}

fpOtpDigits.forEach((digitInput, index) => {
    digitInput.addEventListener("input", (e) => {
        const val = e.target.value.replace(/\D/g, "");
        e.target.value = val;

        if (val) {
            digitInput.classList.add("filled");
            if (fpCodeError) fpCodeError.textContent = "";
            if (index < fpOtpDigits.length - 1) {
                fpOtpDigits[index + 1].focus();
            } else if (getFpEnteredOtp().length === 6) {
                fpStepCodeForm?.requestSubmit();
            }
        } else {
            digitInput.classList.remove("filled");
        }
    });

    digitInput.addEventListener("keydown", (e) => {
        if (e.key === "Backspace") {
            if (!digitInput.value && index > 0) {
                fpOtpDigits[index - 1].focus();
                fpOtpDigits[index - 1].value = "";
                fpOtpDigits[index - 1].classList.remove("filled");
            } else {
                digitInput.value = "";
                digitInput.classList.remove("filled");
            }
        } else if (e.key === "ArrowLeft" && index > 0) {
            fpOtpDigits[index - 1].focus();
        } else if (e.key === "ArrowRight" && index < fpOtpDigits.length - 1) {
            fpOtpDigits[index + 1].focus();
        }
    });

    digitInput.addEventListener("paste", (e) => {
        e.preventDefault();
        const clipboard = (e.clipboardData || window.clipboardData).getData("text") || "";
        const digits = clipboard.replace(/\D/g, "").slice(0, 6);
        if (!digits) return;

        digits.split("").forEach((d, i) => {
            if (fpOtpDigits[i]) {
                fpOtpDigits[i].value = d;
                fpOtpDigits[i].classList.add("filled");
            }
        });

        if (digits.length === 6) {
            fpOtpDigits[5].focus();
            fpStepCodeForm?.requestSubmit();
        } else {
            fpOtpDigits[Math.min(digits.length, fpOtpDigits.length - 1)].focus();
        }
    });
});

// Step 2 Submit: Verify Code
fpStepCodeForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (fpCodeError) fpCodeError.textContent = "";
    setFpAlert("");

    const code = getFpEnteredOtp();
    if (code.length !== 6) {
        fpCodeError.textContent = "Please enter all 6 digits of your reset code.";
        for (const input of fpOtpDigits) {
            if (!input.value) {
                input.focus();
                break;
            }
        }
        return;
    }

    const originalHtml = fpVerifyCodeBtn.innerHTML;
    fpVerifyCodeBtn.disabled = true;
    fpVerifyCodeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Verifying code...</span>';

    try {
        const res = await fetch(`${API_BASE}/forgot-password/verify-code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: currentResetEmail, code })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            fpCodeError.textContent = data.message || "Invalid reset code.";
            fpOtpDigits.forEach((d) => {
                d.style.borderColor = "#fb7185";
                setTimeout(() => (d.style.borderColor = ""), 1400);
            });
            return;
        }

        currentResetToken = data.resetToken || "";
        setFpAlert("");
        setFpStep(3);
    } catch (err) {
        console.error("Verify reset code error:", err);
        setFpAlert("Network error verifying reset code.", "error");
    } finally {
        fpVerifyCodeBtn.disabled = false;
        fpVerifyCodeBtn.innerHTML = originalHtml;
    }
});

fpResendBtn?.addEventListener("click", async () => {
    if (fpResendBtn.disabled || !currentResetEmail) return;
    fpResendBtn.disabled = true;
    fpResendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    setFpAlert("");
    if (fpCodeError) fpCodeError.textContent = "";

    try {
        const res = await fetch(`${API_BASE}/forgot-password/resend-code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: currentResetEmail })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            setFpAlert(escapeHtml(data.message || "Could not resend reset code."), "error");
            startFpResendCountdown(15);
            return;
        }

        fpOtpDigits.forEach((d) => {
            d.value = "";
            d.classList.remove("filled");
        });
        fpOtpDigits[0]?.focus();

        if (data.simulated) {
            setFpAlert("<strong>Dev Notice:</strong> New 6-digit password reset code logged to the server console.", "info");
        } else {
            setFpAlert(`A fresh reset code was sent to <strong>${escapeHtml(currentResetEmail)}</strong>.`, "success");
        }
        startFpResendCountdown(45);
    } catch (err) {
        console.error("Resend reset code error:", err);
        setFpAlert("Network error while resending code.", "error");
        startFpResendCountdown(15);
    }
});

fpBackToEmailBtn?.addEventListener("click", () => {
    setFpAlert("");
    setFpStep(1);
});

// Step 3 Submit: Reset Password
fpStepNewPassForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFpErrors();
    setFpAlert("");

    const newPassword = fpNewPasswordInput?.value || "";
    const confirmPassword = fpConfirmPasswordInput?.value || "";

    if (newPassword.length < MIN_PASSWORD) {
        fpNewPasswordError.textContent = `Password must be at least ${MIN_PASSWORD} characters.`;
        fpNewPasswordInput?.focus();
        return;
    }
    if (newPassword !== confirmPassword) {
        fpConfirmPasswordError.textContent = "Passwords do not match.";
        fpConfirmPasswordInput?.focus();
        return;
    }

    const originalHtml = fpResetSubmitBtn.innerHTML;
    fpResetSubmitBtn.disabled = true;
    fpResetSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Updating password...</span>';

    try {
        const res = await fetch(`${API_BASE}/forgot-password/reset`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: currentResetEmail,
                resetToken: currentResetToken,
                newPassword,
                confirmPassword
            })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            if (data.field === "newPassword") {
                fpNewPasswordError.textContent = data.message;
            } else if (data.field === "confirmPassword") {
                fpConfirmPasswordError.textContent = data.message;
            } else {
                setFpAlert(escapeHtml(data.message || "Could not reset password."), "error");
            }
            return;
        }

        // Complete! Clear any stale tokens for old password and populate login form
        clearPersistentAuthKeys();
        sessionStorage.clear();
        if (sessionResumeBanner) sessionResumeBanner.style.display = "none";

        const updatedEmail = data.email || currentResetEmail;
        closeForgotPasswordModal();
        emailInput.value = updatedEmail;
        passwordInput.value = "";
        showLoginStatus("Password reset complete! Sign in with your new password.", "success");
        passwordInput.focus();
    } catch (err) {
        console.error("Reset password submit error:", err);
        setFpAlert("Network error. Please try again.", "error");
    } finally {
        fpResetSubmitBtn.disabled = false;
        fpResetSubmitBtn.innerHTML = originalHtml;
    }
});
