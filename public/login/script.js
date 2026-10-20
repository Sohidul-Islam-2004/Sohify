// ==========================================
// 1. PASSWORD VISIBILITY TOGGLE
// ==========================================
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector("i");
    if (input.type === "password") {
        input.type = "text";
        icon.className = "fa-solid fa-eye-slash";
    } else {
        input.type = "password";
        icon.className = "fa-solid fa-eye";
    }
}

// ==========================================
// 2. DOM ELEMENTS
// ==========================================
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberCheckbox = document.getElementById("remember");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");

// Same-origin API (frontend served by Express)
const API_BASE = "/api/users";

// Clear error messages on input change
emailInput.addEventListener("input", () => (emailError.textContent = ""));
passwordInput.addEventListener("input", () => (passwordError.textContent = ""));

function clearErrors() {
    emailError.textContent = "";
    passwordError.textContent = "";
}

function showFieldError(field, message) {
    if (field === "email") emailError.textContent = message;
    else if (field === "password") passwordError.textContent = message;
    else alert(message);
}

// ==========================================
// 3. AUTO-FILL ON PAGE LOAD
// ==========================================
window.addEventListener("DOMContentLoaded", () => {
    const signupEmail = sessionStorage.getItem("sohify_signup_email");
    const rememberedEmail = localStorage.getItem("sohify_remember_email");

    if (signupEmail) {
        emailInput.value = signupEmail;
        passwordInput.focus();
        sessionStorage.removeItem("sohify_signup_email");
    } else if (rememberedEmail) {
        emailInput.value = rememberedEmail;
        rememberCheckbox.checked = true;
        passwordInput.focus();
    }
});

// ==========================================
// 4. AUTHENTICATE → CALL BACKEND API
// ==========================================
loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearErrors();

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    // --- Basic input checks ---
    if (!email) {
        emailError.textContent = "Please enter your email address.";
        return;
    }
    if (!password) {
        passwordError.textContent = "Please enter your password.";
        return;
    }

    // --- Loading state ---
    const submitBtn = loginForm.querySelector("button[type='submit']");
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in...";

    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            // Backend sends { field, message }
            showFieldError(data.field, data.message || "Login failed.");
            return;
        }

        // --- Remember Me ---
        if (rememberCheckbox.checked) {
            localStorage.setItem("sohify_remember_email", email);
        } else {
            localStorage.removeItem("sohify_remember_email");
        }

        // --- Active session ---
        sessionStorage.setItem("sohify_user", data.data.email);
        sessionStorage.setItem("sohify_username", data.data.name || data.data.email.split("@")[0]);
        sessionStorage.setItem("sohify_user_id", data.data.id);

        // Redirect to dashboard
        window.location.href = "../dash-board";

    } catch (err) {
        console.error("Login error:", err);
        alert("Network error. Please check your connection and try again.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});