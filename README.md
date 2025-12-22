<div align="center">
  <img width="1400" height="560" alt="FocusTube Banner" src="https://github.com/user-attachments/assets/1e95b1ee-c4a4-4d4f-a898-f00dcef223c4" />

  # FocusTube: Distraction Blocker
  
  **Reclaim your focus. Block YouTube Shorts, Instagram Reels, and the TikTok Feed.**

  [Installation](#installation) • [Features](#features) • [Configuration](#configuration) • [Technical Details](#technical-details)
  
  ![License](https://img.shields.io/badge/license-MIT-blue.svg)
  ![Version](https://img.shields.io/badge/version-1.6-green.svg)
  
</div>

---

**FocusTube** is a Manifest V3 browser extension designed to stop doomscrolling in its tracks. Unlike basic element blockers, it uses advanced observation logic to handle modern Single Page Applications (SPAs), ensuring that distractions remain blocked even as you navigate.

## New in v1.6

*   **Enhanced Instagram Protection:** Smart visibility logic dynamically hides Reels/Explore buttons based on your Focus Mode.
*   **Instant Kick:** Optimized strict mode redirects within ~50ms, preventing distraction pages from even loading.
*   **Pomodoro Timer:** Built-in 25/5 interval timer. **Locks** the extension into Strict Mode while active.
*   **Gamified Stats:** Real-time dashboard tracking blocked distractions and blocked time saved.
*   **UI Overhaul:** Modern dark-mode interface with gradient accents.

---

## Features

### Behavioral Intervention
*   **Strict Mode:**
    *   **YouTube & Instagram:** Instantly redirects you to safe pages if you attempt to access Shorts/Reels.
    *   **TikTok:** Blocks the feed entirely with a full-screen overlay.
*   **Soft Mode:** Presents a "Warning" overlay. You must consciously click "Watch Anyway" to proceed (5-minute timeout).
*   **Passive Mode:** No active blocking, but visual clutter (like the Shorts shelf) remains hidden.

### Visual Cleaning
*   **YouTube:** Removes Shorts shelf, Sidebar recommendations, and formatting chips.
*   **Instagram:** Hides "Reels" and "Explore" tabs from navigation.

---

## Installation

### Official Stores
*   **Microsoft Edge:** *[Download from Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/focustube/emffahlehkfdlknpmpndaabhigchhoog)* (v1.6 Pending)
*   **Firefox Add-ons:** *[Pending Review]*
*   **Chrome Web Store:** *[Pending Review]*

### Manual Installation (Developer Mode)

1.  **Clone or Download** this repository.
2.  **Rename Manifest:**
    *   **Chrome/Edge:** Rename `chrome-manifest.json` to `manifest.json`.
    *   **Firefox:** Rename `firefox-manifest.json` to `manifest.json`.
3.  **Load Extension:**
    *   **Chrome/Edge:** `chrome://extensions` -> Enable Developer Mode -> **Load unpacked** -> Select folder.
    *   **Firefox:** `about:debugging#/runtime/this-firefox` -> **Load Temporary Add-on...** -> Select `manifest.json`.

---

## Configuration

Click the extension icon to access:
*   **Master Toggle:** Global on/off switch.
*   **Platform Tabs:** Configure YouTube, Instagram, and TikTok independently.
*   **Pomodoro Timer:** Start a focus session (locks settings).

---

## Known Limitations

*   **Logged Out State:** Some platforms (especially Instagram and TikTok) serve content differently when you are not logged in. While blocking usually works, some visual hiding elements may not persist if the layout changes drastically.
*   **CSS Class Changes:** Social media sites frequently update their code. If a blocker stops working, it likely needs a selector update. Please report these issues!

---

## Technical Details

*   **Architecture:** **Manifest V3** with Background Service Workers.
*   **Performance:** Uses `MutationObserver` and `requestAnimationFrame` for zero-lag performance.
*   **Privacy:** **100% Local.** No analytics, no tracking, no external servers.

## License

[MIT](LICENSE)