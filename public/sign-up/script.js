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

// Clear email duplicate error on input change
emailInput.addEventListener("input", () => {
    emailError.textContent = "";
});

function clearErrors() {
    nameError.textContent = "";
    emailError.textContent = "";
    passwordError.textContent = "";
    confirmPasswordError.textContent = "";
}

// ==========================================
// 4. SIGNUP WITH LOCALSTORAGE
// ==========================================
signupForm.addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // --- Validation Rules ---
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

    // --- Retrieve Existing Users from localStorage ---
    const storedUsers = JSON.parse(localStorage.getItem("sohify_users")) || [];

    // Check if user already exists
    const userExists = storedUsers.some(user => user.email === email);
    if (userExists) {
        emailError.textContent = "An account with this email already exists.";
        return;
    }

    // --- Save New User in localStorage ---
    const newUser = {
        id: Date.now(),
        fullName: fullName,
        email: email,
        password: password, // Note: In production, never store raw passwords client-side
        registeredAt: new Date().toISOString()
    };

    storedUsers.push(newUser);
    localStorage.setItem("sohify_users", JSON.stringify(storedUsers));

    // Store signup info in sessionStorage for login pre-fill and dashboard display
    sessionStorage.setItem("sohify_signup_email", email);
    sessionStorage.setItem("sohify_signup_name", fullName);

    // Redirect to login page
    window.location.href = "../login";
});