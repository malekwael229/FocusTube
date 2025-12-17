# FocusTube

A Chrome extension to stop the doomscrolling. It hides YouTube Shorts from the interface and blocks the player if you try to watch them.

![FocusTube Banner](https://img.shields.io/badge/Focus-Tube-blue?style=for-the-badge&logo=youtube&logoColor=white)

## What it does

YouTube pushes Shorts everywhere. FocusTube removes them.

*   **Hides the Clutter:** Removes the "Shorts" tab from the sidebar, the shelves on the homepage, and the chips in search results.
*   **Blocks the Player:** If you click a direct link to a Short, it stops playback immediately.
*   **Two Modes:**
    *   **Strict:** Instantly redirects you back to the homepage.
    *   **Soft (Warn):** Pauses the video and shows a warning overlay. You have to manually click "Watch Anyway" to proceed.
*   **Dark Mode:** Comes with a native dark theme enabled by default.

*Note: It is specifically built to play nice with YouTube's Single Page Application (SPA) navigation, so it won't break your History page or require page refreshes to work.*

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
*   **Blocking Style:** Switch between "Strict" (redirect) or "Soft" (warning overlay).
*   **Dark Mode:** Toggles the theme for the popup and the warning screen.

## Under the Hood

Built with Manifest V3. It uses `MutationObserver` to handle YouTube's dynamic DOM and event capture to aggressively stop auto-play before the video creates a distraction.

## Contributing

Feel free to open an issue or PR if YouTube changes their layout and breaks something.

## License

MIT
