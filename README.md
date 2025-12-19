<img width="1400" height="560" alt="FocusTube Banner" src="https://github.com/user-attachments/assets/1e95b1ee-c4a4-4d4f-a898-f00dcef223c4" />

# FocusTube: YouTube Shorts Blocker 🛡️

A Manifest V3 browser extension that forces YouTube to be a productivity tool, not a slot machine.

It aggressively blocks Shorts, hides algorithmic feeds, and prevents doomscrolling. Unlike basic element blockers, FocusTube handles YouTube's "Single Page App" navigation events to ensure blocks persist between page views.

## New in v1.4 🚀
*   **Pomodoro Timer:** Built-in 25/5 interval timer. When active, it locks the extension into **Strict Mode** to prevent cheating.
*   **Gamified Stats:** Tracks how many Shorts you've blocked and calculates the estimated time saved.
*   **Smart Notifications:** Integrated "Toast" notifications inside YouTube and system notifications when the tab is closed.
*   **UI Overhaul:** A completely redesigned, modern dark-mode interface with a smooth, gradient aesthetic.

## Features

### 🧠 Behavioral Intervention
*   **Strict Mode:** Instantly redirects you to the homepage if you try to open a Short. (No bypass allowed).
*   **Soft Mode:** Displays a full-screen warning overlay with a "Watch Anyway" button to add friction to the habit.
*   **Passive Mode:** Temporarily allows Shorts viewing without disabling the extension entirely.

### 🧹 Visual Cleaning
*   Hides the **"Shorts" shelf** from the Homepage.
*   Hides **Shorts** from Sidebar recommendations.
*   Hides **Shorts** filter chips and navigation buttons.

### ⚙️ Technical
*   **Dark Mode:** Fully themed UI that respects your system preferences.
*   **Auto-Updates:** (For manual installs) Automatically checks this repository for new versions and notifies you to update.

## Installation

### Official Stores
*   **Microsoft Edge:** *[Download from Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/focustube/emffahlehkfdlknpmpndaabhigchhoog)*
*   **Firefox Add-ons:** *[Pending Review]*

### Manual Installation (Developer Mode)
1.  Clone or download this repository:
    ```bash
    git clone https://github.com/malekwael229/FocusTube.git
    ```
2.  Open Chrome/Edge and navigate to `chrome://extensions`.
3.  Toggle **Developer mode** in the top right corner.
4.  Click **Load unpacked**.
5.  Select the folder containing `manifest.json`.

## Configuration

Click the extension icon in your toolbar to access the control panel:
*   **Pomodoro Timer:** Start a focus session. This will gray out the "Passive" option until the timer ends.
*   **Action Modes:** Switch between "Strict" (Kick out), "Soft" (Warn), and "Passive" (Allow).
*   **Master Toggle:** Turn the visual hiding features on/off independent of the blocking logic.

## Technical Details

*   **Architecture:** Built on **Manifest V3** using a Background Service Worker.
*   **Performance:** Uses `MutationObserver` and listens for YouTube's specific `yt-navigate-finish` events to minimize performance overhead.
*   **Privacy:** **100% Local.** No external tracking. All settings and stats are saved to `chrome.storage.local`.

## Known Issues

*   **CSS Obfuscation:** YouTube frequently changes their CSS class names. If the "Shorts" shelf reappears on the homepage, please open an issue with a screenshot so the selectors can be updated.

## License

[MIT](LICENSE)
