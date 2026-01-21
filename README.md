<div align="center">
  <img width="1400" height="560" alt="focustube-promotional-tile-1400x560" src="https://github.com/user-attachments/assets/7cb5e68f-e575-40da-8084-333c4f26c7e2" />

  # FocusTube: Distraction Blocker
  
  **Stop Doomscrolling. Reclaim Your Focus.**
  
  **Blocks YouTube Shorts, Instagram Reels, TikTok, and Facebook Reels.**

  [Installation](#installation) • [Features](#features) • [Configuration](#configuration) • [Technical Details](#technical-details)
  
  ![License](https://img.shields.io/badge/license-MIT-blue.svg)
  ![Version](https://img.shields.io/badge/version-2.1.0-green.svg)
  ![Firefox](https://img.shields.io/badge/firefox-compatible-orange.svg)
  
</div>

---

**FocusTube** is a Manifest V3 browser extension designed to stop doomscrolling in its tracks. Unlike basic element blockers, it uses **Session-Aware Logic** to handle modern Single Page Applications (SPAs), ensuring that distractions remain blocked even as you navigate, without breaking the rest of the site.

## Features

### Behavioral Intervention
*   **Strict Mode:** Blocks distracting surfaces; redirects or overlays to keep you out.
*   **Warn Mode:** Shows an interstitial; you must click “Watch Anyway” to proceed.
*   **Passive Mode:** No blocking, but hides visual traps (Shorts/Reels tabs) to reduce rabbit holes.

### Visual Cleaning
*   **YouTube:** Hide Shorts button and Shorts shelves.
*   **Instagram:** Hide Reels tab, explore, stories, and feed reels (toggleable).
*   **Facebook:** Hide Reels nav link and stories.

### Productivity Tools
*   **Customizable Timer:** Built-in Focus/Break timer with auto-lock of mode switches while active.
*   **Dashboard:** Tracks “Shorts Blocked” and “Time Saved.”

---

## Installation

### Official Stores
*   **Microsoft Edge:** *[Download from Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/focustube/emffahlehkfdlknpmpndaabhigchhoog)* (v2.1.0)
*   **Firefox Add-ons:** *[Download from Firefox Add-ons](https://addons.mozilla.org/addon/focus-tube/)* (v2.1.0)
*   **Chrome Web Store:** *[Download from Chrome Web Store](https://chromewebstore.google.com/detail/focustube-distraction-blo/ppdjgkniggbikifojmkindmbhppmoell?authuser=1&hl=en)* (v2.1.0)

### Manual Installation (Developer Mode)

1.  **Clone or Download** this repository.
2.  **Pick Manifest:**
    *   **Chrome/Edge/Brave:** Rename `chrome-manifest.json` to `manifest.json`.
    *   **Firefox:** Use the provided `manifest.json`.
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
*   **Performance:** Uses `MutationObserver` and `requestAnimationFrame` for responsive, low-overhead DOM manipulation.
*   **Compatibility:** Cross-browser support for Chromium (Chrome, Edge, Brave) and Gecko (Firefox).
*   **Privacy:** **100% Local.** No analytics, no tracking, no external servers.

---

## Privacy Policy

FocusTube is a privacy-first, open-source project.

*   **No Data Collection:** This extension does not collect, store, transmit, or sell any user data.
*   **Local Storage:** All preferences (timer settings, stats, active modes) are stored locally on your device using the browser's `storage.local` API.
*   **No Analytics:** We do not use Google Analytics or any third-party tracking scripts.
*   **No External Servers:** The extension does not communicate with any external servers.

---

## License

[MIT](LICENSE)
