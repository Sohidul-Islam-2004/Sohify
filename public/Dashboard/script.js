// ==========================================================================
// 1. CONFIGURATION: BACKEND API
// ==========================================================================
const API_BASE_URL = "/api";

// ==========================================================================
// 2. API HELPERS
// ==========================================================================
async function api(path, options = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.message || `Request failed (${res.status})`);
        err.field = data.field;
        err.status = res.status;
        throw err;
    }
    return data;
}

const jsonOpts = (method, body) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
});

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ==========================================================================
// 3. MAIN DASHBOARD APPLICATION
// ==========================================================================
document.addEventListener("DOMContentLoaded", async () => {

    const toastContainer = document.getElementById("toastContainer");
    function showToast(message, icon = "fa-circle-check") {
        if (!toastContainer) return;
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => toast.classList.add("show"), 10);
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 350);
        }, 2800);
    }

    const displayUserName = document.getElementById("displayUserName");
    const userAvatar = document.getElementById("userAvatar");
    const authBtn = document.getElementById("authBtn");
    const userProfileBtn = document.getElementById("userProfileBtn");
    const userInfoCard = document.getElementById("userInfoCard");

    const cardUserName = document.getElementById("cardUserName");
    const cardUserEmail = document.getElementById("cardUserEmail");
    const cardUserRole = document.getElementById("cardUserRole");
    const cardAvatarImg = document.getElementById("cardAvatarImg");
    const cardAvatarUploadBtn = document.getElementById("cardAvatarUploadBtn");
    const cardChangePasswordBtn = document.getElementById("cardChangePasswordBtn");
    const cardLogoutBtn = document.getElementById("cardLogoutBtn");
    const userAvatarInput = document.getElementById("userAvatarInput");
    const headerUploadBtn = document.getElementById("headerUploadBtn");

    const currentUserEmail = localStorage.getItem("sohify_user") || sessionStorage.getItem("sohify_user");
    const currentUserName = localStorage.getItem("sohify_username") || sessionStorage.getItem("sohify_username");
    const currentUserId = localStorage.getItem("sohify_user_id") || sessionStorage.getItem("sohify_user_id") || "guest";
    const isAdmin = (localStorage.getItem("sohify_is_admin") === "true") || (sessionStorage.getItem("sohify_is_admin") === "true");

    const isLoggedIn = () => !!currentUserId && currentUserId !== "guest" && !!currentUserEmail;

    if (isLoggedIn() && isAdmin) {
        if (headerUploadBtn) headerUploadBtn.style.display = "inline-flex";
    } else {
        if (headerUploadBtn) headerUploadBtn.style.display = "none";
    }

    const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop";
    let userAvatarUrl = DEFAULT_AVATAR;

    if (isLoggedIn()) {
        if (displayUserName) displayUserName.textContent = currentUserName || "Listener";
        if (cardUserName) cardUserName.textContent = currentUserName || "Listener";
        if (cardUserEmail) cardUserEmail.textContent = currentUserEmail;
        if (cardUserRole) {
            cardUserRole.textContent = isAdmin ? "Admin" : "Regular Listener";
            cardUserRole.className = `role-badge ${isAdmin ? "admin" : "listener"}`;
        }
        if (authBtn) authBtn.style.display = "none";
        if (cardChangePasswordBtn) cardChangePasswordBtn.style.display = "flex";
    } else {
        if (displayUserName) displayUserName.textContent = "Guest Listener";
        if (cardUserName) cardUserName.textContent = "Guest Listener";
        if (cardUserEmail) cardUserEmail.textContent = "Not signed in";
        if (cardUserRole) cardUserRole.textContent = "Guest";
        if (cardChangePasswordBtn) cardChangePasswordBtn.style.display = "none";
        if (cardLogoutBtn) cardLogoutBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> <span>Log In</span>`;
    }

    if (userAvatar) userAvatar.src = userAvatarUrl;
    if (cardAvatarImg) cardAvatarImg.src = userAvatarUrl;

    userProfileBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        userProfileBtn.classList.toggle("active");
        userInfoCard?.classList.toggle("open");
        updateUserCardStats();
    });

    document.addEventListener("click", (e) => {
        if (userInfoCard && userInfoCard.classList.contains("open")) {
            if (!userInfoCard.contains(e.target) && !userProfileBtn?.contains(e.target)) {
                userInfoCard.classList.remove("open");
                userProfileBtn?.classList.remove("active");
            }
        }
    });

    cardAvatarUploadBtn?.addEventListener("click", () => {
        if (!requireLogin("Please log in to change your profile picture")) return;
        userAvatarInput?.click();
    });

    userAvatarInput?.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file || !file.type.startsWith("image/")) return;
        if (!requireLogin("Please log in to change your picture")) return;

        try {
            const formData = new FormData();
            formData.append("avatar", file);
            const data = await api(`/users/${currentUserId}/avatar`, { method: "POST", body: formData });
            userAvatarUrl = data.avatarUrl;
            if (userAvatar) userAvatar.src = userAvatarUrl;
            if (cardAvatarImg) cardAvatarImg.src = userAvatarUrl;
            const plCreatorAvatar = document.getElementById("plCreatorAvatar");
            if (plCreatorAvatar) plCreatorAvatar.src = userAvatarUrl;
            showToast("Profile picture updated!", "fa-camera");
        } catch (err) {
            showToast(err.message || "Avatar upload failed", "fa-triangle-exclamation");
        }
    });

    cardLogoutBtn?.addEventListener("click", () => {
        if (!isLoggedIn()) {
            window.location.href = "/Login";
            return;
        }
        localStorage.removeItem("sohify_user");
        localStorage.removeItem("sohify_username");
        localStorage.removeItem("sohify_user_id");
        localStorage.removeItem("sohify_is_admin");
        localStorage.removeItem("sohify_token");

        sessionStorage.clear();
        showToast("Logged out successfully");
        setTimeout(() => { window.location.href = "/Login"; }, 500);
    });

    // --- B2. Change Password Modal (Requires Old Password Confirmation) ----
    const changePasswordModal = document.getElementById("changePasswordModal");
    const closeChangePasswordModalBtn = document.getElementById("closeChangePasswordModalBtn");
    const cancelChangePasswordBtn = document.getElementById("cancelChangePasswordBtn");
    const verifyIdentityBtn = document.getElementById("verifyIdentityBtn");
    const cpBackToVerifyBtn = document.getElementById("cpBackToVerifyBtn");
    const confirmChangePasswordBtn = document.getElementById("confirmChangePasswordBtn");

    const cpAccountEmail = document.getElementById("cpAccountEmail");
    const cpAlertBanner = document.getElementById("cpAlertBanner");
    const cpStepVerify = document.getElementById("cpStepVerify");
    const cpStepNew = document.getElementById("cpStepNew");
    const cpFooterStep1 = document.getElementById("cpFooterStep1");
    const cpFooterStep2 = document.getElementById("cpFooterStep2");
    const cpStepBadge1 = document.getElementById("cpStepBadge1");
    const cpStepBadge2 = document.getElementById("cpStepBadge2");
    const cpStepLine = document.getElementById("cpStepLine");

    const cpOldPassword = document.getElementById("cpOldPassword");
    const cpNewPassword = document.getElementById("cpNewPassword");
    const cpConfirmPassword = document.getElementById("cpConfirmPassword");
    const cpOldPasswordError = document.getElementById("cpOldPasswordError");
    const cpNewPasswordError = document.getElementById("cpNewPasswordError");
    const cpConfirmPasswordError = document.getElementById("cpConfirmPasswordError");
    const cpStrengthFill = document.getElementById("cpStrengthFill");
    const cpStrengthText = document.getElementById("cpStrengthText");

    let verifiedOldPassword = "";

    function showCpAlert(message = "", type = "error") {
        if (!cpAlertBanner) return;
        if (!message) {
            cpAlertBanner.style.display = "none";
            cpAlertBanner.textContent = "";
            cpAlertBanner.className = "cp-alert";
            return;
        }
        cpAlertBanner.className = `cp-alert ${type}`;
        cpAlertBanner.textContent = message;
        cpAlertBanner.style.display = "block";
    }

    function clearCpErrors() {
        if (cpOldPasswordError) cpOldPasswordError.textContent = "";
        if (cpNewPasswordError) cpNewPasswordError.textContent = "";
        if (cpConfirmPasswordError) cpConfirmPasswordError.textContent = "";
        showCpAlert("");
    }

    function resetPasswordVisibilityToggles() {
        changePasswordModal?.querySelectorAll(".btn-toggle-pw").forEach((btn) => {
            const targetId = btn.dataset.target;
            const input = targetId ? document.getElementById(targetId) : null;
            if (input) input.type = "password";
            const icon = btn.querySelector("i");
            if (icon) icon.className = "fa-solid fa-eye";
        });
    }

    function updatePasswordStrength(pw) {
        if (!cpStrengthFill || !cpStrengthText) return;
        if (!pw) {
            cpStrengthFill.style.width = "0%";
            cpStrengthFill.style.background = "transparent";
            cpStrengthText.textContent = "Use at least 8 characters with letters & numbers";
            cpStrengthText.style.color = "var(--text-muted)";
            return;
        }
        if (pw.length < 8) {
            cpStrengthFill.style.width = "25%";
            cpStrengthFill.style.background = "#ff2a85";
            cpStrengthText.textContent = `Too short (${pw.length}/8 characters minimum)`;
            cpStrengthText.style.color = "#ff6ba9";
            return;
        }
        let score = 1;
        if (pw.length >= 12) score++;
        if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
        if (/\d/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;

        if (score <= 2) {
            cpStrengthFill.style.width = "55%";
            cpStrengthFill.style.background = "#38bdf8";
            cpStrengthText.textContent = "Fair password strength";
            cpStrengthText.style.color = "#38bdf8";
        } else if (score === 3) {
            cpStrengthFill.style.width = "80%";
            cpStrengthFill.style.background = "#9d4edd";
            cpStrengthText.textContent = "Good password strength";
            cpStrengthText.style.color = "#c084fc";
        } else {
            cpStrengthFill.style.width = "100%";
            cpStrengthFill.style.background = "linear-gradient(90deg, #00f5d4, #38bdf8)";
            cpStrengthText.textContent = "Strong neon-grade password";
            cpStrengthText.style.color = "#00f5d4";
        }
    }

    function setChangePasswordStep(step) {
        clearCpErrors();
        const isStep2 = step === 2 && !!verifiedOldPassword;

        if (cpStepVerify) cpStepVerify.style.display = isStep2 ? "none" : "block";
        if (cpStepNew) cpStepNew.style.display = isStep2 ? "block" : "none";
        if (cpFooterStep1) cpFooterStep1.style.display = isStep2 ? "none" : "flex";
        if (cpFooterStep2) cpFooterStep2.style.display = isStep2 ? "flex" : "none";

        if (cpStepBadge1) {
            cpStepBadge1.classList.toggle("active", !isStep2);
            cpStepBadge1.classList.toggle("done", isStep2);
        }
        if (cpStepLine) cpStepLine.classList.toggle("done", isStep2);
        if (cpStepBadge2) cpStepBadge2.classList.toggle("active", isStep2);

        setTimeout(() => {
            if (isStep2) cpNewPassword?.focus();
            else cpOldPassword?.focus();
        }, 60);
    }

    function openChangePasswordModal() {
        if (!requireLogin("Please log in to change your password")) return;
        userInfoCard?.classList.remove("open");
        userProfileBtn?.classList.remove("active");

        verifiedOldPassword = "";
        if (cpOldPassword) cpOldPassword.value = "";
        if (cpNewPassword) cpNewPassword.value = "";
        if (cpConfirmPassword) cpConfirmPassword.value = "";
        if (cpAccountEmail) cpAccountEmail.textContent = currentUserEmail || "";
        resetPasswordVisibilityToggles();
        updatePasswordStrength("");
        setChangePasswordStep(1);
        changePasswordModal?.classList.add("active");
    }

    function closeChangePasswordModal() {
        changePasswordModal?.classList.remove("active");
        verifiedOldPassword = "";
        if (cpOldPassword) cpOldPassword.value = "";
        if (cpNewPassword) cpNewPassword.value = "";
        if (cpConfirmPassword) cpConfirmPassword.value = "";
        resetPasswordVisibilityToggles();
        updatePasswordStrength("");
        clearCpErrors();
    }

    async function verifyCurrentPasswordIdentity() {
        clearCpErrors();
        const oldPass = cpOldPassword?.value || "";
        if (!oldPass) {
            if (cpOldPasswordError) cpOldPasswordError.textContent = "Please enter your current password.";
            cpOldPassword?.focus();
            return;
        }

        if (verifyIdentityBtn) {
            verifyIdentityBtn.disabled = true;
            verifyIdentityBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verifying...`;
        }

        try {
            await api(`/users/${encodeURIComponent(currentUserId)}/verify-password`, jsonOpts("POST", {
                oldPassword: oldPass,
                email: currentUserEmail
            }));
            verifiedOldPassword = oldPass;
            setChangePasswordStep(2);
        } catch (err) {
            const msg = err.message || "Current password is incorrect.";
            if (cpOldPasswordError) cpOldPasswordError.textContent = msg;
            else showCpAlert(msg, "error");
            cpOldPassword?.focus();
            cpOldPassword?.select();
        } finally {
            if (verifyIdentityBtn) {
                verifyIdentityBtn.disabled = false;
                verifyIdentityBtn.innerHTML = `<i class="fa-solid fa-user-check"></i> Confirm Identity`;
            }
        }
    }

    async function submitChangePassword() {
        clearCpErrors();
        if (!verifiedOldPassword) {
            setChangePasswordStep(1);
            showCpAlert("Please confirm your current password first.", "error");
            return;
        }

        const newPassword = cpNewPassword?.value || "";
        const confirmPassword = cpConfirmPassword?.value || "";

        if (newPassword.length < 8) {
            if (cpNewPasswordError) cpNewPasswordError.textContent = "New password must be at least 8 characters.";
            cpNewPassword?.focus();
            return;
        }
        if (newPassword === verifiedOldPassword) {
            if (cpNewPasswordError) cpNewPasswordError.textContent = "New password must be different from your current password.";
            cpNewPassword?.focus();
            return;
        }
        if (newPassword !== confirmPassword) {
            if (cpConfirmPasswordError) cpConfirmPasswordError.textContent = "New passwords do not match.";
            cpConfirmPassword?.focus();
            return;
        }

        if (confirmChangePasswordBtn) {
            confirmChangePasswordBtn.disabled = true;
            confirmChangePasswordBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating...`;
        }

        try {
            await api(`/users/${encodeURIComponent(currentUserId)}/change-password`, jsonOpts("POST", {
                oldPassword: verifiedOldPassword,
                newPassword,
                confirmPassword,
                email: currentUserEmail
            }));
            closeChangePasswordModal();
            showToast("Password changed successfully!", "fa-shield-halved");
        } catch (err) {
            const msg = err.message || "Failed to update password.";
            if (err.field === "oldPassword") {
                verifiedOldPassword = "";
                setChangePasswordStep(1);
                if (cpOldPasswordError) cpOldPasswordError.textContent = msg;
            } else if (err.field === "confirmPassword") {
                if (cpConfirmPasswordError) cpConfirmPasswordError.textContent = msg;
            } else if (err.field === "newPassword") {
                if (cpNewPasswordError) cpNewPasswordError.textContent = msg;
            } else {
                showCpAlert(msg, "error");
            }
        } finally {
            if (confirmChangePasswordBtn) {
                confirmChangePasswordBtn.disabled = false;
                confirmChangePasswordBtn.innerHTML = `<i class="fa-solid fa-key"></i> Update Password`;
            }
        }
    }

    cardChangePasswordBtn?.addEventListener("click", openChangePasswordModal);
    closeChangePasswordModalBtn?.addEventListener("click", closeChangePasswordModal);
    cancelChangePasswordBtn?.addEventListener("click", closeChangePasswordModal);
    changePasswordModal?.addEventListener("click", (e) => {
        if (e.target === changePasswordModal) closeChangePasswordModal();
    });
    verifyIdentityBtn?.addEventListener("click", verifyCurrentPasswordIdentity);
    cpBackToVerifyBtn?.addEventListener("click", () => {
        verifiedOldPassword = "";
        if (cpNewPassword) cpNewPassword.value = "";
        if (cpConfirmPassword) cpConfirmPassword.value = "";
        updatePasswordStrength("");
        setChangePasswordStep(1);
    });
    confirmChangePasswordBtn?.addEventListener("click", submitChangePassword);

    cpOldPassword?.addEventListener("input", clearCpErrors);
    cpNewPassword?.addEventListener("input", () => {
        clearCpErrors();
        updatePasswordStrength(cpNewPassword.value);
    });
    cpConfirmPassword?.addEventListener("input", clearCpErrors);

    cpOldPassword?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            verifyCurrentPasswordIdentity();
        }
    });
    [cpNewPassword, cpConfirmPassword].forEach((input) => {
        input?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                submitChangePassword();
            }
        });
    });

    changePasswordModal?.querySelectorAll(".btn-toggle-pw").forEach((btn) => {
        btn.addEventListener("click", () => {
            const targetId = btn.dataset.target;
            const input = targetId ? document.getElementById(targetId) : null;
            if (!input) return;
            const isHidden = input.type === "password";
            input.type = isHidden ? "text" : "password";
            const icon = btn.querySelector("i");
            if (icon) icon.className = isHidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
        });
    });

    function updateUserCardStats() {
        const likedCount = TRACKS.filter(t => t.liked).length;
        const localCount = TRACKS.filter(t => t.isLocal).length;
        const plCount = playlists.length;
        const elLiked = document.getElementById("cardStatLiked");
        const elLocal = document.getElementById("cardStatLocal");
        const elPl = document.getElementById("cardStatPlaylists");
        if (elLiked) elLiked.textContent = likedCount;
        if (elLocal) elLocal.textContent = localCount;
        if (elPl) elPl.textContent = plCount;
    }

    // --- C/D. Likes, Recents & Playlists -----------------------------------
    let playlists = [];
    let initialRecent = [];

    function requireLogin(msg = "Please log in to use this feature") {
        if (isLoggedIn()) return true;
        showToast(msg, "fa-lock");
        return false;
    }

    const DEFAULT_COVER = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop";
    let TRACKS = [];

    function mapSong(s) {
        return {
            id: String(s._id),
            userId: s.uploadedBy ? String(s.uploadedBy) : null,
            title: s.title,
            artist: s.artist,
            album: s.album || "Cloud Catalog",
            duration: s.duration || "--:--",
            cover: s.coverUrl || DEFAULT_COVER,
            src: s.audioUrl,
            liked: false,
            isLocal: !!s.isPrivate
        };
    }

    async function fetchSongs() {
        try {
            const q = isLoggedIn() ? `?userId=${encodeURIComponent(currentUserId)}` : "";
            const songs = await api(`/songs${q}`);
            TRACKS = Array.isArray(songs) ? songs.map(mapSong) : [];
        } catch (err) {
            console.error("Failed to load songs:", err);
            showToast("Could not load songs from the server", "fa-triangle-exclamation");
        }
    }

    async function loadLibrary() {
        if (!isLoggedIn()) return;
        try {
            const lib = await api(`/users/${currentUserId}/library`);
            const liked = new Set(lib.likedSongs || []);
            const localSet = new Set(lib.localSongs || []);
            TRACKS.forEach(t => {
                t.liked = liked.has(t.id);
                if (localSet.has(t.id)) t.isLocal = true;
            });
            initialRecent = lib.recentSongs || [];
            
            // Map Library Playlists, assigning isOwned to true for our own playlists
            playlists = (lib.playlists || []).map(p => ({
                id: String(p._id),
                name: p.name,
                description: p.description || "",
                isPrivate: p.isPrivate !== false,
                coverUrl: p.coverUrl || "",
                trackIds: (p.songs || []).map(String),
                isOwned: true
            }));

            if (lib.avatarUrl) {
                userAvatarUrl = lib.avatarUrl;
                if (userAvatar) userAvatar.src = userAvatarUrl;
                if (cardAvatarImg) cardAvatarImg.src = userAvatarUrl;
            }
        } catch (err) {
            console.error("Failed to load library:", err);
            showToast("Could not load your library", "fa-triangle-exclamation");
        }
    }

    // --- E. Dynamic Home Screen Rendering ----------------------------------
    let heroTrack = null;

    const CURATED_MIXES = [
        {
            id: "mix-cyberpunk",
            title: "Cyberpunk 2099 Night Drive",
            tag: "Darksynth",
            subtitle: "Futuristic basslines, neon arpeggios & cyber beats",
            bg: "linear-gradient(135deg, #ff2a85 0%, #9d4edd 52%, #1d4ed8 100%)",
            filterMood: "synth"
        },
        {
            id: "mix-lofi",
            title: "Midnight Lofi Study",
            tag: "Chill Vibe",
            subtitle: "Soft tape crackle, gentle chords & calm textures",
            bg: "linear-gradient(135deg, #38bdf8 0%, #6366f1 55%, #9d4edd 100%)",
            filterMood: "chill"
        },
        {
            id: "mix-workout",
            title: "High Voltage Power",
            tag: "Bass Heavy",
            subtitle: "Maximum BPM drop, heavy sub-bass & power flow",
            bg: "linear-gradient(135deg, #00f5d4 0%, #0ea5e9 52%, #0f172a 100%)",
            filterMood: "trending"
        },
        {
            id: "mix-focus",
            title: "Deep Ambient Spatial Flow",
            tag: "Spatial Flow",
            subtitle: "Ethereal pads, acoustic depth & mind concentration",
            bg: "linear-gradient(135deg, #9d4edd 0%, #ff2a85 52%, #090a1a 100%)",
            filterMood: "all"
        }
    ];

    function renderHomeSections() {
        const publicTracks = TRACKS.filter(t => !t.isLocal);

        const latestGrid = document.getElementById("latestUploadsGrid");
        const heroBanner = document.getElementById("heroBanner");
        const homeRecentSection = document.getElementById("homeRecentSection");
        const homeRecentGrid = document.getElementById("homeRecentGrid");
        const curatedMixesGrid = document.getElementById("curatedMixesGrid");
        const catalogHeading = document.getElementById("catalogSectionHeading");
        const catalogPill = document.getElementById("catalogCountPill");

        if (publicTracks.length === 0 && TRACKS.length === 0) {
            if (latestGrid) latestGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p>No tracks on the server yet. Click "Import Local Song" or Upload Audio to begin!</p></div>`;
            if (heroBanner) heroBanner.style.display = "none";
            return;
        }

        // 1. Hero Recommendation
        if (heroBanner) {
            heroBanner.style.display = "block";
            heroTrack = publicTracks.length > 0
                ? publicTracks[Math.floor(Math.random() * publicTracks.length)]
                : TRACKS[0];

            if (heroTrack) {
                heroBanner.style.backgroundImage = `linear-gradient(135deg, rgba(5, 5, 11, 0.92) 0%, rgba(28, 12, 56, 0.8) 55%, rgba(0, 245, 212, 0.25) 100%), url('${escapeHtml(heroTrack.cover)}')`;
                heroBanner.style.backgroundSize = "cover";
                heroBanner.style.backgroundPosition = "center";
                document.getElementById("heroTitle").textContent = heroTrack.title;
                document.getElementById("heroDesc").textContent = `Recommended for you: ${heroTrack.artist} • ${heroTrack.album || 'Cloud Catalog'}`;
            }
        }

        // 2. Jump Back In / Recently Played
        if (state.recentPlayed.length > 0 && homeRecentSection && homeRecentGrid) {
            const recentTracks = state.recentPlayed
                .map(id => TRACKS.find(t => String(t.id) === String(id)))
                .filter(Boolean)
                .slice(0, 6);

            if (recentTracks.length > 0) {
                homeRecentSection.style.display = "block";
                homeRecentGrid.innerHTML = recentTracks.map(t => createCardHTML(t)).join("");
                attachCardListeners(homeRecentGrid);
            } else {
                homeRecentSection.style.display = "none";
            }
        } else if (homeRecentSection) {
            homeRecentSection.style.display = "none";
        }

        // 3. Filtered Catalog based on Active Mood Pill
        let displayTracks = publicTracks;
        const mood = state.activeMood || "all";

        if (mood === "trending") {
            displayTracks = [...publicTracks].slice(0, 8);
            if (catalogHeading) catalogHeading.textContent = "Trending Right Now";
            if (catalogPill) catalogPill.textContent = "Top Streams";
        } else if (mood === "synth") {
            displayTracks = publicTracks.filter(t => /synth|cyber|electro|edm|neon|club|dance/i.test(`${t.title} ${t.artist} ${t.album}`));
            if (displayTracks.length === 0) displayTracks = publicTracks.slice(0, 6);
            if (catalogHeading) catalogHeading.textContent = "Synthwave & Electronic";
            if (catalogPill) catalogPill.textContent = "Cyber Sound";
        } else if (mood === "chill") {
            displayTracks = publicTracks.filter(t => /chill|lofi|relax|soft|ambient|night|flow|sleep/i.test(`${t.title} ${t.artist} ${t.album}`));
            if (displayTracks.length === 0) displayTracks = publicTracks.slice(0, 6);
            if (catalogHeading) catalogHeading.textContent = "Chill & Lofi Vibes";
            if (catalogPill) catalogPill.textContent = "Mellow";
        } else if (mood === "acoustic") {
            displayTracks = publicTracks.filter(t => /acoustic|guitar|folk|piano|unplugged/i.test(`${t.title} ${t.artist} ${t.album}`));
            if (displayTracks.length === 0) displayTracks = publicTracks.slice(0, 6);
            if (catalogHeading) catalogHeading.textContent = "Acoustic & Warm Melodies";
            if (catalogPill) catalogPill.textContent = "Unplugged";
        } else if (mood === "favorites") {
            displayTracks = TRACKS.filter(t => t.liked);
            if (catalogHeading) catalogHeading.textContent = "Your Liked Favorites";
            if (catalogPill) catalogPill.textContent = `${displayTracks.length} Saved`;
        } else if (mood === "local") {
            displayTracks = TRACKS.filter(t => t.isLocal);
            if (catalogHeading) catalogHeading.textContent = "Private Audio Vault";
            if (catalogPill) catalogPill.textContent = `${displayTracks.length} Private`;
        } else {
            if (catalogHeading) catalogHeading.textContent = "Latest Server Uploads";
            if (catalogPill) catalogPill.textContent = `${publicTracks.length} Tracks`;
        }

        if (latestGrid) {
            if (displayTracks.length === 0) {
                latestGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p>No songs found for this mood.</p></div>`;
            } else {
                latestGrid.innerHTML = displayTracks.map(t => createCardHTML(t)).join("");
                attachCardListeners(latestGrid);
            }
        }

        // 4. Curated Mixes
        if (curatedMixesGrid && curatedMixesGrid.children.length === 0) {
            curatedMixesGrid.innerHTML = CURATED_MIXES.map(mix => `
                <div class="mix-card" style="background: ${mix.bg};" data-mix-id="${escapeHtml(mix.id)}">
                    <div class="mix-content">
                        <span class="mix-tag">${escapeHtml(mix.tag)}</span>
                        <h4 class="mix-title">${escapeHtml(mix.title)}</h4>
                        <p class="mix-subtitle">${escapeHtml(mix.subtitle)}</p>
                    </div>
                    <button class="mix-play-btn" title="Play ${escapeHtml(mix.title)}">
                        <i class="fa-solid fa-play"></i>
                    </button>
                </div>
            `).join("");

            curatedMixesGrid.querySelectorAll(".mix-card").forEach(card => {
                card.addEventListener("click", () => {
                    const mixId = card.dataset.mixId;
                    const mix = CURATED_MIXES.find(m => m.id === mixId);
                    if (!mix) return;

                    // Queue tracks matching this mood
                    let matched = TRACKS.filter(t => !t.isLocal);
                    if (mix.filterMood === "synth") {
                        matched = matched.filter(t => /synth|cyber|electro|neon|beat/i.test(`${t.title} ${t.artist}`));
                    } else if (mix.filterMood === "chill") {
                        matched = matched.filter(t => /chill|lofi|guitar|soft/i.test(`${t.title} ${t.artist}`));
                    }
                    if (matched.length === 0) matched = TRACKS.filter(t => !t.isLocal);

                    if (matched.length > 0) {
                        const firstIdx = TRACKS.findIndex(t => String(t.id) === String(matched[0].id));
                        state.queue = matched.slice(1).map(t => t.id);
                        renderQueue();
                        loadTrack(firstIdx !== -1 ? firstIdx : 0, true);
                        showToast(`Playing "${mix.title}" mix! 🎧`, "fa-play");
                    } else {
                        showToast("Add songs to start this mix", "fa-circle-info");
                    }
                });
            });
        }
    }

    function createCardHTML(t) {
        return `
            <div class="music-card" data-track-id="${escapeHtml(t.id)}">
                <div class="card-thumb">
                    <img src="${escapeHtml(t.cover)}" alt="${escapeHtml(t.title)}">
                    <button class="play-float-btn" title="Play"><i class="fa-solid fa-play"></i></button>
                </div>
                <h4 class="card-name">${escapeHtml(t.title)}</h4>
                <p class="card-desc">${escapeHtml(t.artist)} ${t.isLocal ? '• <span style="color: var(--accent-green);">Private</span>' : ''}</p>
            </div>
        `;
    }

    function attachCardListeners(container) {
        container.querySelectorAll(".music-card").forEach(card => {
            card.addEventListener("click", () => {
                const trackId = card.dataset.trackId;
                const idx = TRACKS.findIndex(t => String(t.id) === String(trackId));
                if (idx !== -1) {
                    if (idx === state.currentTrackIndex && audio.src) {
                        togglePlayPause();
                    } else {
                        loadTrack(idx, true);
                    }
                }
            });
        });
    }

    // --- F. Audio Player State & References --------------------------------
    const audio = document.getElementById("audioElement");
    if (audio) {
        audio.crossOrigin = "anonymous";
    }

    const state = {
        currentTrackIndex: 0,
        isPlaying: false,
        isShuffle: false,
        repeatMode: "none",
        volume: 0.7,
        isMuted: false,
        previousVolume: 0.7,
        activeFilter: "all",
        activePlaylistId: null,
        queue: [],
        recentPlayed: initialRecent,
        isCloudUploadMode: false,
        playbackSpeed: 1.0,
        activeMood: "all",
        sleepTimer: { intervalId: null, targetTimestamp: null, endOfTrack: false }
    };

    const currentCover = document.getElementById("currentCover");
    const currentTitle = document.getElementById("currentTitle");
    const currentArtist = document.getElementById("currentArtist");
    const playerLikeBtn = document.getElementById("playerLikeBtn");

    const sheetCover = document.getElementById("sheetCover");
    const sheetTitle = document.getElementById("sheetTitle");
    const sheetArtist = document.getElementById("sheetArtist");
    const sheetLikeBtn = document.getElementById("sheetLikeBtn");

    const currentTimeLbl = document.getElementById("currentTimeLbl");
    const durationLbl = document.getElementById("durationLbl");
    const progressSlider = document.getElementById("progressSlider");
    const progressFill = document.getElementById("progressFill");
    const mobileTopProgressFill = document.getElementById("mobileTopProgressFill");

    const volumeSlider = document.getElementById("volumeSlider");
    const volumeFill = document.getElementById("volumeFill");
    const volumeIcon = document.getElementById("volumeIcon");

    const sheetProgressSlider = document.getElementById("sheetProgressSlider");
    const sheetProgressFill = document.getElementById("sheetProgressFill");
    const sheetCurrentTime = document.getElementById("sheetCurrentTime");
    const sheetDuration = document.getElementById("sheetDuration");
    const sheetVolumeSlider = document.getElementById("sheetVolumeSlider");
    const sheetVolumeFill = document.getElementById("sheetVolumeFill");
    const sheetVolMuteIcon = document.getElementById("sheetVolMuteIcon");

    const shuffleBtn = document.getElementById("shuffleBtn");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const repeatBtn = document.getElementById("repeatBtn");

    const sheetShuffleBtn = document.getElementById("sheetShuffleBtn");
    const sheetPrevBtn = document.getElementById("sheetPrevBtn");
    const sheetNextBtn = document.getElementById("sheetNextBtn");
    const sheetRepeatBtn = document.getElementById("sheetRepeatBtn");

    const soundWave = document.getElementById("soundWave");
    const sheetSoundWave = document.getElementById("sheetSoundWave");

    const trackList = document.getElementById("trackList");
    const tracklistHeading = document.getElementById("tracklistHeading");
    const viewFilterPill = document.getElementById("viewFilterPill");
    const deleteCurrentPlaylistBtn = document.getElementById("deleteCurrentPlaylistBtn");
    const likedCountBadge = document.getElementById("likedCountBadge");
    const localCountBadge = document.getElementById("localCountBadge");
    const playlistNavList = document.getElementById("playlistNavList");

    const queuePanel = document.getElementById("queuePanel");
    const queueBtn = document.getElementById("queueBtn");
    const sheetQueueBtn = document.getElementById("sheetQueueBtn");
    const queueCloseBtn = document.getElementById("queueCloseBtn");
    const clearQueueBtn = document.getElementById("clearQueueBtn");
    const queueList = document.getElementById("queueList");

    const sidebarUploadBtn = document.getElementById("sidebarUploadBtn");
    const dropOverlay = document.getElementById("dropOverlay");

    // Enlarged Cover Modal & Status Controls Elements
    const coverExpandedModal = document.getElementById("coverExpandedModal");
    const coverModalBackdrop = document.getElementById("coverModalBackdrop");
    const coverMinimizeBtn = document.getElementById("coverMinimizeBtn");
    const expandedCloseBtn = document.getElementById("expandedCloseBtn");
    const expandedCoverImg = document.getElementById("expandedCoverImg");
    const expandedCoverTitle = document.getElementById("expandedCoverTitle");
    const expandedCoverArtist = document.getElementById("expandedCoverArtist");

    const expandedShuffleBtn = document.getElementById("expandedShuffleBtn");
    const expandedPrevBtn = document.getElementById("expandedPrevBtn");
    const expandedNextBtn = document.getElementById("expandedNextBtn");
    const expandedRepeatBtn = document.getElementById("expandedRepeatBtn");
    const expandedCurrentTime = document.getElementById("expandedCurrentTime");
    const expandedDuration = document.getElementById("expandedDuration");
    const expandedProgressSlider = document.getElementById("expandedProgressSlider");
    const expandedProgressFill = document.getElementById("expandedProgressFill");

    // Upload Modal Elements
    const uploadSongModal = document.getElementById("uploadSongModal");
    const uploadModalTitle = document.getElementById("uploadModalTitle");
    const closeUploadModalBtn = document.getElementById("closeUploadModalBtn");
    const cancelUploadBtn = document.getElementById("cancelUploadBtn");
    const confirmUploadBtn = document.getElementById("confirmUploadBtn");

    const chooseAudioBtn = document.getElementById("chooseAudioBtn");
    const songAudioInput = document.getElementById("songAudioInput");
    const audioFileNameDisplay = document.getElementById("audioFileNameDisplay");

    const coverPreviewBox = document.getElementById("coverPreviewBox");
    const chooseCoverBtn = document.getElementById("chooseCoverBtn");
    const songCoverInput = document.getElementById("songCoverInput");
    const uploadCoverPreview = document.getElementById("uploadCoverPreview");

    const uploadSongTitle = document.getElementById("uploadSongTitle");
    const uploadSongArtist = document.getElementById("uploadSongArtist");
    const uploadSongAlbum = document.getElementById("uploadSongAlbum");

    let currentSelectedAudioFile = null;
    let currentSelectedCoverFile = null;
    let currentSelectedCoverData = DEFAULT_COVER;

    // Create & Add Playlist Modal Elements
    const createPlaylistModal = document.getElementById("createPlaylistModal");
    const createPlaylistBtn = document.getElementById("createPlaylistBtn");
    const closeCreateModalBtn = document.getElementById("closeCreateModalBtn");
    const cancelCreatePlaylistBtn = document.getElementById("cancelCreatePlaylistBtn");
    const confirmCreatePlaylistBtn = document.getElementById("confirmCreatePlaylistBtn");
    const newPlaylistName = document.getElementById("newPlaylistName");

    const addToPlaylistModal = document.getElementById("addToPlaylistModal");
    const closeAddModalBtn = document.getElementById("closeAddModalBtn");
    const modalPlaylistOptions = document.getElementById("modalPlaylistOptions");
    const addToPlaylistSongTitle = document.getElementById("addToPlaylistSongTitle");

    let songTargetForPlaylist = null;

    // --- G. Utility: Format Seconds to MM:SS --------------------------------
    function formatTime(sec) {
        if (isNaN(sec) || !isFinite(sec)) return "0:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? "0" : ""}${s}`;
    }

    // --- H. Sound Wave Animation & Icon Sync --------------------------------
    function updateSoundWaveState() {
        const isAnim = state.isPlaying;
        [soundWave, sheetSoundWave].forEach(sw => {
            if (sw) sw.classList.toggle("playing", isAnim);
        });
    }

    function updatePlayPauseIcons() {
        // Change icon to spin if waiting
        const isWaiting = audio.readyState < 3 && !audio.paused && audio.src;

        document.querySelectorAll(".playPauseBtn").forEach(btn => {
            const icon = btn.querySelector("i");
            if (icon) {
                if (isWaiting) {
                    icon.className = "fa-solid fa-spinner fa-spin";
                } else {
                    icon.className = state.isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
                }
            }
        });

        const plBigPlayBtn = document.getElementById("plBigPlayBtn");
        if (plBigPlayBtn) {
            const icon = plBigPlayBtn.querySelector("i");
            const isPlayingThisPl = state.isPlaying && state.activeFilter === "playlist";
            if (icon) {
                if (isWaiting && isPlayingThisPl) {
                    icon.className = "fa-solid fa-spinner fa-spin";
                } else {
                    icon.className = isPlayingThisPl ? "fa-solid fa-pause" : "fa-solid fa-play";
                }
            }
        }

        updateSoundWaveState();
    }

    function updateBadgeCounts() {
        const likedCount = TRACKS.filter(t => t.liked).length;
        const localCount = TRACKS.filter(t => t.isLocal).length;
        if (likedCountBadge) likedCountBadge.textContent = likedCount;
        if (localCountBadge) localCountBadge.textContent = localCount;
        updateUserCardStats();
    }

    // --- I. Enlarged Artwork & Status Controls Logic -----------------------
    function openEnlargedCover() {
        const current = TRACKS[state.currentTrackIndex];
        if (!current || !coverExpandedModal) return;

        expandedCoverImg.src = current.cover;
        expandedCoverTitle.textContent = current.title;
        expandedCoverArtist.textContent = current.artist;

        if (expandedCurrentTime) expandedCurrentTime.textContent = currentTimeLbl.textContent;
        if (expandedDuration) expandedDuration.textContent = durationLbl.textContent;
        if (expandedProgressFill && audio.duration) {
            expandedProgressFill.style.width = ((audio.currentTime / audio.duration) * 100) + "%";
        }
        if (expandedShuffleBtn) expandedShuffleBtn.classList.toggle("active", state.isShuffle);
        if (expandedRepeatBtn) {
            expandedRepeatBtn.classList.toggle("active", state.repeatMode !== "none");
            const icon = expandedRepeatBtn.querySelector("i");
            if (icon) icon.className = state.repeatMode === "one" ? "fa-solid fa-1" : "fa-solid fa-repeat";
        }

        coverExpandedModal.classList.add("active");
        startVisualizer();
    }

    function closeEnlargedCover() {
        coverExpandedModal?.classList.remove("active");
        stopVisualizer();
    }

    function handleNowPlayingClick(e) {
        e.stopPropagation();
        if (window.innerWidth <= 899) {
            openSheet();
        } else {
            openEnlargedCover();
        }
    }

    currentTitle?.addEventListener("click", handleNowPlayingClick);
    currentCover?.addEventListener("click", handleNowPlayingClick);
    coverMinimizeBtn?.addEventListener("click", closeEnlargedCover);
    expandedCloseBtn?.addEventListener("click", closeEnlargedCover);
    coverModalBackdrop?.addEventListener("click", closeEnlargedCover);

    // --- J. Context Tracks -------------------------------------------------
    function getContextTracks() {
        if (state.activeFilter === "playlist" && state.activePlaylistId) {
            const pl = playlists.find(p => p.id === state.activePlaylistId);
            if (pl && pl.trackIds) {
                return pl.trackIds.map(tid => TRACKS.find(t => String(t.id) === String(tid))).filter(Boolean);
            }
        }
        if (state.activeFilter === "liked") {
            return TRACKS.filter(t => t.liked);
        }
        if (state.activeFilter === "local") {
            return TRACKS.filter(t => t.isLocal);
        }
        if (state.activeFilter === "recent") {
            return state.recentPlayed.map(id => TRACKS.find(t => String(t.id) === String(id))).filter(Boolean);
        }
        return TRACKS;
    }

    // --- K. Playlist Ordering & Operations ---------------------------------
    function updatePlaylistBannerMeta(pl) {
        if (!pl) return;
        const plTracks = (pl.trackIds || [])
            .map(tid => TRACKS.find(t => String(t.id) === String(tid)))
            .filter(Boolean);

        let totalSeconds = 0;
        plTracks.forEach(t => {
            if (t.duration && /^\d+:\d+$/.test(t.duration)) {
                const parts = t.duration.split(":");
                totalSeconds += (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
            }
        });
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;

        const titleEl = document.getElementById("plDetailTitle");
        const countEl = document.getElementById("plMetaSongCount");
        const durEl = document.getElementById("plMetaDuration");
        const descEl = document.getElementById("plDetailDesc");
        const plCoverImg = document.getElementById("plDetailCover");

        if (titleEl) titleEl.textContent = pl.name;
        if (countEl) countEl.textContent = `${plTracks.length} song${plTracks.length === 1 ? "" : "s"}`;
        if (durEl) durEl.textContent = `${mins} min ${secs} sec`;
        if (descEl) descEl.textContent = pl.description || "Curated songs and local tracks played sequentially in order.";
        
        if (plCoverImg) {
            plCoverImg.src = pl.coverUrl || (plTracks.length > 0 ? plTracks[0].cover : DEFAULT_COVER);
        }
    }

    function renderSidebarPlaylists() {
        if (!playlistNavList) return;
        
        // Render only playlists created by the active user inside the sidebar
        const ownedPlaylists = playlists.filter(pl => pl.isOwned !== false);

        playlistNavList.innerHTML = ownedPlaylists.map(pl => {
            const isActive = state.activeFilter === "playlist" && state.activePlaylistId === pl.id;
            const songCount = pl.trackIds ? pl.trackIds.length : 0;
            return `
                <li class="nav-item ${isActive ? "active" : ""}" data-playlist-id="${escapeHtml(pl.id)}">
                    <a href="#">
                        <i class="fa-solid fa-music"></i>
                        <span class="playlist-text">${escapeHtml(pl.name)}</span>
                        <span class="badge-count">${songCount}</span>
                    </a>
                    <button class="btn-delete-playlist" data-playlist-id="${escapeHtml(pl.id)}" title="Delete ${escapeHtml(pl.name)}">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </li>
            `;
        }).join("");

        playlistNavList.querySelectorAll(".nav-item a").forEach(a => {
            a.addEventListener("click", (e) => {
                e.preventDefault();
                const li = a.closest(".nav-item");
                selectPlaylist(li.dataset.playlistId, true);
                closeDrawer();
            });
        });

        playlistNavList.querySelectorAll(".btn-delete-playlist").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                deletePlaylist(btn.dataset.playlistId);
            });
        });
    }

    function selectPlaylist(plId, autoPlayInOrder = true) {
        const pl = playlists.find(p => p.id === plId);
        if (!pl) return;

        state.activeFilter = "playlist";
        state.activePlaylistId = pl.id;

        const homeViewContainer = document.getElementById("homeViewContainer");
        if (homeViewContainer) homeViewContainer.style.display = "none";

        const plBanner = document.getElementById("playlistDetailBanner");
        const plActionBar = document.getElementById("playlistActionBar");
        if (plBanner) plBanner.style.display = "flex";
        if (plActionBar) plActionBar.style.display = "flex";

        const mainTracklist = document.getElementById("mainTracklistSection");
        if (mainTracklist) mainTracklist.style.display = "block";

        updatePlaylistBannerMeta(pl);

        const userName = pl.creatorName || currentUserName || "Guest Listener";
        const creatorNameEl = document.getElementById("plCreatorName");
        const creatorAvatarEl = document.getElementById("plCreatorAvatar");
        if (creatorNameEl) creatorNameEl.textContent = userName;
        if (creatorAvatarEl) creatorAvatarEl.src = pl.creatorAvatar || userAvatarUrl;

        if (tracklistHeading) tracklistHeading.textContent = pl.name;
        if (viewFilterPill) {
            viewFilterPill.style.display = "inline-block";
            viewFilterPill.textContent = "Playlist";
        }
        
        // Hide edit/add/delete options if it's a shared playlist (not owned by the user)
        const isOwner = pl.isOwned !== false;
        const plActionAddSongsBtn = document.getElementById("plActionAddSongsBtn");
        const plActionEditBtn = document.getElementById("plActionEditBtn");
        const plActionDeleteBtn = document.getElementById("plActionDeleteBtn");
        const plActionShareBtn = document.getElementById("plActionShareBtn");
        
        if (plActionAddSongsBtn) plActionAddSongsBtn.style.display = isOwner ? "inline-flex" : "none";
        if (plActionEditBtn) plActionEditBtn.style.display = isOwner ? "inline-flex" : "none";
        if (plActionDeleteBtn) plActionDeleteBtn.style.display = isOwner ? "inline-flex" : "none";
        if (deleteCurrentPlaylistBtn) deleteCurrentPlaylistBtn.style.display = isOwner ? "inline-flex" : "none";
        if (plActionShareBtn) plActionShareBtn.style.display = (isOwner && !pl.isPrivate) || isOwner ? "inline-flex" : "none";

        const plBigPlayBtn = document.getElementById("plBigPlayBtn");
        if (plBigPlayBtn) {
            plBigPlayBtn.onclick = () => {
                const isPlayingThisPl = state.isPlaying && state.activePlaylistId === pl.id;
                if (isPlayingThisPl) {
                    togglePlayPause();
                } else {
                    const currentPlTracks = (pl.trackIds || [])
                        .map(tid => TRACKS.find(t => String(t.id) === String(tid)))
                        .filter(Boolean);
                    if (currentPlTracks.length > 0) {
                        const firstGlobalIdx = TRACKS.findIndex(t => String(t.id) === String(currentPlTracks[0].id));
                        if (firstGlobalIdx !== -1) loadTrack(firstGlobalIdx, true);
                    } else {
                        showToast("This playlist has no songs yet", "fa-circle-info");
                    }
                }
            };
        }

        if (plActionDeleteBtn) {
            plActionDeleteBtn.onclick = () => deletePlaylist(pl.id);
        }

        const plActionShuffleBtn = document.getElementById("plActionShuffleBtn");
        if (plActionShuffleBtn) {
            plActionShuffleBtn.onclick = () => {
                if (!state.isShuffle) {
                    toggleShuffle();
                }
                const currentPlTracks = (pl.trackIds || [])
                    .map(tid => TRACKS.find(t => String(t.id) === String(tid)))
                    .filter(Boolean);
                if (currentPlTracks.length === 1) {
                    const idx = TRACKS.findIndex(t => String(t.id) === String(currentPlTracks[0].id));
                    if (idx !== -1) loadTrack(idx, true);
                } else if (currentPlTracks.length > 1) {
                    playRandomTrack();
                } else {
                    showToast("Add songs to shuffle this playlist", "fa-circle-info");
                }
            };
        }

        document.querySelectorAll(".sidebar .nav-item").forEach(i => i.classList.remove("active"));
        const activeLi = playlistNavList?.querySelector(`.nav-item[data-playlist-id="${pl.id}"]`);
        if (activeLi) activeLi.classList.add("active");

        renderTrackList();
        updatePlayPauseIcons();

        const plTracks = (pl.trackIds || []).map(tid => TRACKS.find(t => String(t.id) === String(tid))).filter(Boolean);
        if (autoPlayInOrder && plTracks.length > 0) {
            const firstTrackGlobalIdx = TRACKS.findIndex(t => String(t.id) === String(plTracks[0].id));
            if (firstTrackGlobalIdx !== -1) {
                loadTrack(firstTrackGlobalIdx, true);
                showToast(`Playing playlist "${pl.name}" in order`, "fa-play");
            }
        }
    }

    function openCreatePlaylistModal() {
        if (!requireLogin("Please log in to create playlists")) return;
        if (!createPlaylistModal) return;
        createPlaylistModal.classList.add("active");
        if (newPlaylistName) {
            newPlaylistName.value = "";
            setTimeout(() => newPlaylistName.focus(), 100);
        }
    }

    function closeCreatePlaylistModal() {
        createPlaylistModal?.classList.remove("active");
    }

    async function createNewPlaylist() {
        const name = (newPlaylistName?.value || "").trim();
        if (!name) {
            showToast("Please enter a playlist name", "fa-triangle-exclamation");
            return;
        }
        if (!requireLogin("Please log in to create playlists")) return;

        try {
            const pl = await api(`/users/${currentUserId}/playlists`, jsonOpts("POST", { name }));
            const newPl = { id: String(pl._id), name: pl.name, description: "", isPrivate: true, coverUrl: "", trackIds: [], isOwned: true };
            playlists.push(newPl);
            renderSidebarPlaylists();
            updateUserCardStats();
            closeCreatePlaylistModal();
            showToast(`Created playlist "${name}"`, "fa-circle-plus");
            selectPlaylist(newPl.id, false);
        } catch (err) {
            showToast(err.message || "Could not create playlist", "fa-triangle-exclamation");
        }
    }

    async function deletePlaylist(plId) {
        const pl = playlists.find(p => p.id === plId);
        if (!pl) return;
        if (!confirm(`Are you sure you want to delete the playlist "${pl.name}"?`)) return;

        try {
            await api(`/playlists/${plId}?userId=${encodeURIComponent(currentUserId)}`, { method: "DELETE" });
            playlists = playlists.filter(p => p.id !== plId);
            renderSidebarPlaylists();
            updateUserCardStats();
            showToast(`Deleted playlist "${pl.name}"`, "fa-trash-can");

            if (state.activeFilter === "playlist" && state.activePlaylistId === plId) {
                setActiveFilter("all", "Home");
            }
        } catch (err) {
            showToast(err.message || "Could not delete playlist", "fa-triangle-exclamation");
        }
    }

    createPlaylistBtn?.addEventListener("click", openCreatePlaylistModal);
    closeCreateModalBtn?.addEventListener("click", closeCreatePlaylistModal);
    cancelCreatePlaylistBtn?.addEventListener("click", closeCreatePlaylistModal);
    confirmCreatePlaylistBtn?.addEventListener("click", createNewPlaylist);
    newPlaylistName?.addEventListener("keydown", (e) => { if (e.key === "Enter") createNewPlaylist(); });
    deleteCurrentPlaylistBtn?.addEventListener("click", () => {
        if (state.activePlaylistId) deletePlaylist(state.activePlaylistId);
    });
    
    document.getElementById("plActionShareBtn")?.addEventListener("click", () => {
        if (!state.activePlaylistId) return;
        const link = `${window.location.origin}${window.location.pathname}?playlist=${state.activePlaylistId}`;
        navigator.clipboard.writeText(link).then(() => {
            showToast("Playlist link copied to clipboard!", "fa-link");
        }).catch(() => {
            showToast("Failed to copy link", "fa-triangle-exclamation");
        });
    });

    // --- PLAYLIST EDIT MODAL LOGIC ---
    const editPlaylistModal = document.getElementById("editPlaylistModal");
    const plActionEditBtn = document.getElementById("plActionEditBtn");
    const closeEditPlaylistModalBtn = document.getElementById("closeEditPlaylistModalBtn");
    const cancelEditPlaylistBtn = document.getElementById("cancelEditPlaylistBtn");
    const confirmEditPlaylistBtn = document.getElementById("confirmEditPlaylistBtn");

    const editPlaylistCoverBox = document.getElementById("editPlaylistCoverBox");
    const editPlaylistCoverInput = document.getElementById("editPlaylistCoverInput");
    const editPlaylistCoverPreview = document.getElementById("editPlaylistCoverPreview");
    const editPlaylistName = document.getElementById("editPlaylistName");
    const editPlaylistDesc = document.getElementById("editPlaylistDesc");
    const editPlaylistPrivate = document.getElementById("editPlaylistPrivate");

    let currentEditPlaylistCoverFile = null;

    function openEditPlaylistModal() {
        if (!requireLogin("Please log in to edit playlists")) return;
        if (!state.activePlaylistId) return;
        
        const pl = playlists.find(p => p.id === state.activePlaylistId);
        if (!pl || !editPlaylistModal) return;

        editPlaylistName.value = pl.name || "";
        editPlaylistDesc.value = pl.description || "";
        editPlaylistPrivate.checked = pl.isPrivate;

        const plTracks = (pl.trackIds || []).map(tid => TRACKS.find(t => String(t.id) === String(tid))).filter(Boolean);
        const displayCover = pl.coverUrl || (plTracks.length > 0 ? plTracks[0].cover : DEFAULT_COVER);
        editPlaylistCoverPreview.src = displayCover;

        currentEditPlaylistCoverFile = null;
        editPlaylistModal.classList.add("active");
    }

    function closeEditPlaylistModal() {
        editPlaylistModal?.classList.remove("active");
    }

    plActionEditBtn?.addEventListener("click", openEditPlaylistModal);
    closeEditPlaylistModalBtn?.addEventListener("click", closeEditPlaylistModal);
    cancelEditPlaylistBtn?.addEventListener("click", closeEditPlaylistModal);

    editPlaylistCoverBox?.addEventListener("click", () => editPlaylistCoverInput?.click());

    editPlaylistCoverInput?.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file || !file.type.startsWith("image/")) return;
        
        currentEditPlaylistCoverFile = file;
        const reader = new FileReader();
        reader.onload = (event) => {
            if (editPlaylistCoverPreview) editPlaylistCoverPreview.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    confirmEditPlaylistBtn?.addEventListener("click", async () => {
        if (!state.activePlaylistId) return;
        const pl = playlists.find(p => p.id === state.activePlaylistId);
        if (!pl) return;

        const name = (editPlaylistName?.value || "").trim();
        if (!name) {
            showToast("Playlist Name is required", "fa-triangle-exclamation");
            return;
        }

        const description = (editPlaylistDesc?.value || "").trim();
        const isPrivate = editPlaylistPrivate?.checked;

        confirmEditPlaylistBtn.disabled = true;
        confirmEditPlaylistBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

        try {
            const formData = new FormData();
            formData.append("userId", currentUserId);
            formData.append("name", name);
            formData.append("description", description);
            formData.append("isPrivate", isPrivate);
            
            if (currentEditPlaylistCoverFile) {
                formData.append("cover", currentEditPlaylistCoverFile);
            }

            const updatedPl = await api(`/playlists/${pl.id}`, { method: "PUT", body: formData });
            
            pl.name = updatedPl.name;
            pl.description = updatedPl.description;
            pl.isPrivate = updatedPl.isPrivate;
            if (updatedPl.coverUrl) pl.coverUrl = updatedPl.coverUrl;

            updatePlaylistBannerMeta(pl);
            renderSidebarPlaylists();
            
            showToast("Playlist updated successfully!", "fa-circle-check");
            closeEditPlaylistModal();
        } catch (error) {
            console.error(error);
            showToast(error.message || "Failed to update playlist", "fa-triangle-exclamation");
        } finally {
            confirmEditPlaylistBtn.disabled = false;
            confirmEditPlaylistBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Changes`;
        }
    });


    function openAddToPlaylistModal(trackId) {
        if (!requireLogin("Please log in to manage playlists")) return;
        const track = TRACKS.find(t => String(t.id) === String(trackId));
        if (!track || !addToPlaylistModal) return;

        songTargetForPlaylist = track;
        if (addToPlaylistSongTitle) addToPlaylistSongTitle.textContent = `Add "${track.title}" to:`;

        if (playlists.length === 0) {
            modalPlaylistOptions.innerHTML = `<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 12px;">No playlists found. Create one first!</p>`;
        } else {
            modalPlaylistOptions.innerHTML = playlists.map(pl => {
                const alreadyIn = pl.trackIds && pl.trackIds.some(id => String(id) === String(track.id));
                return `
                    <div class="modal-pl-option" data-pl-id="${escapeHtml(pl.id)}">
                        <span class="modal-pl-option-name">
                            <i class="fa-solid fa-music" style="color: var(--accent-green);"></i> ${escapeHtml(pl.name)}
                        </span>
                        <span class="modal-pl-option-count">
                            ${alreadyIn ? '<span style="color: var(--accent-green);"><i class="fa-solid fa-check"></i> Added</span>' : "+ Add"}
                        </span>
                    </div>
                `;
            }).join("");

            modalPlaylistOptions.querySelectorAll(".modal-pl-option").forEach(opt => {
                opt.addEventListener("click", () => {
                    toggleTrackInPlaylist(opt.dataset.plId, songTargetForPlaylist.id);
                });
            });
        }
        addToPlaylistModal.classList.add("active");
    }

    async function toggleTrackInPlaylist(plId, trackId) {
        const pl = playlists.find(p => p.id === plId);
        if (!pl) return;
        if (!requireLogin("Please log in to edit playlists")) return;

        try {
            const data = await api(`/playlists/${plId}/toggle-song`, jsonOpts("PUT", { songId: String(trackId), userId: currentUserId }));
            pl.trackIds = (data.songs || []).map(String);
            showToast(data.added ? `Added to "${pl.name}"` : `Removed from "${pl.name}"`,
                data.added ? "fa-circle-check" : "fa-circle-minus");
        } catch (err) {
            showToast(err.message || "Could not update playlist", "fa-triangle-exclamation");
            return;
        }

        renderSidebarPlaylists();
        addToPlaylistModal.classList.remove("active");

        if (state.activeFilter === "playlist" && state.activePlaylistId === plId) {
            updatePlaylistBannerMeta(pl);
            renderTrackList();
        }
    }

    closeAddModalBtn?.addEventListener("click", () => addToPlaylistModal?.classList.remove("active"));

    // --- PLAYLIST ADD SONGS MODAL LOGIC (Public & Private) ---
    const selectSongsModal = document.getElementById("selectSongsModal");
    const plActionAddSongsBtn = document.getElementById("plActionAddSongsBtn");
    const closeSelectSongsModalBtn = document.getElementById("closeSelectSongsModalBtn");
    const doneSelectSongsBtn = document.getElementById("doneSelectSongsBtn");
    const searchSongsForPlInput = document.getElementById("searchSongsForPlInput");
    const selectSongsList = document.getElementById("selectSongsList");
    const selectSongsModalPlName = document.getElementById("selectSongsModalPlName");

    function renderSelectSongsList(filterQuery = "") {
        if (!selectSongsList || !state.activePlaylistId) return;

        const pl = playlists.find(p => p.id === state.activePlaylistId);
        if (!pl) return;

        if (!pl.trackIds) pl.trackIds = [];

        const q = filterQuery.trim().toLowerCase();

        const availableTracks = TRACKS.filter(t => {
            if (!q) return true;
            const titleMatch = t.title.toLowerCase().includes(q);
            const artistMatch = t.artist.toLowerCase().includes(q);
            const typeMatch = t.isLocal ? "local private".includes(q) : "cloud online server".includes(q);
            return titleMatch || artistMatch || typeMatch;
        });

        if (availableTracks.length === 0) {
            selectSongsList.innerHTML = `<p style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">No songs found matching "${escapeHtml(filterQuery)}".</p>`;
            return;
        }

        selectSongsList.innerHTML = availableTracks.map(t => {
            const isAdded = pl.trackIds.some(id => String(id) === String(t.id));
            return `
                <div class="select-song-item" data-track-id="${escapeHtml(t.id)}">
                    <img src="${escapeHtml(t.cover)}" class="select-song-thumb" alt="${escapeHtml(t.title)}">
                    <div class="select-song-meta">
                        <div class="select-song-title">${escapeHtml(t.title)}</div>
                        <div class="select-song-subtitle">
                            <span>${escapeHtml(t.artist)}</span>
                            <span class="song-source-badge ${t.isLocal ? "local" : "cloud"}">
                                ${t.isLocal ? '<i class="fa-solid fa-lock"></i> Private' : '<i class="fa-solid fa-cloud"></i> Server'}
                            </span>
                            <span>• ${escapeHtml(t.duration || "--:--")}</span>
                        </div>
                    </div>
                    <button class="btn-toggle-pl-song ${isAdded ? "added" : ""}" data-track-id="${escapeHtml(t.id)}">
                        ${isAdded ? '<i class="fa-solid fa-check"></i> Added' : '<i class="fa-solid fa-plus"></i> Add'}
                    </button>
                </div>
            `;
        }).join("");

        selectSongsList.querySelectorAll(".btn-toggle-pl-song").forEach(btn => {
            btn.addEventListener("click", async () => {
                const trackIdStr = String(btn.dataset.trackId);
                if (!requireLogin("Please log in to edit playlists")) return;

                let data;
                try {
                    data = await api(`/playlists/${pl.id}/toggle-song`, jsonOpts("PUT", { songId: trackIdStr, userId: currentUserId }));
                } catch (err) {
                    showToast(err.message || "Could not update playlist", "fa-triangle-exclamation");
                    return;
                }

                const track = TRACKS.find(t => String(t.id) === trackIdStr);
                pl.trackIds = (data.songs || []).map(String);

                if (data.added) {
                    btn.classList.add("added");
                    btn.innerHTML = `<i class="fa-solid fa-check"></i> Added`;
                    showToast(`Added "${track?.title}" to playlist`, "fa-circle-check");
                } else {
                    btn.classList.remove("added");
                    btn.innerHTML = `<i class="fa-solid fa-plus"></i> Add`;
                    showToast(`Removed "${track?.title}" from playlist`, "fa-circle-minus");
                }

                renderSidebarPlaylists();
                updatePlaylistBannerMeta(pl);
                renderTrackList();
            });
        });
    }

    plActionAddSongsBtn?.addEventListener("click", () => {
        if (!state.activePlaylistId) return;
        const pl = playlists.find(p => p.id === state.activePlaylistId);
        if (!pl) return;

        if (selectSongsModalPlName) selectSongsModalPlName.textContent = pl.name;
        if (searchSongsForPlInput) searchSongsForPlInput.value = "";

        renderSelectSongsList("");
        selectSongsModal?.classList.add("active");
    });

    closeSelectSongsModalBtn?.addEventListener("click", () => selectSongsModal?.classList.remove("active"));
    doneSelectSongsBtn?.addEventListener("click", () => selectSongsModal?.classList.remove("active"));
    selectSongsModal?.addEventListener("click", (e) => {
        if (e.target === selectSongsModal) selectSongsModal.classList.remove("active");
    });

    searchSongsForPlInput?.addEventListener("input", (e) => {
        renderSelectSongsList(e.target.value);
    });

    function getAudioDuration(file) {
        return new Promise(resolve => {
            const url = URL.createObjectURL(file);
            const probe = new Audio();
            const done = (v) => { URL.revokeObjectURL(url); resolve(v); };
            probe.addEventListener("loadedmetadata", () => done(isFinite(probe.duration) ? formatTime(probe.duration) : "--:--"));
            probe.addEventListener("error", () => done("--:--"));
            setTimeout(() => done("--:--"), 5000);
            probe.src = url;
        });
    }

    // --- L. Upload Workflow: Admin Public Catalog vs. User Private Cloud ---
    function openUploadModal(isCloud = false, preloadedAudioFile = null) {
        if (!requireLogin("Please log in to upload songs")) return;
        if (!uploadSongModal) return;
        state.isCloudUploadMode = isCloud;

        const btnTextEl = document.getElementById("confirmUploadBtnText");
        if (isCloud) {
            if (uploadModalTitle) uploadModalTitle.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Admin Cloud Upload (Supabase + MongoDB)`;
            if (btnTextEl) btnTextEl.textContent = "Upload to Cloud Catalog";
        } else {
            if (uploadModalTitle) uploadModalTitle.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Private Song (Cloud, Only You)`;
            if (btnTextEl) btnTextEl.textContent = "Upload Privately & Play";
        }

        uploadSongModal.classList.add("active");

        currentSelectedAudioFile = null;
        currentSelectedCoverFile = null;
        currentSelectedCoverData = DEFAULT_COVER;
        if (uploadCoverPreview) uploadCoverPreview.src = DEFAULT_COVER;
        if (audioFileNameDisplay) audioFileNameDisplay.textContent = "No file chosen";
        if (uploadSongTitle) uploadSongTitle.value = "";
        if (uploadSongArtist) uploadSongArtist.value = "";
        if (uploadSongAlbum) uploadSongAlbum.value = "";
        if (songAudioInput) songAudioInput.value = "";
        if (songCoverInput) songCoverInput.value = "";

        if (preloadedAudioFile) handleSelectedAudio(preloadedAudioFile);
    }

    function closeUploadModal() {
        uploadSongModal?.classList.remove("active");
    }

    sidebarUploadBtn?.addEventListener("click", () => openUploadModal(false));

    headerUploadBtn?.addEventListener("click", () => {
        if (!isAdmin) {
            showToast("Upload feature is restricted to Admins", "fa-lock");
            return;
        }
        openUploadModal(true);
    });

    closeUploadModalBtn?.addEventListener("click", closeUploadModal);
    cancelUploadBtn?.addEventListener("click", closeUploadModal);
    chooseAudioBtn?.addEventListener("click", () => songAudioInput?.click());

    function handleSelectedAudio(file) {
        if (!file) return;
        currentSelectedAudioFile = file;
        if (audioFileNameDisplay) audioFileNameDisplay.textContent = file.name;

        let cleanName = file.name.replace(/\.[^/.]+$/, "");
        let artist = "Unknown Artist";
        let title = cleanName;

        if (cleanName.includes(" - ")) {
            const parts = cleanName.split(" - ");
            artist = parts[0].trim();
            title = parts.slice(1).join(" - ").trim();
        }

        if (uploadSongTitle && !uploadSongTitle.value) uploadSongTitle.value = title;
        if (uploadSongArtist && !uploadSongArtist.value) uploadSongArtist.value = artist;
    }

    songAudioInput?.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) handleSelectedAudio(e.target.files[0]);
    });

    [coverPreviewBox, chooseCoverBtn].forEach(el => {
        el?.addEventListener("click", () => songCoverInput?.click());
    });

    songCoverInput?.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file || !file.type.startsWith("image/")) return;
        currentSelectedCoverFile = file;
        const reader = new FileReader();
        reader.onload = (event) => {
            currentSelectedCoverData = event.target.result;
            if (uploadCoverPreview) uploadCoverPreview.src = currentSelectedCoverData;
            showToast("Cover photo selected!", "fa-camera");
        };
        reader.readAsDataURL(file);
    });

    confirmUploadBtn?.addEventListener("click", async () => {
        if (!currentSelectedAudioFile) {
            showToast("Please browse and select an audio file first", "fa-triangle-exclamation");
            return;
        }

        const title = (uploadSongTitle?.value || "").trim() || currentSelectedAudioFile.name.replace(/\.[^/.]+$/, "");
        const artist = (uploadSongArtist?.value || "").trim() || (state.isCloudUploadMode ? "Sound Pulse Artist" : "Unknown Artist");

        confirmUploadBtn.disabled = true;
        confirmUploadBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;

        try {
            const isPrivate = !state.isCloudUploadMode;
            if (!isLoggedIn()) throw new Error("Please log in to upload songs.");
            if (!isPrivate && !isAdmin) throw new Error("Only admins can publish to the cloud catalog.");

            showToast(isPrivate ? "Saving to your private library..." : "Uploading to server...", "fa-cloud-arrow-up");

            const album = (uploadSongAlbum?.value || "").trim();
            const duration = await getAudioDuration(currentSelectedAudioFile);

            const formData = new FormData();
            formData.append("audio", currentSelectedAudioFile);
            if (currentSelectedCoverFile) formData.append("cover", currentSelectedCoverFile);
            formData.append("title", title);
            formData.append("artist", artist);
            formData.append("album", album);
            formData.append("duration", duration);
            formData.append("userId", currentUserId);
            formData.append("isPrivate", String(isPrivate));

            const savedSong = await api("/songs", { method: "POST", body: formData });

            TRACKS.unshift(mapSong(savedSong));
            if (isPrivate) {
                showToast(`Saved "${title}" to your private library!`, "fa-floppy-disk");
                setActiveFilter("local", "My Private Songs");
            } else {
                showToast(`Cloud song "${title}" published globally!`, "fa-cloud-arrow-up");
                renderHomeSections();
                renderTrackList();
            }
            loadTrack(0, true);
            closeUploadModal();
        } catch (error) {
            console.error(error);
            showToast(error.message || "Upload failed", "fa-triangle-exclamation");
        } finally {
            confirmUploadBtn.disabled = false;
            confirmUploadBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span id="confirmUploadBtnText">${state.isCloudUploadMode ? "Upload to Cloud Catalog" : "Upload Privately & Play"}</span>`;
        }
    });

    window.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (dropOverlay) {
            dropOverlay.style.display = "flex";
            dropOverlay.classList.add("active");
        }
    });

    window.addEventListener("dragleave", (e) => {
        if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
            if (dropOverlay) {
                dropOverlay.classList.remove("active");
                dropOverlay.style.display = "none";
            }
        }
    });

    window.addEventListener("drop", (e) => {
        e.preventDefault();
        if (dropOverlay) {
            dropOverlay.classList.remove("active");
            dropOverlay.style.display = "none";
        }
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name)) {
                openUploadModal(false, file);
            } else {
                showToast("Please drop an audio file (MP3, WAV, etc.)", "fa-triangle-exclamation");
            }
        }
    });

    [createPlaylistModal, addToPlaylistModal, uploadSongModal, editPlaylistModal].forEach(m => {
        m?.addEventListener("click", (e) => {
            if (e.target === m) m.classList.remove("active");
        });
    });

    // --- M. Queue Helper ---------------------------------------------------
    function addTrackToQueue(trackId) {
        const track = TRACKS.find(t => String(t.id) === String(trackId));
        if (!track) return;
        state.queue.push(track.id);
        renderQueue();
        showToast(`Added "${track.title}" to Queue`, "fa-list-check");
    }

    // --- N. Track Filtering & Rendering -----------------------------------
    function getFilteredTracks() {
        const q = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
        let list = [...TRACKS];

        if (state.activeFilter === "liked") {
            list = list.filter(t => t.liked);
        } else if (state.activeFilter === "local") {
            list = list.filter(t => t.isLocal && (!t.userId || t.userId === currentUserId || t.userId === "guest"));
        } else if (state.activeFilter === "recent") {
            list = state.recentPlayed.map(id => TRACKS.find(t => String(t.id) === String(id))).filter(Boolean);
        } else if (state.activeFilter === "playlist") {
            const currentPl = playlists.find(p => p.id === state.activePlaylistId);
            if (currentPl && currentPl.trackIds) {
                list = currentPl.trackIds.map(tid => TRACKS.find(t => String(t.id) === String(tid))).filter(Boolean);
            } else {
                list = [];
            }
        }

        if (q) {
            list = list.filter(t =>
                t.title.toLowerCase().includes(q) ||
                t.artist.toLowerCase().includes(q) ||
                t.album.toLowerCase().includes(q)
            );
        }
        return list;
    }

    function renderTrackList() {
        if (!trackList) return;
        const filtered = getFilteredTracks();
        updateBadgeCounts();

        if (filtered.length === 0) {
            let emptyMsg = "No tracks found.";
            if (state.activeFilter === "liked") {
                emptyMsg = "You haven't liked any songs yet! Click the heart icon on any track to add it here.";
            } else if (state.activeFilter === "local") {
                emptyMsg = "No private songs yet! Click 'Import Local Song' to upload songs only you can see.";
            } else if (state.activeFilter === "recent") {
                emptyMsg = "You haven't played any tracks recently. Start listening to build your history!";
            } else if (state.activeFilter === "playlist") {
                emptyMsg = "This playlist is empty. Click 'Add Songs' above or the folder-plus icon next to any song!";
            }

            trackList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid ${state.activeFilter === "liked" ? "fa-heart-crack" : "fa-music"}"></i>
                    <h3>${state.activeFilter === "liked" ? "No Liked Songs Yet" : "No Tracks Here"}</h3>
                    <p>${emptyMsg}</p>
                    <button class="btn btn-green" id="emptyActionBtn">
                        ${state.activeFilter === "local" ? '<i class="fa-solid fa-cloud-arrow-up"></i> Import Local Song' : '<i class="fa-solid fa-house"></i> Back to Home'}
                    </button>
                </div>
            `;

            document.getElementById("emptyActionBtn")?.addEventListener("click", () => {
                if (state.activeFilter === "local") openUploadModal(false);
                else setActiveFilter("all", "Home");
            });
            return;
        }

        trackList.innerHTML = filtered.map((t) => {
            const realIndex = TRACKS.findIndex(item => String(item.id) === String(t.id));
            const isPlayingThis = (realIndex === state.currentTrackIndex && audio.src);
            return `
                <div class="track-row ${isPlayingThis ? "playing" : ""}" data-track-id="${escapeHtml(t.id)}" data-index="${realIndex}">
                    <span class="track-index">${isPlayingThis ? '<i class="fa-solid fa-volume-high"></i>' : (realIndex + 1)}</span>
                    <img src="${escapeHtml(t.cover)}" alt="${escapeHtml(t.title)}" class="track-cover">
                    <div class="track-info">
                        <span class="track-title">${escapeHtml(t.title)}</span>
                        <span class="track-artist">${escapeHtml(t.artist)} ${t.isLocal ? '<span style="font-size: 10px; color: var(--accent-green);">(Private)</span>' : ""}</span>
                    </div>
                    <span class="track-album-name">${escapeHtml(t.album)}</span>
                    <span class="track-duration">${escapeHtml(t.duration)}</span>
                    <button class="btn-row-add-queue" data-track-id="${escapeHtml(t.id)}" title="Add to Queue">
                        <i class="fa-solid fa-list-check"></i>
                    </button>
                    <button class="btn-row-add-pl" data-track-id="${escapeHtml(t.id)}" title="Add to Playlist">
                        <i class="fa-solid fa-folder-plus"></i>
                    </button>
                    <button class="like-btn ${t.liked ? "liked" : ""}" data-track-id="${escapeHtml(t.id)}" title="Toggle Favorite">
                        <i class="${t.liked ? "fa-solid" : "fa-regular"} fa-heart"></i>
                    </button>
                    <button class="btn-row-more" data-track-id="${escapeHtml(t.id)}" title="More Options">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>
                </div>
            `;
        }).join("");

        trackList.querySelectorAll(".track-row").forEach(row => {
            row.addEventListener("click", (e) => {
                if (e.target.closest(".like-btn") || e.target.closest(".btn-row-add-pl") || e.target.closest(".btn-row-add-queue") || e.target.closest(".btn-row-more")) return;
                const idx = parseInt(row.dataset.index, 10);
                if (idx === state.currentTrackIndex && audio.src) {
                    togglePlayPause();
                    return;
                }
                loadTrack(idx, true);
            });
        });

        trackList.querySelectorAll(".btn-row-add-queue").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                addTrackToQueue(btn.dataset.trackId);
            });
        });

        trackList.querySelectorAll(".btn-row-add-pl").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                openAddToPlaylistModal(btn.dataset.trackId);
            });
        });

        trackList.querySelectorAll(".like-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleFavorite(btn.dataset.trackId);
            });
        });

        trackList.querySelectorAll(".btn-row-more").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                openTrackContextMenu(e, btn.dataset.trackId);
            });
        });
    }

    // --- O. Favorite Toggle & Sync -----------------------------------------
    async function toggleFavorite(trackId) {
        const track = TRACKS.find(t => String(t.id) === String(trackId));
        if (!track) return;
        if (!requireLogin("Please log in to save favorites")) return;

        const previous = track.liked;
        track.liked = !previous;
        syncGlobalLikeState();
        renderTrackList();

        try {
            const data = await api(`/users/${currentUserId}/like`, jsonOpts("POST", { songId: track.id }));
            track.liked = data.liked;
            showToast(data.liked ? `Added "${track.title}" to Favorites` : `Removed "${track.title}" from Favorites`,
                data.liked ? "fa-heart" : "fa-heart-crack");
        } catch (err) {
            track.liked = previous;
            showToast(err.message || "Could not update favorite", "fa-triangle-exclamation");
        }

        syncGlobalLikeState();
        renderTrackList();
    }

    function syncGlobalLikeState() {
        const curr = TRACKS[state.currentTrackIndex];
        const isLiked = curr ? !!curr.liked : false;

        [playerLikeBtn, sheetLikeBtn].forEach(btn => {
            if (!btn) return;
            btn.classList.toggle("liked", isLiked);
            const icon = btn.querySelector("i");
            if (icon) icon.className = isLiked ? "fa-solid fa-heart" : "fa-regular fa-heart";
        });
    }

    playerLikeBtn?.addEventListener("click", () => {
        const curr = TRACKS[state.currentTrackIndex];
        if (curr) toggleFavorite(curr.id);
    });

    sheetLikeBtn?.addEventListener("click", () => {
        const curr = TRACKS[state.currentTrackIndex];
        if (curr) toggleFavorite(curr.id);
    });

    // --- MediaSession API Binding ---
    function bindMediaSessionControls(track) {
        if ('mediaSession' in navigator && track) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title,
                artist: track.artist,
                album: track.album || "Sound Pulse",
                artwork: [
                    { src: track.cover, sizes: '96x96',   type: 'image/jpeg' },
                    { src: track.cover, sizes: '128x128', type: 'image/jpeg' },
                    { src: track.cover, sizes: '192x192', type: 'image/jpeg' },
                    { src: track.cover, sizes: '256x256', type: 'image/jpeg' },
                    { src: track.cover, sizes: '384x384', type: 'image/jpeg' },
                    { src: track.cover, sizes: '512x512', type: 'image/jpeg' }
                ]
            });
            navigator.mediaSession.setActionHandler('play', togglePlayPause);
            navigator.mediaSession.setActionHandler('pause', togglePlayPause);
            navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
            navigator.mediaSession.setActionHandler('nexttrack', playNext);
        }
    }

    // --- P. Audio Load & Play ----------------------------------------------
    function loadTrack(index, autoPlay = true) {
        if (TRACKS.length === 0) {
            if (autoPlay) showToast("No songs available to play yet", "fa-circle-info");
            return;
        }
        if (index < 0 || index >= TRACKS.length) index = 0;

        // If clicking on the exact track currently loaded
        if (state.currentTrackIndex === index && audio.src && autoPlay) {
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
            if (audio.paused) {
                audio.play().then(() => {
                    state.isPlaying = true;
                    updatePlayPauseIcons();
                }).catch(err => console.warn(err));
            }
            return;
        }

        state.currentTrackIndex = index;
        const track = TRACKS[index];

        audio.src = track.src;
        audio.load();
        audio.playbackRate = state.playbackSpeed || 1.0;
        audio.volume = state.isMuted ? 0 : state.volume;

        if (currentTitle) currentTitle.textContent = track.title;
        if (currentArtist) currentArtist.textContent = track.artist;
        if (currentCover) currentCover.src = track.cover;

        if (sheetTitle) sheetTitle.textContent = track.title;
        if (sheetArtist) sheetArtist.textContent = track.artist;
        if (sheetCover) sheetCover.src = track.cover;

        if (coverExpandedModal && coverExpandedModal.classList.contains("active")) {
            expandedCoverImg.src = track.cover;
            expandedCoverTitle.textContent = track.title;
            expandedCoverArtist.textContent = track.artist;
        }

        bindMediaSessionControls(track);

        syncGlobalLikeState();
        renderTrackList();
        renderQueue();

        if (autoPlay) {
            audio.play().then(() => {
                state.isPlaying = true;
                updatePlayPauseIcons();
            }).catch(err => console.warn("Autoplay notice:", err));
        }
    }

    function togglePlayPause() {
        if (TRACKS.length === 0) {
            showToast("Upload or add a song to start listening", "fa-music");
            return;
        }
        if (!audio.src) {
            loadTrack(state.currentTrackIndex, true);
            return;
        }
        if (audio.paused) {
            audio.play().then(() => {
                state.isPlaying = true;
                updatePlayPauseIcons();
            }).catch(err => console.warn(err));
        } else {
            audio.pause();
            state.isPlaying = false;
            updatePlayPauseIcons();
        }
    }

    document.querySelectorAll(".playPauseBtn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            togglePlayPause();
        });
    });

    // --- Q. Audio Playback Event Listeners ---------------------------------
    
    let progressRafId = null;
    
    function smoothProgressUpdate() {
        if (audio.duration && isFinite(audio.duration) && !audio.paused) {
            const pct = (audio.currentTime / audio.duration) * 100;
            if (progressFill) progressFill.style.width = pct + "%";
            if (sheetProgressFill) sheetProgressFill.style.width = pct + "%";
            if (mobileTopProgressFill) mobileTopProgressFill.style.width = pct + "%";
            if (expandedProgressFill) expandedProgressFill.style.width = pct + "%";

            const cur = formatTime(audio.currentTime);
            if (currentTimeLbl && currentTimeLbl.textContent !== cur) currentTimeLbl.textContent = cur;
            if (sheetCurrentTime && sheetCurrentTime.textContent !== cur) sheetCurrentTime.textContent = cur;
            if (expandedCurrentTime && expandedCurrentTime.textContent !== cur) expandedCurrentTime.textContent = cur;

            progressRafId = requestAnimationFrame(smoothProgressUpdate);
        }
    }

    // Audio Engine Buffering and Performance Events
    audio.addEventListener('waiting', updatePlayPauseIcons);
    audio.addEventListener('playing', updatePlayPauseIcons);
    audio.addEventListener('canplay', updatePlayPauseIcons);

    audio.addEventListener("play", () => {
        state.isPlaying = true;
        updatePlayPauseIcons();

        if (progressRafId) cancelAnimationFrame(progressRafId);
        progressRafId = requestAnimationFrame(smoothProgressUpdate);

        const track = TRACKS[state.currentTrackIndex];
        if (!track || state.recentPlayed[0] === track.id) return;
        state.recentPlayed = [track.id, ...state.recentPlayed.filter(id => id !== track.id)].slice(0, 10);
        if (isLoggedIn()) {
            api(`/users/${currentUserId}/recent`, jsonOpts("POST", { songId: track.id }))
                .catch(err => console.warn("Could not save recent song:", err.message));
        }
    });

    audio.addEventListener("pause", () => {
        state.isPlaying = false;
        updatePlayPauseIcons();
        if (progressRafId) cancelAnimationFrame(progressRafId);
    });

    audio.addEventListener("loadedmetadata", () => {
        const dur = formatTime(audio.duration);
        if (durationLbl) durationLbl.textContent = dur;
        if (sheetDuration) sheetDuration.textContent = dur;
        if (expandedDuration) expandedDuration.textContent = dur;

        const current = TRACKS[state.currentTrackIndex];
        if (current && (current.duration === "--:--" || current.duration === "0:00")) {
            current.duration = dur;
            renderTrackList();
        }
    });

    audio.addEventListener("timeupdate", () => {
        if (audio.paused) {
            if (!audio.duration || !isFinite(audio.duration)) return;
            const pct = (audio.currentTime / audio.duration) * 100;
            if (progressFill) progressFill.style.width = pct + "%";
            if (sheetProgressFill) sheetProgressFill.style.width = pct + "%";
            if (mobileTopProgressFill) mobileTopProgressFill.style.width = pct + "%";
            if (expandedProgressFill) expandedProgressFill.style.width = pct + "%";
            const cur = formatTime(audio.currentTime);
            if (currentTimeLbl) currentTimeLbl.textContent = cur;
            if (sheetCurrentTime) sheetCurrentTime.textContent = cur;
            if (expandedCurrentTime) expandedCurrentTime.textContent = cur;
        }
    });

    audio.addEventListener("ended", handleTrackEnd);

    function handleTrackEnd() {
        if (state.sleepTimer.endOfTrack) {
            clearSleepTimer();
            state.isPlaying = false;
            updatePlayPauseIcons();
            showToast("Sleep timer: Playback ended after track 🌙", "fa-moon");
            return;
        }

        if (state.repeatMode === "one") {
            audio.currentTime = 0;
            audio.play();
            return;
        }

        if (state.queue.length > 0) {
            const nextId = state.queue.shift();
            const qIdx = TRACKS.findIndex(t => String(t.id) === String(nextId));
            if (qIdx !== -1) {
                loadTrack(qIdx, true);
                renderQueue();
                return;
            }
        }

        const contextTracks = getContextTracks();
        if (contextTracks.length === 0) {
            state.isPlaying = false;
            updatePlayPauseIcons();
            return;
        }

        if (state.isShuffle) {
            playRandomTrack();
            return;
        }

        const currentTrack = TRACKS[state.currentTrackIndex];
        const currentContextIdx = contextTracks.findIndex(t => String(t.id) === String(currentTrack?.id));

        const nextContextIdx = currentContextIdx + 1;
        if (nextContextIdx < contextTracks.length) {
            const nextTrackGlobalIdx = TRACKS.findIndex(t => String(t.id) === String(contextTracks[nextContextIdx].id));
            if (nextTrackGlobalIdx !== -1) loadTrack(nextTrackGlobalIdx, true);
        } else {
            if (state.repeatMode === "all") {
                const firstGlobalIdx = TRACKS.findIndex(t => String(t.id) === String(contextTracks[0].id));
                if (firstGlobalIdx !== -1) loadTrack(firstGlobalIdx, true);
            } else {
                state.isPlaying = false;
                updatePlayPauseIcons();
            }
        }
    }

    function playRandomTrack() {
        const contextTracks = getContextTracks();
        if (contextTracks.length === 0) return;
        if (contextTracks.length === 1) {
            const onlyIdx = TRACKS.findIndex(t => String(t.id) === String(contextTracks[0].id));
            if (onlyIdx !== -1) loadTrack(onlyIdx, true);
            return;
        }
        const currentTrack = TRACKS[state.currentTrackIndex];
        let target;
        do {
            target = contextTracks[Math.floor(Math.random() * contextTracks.length)];
        } while (target.id === currentTrack?.id && contextTracks.length > 1);

        const globalIdx = TRACKS.findIndex(t => String(t.id) === String(target.id));
        if (globalIdx !== -1) loadTrack(globalIdx, true);
    }

    function playNext() {
        if (state.queue.length > 0) {
            const nextId = state.queue.shift();
            const qIdx = TRACKS.findIndex(t => String(t.id) === String(nextId));
            if (qIdx !== -1) {
                loadTrack(qIdx, true);
                renderQueue();
                return;
            }
        }

        const contextTracks = getContextTracks();
        if (contextTracks.length === 0) return;

        if (state.isShuffle) { playRandomTrack(); return; }

        const currentTrack = TRACKS[state.currentTrackIndex];
        const currentContextIdx = contextTracks.findIndex(t => String(t.id) === String(currentTrack?.id));

        let nextContextIdx = currentContextIdx + 1;
        if (nextContextIdx >= contextTracks.length) {
            nextContextIdx = state.repeatMode === "all" ? 0 : Math.max(0, currentContextIdx);
        }

        const targetGlobalIdx = TRACKS.findIndex(t => String(t.id) === String(contextTracks[nextContextIdx].id));
        if (targetGlobalIdx !== -1) loadTrack(targetGlobalIdx, true);
    }

    function playPrevious() {
        if (audio.currentTime > 3) {
            audio.currentTime = 0;
            if (!state.isPlaying) audio.play();
            return;
        }

        const contextTracks = getContextTracks();
        if (contextTracks.length === 0) return;

        if (state.isShuffle) { playRandomTrack(); return; }

        const currentTrack = TRACKS[state.currentTrackIndex];
        const currentContextIdx = contextTracks.findIndex(t => String(t.id) === String(currentTrack?.id));

        let prevContextIdx = currentContextIdx - 1;
        if (prevContextIdx < 0) {
            prevContextIdx = state.repeatMode === "all" ? contextTracks.length - 1 : 0;
        }

        const targetGlobalIdx = TRACKS.findIndex(t => String(t.id) === String(contextTracks[prevContextIdx].id));
        if (targetGlobalIdx !== -1) loadTrack(targetGlobalIdx, true);
    }

    [nextBtn, sheetNextBtn, expandedNextBtn].forEach(b => b?.addEventListener("click", playNext));
    [prevBtn, sheetPrevBtn, expandedPrevBtn].forEach(b => b?.addEventListener("click", playPrevious));

    function toggleShuffle() {
        state.isShuffle = !state.isShuffle;
        [shuffleBtn, sheetShuffleBtn, expandedShuffleBtn].forEach(b => b?.classList.toggle("active", state.isShuffle));
        showToast(state.isShuffle ? "Shuffle Enabled" : "Shuffle Disabled", "fa-shuffle");
    }

    function toggleRepeat() {
        const modes = ["none", "all", "one"];
        const nextIdx = (modes.indexOf(state.repeatMode) + 1) % modes.length;
        state.repeatMode = modes[nextIdx];

        [repeatBtn, sheetRepeatBtn, expandedRepeatBtn].forEach(b => {
            if (!b) return;
            b.classList.toggle("active", state.repeatMode !== "none");
            const icon = b.querySelector("i");
            if (icon) icon.className = state.repeatMode === "one" ? "fa-solid fa-1" : "fa-solid fa-repeat";
        });

        const msgs = { none: "Repeat Off", all: "Repeat All Songs", one: "Repeat Current Song" };
        showToast(msgs[state.repeatMode], "fa-repeat");
    }

    [shuffleBtn, sheetShuffleBtn, expandedShuffleBtn].forEach(b => b?.addEventListener("click", toggleShuffle));
    [repeatBtn, sheetRepeatBtn, expandedRepeatBtn].forEach(b => b?.addEventListener("click", toggleRepeat));

    function seekFromEvent(e, trackEl) {
        const rect = trackEl.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let pct = (clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        if (audio.duration && isFinite(audio.duration)) {
            audio.currentTime = pct * audio.duration;
            if (progressFill) progressFill.style.width = (pct * 100) + "%";
            if (sheetProgressFill) sheetProgressFill.style.width = (pct * 100) + "%";
            if (mobileTopProgressFill) mobileTopProgressFill.style.width = (pct * 100) + "%";
            if (expandedProgressFill) expandedProgressFill.style.width = (pct * 100) + "%";
        }
    }

    function makeSeekable(trackEl) {
        if (!trackEl) return;
        let isDragging = false;

        const start = (e) => { isDragging = true; seekFromEvent(e, trackEl); };
        const move = (e) => { if (!isDragging) return; seekFromEvent(e, trackEl); };
        const end = () => { isDragging = false; };

        trackEl.addEventListener("mousedown", start);
        trackEl.addEventListener("click", (e) => seekFromEvent(e, trackEl));
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", end);

        trackEl.addEventListener("touchstart", (e) => { e.preventDefault(); start(e); }, { passive: false });
        document.addEventListener("touchmove", (e) => { if (isDragging) { e.preventDefault(); move(e); } }, { passive: false });
        document.addEventListener("touchend", end);
    }

    makeSeekable(progressSlider);
    makeSeekable(sheetProgressSlider);
    makeSeekable(expandedProgressSlider);

    function setVolume(pct) {
        pct = Math.max(0, Math.min(1, pct));
        state.volume = pct;
        state.isMuted = (pct === 0);
        audio.volume = pct;
        audio.muted = (pct === 0);
        updateVolumeUI();
    }

    function updateVolumeUI() {
        const pct = state.isMuted ? 0 : state.volume;
        if (volumeFill) volumeFill.style.width = (pct * 100) + "%";
        if (sheetVolumeFill) sheetVolumeFill.style.width = (pct * 100) + "%";

        let iconClass = "fa-solid fa-volume-high";
        if (pct === 0 || state.isMuted) iconClass = "fa-solid fa-volume-xmark";
        else if (pct < 0.45) iconClass = "fa-solid fa-volume-low";
        else iconClass = "fa-solid fa-volume-high";

        if (volumeIcon) volumeIcon.className = iconClass;
        if (sheetVolMuteIcon) sheetVolMuteIcon.className = state.isMuted ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-low";
    }

    function volumeFromEvent(e, trackEl) {
        const rect = trackEl.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let pct = (clientX - rect.left) / rect.width;
        setVolume(pct);
    }

    function makeVolumeDraggable(trackEl) {
        if (!trackEl) return;
        let isDragging = false;

        const start = (e) => { isDragging = true; volumeFromEvent(e, trackEl); };
        const move = (e) => { if (!isDragging) return; volumeFromEvent(e, trackEl); };
        const end = () => { isDragging = false; };

        trackEl.addEventListener("mousedown", start);
        trackEl.addEventListener("click", (e) => volumeFromEvent(e, trackEl));
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", end);

        trackEl.addEventListener("touchstart", (e) => { e.preventDefault(); start(e); }, { passive: false });
        document.addEventListener("touchmove", (e) => { if (isDragging) { e.preventDefault(); move(e); } }, { passive: false });
        document.addEventListener("touchend", end);
    }

    makeVolumeDraggable(volumeSlider);
    makeVolumeDraggable(sheetVolumeSlider);

    function toggleMute() {
        if (state.isMuted) {
            state.isMuted = false;
            audio.muted = false;
            setVolume(state.previousVolume || 0.7);
        } else {
            state.previousVolume = state.volume;
            state.isMuted = true;
            audio.muted = true;
            updateVolumeUI();
        }
    }

    volumeIcon?.addEventListener("click", toggleMute);
    sheetVolMuteIcon?.addEventListener("click", toggleMute);

    document.querySelectorAll(".volume-box, .sheet-volume-row").forEach(box => {
        box.addEventListener("wheel", (e) => {
            e.preventDefault();
            const step = e.deltaY < 0 ? 0.05 : -0.05;
            setVolume(state.volume + step);
        }, { passive: false });
    });

    audio.volume = state.volume;
    updateVolumeUI();

    function renderQueue() {
        if (!queueList) return;
        const current = TRACKS[state.currentTrackIndex];
        let html = `
            <div class="queue-item active" title="Currently Playing">
                <img src="${escapeHtml(current?.cover || DEFAULT_COVER)}" class="queue-thumb" alt="">
                <div class="queue-meta">
                    <p class="queue-item-title">${escapeHtml(current?.title || "No song selected")}</p>
                    <p class="queue-item-artist">${escapeHtml(current?.artist || "")} ${current ? "(Now Playing)" : ""}</p>
                </div>
                <i class="fa-solid fa-volume-high" style="color: var(--accent-green); font-size: 13px;"></i>
            </div>
        `;

        if (state.queue.length === 0) {
            html += `<p style="padding: 16px; font-size: 13px; color: var(--text-muted); text-align: center;">Queue is empty. Next tracks from the library will play automatically.</p>`;
        } else {
            html += state.queue.map((trackId, qIndex) => {
                const t = TRACKS.find(item => String(item.id) === String(trackId));
                if (!t) return "";
                return `
                    <div class="queue-item" data-queue-index="${qIndex}" data-track-id="${escapeHtml(t.id)}">
                        <img src="${escapeHtml(t.cover)}" class="queue-thumb" alt="">
                        <div class="queue-meta">
                            <p class="queue-item-title">${escapeHtml(t.title)}</p>
                            <p class="queue-item-artist">${escapeHtml(t.artist)}</p>
                        </div>
                        <i class="fa-solid fa-play" style="font-size: 12px; color: var(--text-muted);"></i>
                    </div>
                `;
            }).join("");
        }
        queueList.innerHTML = html;

        queueList.querySelectorAll(".queue-item:not(.active)").forEach(item => {
            item.addEventListener("click", () => {
                const tid = item.dataset.trackId;
                const idx = TRACKS.findIndex(t => String(t.id) === String(tid));
                if (idx !== -1) {
                    const qIdx = parseInt(item.dataset.queueIndex, 10);
                    state.queue.splice(qIdx, 1);
                    loadTrack(idx, true);
                }
            });
        });
    }

    function toggleQueue() {
        if (queuePanel) {
            queuePanel.classList.toggle("open");
            if (queuePanel.classList.contains("open")) renderQueue();
        }
    }

    queueBtn?.addEventListener("click", toggleQueue);
    sheetQueueBtn?.addEventListener("click", toggleQueue);
    queueCloseBtn?.addEventListener("click", () => queuePanel?.classList.remove("open"));
    clearQueueBtn?.addEventListener("click", () => {
        state.queue = [];
        renderQueue();
        showToast("Queue cleared");
    });

    document.addEventListener("click", (e) => {
        if (queuePanel && queuePanel.classList.contains("open")) {
            if (!queuePanel.contains(e.target) && !e.target.closest("#queueBtn") && !e.target.closest("#sheetQueueBtn")) {
                queuePanel.classList.remove("open");
            }
        }
    });

    function setActiveFilter(filterName, headingText) {
        state.activeFilter = filterName;
        state.activePlaylistId = null;

        const searchInput = document.getElementById("searchInput");
        if (searchInput) searchInput.value = "";

        const homeViewContainer = document.getElementById("homeViewContainer");
        const plBanner = document.getElementById("playlistDetailBanner");
        const plActionBar = document.getElementById("playlistActionBar");
        const mainTracklist = document.getElementById("mainTracklistSection");

        if (filterName === "all") {
            if (homeViewContainer) homeViewContainer.style.display = "block";
            if (plBanner) plBanner.style.display = "none";
            if (plActionBar) plActionBar.style.display = "none";
            if (mainTracklist) mainTracklist.style.display = "none";
        } else {
            if (homeViewContainer) homeViewContainer.style.display = "none";
            if (plBanner) plBanner.style.display = "none";
            if (plActionBar) plActionBar.style.display = "none";
            if (mainTracklist) mainTracklist.style.display = "block";
        }

        if (tracklistHeading) tracklistHeading.textContent = headingText;
        if (viewFilterPill) {
            viewFilterPill.style.display = filterName === "all" ? "none" : "inline-block";
            viewFilterPill.textContent = headingText;
        }

        if (deleteCurrentPlaylistBtn) deleteCurrentPlaylistBtn.style.display = "none";

        document.querySelectorAll(".sidebar .nav-item").forEach(item => item.classList.remove("active"));
        if (filterName === "all") document.getElementById("navHome")?.classList.add("active");
        else if (filterName === "liked") document.getElementById("navLiked")?.classList.add("active");
        else if (filterName === "local") document.getElementById("navLocal")?.classList.add("active");
        else if (filterName === "recent") document.getElementById("navRecent")?.classList.add("active");

        renderTrackList();
        updatePlayPauseIcons();
    }

    document.getElementById("navHome")?.addEventListener("click", (e) => {
        e.preventDefault();
        setActiveFilter("all", "Home");
        closeDrawer();
    });

    document.getElementById("navLiked")?.addEventListener("click", (e) => {
        e.preventDefault();
        setActiveFilter("liked", "Liked Songs");
        closeDrawer();
    });

    document.getElementById("navLocal")?.addEventListener("click", (e) => {
        e.preventDefault();
        setActiveFilter("local", "My Private Songs");
        closeDrawer();
    });

    document.getElementById("navRecent")?.addEventListener("click", (e) => {
        e.preventDefault();
        setActiveFilter("recent", "Recent History");
        closeDrawer();
    });

    document.getElementById("playAllBtn")?.addEventListener("click", () => {
        const filtered = getFilteredTracks();
        if (filtered.length > 0) {
            const firstIdx = TRACKS.findIndex(t => String(t.id) === String(filtered[0].id));
            loadTrack(firstIdx, true);
            showToast(`Playing ${filtered.length} track${filtered.length === 1 ? "" : "s"}`, "fa-play");
        } else {
            showToast("No tracks available to play", "fa-circle-info");
        }
    });

    // Hero Home Listeners
    document.getElementById("heroListenNowBtn")?.addEventListener("click", () => {
        if (!heroTrack) return showToast("No recommended track found", "fa-circle-info");
        const idx = TRACKS.findIndex(t => String(t.id) === String(heroTrack.id));
        if (idx !== -1) {
            loadTrack(idx, true);
            showToast("Playing Recommended Track", "fa-play");
        }
    });

    document.getElementById("heroQueueBtn")?.addEventListener("click", () => {
        if (!heroTrack) return showToast("No recommended track found", "fa-circle-info");
        if (!state.queue.includes(heroTrack.id)) {
            state.queue.push(heroTrack.id);
            renderQueue();
            showToast(`Added "${heroTrack.title}" to Queue`, "fa-list-check");
        } else {
            showToast("Track is already in queue", "fa-info");
        }
    });

    // Handle Search Bar Interactions
    document.getElementById("searchInput")?.addEventListener("input", (e) => {
        const q = e.target.value.trim();
        const homeViewContainer = document.getElementById("homeViewContainer");
        const mainTracklist = document.getElementById("mainTracklistSection");
        const tracklistHeading = document.getElementById("tracklistHeading");
        const viewFilterPill = document.getElementById("viewFilterPill");

        if (state.activeFilter === "all") {
            if (q.length > 0) {
                if (homeViewContainer) homeViewContainer.style.display = "none";
                if (mainTracklist) mainTracklist.style.display = "block";
                
                if (tracklistHeading) tracklistHeading.textContent = "Search Results";
                if (viewFilterPill) {
                    viewFilterPill.style.display = "inline-block";
                    viewFilterPill.textContent = "Search";
                }
            } else {
                if (homeViewContainer) homeViewContainer.style.display = "block";
                if (mainTracklist) mainTracklist.style.display = "none";
                
                if (tracklistHeading) tracklistHeading.textContent = "Home";
                if (viewFilterPill) viewFilterPill.style.display = "none";
            }
        }
        
        renderTrackList();
    });

    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");
    const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");

    function openDrawer() { sidebar?.classList.add("open"); sidebarOverlay?.classList.add("active"); }
    function closeDrawer() { sidebar?.classList.remove("open"); sidebarOverlay?.classList.remove("active"); }

    mobileMenuBtn?.addEventListener("click", openDrawer);
    sidebarCloseBtn?.addEventListener("click", closeDrawer);
    sidebarOverlay?.addEventListener("click", closeDrawer);

    const mobileSheet = document.getElementById("mobileSheet");
    const mobileExpandBtn = document.getElementById("mobileExpandBtn");
    const sheetCloseBtn = document.getElementById("sheetCloseBtn");

    function openSheet() { mobileSheet?.classList.add("active"); }
    function closeSheet() { mobileSheet?.classList.remove("active"); }

    mobileExpandBtn?.addEventListener("click", (e) => { e.stopPropagation(); openSheet(); });
    document.getElementById("playerBar")?.addEventListener("click", (e) => {
        if (window.innerWidth <= 899 && !e.target.closest("button") && !e.target.closest(".slider-track") && !e.target.closest(".clickable-title") && !e.target.closest(".clickable-cover")) {
            openSheet();
        }
    });
    sheetCloseBtn?.addEventListener("click", closeSheet);

    // =========================================================================
    // 16. NEW DASHBOARD FEATURE MODULES
    // =========================================================================

    // --- A. REAL-TIME AUDIO SPECTRUM VISUALIZER -----------------------------
    let visualizerAnimationId = null;

    function startVisualizer() {
        const canvas = document.getElementById("expandedVisualizerCanvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        function renderFrame() {
            if (!coverExpandedModal?.classList.contains("active")) {
                cancelAnimationFrame(visualizerAnimationId);
                return;
            }

            const width = (canvas.width = canvas.clientWidth || 320);
            const height = (canvas.height = canvas.clientHeight || 54);
            ctx.clearRect(0, 0, width, height);

            // High-fidelity dynamic rhythmic visualizer when playing or ambient wave when paused
            const barCount = 28;
            const barWidth = Math.max(3, (width / barCount) - 4);
            const t = Date.now() * 0.004;
            const vol = state.isMuted ? 0 : (state.volume || 0.7);

            for (let i = 0; i < barCount; i++) {
                let barHeight;
                if (state.isPlaying && vol > 0) {
                    // Multi-band harmonic synthesis based on track time, tempo, and band position
                    const bassPulse = Math.sin(t * 4) * 0.35 + 0.65;
                    const midRhythm = Math.sin(t * 7 + i * 0.6) * 0.3;
                    const treblNoise = Math.cos(t * 11 + i * 1.3) * 0.2;
                    const curve = Math.sin((i / barCount) * Math.PI); // arch distribution
                    const wave = Math.max(0.12, (bassPulse * curve * 0.7 + midRhythm * 0.25 + treblNoise * 0.15 + 0.25));
                    barHeight = Math.max(4, wave * vol * (height - 8));
                } else {
                    // Gentle ambient wave
                    barHeight = Math.max(3, 4 + Math.sin(t * 0.7 + i * 0.35) * 3);
                }

                const x = i * (barWidth + 4);
                const y = height - barHeight;

                const grad = ctx.createLinearGradient(0, y, 0, height);
                if (state.isPlaying) {
                    grad.addColorStop(0, "#00f5d4");
                    grad.addColorStop(0.55, "#9d4edd");
                    grad.addColorStop(1, "#ff2a85");
                    ctx.shadowColor = "rgba(0, 245, 212, 0.55)";
                    ctx.shadowBlur = 10;
                } else {
                    grad.addColorStop(0, "rgba(0, 245, 212, 0.35)");
                    grad.addColorStop(1, "rgba(157, 78, 221, 0.3)");
                    ctx.shadowColor = "transparent";
                    ctx.shadowBlur = 0;
                }

                ctx.fillStyle = grad;
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
                    ctx.fill();
                } else {
                    ctx.fillRect(x, y, barWidth, barHeight);
                }
                ctx.shadowBlur = 0;
            }

            visualizerAnimationId = requestAnimationFrame(renderFrame);
        }

        if (visualizerAnimationId) cancelAnimationFrame(visualizerAnimationId);
        visualizerAnimationId = requestAnimationFrame(renderFrame);
    }

    function stopVisualizer() {
        if (visualizerAnimationId) cancelAnimationFrame(visualizerAnimationId);
    }

    // --- B. SLEEP TIMER -----------------------------------------------------
    function startSleepTimer(minutes) {
        clearSleepTimer();
        const badge = document.getElementById("sleepTimerBadge");
        const cancelBtn = document.getElementById("turnOffSleepTimerBtn");

        if (minutes === "track") {
            state.sleepTimer.endOfTrack = true;
            if (badge) {
                badge.style.display = "inline-block";
                badge.textContent = "Song";
            }
            if (cancelBtn) cancelBtn.style.display = "flex";
            showToast("Sleep timer: Pauses after current track 🌙", "fa-moon");
            closeSleepTimerModal();
            return;
        }

        const mins = parseInt(minutes, 10);
        if (isNaN(mins) || mins <= 0) return;

        state.sleepTimer.targetTimestamp = Date.now() + mins * 60 * 1000;
        if (badge) {
            badge.style.display = "inline-block";
            badge.textContent = `${mins}m`;
        }
        if (cancelBtn) cancelBtn.style.display = "flex";

        showToast(`Sleep timer set for ${mins} minutes 🌙`, "fa-moon");
        closeSleepTimerModal();

        state.sleepTimer.intervalId = setInterval(() => {
            const remainingMs = state.sleepTimer.targetTimestamp - Date.now();
            if (remainingMs <= 0) {
                clearSleepTimer();
                audio.pause();
                state.isPlaying = false;
                updatePlayPauseIcons();
                showToast("Sleep timer ended. Goodnight! 🌙", "fa-moon");
                return;
            }

            if (remainingMs <= 10000) {
                const fadeFactor = remainingMs / 10000;
                audio.volume = state.volume * fadeFactor;
            }

            const remMins = Math.ceil(remainingMs / 60000);
            if (badge) badge.textContent = `${remMins}m`;
        }, 1000);
    }

    function clearSleepTimer() {
        if (state.sleepTimer.intervalId) clearInterval(state.sleepTimer.intervalId);
        state.sleepTimer.intervalId = null;
        state.sleepTimer.targetTimestamp = null;
        state.sleepTimer.endOfTrack = false;
        audio.volume = state.isMuted ? 0 : state.volume;

        const badge = document.getElementById("sleepTimerBadge");
        if (badge) badge.style.display = "none";
        const cancelBtn = document.getElementById("turnOffSleepTimerBtn");
        if (cancelBtn) cancelBtn.style.display = "none";
    }

    function openSleepTimerModal() {
        document.getElementById("sleepTimerModal")?.classList.add("active");
    }
    function closeSleepTimerModal() {
        document.getElementById("sleepTimerModal")?.classList.remove("active");
    }

    document.getElementById("sleepTimerBtn")?.addEventListener("click", openSleepTimerModal);
    document.getElementById("closeSleepTimerBtn")?.addEventListener("click", closeSleepTimerModal);
    document.getElementById("turnOffSleepTimerBtn")?.addEventListener("click", () => {
        clearSleepTimer();
        showToast("Sleep timer turned off", "fa-circle-check");
        closeSleepTimerModal();
    });

    document.querySelectorAll(".sleep-opt-btn[data-minutes]").forEach((btn) => {
        btn.addEventListener("click", () => {
            startSleepTimer(btn.dataset.minutes);
        });
    });

    // --- E. PLAYBACK SPEED --------------------------------------------------
    function setPlaybackSpeed(speed) {
        state.playbackSpeed = speed;
        audio.playbackRate = speed;
        const speedBtn = document.getElementById("speedBtn");
        if (speedBtn) speedBtn.textContent = `${speed}x`;

        document.querySelectorAll(".speed-option").forEach((opt) => {
            opt.classList.toggle("active", parseFloat(opt.dataset.speed) === speed);
        });
        document.getElementById("speedPopover")?.classList.remove("active");
        showToast(`Speed: ${speed}x`, "fa-gauge-high");
    }

    document.getElementById("speedBtn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        document.getElementById("speedPopover")?.classList.toggle("active");
    });

    document.querySelectorAll(".speed-option").forEach((opt) => {
        opt.addEventListener("click", () => {
            setPlaybackSpeed(parseFloat(opt.dataset.speed));
        });
    });

    // --- F. FLOATING TRACK CONTEXT MENU -------------------------------------
    let contextTargetTrackId = null;

    function openTrackContextMenu(e, trackId) {
        contextTargetTrackId = trackId;
        const menu = document.getElementById("trackContextMenu");
        if (!menu) return;

        menu.style.display = "block";
        const menuWidth = 210;
        const menuHeight = 220;

        let x = e.clientX;
        let y = e.clientY;

        if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 16;
        if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 16;
        if (x < 12) x = 12;
        if (y < 12) y = 12;

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    }

    function closeTrackContextMenu() {
        const menu = document.getElementById("trackContextMenu");
        if (menu) menu.style.display = "none";
    }

    async function downloadTrackAudio(track) {
        if (!track || !track.src) return;
        showToast(`Downloading "${track.title}"...`, "fa-download");
        try {
            const res = await fetch(track.src);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const ext = track.src.split(".").pop().split("?")[0] || "mp3";
            a.download = `${track.artist} - ${track.title}.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            showToast(`Downloaded "${track.title}"!`, "fa-circle-check");
        } catch (err) {
            const a = document.createElement("a");
            a.href = track.src;
            a.target = "_blank";
            a.download = `${track.artist} - ${track.title}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    }

    document.getElementById("ctxPlayNext")?.addEventListener("click", () => {
        if (!contextTargetTrackId) return;
        const track = TRACKS.find((t) => String(t.id) === String(contextTargetTrackId));
        if (track) {
            state.queue = [track.id, ...state.queue.filter((id) => id !== track.id)];
            renderQueue();
            showToast(`"${track.title}" will play next`, "fa-angles-right");
        }
        closeTrackContextMenu();
    });

    document.getElementById("ctxAddToQueue")?.addEventListener("click", () => {
        if (contextTargetTrackId) addTrackToQueue(contextTargetTrackId);
        closeTrackContextMenu();
    });

    document.getElementById("ctxAddToPlaylist")?.addEventListener("click", () => {
        if (contextTargetTrackId) openAddToPlaylistModal(contextTargetTrackId);
        closeTrackContextMenu();
    });

    document.getElementById("ctxDownloadTrack")?.addEventListener("click", () => {
        const track = TRACKS.find((t) => String(t.id) === String(contextTargetTrackId));
        if (track) downloadTrackAudio(track);
        closeTrackContextMenu();
    });

    document.getElementById("ctxCopyLink")?.addEventListener("click", () => {
        const track = TRACKS.find((t) => String(t.id) === String(contextTargetTrackId));
        if (track) {
            navigator.clipboard.writeText(track.src).then(() => {
                showToast("Audio link copied to clipboard!", "fa-link");
            }).catch(() => {
                showToast("Failed to copy link", "fa-triangle-exclamation");
            });
        }
        closeTrackContextMenu();
    });

    // --- G. KEYBOARD SHORTCUTS MODAL ----------------------------------------
    function openShortcutsModal() {
        document.getElementById("shortcutsModal")?.classList.add("active");
    }
    function closeShortcutsModal() {
        document.getElementById("shortcutsModal")?.classList.remove("active");
    }

    document.getElementById("shortcutsBtn")?.addEventListener("click", openShortcutsModal);
    document.getElementById("closeShortcutsModalBtn")?.addEventListener("click", closeShortcutsModal);

    // --- H. MOOD & GENRE PILLS ----------------------------------------------
    function initMoodPills() {
        document.querySelectorAll("#moodPillsBar .mood-pill").forEach((pill) => {
            pill.addEventListener("click", () => {
                document.querySelectorAll("#moodPillsBar .mood-pill").forEach((p) => p.classList.remove("active"));
                pill.classList.add("active");
                state.activeMood = pill.dataset.mood;
                renderHomeSections();
            });
        });

        document.getElementById("viewAllRecentBtn")?.addEventListener("click", () => {
            setActiveFilter("recent", "Recent History");
        });
    }

    // Dismiss popovers on outside click
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#trackContextMenu") && !e.target.closest(".btn-row-more")) {
            closeTrackContextMenu();
        }
        if (!e.target.closest("#speedPopover") && !e.target.closest("#speedBtn")) {
            document.getElementById("speedPopover")?.classList.remove("active");
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && changePasswordModal?.classList.contains("active")) {
            closeChangePasswordModal();
            return;
        }

        if (["input", "textarea"].includes(document.activeElement?.tagName.toLowerCase())) return;

        if (e.key === "Escape") {
            closeEnlargedCover();
            closeUploadModal();
            closeCreatePlaylistModal();
            closeEditPlaylistModal();
            closeChangePasswordModal();
            closeSleepTimerModal();
            closeShortcutsModal();
            closeTrackContextMenu();
            document.getElementById("speedPopover")?.classList.remove("active");
            addToPlaylistModal?.classList.remove("active");
            selectSongsModal?.classList.remove("active");
            queuePanel?.classList.remove("open");
            userInfoCard?.classList.remove("open");
            userProfileBtn?.classList.remove("active");
        } else if (e.code === "Space") {
            e.preventDefault();
            togglePlayPause();
        } else if (e.code === "ArrowRight") {
            e.preventDefault();
            audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
        } else if (e.code === "ArrowLeft") {
            e.preventDefault();
            audio.currentTime = Math.max(0, audio.currentTime - 5);
        } else if (e.code === "ArrowUp") {
            e.preventDefault();
            setVolume(state.volume + 0.05);
        } else if (e.code === "ArrowDown") {
            e.preventDefault();
            setVolume(state.volume - 0.05);
        } else if (e.key.toLowerCase() === "m") {
            toggleMute();
        } else if (e.key.toLowerCase() === "s") {
            toggleShuffle();
        } else if (e.key.toLowerCase() === "r") {
            toggleRepeat();
        } else if (e.key === "?") {
            openShortcutsModal();
        }
    });

    // --- INITIALIZATION: Load data from server ---
    initMoodPills();
    await fetchSongs();
    await loadLibrary();
    renderHomeSections();
    renderSidebarPlaylists();

    // --- DEEP LINK SHARED PLAYLIST ROUTING ---
    const urlParams = new URLSearchParams(window.location.search);
    const sharedPlId = urlParams.get('playlist');
    
    if (sharedPlId) {
        try {
            const data = await api(`/playlists/${sharedPlId}`);
            
            // Map the populated songs and push to TRACKS if they don't exist
            const mappedTracks = data.songs.map(mapSong);
            mappedTracks.forEach(mt => {
                if (!TRACKS.find(t => String(t.id) === String(mt.id))) {
                    TRACKS.push(mt);
                }
            });
            
            const sharedPl = {
                id: String(data._id),
                name: data.name,
                description: data.description || "",
                isPrivate: data.isPrivate !== false,
                coverUrl: data.coverUrl || "",
                trackIds: mappedTracks.map(t => String(t.id)),
                isOwned: isLoggedIn() && currentUserId === String(data.user._id),
                creatorName: data.user.name,
                creatorAvatar: data.user.avatarUrl
            };
            
            if (!playlists.find(p => p.id === sharedPl.id)) {
                playlists.push(sharedPl);
            }
            selectPlaylist(sharedPl.id, false);
            
            // Rewrite URL seamlessly to clean it up
            window.history.replaceState({}, document.title, window.location.pathname);
            
        } catch (err) {
            showToast("Shared playlist not found", "fa-triangle-exclamation");
            setActiveFilter("all", "Home");
        }
    } else {
        setActiveFilter("all", "Home");
    }

    if (TRACKS.length > 0 && !sharedPlId) {
        loadTrack(0, false);
    } else if (sharedPlId) {
        const currentPl = playlists.find(p => p.id === sharedPlId);
        if (currentPl && currentPl.trackIds && currentPl.trackIds.length > 0) {
             const firstGlobalIdx = TRACKS.findIndex(t => String(t.id) === String(currentPl.trackIds[0]));
             if (firstGlobalIdx !== -1) loadTrack(firstGlobalIdx, false);
        }
    }
    
    syncGlobalLikeState();
    updateBadgeCounts();
});