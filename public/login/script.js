function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector("i");
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    icon.className = isPassword ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
}

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberCheckbox = document.getElementById("remember");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");

const API_BASE = "/api/users";

emailInput.addEventListener("input", () => (emailError.textContent = ""));
passwordInput.addEventListener("input", () => (passwordError.textContent = ""));

function showFieldError(field, message) {
    if (field === "email") emailError.textContent = message;
    else if (field === "password") passwordError.textContent = message;
    else alert(message);
}

window.addEventListener("DOMContentLoaded", () => {
    const signupEmail = localStorage.getItem("sohify_signup_email");
    const rememberedEmail = localStorage.getItem("sohify_remember_email");

    if (signupEmail) {
        emailInput.value = signupEmail;
        localStorage.removeItem("sohify_signup_email");
        localStorage.removeItem("sohify_signup_name");
    } else if (rememberedEmail) {
        emailInput.value = rememberedEmail;
        rememberCheckbox.checked = true;
    }
    passwordInput.focus();
});

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    emailError.textContent = "";
    passwordError.textContent = "";

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!email) return (emailError.textContent = "Please enter your email address.");
    if (!password) return (passwordError.textContent = "Please enter your password.");

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
            showFieldError(data.field, data.message || "Login failed.");
            return;
        }

       

        if (rememberCheckbox.checked) localStorage.setItem("sohify_remember_email", email);
        else localStorage.removeItem("sohify_remember_email");

        localStorage.setItem("sohify_token", data.token);
        localStorage.setItem("sohify_user", data.data.email);
        localStorage.setItem("sohify_username", data.data.name || data.data.email.split("@")[0]);
        localStorage.setItem("sohify_user_id", data.data.id);
        localStorage.setItem("sohify_is_admin", String(!!data.data.isAdmin));

        window.location.href = "/Dashboard";
    } catch (err) {
        console.error("Login error:", err);
        alert("Network error. Please check your connection and try again.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});