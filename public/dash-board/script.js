// ==========================================================================
// 1. INDEXEDDB LOCAL AUDIO STORAGE (Permanent local songs across refreshes)
// ==========================================================================
const DB_NAME = "SoundPulse_DB";
const STORE_NAME = "local_songs";

function getDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveSongToIndexedDB(trackObj, blob) {
    try {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put({
            id: trackObj.id,
            title: trackObj.title,
            artist: trackObj.artist,
            album: trackObj.album,
            duration: trackObj.duration,
            cover: trackObj.cover,
            liked: trackObj.liked,
            blob: blob
        });
    } catch (err) {
        console.warn("IndexedDB save failed:", err);
    }
}

async function loadSongsFromIndexedDB() {
    try {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const req = tx.objectStore(STORE_NAME).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    } catch {
        return [];
    }
}

// ==========================================================================
// 2. MAIN APPLICATION LOGIC
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

    // --- B. Authentication & User Profile Image Option ---------------------
    const displayUserName = document.getElementById("displayUserName");
    const authBtn = document.getElementById("authBtn");
    const authBtnText = document.getElementById("authBtnText");
    const userProfileBtn = document.getElementById("userProfileBtn");
    const userAvatar = document.getElementById("userAvatar");
    const userAvatarInput = document.getElementById("userAvatarInput");

    const currentUser = sessionStorage.getItem("sohify_user");
    const currentName = sessionStorage.getItem("sohify_username");

    if (currentUser && currentName) {
        if (displayUserName) displayUserName.textContent = currentName;
        if (authBtn && authBtnText) {
            authBtnText.textContent = "Log Out";
            authBtn.querySelector("i").className = "fa-solid fa-right-from-bracket";
            authBtn.href = "#";
            authBtn.addEventListener("click", (e) => {
                e.preventDefault();
                sessionStorage.removeItem("sohify_user");
                sessionStorage.removeItem("sohify_username");
                showToast("Logged out successfully");
                setTimeout(() => window.location.href = "login.html", 800);
            });
        }
    } else {
        if (displayUserName) displayUserName.textContent = "Alex Rivera";
    }

    // Load persisted User Avatar from localStorage
    const savedUserAvatar = localStorage.getItem("soundpulse_user_avatar");
    if (savedUserAvatar && userAvatar) {
        userAvatar.src = savedUserAvatar;
    }

    // Trigger user profile picture file chooser
    userProfileBtn?.addEventListener("click", () => {
        userAvatarInput?.click();
    });

    userAvatarInput?.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            showToast("Please choose a valid image file", "fa-triangle-exclamation");
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target.result;
            if (userAvatar) userAvatar.src = dataUrl;
            localStorage.setItem("soundpulse_user_avatar", dataUrl);
            showToast("Profile picture updated!", "fa-camera");
        };
        reader.readAsDataURL(file);
    });

    // --- C. Favorite / Liked Songs LocalStorage ----------------------------
    function getStoredLikedIds() {
        try {
            return JSON.parse(localStorage.getItem("soundpulse_likes")) || [1];
        } catch {
            return [1];
        }
    }
    function saveStoredLikedIds(ids) {
        localStorage.setItem("soundpulse_likes", JSON.stringify(ids));
    }

    // --- D. Custom Playlists LocalStorage ----------------------------------
    const DEFAULT_PLAYLISTS = [
        { id: "pl_1", name: "Chill Lofi Beats", trackIds: [2, 4] },
        { id: "pl_2", name: "Gym Hype Mix", trackIds: [1, 3] },
        { id: "pl_3", name: "Night Drive Synth", trackIds: [1, 2] }
    ];

    function getStoredPlaylists() {
        try {
            const data = localStorage.getItem("soundpulse_playlists");
            return data ? JSON.parse(data) : DEFAULT_PLAYLISTS;
        } catch {
            return DEFAULT_PLAYLISTS;
        }
    }

    function saveStoredPlaylists(pls) {
        localStorage.setItem("soundpulse_playlists", JSON.stringify(pls));
    }

    let playlists = getStoredPlaylists();

    // --- E. Initial Tracks Database ----------------------------------------
    const DEFAULT_COVER = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop";

    const TRACKS = [
        {
            id: 1,
            title: "Starboy",
            artist: "The Weeknd, Daft Punk",
            album: "Starboy LP",
            duration: "3:50",
            cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop",
            src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
            liked: false,
            isLocal: false
        },
        {
            id: 2,
            title: "Midnight City",
            artist: "M83",
            album: "Saturdays = Youth",
            duration: "4:03",
            cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop",
            src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
            liked: false,
            isLocal: false
        },
        {
            id: 3,
            title: "Get Lucky",
            artist: "Daft Punk ft. Pharrell",
            album: "Random Access Memories",
            duration: "4:08",
            cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop",
            src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
            liked: false,
            isLocal: false
        },
        {
            id: 4,
            title: "Solar Drift",
            artist: "Kavinsky Style",
            album: "Outrun Nights",
            duration: "3:42",
            cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop",
            src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
            liked: false,
            isLocal: false
        }
    ];

    // Restore Liked status
    const likedIds = getStoredLikedIds();
    TRACKS.forEach(t => {
        t.liked = likedIds.includes(t.id);
    });

    // Load saved local songs from IndexedDB
    const storedLocalSongs = await loadSongsFromIndexedDB();
    storedLocalSongs.forEach(saved => {
        const objectUrl = URL.createObjectURL(saved.blob);
        TRACKS.push({
            id: saved.id,
            title: saved.title,
            artist: saved.artist,
            album: saved.album || "Local Storage",
            duration: saved.duration || "--:--",
            cover: saved.cover || DEFAULT_COVER,
            src: objectUrl,
            liked: likedIds.includes(saved.id),
            isLocal: true
        });
    });

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

    // --- F. Player State & Audio Element -----------------------------------
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
        recentPlayed: []
    };

    // --- G. DOM References -------------------------------------------------
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

    const headerUploadBtn = document.getElementById("headerUploadBtn");
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

    // Upload with Image Modal Elements
    const uploadSongModal = document.getElementById("uploadSongModal");
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

    let currentSelectedAudioFile = null;
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

    // --- H. Utility: Format Seconds ----------------------------------------
    function formatTime(sec) {
        if (isNaN(sec) || !isFinite(sec)) return "0:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? "0" : ""}${s}`;
    }

    // --- I. Equalizer Wave & Play/Pause State -------------------------------
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
        updateSoundWaveState();
    }

    function updateBadgeCounts() {
        const likedCount = TRACKS.filter(t => t.liked).length;
        const localCount = TRACKS.filter(t => t.isLocal).length;
        if (likedCountBadge) likedCountBadge.textContent = likedCount;
        if (localCountBadge) localCountBadge.textContent = localCount;
    }

    // --- J. Enlarged Cover Art Open & Minimize Logic -----------------------
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

    currentTitle?.addEventListener("click", (e) => {
        e.stopPropagation();
        openEnlargedCover();
    });

    currentCover?.addEventListener("click", (e) => {
        e.stopPropagation();
        openEnlargedCover();
    });

    coverMinimizeBtn?.addEventListener("click", closeEnlargedCover);
    expandedCloseBtn?.addEventListener("click", closeEnlargedCover);
    coverModalBackdrop?.addEventListener("click", closeEnlargedCover);

    // --- K. Active Context Tracks (Playlist, Liked, Local, etc.) ------------
    function getContextTracks() {
        if (state.activeFilter === "playlist" && state.activePlaylistId) {
            const pl = playlists.find(p => p.id === state.activePlaylistId);
            if (pl && pl.trackIds) {
                return pl.trackIds.map(tid => TRACKS.find(t => t.id === tid)).filter(Boolean);
            }
        }
        if (state.activeFilter === "liked") {
            return TRACKS.filter(t => t.liked);
        }
        if (state.activeFilter === "local") {
            return TRACKS.filter(t => t.isLocal);
        }
        if (state.activeFilter === "recent") {
            return state.recentPlayed.map(id => TRACKS.find(t => t.id === id)).filter(Boolean);
        }
        return TRACKS;
    }

    // --- L. Render Playlists & SELECT PLAYLIST IN ORDER ---------------------
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
                const plId = li.dataset.playlistId;
                // Selecting playlist plays all its songs in order
                selectPlaylist(plId, true);
                closeDrawer();
            });
        });

        playlistNavList.querySelectorAll(".btn-delete-playlist").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const plId = btn.dataset.playlistId;
                deletePlaylist(plId);
            });
        });
    }

    // SELECT PLAYLIST FUNCTION: Plays all tracks in order starting from track 1
    function selectPlaylist(plId, autoPlayInOrder = true) {
        const pl = playlists.find(p => p.id === plId);
        if (!pl) return;

        state.activeFilter = "playlist";
        state.activePlaylistId = pl.id;

        if (tracklistHeading) tracklistHeading.textContent = pl.name;
        if (viewFilterPill) {
            viewFilterPill.style.display = "inline-block";
            viewFilterPill.textContent = "Playlist";
        }
        if (deleteCurrentPlaylistBtn) {
            deleteCurrentPlaylistBtn.style.display = "inline-flex";
        }

        document.querySelectorAll(".sidebar .nav-item").forEach(i => i.classList.remove("active"));
        const activeLi = playlistNavList.querySelector(`.nav-item[data-playlist-id="${pl.id}"]`);
        if (activeLi) activeLi.classList.add("active");

        renderTrackList();

        // Play the playlist tracks in sequential order starting from the very first track
        if (autoPlayInOrder) {
            const plTracks = (pl.trackIds || []).map(tid => TRACKS.find(t => t.id === tid)).filter(Boolean);
            if (plTracks.length > 0) {
                const firstTrackGlobalIdx = TRACKS.findIndex(t => t.id === plTracks[0].id);
                if (firstTrackGlobalIdx !== -1) {
                    loadTrack(firstTrackGlobalIdx, true);
                    showToast(`Playing playlist "${pl.name}" in order (${plTracks.length} tracks)`, "fa-play");
                }
            } else {
                showToast(`"${pl.name}" is empty. Add songs to play!`, "fa-info");
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

    function createNewPlaylist() {
        const name = (newPlaylistName?.value || "").trim();
        if (!name) {
            showToast("Please enter a playlist name", "fa-triangle-exclamation");
            return;
        }

        const newId = "pl_" + Date.now();
        const newPl = {
            id: newId,
            name: name,
            trackIds: []
        };

        playlists.push(newPl);
        saveStoredPlaylists(playlists);
        renderSidebarPlaylists();
        closeCreatePlaylistModal();
        showToast(`Created playlist "${name}"`, "fa-circle-plus");
        selectPlaylist(newId, false);
    }

    function deletePlaylist(plId) {
        const pl = playlists.find(p => p.id === plId);
        if (!pl) return;

        if (!confirm(`Are you sure you want to delete the playlist "${pl.name}"?`)) {
            return;
        }

        playlists = playlists.filter(p => p.id !== plId);
        saveStoredPlaylists(playlists);
        renderSidebarPlaylists();
        showToast(`Deleted playlist "${pl.name}"`, "fa-trash-can");

        if (state.activeFilter === "playlist" && state.activePlaylistId === plId) {
            setActiveFilter("all", "Recently Played");
        }
    }

    createPlaylistBtn?.addEventListener("click", openCreatePlaylistModal);
    closeCreateModalBtn?.addEventListener("click", closeCreatePlaylistModal);
    cancelCreatePlaylistBtn?.addEventListener("click", closeCreatePlaylistModal);
    confirmCreatePlaylistBtn?.addEventListener("click", createNewPlaylist);
    newPlaylistName?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") createNewPlaylist();
    });

    deleteCurrentPlaylistBtn?.addEventListener("click", () => {
        if (state.activePlaylistId) deletePlaylist(state.activePlaylistId);
    });

    // --- M. Add Song to Playlist Modal ------------------------------------
    function openAddToPlaylistModal(trackId) {
        const id = isNaN(trackId) ? trackId : Number(trackId);
        const track = TRACKS.find(t => t.id === id);
        if (!track || !addToPlaylistModal) return;

        songTargetForPlaylist = track;
        if (addToPlaylistSongTitle) {
            addToPlaylistSongTitle.textContent = `Add "${track.title}" to:`;
        }

        if (playlists.length === 0) {
            modalPlaylistOptions.innerHTML = `
                <p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 12px;">No playlists found. Create one first!</p>
            `;
        } else {
            modalPlaylistOptions.innerHTML = playlists.map(pl => {
                const alreadyIn = pl.trackIds && pl.trackIds.includes(track.id);
                return `
                    <div class="modal-pl-option" data-pl-id="${pl.id}">
                        <span class="modal-pl-option-name">
                            <i class="fa-solid fa-music" style="color: var(--accent-green);"></i>
                            ${pl.name}
                        </span>
                        <span class="modal-pl-option-count">
                            ${alreadyIn ? '<span style="color: var(--accent-green);"><i class="fa-solid fa-check"></i> Added</span>' : '+ Add'}
                        </span>
                    </div>
                `;
            }).join("");

            modalPlaylistOptions.querySelectorAll(".modal-pl-option").forEach(opt => {
                opt.addEventListener("click", () => {
                    const plId = opt.dataset.plId;
                    toggleTrackInPlaylist(plId, songTargetForPlaylist.id);
                });
            });
        }

        addToPlaylistModal.classList.add("active");
    }

    function toggleTrackInPlaylist(plId, trackId) {
        const pl = playlists.find(p => p.id === plId);
        if (!pl) return;

        if (!pl.trackIds) pl.trackIds = [];

        if (pl.trackIds.includes(trackId)) {
            pl.trackIds = pl.trackIds.filter(id => id !== trackId);
            showToast(`Removed from "${pl.name}"`, "fa-circle-minus");
        } else {
            pl.trackIds.push(trackId);
            showToast(`Added to "${pl.name}"`, "fa-circle-check");
        }

        saveStoredPlaylists(playlists);
        renderSidebarPlaylists();
        addToPlaylistModal.classList.remove("active");

        if (state.activeFilter === "playlist" && state.activePlaylistId === plId) {
            renderTrackList();
        }
    }

    closeAddModalBtn?.addEventListener("click", () => addToPlaylistModal?.classList.remove("active"));

    // --- N. Upload Song with Cover Image Workflow --------------------------
    function openUploadModal(preloadedAudioFile = null) {
        if (!uploadSongModal) return;
        uploadSongModal.classList.add("active");

        currentSelectedAudioFile = null;
        currentSelectedCoverData = DEFAULT_COVER;
        if (uploadCoverPreview) uploadCoverPreview.src = DEFAULT_COVER;
        if (audioFileNameDisplay) audioFileNameDisplay.textContent = "No file chosen";
        if (uploadSongTitle) uploadSongTitle.value = "";
        if (uploadSongArtist) uploadSongArtist.value = "";
        if (songAudioInput) songAudioInput.value = "";
        if (songCoverInput) songCoverInput.value = "";

        if (preloadedAudioFile) {
            handleSelectedAudio(preloadedAudioFile);
        }
    }

    function closeUploadModal() {
        uploadSongModal?.classList.remove("active");
    }

    [headerUploadBtn, sidebarUploadBtn].forEach(b => {
        b?.addEventListener("click", () => openUploadModal());
    });

    closeUploadModalBtn?.addEventListener("click", closeUploadModal);
    cancelUploadBtn?.addEventListener("click", closeUploadModal);

    chooseAudioBtn?.addEventListener("click", () => songAudioInput?.click());

    function handleSelectedAudio(file) {
        if (!file) return;
        currentSelectedAudioFile = file;
        if (audioFileNameDisplay) audioFileNameDisplay.textContent = file.name;

        let cleanName = file.name.replace(/\.[^/.]+$/, "");
        let artist = "Local Artist";
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
        if (e.target.files && e.target.files[0]) {
            handleSelectedAudio(e.target.files[0]);
        }
    });

    [coverPreviewBox, chooseCoverBtn].forEach(el => {
        el?.addEventListener("click", () => songCoverInput?.click());
    });

    songCoverInput?.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            showToast("Please choose a valid image file", "fa-triangle-exclamation");
            return;
        }

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
        const artist = (uploadSongArtist?.value || "").trim() || "Local Artist";
        const trackId = "local_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        const objectUrl = URL.createObjectURL(currentSelectedAudioFile);

        const newTrack = {
            id: trackId,
            title: title,
            artist: artist,
            album: "Local Storage",
            duration: "--:--",
            cover: currentSelectedCoverData || DEFAULT_COVER,
            src: objectUrl,
            liked: false,
            isLocal: true
        };

        TRACKS.unshift(newTrack);
        await saveSongToIndexedDB(newTrack, currentSelectedAudioFile);

        const probeAudio = new Audio();
        probeAudio.src = objectUrl;
        probeAudio.addEventListener("loadedmetadata", () => {
            newTrack.duration = formatTime(probeAudio.duration);
            renderTrackList();
        });

        closeUploadModal();
        showToast(`Uploaded "${title}" with custom cover!`, "fa-cloud-arrow-up");

        setActiveFilter("local", "Local Files");
        loadTrack(0, true);
    });

    window.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropOverlay?.classList.add("active");
    });
    window.addEventListener("dragleave", (e) => {
        if (e.relatedTarget === null) dropOverlay?.classList.remove("active");
    });
    window.addEventListener("drop", (e) => {
        e.preventDefault();
        dropOverlay?.classList.remove("active");
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name)) {
                openUploadModal(file);
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

    // --- O. Add to Queue Helper Function -----------------------------------
    function addTrackToQueue(trackId) {
        const id = isNaN(trackId) ? trackId : Number(trackId);
        const track = TRACKS.find(t => t.id === id);
        if (!track) return;

        state.queue.push(track.id);
        renderQueue();
        showToast(`Added "${track.title}" to Queue`, "fa-list-check");
    }

    // --- P. Track Filtering & Rendering -----------------------------------
    function getFilteredTracks() {
        const q = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
        let list = [...TRACKS];

        if (state.activeFilter === "liked") {
            list = list.filter(t => t.liked);
        } else if (state.activeFilter === "local") {
            list = list.filter(t => t.isLocal);
        } else if (state.activeFilter === "recent") {
            list = state.recentPlayed.length ? state.recentPlayed.map(id => TRACKS.find(t => t.id === id)).filter(Boolean) : list;
        } else if (state.activeFilter === "playlist") {
            const currentPl = playlists.find(p => p.id === state.activePlaylistId);
            if (currentPl && currentPl.trackIds) {
                list = currentPl.trackIds.map(tid => TRACKS.find(t => t.id === tid)).filter(Boolean);
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
                emptyMsg = "No local songs imported yet! Click 'Import Local Song' to upload a song with its cover art.";
            } else if (state.activeFilter === "playlist") {
                emptyMsg = "This playlist is empty. Add songs by clicking the '+' icon next to any song in the list!";
            }

            trackList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid ${state.activeFilter === 'liked' ? 'fa-heart-crack' : 'fa-music'}"></i>
                    <h3>${state.activeFilter === 'liked' ? 'No Liked Songs Yet' : 'No Tracks Here'}</h3>
                    <p>${emptyMsg}</p>
                    <button class="btn btn-green" id="emptyActionBtn">
                        ${state.activeFilter === 'local' ? '<i class="fa-solid fa-cloud-arrow-up"></i> Upload Song & Cover' : '<i class="fa-solid fa-house"></i> Back to Home'}
                    </button>
                </div>
            `;

            document.getElementById("emptyActionBtn")?.addEventListener("click", () => {
                if (state.activeFilter === "local") {
                    openUploadModal();
                } else {
                    setActiveFilter("all", "Recently Played");
                }
            });
            return;
        }

        trackList.innerHTML = filtered.map((t) => {
            const realIndex = TRACKS.findIndex(item => item.id === t.id);
            const isPlayingThis = (realIndex === state.currentTrackIndex);
            return `
                <div class="track-row ${isPlayingThis ? 'playing' : ''}" data-track-id="${t.id}" data-index="${realIndex}">
                    <span class="track-index">${isPlayingThis ? '<i class="fa-solid fa-volume-high"></i>' : (realIndex + 1)}</span>
                    <img src="${t.cover}" alt="${t.title}" class="track-cover">
                    <div class="track-info">
                        <span class="track-title">${t.title}</span>
                        <span class="track-artist">${t.artist}</span>
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

    // --- Q. Favorite Toggle & Sync -----------------------------------------
    function toggleFavorite(trackId) {
        const id = isNaN(trackId) ? trackId : Number(trackId);
        const track = TRACKS.find(t => t.id === id);
        if (!track) return;

        track.liked = !track.liked;
        let storedLikes = getStoredLikedIds();

        if (track.liked) {
            if (!storedLikes.includes(track.id)) storedLikes.push(track.id);
            showToast(`Added "${track.title}" to Favorites`, "fa-heart");
        } else {
            storedLikes = storedLikes.filter(item => item !== track.id);
            showToast(`Removed "${track.title}" from Favorites`, "fa-heart-crack");
        }
        saveStoredLikedIds(storedLikes);

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
            if (icon) {
                icon.className = isLiked ? "fa-solid fa-heart" : "fa-regular fa-heart";
            }
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

    // --- R. Load & Play Audio Track ----------------------------------------
    function loadTrack(index, autoPlay = true) {
        if (index < 0 || index >= TRACKS.length) return;
        state.currentTrackIndex = index;
        const track = TRACKS[index];

        audio.src = track.src;
        audio.load();
        audio.volume = state.isMuted ? 0 : state.volume;

        state.recentPlayed = [track.id, ...state.recentPlayed.filter(id => id !== track.id)].slice(0, 10);

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
            }).catch(err => {
                console.warn("Autoplay notice:", err);
            });
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

    // --- S. Audio Playback Event Listeners ---------------------------------
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

    // SEQUENTIAL PLAYBACK: When a track ends, play the next track of the playlist in order
    audio.addEventListener("ended", () => {
        handleTrackEnd();
    });

    function handleTrackEnd() {
        if (state.repeatMode === "one") {
            audio.currentTime = 0;
            audio.play();
            return;
        }

        // Play from queue if user added items explicitly
        if (state.queue.length > 0) {
            const nextId = state.queue.shift();
            const qIdx = TRACKS.findIndex(t => t.id === nextId);
            if (qIdx !== -1) {
                loadTrack(qIdx, true);
                renderQueue();
                return;
            }
        }

        // Get the active playlist / context songs
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

        // Find current song in playlist & advance sequentially in order
        const currentTrack = TRACKS[state.currentTrackIndex];
        const currentContextIdx = contextTracks.findIndex(t => t.id === currentTrack?.id);

        const nextContextIdx = currentContextIdx + 1;
        if (nextContextIdx < contextTracks.length) {
            const nextTrackGlobalIdx = TRACKS.findIndex(t => t.id === contextTracks[nextContextIdx].id);
            if (nextTrackGlobalIdx !== -1) {
                loadTrack(nextTrackGlobalIdx, true);
            }
        } else {
            // End of playlist reached
            if (state.repeatMode === "all") {
                // Loop back to track 1 of the playlist
                const firstGlobalIdx = TRACKS.findIndex(t => t.id === contextTracks[0].id);
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

        const globalIdx = TRACKS.findIndex(t => t.id === target.id);
        if (globalIdx !== -1) loadTrack(globalIdx, true);
    }

    // --- T. Next, Prev, Shuffle & Repeat Controls (Playlist in order) -------
    function playNext() {
        if (state.queue.length > 0) {
            const nextId = state.queue.shift();
            const qIdx = TRACKS.findIndex(t => t.id === nextId);
            if (qIdx !== -1) {
                loadTrack(qIdx, true);
                renderQueue();
                return;
            }
        }

        const contextTracks = getContextTracks();
        if (contextTracks.length === 0) return;

        if (state.isShuffle) {
            playRandomTrack();
            return;
        }

        const currentTrack = TRACKS[state.currentTrackIndex];
        const currentContextIdx = contextTracks.findIndex(t => t.id === currentTrack?.id);

        let nextContextIdx = currentContextIdx + 1;
        if (nextContextIdx >= contextTracks.length) {
            nextContextIdx = state.repeatMode === "all" ? 0 : currentContextIdx;
        }

        const targetGlobalIdx = TRACKS.findIndex(t => t.id === contextTracks[nextContextIdx].id);
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

        if (state.isShuffle) {
            playRandomTrack();
            return;
        }

        const currentTrack = TRACKS[state.currentTrackIndex];
        const currentContextIdx = contextTracks.findIndex(t => t.id === currentTrack?.id);

        let prevContextIdx = currentContextIdx - 1;
        if (prevContextIdx < 0) {
            prevContextIdx = state.repeatMode === "all" ? contextTracks.length - 1 : 0;
        }

        const targetGlobalIdx = TRACKS.findIndex(t => t.id === contextTracks[prevContextIdx].id);
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
            if (icon) {
                icon.className = state.repeatMode === "one" ? "fa-solid fa-1" : "fa-solid fa-repeat";
            }
        });

        const msgs = { none: "Repeat Off", all: "Repeat All Songs", one: "Repeat Current Song" };
        showToast(msgs[state.repeatMode], "fa-repeat");
    }

    [shuffleBtn, sheetShuffleBtn, expandedShuffleBtn].forEach(b => b?.addEventListener("click", toggleShuffle));
    [repeatBtn, sheetRepeatBtn, expandedRepeatBtn].forEach(b => b?.addEventListener("click", toggleRepeat));

    // --- U. Progress Scrubbing --------------------------------------------
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

        const start = (e) => {
            isDragging = true;
            seekFromEvent(e, trackEl);
        };
        const move = (e) => {
            if (!isDragging) return;
            seekFromEvent(e, trackEl);
        };
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

    // --- V. Sound / Volume Bar Controls (Click, Drag & Wheel) -------------
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

        const start = (e) => {
            isDragging = true;
            volumeFromEvent(e, trackEl);
        };
        const move = (e) => {
            if (!isDragging) return;
            volumeFromEvent(e, trackEl);
        };
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

    // --- W. Queue Drawer Management ----------------------------------------
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
                const t = TRACKS.find(item => item.id === trackId);
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
                const idx = TRACKS.findIndex(t => t.id == tid);
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

    // --- X. Filter Navigation (Home, Liked, Local, Recent) ------------------
    function setActiveFilter(filterName, headingText) {
        state.activeFilter = filterName;
        state.activePlaylistId = null;

        if (tracklistHeading) tracklistHeading.textContent = headingText;

        if (viewFilterPill) {
            viewFilterPill.style.display = filterName === "all" ? "none" : "inline-block";
            viewFilterPill.textContent = headingText;
        }

        if (deleteCurrentPlaylistBtn) {
            deleteCurrentPlaylistBtn.style.display = "none";
        }

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
        setActiveFilter("local", "Local Files");
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
            const firstIdx = TRACKS.findIndex(t => t.id === filtered[0].id);
            loadTrack(firstIdx, true);
            showToast(`Playing ${filtered.length} tracks`, "fa-play");
        }
    });

    // --- Y. Hero Banner Buttons --------------------------------------------
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

    // --- Z. Recommended Cards Grid -----------------------------------------
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

    // --- AA. Mobile Drawer & Fullscreen Sheet ------------------------------
    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");
    const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");

    function openDrawer() {
        sidebar?.classList.add("open");
        sidebarOverlay?.classList.add("active");
    }
    function closeDrawer() {
        sidebar?.classList.remove("open");
        sidebarOverlay?.classList.remove("active");
    }

    mobileMenuBtn?.addEventListener("click", openDrawer);
    sidebarCloseBtn?.addEventListener("click", closeDrawer);
    sidebarOverlay?.addEventListener("click", closeDrawer);

    const mobileSheet = document.getElementById("mobileSheet");
    const mobileExpandBtn = document.getElementById("mobileExpandBtn");
    const sheetCloseBtn = document.getElementById("sheetCloseBtn");

    function openSheet() { mobileSheet?.classList.add("active"); }
    function closeSheet() { mobileSheet?.classList.remove("active"); }

    mobileExpandBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        openSheet();
    });

    document.getElementById("playerBar")?.addEventListener("click", (e) => {
        if (window.innerWidth <= 899 && !e.target.closest("button") && !e.target.closest(".slider-track") && !e.target.closest(".clickable-title") && !e.target.closest(".clickable-cover")) {
            openSheet();
        }
    });

    sheetCloseBtn?.addEventListener("click", closeSheet);

    // --- Keyboard Shortcuts ------------------------------------------------
    document.addEventListener("keydown", (e) => {
        if (["input", "textarea"].includes(document.activeElement?.tagName.toLowerCase())) return;

        if (e.key === "Escape") {
            closeEnlargedCover();
            closeUploadModal();
            closeCreatePlaylistModal();
            addToPlaylistModal?.classList.remove("active");
            queuePanel?.classList.remove("open");
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

    // Start App
    renderSidebarPlaylists();
    renderTrackList();
    loadTrack(0, false);
    syncGlobalLikeState();
    updateBadgeCounts();
});