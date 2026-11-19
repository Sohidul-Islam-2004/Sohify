/* ==========================================================================
   SOHIFY — LANDING PAGE
   ========================================================================== */

// Mobile menu
const mobileToggle = document.getElementById("mobileToggle");
const navLinks = document.getElementById("navLinks");

function setMenu(open) {
    navLinks.classList.toggle("open", open);
    mobileToggle.setAttribute("aria-expanded", String(open));
    mobileToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    mobileToggle.querySelector("i").className = open ? "fa-solid fa-xmark" : "fa-solid fa-bars";
}

if (mobileToggle && navLinks) {
    mobileToggle.addEventListener("click", () => setMenu(!navLinks.classList.contains("open")));
    navLinks.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
    document.addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));
}

// Show "Open player" instead of Log in / Sign up when already signed in
const signedIn = !!(localStorage.getItem("sohify_token") || sessionStorage.getItem("sohify_token"));
if (signedIn) {
    document.querySelectorAll("[data-guest]").forEach((el) => (el.hidden = true));
    document.querySelectorAll("[data-member]").forEach((el) => (el.hidden = false));
}

// Footer year
const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();
