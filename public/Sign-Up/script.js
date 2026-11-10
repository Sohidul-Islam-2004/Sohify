function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector("i");
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    icon.className = isPassword ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
}

// Form & step containers
const signupStep = document.getElementById("signupStep");
const verifyStep = document.getElementById("verifyStep");
const signupForm = document.getElementById("signupForm");
const verifyForm = document.getElementById("verifyForm");

// Step 1 inputs
const fullNameInput = document.getElementById("fullName");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const termsCheckbox = document.getElementById("terms");
const strengthMeter = document.getElementById("strengthMeter");
const signupSubmitBtn = document.getElementById("signupSubmitBtn");

// Step 1 errors
const nameError = document.getElementById("nameError");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const confirmPasswordError = document.getElementById("confirmPasswordError");
const termsError = document.getElementById("termsError");

// Terms modal elements
const termsModal = document.getElementById("termsModal");
const openTermsLink = document.getElementById("openTermsLink");
const closeTermsModalBtn = document.getElementById("closeTermsModalBtn");
const dismissTermsModalBtn = document.getElementById("dismissTermsModalBtn");
const acceptTermsModalBtn = document.getElementById("acceptTermsModalBtn");

// Step 2 inputs & controls
const verifyTargetEmail = document.getElementById("verifyTargetEmail");
const verifyAlert = document.getElementById("verifyAlert");
const verifyError = document.getElementById("verifyError");
const verifySubmitBtn = document.getElementById("verifySubmitBtn");
const resendCodeBtn = document.getElementById("resendCodeBtn");
const resendCountdown = document.getElementById("resendCountdown");
const backToSignupBtn = document.getElementById("backToSignupBtn");
const otpDigits = document.querySelectorAll(".otp-digit");

const API_BASE = "/api/users";
const MIN_PASSWORD = 8;

let currentEmail = "";
let currentFullName = "";
let countdownTimer = null;

/* ============================================================
   PASSWORD STRENGTH METER & VALIDATION
   ============================================================ */
passwordInput.addEventListener("input", () => {
    const val = passwordInput.value;
    let score = 0;
    if (val.length >= MIN_PASSWORD) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    const bars = strengthMeter?.querySelectorAll("span") || [];
    bars.forEach((bar, i) => {
        bar.classList.remove("weak", "medium", "strong");
        if (i < score) {
            if (score <= 2) bar.classList.add("weak");
            else if (score === 3) bar.classList.add("medium");
            else bar.classList.add("strong");
        }
    });

    if (val.length >= MIN_PASSWORD) passwordError.textContent = "";
});

confirmPasswordInput.addEventListener("input", () => {
    if (passwordInput.value === confirmPasswordInput.value) {
        confirmPasswordError.textContent = "";
    }
});

emailInput.addEventListener("input", () => (emailError.textContent = ""));
fullNameInput.addEventListener("input", () => (nameError.textContent = ""));
if (termsCheckbox) {
    termsCheckbox.addEventListener("change", () => {
        if (termsError) termsError.textContent = "";
    });
}

function openTermsModal() {
    if (!termsModal) return;
    termsModal.classList.add("active");
    termsModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeTermsModal() {
    if (!termsModal) return;
    termsModal.classList.remove("active");
    termsModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

if (openTermsLink && termsModal) {
    openTermsLink.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        openTermsModal();
    });
}

if (closeTermsModalBtn) closeTermsModalBtn.addEventListener("click", closeTermsModal);
if (dismissTermsModalBtn) dismissTermsModalBtn.addEventListener("click", closeTermsModal);
if (acceptTermsModalBtn) {
    acceptTermsModalBtn.addEventListener("click", () => {
        if (termsCheckbox) termsCheckbox.checked = true;
        if (termsError) termsError.textContent = "";
        closeTermsModal();
        signupSubmitBtn?.focus();
    });
}
if (termsModal) {
    termsModal.addEventListener("click", (e) => {
        if (e.target === termsModal) closeTermsModal();
    });
}
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && termsModal?.classList.contains("active")) {
        closeTermsModal();
    }
});

function clearErrors() {
    nameError.textContent = "";
    emailError.textContent = "";
    passwordError.textContent = "";
    confirmPasswordError.textContent = "";
    if (termsError) termsError.textContent = "";
    if (verifyError) verifyError.textContent = "";
}

function showFieldError(field, message) {
    const map = {
        fullName: nameError,
        name: nameError,
        email: emailError,
        password: passwordError,
        confirmPassword: confirmPasswordError,
        terms: termsError,
        acceptedTerms: termsError,
    };
    if (map[field]) {
        map[field].textContent = message;
    } else {
        alert(message);
    }
}

/* ============================================================
   STEP NAVIGATION & RESEND TIMER
   ============================================================ */
function showStep(stepName) {
    clearErrors();
    if (stepName === "verify") {
        signupStep.style.display = "none";
        verifyStep.style.display = "block";
        verifyTargetEmail.textContent = currentEmail;

        // Reset and focus OTP digits
        otpDigits.forEach(input => {
            input.value = "";
            input.classList.remove("filled");
        });
        setTimeout(() => otpDigits[0]?.focus(), 100);
        startResendCountdown(45);
    } else {
        verifyStep.style.display = "none";
        signupStep.style.display = "block";
        if (countdownTimer) clearInterval(countdownTimer);
        setTimeout(() => emailInput?.focus(), 100);
    }
}

function startResendCountdown(seconds = 45) {
    if (countdownTimer) clearInterval(countdownTimer);
    let timeLeft = seconds;
    resendCodeBtn.disabled = true;
    resendCodeBtn.innerHTML = `Resend (<span id="resendCountdown">${timeLeft}</span>s)`;

    countdownTimer = setInterval(() => {
        timeLeft -= 1;
        const countSpan = document.getElementById("resendCountdown");
        if (countSpan) countSpan.textContent = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(countdownTimer);
            resendCodeBtn.disabled = false;
            resendCodeBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Resend Code';
        }
    }, 1000);
}

function showAlert(message, type = "info") {
    if (!verifyAlert) return;
    verifyAlert.className = `verify-alert ${type}`;
    verifyAlert.innerHTML = message;
    verifyAlert.style.display = "block";
}

function hideAlert() {
    if (!verifyAlert) return;
    verifyAlert.style.display = "none";
}

/* ============================================================
   STEP 1: SUBMIT REGISTRATION -> SEND CONFIRMATION CODE
   ============================================================ */
signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!fullName) return (nameError.textContent = "Please enter your full name.");
    if (!email) return (emailError.textContent = "Please enter an email address.");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return (emailError.textContent = "Please enter a valid email address.");

    if (password.length < MIN_PASSWORD) {
        return (passwordError.textContent = `Password must be at least ${MIN_PASSWORD} characters.`);
    }
    if (password !== confirmPassword) {
        return (confirmPasswordError.textContent = "Passwords do not match.");
    }
    if (!termsCheckbox.checked) {
        if (termsError) {
            termsError.textContent = "Please agree to the Terms & Conditions to create your account.";
        }
        termsCheckbox.focus();
        return;
    }

    const originalText = signupSubmitBtn.innerHTML;
    signupSubmitBtn.disabled = true;
    signupSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Sending confirmation code...</span>';

    try {
        const res = await fetch(`${API_BASE}/send-verification`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fullName,
                email,
                password,
                confirmPassword,
                acceptedTerms: Boolean(termsCheckbox.checked)
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            showFieldError(data.field, data.message || "Could not send verification code.");
            return;
        }

        currentEmail = email;
        currentFullName = fullName;

        showStep("verify");

        if (data.simulated) {
            showAlert("💡 <strong>Dev Notice:</strong> Google SMTP credentials not set in Server/.env. The 6-digit confirmation code was logged to your terminal console.", "info");
        } else {
            showAlert(`A 6-digit confirmation code was sent to <strong>${email}</strong> via Google SMTP. Check your inbox and spam folder.`, "success");
        }
    } catch (err) {
        console.error("Signup request error:", err);
        alert("Network error. Please verify your connection and server status.");
    } finally {
        signupSubmitBtn.disabled = false;
        signupSubmitBtn.innerHTML = originalText;
    }
});

/* ============================================================
   OTP BOXES INTERACTIONS (Typing, Backspace, Paste)
   ============================================================ */
otpDigits.forEach((digitInput, index) => {
    // Only accept numeric inputs & auto-advance
    digitInput.addEventListener("input", (e) => {
        const val = e.target.value.replace(/\D/g, "");
        e.target.value = val;

        if (val) {
            digitInput.classList.add("filled");
            if (verifyError) verifyError.textContent = "";

            if (index < otpDigits.length - 1) {
                otpDigits[index + 1].focus();
            } else {
                // All 6 digits filled -> auto-submit!
                const completeCode = getEnteredOtp();
                if (completeCode.length === 6) {
                    verifyForm.requestSubmit();
                }
            }
        } else {
            digitInput.classList.remove("filled");
        }
    });

    // Handle backspace navigation
    digitInput.addEventListener("keydown", (e) => {
        if (e.key === "Backspace") {
            if (!digitInput.value && index > 0) {
                otpDigits[index - 1].focus();
                otpDigits[index - 1].value = "";
                otpDigits[index - 1].classList.remove("filled");
            } else {
                digitInput.value = "";
                digitInput.classList.remove("filled");
            }
        } else if (e.key === "ArrowLeft" && index > 0) {
            otpDigits[index - 1].focus();
        } else if (e.key === "ArrowRight" && index < otpDigits.length - 1) {
            otpDigits[index + 1].focus();
        }
    });

    // Handle paste across any of the digits
    digitInput.addEventListener("paste", (e) => {
        e.preventDefault();
        const clipboard = (e.clipboardData || window.clipboardData).getData("text") || "";
        const digits = clipboard.replace(/\D/g, "").slice(0, 6);

        if (!digits) return;

        digits.split("").forEach((d, i) => {
            if (otpDigits[i]) {
                otpDigits[i].value = d;
                otpDigits[i].classList.add("filled");
            }
        });

        if (digits.length === 6) {
            otpDigits[5].focus();
            verifyForm.requestSubmit();
        } else {
            const nextEmpty = Math.min(digits.length, otpDigits.length - 1);
            otpDigits[nextEmpty].focus();
        }
    });
});

function getEnteredOtp() {
    return Array.from(otpDigits).map(input => input.value.trim()).join("");
}

/* ============================================================
   STEP 2: CONFIRM CODE & FINALIZE REGISTRATION
   ============================================================ */
verifyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (verifyError) verifyError.textContent = "";

    const code = getEnteredOtp();
    if (code.length !== 6) {
        if (verifyError) verifyError.textContent = "Please enter the full 6-digit confirmation code.";
        // Focus first empty digit
        for (const input of otpDigits) {
            if (!input.value) { input.focus(); break; }
        }
        return;
    }

    const originalText = verifySubmitBtn.innerHTML;
    verifySubmitBtn.disabled = true;
    verifySubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Confirming code...</span>';

    try {
        const res = await fetch(`${API_BASE}/verify-and-register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: currentEmail, code }),
        });

        const data = await res.json();

        if (!res.ok) {
            if (verifyError) verifyError.textContent = data.message || "Invalid confirmation code.";
            // Highlight OTP boxes
            otpDigits.forEach(d => {
                d.style.borderColor = "#f87171";
                setTimeout(() => (d.style.borderColor = ""), 1500);
            });
            return;
        }

        // Success state
        showAlert("🎉 <strong>Account Confirmed!</strong> Welcome to Sound Pulse. Redirecting to your dashboard...", "success");

        const user = data.data;
        const username = user.name || user.email.split("@")[0];
        const token = data.token || "session_token_" + Date.now();
        const isAdminStr = String(Boolean(user.isAdmin));

        // Store session tokens for seamless immediate login
        localStorage.setItem("sohify_token", token);
        localStorage.setItem("sohify_user", user.email);
        localStorage.setItem("sohify_username", username);
        localStorage.setItem("sohify_user_id", user.id);
        localStorage.setItem("sohify_is_admin", isAdminStr);

        sessionStorage.setItem("sohify_token", token);
        sessionStorage.setItem("sohify_user", user.email);
        sessionStorage.setItem("sohify_username", username);
        sessionStorage.setItem("sohify_user_id", user.id);
        sessionStorage.setItem("sohify_is_admin", isAdminStr);

        localStorage.setItem("sohify_signup_email", user.email);
        localStorage.setItem("sohify_signup_name", user.name);

        setTimeout(() => {
            window.location.href = "/Dashboard";
        }, 1200);
    } catch (err) {
        console.error("Verification submit error:", err);
        if (verifyError) verifyError.textContent = "Network error. Please try again.";
    } finally {
        verifySubmitBtn.disabled = false;
        verifySubmitBtn.innerHTML = originalText;
    }
});

/* ============================================================
   RESEND CODE ACTION
   ============================================================ */
resendCodeBtn.addEventListener("click", async () => {
    if (resendCodeBtn.disabled || !currentEmail) return;

    resendCodeBtn.disabled = true;
    const prevText = resendCodeBtn.innerHTML;
    resendCodeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    hideAlert();

    try {
        const res = await fetch(`${API_BASE}/resend-verification`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: currentEmail }),
        });

        const data = await res.json();

        if (!res.ok) {
            showAlert(data.message || "Failed to resend code. Please try again later.", "error");
            startResendCountdown(10);
            return;
        }

        // Clear existing digits
        otpDigits.forEach(d => {
            d.value = "";
            d.classList.remove("filled");
        });
        otpDigits[0]?.focus();

        if (data.simulated) {
            showAlert("💡 <strong>Dev Notice:</strong> New 6-digit confirmation code was logged to your terminal console.", "info");
        } else {
            showAlert(`A fresh 6-digit confirmation code was sent to <strong>${currentEmail}</strong>.`, "success");
        }

        startResendCountdown(45);
    } catch (err) {
        console.error("Resend error:", err);
        showAlert("Network error while resending confirmation code.", "error");
        startResendCountdown(15);
    }
});

/* ============================================================
   CHANGE EMAIL / BACK TO STEP 1
   ============================================================ */
backToSignupBtn.addEventListener("click", () => {
    showStep("signup");
});
