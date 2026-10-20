<div align="center">

# 🎵 SoundPulse · Sohify

**A full-stack music streaming web app — auth, playlists, likes, custom uploads, and a slick audio player.**

Built with Node.js · Express · MongoDB · Vanilla JS · IndexedDB

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

[Features](#-features) • [Screenshots](#-screenshots) • [Tech Stack](#-tech-stack) • [Setup](#-getting-started) • [API](#-api-reference) • [Structure](#-project-structure) • [License](#-license)

</div>

---

## 📖 About

**SoundPulse (Sohify)** is a modern, full-stack music player that combines the seamless experience of a native music app with the power of the web. Users can sign up, log in, upload their own music with custom artwork, build playlists, like tracks, and enjoy a polished audio player with shuffle, repeat, seek, and queue controls.

All **user data** (accounts, likes, playlists, avatar, recent history) is stored securely in **MongoDB**, while **uploaded audio blobs** live client-side in **IndexedDB** — giving fast playback without server storage costs.

---

## ✨ Features

### 🔐 Authentication & Security
- Email + password signup / login with **bcrypt** password hashing
- **JWT-based sessions** (7-day expiry)
- Per-user data isolation — every user sees only their own library
- Protected routes via `Authorization: Bearer <token>` middleware
- `isAdmin` flag ready for admin-only actions

### 🎧 Audio Player
- Full-featured bottom player + mobile bottom-sheet
- **Click / drag / wheel** seek and volume sliders
- Play / Pause / Next / Previous
- **Shuffle** and **Repeat (Off → All → One)** modes
- **Animated equalizer** visualizer during playback
- Enlarged album cover modal with embedded playback controls

### 📂 Local Song Import
- Upload `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac` via **file picker** or **drag & drop**
- Attach **custom cover art** per track
- Audio blob stored in **IndexedDB** → survives page refresh
- Automatic duration detection + metadata synced to MongoDB

### 📑 Playlists
- Create, rename, and delete playlists
- Add / remove any track (default, server, or local) with one click
- Playlist **sequential playback** — starts at track 1 and auto-advances
- Song counts displayed live in the sidebar

### ❤️ Likes & Recents
- One-tap heart toggle on any track, player, or mobile sheet
- **Liked Songs** view filtered from your saved favorites
- **Recent History** (last 20 tracks, persisted server-side)

### 👤 Profile
- Custom avatar upload (stored in MongoDB as data URL)
- Display name shown in the header

### 🎛️ Player Extras
- **Play Queue** drawer — add tracks, reorder, play next
- **Search** across title, artist, album
- **Recommended cards** grid
- **Keyboard shortcuts** for power users
- Fully **responsive** (desktop sidebar ↔ mobile drawer)

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :-- | :-- |
| `Space` | Play / Pause |
| `→` | Skip forward 5s |
| `←` | Rewind 5s |
| `↑` | Volume +5% |
| `↓` | Volume −5% |
| `M` | Mute / Unmute |
| `S` | Toggle Shuffle |
| `R` | Cycle Repeat (Off → All → One) |
| `Esc` | Close modals / minimize artwork |

---

## 🧱 Tech Stack

### Backend
- **Node.js** + **Express** — HTTP server & routing
- **MongoDB** + **Mongoose** — data persistence
- **bcryptjs** — password hashing
- **jsonwebtoken** — auth tokens
- **dotenv** — environment config
- **cors** — cross-origin support

### Frontend
- **Vanilla HTML5 / CSS3 / ES6+ JavaScript** — no framework overhead
- **IndexedDB** — local audio blob storage
- **Web Audio API** — playback control
- **FontAwesome 6** — icons
- **Google Fonts** (Inter, Space Grotesk) — typography

---

## 🚀 Getting Started

### Prerequisites

- Node.js **18+**
- MongoDB (local or [Atlas](https://www.mongodb.com/atlas) cluster)
- A modern browser (Chrome, Firefox, Edge, Safari)

### 1. Clone the repository

```bash
git clone https://github.com/fazlerabbicodes/cse-347-ISAD-.git
cd cse-347-ISAD-