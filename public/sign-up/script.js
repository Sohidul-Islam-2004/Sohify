function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector("i");
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    icon.className = isPassword ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
}

const signupForm = document.getElementById("signupForm");
const fullNameInput = document.getElementById("fullName");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const termsCheckbox = document.getElementById("terms");
const strengthMeter = document.getElementById("strengthMeter");

const nameError = document.getElementById("nameError");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const confirmPasswordError = document.getElementById("confirmPasswordError");

const API_BASE = "/api/users";
const MIN_PASSWORD = 8;

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
    if (passwordInput.value === confirmPasswordInput.value) confirmPasswordError.textContent = "";
});

emailInput.addEventListener("input", () => (emailError.textContent = ""));
fullNameInput.addEventListener("input", () => (nameError.textContent = ""));

function clearErrors() {
    nameError.textContent = "";
    emailError.textContent = "";
    passwordError.textContent = "";
    confirmPasswordError.textContent = "";
}

function showFieldError(field, message) {
    const map = {
        fullName: nameError,
        name: nameError,
        email: emailError,
        password: passwordError,
        confirmPassword: confirmPasswordError,
    };
    if (map[field]) map[field].textContent = message;
    else alert(message);
}

signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!fullName) return (nameError.textContent = "Please enter your full name.");
    if (!email) return (emailError.textContent = "Please enter an email address.");
    if (password.length < MIN_PASSWORD)
        return (passwordError.textContent = `Password must be at least ${MIN_PASSWORD} characters.`);
    if (password !== confirmPassword)
        return (confirmPasswordError.textContent = "Passwords do not match.");
    if (!termsCheckbox.checked) return alert("Please accept the Terms & Conditions to proceed.");

    const submitBtn = signupForm.querySelector("button[type='submit']");
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account...";

    try {
        const res = await fetch(`${API_BASE}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fullName, email, password, confirmPassword }),
        });

        const data = await res.json();

        if (!res.ok) {
            showFieldError(data.field, data.message || "Signup failed.");
            return;
        }

        localStorage.setItem("sohify_signup_email", email);
        localStorage.setItem("sohify_signup_name", fullName);
        window.location.href = "/Login";
    } catch (err) {
        console.error("Signup error:", err);
        alert("Network error. Please check your connection and try again.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});