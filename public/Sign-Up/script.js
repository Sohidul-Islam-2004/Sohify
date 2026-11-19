/* ==========================================================================
   SOHIFY — SIGN UP (details → email code → account)
   ========================================================================== */

const API = "/api/users";
const MIN_PASSWORD = 8;
const SESSION_KEYS = ["sohify_token", "sohify_user", "sohify_username", "sohify_user_id", "sohify_is_admin", "sohify_avatar"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const $ = (id) => document.getElementById(id);

async function postJSON(path, body) {
    const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

function setBusy(btn, busy, label) {
    if (busy) {
        btn.dataset.label = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>${label}</span>`;
    } else {
        btn.disabled = false;
        if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
}

function showAlert(el, message, type = "error") {
    el.className = `form-alert ${type}`;
    el.textContent = message;
    el.hidden = !message;
}

/* ---------- Elements ---------- */
const signupStep = $("signupStep");
const verifyStep = $("verifyStep");
const signupForm = $("signupForm");
const verifyForm = $("verifyForm");

const fullNameInput = $("fullName");
const emailInput = $("email");
const passwordInput = $("password");
const confirmPasswordInput = $("confirmPassword");
const termsCheckbox = $("terms");
const signupSubmitBtn = $("signupSubmitBtn");

const errors = {
    fullName: $("nameError"),
    email: $("emailError"),
    password: $("passwordError"),
    confirmPassword: $("confirmPasswordError"),
    terms: $("termsError")
};

const otpDigits = Array.from(document.querySelectorAll(".otp-digit"));
const verifyAlert = $("verifyAlert");
const verifyError = $("verifyError");
const verifySubmitBtn = $("verifySubmitBtn");
const resendCodeBtn = $("resendCodeBtn");

let currentEmail = "";
let countdownTimer = null;

/* ---------- If already signed in, skip sign-up ---------- */
if (localStorage.getItem("sohify_token") || sessionStorage.getItem("sohify_token")) {
    const token = localStorage.getItem("sohify_token") || sessionStorage.getItem("sohify_token");
    fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok && window.location.replace("/Dashboard"))
        .catch(() => {});
}

/* ---------- Password show/hide ---------- */
document.querySelectorAll(".toggle-btn[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
        const input = $(btn.dataset.toggle);
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.querySelector("i").className = show ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
});

/* ---------- Strength meter + live error clearing ---------- */
passwordInput.addEventListener("input", () => {
    const val = passwordInput.value;
    let score = 0;
    if (val.length >= MIN_PASSWORD) score++;
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    const level = score <= 1 ? "weak" : score <= 3 ? "medium" : "strong";
    $("strengthMeter").querySelectorAll("span").forEach((bar, i) => {
        bar.className = val && i < Math.max(score, 1) ? level : "";
    });
    if (val.length >= MIN_PASSWORD) errors.password.textContent = "";
});

confirmPasswordInput.addEventListener("input", () => {
    if (passwordInput.value === confirmPasswordInput.value) errors.confirmPassword.textContent = "";
});
emailInput.addEventListener("input", () => (errors.email.textContent = ""));
fullNameInput.addEventListener("input", () => (errors.fullName.textContent = ""));
termsCheckbox.addEventListener("change", () => (errors.terms.textContent = ""));

function clearErrors() {
    Object.values(errors).forEach((el) => (el.textContent = ""));
    showAlert($("signupAlert"), "");
}

/* ---------- Terms modal ---------- */
const termsModal = $("termsModal");
let lastFocus = null;

function openTermsModal() {
    lastFocus = document.activeElement;
    termsModal.hidden = false;
    document.body.style.overflow = "hidden";
    $("acceptTermsModalBtn").focus();
}
function closeTermsModal() {
    termsModal.hidden = true;
    document.body.style.overflow = "";
    lastFocus?.focus();
}

$("openTermsLink").addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // allow open-in-new-tab
    e.preventDefault();
    openTermsModal();
});
$("closeTermsModalBtn").addEventListener("click", closeTermsModal);
$("dismissTermsModalBtn").addEventListener("click", closeTermsModal);
$("acceptTermsModalBtn").addEventListener("click", () => {
    termsCheckbox.checked = true;
    errors.terms.textContent = "";
    closeTermsModal();
    signupSubmitBtn.focus();
});
termsModal.addEventListener("click", (e) => e.target === termsModal && closeTermsModal());
document.addEventListener("keydown", (e) => e.key === "Escape" && !termsModal.hidden && closeTermsModal());

/* ---------- Steps + resend countdown ---------- */
function showStep(step) {
    const isVerify = step === "verify";
    signupStep.hidden = isVerify;
    verifyStep.hidden = !isVerify;
    if (isVerify) {
        $("verifyTargetEmail").textContent = currentEmail;
        resetOtp();
        startCountdown(45);
        setTimeout(() => otpDigits[0].focus(), 50);
    } else {
        clearInterval(countdownTimer);
        setTimeout(() => emailInput.focus(), 50);
    }
}

function startCountdown(seconds) {
    clearInterval(countdownTimer);
    let left = seconds;
    resendCodeBtn.disabled = true;
    resendCodeBtn.innerHTML = `resend in <span id="resendCountdown">${left}</span>s`;
    countdownTimer = setInterval(() => {
        left -= 1;
        const span = $("resendCountdown");
        if (span) span.textContent = left;
        if (left <= 0) {
            clearInterval(countdownTimer);
            resendCodeBtn.disabled = false;
            resendCodeBtn.textContent = "resend code";
        }
    }, 1000);
}

/* ==========================================================================
   STEP 1 — send confirmation code
   ========================================================================== */
signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    const fail = (field, msg, input) => {
        errors[field].textContent = msg;
        input?.focus();
    };

    if (!fullName) return fail("fullName", "Please enter your name.", fullNameInput);
    if (!EMAIL_RE.test(email)) return fail("email", "Please enter a valid email address.", emailInput);
    if (password.length < MIN_PASSWORD) return fail("password", `Password must be at least ${MIN_PASSWORD} characters.`, passwordInput);
    if (password !== confirmPassword) return fail("confirmPassword", "Passwords do not match.", confirmPasswordInput);
    if (!termsCheckbox.checked) return fail("terms", "Please agree to the Terms & Conditions.", termsCheckbox);

    setBusy(signupSubmitBtn, true, "Sending code…");
    try {
        const { ok, data } = await postJSON("/send-verification", {
            fullName,
            email,
            password,
            confirmPassword,
            acceptedTerms: true
        });

        if (!ok) {
            const field = data.field === "acceptedTerms" ? "terms" : data.field;
            if (errors[field]) errors[field].textContent = data.message;
            else showAlert($("signupAlert"), data.message || "Couldn't send the code. Please try again.");
            return;
        }

        currentEmail = email;
        showStep("verify");
        showAlert(
            verifyAlert,
            data.simulated
                ? "Dev mode: SMTP isn't configured, so the code was printed in the server terminal."
                : "Code sent! It can take a minute to arrive.",
            data.simulated ? "info" : "success"
        );
    } catch (err) {
        console.error("Signup error:", err);
        showAlert($("signupAlert"), "Can't reach the server. Check your connection and try again.");
    } finally {
        setBusy(signupSubmitBtn, false);
    }
});

/* ==========================================================================
   OTP boxes
   ========================================================================== */
function getOtp() {
    return otpDigits.map((i) => i.value).join("");
}
function resetOtp() {
    otpDigits.forEach((i) => {
        i.value = "";
        i.classList.remove("filled", "invalid");
    });
    verifyError.textContent = "";
}
function fillOtp(digits, startAt = 0) {
    digits.split("").forEach((d, n) => {
        const box = otpDigits[startAt + n];
        if (box) {
            box.value = d;
            box.classList.add("filled");
        }
    });
    (otpDigits.find((i) => !i.value) || otpDigits[5]).focus();
    if (getOtp().length === 6) verifyForm.requestSubmit();
}

otpDigits.forEach((box, index) => {
    box.addEventListener("input", () => {
        const val = box.value.replace(/\D/g, "");
        verifyError.textContent = "";
        otpDigits.forEach((d) => d.classList.remove("invalid"));
        if (val.length > 1) {
            box.value = "";
            return fillOtp(val.slice(0, 6 - index), index);
        }
        box.value = val;
        box.classList.toggle("filled", !!val);
        if (val && index < 5) otpDigits[index + 1].focus();
        if (getOtp().length === 6) verifyForm.requestSubmit();
    });

    box.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !box.value && index > 0) {
            otpDigits[index - 1].value = "";
            otpDigits[index - 1].classList.remove("filled");
            otpDigits[index - 1].focus();
            e.preventDefault();
        } else if (e.key === "ArrowLeft" && index > 0) {
            otpDigits[index - 1].focus();
        } else if (e.key === "ArrowRight" && index < 5) {
            otpDigits[index + 1].focus();
        }
    });

    box.addEventListener("focus", () => box.select());

    box.addEventListener("paste", (e) => {
        e.preventDefault();
        const digits = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
        if (!digits) return;
        resetOtp();
        fillOtp(digits, 0);
    });
});

/* ==========================================================================
   STEP 2 — confirm code and create the account
   ========================================================================== */
let verifying = false;
verifyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (verifying) return;

    const code = getOtp();
    if (code.length !== 6) {
        verifyError.textContent = "Please enter all 6 digits.";
        return (otpDigits.find((i) => !i.value) || otpDigits[0]).focus();
    }

    verifying = true;
    setBusy(verifySubmitBtn, true, "Creating account…");
    try {
        const { ok, data } = await postJSON("/verify-and-register", { email: currentEmail, code });

        if (!ok) {
            verifyError.textContent = data.message || "That code didn't work.";
            otpDigits.forEach((d) => {
                d.value = "";
                d.classList.remove("filled");
                d.classList.add("invalid");
            });
            otpDigits[0].focus();
            return;
        }

        // New accounts start a normal (non-remembered) session.
        const user = data.data;
        SESSION_KEYS.forEach((k) => {
            localStorage.removeItem(k);
            sessionStorage.removeItem(k);
        });
        sessionStorage.setItem("sohify_token", data.token);
        sessionStorage.setItem("sohify_user", user.email);
        sessionStorage.setItem("sohify_username", user.name || user.email.split("@")[0]);
        sessionStorage.setItem("sohify_user_id", user.id);
        sessionStorage.setItem("sohify_is_admin", String(Boolean(user.isAdmin)));
        localStorage.setItem("sohify_signup_email", user.email);

        showAlert(verifyAlert, "Welcome to Sohify! Taking you to the player…", "success");
        clearInterval(countdownTimer);
        setTimeout(() => window.location.replace("/Dashboard"), 900);
    } catch (err) {
        console.error("Verify error:", err);
        verifyError.textContent = "Can't reach the server. Please try again.";
    } finally {
        verifying = false;
        setBusy(verifySubmitBtn, false);
    }
});

/* ---------- Resend ---------- */
resendCodeBtn.addEventListener("click", async () => {
    if (resendCodeBtn.disabled || !currentEmail) return;
    resendCodeBtn.disabled = true;
    resendCodeBtn.textContent = "sending…";
    try {
        const { ok, data } = await postJSON("/resend-verification", { email: currentEmail });
        if (!ok) {
            showAlert(verifyAlert, data.message || "Couldn't resend the code.");
            if (/expired|not found/i.test(data.message || "")) return showStep("signup");
            return startCountdown(10);
        }
        resetOtp();
        otpDigits[0].focus();
        showAlert(
            verifyAlert,
            data.simulated ? "Dev mode: new code printed in the server terminal." : `A new code was sent to ${currentEmail}.`,
            data.simulated ? "info" : "success"
        );
        startCountdown(45);
    } catch {
        showAlert(verifyAlert, "Can't reach the server. Try again in a moment.");
        startCountdown(15);
    }
});

$("backToSignupBtn").addEventListener("click", () => showStep("signup"));
