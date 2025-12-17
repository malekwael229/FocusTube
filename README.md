# FocusTube 🛡️

A Chrome extension to stop the doomscrolling. It hides YouTube Shorts from the interface and blocks the player if you try to watch them.

![FocusTube Banner](https://img.shields.io/badge/Focus-Tube-blue?style=for-the-badge&logo=youtube&logoColor=white) ![Version](https://img.shields.io/badge/Version-1.2-green?style=for-the-badge)

## What it does

YouTube pushes Shorts everywhere. FocusTube removes them.

*   **Hides the Clutter:** Removes the "Shorts" tab from the sidebar, the shelves on the homepage, and the chips in search results.
*   **Blocks the Player:** If you click a direct link to a Short, it stops playback immediately.
*   **Three Modes:**
    *   **Strict:** Instantly redirects you back to the homepage.
    *   **Soft (Warn):** Pauses the video and shows a warning overlay. You have to manually click "Watch Anyway" to proceed.
    *   **Passive:** Disables restrictions temporarily. YouTube functions normally (Shorts are visible and playable) without needing to disable the extension.
*   **Dark Mode:** Comes with a native dark theme enabled by default.

## Installation

This isn't on the Chrome Web Store yet, so you'll need to load it manually:

1.  Clone or download this repo.
    ```bash
    git clone https://github.com/malekwael229/FocusTube.git
    ```
2.  Open Chrome and go to `chrome://extensions/`.
3.  Toggle **Developer mode** (top right).
4.  Click **Load unpacked**.
5.  Select the `FocusTube` folder.

## Usage

Click the extension icon to open the popup.

*   **Main Switch:** Toggles the entire extension on/off.
*   **Blocking Style:** Switch between "Strict" (redirect) or "Soft" (warning overlay) or "Passive" (does nothing).
*   **Dark Mode:** Toggles the theme for the popup and the warning screen.


## Contributing

Feel free to open an issue or PR if YouTube changes their layout and breaks something.

## License

MIT
