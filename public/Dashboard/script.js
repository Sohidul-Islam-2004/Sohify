// ==========================================================================
// 1. CONFIGURATION: BACKEND API
// ==========================================================================
// Backend API Base URL (Matches your server on port 5000)
const API_BASE_URL = "/api";

// ==========================================================================
// 2. API HELPERS (all data lives in MongoDB; all files live in Supabase)
// ==========================================================================
async function api(path, options = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
    return data;
}

const jsonOpts = (method, body) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
});

// ==========================================================================
// 3. MAIN DASHBOARD APPLICATION
// ==========================================================================
document.addEventListener("DOMContentLoaded", async () => {

    // --- A. Toast Notification Helper --------------------------------------
    const toastContainer = document.getElementById("toastContainer");
    function showToast(message, icon = "fa-circle-check") {
        if (!toastContainer) return;
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => toast.classList.add("show"), 10);
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 350);
        }, 2800);
    }

    // --- B. Authentication & User Profile Sync (Reads server values) -------
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
    const cardLogoutBtn = document.getElementById("cardLogoutBtn");
    const userAvatarInput = document.getElementById("userAvatarInput");
    const headerUploadBtn = document.getElementById("headerUploadBtn");

    // Read stored credentials saved by login.js (checks localStorage first, fallback sessionStorage)
    const currentUserEmail = localStorage.getItem("sohify_user") || sessionStorage.getItem("sohify_user");
    const currentUserName = localStorage.getItem("sohify_username") || sessionStorage.getItem("sohify_username");
    const currentUserId = localStorage.getItem("sohify_user_id") || sessionStorage.getItem("sohify_user_id") || "guest";

    // Check isAdmin boolean value from MongoDB login response
    const isAdmin = (localStorage.getItem("sohify_is_admin") === "true") || (sessionStorage.getItem("sohify_is_admin") === "true");

    // RESTRICTION: "Upload Audio" is ONLY visible for verified Admin
    if (currentUserEmail && isAdmin) {
        if (headerUploadBtn) headerUploadBtn.style.display = "inline-flex";
    } else {
        if (headerUploadBtn) headerUploadBtn.style.display = "none";
    }

    // Avatar (stored in Supabase, URL kept in MongoDB)
    const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop";
    let userAvatarUrl = DEFAULT_AVATAR; // replaced by the Supabase URL after the library loads
    const savedUserAvatar = DEFAULT_AVATAR;

    // Update Header & Popover with server data
    if (currentUserEmail && currentUserName) {
        if (displayUserName) displayUserName.textContent = currentUserName;
        if (cardUserName) cardUserName.textContent = currentUserName;
        if (cardUserEmail) cardUserEmail.textContent = currentUserEmail;
        if (cardUserRole) {
            cardUserRole.textContent = isAdmin ? "Admin" : "Regular Listener";
            cardUserRole.className = `role-badge ${isAdmin ? 'admin' : 'listener'}`;
        }
        if (authBtn) authBtn.style.display = "none";
    } else {
        if (displayUserName) displayUserName.textContent = "Guest Listener";
        if (cardUserName) cardUserName.textContent = "Guest Listener";
        if (cardUserEmail) cardUserEmail.textContent = "Not signed in";
        if (cardUserRole) cardUserRole.textContent = "Guest";
        if (cardLogoutBtn) cardLogoutBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> <span>Log In</span>`;
    }

    if (userAvatar) userAvatar.src = savedUserAvatar;
    if (cardAvatarImg) cardAvatarImg.src = savedUserAvatar;

    // Toggle User Info Card when clicking user profile
    userProfileBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        userProfileBtn.classList.toggle("active");
        userInfoCard?.classList.toggle("open");
        updateUserCardStats();
    });

    document.addEventListener("click", (e) => {
        if (userInfoCard && userInfoCard.classList.contains("open")) {
            if (!userInfoCard.contains(e.target) && !userProfileBtn.contains(e.target)) {
                userInfoCard.classList.remove("open");
                userProfileBtn?.classList.remove("active");
            }
        }
    });

    // Profile photo upload option
    cardAvatarUploadBtn?.addEventListener("click", () => userAvatarInput?.click());

    userAvatarInput?.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file || !file.type.startsWith("image/")) return;
        if (!isLoggedIn()) { showToast("Please log in to change your picture", "fa-lock"); return; }

        try {
            const formData = new FormData();
            formData.append("avatar", file);
            const data = await api(`/users/${currentUserId}/avatar`, { method: "POST", body: formData });
            userAvatarUrl = data.avatarUrl;
            if (userAvatar) userAvatar.src = userAvatarUrl;
            if (cardAvatarImg) cardAvatarImg.src = userAvatarUrl;
            showToast("Profile picture updated!", "fa-camera");
        } catch (err) {
            showToast(err.message || "Avatar upload failed", "fa-triangle-exclamation");
        }
    });

    // Logout Button (Located under user info card)
    cardLogoutBtn?.addEventListener("click", () => {
        localStorage.removeItem("sohify_user");
        localStorage.removeItem("sohify_username");
        localStorage.removeItem("sohify_user_id");
        localStorage.removeItem("sohify_is_admin");
        localStorage.removeItem("sohify_token");

        sessionStorage.clear();
        showToast("Logged out successfully");
        setTimeout(() => window.location.href = "/", 500);
    });

    function updateUserCardStats() {
        const likedCount = TRACKS.filter(t => t.liked).length;
        const localCount = TRACKS.filter(t => t.isLocal).length;
        const plCount = playlists.length;
        document.getElementById("cardStatLiked") && (document.getElementById("cardStatLiked").textContent = likedCount);
        document.getElementById("cardStatLocal") && (document.getElementById("cardStatLocal").textContent = localCount);
        document.getElementById("cardStatPlaylists") && (document.getElementById("cardStatPlaylists").textContent = plCount);
    }

    // --- C/D. Likes, Recents & Playlists live in MongoDB -------------------
    let playlists = [];
    let initialRecent = [];
    const isLoggedIn = () => !!currentUserId && currentUserId !== "guest";
    function requireLogin(msg = "Please log in to use this feature") {
        if (isLoggedIn()) return true;
        showToast(msg, "fa-lock");
        return false;
    }

    // --- E. Initial Tracks & MongoDB Cloud Catalog Fetch -------------------
    const DEFAULT_COVER = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop";

    let TRACKS = [];

    // Convert a MongoDB song document into the shape the UI uses
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
            isLocal: !!s.isPrivate // "Private" = only visible to the uploader
        };
    }

    // Songs: public catalog + this user's private songs (MongoDB; files from Supabase)
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

    // Library: likes, recents, playlists, avatar (MongoDB)
    async function loadLibrary() {
        if (!isLoggedIn()) return;
        try {
            const lib = await api(`/users/${currentUserId}/library`);
            const liked = new Set(lib.likedSongs || []);
            TRACKS.forEach(t => { t.liked = liked.has(t.id); });
            initialRecent = lib.recentSongs || [];
            playlists = (lib.playlists || []).map(p => ({ id: p._id, name: p.name, trackIds: p.songs || [] }));
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

    await fetchSongs();
    await loadLibrary();

    const CARDS = [
        {
            title: "Acoustic Chill",
            desc: "Soft guitar melodies & soothing vocals",
            cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop",
            trackIndex: 1
        },
        {
            title: "Cyberpunk 2099",
            desc: "Dark synthwave & driving basslines",
            cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop",
            trackIndex: 0
        },
        {
            title: "Top Global 50",
            desc: "The most streamed tracks right now",
            cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop",
            trackIndex: 2
        },
        {
            title: "Deep Focus Flow",
            desc: "Ambient textures for high productivity",
            cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop",
            trackIndex: 3
        }
    ];

    // --- F. Audio Player State & References --------------------------------
    const audio = document.getElementById("audioElement");

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
        isCloudUploadMode: false
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
    const confirmUploadBtnText = document.getElementById("confirmUploadBtnText");
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
        document.querySelectorAll(".playPauseBtn").forEach(btn => {
            const icon = btn.querySelector("i");
            if (icon) {
                icon.className = state.isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
            }
        });

        // Toggle Big Playlist Play Button icon
        const plBigPlayBtn = document.getElementById("plBigPlayBtn");
        if (plBigPlayBtn) {
            const icon = plBigPlayBtn.querySelector("i");
            // Check if audio is playing and currently in playlist view
            const isPlayingThisPl = state.isPlaying && state.activeFilter === "playlist";
            if (icon) {
                icon.className = isPlayingThisPl ? "fa-solid fa-pause" : "fa-solid fa-play";
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
    }

    function closeEnlargedCover() {
        coverExpandedModal?.classList.remove("active");
    }

    currentTitle?.addEventListener("click", (e) => { e.stopPropagation(); openEnlargedCover(); });
    currentCover?.addEventListener("click", (e) => { e.stopPropagation(); openEnlargedCover(); });
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
    function renderSidebarPlaylists() {
        if (!playlistNavList) return;
        playlistNavList.innerHTML = playlists.map(pl => {
            const isActive = state.activeFilter === "playlist" && state.activePlaylistId === pl.id;
            const songCount = pl.trackIds ? pl.trackIds.length : 0;
            return `
                <li class="nav-item ${isActive ? 'active' : ''}" data-playlist-id="${pl.id}">
                    <a href="#">
                        <i class="fa-solid fa-music"></i>
                        <span class="playlist-text">${pl.name}</span>
                        <span class="badge-count">${songCount}</span>
                    </a>
                    <button class="btn-delete-playlist" data-playlist-id="${pl.id}" title="Delete ${pl.name}">
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

        // 1. Hide Home Hero & Recommended Grid
        const heroBanner = document.getElementById("heroBanner");
        const recommendedSection = document.getElementById("recommendedSection");
        if (heroBanner) heroBanner.style.display = "none";
        if (recommendedSection) recommendedSection.style.display = "none";

        // 2. Show & Populate Spotify-Style Playlist Banner
        const plBanner = document.getElementById("playlistDetailBanner");
        const plActionBar = document.getElementById("playlistActionBar");
        if (plBanner) plBanner.style.display = "flex";
        if (plActionBar) plActionBar.style.display = "flex";

        const plTracks = (pl.trackIds || []).map(tid => TRACKS.find(t => String(t.id) === String(tid))).filter(Boolean);

        // Compute total duration
        let totalSeconds = 0;
        plTracks.forEach(t => {
            if (t.duration && t.duration.includes(":")) {
                const parts = t.duration.split(":");
                totalSeconds += (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
            }
        });
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;

        document.getElementById("plDetailTitle") && (document.getElementById("plDetailTitle").textContent = pl.name);
        document.getElementById("plMetaSongCount") && (document.getElementById("plMetaSongCount").textContent = `${plTracks.length} song${plTracks.length === 1 ? '' : 's'}`);
        document.getElementById("plMetaDuration") && (document.getElementById("plMetaDuration").textContent = `${mins} min ${secs} sec`);

        const plCoverImg = document.getElementById("plDetailCover");
        if (plCoverImg) {
            plCoverImg.src = plTracks.length > 0 ? plTracks[0].cover : DEFAULT_COVER;
        }

        const userName = currentUserName || "Listener";
        const userAvatarSrc = userAvatarUrl;
        document.getElementById("plCreatorName") && (document.getElementById("plCreatorName").textContent = userName);
        document.getElementById("plCreatorAvatar") && (document.getElementById("plCreatorAvatar").src = userAvatarSrc);

        // Big Play Button Handler (reads fresh trackIds so newly-added songs play)
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
                    }
                }
            };
        }

        const plActionDeleteBtn = document.getElementById("plActionDeleteBtn");
        if (plActionDeleteBtn) {
            plActionDeleteBtn.onclick = () => deletePlaylist(pl.id);
        }

        const plActionShuffleBtn = document.getElementById("plActionShuffleBtn");
        if (plActionShuffleBtn) {
            plActionShuffleBtn.onclick = () => {
                state.isShuffle = true;
                toggleShuffle();
                playRandomTrack();
            };
        }

        // 3. Highlight Sidebar Active Item
        document.querySelectorAll(".sidebar .nav-item").forEach(i => i.classList.remove("active"));
        const activeLi = playlistNavList.querySelector(`.nav-item[data-playlist-id="${pl.id}"]`);
        if (activeLi) activeLi.classList.add("active");

        renderTrackList();

        if (autoPlayInOrder && plTracks.length > 0) {
            const firstTrackGlobalIdx = TRACKS.findIndex(t => String(t.id) === String(plTracks[0].id));
            if (firstTrackGlobalIdx !== -1) {
                loadTrack(firstTrackGlobalIdx, true);
                showToast(`Playing playlist "${pl.name}" in order`, "fa-play");
            }
        }
    }

    function openCreatePlaylistModal() {
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
            const newPl = { id: String(pl._id), name: pl.name, trackIds: [] };
            playlists.push(newPl);
            renderSidebarPlaylists();
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
            showToast(`Deleted playlist "${pl.name}"`, "fa-trash-can");

            if (state.activeFilter === "playlist" && state.activePlaylistId === plId) {
                setActiveFilter("all", "Recently Played");
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

    function openAddToPlaylistModal(trackId) {
        const track = TRACKS.find(t => String(t.id) === String(trackId));
        if (!track || !addToPlaylistModal) return;

        songTargetForPlaylist = track;
        if (addToPlaylistSongTitle) addToPlaylistSongTitle.textContent = `Add "${track.title}" to:`;

        if (playlists.length === 0) {
            modalPlaylistOptions.innerHTML = `<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 12px;">No playlists found. Create one first!</p>`;
        } else {
            modalPlaylistOptions.innerHTML = playlists.map(pl => {
                const alreadyIn = pl.trackIds && pl.trackIds.includes(track.id);
                return `
                    <div class="modal-pl-option" data-pl-id="${pl.id}">
                        <span class="modal-pl-option-name">
                            <i class="fa-solid fa-music" style="color: var(--accent-green);"></i> ${pl.name}
                        </span>
                        <span class="modal-pl-option-count">
                            ${alreadyIn ? '<span style="color: var(--accent-green);"><i class="fa-solid fa-check"></i> Added</span>' : '+ Add'}
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
            pl.trackIds = data.songs;
            showToast(data.added ? `Added to "${pl.name}"` : `Removed from "${pl.name}"`,
                data.added ? "fa-circle-check" : "fa-circle-minus");
        } catch (err) {
            showToast(err.message || "Could not update playlist", "fa-triangle-exclamation");
            return;
        }

        renderSidebarPlaylists();
        addToPlaylistModal.classList.remove("active");

        if (state.activeFilter === "playlist" && state.activePlaylistId === plId) {
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

        // Include both online tracks and local tracks
        const availableTracks = TRACKS.filter(t => {
            if (!q) return true;
            const titleMatch = t.title.toLowerCase().includes(q);
            const artistMatch = t.artist.toLowerCase().includes(q);
            const typeMatch = t.isLocal ? "local".includes(q) : "cloud online server".includes(q);
            return titleMatch || artistMatch || typeMatch;
        });

        if (availableTracks.length === 0) {
            selectSongsList.innerHTML = `<p style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">No songs found matching "${filterQuery}".</p>`;
            return;
        }

        selectSongsList.innerHTML = availableTracks.map(t => {
            const isAdded = pl.trackIds.some(id => String(id) === String(t.id));
            return `
                <div class="select-song-item" data-track-id="${t.id}">
                    <img src="${t.cover}" class="select-song-thumb" alt="${t.title}">
                    <div class="select-song-meta">
                        <div class="select-song-title">${t.title}</div>
                        <div class="select-song-subtitle">
                            <span>${t.artist}</span>
                            <span class="song-source-badge ${t.isLocal ? 'local' : 'cloud'}">
                                ${t.isLocal ? '<i class="fa-solid fa-lock"></i> Private' : '<i class="fa-solid fa-cloud"></i> Server'}
                            </span>
                            <span>• ${t.duration || '--:--'}</span>
                        </div>
                    </div>
                    <button class="btn-toggle-pl-song ${isAdded ? 'added' : ''}" data-track-id="${t.id}">
                        ${isAdded ? '<i class="fa-solid fa-check"></i> Added' : '<i class="fa-solid fa-plus"></i> Add'}
                    </button>
                </div>
            `;
        }).join("");

        // Attach click listener for toggling each song in/out of the playlist
        selectSongsList.querySelectorAll(".btn-toggle-pl-song").forEach(btn => {
            btn.addEventListener("click", async () => {
                const trackIdStr = String(btn.dataset.trackId);
                if (!requireLogin("Please log in to edit playlists")) return;
                try {
                    await api(`/playlists/${pl.id}/toggle-song`, jsonOpts("PUT", { songId: trackIdStr, userId: currentUserId }));
                } catch (err) {
                    showToast(err.message || "Could not update playlist", "fa-triangle-exclamation");
                    return;
                }
                const track = TRACKS.find(t => String(t.id) === trackIdStr);
                const isCurrentlyAdded = pl.trackIds.some(id => String(id) === trackIdStr);

                if (isCurrentlyAdded) {
                    // Remove song
                    pl.trackIds = pl.trackIds.filter(id => String(id) !== trackIdStr);
                    btn.classList.remove("added");
                    btn.innerHTML = `<i class="fa-solid fa-plus"></i> Add`;
                    showToast(`Removed "${track?.title}" from playlist`, "fa-circle-minus");
                } else {
                    // Add song
                    if (track) pl.trackIds.push(track.id);
                    btn.classList.add("added");
                    btn.innerHTML = `<i class="fa-solid fa-check"></i> Added`;
                    showToast(`Added "${track?.title}" to playlist`, "fa-circle-check");
                }

                // (playlist already saved to MongoDB above)
                renderSidebarPlaylists();
                renderTrackList();

                // Recalculate duration & song counts in playlist header
                const updatedTracks = pl.trackIds
                    .map(id => TRACKS.find(t => String(t.id) === String(id)))
                    .filter(Boolean);
                let totalSecs = 0;
                updatedTracks.forEach(t => {
                    // Only accept valid "m:ss" style durations (ignores "--:--")
                    if (t.duration && /^\d+:\d+$/.test(t.duration)) {
                        const parts = t.duration.split(":");
                        totalSecs += (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
                    }
                });
                const mins = Math.floor(totalSecs / 60);
                const secs = totalSecs % 60;

                const countEl = document.getElementById("plMetaSongCount");
                const durEl = document.getElementById("plMetaDuration");
                if (countEl) countEl.textContent = `${updatedTracks.length} song${updatedTracks.length === 1 ? '' : 's'}`;
                if (durEl) durEl.textContent = `${mins} min ${secs} sec`;
            });
        });
    }

    // Open Modal
    plActionAddSongsBtn?.addEventListener("click", () => {
        if (!state.activePlaylistId) return;
        const pl = playlists.find(p => p.id === state.activePlaylistId);
        if (!pl) return;

        if (selectSongsModalPlName) selectSongsModalPlName.textContent = pl.name;
        if (searchSongsForPlInput) searchSongsForPlInput.value = "";

        renderSelectSongsList("");
        selectSongsModal?.classList.add("active");
    });

    // Close Modal (X, Done, backdrop)
    closeSelectSongsModalBtn?.addEventListener("click", () => selectSongsModal?.classList.remove("active"));
    doneSelectSongsBtn?.addEventListener("click", () => selectSongsModal?.classList.remove("active"));
    selectSongsModal?.addEventListener("click", (e) => {
        if (e.target === selectSongsModal) selectSongsModal.classList.remove("active");
    });

    // Filter songs on typing
    searchSongsForPlInput?.addEventListener("input", (e) => {
        renderSelectSongsList(e.target.value);
    });

    // Read the audio length in the browser so it can be stored in MongoDB
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
        if (!uploadSongModal) return;
        state.isCloudUploadMode = isCloud;

        if (isCloud) {
            if (uploadModalTitle) uploadModalTitle.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Admin Cloud Upload (Supabase + MongoDB)`;
            if (confirmUploadBtnText) confirmUploadBtnText.textContent = "Upload to Cloud Catalog";
        } else {
            if (uploadModalTitle) uploadModalTitle.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Private Song (Cloud, Only You)`;
            if (confirmUploadBtnText) confirmUploadBtnText.textContent = "Upload Privately & Play";
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
        const artist = (uploadSongArtist?.value || "").trim() || (state.isCloudUploadMode ? "SoundPulse Artist" : "Unknown Artist");


        confirmUploadBtn.disabled = true;
        confirmUploadBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;

        try {
            const isPrivate = !state.isCloudUploadMode;
            if (!isLoggedIn()) throw new Error("Please log in to upload songs.");
            if (!isPrivate && !isAdmin) throw new Error("Only admins can publish to the cloud catalog.");

            showToast(isPrivate ? "Saving to your private library..." : "Uploading to server...", "fa-cloud-arrow-up");

            const album = (uploadSongAlbum?.value || "").trim();
            const duration = await getAudioDuration(currentSelectedAudioFile);

            // Files go to Supabase Storage, metadata goes to MongoDB (done by the backend)
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
                renderTrackList();
            }
            loadTrack(0, true);

            closeUploadModal();
        } catch (error) {
            console.error(error);
            showToast(error.message || "Upload failed", "fa-triangle-exclamation");
        } finally {
            confirmUploadBtn.disabled = false;
            confirmUploadBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span id="confirmUploadBtnText">${state.isCloudUploadMode ? 'Upload to Cloud Catalog' : 'Upload Privately & Play'}</span>`;
        }
    });

    // Drag-and-drop file listeners
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

    [createPlaylistModal, addToPlaylistModal, uploadSongModal].forEach(m => {
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
            list = state.recentPlayed.length ? state.recentPlayed.map(id => TRACKS.find(t => String(t.id) === String(id))).filter(Boolean) : list;
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
                emptyMsg = "No private songs yet! Click 'Add Private Song' to upload songs only you can see.";
            } else if (state.activeFilter === "playlist") {
                emptyMsg = "This playlist is empty. Add songs by clicking the '+' icon next to any song in the list!";
            }

            trackList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid ${state.activeFilter === 'liked' ? 'fa-heart-crack' : 'fa-music'}"></i>
                    <h3>${state.activeFilter === 'liked' ? 'No Liked Songs Yet' : 'No Tracks Here'}</h3>
                    <p>${emptyMsg}</p>
                    <button class="btn btn-green" id="emptyActionBtn">
                        ${state.activeFilter === 'local' ? '<i class="fa-solid fa-cloud-arrow-up"></i> Import Local Song' : '<i class="fa-solid fa-house"></i> Back to Home'}
                    </button>
                </div>
            `;

            document.getElementById("emptyActionBtn")?.addEventListener("click", () => {
                if (state.activeFilter === "local") openUploadModal(false);
                else setActiveFilter("all", "Recently Played");
            });
            return;
        }

        trackList.innerHTML = filtered.map((t) => {
            const realIndex = TRACKS.findIndex(item => String(item.id) === String(t.id));
            const isPlayingThis = (realIndex === state.currentTrackIndex);
            return `
                <div class="track-row ${isPlayingThis ? 'playing' : ''}" data-track-id="${t.id}" data-index="${realIndex}">
                    <span class="track-index">${isPlayingThis ? '<i class="fa-solid fa-volume-high"></i>' : (realIndex + 1)}</span>
                    <img src="${t.cover}" alt="${t.title}" class="track-cover">
                    <div class="track-info">
                        <span class="track-title">${t.title}</span>
                        <span class="track-artist">${t.artist} ${t.isLocal ? '<span style="font-size: 10px; color: var(--accent-green);">(Private)</span>' : ''}</span>
                    </div>
                    <span class="track-album-name">${t.album}</span>
                    <span class="track-duration">${t.duration}</span>
                    <button class="btn-row-add-queue" data-track-id="${t.id}" title="Add to Queue">
                        <i class="fa-solid fa-list-check"></i>
                    </button>
                    <button class="btn-row-add-pl" data-track-id="${t.id}" title="Add to Playlist">
                        <i class="fa-solid fa-folder-plus"></i>
                    </button>
                    <button class="like-btn ${t.liked ? 'liked' : ''}" data-track-id="${t.id}" title="Toggle Favorite">
                        <i class="${t.liked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                    </button>
                </div>
            `;
        }).join("");

        trackList.querySelectorAll(".track-row").forEach(row => {
            row.addEventListener("click", (e) => {
                if (e.target.closest(".like-btn") || e.target.closest(".btn-row-add-pl") || e.target.closest(".btn-row-add-queue")) return;
                const idx = parseInt(row.dataset.index, 10);
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
    }

    // --- O. Favorite Toggle & Sync -----------------------------------------
    async function toggleFavorite(trackId) {
        const track = TRACKS.find(t => String(t.id) === String(trackId));
        if (!track) return;
        if (!requireLogin("Please log in to save favorites")) return;

        const previous = track.liked;
        track.liked = !previous;          // optimistic update
        syncGlobalLikeState();
        renderTrackList();

        try {
            const data = await api(`/users/${currentUserId}/like`, jsonOpts("POST", { songId: track.id }));
            track.liked = data.liked;
            showToast(data.liked ? `Added "${track.title}" to Favorites` : `Removed "${track.title}" from Favorites`,
                data.liked ? "fa-heart" : "fa-heart-crack");
        } catch (err) {
            track.liked = previous;       // roll back
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

    // --- P. Audio Load & Play ----------------------------------------------
    function loadTrack(index, autoPlay = true) {
        if (index < 0 || index >= TRACKS.length) return;
        state.currentTrackIndex = index;
        const track = TRACKS[index];

        audio.src = track.src;
        audio.load();
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
    audio.addEventListener("play", () => {
        state.isPlaying = true;
        updatePlayPauseIcons();
    });

    audio.addEventListener("pause", () => {
        state.isPlaying = false;
        updatePlayPauseIcons();
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
    });

    // Sequential Playlist Playback
    audio.addEventListener("ended", () => {
        handleTrackEnd();
    });

    function handleTrackEnd() {
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
        if (contextTracks.length <= 1) return;
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
            nextContextIdx = state.repeatMode === "all" ? 0 : currentContextIdx;
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
                <img src="${current?.cover || ''}" class="queue-thumb" alt="">
                <div class="queue-meta">
                    <p class="queue-item-title">${current?.title || 'No song'}</p>
                    <p class="queue-item-artist">${current?.artist || ''} (Now Playing)</p>
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
                    <div class="queue-item" data-queue-index="${qIndex}" data-track-id="${t.id}">
                        <img src="${t.cover}" class="queue-thumb" alt="">
                        <div class="queue-meta">
                            <p class="queue-item-title">${t.title}</p>
                            <p class="queue-item-artist">${t.artist}</p>
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

        const heroBanner = document.getElementById("heroBanner");
        const recommendedSection = document.getElementById("recommendedSection");
        const plBanner = document.getElementById("playlistDetailBanner");
        const plActionBar = document.getElementById("playlistActionBar");

        if (filterName === "all") {
            if (heroBanner) heroBanner.style.display = "block";
            if (recommendedSection) recommendedSection.style.display = "block";
            if (plBanner) plBanner.style.display = "none";
            if (plActionBar) plActionBar.style.display = "none";
        } else {
            if (heroBanner) heroBanner.style.display = "none";
            if (recommendedSection) recommendedSection.style.display = "none";
            if (plBanner) plBanner.style.display = "none";
            if (plActionBar) plActionBar.style.display = "none";
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
    }

    document.getElementById("navHome")?.addEventListener("click", (e) => {
        e.preventDefault();
        setActiveFilter("all", "Recently Played");
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
            showToast(`Playing ${filtered.length} tracks`, "fa-play");
        }
    });

    document.getElementById("heroListenNowBtn")?.addEventListener("click", () => {
        loadTrack(1, true);
        showToast("Playing Featured Release", "fa-play");
    });

    document.getElementById("heroQueueBtn")?.addEventListener("click", () => {
        const featuredTrack = TRACKS[1];
        if (featuredTrack && !state.queue.includes(featuredTrack.id)) {
            state.queue.push(featuredTrack.id);
            renderQueue();
            showToast(`Added "${featuredTrack.title}" to Queue`, "fa-list-check");
        } else {
            showToast("Track is already in queue", "fa-info");
        }
    });

    const cardsGrid = document.getElementById("cardsGrid");
    if (cardsGrid) {
        cardsGrid.innerHTML = CARDS.map((card, i) => `
            <div class="music-card" data-card-index="${i}">
                <div class="card-thumb">
                    <img src="${card.cover}" alt="${card.title}">
                    <button class="play-float-btn" title="Play"><i class="fa-solid fa-play"></i></button>
                </div>
                <h4 class="card-name">${card.title}</h4>
                <p class="card-desc">${card.desc}</p>
            </div>
        `).join("");

        cardsGrid.querySelectorAll(".music-card").forEach(card => {
            card.addEventListener("click", () => {
                const cIdx = parseInt(card.dataset.cardIndex, 10);
                const targetTrackIndex = CARDS[cIdx].trackIndex;
                loadTrack(targetTrackIndex, true);
            });
        });
    }

    document.getElementById("viewAllCardsLink")?.addEventListener("click", (e) => {
        e.preventDefault();
        setActiveFilter("all", "Recommended Releases");
    });

    document.getElementById("searchInput")?.addEventListener("input", () => {
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

    document.addEventListener("keydown", (e) => {
        if (["input", "textarea"].includes(document.activeElement?.tagName.toLowerCase())) return;

        if (e.key === "Escape") {
            closeEnlargedCover();
            closeUploadModal();
            closeCreatePlaylistModal();
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
        }
    });

    // Save "recently played" to MongoDB whenever a song actually starts playing
    audio.addEventListener("play", () => {
        const track = TRACKS[state.currentTrackIndex];
        if (!track || state.recentPlayed[0] === track.id) return;
        state.recentPlayed = [track.id, ...state.recentPlayed.filter(id => id !== track.id)].slice(0, 10);
        if (isLoggedIn()) {
            api(`/users/${currentUserId}/recent`, jsonOpts("POST", { songId: track.id }))
                .catch(err => console.warn("Could not save recent song:", err.message));
        }
    });

    renderSidebarPlaylists();
    renderTrackList();
    loadTrack(0, false);
    syncGlobalLikeState();
    updateBadgeCounts();
});