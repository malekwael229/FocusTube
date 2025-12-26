<div align="center">
  <img width="1400" height="560" alt="FocusTube Banner" src="https://github.com/user-attachments/assets/dda606fb-a366-4107-b573-bf0d8ac6da34" />

  # FocusTube: Distraction Blocker
  
  **Stop Doomscrolling. Reclaim Your Focus.**
  
  **Blocks YouTube Shorts, Instagram Reels, TikTok, and Facebook Reels.**

  [Installation](#installation) • [Features](#features) • [Configuration](#configuration) • [Technical Details](#technical-details)
  
  ![License](https://img.shields.io/badge/license-MIT-blue.svg)
  ![Version](https://img.shields.io/badge/version-1.8-green.svg)
  ![Firefox](https://img.shields.io/badge/firefox-compatible-orange.svg)
  
</div>

---

**FocusTube** is a premium Manifest V3 browser extension designed to stop doomscrolling in its tracks. Unlike basic element blockers, it uses **Session-Aware Logic** to handle modern Single Page Applications (SPAs), ensuring that distractions remain blocked even as you navigate, without breaking the rest of the site.

## New in v1.8

*   **Total Customization:** You are no longer locked into the default settings. Configure Focus durations (15-60m) and Break durations (5-15m) to match your workflow.
*   **Options Dashboard:** A brand new settings page to manage sounds, auto-start preferences, and more.
*   **Declutter Mode:** Don't use TikTok or Facebook? You can now **hide** specific platform cards from the extension popup to keep your interface clean.
*   **Data Portability:** Added **Import/Export** functionality. Back up your settings and stats to a JSON file so you never lose your progress.
*   **Modular Engine:** Completely rewritten internal architecture for faster performance and better stability across all platforms.

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
*   **Customizable Timer:** Built-in Pomodoro timer with adjustable Focus/Break intervals.
*   **Lockdown Security:** Prevents self-sabotage. When the timer is running, the extension **locks itself**—you cannot disable blocking or switch modes until the timer ends.
*   **Dashboard:** Tracks "Shorts Blocked", "Time Saved", and "Sessions Completed" in real-time.

---

## Installation

### Official Stores
*   **Microsoft Edge:** *[Download from Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/focustube/emffahlehkfdlknpmpndaabhigchhoog)* (v1.8 Pending)
*   **Firefox Add-ons:** *[Download from Firefox Add-ons](https://addons.mozilla.org/addon/focus-tube/)* (v1.8)
*   **Chrome Web Store:** *[Pending Review]*

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
*   **Settings (⚙️):** Click the gear icon to access the Options Dashboard for timer customization and data management.

---

## Technical Details

*   **Architecture:** **Manifest V3** with modular content scripts (Split Architecture).
*   **Performance:** Uses `MutationObserver` and `requestAnimationFrame` for zero-lag DOM manipulation.
*   **Compatibility:** Cross-browser support for Chromium (Chrome, Edge, Brave) and Gecko (Firefox).
*   **Privacy:** **100% Local.** No analytics, no tracking, no external servers.

---

## License

[MIT](LICENSE)
