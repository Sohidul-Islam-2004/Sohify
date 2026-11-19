/* ==========================================================================
   SOHIFY — SIGN IN + FORGOT PASSWORD
   Remember me:
     ✓ checked   → session saved in localStorage (stays signed in for 30 days)
                   and your email is pre-filled next time
     ✗ unchecked → session saved in sessionStorage (signed out when the
                   browser closes) and the saved email is forgotten
   ========================================================================== */

const API = "/api/users";
const MIN_PASSWORD = 8;
const SESSION_KEYS = ["sohify_token", "sohify_user", "sohify_username", "sohify_user_id", "sohify_is_admin", "sohify_avatar"];
const REMEMBER_EMAIL_KEY = "sohify_remember_email";

const $ = (id) => document.getElementById(id);

/* ---------- Small helpers ---------- */
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
    if (!btn) return;
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
    if (!el) return;
    el.className = `form-alert ${type}`;
    el.textContent = message;
    el.hidden = !message;
}

function clearSession() {
    SESSION_KEYS.forEach((k) => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
    });
}

function saveSession(token, user, remember) {
    clearSession();
    const store = remember ? localStorage : sessionStorage;
    store.setItem("sohify_token", token);
    store.setItem("sohify_user", user.email);
    store.setItem("sohify_username", user.name || user.email.split("@")[0]);
    store.setItem("sohify_user_id", user.id);
    store.setItem("sohify_is_admin", String(Boolean(user.isAdmin)));
    if (user.avatarUrl) store.setItem("sohify_avatar", user.avatarUrl);
}

function getStoredToken() {
    return localStorage.getItem("sohify_token") || sessionStorage.getItem("sohify_token");
}

/* ---------- Password show/hide (all fields) ---------- */
document.querySelectorAll(".toggle-btn[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
        const input = $(btn.dataset.toggle);
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.querySelector("i").className = show ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
});

/* ---------- View switching ---------- */
const views = {
    login: $("loginView"),
    forgotEmail: $("forgotEmailView"),
    forgotCode: $("forgotCodeView"),
    forgotNew: $("forgotNewView"),
    forgotDone: $("forgotDoneView")
};

function showView(name) {
    Object.entries(views).forEach(([key, el]) => (el.hidden = key !== name));
    const focusMap = {
        login: () => ($("email").value ? $("password") : $("email")).focus(),
        forgotEmail: () => $("forgotEmail").focus(),
        forgotCode: () => otpDigits[0].focus(),
        forgotNew: () => $("newPassword").focus(),
        forgotDone: () => $("backToLoginBtn").focus()
    };
    setTimeout(() => focusMap[name]?.(), 50);
}

document.querySelectorAll("[data-back]").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.back)));

/* ==========================================================================
   1. SIGN IN
   ========================================================================== */
const loginForm = $("loginForm");
const emailInput = $("email");
const passwordInput = $("password");
const rememberCheckbox = $("remember");
const emailError = $("emailError");
const passwordError = $("passwordError");
const loginAlert = $("loginAlert");
const loginBtn = $("loginBtn");

emailInput.addEventListener("input", () => (emailError.textContent = ""));
passwordInput.addEventListener("input", () => (passwordError.textContent = ""));

// Caps Lock warning
passwordInput.addEventListener("keyup", (e) => {
    if (typeof e.getModifierState === "function") $("capsHint").hidden = !e.getModifierState("CapsLock");
});
passwordInput.addEventListener("blur", () => ($("capsHint").hidden = true));

window.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(location.search);
    const wantsReset = params.get("forgot") === "1";

    // Already signed in? Go straight to the player (unless they came to reset).
    const token = getStoredToken();
    if (token && !wantsReset) {
        try {
            const res = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                window.location.replace("/Dashboard");
                return;
            }
            clearSession();
        } catch {
            /* offline — stay on the page */
        }
    }

    const signupEmail = localStorage.getItem("sohify_signup_email");
    const rememberedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);

    if (signupEmail) {
        emailInput.value = signupEmail;
        localStorage.removeItem("sohify_signup_email");
        localStorage.removeItem("sohify_signup_name");
    } else if (rememberedEmail) {
        emailInput.value = rememberedEmail;
        rememberCheckbox.checked = true;
    }

    if (params.get("expired") === "1") {
        showAlert(loginAlert, "Your session expired. Please sign in again.", "info");
    }
    if (wantsReset) {
        $("forgotEmail").value = (params.get("email") || emailInput.value || "").trim();
        showView("forgotEmail");
        return;
    }
    (emailInput.value ? passwordInput : emailInput).focus();
});

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    emailError.textContent = "";
    passwordError.textContent = "";
    showAlert(loginAlert, "");

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const remember = rememberCheckbox.checked;

    if (!email) return (emailError.textContent = "Please enter your email address."), emailInput.focus();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        emailError.textContent = "Please enter a valid email address.";
        return emailInput.focus();
    }
    if (!password) return (passwordError.textContent = "Please enter your password."), passwordInput.focus();

    setBusy(loginBtn, true, "Signing in…");
    try {
        const { ok, data } = await postJSON("/login", { email, password, remember });

        if (!ok || !data.success) {
            if (data.unverified) {
                showAlert(loginAlert, "Your email isn't confirmed yet. Please sign up again to get a new code.", "info");
            } else if (data.field === "email") {
                emailError.textContent = data.message;
            } else if (data.field === "password") {
                passwordError.textContent = data.message;
                passwordInput.select();
            } else {
                showAlert(loginAlert, data.message || "Sign in failed. Please try again.");
            }
            return;
        }

        if (remember) localStorage.setItem(REMEMBER_EMAIL_KEY, email);
        else localStorage.removeItem(REMEMBER_EMAIL_KEY);

        saveSession(data.token, data.data, remember);

        const next = new URLSearchParams(location.search).get("next");
        window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/Dashboard";
    } catch (err) {
        console.error("Login error:", err);
        showAlert(loginAlert, "Can't reach the server. Check your connection and try again.");
    } finally {
        setBusy(loginBtn, false);
    }
});

/* ==========================================================================
   2. FORGOT PASSWORD — request code
   ========================================================================== */
let resetEmail = "";
let resetToken = "";
let countdownTimer = null;

$("forgotLink").addEventListener("click", () => {
    $("forgotEmail").value = emailInput.value.trim();
    $("forgotEmailError").textContent = "";
    showAlert($("forgotEmailAlert"), "");
    showView("forgotEmail");
});

$("forgotEmail").addEventListener("input", () => ($("forgotEmailError").textContent = ""));

async function requestResetCode(email, btn, alertEl) {
    const { ok, data } = await postJSON("/forgot-password", { email });
    if (!ok) {
        if (data.field === "email") $("forgotEmailError").textContent = data.message;
        else showAlert(alertEl, data.message || "Couldn't send the code. Please try again.");
        return false;
    }
    resetEmail = data.email || email;
    return data;
}

$("forgotEmailForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("forgotEmail").value.trim().toLowerCase();
    showAlert($("forgotEmailAlert"), "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        $("forgotEmailError").textContent = "Please enter a valid email address.";
        return $("forgotEmail").focus();
    }

    const btn = $("forgotEmailBtn");
    setBusy(btn, true, "Sending code…");
    try {
        const data = await requestResetCode(email, btn, $("forgotEmailAlert"));
        if (!data) return;
        $("resetTargetEmail").textContent = resetEmail;
        resetOtp();
        showAlert(
            $("forgotCodeAlert"),
            data.simulated ? "Dev mode: SMTP isn't configured, so the code was printed in the server terminal." : "",
            "info"
        );
        startCountdown(45);
        showView("forgotCode");
    } catch {
        showAlert($("forgotEmailAlert"), "Can't reach the server. Check your connection and try again.");
    } finally {
        setBusy(btn, false);
    }
});

/* ---------- Resend countdown ---------- */
function startCountdown(seconds) {
    const btn = $("resendResetBtn");
    clearInterval(countdownTimer);
    let left = seconds;
    btn.disabled = true;
    btn.innerHTML = `resend in <span id="resendCountdown">${left}</span>s`;
    countdownTimer = setInterval(() => {
        left -= 1;
        const span = $("resendCountdown");
        if (span) span.textContent = left;
        if (left <= 0) {
            clearInterval(countdownTimer);
            btn.disabled = false;
            btn.textContent = "resend code";
        }
    }, 1000);
}

$("resendResetBtn").addEventListener("click", async () => {
    const btn = $("resendResetBtn");
    if (btn.disabled || !resetEmail) return;
    btn.disabled = true;
    btn.textContent = "sending…";
    try {
        const data = await requestResetCode(resetEmail, btn, $("forgotCodeAlert"));
        if (!data) return startCountdown(10);
        resetOtp();
        showAlert($("forgotCodeAlert"), data.simulated ? "Dev mode: new code printed in the server terminal." : "A new code is on its way.", "success");
        startCountdown(45);
    } catch {
        showAlert($("forgotCodeAlert"), "Can't reach the server. Try again in a moment.");
        startCountdown(10);
    }
});

/* ==========================================================================
   3. FORGOT PASSWORD — verify code (6 boxes, paste + backspace support)
   ========================================================================== */
const otpDigits = Array.from(document.querySelectorAll(".otp-digit"));

function getOtp() {
    return otpDigits.map((i) => i.value).join("");
}
function resetOtp() {
    otpDigits.forEach((i) => {
        i.value = "";
        i.classList.remove("filled", "invalid");
    });
    $("forgotCodeError").textContent = "";
}
function fillOtp(digits, startAt = 0) {
    digits.split("").forEach((d, n) => {
        const box = otpDigits[startAt + n];
        if (box) {
            box.value = d;
            box.classList.add("filled");
        }
    });
    const next = otpDigits.find((i) => !i.value);
    (next || otpDigits[5]).focus();
    if (getOtp().length === 6) $("forgotCodeForm").requestSubmit();
}

otpDigits.forEach((box, index) => {
    box.addEventListener("input", () => {
        const val = box.value.replace(/\D/g, "");
        $("forgotCodeError").textContent = "";
        otpDigits.forEach((d) => d.classList.remove("invalid"));
        if (val.length > 1) {
            box.value = "";
            return fillOtp(val.slice(0, 6 - index), index); // mobile autofill drops all digits in one box
        }
        box.value = val;
        box.classList.toggle("filled", !!val);
        if (val && index < 5) otpDigits[index + 1].focus();
        if (getOtp().length === 6) $("forgotCodeForm").requestSubmit();
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

let verifyingCode = false;
$("forgotCodeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (verifyingCode) return;
    const code = getOtp();
    if (code.length !== 6) {
        $("forgotCodeError").textContent = "Please enter all 6 digits.";
        return (otpDigits.find((i) => !i.value) || otpDigits[0]).focus();
    }

    const btn = $("forgotCodeBtn");
    verifyingCode = true;
    setBusy(btn, true, "Verifying…");
    try {
        const { ok, data } = await postJSON("/verify-reset-code", { email: resetEmail, code });
        if (!ok) {
            $("forgotCodeError").textContent = data.message || "That code didn't work.";
            otpDigits.forEach((d) => d.classList.add("invalid"));
            otpDigits.forEach((d) => (d.value = "", d.classList.remove("filled")));
            otpDigits[0].focus();
            return;
        }
        resetToken = data.resetToken;
        clearInterval(countdownTimer);
        $("resetUsername").value = resetEmail;
        $("newPassword").value = "";
        $("confirmNewPassword").value = "";
        updateStrength("");
        showView("forgotNew");
    } catch {
        $("forgotCodeError").textContent = "Can't reach the server. Try again.";
    } finally {
        verifyingCode = false;
        setBusy(btn, false);
    }
});

/* ==========================================================================
   4. FORGOT PASSWORD — set new password
   ========================================================================== */
function updateStrength(val) {
    let score = 0;
    if (val.length >= MIN_PASSWORD) score++;
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    const level = score <= 1 ? "weak" : score <= 3 ? "medium" : "strong";
    $("strengthMeter").querySelectorAll("span").forEach((bar, i) => {
        bar.className = val && i < Math.max(score, 1) ? level : "";
    });
}

$("newPassword").addEventListener("input", (e) => {
    updateStrength(e.target.value);
    $("newPasswordError").textContent = "";
});
$("confirmNewPassword").addEventListener("input", () => ($("confirmNewPasswordError").textContent = ""));

$("forgotNewForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPassword = $("newPassword").value;
    const confirmPassword = $("confirmNewPassword").value;
    showAlert($("forgotNewAlert"), "");

    if (newPassword.length < MIN_PASSWORD) {
        $("newPasswordError").textContent = `Password must be at least ${MIN_PASSWORD} characters.`;
        return $("newPassword").focus();
    }
    if (newPassword !== confirmPassword) {
        $("confirmNewPasswordError").textContent = "Passwords do not match.";
        return $("confirmNewPassword").focus();
    }

    const btn = $("forgotNewBtn");
    setBusy(btn, true, "Updating…");
    try {
        const { ok, data } = await postJSON("/reset-password", {
            email: resetEmail,
            resetToken,
            newPassword,
            confirmPassword
        });
        if (!ok) {
            if (data.expired) {
                showAlert($("forgotEmailAlert"), data.message, "error");
                $("forgotEmail").value = resetEmail;
                return showView("forgotEmail");
            }
            if (data.field === "newPassword") $("newPasswordError").textContent = data.message;
            else if (data.field === "confirmPassword") $("confirmNewPasswordError").textContent = data.message;
            else showAlert($("forgotNewAlert"), data.message || "Couldn't update your password.");
            return;
        }

        clearSession();
        emailInput.value = resetEmail;
        passwordInput.value = "";
        resetToken = "";
        showView("forgotDone");
    } catch {
        showAlert($("forgotNewAlert"), "Can't reach the server. Try again.");
    } finally {
        setBusy(btn, false);
    }
});

$("backToLoginBtn").addEventListener("click", () => {
    showAlert(loginAlert, "Password updated — sign in with your new password.", "success");
    showView("login");
});
