# 🎵 SoundPulse · Web Audio Player

<div align="center">

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![IndexedDB](https://img.shields.io/badge/IndexedDB-Storage-purple?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**A sleek, responsive, client-side web music player built with vanilla HTML5, modern CSS, and JavaScript. Import local songs with custom artwork, manage playlists, scrub audio smoothly, and enjoy an animated visualizer—all persistent in your browser.**

[Features](#-key-features) • [Installation](#-getting-started) • [Shortcuts](#-keyboard-shortcuts) • [Architecture](#-project-structure) • [License](#-license)

</div>

---

## 📸 Preview

```text
+-------------------------------------------------------+
|  SoundPulse       [ Search music... ]     (Profile)   |
+-------------------+-----------------------------------+
| Menu              |  FEATURED RELEASE                 |
|  • Home           |  Midnight Neon Memories           |
| Library           |  [ ▶ Listen ]  [ + Queue ]        |
|  • Liked Songs    |                                   |
|  • Local Files    |  RECENT TRACKS                    |
| Playlists (+)     |  1. Starboy - The Weeknd     [❤]  |
|  • Chill Lofi     |  2. Midnight City - M83      [❤]  |
+-------------------+-----------------------------------+
| 🎵 Starboy ılı·   [ 🔀  ⏮  ⏸  ⏭  🔁 ]   0:28 ━━⚪── 3:50 |
+-------------------------------------------------------+
```

## ✨ Key Features

- **📂 Local Audio & Image Import (`IndexedDB`)**
  - Import your own audio tracks (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`) via file browser or drag-and-drop.
  - Attach custom cover artwork (or take a photo) per track.
  - Persistent storage across page reloads using browser-native **IndexedDB**.

- **📑 Smart Playlist Management**
  - Create and delete custom playlists on the fly.
  - Add any track (cloud or local) to any playlist with one click (`+`).
  - **Sequential Playback**: Selecting a playlist automatically loads and plays every song in order from track 1.

- **🔍 Zoomed Artwork with In-Modal Music Status**
  - Click on the currently playing song title or bottom album thumbnail to blow up the album artwork in full view.
  - Includes an embedded music status bar (play/pause, skip, shuffle, repeat, scrub bar, time labels) and a quick minimize button (`Esc` or minimize icon).

- **❤️ Favorites / Liked Songs**
  - Instant heart toggle on any track, footer player, or mobile sheet.
  - Filter and view only your favorite songs in the dedicated library tab, persisted in `localStorage`.

- **🎛️ Interactive Controls & Visualizer**
  - Animated sound wave equalizer indicator that bounces dynamically during playback.
  - Clickable and draggable seek bar and volume slider with mouse-wheel adjustments.
  - Dedicated **Play Queue** drawer with real-time queueing and reordering.

- **👤 Custom User Profile Photo**
  - Click your profile badge in the header to upload an avatar image, automatically saved in `localStorage`.

- **📱 Fully Responsive Design**
  - Desktop sidebar layout with dedicated controls.
  - Mobile bottom-sheet now-playing drawer and sliding hamburger menu.

---

## ⌨️ Keyboard Shortcuts

| Key           | Action                                        |
| :------------ | :-------------------------------------------- |
| `Space`       | Play / Pause current track                    |
| `Arrow Right` | Skip forward 5 seconds                        |
| `Arrow Left`  | Rewind 5 seconds                              |
| `Arrow Up`    | Increase volume by 5%                         |
| `Arrow Down`  | Decrease volume by 5%                         |
| `M`           | Toggle Mute / Unmute                          |
| `S`           | Toggle Shuffle mode                           |
| `R`           | Cycle Repeat mode (_Off_ → _All_ → _One_)     |
| `Escape`      | Minimize zoomed artwork / Close active modals |

---

## 🚀 Getting Started

### Prerequisites

No build tools, Node.js packages, or servers required. Everything runs natively in any modern web browser.

### Installation

Open the project:

Double-click index.html to open it directly in your browser.

Or run it using a local live server (e.g., VS Code Live Server extension or python -m http.server 8000).

soundpulse-player/
├── index.html # Primary application markup and modal architecture
├── style.css # Responsive styling, design tokens, animations, and themes
├── script.js # Audio engine, IndexedDB handler, and UI event listeners
├── login.html # Authentication screen (optional integration)
├── landing.html # Promotional landing page (optional integration)
└── README.md # Project documentation

🛠️ Built With
HTML5 Semantic Markup & Web Audio API

Modern CSS3 (CSS Variables, Flexbox, CSS Grid, Glassmorphism, Keyframe Animations)

Vanilla JavaScript (ES6+)

IndexedDB API (Blob storage for audio tracks and custom cover images)

LocalStorage API (Playlists, likes, user profile avatar, volume preferences)

FontAwesome 6 (Vector icons)

Google Fonts (Inter & Plus Jakarta Sans)

🤝 Contributing
Contributions, feature suggestions, and bug reports are always welcome!

Fork the Project (https://github.com/fazlerabbicodes/cse-347-ISAD-.git/fork)

Create your Feature Branch (git checkout -b feature/AmazingFeature)

Commit your Changes (git commit -m 'Add some AmazingFeature')

Push to the Branch (git push origin feature/AmazingFeature)

Open a Pull Request

📄 License
Distributed under the MIT License. See LICENSE for more information.
