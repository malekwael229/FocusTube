<img width="1400" height="560" alt="FocusTube Banner" src="https://github.com/user-attachments/assets/1e95b1ee-c4a4-4d4f-a898-f00dcef223c4" />

# FocusTube: YouTube Shorts Blocker 🛡️

A Manifest V3 browser extension that forces YouTube to be a productivity tool, not a slot machine. 

It aggressively blocks Shorts, hides algorithmic feeds, and prevents doomscrolling. Unlike basic element blockers, FocusTube handles YouTube's "Single Page App" navigation events to ensure blocks persist between page views without needing a page refresh.

## New in v1.4 🚀
*   **Pomodoro Timer:** Built-in 25/5 interval timer. When active, it locks the extension into **Strict Mode** and disables the "Passive" option to ensure you stay focused.
*   **Gamified Stats:** A real-time dashboard that tracks how many Shorts you've blocked and calculates the estimated time saved.
*   **Smart Notification Handshake:** Integrated "Toast" notifications and beeps inside YouTube. If YouTube is closed or in the background, it automatically falls back to system-level notifications.
*   **UI Overhaul:** A completely redesigned interface with a modern dark-mode aesthetic, gradient accents, and a custom smooth-scroll system.

## Features

### 🧠 Behavioral Intervention
*   **Strict Mode:** Instantly redirects you to the homepage if you try to open a Short. Uses `window.location.replace` to prevent back-button loops.
*   **Soft Mode:** Displays a full-screen warning overlay that pauses and mutes the video, requiring a conscious decision to "Watch Anyway."
*   **Passive Mode:** Disables active blocking while keeping visual cleaning active (unless toggled off).

### 🧹 Visual Cleaning
*   Hides the **"Shorts" shelf** from the Homepage.
*   Hides **Shorts** from Sidebar recommendations.
*   Hides **Shorts** filter chips and navigation buttons across the site.

## Installation

### Official Stores
*   **Microsoft Edge:** *[Download from Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/focustube/emffahlehkfdlknpmpndaabhigchhoog)* STILL ON V1.0 DIDNT UPDATE YET
*   **Firefox Add-ons:** *[Pending Review]*

### 🛠️ Manual Installation (Developer Mode)

Because Chrome/Edge and Firefox handle Manifest V3 differently, you must pick the correct manifest file for your browser before loading the extension.

1.  **Clone or Download** this repository to your computer.
2.  **Select your browser's manifest:**
    *   **For Chrome or Edge:** Rename `chrome-manifest.json` to `manifest.json`.
    *   **For Firefox:** Rename `firefox-manifest.json` to `manifest.json`.
    
    *(Note: The extension will not load unless the file is named exactly `manifest.json`)*

3.  **Load the extension:**
    *   **Chrome/Edge:** Go to `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**. Select the FocusTube folder.
    *   **Firefox:** Go to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on...**, and select the `manifest.json` you just renamed.

## Configuration

Click the extension icon in your toolbar to access the control panel:
*   **Master Toggle:** Turn the visual hiding features on/off independently of the blocking logic.
*   **Action Modes:** Switch between "Strict" (Kick out), "Soft" (Warn), and "Passive" (Allow).
*   **Timer Phase:** During "Break Time," the extension automatically switches to Passive mode to allow entertainment, then locks back into Strict mode when the work session begins.

## Technical Details

*   **Architecture:** Built on **Manifest V3**. Uses a Background Service Worker (Chrome/Edge) or Background Script (Firefox) to maintain timer state across all tabs.
*   **Performance:** Uses `MutationObserver` optimized with layout-shift prevention to ensure zero lag while scrolling.
*   **Privacy:** **100% Local.** FocusTube does not use external servers, tracking, or analytics. All data stays in your browser's `chrome.storage.local`.

## Known Issues

*   **CSS Obfuscation:** YouTube frequently changes their CSS class names. If the "Shorts" shelf reappears on the homepage, please open an issue with a screenshot so the selectors can be updated.

## License

[MIT](LICENSE)
