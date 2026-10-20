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
const signupForm = document.getElementById("signupForm");
const fullNameInput = document.getElementById("fullName");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const termsCheckbox = document.getElementById("terms");
const strengthMeter = document.getElementById("strengthMeter");

// Error display fields
const nameError = document.getElementById("nameError");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const confirmPasswordError = document.getElementById("confirmPasswordError");

// Relative API path — same origin as the page serving this file
const API_BASE = "/api/users";

// ==========================================
// 3. LIVE PASSWORD STRENGTH METER
// ==========================================
passwordInput.addEventListener("input", () => {
    const val = passwordInput.value;
    let score = 0;

    if (val.length >= 6) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    const bars = strengthMeter.querySelectorAll("span");
    bars.forEach((bar, i) => {
        bar.classList.remove("weak", "medium", "strong");
        if (i < score) {
            if (score <= 2) bar.classList.add("weak");
            else if (score === 3) bar.classList.add("medium");
            else bar.classList.add("strong");
        }
    });

    if (val.length >= 6) {
        passwordError.textContent = "";
    }
});

// Clear mismatch error on re-typing
confirmPasswordInput.addEventListener("input", () => {
    if (passwordInput.value === confirmPasswordInput.value) {
        confirmPasswordError.textContent = "";
    }
});

// Clear email error on input change
emailInput.addEventListener("input", () => {
    emailError.textContent = "";
});

// Clear name error on input change
fullNameInput.addEventListener("input", () => {
    nameError.textContent = "";
});

// ==========================================
// 4. HELPERS
// ==========================================
function clearErrors() {
    nameError.textContent = "";
    emailError.textContent = "";
    passwordError.textContent = "";
    confirmPasswordError.textContent = "";
}

function showFieldError(field, message) {
    switch (field) {
        case "fullName":
            nameError.textContent = message;
            break;
        case "email":
            emailError.textContent = message;
            break;
        case "password":
            passwordError.textContent = message;
            break;
        case "confirmPassword":
            confirmPasswordError.textContent = message;
            break;
        default:
            alert(message);
    }
}

// ==========================================
// 5. SIGNUP → CALL BACKEND API
// ==========================================
signupForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearErrors();

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // --- Client-side validation ---
    if (!fullName) {
        nameError.textContent = "Please enter your full name.";
        return;
    }

    if (!email) {
        emailError.textContent = "Please enter an email address.";
        return;
    }

    if (password.length < 6) {
        passwordError.textContent = "Password must be at least 6 characters.";
        return;
    }

    if (password !== confirmPassword) {
        confirmPasswordError.textContent = "Passwords do not match.";
        return;
    }

    if (!termsCheckbox.checked) {
        alert("Please accept the Terms & Conditions to proceed.");
        return;
    }

    // --- Send to backend ---
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
            // Backend returns { field, message }
            showFieldError(data.field, data.message || "Signup failed.");
            return;
        }

        // --- Success ---
        sessionStorage.setItem("sohify_signup_email", email);
        sessionStorage.setItem("sohify_signup_name", fullName);
        window.location.href = "../login";

    } catch (err) {
        console.error("Signup error:", err);
        alert("Network error. Please check your connection and try again.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});