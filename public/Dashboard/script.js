"use strict";
/* ==========================================================================
   SOHIFY — WEB PLAYER
    1. Helpers                 7. Router
    2. Session & API           8. Player engine
    3. State & settings        9. Player UI sync
    4. Toasts, menus, dialogs 10. Queue & now playing
    5. Data & actions         11. Speed & sleep timer
    6. Rendering              12. Song, playlist & account dialogs
                              13. Events, keyboard & start-up
   ========================================================================== */

/* ==========================================================================
   1. HELPERS
   ========================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function parseDur(str) {
    if (!str || !/^\d+(:\d{1,2}){1,2}$/.test(str)) return 0;
    return str.split(":").map(Number).reduce((acc, n) => acc * 60 + n, 0);
}

function fmtTotal(sec) {
    if (!sec) return "";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h) return `${h} hr ${m} min`;
    if (m) return `${m} min`;
    return `${Math.round(sec)} sec`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function debounce(fn, ms) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function initials(name) {
    return String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

function greetingText() {
    const h = new Date().getHours();
    return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const DEFAULT_COVER =
    "data:image/svg+xml," +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2540"/><stop offset="1" stop-color="#1a1726"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><path d="M42 30v30.5a9 9 0 1 0 5 8V42l18-4v15.5a9 9 0 1 0 5 8V25z" fill="#6f6890"/></svg>`
    );

const coverOf = (song) => (song && song.cover) || DEFAULT_COVER;

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
    }
}

// Shrinks a picked image before upload (covers are shown at ≤ 300px, so 800px is plenty).
// A 4 MB phone photo usually becomes ~80 KB. GIFs are kept as-is so animation isn't lost.
async function resizeImage(file, max = 800) {
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type) || typeof createImageBitmap !== "function") return file;
    try {
        const bmp = await createImageBitmap(file);
        const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
        if (scale === 1 && file.size < 300 * 1024) {
            bmp.close?.();
            return file;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bmp.width * scale);
        canvas.height = Math.round(bmp.height * scale);
        canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
        bmp.close?.();
        const toBlob = (type) => new Promise((r) => canvas.toBlob(r, type, 0.85));
        let blob = await toBlob("image/webp");
        if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
        if (!blob || blob.size >= file.size) return file;
        const ext = blob.type === "image/webp" ? "webp" : "jpg";
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${ext}`, { type: blob.type });
    } catch {
        return file;
    }
}

/* ==========================================================================
   2. SESSION & API
   "Remember me" sessions live in localStorage, normal ones in sessionStorage.
   ========================================================================== */
const SESSION_KEYS = ["sohify_token", "sohify_user", "sohify_username", "sohify_user_id", "sohify_is_admin", "sohify_avatar"];

const sessionStore = () => (localStorage.getItem("sohify_token") ? localStorage : sessionStorage);
const sessionGet = (key) => sessionStore().getItem(key);
const sessionSet = (key, value) => sessionStore().setItem(key, value);

function clearSession() {
    SESSION_KEYS.forEach((k) => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
    });
}

function goToLogin(expired) {
    const next = encodeURIComponent(location.pathname + location.hash);
    location.href = `/Login?${expired ? "expired=1&" : ""}next=${next}`;
}

function handleAuthFailure(data) {
    if (data && data.authError) {
        clearSession();
        goToLogin(true);
        return true;
    }
    return false;
}

async function api(path, { method = "GET", json, body } = {}) {
    const headers = {};
    const token = sessionGet("sohify_token");
    if (token) headers.Authorization = `Bearer ${token}`;
    if (json !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(json);
    }

    let res;
    try {
        res = await fetch(`/api${path}`, { method, headers, body });
    } catch {
        throw Object.assign(new Error("Can't reach the server. Check your connection."), { network: true });
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && handleAuthFailure(data)) throw new Error(data.message);
    if (!res.ok) throw Object.assign(new Error(data.message || `Request failed (${res.status})`), { field: data.field, status: res.status });
    return data;
}

// Multipart request with upload progress (fetch can't report upload progress).
function apiUpload(method, path, formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, `/api${path}`);
        const token = sessionGet("sohify_token");
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
        xhr.onload = () => {
            let data = {};
            try {
                data = JSON.parse(xhr.responseText);
            } catch {}
            if (xhr.status === 401 && handleAuthFailure(data)) return reject(new Error(data.message));
            if (xhr.status >= 200 && xhr.status < 300) resolve(data);
            else reject(new Error(data.message || `Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
        xhr.send(formData);
    });
}

// Sends audio straight to storage with a one-time signed URL (the server never holds the file).
// Throws if direct upload isn't available, so the caller can fall back to the normal upload.
async function uploadAudioDirect(file, onProgress) {
    const sign = await api("/uploads/audio-url", {
        method: "POST",
        json: { filename: file.name, contentType: file.type || "", size: file.size }
    });
    await new Promise((resolve, reject) => {
        const body = new FormData(); // same format the official Supabase browser client uses
        body.append("cacheControl", sign.cacheControl || "31536000");
        body.append("", file);
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sign.uploadUrl);
        xhr.setRequestHeader("x-upsert", "false");
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Storage upload failed"));
        xhr.send(body);
    });
    return sign.path;
}

/* ==========================================================================
   3. STATE & SETTINGS
   ========================================================================== */
const state = {
    user: null,                 // { id, name, email, isAdmin, avatar }
    songs: new Map(),           // id -> song
    catalog: [],                // ids from /songs, newest first (public + my private)
    likedOrder: [],             // ids, oldest like first
    liked: new Set(),
    recent: [],                 // ids, newest first
    playlists: [],              // my playlists
    external: new Map(),        // shared playlists opened by link
    route: { name: "home" },
    lists: {},                  // listKey -> { ids, label } for cards on the current view
    loaded: false
};

const SETTINGS_KEY = "sohify_player";
const settings = Object.assign(
    { volume: 0.8, muted: false, shuffle: false, repeat: "off", speed: 1, lastId: null },
    (() => {
        try {
            return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
        } catch {
            return {};
        }
    })()
);
const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
const saveSettingsSoon = debounce(saveSettings, 400); // for sliders that fire many times a second

const isLoggedIn = () => !!state.user;
const canEdit = (song) => !!(state.user && song && (song.uploadedBy === state.user.id || state.user.isAdmin));
const myUploads = () => (state.user ? state.catalog.filter((id) => state.songs.get(id)?.uploadedBy === state.user.id) : []);

function mapSong(s) {
    return {
        id: String(s._id),
        title: s.title || "Untitled",
        artist: s.artist || "Unknown artist",
        album: s.album || "",
        duration: s.duration && s.duration !== "--:--" ? s.duration : "",
        cover: s.coverUrl || "",
        src: s.audioUrl,
        isPrivate: !!s.isPrivate,
        uploadedBy: s.uploadedBy ? String(s.uploadedBy._id || s.uploadedBy) : null
    };
}

function mapPlaylist(p, owner) {
    return {
        id: String(p._id),
        name: p.name,
        description: p.description || "",
        isPrivate: p.isPrivate !== false,
        coverUrl: p.coverUrl || "",
        songs: (p.songs || []).map((s) => String(s._id || s)),
        owner: owner || null
    };
}

/* ==========================================================================
   4. TOASTS, MENUS, DIALOGS
   ========================================================================== */
function toast(message, { type = "info", action } = {}) {
    const el = document.createElement("div");
    el.className = `toast ${type === "error" ? "error" : ""}`;
    el.setAttribute("role", type === "error" ? "alert" : "status");
    el.innerHTML = `<span>${esc(message)}</span>`;
    if (action) {
        const btn = document.createElement("button");
        btn.className = "toast-action";
        btn.textContent = action.label;
        btn.addEventListener("click", () => {
            action.onClick();
            el.remove();
        });
        el.appendChild(btn);
    }
    // Keep it calm: at most two toasts, newest replaces an identical one.
    const box = $("#toasts");
    $$(".toast", box).forEach((t) => t.textContent.startsWith(message) && t.remove());
    while (box.children.length >= 2) box.firstElementChild.remove();
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
        el.classList.remove("show");
        setTimeout(() => el.remove(), 250);
    }, action ? 5000 : 3000);
}

function requireLogin(reason = "Log in to do that") {
    if (isLoggedIn()) return true;
    toast(reason, { action: { label: "Log in", onClick: () => goToLogin(false) } });
    return false;
}

/* ---- Popover menu ---------------------------------------------------------
   items: { icon, label, onSelect, danger, checked } | "sep" | { title } | { html } */
const menuEl = $("#menu");
let menuState = null;

function openMenu(items, anchor, { onClose, align = "end" } = {}) {
    closeMenu();
    menuEl.innerHTML = items
        .map((it, i) => {
            if (it === "sep") return `<div class="menu-sep" role="separator"></div>`;
            if (it.title) return `<div class="menu-title">${esc(it.title)}</div>`;
            if (it.html) return it.html;
            const cls = ["menu-item", it.danger && "danger", it.checked && "is-checked"].filter(Boolean).join(" ");
            const icon = it.icon ? `<i class="fa-solid ${it.icon}"></i>` : "";
            return it.href
                ? `<a class="${cls}" role="menuitem" href="${esc(it.href)}" ${it.external ? 'target="_blank" rel="noopener"' : ""} data-i="${i}">${icon}<span>${esc(it.label)}</span></a>`
                : `<button class="${cls}" role="menuitem" data-i="${i}">${icon}<span>${esc(it.label)}</span></button>`;
        })
        .join("");
    menuEl.hidden = false;

    // Position next to the anchor element or at a point, kept inside the viewport.
    const mw = menuEl.offsetWidth;
    const mh = menuEl.offsetHeight;
    let x, y;
    if (anchor instanceof Element) {
        const r = anchor.getBoundingClientRect();
        x = align === "end" ? r.right - mw : r.left;
        y = r.bottom + 6;
        if (y + mh > innerHeight - 8) y = r.top - mh - 6;
        anchor.setAttribute("aria-expanded", "true");
    } else {
        x = anchor.x;
        y = anchor.y;
        if (y + mh > innerHeight - 8) y = anchor.y - mh;
    }
    menuEl.style.left = `${Math.max(8, Math.min(x, innerWidth - mw - 8))}px`;
    menuEl.style.top = `${Math.max(8, Math.min(y, innerHeight - mh - 8))}px`;

    menuState = { items, anchor, onClose };
    menuEl.querySelector(".menu-item")?.focus({ preventScroll: true });
}

function closeMenu() {
    if (!menuState) return;
    const { anchor, onClose } = menuState;
    menuState = null;
    menuEl.hidden = true;
    if (anchor instanceof Element) anchor.setAttribute("aria-expanded", "false");
    onClose?.();
}

menuEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-i]");
    if (!btn || !menuState) return;
    const item = menuState.items[Number(btn.dataset.i)];
    if (item.href) return closeMenu();
    closeMenu();
    item.onSelect?.();
});

menuEl.addEventListener("keydown", (e) => {
    const items = $$(".menu-item", menuEl);
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") items[(i + 1) % items.length]?.focus();
    else if (e.key === "ArrowUp") items[(i - 1 + items.length) % items.length]?.focus();
    else if (e.key === "Tab") closeMenu();
    else return;
    e.preventDefault();
});

document.addEventListener("pointerdown", (e) => {
    if (menuState && !menuEl.contains(e.target) && !(menuState.anchor instanceof Element && menuState.anchor.contains(e.target))) closeMenu();
});
window.addEventListener("resize", closeMenu);
document.addEventListener("scroll", closeMenu, true);

/* ---- Dialogs -------------------------------------------------------------- */
function openDialog(dlg) {
    closeMenu();
    if (!dlg.open) dlg.showModal();
}
function closeDialog(dlg) {
    if (dlg.open) dlg.close();
}

$$("dialog.modal").forEach((dlg) => {
    dlg.addEventListener("click", (e) => {
        if (e.target === dlg) closeDialog(dlg); // backdrop click
        if (e.target.closest("[data-close]")) closeDialog(dlg);
    });
});

function confirmDialog({ title, message, confirmText = "Confirm", danger = false }) {
    const dlg = $("#confirmDialog");
    $("#confirmTitle").textContent = title;
    $("#confirmText").textContent = message || "";
    const ok = $("#confirmOk");
    ok.textContent = confirmText;
    ok.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;
    dlg.returnValue = "";
    openDialog(dlg);
    ok.focus();
    return new Promise((resolve) => dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true }));
}

/* ==========================================================================
   5. DATA & ACTIONS
   ========================================================================== */
async function loadData() {
    // Both requests run at the same time instead of one after the other.
    const [songs, lib] = await Promise.all([api("/songs"), isLoggedIn() ? api(`/users/${state.user.id}/library`) : null]);
    state.catalog = [];
    songs.forEach((s) => {
        const song = mapSong(s);
        state.songs.set(song.id, song);
        state.catalog.push(song.id);
    });

    if (lib) {
        state.likedOrder = (lib.likedSongs || []).map(String);
        state.liked = new Set(state.likedOrder);
        state.recent = (lib.recentSongs || []).map(String);
        state.playlists = (lib.playlists || []).map((p) => mapPlaylist(p, { name: state.user.name, avatar: state.user.avatar, isMe: true }));
        if (lib.avatarUrl && lib.avatarUrl !== state.user.avatar) {
            state.user.avatar = lib.avatarUrl;
            sessionSet("sohify_avatar", lib.avatarUrl);
            renderAccount();
        }
    }
    state.loaded = true;
}

const findPlaylist = (id) => state.playlists.find((p) => p.id === id) || state.external.get(id) || null;
const isMyPlaylist = (pl) => !!pl && state.playlists.includes(pl);
const playlistSongs = (pl) => pl.songs.filter((id) => state.songs.has(id));
const totalDuration = (ids) => ids.reduce((sum, id) => sum + parseDur(state.songs.get(id)?.duration), 0);

function playlistCover(pl) {
    if (pl.coverUrl) return pl.coverUrl;
    const first = playlistSongs(pl)[0];
    return first ? coverOf(state.songs.get(first)) : DEFAULT_COVER;
}

async function toggleLike(id) {
    if (!requireLogin("Log in to save songs you like")) return;
    const wasLiked = state.liked.has(id);
    setLiked(id, !wasLiked);
    try {
        const res = await api(`/users/${state.user.id}/like`, { method: "POST", json: { songId: id } });
        if (res.liked !== !wasLiked) setLiked(id, res.liked);
        toast(res.liked ? "Added to Liked songs" : "Removed from Liked songs");
    } catch (err) {
        setLiked(id, wasLiked);
        toast(err.message, { type: "error" });
    }
}

function setLiked(id, liked) {
    if (liked) {
        state.liked.add(id);
        if (!state.likedOrder.includes(id)) state.likedOrder.push(id);
    } else {
        state.liked.delete(id);
        state.likedOrder = state.likedOrder.filter((x) => x !== id);
    }
    syncLikes();
    renderSidebar();
    if (state.route.name === "liked" || state.route.name === "home") renderView({ keepScroll: true });
}

async function togglePlaylistSong(plId, songId, { silent = false } = {}) {
    const pl = findPlaylist(plId);
    if (!pl) return;
    try {
        const res = await api(`/playlists/${plId}/toggle-song`, { method: "PUT", json: { songId } });
        pl.songs = res.songs.map(String);
        if (!silent) toast(res.added ? `Added to ${pl.name}` : `Removed from ${pl.name}`);
        renderSidebar();
        if (state.route.name === "playlist" && state.route.id === plId) renderView({ keepScroll: true });
        return res.added;
    } catch (err) {
        toast(err.message, { type: "error" });
        return null;
    }
}

async function createPlaylist(name) {
    const raw = await api(`/users/${state.user.id}/playlists`, { method: "POST", json: { name } });
    const pl = mapPlaylist(raw, { name: state.user.name, avatar: state.user.avatar, isMe: true });
    state.playlists.push(pl);
    renderSidebar();
    return pl;
}

async function deletePlaylist(pl) {
    const ok = await confirmDialog({
        title: `Delete "${pl.name}"?`,
        message: "This removes the playlist for good. The songs themselves stay in Sohify.",
        confirmText: "Delete",
        danger: true
    });
    if (!ok) return;
    try {
        await api(`/playlists/${pl.id}`, { method: "DELETE" });
        state.playlists = state.playlists.filter((p) => p !== pl);
        renderSidebar();
        toast("Playlist deleted");
        if (state.route.name === "playlist" && state.route.id === pl.id) navigate("#/");
    } catch (err) {
        toast(err.message, { type: "error" });
    }
}

async function setPlaylistPrivacy(pl, isPrivate) {
    const fd = new FormData();
    fd.append("isPrivate", String(isPrivate));
    const raw = await api(`/playlists/${pl.id}`, { method: "PUT", body: fd });
    pl.isPrivate = raw.isPrivate !== false;
    renderSidebar();
    if (state.route.name === "playlist" && state.route.id === pl.id) renderView({ keepScroll: true });
}

async function sharePlaylist(pl) {
    if (pl.isPrivate) {
        const ok = await confirmDialog({
            title: "Make this playlist public?",
            message: "Only public playlists can be opened from a link. Anyone with the link will be able to see and play it.",
            confirmText: "Make public & copy link"
        });
        if (!ok) return;
        try {
            await setPlaylistPrivacy(pl, false);
        } catch (err) {
            return toast(err.message, { type: "error" });
        }
    }
    const link = `${location.origin}/Dashboard?playlist=${pl.id}`;
    toast((await copyText(link)) ? "Link copied to clipboard" : "Couldn't copy the link", { type: "info" });
}

async function deleteSong(song) {
    const ok = await confirmDialog({
        title: `Delete "${song.title}"?`,
        message: song.isPrivate
            ? "The file will be removed from your uploads and from any playlists."
            : "This removes the song from the catalog for everyone, and from every playlist.",
        confirmText: "Delete",
        danger: true
    });
    if (!ok) return;
    try {
        await api(`/songs/${song.id}`, { method: "DELETE" });
        removeSongLocally(song.id);
        toast("Song deleted");
    } catch (err) {
        toast(err.message, { type: "error" });
    }
}

function removeSongLocally(id) {
    if (P.currentId === id) {
        audio.pause();
        audio.removeAttribute("src");
        P.currentId = null;
        syncNowPlaying();
    }
    state.songs.delete(id);
    state.catalog = state.catalog.filter((x) => x !== id);
    state.likedOrder = state.likedOrder.filter((x) => x !== id);
    state.liked.delete(id);
    state.recent = state.recent.filter((x) => x !== id);
    state.playlists.forEach((p) => (p.songs = p.songs.filter((x) => x !== id)));
    P.upNext = P.upNext.filter((x) => x !== id);
    const idx = P.order.indexOf(id);
    if (idx !== -1) {
        P.order.splice(idx, 1);
        if (idx <= P.pos) P.pos--;
    }
    P.base = P.base.filter((x) => x !== id);
    renderSidebar();
    renderView({ keepScroll: true });
    renderQueue();
}

async function downloadSong(song) {
    toast("Preparing download…");
    try {
        const res = await fetch(song.src);
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const ext = (song.src.split("?")[0].match(/\.(\w{2,4})$/) || [, "mp3"])[1];
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${song.artist} - ${song.title}.${ext}`.replace(/[\\/:*?"<>|]/g, "_");
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
        window.open(song.src, "_blank", "noopener");
    }
}

function recordRecent(id) {
    state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 20);
    if (isLoggedIn()) api(`/users/${state.user.id}/recent`, { method: "POST", json: { songId: id } }).catch(() => {});
}

/* ---- Track & playlist option menus --------------------------------------- */
function openTrackMenu(songId, anchor, { playlistId } = {}) {
    const song = state.songs.get(songId);
    if (!song) return;
    const pl = playlistId ? findPlaylist(playlistId) : null;
    const liked = state.liked.has(songId);
    const items = [
        { icon: "fa-play", label: P.currentId === songId && !audio.paused ? "Pause" : "Play", onSelect: () => playFromView(songId) },
        { icon: "fa-angles-right", label: "Play next", onSelect: () => queueSong(songId, true) },
        { icon: "fa-list", label: "Add to queue", onSelect: () => queueSong(songId, false) },
        "sep",
        { icon: liked ? "fa-heart-crack" : "fa-heart", label: liked ? "Remove from Liked songs" : "Add to Liked songs", onSelect: () => toggleLike(songId) },
        { icon: "fa-folder-plus", label: "Add to playlist…", onSelect: () => openAddToPlaylist(songId) }
    ];
    if (pl && isMyPlaylist(pl)) items.push({ icon: "fa-minus", label: "Remove from this playlist", onSelect: () => togglePlaylistSong(pl.id, songId) });
    items.push("sep", { icon: "fa-download", label: "Download", onSelect: () => downloadSong(song) });
    if (canEdit(song)) {
        items.push(
            { icon: "fa-pen", label: "Edit details", onSelect: () => openSongDialog({ editId: songId }) },
            { icon: "fa-trash-can", label: "Delete song", danger: true, onSelect: () => deleteSong(song) }
        );
    }

    const row = anchor instanceof Element ? anchor.closest(".row") : null;
    row?.classList.add("is-menu");
    openMenu(items, anchor, { onClose: () => row?.classList.remove("is-menu") });
}

function openPlaylistMenu(pl, anchor) {
    openMenu(
        [
            { icon: "fa-pen", label: "Edit details", onSelect: () => openPlaylistDialog(pl) },
            { icon: "fa-plus", label: "Add songs", onSelect: () => openAddSongs(pl) },
            {
                icon: pl.isPrivate ? "fa-globe" : "fa-lock",
                label: pl.isPrivate ? "Make public" : "Make private",
                onSelect: () =>
                    setPlaylistPrivacy(pl, !pl.isPrivate)
                        .then(() => toast(pl.isPrivate ? "Playlist is now private" : "Playlist is now public"))
                        .catch((err) => toast(err.message, { type: "error" }))
            },
            { icon: "fa-link", label: "Copy link", onSelect: () => sharePlaylist(pl) },
            "sep",
            { icon: "fa-trash-can", label: "Delete playlist", danger: true, onSelect: () => deletePlaylist(pl) }
        ],
        anchor,
        { align: "start" }
    );
}

/* ==========================================================================
   6. RENDERING
   ========================================================================== */
const contentEl = $("#content");

function renderAccount() {
    const u = state.user;
    $("#guestActions").hidden = !!u;
    $("#profile").hidden = !u;
    if (!u) return;
    $("#profileName").textContent = u.name;
    const av = $("#avatarSmall");
    if (u.avatar) {
        av.style.backgroundImage = `url("${u.avatar.replace(/"/g, "%22")}")`;
        av.textContent = "";
    } else {
        av.style.backgroundImage = "";
        av.textContent = initials(u.name);
    }
}

function avatarHTML(user, cls = "") {
    if (user?.avatar) return `<span class="avatar ${cls}" style="background-image:url(&quot;${esc(user.avatar)}&quot;)"></span>`;
    return `<span class="avatar ${cls}">${esc(initials(user?.name))}</span>`;
}

function renderSidebar() {
    const n = state.liked.size;
    $("#likedCount").textContent = isLoggedIn() && n ? n : "";
    const u = myUploads().length;
    $("#uploadsCount").textContent = isLoggedIn() && u ? u : "";

    const list = $("#sidebarPlaylists");
    if (!isLoggedIn()) {
        list.innerHTML = `<li class="side-empty">Log in to create playlists.</li>`;
    } else if (!state.playlists.length) {
        list.innerHTML = `<li class="side-empty">No playlists yet. <button type="button" data-act="new-playlist">Create one</button></li>`;
    } else {
        list.innerHTML = state.playlists
            .map((pl) => {
                const active = state.route.name === "playlist" && state.route.id === pl.id;
                return `<li><a href="#/playlist/${pl.id}" class="side-pl ${active ? "is-active" : ""}">
                    <img class="thumb" src="${esc(playlistCover(pl))}" alt="" loading="lazy" decoding="async">
                    <span class="side-pl-text"><strong>${esc(pl.name)}</strong><span>${pl.isPrivate ? "Private" : "Public"} · ${plural(playlistSongs(pl).length, "song")}</span></span>
                </a></li>`;
            })
            .join("");
    }

    $$(".side-link").forEach((a) => a.classList.toggle("is-active", a.dataset.route === state.route.name));
}

/* ---- Pieces ---------------------------------------------------------------- */
function rowHTML(song, i, { showLike = true } = {}) {
    const liked = state.liked.has(song.id);
    const current = P.currentId === song.id;
    return `<div class="row ${current ? "is-current" : ""}" data-id="${song.id}" role="button" tabindex="0" aria-label="Play ${esc(song.title)} by ${esc(song.artist)}">
        <div class="c-num"><span class="num">${i + 1}</span><i class="fa-solid fa-play"></i><i class="fa-solid fa-pause"></i><i class="fa-solid fa-volume-high"></i></div>
        <div class="c-title">
            <img class="thumb" src="${esc(coverOf(song))}" alt="" loading="lazy" decoding="async">
            <div class="c-title-text">
                <div class="t-name"><span>${esc(song.title)}</span>${song.isPrivate ? `<em class="tag" title="Only you can see this"><i class="fa-solid fa-lock"></i> Private</em>` : ""}</div>
                <div class="t-artist">${esc(song.artist)}</div>
            </div>
        </div>
        <div class="c-album">${esc(song.album) || "—"}</div>
        <div class="c-like">${showLike ? `<button class="icon-btn sm like-btn ${liked ? "is-on" : ""}" data-act="like" aria-label="${liked ? "Remove from" : "Add to"} Liked songs" aria-pressed="${liked}"><i class="fa-${liked ? "solid" : "regular"} fa-heart"></i></button>` : ""}</div>
        <div class="c-dur">${esc(song.duration) || "–:––"}</div>
        <div class="c-more"><button class="icon-btn sm" data-act="track-menu" aria-label="More options for ${esc(song.title)}" aria-haspopup="menu"><i class="fa-solid fa-ellipsis"></i></button></div>
    </div>`;
}

// Long lists render in chunks: the first rows appear instantly and more are added as you scroll.
const ROW_CHUNK = 100;
const ROW_HEIGHT = 58;
let rowsShown = 0;
let rowObserver = null;

function tracklistHTML(ids, count = ROW_CHUNK) {
    rowsShown = Math.min(ids.length, count);
    return `<div class="tracklist" role="list">
        <div class="tl-head" aria-hidden="true">
            <span class="c-num">#</span><span>Title</span><span class="c-album">Album</span><span></span><span class="c-dur"><i class="fa-regular fa-clock"></i></span><span></span>
        </div>
        ${ids.slice(0, rowsShown).map((id, i) => rowHTML(state.songs.get(id), i, { showLike: isLoggedIn() })).join("")}
        ${rowsShown < ids.length ? `<div class="tl-more" aria-hidden="true" style="height:${(ids.length - rowsShown) * ROW_HEIGHT}px"></div>` : ""}
    </div>`;
}

function mountMoreRows() {
    rowObserver?.disconnect();
    const sentinel = $(".tl-more", contentEl);
    if (!sentinel || !currentView || !("IntersectionObserver" in window)) return;
    const ids = currentView.ids;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && appendChunk(), {
        root: contentEl,
        rootMargin: "600px 0px"
    });
    rowObserver = observer;

    function appendChunk() {
        if (rowObserver !== observer || !sentinel.isConnected) return;
        const end = Math.min(ids.length, rowsShown + ROW_CHUNK);
        sentinel.insertAdjacentHTML(
            "beforebegin",
            ids.slice(rowsShown, end).map((id, k) => rowHTML(state.songs.get(id), rowsShown + k, { showLike: isLoggedIn() })).join("")
        );
        rowsShown = end;
        if (rowsShown >= ids.length) {
            observer.disconnect();
            sentinel.remove();
            return;
        }
        sentinel.style.height = `${(ids.length - rowsShown) * ROW_HEIGHT}px`;
        // Still in view (e.g. the scrollbar was dragged to the bottom)? Keep filling.
        const box = contentEl.getBoundingClientRect();
        if (sentinel.getBoundingClientRect().top < box.bottom + 600) requestAnimationFrame(appendChunk);
    }
    observer.observe(sentinel);
}

function songCardHTML(song, listKey) {
    const current = P.currentId === song.id;
    return `<div class="card ${current ? "is-current" : ""}" data-song="${song.id}" data-list="${listKey}" role="button" tabindex="0" aria-label="Play ${esc(song.title)}">
        <div class="card-art">
            <img src="${esc(coverOf(song))}" alt="" loading="lazy" decoding="async">
            <span class="card-play" aria-hidden="true"><i class="fa-solid ${current && !audio.paused ? "fa-pause" : "fa-play"}"></i></span>
        </div>
        <div class="card-title">${esc(song.title)}</div>
        <div class="card-sub">${esc(song.artist)}</div>
    </div>`;
}

function playlistCardHTML(pl) {
    return `<a class="card" href="#/playlist/${pl.id}">
        <div class="card-art"><img src="${esc(playlistCover(pl))}" alt="" loading="lazy" decoding="async"></div>
        <div class="card-title">${esc(pl.name)}</div>
        <div class="card-sub">${plural(playlistSongs(pl).length, "song")}</div>
    </a>`;
}

function sectionHTML(title, body, link) {
    return `<section class="section">
        <div class="section-head"><h2>${esc(title)}</h2>${link ? `<a class="text-link" href="${link}">Show all</a>` : ""}</div>
        ${body}
    </section>`;
}

function emptyHTML(icon, title, text, button = "") {
    return `<div class="empty"><i class="fa-solid ${icon}"></i><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ""}${button}</div>`;
}

/* ---- Views ----------------------------------------------------------------- */
function homeHTML() {
    state.lists = {};
    const parts = [];
    const name = state.user ? state.user.name.split(" ")[0] : "";
    parts.push(`<h1 class="greeting">${greetingText()}${name ? `, ${esc(name)}` : ""}</h1>`);

    if (isLoggedIn()) {
        const tiles = [
            `<a class="quick-tile" href="#/liked"><span class="thumb tile-icon liked"><i class="fa-solid fa-heart"></i></span><span>Liked songs</span></a>`,
            `<a class="quick-tile" href="#/uploads"><span class="thumb tile-icon uploads"><i class="fa-solid fa-cloud-arrow-up"></i></span><span>My uploads</span></a>`,
            ...state.playlists.slice(0, 4).map(
                (pl) => `<a class="quick-tile" href="#/playlist/${pl.id}"><img class="thumb" src="${esc(playlistCover(pl))}" alt=""><span>${esc(pl.name)}</span></a>`
            )
        ];
        parts.push(`<div class="quick-grid">${tiles.join("")}</div>`);
    } else {
        parts.push(`<div class="notice">
            <div><h3>Make Sohify yours</h3><p>Create a free account to like songs, build playlists and upload your own music.</p></div>
            <div class="notice-actions"><a class="btn btn-ghost" href="/Login?next=/Dashboard">Log in</a><a class="btn btn-primary" href="/Sign-Up">Sign up free</a></div>
        </div>`);
    }

    const recent = state.recent.filter((id) => state.songs.has(id));
    if (recent.length) {
        state.lists.recent = { ids: recent, label: "Recently played", key: "recent" };
        parts.push(sectionHTML("Recently played", `<div class="card-row one-line">${recent.slice(0, 10).map((id) => songCardHTML(state.songs.get(id), "recent")).join("")}</div>`, "#/recent"));
    }

    const fresh = state.catalog.filter((id) => !state.songs.get(id).isPrivate);
    if (fresh.length) {
        state.lists.fresh = { ids: fresh, label: "New on Sohify", key: "songs" };
        parts.push(sectionHTML("New on Sohify", `<div class="card-row one-line">${fresh.slice(0, 12).map((id) => songCardHTML(state.songs.get(id), "fresh")).join("")}</div>`, "#/songs"));
    }

    if (state.playlists.length) {
        parts.push(sectionHTML("Your playlists", `<div class="card-row">${state.playlists.map(playlistCardHTML).join("")}</div>`));
    }

    const uploads = myUploads();
    if (uploads.length) {
        state.lists.uploads = { ids: uploads, label: "My uploads", key: "uploads" };
        parts.push(sectionHTML("Your uploads", `<div class="card-row one-line">${uploads.slice(0, 12).map((id) => songCardHTML(state.songs.get(id), "uploads")).join("")}</div>`, "#/uploads"));
    }

    if (!fresh.length && !uploads.length) {
        parts.push(
            emptyHTML(
                "fa-music",
                "No music here yet",
                "Upload your first song to start listening.",
                `<button class="btn btn-primary" data-act="upload"><i class="fa-solid fa-arrow-up-from-bracket"></i> Upload a song</button>`
            )
        );
    }
    return parts.join("");
}

// Describes a list view (all songs, liked, uploads, recent, playlist, search).
function listView(route) {
    const loginNeeded = (icon, title) => ({
        key: route.name,
        guest: true,
        head: { type: "Collection", title, icon, iconClass: route.name },
        ids: [],
        empty: emptyHTML(
            "fa-lock",
            "Log in to see this",
            "Your library is saved to your account.",
            `<a class="btn btn-primary" href="/Login?next=${encodeURIComponent("/Dashboard#/" + route.name)}">Log in</a>`
        )
    });

    switch (route.name) {
        case "songs":
            return {
                key: "songs",
                label: "All songs",
                head: { type: "Collection", title: "All songs", icon: "fa-music", iconClass: "songs" },
                ids: state.catalog,
                empty: emptyHTML("fa-music", "No songs yet", "Be the first to upload one.", `<button class="btn btn-primary" data-act="upload">Upload a song</button>`)
            };
        case "liked":
            if (!isLoggedIn()) return loginNeeded("fa-heart", "Liked songs");
            return {
                key: "liked",
                label: "Liked songs",
                head: { type: "Collection", title: "Liked songs", icon: "fa-heart", iconClass: "liked", owner: true },
                ids: state.likedOrder.filter((id) => state.songs.has(id)).reverse(),
                empty: emptyHTML("fa-heart", "Songs you like will appear here", "Tap the heart on any song to save it.", `<a class="btn btn-secondary" href="#/songs">Browse songs</a>`)
            };
        case "uploads":
            if (!isLoggedIn()) return loginNeeded("fa-cloud-arrow-up", "My uploads");
            return {
                key: "uploads",
                label: "My uploads",
                head: { type: "Collection", title: "My uploads", icon: "fa-cloud-arrow-up", iconClass: "uploads", owner: true, desc: "Songs you uploaded. Private songs are only visible to you." },
                ids: myUploads(),
                empty: emptyHTML(
                    "fa-cloud-arrow-up",
                    "Upload your own music",
                    "Add MP3, WAV, FLAC, M4A or OGG files. They stay private unless you choose otherwise.",
                    `<button class="btn btn-primary" data-act="upload"><i class="fa-solid fa-arrow-up-from-bracket"></i> Upload a song</button>`
                )
            };
        case "recent":
            if (!isLoggedIn()) return loginNeeded("fa-clock-rotate-left", "Recently played");
            return {
                key: "recent",
                label: "Recently played",
                head: { type: "Collection", title: "Recently played", icon: "fa-clock-rotate-left", iconClass: "recent", hideTotal: true },
                ids: state.recent.filter((id) => state.songs.has(id)),
                empty: emptyHTML("fa-clock-rotate-left", "Nothing played yet", "Songs you play will show up here.", `<a class="btn btn-secondary" href="#/songs">Browse songs</a>`)
            };
        case "search": {
            const q = route.q.toLowerCase();
            const words = q.split(/\s+/).filter(Boolean);
            const ids = Array.from(state.songs.values())
                .filter((s) => {
                    const hay = `${s.title} ${s.artist} ${s.album}`.toLowerCase();
                    return words.every((w) => hay.includes(w));
                })
                .map((s) => s.id);
            return {
                key: `search:${q}`,
                label: `Search: ${route.q}`,
                head: { type: "Search", title: `“${route.q}”`, icon: "fa-magnifying-glass", iconClass: "search", hideTotal: true, compact: true },
                ids,
                empty: emptyHTML("fa-magnifying-glass", `No results for “${route.q}”`, "Check the spelling or try a different song, artist or album.")
            };
        }
        case "playlist": {
            const pl = findPlaylist(route.id);
            if (!pl) return null;
            const mine = isMyPlaylist(pl);
            return {
                key: `pl:${pl.id}`,
                label: pl.name,
                playlist: pl,
                head: {
                    type: `${pl.isPrivate ? "Private" : "Public"} playlist`,
                    title: pl.name,
                    image: playlistCover(pl),
                    desc: pl.description,
                    ownerUser: pl.owner,
                    mine
                },
                ids: playlistSongs(pl),
                empty: mine
                    ? emptyHTML("fa-list", "This playlist is empty", "Find songs to add to it.", `<button class="btn btn-primary" data-act="add-songs"><i class="fa-solid fa-plus"></i> Add songs</button>`)
                    : emptyHTML("fa-list", "This playlist is empty", "")
            };
        }
    }
    return null;
}

function listHTML(view, rowCount) {
    const h = view.head;
    const count = view.ids.length;
    const total = totalDuration(view.ids);
    const art = h.image
        ? `<div class="view-art"><img src="${esc(h.image)}" alt=""></div>`
        : `<div class="view-art icon ${h.iconClass}"><i class="fa-solid ${h.icon}"></i></div>`;

    const meta = [];
    if (h.ownerUser) meta.push(`${avatarHTML(h.ownerUser)}<strong>${esc(h.ownerUser.isMe ? "You" : h.ownerUser.name || "Someone")}</strong>`);
    else if (h.owner && state.user) meta.push(`${avatarHTML(state.user)}<strong>${esc(state.user.name)}</strong>`);
    if (!view.guest) meta.push(`<span>${plural(count, "song")}${total && !h.hideTotal ? `, ${fmtTotal(total)}` : ""}</span>`);

    const playingThis = P.contextKey === view.key && !audio.paused;
    const actions = view.guest
        ? ""
        : `<div class="view-actions">
            <button class="play-xl" data-act="play-all" ${count ? "" : "disabled"} aria-label="${playingThis ? "Pause" : "Play"}">
                <i class="fa-solid ${playingThis ? "fa-pause" : "fa-play"}"></i>
            </button>
            <button class="icon-btn lg" data-act="shuffle-all" ${count ? "" : "disabled"} title="Shuffle play" aria-label="Shuffle play"><i class="fa-solid fa-shuffle"></i></button>
            ${h.mine ? `<button class="btn btn-secondary" data-act="add-songs"><i class="fa-solid fa-plus"></i> Add songs</button>
                        <button class="icon-btn lg" data-act="playlist-menu" title="More options" aria-label="Playlist options" aria-haspopup="menu"><i class="fa-solid fa-ellipsis"></i></button>` : ""}
           </div>`;

    return `<header class="view-head" ${h.compact ? 'style="padding-bottom:12px"' : ""}>
            ${h.compact ? "" : art}
            <div class="view-info">
                <span class="view-type">${esc(h.type)}</span>
                <h1 class="view-title">${esc(h.title)}</h1>
                ${h.desc ? `<p class="view-desc">${esc(h.desc)}</p>` : ""}
                ${meta.length ? `<div class="view-meta">${meta.join('<span class="dot">•</span>')}</div>` : ""}
            </div>
        </header>
        ${actions}
        ${count ? tracklistHTML(view.ids, rowCount) : view.empty}`;
}

let currentView = null;

function renderView({ keepScroll = false } = {}) {
    const top = contentEl.scrollTop;
    const r = state.route;

    if (!state.loaded) {
        contentEl.innerHTML = emptyHTML("fa-spinner fa-spin", "Loading your music…", "");
        return;
    }

    if (r.name === "home") {
        currentView = null;
        contentEl.innerHTML = homeHTML();
        document.title = "Sohify – Web Player";
    } else if (r.name === "playlist" && !findPlaylist(r.id)) {
        currentView = null;
        contentEl.innerHTML = emptyHTML("fa-spinner fa-spin", "Opening playlist…", "");
        loadExternalPlaylist(r.id);
        return;
    } else {
        currentView = listView(r);
        if (!currentView) return navigate("#/", true);
        state.lists = {};
        // When re-rendering in place, render enough rows to keep the scroll position.
        const needed = keepScroll ? Math.max(ROW_CHUNK, Math.ceil((top + contentEl.clientHeight) / ROW_HEIGHT) + 20) : ROW_CHUNK;
        contentEl.innerHTML = listHTML(currentView, needed);
        document.title = `${currentView.head.title.replace(/[“”]/g, "")} – Sohify`;
    }
    contentEl.scrollTop = keepScroll ? top : 0;
    mountMoreRows();
}

async function loadExternalPlaylist(id) {
    try {
        const data = await api(`/playlists/${id}`);
        (data.songs || []).forEach((s) => {
            if (!state.songs.has(String(s._id))) state.songs.set(String(s._id), mapSong(s));
        });
        const owner = data.user ? { name: data.user.name, avatar: data.user.avatarUrl } : null;
        const mineAlready = state.playlists.find((p) => p.id === id);
        if (!mineAlready) state.external.set(id, mapPlaylist(data, owner));
    } catch (err) {
        contentEl.innerHTML = emptyHTML("fa-lock", "Can't open this playlist", err.message || "It may be private or deleted.", `<a class="btn btn-secondary" href="#/">Go home</a>`);
        return;
    }
    if (state.route.name === "playlist" && state.route.id === id) renderView();
}

/* ==========================================================================
   7. ROUTER  (#/  #/songs  #/liked  #/uploads  #/recent  #/playlist/:id  #/search/:q)
   ========================================================================== */
let lastBrowseHash = "#/";

function parseHash() {
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    const [name, arg] = [parts[0], parts.slice(1).join("/")];
    if (name === "playlist" && arg) return { name: "playlist", id: arg };
    if (name === "search") {
        const q = decodeURIComponent(arg || "").trim();
        return q ? { name: "search", q } : { name: "home" };
    }
    if (["songs", "liked", "uploads", "recent"].includes(name)) return { name };
    return { name: "home" };
}

function navigate(hash, replace = false) {
    if (replace) {
        history.replaceState(null, "", hash);
        onRoute();
    } else if (location.hash === hash) {
        onRoute();
    } else {
        location.hash = hash;
    }
}

function onRoute() {
    state.route = parseHash();
    const input = $("#searchInput");
    if (state.route.name !== "search") {
        lastBrowseHash = location.hash || "#/";
        if (document.activeElement !== input) input.value = "";
    } else if (document.activeElement !== input) {
        input.value = state.route.q;
    }
    closeSidebar();
    closeMenu();
    renderSidebar();
    renderView();
}

window.addEventListener("hashchange", onRoute);

const searchInput = $("#searchInput");
searchInput.addEventListener(
    "input",
    debounce(() => {
        const q = searchInput.value.trim();
        if (!q) return navigate(lastBrowseHash, true);
        const hash = `#/search/${encodeURIComponent(q)}`;
        navigate(hash, state.route.name === "search");
    }, 200)
);
searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        searchInput.value = "";
        searchInput.blur();
        if (state.route.name === "search") navigate(lastBrowseHash, true);
    }
});

/* ==========================================================================
   8. PLAYER ENGINE
   ========================================================================== */
const audio = $("#audio");
const P = {
    base: [],          // ids of the list that was played (original order)
    order: [],         // play order (shuffled or not)
    pos: -1,           // index into order
    upNext: [],        // manually queued ids, played before the rest
    currentId: null,
    contextKey: null,
    contextLabel: "",
    shuffle: !!settings.shuffle,
    repeat: ["off", "all", "one"].includes(settings.repeat) ? settings.repeat : "off",
    seeking: false,
    counted: false     // added to "recently played" yet?
};

function buildOrder(anchorId) {
    const inBase = P.base.includes(anchorId);
    if (P.shuffle) {
        const rest = shuffled(P.base.filter((id) => id !== anchorId));
        P.order = inBase ? [anchorId, ...rest] : rest;
        P.pos = inBase ? 0 : -1;
    } else {
        P.order = P.base.slice();
        P.pos = inBase ? P.order.indexOf(anchorId) : -1;
    }
}

function playList(ids, startId, key, label) {
    ids = ids.filter((id) => state.songs.has(id));
    if (!ids.length) return;
    P.base = ids.slice();
    P.contextKey = key;
    P.contextLabel = label;
    const first = startId ?? (P.shuffle ? ids[Math.floor(Math.random() * ids.length)] : ids[0]);
    buildOrder(first);
    loadSong(first, true);
}

function loadSong(id, autoplay = true) {
    const song = state.songs.get(id);
    if (!song) return;
    P.currentId = id;
    P.counted = false;
    audio.src = song.src;
    audio.defaultPlaybackRate = settings.speed;
    audio.playbackRate = settings.speed;
    settings.lastId = id;
    saveSettings();
    syncNowPlaying();
    syncRows();
    renderQueue();
    if (autoplay) {
        audio.play().catch((err) => {
            if (err.name !== "AbortError") toast("Press play to start listening");
        });
    }
}

function togglePlay() {
    if (!P.currentId) {
        const ids = currentView?.ids?.length ? currentView.ids : state.catalog;
        if (!ids.length) return toast("No songs to play yet");
        return playList(ids, null, currentView?.key || "songs", currentView?.label || "All songs");
    }
    if (audio.paused) audio.play().catch(() => toast("Couldn't play this song", { type: "error" }));
    else audio.pause();
}

function next(auto = false) {
    if (auto && P.repeat === "one") {
        audio.currentTime = 0;
        audio.play();
        return;
    }
    if (P.upNext.length) return loadSong(P.upNext.shift(), true);
    if (P.pos + 1 < P.order.length) {
        P.pos++;
        return loadSong(P.order[P.pos], true);
    }
    if (!P.order.length) return;
    // End of the list
    if (P.repeat === "all") {
        if (P.shuffle) P.order = shuffled(P.base);
        P.pos = 0;
        loadSong(P.order[0], true);
    } else {
        P.pos = 0;
        loadSong(P.order[0], false);
        if (auto) toast("End of the list");
    }
}

function prev() {
    if (audio.currentTime > 3 || P.pos <= 0) {
        audio.currentTime = 0;
        return;
    }
    P.pos--;
    loadSong(P.order[P.pos], true);
}

function setShuffle(on) {
    P.shuffle = on;
    settings.shuffle = on;
    saveSettings();
    if (P.currentId) buildOrder(P.currentId);
    syncModes();
    renderQueue();
}

function cycleRepeat() {
    P.repeat = { off: "all", all: "one", one: "off" }[P.repeat];
    settings.repeat = P.repeat;
    saveSettings();
    syncModes();
    toast({ off: "Repeat off", all: "Repeating the list", one: "Repeating this song" }[P.repeat]);
}

function queueSong(id, playNext) {
    if (!P.currentId) {
        P.base = [id];
        P.contextKey = null;
        P.contextLabel = "Queue";
        buildOrder(id);
        return loadSong(id, true);
    }
    if (playNext) P.upNext.unshift(id);
    else P.upNext.push(id);
    renderQueue();
    toast(playNext ? "Will play next" : "Added to queue");
}

// Play a song from wherever the user clicked it (current list view).
function playFromView(id, listKey) {
    if (P.currentId === id) return togglePlay();
    const list = listKey ? state.lists[listKey] : currentView;
    if (list && list.ids?.includes(id)) playList(list.ids, id, list.key, list.label);
    else playList([id], id, null, state.songs.get(id)?.title || "");
}

function applyVolume() {
    audio.volume = settings.muted ? 0 : settings.volume;
    syncVolume();
}

function setVolume(v) {
    settings.volume = Math.max(0, Math.min(1, v));
    settings.muted = settings.volume === 0;
    saveSettingsSoon();
    applyVolume();
}

function toggleMute() {
    if (settings.muted && settings.volume === 0) settings.volume = 0.5;
    settings.muted = !settings.muted;
    saveSettings();
    applyVolume();
}

/* ---- Audio element events ------------------------------------------------- */
audio.addEventListener("play", syncPlayState);
audio.addEventListener("pause", syncPlayState);
audio.addEventListener("ended", () => {
    if (sleep.endOfSong) {
        clearSleep();
        toast("Sleep timer ended");
        return;
    }
    next(true);
});
audio.addEventListener("timeupdate", () => {
    syncProgress();
    if (!P.counted && audio.currentTime > 5 && P.currentId) {
        P.counted = true;
        recordRecent(P.currentId);
    }
});
audio.addEventListener("loadedmetadata", () => {
    const song = state.songs.get(P.currentId);
    if (song && !song.duration && Number.isFinite(audio.duration)) {
        song.duration = fmtTime(audio.duration);
        $$(`.row[data-id="${song.id}"] .c-dur`, contentEl).forEach((el) => (el.textContent = song.duration));
    }
    syncProgress();
});
audio.addEventListener("error", () => {
    if (!audio.getAttribute("src")) return;
    toast("This song couldn't be loaded", { type: "error" });
});

if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => audio.play());
    ms.setActionHandler("pause", () => audio.pause());
    ms.setActionHandler("previoustrack", prev);
    ms.setActionHandler("nexttrack", () => next());
    try {
        ms.setActionHandler("seekto", (d) => (audio.currentTime = d.seekTime));
    } catch {}
}

/* ==========================================================================
   9. PLAYER UI SYNC
   ========================================================================== */
function syncNowPlaying() {
    const song = state.songs.get(P.currentId);
    $$('[data-np="title"]').forEach((el) => (el.textContent = song ? song.title : "Nothing playing"));
    $$('[data-np="artist"]').forEach((el) => (el.textContent = song ? song.artist : "Pick a song to start"));
    $$('[data-np="cover"]').forEach((el) => (el.src = song ? coverOf(song) : DEFAULT_COVER));
    $$('[data-np="context"]').forEach((el) => (el.textContent = P.contextLabel || "—"));
    $("#npBackdrop").style.backgroundImage = song?.cover ? `url("${song.cover.replace(/"/g, "%22")}")` : "";
    document.title = song ? `${song.title} · ${song.artist} – Sohify` : document.title;

    if ("mediaSession" in navigator && song) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            album: song.album || "Sohify",
            artwork: song.cover ? [{ src: song.cover, sizes: "512x512" }] : []
        });
    }
    syncLikes();
    syncProgress();
}

function syncPlayState() {
    const playing = !audio.paused && !!P.currentId;
    document.body.classList.toggle("is-playing", playing);
    $$('[data-cmd="toggle"]').forEach((b) => {
        b.innerHTML = `<i class="fa-solid ${playing ? "fa-pause" : "fa-play"}"></i>`;
        b.setAttribute("aria-label", playing ? "Pause" : "Play");
        b.title = playing ? "Pause (Space)" : "Play (Space)";
    });
    const playAll = $('[data-act="play-all"]', contentEl);
    if (playAll && currentView) {
        const mine = P.contextKey === currentView.key && playing;
        playAll.innerHTML = `<i class="fa-solid ${mine ? "fa-pause" : "fa-play"}"></i>`;
        playAll.setAttribute("aria-label", mine ? "Pause" : "Play");
    }
    $$(".card[data-song]", contentEl).forEach((c) => {
        const icon = $(".card-play i", c);
        if (icon) icon.className = `fa-solid ${c.dataset.song === P.currentId && playing ? "fa-pause" : "fa-play"}`;
    });
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
}

function syncRows() {
    $$(".row[data-id]", contentEl).forEach((r) => r.classList.toggle("is-current", r.dataset.id === P.currentId));
    $$(".card[data-song]", contentEl).forEach((c) => c.classList.toggle("is-current", c.dataset.song === P.currentId));
    syncPlayState();
}

// The player bar and now-playing screen never change, so their elements are looked up once.
const progressEls = {
    seek: $$('[data-bind="seek"]'),
    current: $$('[data-np="current"]'),
    duration: $$('[data-np="duration"]'),
    bar: $$('[data-np="bar"]')
};
let lastProgress = { cur: "", dur: "", pct: -1 };

function syncProgress() {
    const dur = audio.duration;
    const cur = audio.currentTime;
    const ratio = Number.isFinite(dur) && dur > 0 ? cur / dur : 0;
    const pct = Math.round(ratio * 1000);
    const curText = fmtTime(cur);
    const durText = Number.isFinite(dur) ? fmtTime(dur) : state.songs.get(P.currentId)?.duration || "0:00";

    if (!P.seeking && pct !== lastProgress.pct) {
        progressEls.seek.forEach((r) => {
            r.value = pct;
            r.style.setProperty("--p", `${pct / 10}%`);
        });
        progressEls.bar.forEach((el) => (el.style.width = `${pct / 10}%`));
    }
    if (!P.seeking && curText !== lastProgress.cur) progressEls.current.forEach((el) => (el.textContent = curText));
    if (durText !== lastProgress.dur) progressEls.duration.forEach((el) => (el.textContent = durText));
    lastProgress = { cur: P.seeking ? "" : curText, dur: durText, pct: P.seeking ? -1 : pct };
}

function syncLikes() {
    const on = !!P.currentId && state.liked.has(P.currentId);
    $$('[data-cmd="like"]').forEach((b) => {
        b.classList.toggle("is-on", on);
        b.innerHTML = `<i class="fa-${on ? "solid" : "regular"} fa-heart"></i>`;
        b.setAttribute("aria-label", on ? "Remove from Liked songs" : "Add to Liked songs");
        b.setAttribute("aria-pressed", String(on));
        b.disabled = !P.currentId;
    });
    $$(".row[data-id]", contentEl).forEach((r) => {
        const btn = $('[data-act="like"]', r);
        if (!btn) return;
        const liked = state.liked.has(r.dataset.id);
        btn.classList.toggle("is-on", liked);
        btn.innerHTML = `<i class="fa-${liked ? "solid" : "regular"} fa-heart"></i>`;
        btn.setAttribute("aria-pressed", String(liked));
    });
}

function syncModes() {
    $$('[data-cmd="shuffle"]').forEach((b) => {
        b.classList.toggle("is-on", P.shuffle);
        b.setAttribute("aria-pressed", String(P.shuffle));
        b.title = P.shuffle ? "Shuffle on (S)" : "Shuffle off (S)";
    });
    $$('[data-cmd="repeat"]').forEach((b) => {
        b.classList.toggle("is-on", P.repeat !== "off");
        b.innerHTML = P.repeat === "one" ? `<i class="fa-solid fa-repeat"></i><small style="position:absolute;top:4px;right:5px;font-size:8px;font-weight:800">1</small>` : `<i class="fa-solid fa-repeat"></i>`;
        b.title = { off: "Repeat off (R)", all: "Repeat all (R)", one: "Repeat one (R)" }[P.repeat];
    });
    const speedBtn = $("#speedBtn");
    speedBtn.textContent = `${settings.speed}×`;
    speedBtn.classList.toggle("is-on", settings.speed !== 1);
}

function syncVolume() {
    const v = settings.muted ? 0 : settings.volume;
    $$('[data-bind="volume"]').forEach((r) => {
        r.value = Math.round(v * 100);
        r.style.setProperty("--p", `${v * 100}%`);
    });
    const icon = v === 0 ? "fa-volume-xmark" : v < 0.5 ? "fa-volume-low" : "fa-volume-high";
    $$('[data-cmd="mute"]').forEach((b) => {
        b.innerHTML = `<i class="fa-solid ${icon}"></i>`;
        b.setAttribute("aria-label", v === 0 ? "Unmute" : "Mute");
    });
}

/* Seek & volume sliders (player bar + now-playing share the same bindings) */
$$('[data-bind="seek"]').forEach((r) => {
    r.addEventListener("input", () => {
        P.seeking = true;
        r.style.setProperty("--p", `${r.value / 10}%`);
        if (Number.isFinite(audio.duration)) $$('[data-np="current"]').forEach((el) => (el.textContent = fmtTime((r.value / 1000) * audio.duration)));
    });
    r.addEventListener("change", () => {
        if (Number.isFinite(audio.duration)) audio.currentTime = (r.value / 1000) * audio.duration;
        P.seeking = false;
        syncProgress();
    });
});
$$('[data-bind="volume"]').forEach((r) => r.addEventListener("input", () => setVolume(r.value / 100)));
$$(".volume, .np-volume").forEach((box) =>
    box.addEventListener(
        "wheel",
        (e) => {
            e.preventDefault();
            setVolume((settings.muted ? 0 : settings.volume) + (e.deltaY < 0 ? 0.05 : -0.05));
        },
        { passive: false }
    )
);

/* Player commands (any element with data-cmd) */
document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cmd]");
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    if (cmd === "toggle") togglePlay();
    else if (cmd === "next") next();
    else if (cmd === "prev") prev();
    else if (cmd === "shuffle") setShuffle(!P.shuffle);
    else if (cmd === "repeat") cycleRepeat();
    else if (cmd === "like") P.currentId && toggleLike(P.currentId);
    else if (cmd === "mute") toggleMute();
    else if (cmd === "queue") toggleQueue();
});

/* ==========================================================================
   10. QUEUE DRAWER & NOW PLAYING
   ========================================================================== */
const queueDrawer = $("#queueDrawer");

function toggleQueue(force) {
    const open = force ?? queueDrawer.hidden;
    queueDrawer.hidden = !open;
    $$('[data-cmd="queue"]').forEach((b) => b.classList.toggle("is-on", open));
    if (open) {
        renderQueue();
        $("#queueClose").focus();
    }
}

function queueItemHTML(id, { type, index, current } = {}) {
    const s = state.songs.get(id);
    if (!s) return "";
    return `<div class="q-item ${current ? "is-current" : ""}" role="button" tabindex="0" data-q-type="${type}" data-q-index="${index}">
        <img class="thumb" src="${esc(coverOf(s))}" alt="" loading="lazy" decoding="async">
        <div class="q-item-text"><strong>${esc(s.title)}</strong><span>${esc(s.artist)}</span></div>
        ${type === "up" ? `<button class="icon-btn sm" data-q-remove="${index}" aria-label="Remove from queue" title="Remove"><i class="fa-solid fa-xmark"></i></button>` : ""}
    </div>`;
}

function renderQueue() {
    if (queueDrawer.hidden) return;
    const body = $("#queueBody");
    if (!P.currentId) {
        body.innerHTML = `<div class="empty"><i class="fa-solid fa-list"></i><h3>Your queue is empty</h3><p>Play something, or use “Add to queue” on any song.</p></div>`;
        return;
    }
    const later = P.order.slice(P.pos + 1, P.pos + 51);
    body.innerHTML = `
        <div class="q-label">Now playing</div>
        ${queueItemHTML(P.currentId, { type: "now", current: true })}
        ${P.upNext.length ? `<div class="q-label"><span>Next in queue</span><button class="text-link" data-q-clear>Clear</button></div>${P.upNext.map((id, i) => queueItemHTML(id, { type: "up", index: i })).join("")}` : ""}
        <div class="q-label"><span>Next from: ${esc(P.contextLabel || "—")}</span></div>
        ${later.length ? later.map((id, i) => queueItemHTML(id, { type: "ctx", index: P.pos + 1 + i })).join("") : `<p class="q-empty">${P.repeat === "all" ? "The list will start over." : "Nothing else in this list."}</p>`}`;
}

$("#queueBody").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-q-remove]");
    if (rm) {
        P.upNext.splice(Number(rm.dataset.qRemove), 1);
        return renderQueue();
    }
    if (e.target.closest("[data-q-clear]")) {
        P.upNext = [];
        toast("Queue cleared");
        return renderQueue();
    }
    const item = e.target.closest(".q-item");
    if (!item) return;
    const type = item.dataset.qType;
    const i = Number(item.dataset.qIndex);
    if (type === "now") return togglePlay();
    if (type === "up") loadSong(P.upNext.splice(i, 1)[0], true);
    if (type === "ctx") {
        P.pos = i;
        loadSong(P.order[i], true);
    }
});
$("#queueBody").addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("q-item")) {
        e.preventDefault();
        e.target.click();
    }
});
$("#queueClose").addEventListener("click", () => toggleQueue(false));

/* Now playing (full screen) */
const npView = $("#nowPlaying");
function openNowPlaying() {
    if (!P.currentId) return;
    npView.hidden = false;
    document.body.classList.add("np-open");
    $("#npClose").focus();
}
function closeNowPlaying() {
    npView.hidden = true;
    document.body.classList.remove("np-open");
}
$$("[data-open-np]").forEach((el) => el.addEventListener("click", openNowPlaying));
$("#npClose").addEventListener("click", closeNowPlaying);

/* ==========================================================================
   11. SPEED & SLEEP TIMER
   ========================================================================== */
$("#speedBtn").addEventListener("click", (e) => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    openMenu(
        [
            { title: "Playback speed" },
            ...speeds.map((s) => ({
                label: s === 1 ? "1× (normal)" : `${s}×`,
                checked: settings.speed === s,
                onSelect: () => {
                    settings.speed = s;
                    audio.defaultPlaybackRate = s;
                    audio.playbackRate = s;
                    saveSettings();
                    syncModes();
                }
            }))
        ],
        e.currentTarget
    );
});

const sleep = { end: 0, endOfSong: false, timer: null };

function setSleep(minutes) {
    clearSleep(true);
    if (minutes === "song") {
        sleep.endOfSong = true;
        $("#sleepBadge").hidden = false;
        $("#sleepBadge").textContent = "♪";
        toast("Music will stop after this song");
    } else {
        sleep.end = Date.now() + minutes * 60000;
        sleep.timer = setInterval(tickSleep, 1000);
        tickSleep();
        toast(`Sleep timer set for ${minutes} minutes`);
    }
    $("#sleepBtn").classList.add("is-on");
}

function tickSleep() {
    const left = (sleep.end - Date.now()) / 1000;
    const badge = $("#sleepBadge");
    badge.hidden = false;
    badge.textContent = left > 60 ? `${Math.ceil(left / 60)}m` : `${Math.max(0, Math.ceil(left))}s`;
    if (left <= 10 && left > 0 && !settings.muted) audio.volume = settings.volume * (left / 10); // gentle fade-out
    if (left <= 0) {
        audio.pause();
        clearSleep();
        toast("Sleep timer ended");
    }
}

function clearSleep(silent) {
    clearInterval(sleep.timer);
    sleep.timer = null;
    sleep.end = 0;
    sleep.endOfSong = false;
    $("#sleepBadge").hidden = true;
    $("#sleepBtn").classList.remove("is-on");
    applyVolume();
    if (silent === false) toast("Sleep timer off");
}

$("#sleepBtn").addEventListener("click", (e) => {
    const active = sleep.timer || sleep.endOfSong;
    const left = sleep.timer ? Math.ceil((sleep.end - Date.now()) / 60000) : 0;
    openMenu(
        [
            { title: active ? (sleep.endOfSong ? "Stops after this song" : `Stops in ${plural(left, "minute")}`) : "Stop playing in…" },
            ...[15, 30, 45, 60].map((m) => ({ icon: "fa-clock", label: `${m} minutes`, onSelect: () => setSleep(m) })),
            { icon: "fa-forward-step", label: "End of this song", onSelect: () => setSleep("song") },
            ...(active ? ["sep", { icon: "fa-xmark", label: "Turn off timer", onSelect: () => clearSleep(false) }] : [])
        ],
        e.currentTarget
    );
});

/* ==========================================================================
   12. SONG, PLAYLIST & ACCOUNT DIALOGS
   ========================================================================== */

/* ---- Upload / edit song --------------------------------------------------- */
const songDlg = $("#songDialog");
const AUDIO_RE = /\.(mp3|wav|ogg|m4a|flac|aac|webm)$/i;
const MAX_BYTES = 50 * 1024 * 1024;
const songForm = { mode: "upload", editId: null, audio: null, cover: null, duration: "" };

function setPreview(img, file, fallback) {
    if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
    if (file) {
        img.dataset.url = URL.createObjectURL(file);
        img.src = img.dataset.url;
    } else {
        delete img.dataset.url;
        img.src = fallback || DEFAULT_COVER;
    }
}

function openSongDialog({ file = null, editId = null } = {}) {
    if (!requireLogin("Log in to upload songs")) return;
    const editing = !!editId;
    const song = editing ? state.songs.get(editId) : null;
    Object.assign(songForm, { mode: editing ? "edit" : "upload", editId, audio: null, cover: null, duration: "" });

    $("#songDialogTitle").textContent = editing ? "Edit song details" : "Upload a song";
    $("#songSubmit").textContent = editing ? "Save" : "Upload";
    $("#songSubmit").disabled = false;
    $("#audioDrop").hidden = editing;
    $("#audioDrop").classList.remove("has-file", "is-over");
    $("#audioName").textContent = "Choose an audio file";
    $("#audioHint").textContent = "or drag it here · MP3, WAV, FLAC, M4A, OGG · max 50 MB";
    $("#songTitle").value = song?.title || "";
    $("#songArtist").value = editing ? song.artist : state.user.name;
    $("#songAlbum").value = song?.album || "";
    $("#visibilityField").hidden = editing || !state.user.isAdmin;
    $('#songDialog input[name="visibility"][value="private"]').checked = true;
    $("#uploadProgress").hidden = true;
    $("#songError").textContent = "";
    setPreview($("#coverPreview"), null, song?.cover);

    openDialog(songDlg);
    if (file) setAudioFile(file);
    (editing ? $("#songTitle") : $("#audioDrop")).focus();
}

function setAudioFile(file) {
    $("#songError").textContent = "";
    if (!file.type.startsWith("audio/") && !AUDIO_RE.test(file.name)) {
        $("#songError").textContent = "That isn't an audio file. Choose an MP3, WAV, FLAC, M4A or OGG.";
        return;
    }
    if (file.size > MAX_BYTES) {
        $("#songError").textContent = "That file is over 50 MB.";
        return;
    }
    songForm.audio = file;
    $("#audioDrop").classList.add("has-file");
    $("#audioName").textContent = file.name;
    $("#audioHint").textContent = `${(file.size / 1048576).toFixed(1)} MB · click to change`;
    if (!$("#songTitle").value.trim()) {
        $("#songTitle").value = file.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
    }
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
        if (Number.isFinite(probe.duration)) songForm.duration = fmtTime(probe.duration);
        URL.revokeObjectURL(url);
    };
    probe.onerror = () => URL.revokeObjectURL(url);
    probe.src = url;
}

const audioDrop = $("#audioDrop");
audioDrop.addEventListener("click", () => $("#audioInput").click());
audioDrop.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), $("#audioInput").click()));
audioDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    audioDrop.classList.add("is-over");
});
audioDrop.addEventListener("dragleave", () => audioDrop.classList.remove("is-over"));
audioDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    audioDrop.classList.remove("is-over");
    const f = e.dataTransfer.files[0];
    if (f) setAudioFile(f);
});
$("#audioInput").addEventListener("change", (e) => {
    if (e.target.files[0]) setAudioFile(e.target.files[0]);
    e.target.value = "";
});
$("#coverPick").addEventListener("click", () => $("#coverInput").click());
$("#coverInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/") || f.type === "image/svg+xml") return ($("#songError").textContent = "Choose a JPG, PNG, WEBP or GIF image.");
    if (f.size > MAX_BYTES) return ($("#songError").textContent = "That image is over 50 MB.");
    resizeImage(f, 800).then((img) => {
        songForm.cover = img;
        setPreview($("#coverPreview"), img);
    });
});

$("#songForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#songError");
    err.textContent = "";
    const title = $("#songTitle").value.trim();
    if (songForm.mode === "upload" && !songForm.audio) return (err.textContent = "Choose an audio file first.");
    if (!title) {
        $("#songTitle").focus();
        return (err.textContent = "Give the song a title.");
    }

    const fd = new FormData();
    fd.append("title", title);
    fd.append("artist", $("#songArtist").value.trim());
    fd.append("album", $("#songAlbum").value.trim());
    if (songForm.cover) fd.append("cover", songForm.cover);

    const submit = $("#songSubmit");
    const bar = $("#uploadProgress");
    submit.disabled = true;

    try {
        if (songForm.mode === "edit") {
            submit.textContent = "Saving…";
            const raw = await apiUpload("PATCH", `/songs/${songForm.editId}`, fd);
            const updated = mapSong(raw);
            const old = state.songs.get(updated.id);
            state.songs.set(updated.id, { ...old, ...updated, duration: old?.duration || updated.duration });
            closeDialog(songDlg);
            toast("Song updated");
            if (P.currentId === updated.id) syncNowPlaying();
        } else {
            const isPublic = state.user.isAdmin && $('#songDialog input[name="visibility"]:checked').value === "public";
            fd.append("isPrivate", String(!isPublic));
            fd.append("duration", songForm.duration || "--:--");
            submit.textContent = "Uploading…";
            bar.hidden = false;
            const fill = bar.firstElementChild;
            fill.style.width = "0%";

            // 1) Try sending the audio straight to storage; 2) fall back to uploading through the server.
            let audioPath = "";
            try {
                audioPath = await uploadAudioDirect(songForm.audio, (p) => (fill.style.width = `${Math.round(p * 95)}%`));
            } catch (directErr) {
                console.warn("Direct upload unavailable, using server upload:", directErr.message);
                fill.style.width = "0%";
            }
            if (audioPath) fd.append("audioPath", audioPath);
            else fd.append("audio", songForm.audio);

            const raw = await apiUpload("POST", "/songs", fd, audioPath ? null : (p) => (fill.style.width = `${Math.round(p * 100)}%`));
            fill.style.width = "100%";
            const song = mapSong(raw);
            state.songs.set(song.id, song);
            state.catalog.unshift(song.id);
            closeDialog(songDlg);
            toast(`"${song.title}" uploaded`, { action: { label: "Play", onClick: () => playList([song.id], song.id, "uploads", "My uploads") } });
        }
        renderSidebar();
        renderView({ keepScroll: true });
    } catch (ex) {
        err.textContent = ex.message;
    } finally {
        submit.disabled = false;
        submit.textContent = songForm.mode === "edit" ? "Save" : "Upload";
        bar.hidden = true;
    }
});
songDlg.addEventListener("close", () => setPreview($("#coverPreview"), null));

/* ---- Create / edit playlist ---------------------------------------------- */
const plDlg = $("#playlistDialog");
let plEditing = null;
let plCoverFile = null;

function openPlaylistDialog(pl = null) {
    if (!requireLogin("Log in to create playlists")) return;
    plEditing = pl;
    plCoverFile = null;
    $("#playlistDialogTitle").textContent = pl ? "Edit playlist" : "New playlist";
    $("#plSubmit").textContent = pl ? "Save" : "Create";
    $("#plName").value = pl ? pl.name : `My playlist #${state.playlists.length + 1}`;
    $("#plDesc").value = pl?.description || "";
    $("#plPrivate").checked = pl ? pl.isPrivate : true;
    $("#plError").textContent = "";
    setPreview($("#plCoverPreview"), null, pl ? playlistCover(pl) : DEFAULT_COVER);
    openDialog(plDlg);
    $("#plName").select();
}

$("#plCoverPick").addEventListener("click", () => $("#plCoverInput").click());
$("#plCoverInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/") || f.type === "image/svg+xml") return ($("#plError").textContent = "Choose a JPG, PNG, WEBP or GIF image.");
    resizeImage(f, 800).then((img) => {
        plCoverFile = img;
        setPreview($("#plCoverPreview"), img);
    });
});

$("#playlistForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#plName").value.trim();
    const desc = $("#plDesc").value.trim();
    const isPrivate = $("#plPrivate").checked;
    if (!name) {
        $("#plError").textContent = "Give your playlist a name.";
        return $("#plName").focus();
    }
    const btn = $("#plSubmit");
    btn.disabled = true;
    try {
        let pl = plEditing;
        if (!pl) pl = await createPlaylist(name);
        const needsUpdate = plEditing || desc || !isPrivate || plCoverFile;
        if (needsUpdate) {
            const fd = new FormData();
            fd.append("name", name);
            fd.append("description", desc);
            fd.append("isPrivate", String(isPrivate));
            if (plCoverFile) fd.append("cover", plCoverFile);
            const raw = await apiUpload("PUT", `/playlists/${pl.id}`, fd);
            Object.assign(pl, { name: raw.name, description: raw.description || "", isPrivate: raw.isPrivate !== false, coverUrl: raw.coverUrl || "" });
        }
        closeDialog(plDlg);
        renderSidebar();
        if (plEditing) {
            toast("Playlist updated");
            renderView({ keepScroll: true });
        } else {
            toast("Playlist created");
            navigate(`#/playlist/${pl.id}`);
        }
    } catch (ex) {
        $("#plError").textContent = ex.message;
    } finally {
        btn.disabled = false;
    }
});
plDlg.addEventListener("close", () => setPreview($("#plCoverPreview"), null));

/* ---- Add one song to playlists ------------------------------------------- */
const addToPlDlg = $("#addToPlDialog");
let addToPlSongId = null;

function openAddToPlaylist(songId) {
    if (!requireLogin("Log in to add songs to playlists")) return;
    addToPlSongId = songId;
    const s = state.songs.get(songId);
    $("#addToPlSong").textContent = s ? `${s.title} · ${s.artist}` : "";
    $("#quickPlName").value = "";
    renderAddToPlList();
    openDialog(addToPlDlg);
    (state.playlists.length ? $(".pick-item", addToPlDlg) : $("#quickPlName"))?.focus();
}

function renderAddToPlList() {
    const list = $("#addToPlList");
    if (!state.playlists.length) {
        list.innerHTML = `<li class="pick-empty">You don't have any playlists yet. Create one above.</li>`;
        return;
    }
    list.innerHTML = state.playlists
        .map((pl) => {
            const added = pl.songs.includes(addToPlSongId);
            return `<li><button type="button" class="pick-item ${added ? "is-added" : ""}" data-pl="${pl.id}" aria-pressed="${added}">
                <img class="thumb" src="${esc(playlistCover(pl))}" alt="">
                <span class="pick-item-text"><strong>${esc(pl.name)}</strong><span>${plural(playlistSongs(pl).length, "song")}</span></span>
                <span class="pick-state"><i class="fa-solid ${added ? "fa-check" : "fa-plus"}"></i></span>
            </button></li>`;
        })
        .join("");
}

$("#addToPlList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-pl]");
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    await togglePlaylistSong(btn.dataset.pl, addToPlSongId);
    renderAddToPlList();
    $(`[data-pl="${btn.dataset.pl}"]`, addToPlDlg)?.focus();
});

$("#quickPlForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#quickPlName").value.trim();
    if (!name) return $("#quickPlName").focus();
    try {
        const pl = await createPlaylist(name);
        await togglePlaylistSong(pl.id, addToPlSongId);
        $("#quickPlName").value = "";
        renderAddToPlList();
    } catch (ex) {
        toast(ex.message, { type: "error" });
    }
});

/* ---- Add many songs to the open playlist --------------------------------- */
const addSongsDlg = $("#addSongsDialog");
let addSongsPl = null;

function openAddSongs(pl) {
    addSongsPl = pl;
    $("#addSongsPl").textContent = `to ${pl.name}`;
    $("#addSongsSearch").value = "";
    renderAddSongs();
    openDialog(addSongsDlg);
    $("#addSongsSearch").focus();
}

function renderAddSongs() {
    const q = $("#addSongsSearch").value.trim().toLowerCase();
    const ids = state.catalog.filter((id) => {
        const s = state.songs.get(id);
        return !q || `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q);
    });
    $("#addSongsList").innerHTML = ids.length
        ? ids
              .map((id) => {
                  const s = state.songs.get(id);
                  const added = addSongsPl.songs.includes(id);
                  return `<li><button type="button" class="pick-item ${added ? "is-added" : ""}" data-song-id="${id}" aria-pressed="${added}">
                    <img class="thumb" src="${esc(coverOf(s))}" alt="" loading="lazy" decoding="async">
                    <span class="pick-item-text"><strong>${esc(s.title)}</strong><span>${esc(s.artist)}${s.isPrivate ? " · Private" : ""}</span></span>
                    <span class="pick-state"><i class="fa-solid ${added ? "fa-check" : "fa-plus"}"></i></span>
                </button></li>`;
              })
              .join("")
        : `<li class="pick-empty">No songs match “${esc(q)}”.</li>`;
}

$("#addSongsSearch").addEventListener("input", debounce(renderAddSongs, 120));
$("#addSongsList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-song-id]");
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const added = await togglePlaylistSong(addSongsPl.id, btn.dataset.songId, { silent: true });
    btn.disabled = false;
    if (added === null) return;
    btn.classList.toggle("is-added", added);
    btn.setAttribute("aria-pressed", String(added));
    $(".pick-state i", btn).className = `fa-solid ${added ? "fa-check" : "fa-plus"}`;
});

/* ---- Account: profile menu, avatar, password ----------------------------- */
$("#profileBtn").addEventListener("click", (e) => {
    const u = state.user;
    openMenu(
        [
            { html: `<div class="menu-profile">${avatarHTML(u, "lg")}<div><strong>${esc(u.name)}</strong><span>${esc(u.email)}</span>${u.isAdmin ? `<span>Admin</span>` : ""}</div></div>` },
            "sep",
            { icon: "fa-camera", label: "Change photo", onSelect: () => $("#avatarInput").click() },
            { icon: "fa-key", label: "Change password", onSelect: openPasswordDialog },
            { icon: "fa-keyboard", label: "Keyboard shortcuts", onSelect: () => openDialog($("#shortcutsDialog")) },
            { icon: "fa-file-lines", label: "Terms & Conditions", href: "/Terms", external: true },
            "sep",
            { icon: "fa-right-from-bracket", label: "Sign out", onSelect: signOut }
        ],
        e.currentTarget
    );
});

function signOut() {
    audio.pause();
    clearSession();
    location.href = "/Login";
}

$("#avatarInput").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast("Choose a JPG, PNG or WEBP image", { type: "error" });
    const img = await resizeImage(f, 400);
    if (img.size > 5 * 1024 * 1024) return toast("Please choose an image under 5 MB", { type: "error" });
    const fd = new FormData();
    fd.append("avatar", img);
    toast("Updating photo…");
    try {
        const res = await api(`/users/${state.user.id}/avatar`, { method: "POST", body: fd });
        state.user.avatar = res.avatarUrl;
        sessionSet("sohify_avatar", res.avatarUrl);
        state.playlists.forEach((p) => p.owner && (p.owner.avatar = res.avatarUrl));
        renderAccount();
        renderView({ keepScroll: true });
        toast("Profile photo updated");
    } catch (err) {
        toast(err.message, { type: "error" });
    }
});

const pwDlg = $("#passwordDialog");
function openPasswordDialog() {
    ["#pwCurrent", "#pwNew", "#pwConfirm"].forEach((s) => ($(s).value = ""));
    ["#pwCurrentErr", "#pwNewErr", "#pwConfirmErr"].forEach((s) => ($(s).textContent = ""));
    $("#pwShow").checked = false;
    $$("#passwordDialog input[type=text]").forEach((i) => (i.type = "password"));
    $("#pwUsername").value = state.user.email;
    updateStrength("");
    openDialog(pwDlg);
    $("#pwCurrent").focus();
}

function updateStrength(v) {
    let score = 0;
    if (v.length >= 8) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/\d/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    const level = score <= 1 ? "weak" : score <= 3 ? "medium" : "strong";
    $$("#pwStrength i").forEach((bar, i) => (bar.className = v && i < Math.max(score, 1) ? level : ""));
}

$("#pwNew").addEventListener("input", (e) => {
    updateStrength(e.target.value);
    $("#pwNewErr").textContent = "";
});
$("#pwCurrent").addEventListener("input", () => ($("#pwCurrentErr").textContent = ""));
$("#pwConfirm").addEventListener("input", () => ($("#pwConfirmErr").textContent = ""));
$("#pwShow").addEventListener("change", (e) => ["#pwCurrent", "#pwNew", "#pwConfirm"].forEach((s) => ($(s).type = e.target.checked ? "text" : "password")));
$("#pwForgot").addEventListener("click", (e) => {
    e.preventDefault();
    location.href = `/Login?forgot=1&email=${encodeURIComponent(state.user.email)}`;
});

$("#passwordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const cur = $("#pwCurrent").value;
    const nw = $("#pwNew").value;
    const conf = $("#pwConfirm").value;
    if (!cur) return ($("#pwCurrentErr").textContent = "Enter your current password."), $("#pwCurrent").focus();
    if (nw.length < 8) return ($("#pwNewErr").textContent = "Use at least 8 characters."), $("#pwNew").focus();
    if (nw === cur) return ($("#pwNewErr").textContent = "Choose a different password from your current one."), $("#pwNew").focus();
    if (nw !== conf) return ($("#pwConfirmErr").textContent = "Passwords don't match."), $("#pwConfirm").focus();

    const btn = $("#pwSubmit");
    btn.disabled = true;
    btn.textContent = "Updating…";
    try {
        const res = await api(`/users/${state.user.id}/change-password`, {
            method: "POST",
            json: { oldPassword: cur, newPassword: nw, confirmPassword: conf }
        });
        if (res.token) sessionSet("sohify_token", res.token);
        closeDialog(pwDlg);
        toast("Password updated. Other devices were signed out.");
    } catch (err) {
        const target = { oldPassword: "#pwCurrentErr", newPassword: "#pwNewErr", confirmPassword: "#pwConfirmErr" }[err.field];
        if (target) $(target).textContent = err.message;
        else toast(err.message, { type: "error" });
    } finally {
        btn.disabled = false;
        btn.textContent = "Update password";
    }
});

/* ==========================================================================
   13. EVENTS, KEYBOARD & START-UP
   ========================================================================== */

/* Content clicks (rows, cards, view actions) */
contentEl.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    if (act) {
        const action = act.dataset.act;
        const row = act.closest(".row");
        const pl = currentView?.playlist;
        if (action === "like" && row) return toggleLike(row.dataset.id);
        if (action === "track-menu" && row) return openTrackMenu(row.dataset.id, act, { playlistId: pl?.id });
        if (action === "play-all") {
            if (P.contextKey === currentView.key && P.currentId) return togglePlay();
            return playList(currentView.ids, null, currentView.key, currentView.label);
        }
        if (action === "shuffle-all") {
            setShuffle(true);
            return playList(currentView.ids, null, currentView.key, currentView.label);
        }
        if (action === "add-songs" && pl) return openAddSongs(pl);
        if (action === "playlist-menu" && pl) return openPlaylistMenu(pl, act);
        if (action === "upload") return openSongDialog();
        return;
    }
    const row = e.target.closest(".row[data-id]");
    if (row) return playFromView(row.dataset.id);
    const card = e.target.closest(".card[data-song]");
    if (card) return playFromView(card.dataset.song, card.dataset.list);
});

contentEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target;
    if (el.matches(".row[data-id], .card[data-song]")) {
        e.preventDefault();
        el.click();
    }
});

contentEl.addEventListener("contextmenu", (e) => {
    const row = e.target.closest(".row[data-id]");
    if (!row) return;
    e.preventDefault();
    row.classList.add("is-menu");
    openTrackMenu(row.dataset.id, { x: e.clientX, y: e.clientY }, { playlistId: currentView?.playlist?.id });
    menuState.onClose = () => row.classList.remove("is-menu");
});

/* Sidebar & top bar */
const sidebar = $("#sidebar");
const scrim = $("#scrim");
function openSidebar() {
    sidebar.classList.add("is-open");
    scrim.hidden = false;
}
function closeSidebar() {
    sidebar.classList.remove("is-open");
    scrim.hidden = true;
}
$("#menuBtn").addEventListener("click", openSidebar);
$("#sidebarClose").addEventListener("click", closeSidebar);
scrim.addEventListener("click", closeSidebar);
sidebar.addEventListener("click", (e) => {
    if (e.target.closest('[data-act="new-playlist"]')) openPlaylistDialog();
});
$("#newPlaylistBtn").addEventListener("click", () => openPlaylistDialog());
$("#uploadBtn").addEventListener("click", () => openSongDialog());

/* Drag & drop an audio file anywhere to upload */
let dragDepth = 0;
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e) || songDlg.open) return;
    dragDepth++;
    $("#dropOverlay").hidden = false;
});
window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e) || songDlg.open) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $("#dropOverlay").hidden = true;
});
window.addEventListener("dragover", (e) => hasFiles(e) && e.preventDefault());
window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $("#dropOverlay").hidden = true;
    if (songDlg.open) return;
    const f = e.dataTransfer.files[0];
    if (f) openSongDialog({ file: f });
});

/* Fallback image when a cover URL is broken */
document.addEventListener(
    "error",
    (e) => {
        const img = e.target;
        if (img.tagName === "IMG" && img.src !== DEFAULT_COVER && !img.dataset.fallback) {
            img.dataset.fallback = "1";
            img.src = DEFAULT_COVER;
        }
    },
    true
);

/* Keyboard shortcuts */
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (menuState) return closeMenu();
        if ($("dialog[open]")) return;
        if (!npView.hidden) return closeNowPlaying();
        if (!queueDrawer.hidden) return toggleQueue(false);
        if (sidebar.classList.contains("is-open")) return closeSidebar();
        return;
    }
    const t = e.target;
    if (e.ctrlKey || e.metaKey || e.altKey || $("dialog[open]") || menuState) return;
    if (t.closest("input, textarea, select, [contenteditable]")) return;

    const key = e.key;
    const handled = () => e.preventDefault();
    if (key === " ") {
        if (t.matches(".row, .card, .q-item")) return; // Space/Enter on a focused song plays it
        handled();
        togglePlay();
    } else if (key === "ArrowRight" || key === "ArrowLeft") {
        if (t.matches(".range")) return;
        handled();
        if (e.shiftKey) key === "ArrowRight" ? next() : prev();
        else if (P.currentId) audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + (key === "ArrowRight" ? 5 : -5)));
    } else if (key === "ArrowUp" || key === "ArrowDown") {
        if (t.matches(".range") || t.closest(".content, .drawer-body, .side-pl-list")) return; // keep normal scrolling
        handled();
        setVolume((settings.muted ? 0 : settings.volume) + (key === "ArrowUp" ? 0.05 : -0.05));
    } else if (key === "m" || key === "M") toggleMute();
    else if (key === "s" || key === "S") setShuffle(!P.shuffle);
    else if (key === "r" || key === "R") cycleRepeat();
    else if (key === "l" || key === "L") P.currentId && toggleLike(P.currentId);
    else if (key === "q" || key === "Q") toggleQueue();
    else if (key === "/") {
        handled();
        searchInput.focus();
    } else if (key === "?") openDialog($("#shortcutsDialog"));
});

// Opening the connection to the storage host early makes the first song start faster.
function preconnectMedia() {
    const first = state.songs.values().next().value;
    if (!first?.src) return;
    try {
        const origin = new URL(first.src, location.href).origin;
        if (origin === location.origin || $(`link[rel="preconnect"][href="${origin}"]`)) return;
        const link = document.createElement("link");
        link.rel = "preconnect";
        link.href = origin;
        link.crossOrigin = "anonymous";
        document.head.appendChild(link);
    } catch {}
}

// Offline app shell + "Install app" support (only on https or localhost).
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

/* Start-up */
async function init() {
    const token = sessionGet("sohify_token");
    if (token && sessionGet("sohify_user_id")) {
        state.user = {
            id: sessionGet("sohify_user_id"),
            name: sessionGet("sohify_username") || "Listener",
            email: sessionGet("sohify_user") || "",
            isAdmin: sessionGet("sohify_is_admin") === "true",
            avatar: sessionGet("sohify_avatar") || ""
        };
    } else if (token) {
        clearSession();
    }
    renderAccount();
    applyVolume();
    syncModes();
    syncNowPlaying();
    syncPlayState();

    // Shared link: /Dashboard?playlist=<id>  →  #/playlist/<id>
    const shared = new URLSearchParams(location.search).get("playlist");
    if (shared) history.replaceState(null, "", `/Dashboard#/playlist/${encodeURIComponent(shared)}`);

    state.route = parseHash();
    renderSidebar();
    renderView();

    try {
        await loadData();
    } catch (err) {
        state.loaded = true;
        contentEl.innerHTML = emptyHTML("fa-triangle-exclamation", "Couldn't load your music", err.message, `<button class="btn btn-secondary" onclick="location.reload()">Try again</button>`);
        return;
    }
    onRoute();
    preconnectMedia();

    // Restore the last song (paused) so the player isn't empty.
    if (settings.lastId && state.songs.has(settings.lastId)) {
        P.base = state.catalog.slice();
        P.contextKey = "songs";
        P.contextLabel = "All songs";
        buildOrder(settings.lastId);
        loadSong(settings.lastId, false);
    }
}

init();
