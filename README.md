
<img width="1400" height="560" alt="focustube-promotional-tile" src="https://github.com/user-attachments/assets/dda606fb-a366-4107-b573-bf0d8ac6da34" />

  # FocusTube: Distraction Blocker
  
  **Stop Doomscrolling. Reclaim Your Focus.**
  
  **Blocks YouTube Shorts, Instagram Reels, TikTok, and Facebook Reels.**

  [Installation](#installation) • [Features](#features) • [Configuration](#configuration) • [Technical Details](#technical-details)
  
  ![License](https://img.shields.io/badge/license-MIT-blue.svg)
  ![Version](https://img.shields.io/badge/version-1.7-green.svg)
  ![Firefox](https://img.shields.io/badge/firefox-compatible-orange.svg)
  
</div>

---

**FocusTube** is a premium Manifest V3 browser extension designed to stop doomscrolling in its tracks. Unlike basic element blockers, it uses **Session-Aware Logic** to handle modern Single Page Applications (SPAs), ensuring that distractions remain blocked even as you navigate, without breaking the rest of the site.

## New in v1.7

*   **Lockdown Mode:** When the Pomodoro Timer is active, FocusTube **locks** itself. You cannot disable the extension or switch to "Passive Mode" until the timer ends.
*   **Facebook Support:** Full support for blocking **Facebook Reels** and hiding the "Reels" shelf from your feed.
*   **Premium UI:** A complete visual overhaul featuring **Glassmorphism**, smooth animations, and a polished dark mode.
*   **Smart Stats:** Rewritten stats engine that accurately counts **1 Block = 1 Distraction**, eliminating duplication bugs.
*   **Firefox Ready:** Fully optimized code that adheres to Firefox's strict API standards.

---

## Features

### Behavioral Intervention
*   **Strict Mode:**
    *   **YouTube, Instagram, Facebook:** Instantly redirects you to safe pages (Feed/Messages) if you create a "Shorts" session.
    *   **TikTok:** Blocks the entire feed with a full-screen focus overlay.
*   **Soft Mode:** Presents a "Warning" overlay. You must consciously click "Watch Anyway" to proceed (5-minute timeout).
*   **Passive Mode:** No active blocking, but visual clutter (like the Shorts shelf or Reels tab) remains hidden to prevent rabbit holes.

### Visual Cleaning
*   **YouTube:** Removes Shorts shelf, Sidebar recommendations, and chip filters.
*   **Instagram:** Hides "Reels" and "Explore" tabs from the navigation bar.
*   **Facebook:** Hides the "Reels & Short Videos" shelf from the main feed.

### Productivity Tools
*   **Pomodoro Timer:** Built-in 25/5 interval timer.
*   **Lockdown Security:** Prevents self-sabotage during work intervals.
*   **Dashboard:** Tracks "Shorts Blocked" and "Time Saved" in real-time.

---

## Installation

### Official Stores
* **Microsoft Edge:** [Download from Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/focustube/emffahlehkfdlknpmpndaabhigchhoog)
* **Firefox Add-ons:** [Download from Firefox Add-ons](https://addons.mozilla.org/addon/focus-tube/)
* **Chrome Web Store:** *Soon*

### Manual Installation (Developer Mode)

1.  **Clone or Download** this repository.
2.  **Rename Manifest:**
    *   **Chrome/Edge/Brave:** Rename `chrome-manifest.json` to `manifest.json`.
    *   **Firefox:** Rename `firefox-manifest.json` to `manifest.json`.
3.  **Load Extension:**
    *   **Chrome/Edge:** Go to `chrome://extensions` → Enable **Developer Mode** (top right) → Click **Load unpacked** → Select the folder.
    *   **Firefox:** Go to `about:debugging#/runtime/this-firefox` → Click **Load Temporary Add-on...** → Select the `manifest.json` file.

---

## Configuration

Click the extension icon to access the **Control Center**:
*   **Master Toggle:** Global On/Off (Locked during active Timer).
*   **Platform Cards:** Click to expand and configure modes (Strict/Soft/Passive) for each site.
*   **Pomodoro Timer:** Start a focus session.

---

## Technical Details

*   **Architecture:** **Manifest V3** with Background Service Workers.
*   **Performance:** Uses `MutationObserver` and `requestAnimationFrame` for zero-lag DOM manipulation.
*   **Compatibility:** Cross-browser support for Chromium (Chrome, Edge, Brave) and Gecko (Firefox).
*   **Privacy:** **100% Local.** No analytics, no tracking, no external servers.

---

## License

[MIT](LICENSE)
