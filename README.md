# FocusTube 🛡️

A Manifest V3 browser extension that forces YouTube to be a productivity tool, not a slot machine. 

It aggressively blocks Shorts, hides algorithmic feeds, and prevents doomscrolling. Unlike basic element blockers, FocusTube handles YouTube's "Single Page App" navigation events to ensure blocks persist between page views.

## Features

*   **Strict Mode:** Instantly redirects you to the homepage if you try to open a Short.
*   **Soft Mode:** Displays a full-screen warning overlay (with a "Watch Anyway" button) instead of a hard redirect.
*   **Passive Mode:** Temporarily allows Shorts viewing without disabling the extension entirely.
*   **Visual Cleaning:** Hides the "Shorts" shelf, sidebar recommendations, and filter chips.
*   **Dark Mode:** Fully themed UI that respects your system preferences.
*   **Auto-Updates:** (For manual installs) Automatically checks this repository for new versions and notifies you to update.

## Installation

### Official Stores
*   **Microsoft Edge:** *[Pending Review - Link coming soon]*
*   **Firefox Add-ons:** *[Pending Review - Link coming soon]*

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
*   **Master Toggle:** Turn the visual hiding features on/off.
*   **Action Modes:** Switch between "Strict" (Kick out), "Soft" (Warn), and "Passive" (Allow).
*   **Dark Mode:** Toggle the extension popup theme.

## Technical Details

*   **Architecture:** Built on Manifest V3.
*   **Performance:** Uses `MutationObserver` and listens for YouTube's specific `yt-navigate-finish` events to minimize performance overhead.
*   **Update Engine:** Includes a custom fetcher that checks `manifest.json` on GitHub to alert side-loaded users of updates.
*   **Privacy:** No external tracking. All settings are saved to `chrome.storage.local`.

## Known Issues

*   YouTube frequently changes their CSS class names (obfuscation). If the "Shorts" shelf reappears on the homepage, please open an issue with a screenshot so the selectors can be updated.

## License

[MIT](LICENSE)
