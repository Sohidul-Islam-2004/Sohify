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

// Clear error messages on input change
emailInput.addEventListener("input", () => {
    emailError.textContent = "";
});

passwordInput.addEventListener("input", () => {
    passwordError.textContent = "";
});

function clearErrors() {
    emailError.textContent = "";
    passwordError.textContent = "";
}

// ==========================================
// 3. AUTO-FILL ON PAGE LOAD
// ==========================================
window.addEventListener("DOMContentLoaded", () => {
    // 1. Pre-fill from fresh signup redirect
    const signupEmail = sessionStorage.getItem("sohify_signup_email");
    
    // 2. Pre-fill from "Remember Me" localStorage persistence
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
// 4. AUTHENTICATE WITH LOCALSTORAGE
// ==========================================
loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    // --- Basic Input Checks ---
    if (!email) {
        emailError.textContent = "Please enter your email address.";
        return;
    }

    if (!password) {
        passwordError.textContent = "Please enter your password.";
        return;
    }

    // --- Fetch Users Array from localStorage ---
    const storedUsers = JSON.parse(localStorage.getItem("sohify_users")) || [];

    // Find account by email
    const user = storedUsers.find(u => u.email.toLowerCase() === email);

    if (!user) {
        emailError.textContent = "No account found with this email.";
        return;
    }

    // Validate password
    if (user.password !== password) {
        passwordError.textContent = "Incorrect password. Please try again.";
        return;
    }

    // --- Handle "Remember Me" ---
    if (rememberCheckbox.checked) {
        localStorage.setItem("sohify_remember_email", email);
    } else {
        localStorage.removeItem("sohify_remember_email");
    }

    // --- Set Active User Session ---
    sessionStorage.setItem("sohify_user", user.email);
    sessionStorage.setItem("sohify_username", user.fullName || user.email.split("@")[0]);

    // Redirect to Web Player Dashboard
    window.location.href = "..//dash-board";
});