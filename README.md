# FocusTube 🛡️

A Manifest V3 Chrome Extension that forces YouTube to be a productivity tool, not a slot machine. 

It aggressively blocks Shorts, hides algorithmic feeds, and prevents doomscrolling. Unlike basic element blockers, FocusTube handles YouTube's "Single Page App" navigation events to ensure blocks persist between page views.

## Features

*   **Strict Mode:** Instantly redirects you to the homepage if you try to open a Short.
*   **Soft Mode:** displays a warning overlay (with a "Watch Anyway" delay) instead of a hard redirect.
*   **Feed Cleaning:** Hides the "Shorts" shelf, sidebar recommendations, and the main algorithmic feed.
*   **Dark Mode Support:** Warning overlays respect your system/browser theme.

## Installation (Developer Mode)

The extension is currently not on the Chrome Web Store. To install it:

1.  Clone the repository:
    ```bash
    git clone https://github.com/malekwael229/FocusTube.git
    ```
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Toggle **Developer mode** in the top right corner.
4.  Click **Load unpacked**.
5.  Select the folder containing `manifest.json`.

## Configuration

Click the extension icon in your toolbar to access the control panel:
*   **Toggle Master Switch:** Turn the extension on/off globally.
*   **Shorts Behavior:** Switch between "Strict" (Kick out) and "Soft" (Warn).
*   **Dark Mode:** Force the extension UI to dark mode.

## Technical Details

*   **Architecture:** built on Manifest V3.
*   **Performance:** Uses `MutationObserver` and listens for YouTube's specific `yt-navigate-finish` events to minimize performance overhead.
*   **Privacy:** No external tracking. All settings are saved to `chrome.storage.local`.

## Known Issues

*   YouTube frequently changes their CSS class names (obfuscation). If the "Shorts" shelf reappears on the homepage, please open an issue with a screenshot so the selectors can be updated.

## License

[MIT](LICENSE)
