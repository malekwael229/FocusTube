<img width="1400" height="560" alt="FocusTube Banner" src="https://github.com/user-attachments/assets/1e95b1ee-c4a4-4d4f-a898-f00dcef223c4" />

# FocusTube: Distraction Blocker for YouTube, Instagram & TikTok 🛡️

A Manifest V3 browser extension that helps you reclaim your focus by blocking distracting content on today's most addictive platforms.

It aggressively blocks YouTube Shorts, Instagram Reels, and the TikTok feed, hiding algorithmic traps to prevent doomscrolling. Unlike basic element blockers, FocusTube is built to handle modern "Single Page App" navigation, ensuring blocks persist without needing a page refresh.

## New in v1.6 🚀
*   **Enhanced Instagram Protection:** Smart visibility logic now dynamically hides/shows the Reels and Explore buttons based on your Focus Mode status.
*   **Instant Kick:** Optimized strict mode now redirects you immediately (within ~50ms) when accessing blocked URLs on Instagram and YouTube, preventing the page from even loading.
*   **Pomodoro Timer:** Built-in 25/5 interval timer. When active, it locks the extension into **Strict Mode** and disables the "Passive" option to ensure you stay focused.
*   **Gamified Stats:** A real-time dashboard that tracks how many Shorts/Reels you've blocked and calculates the estimated time saved.
*   **UI Overhaul:** A completely redesigned interface with a modern dark-mode aesthetic, gradient accents, and platform-specific controls.

## Features

### 🧠 Behavioral Intervention
*   **Strict Mode:**
    *   **YouTube & Instagram:** Instantly redirects you to the homepage if you try to open a Short/Reel.
    *   **TikTok:** Displays a full-screen overlay, preventing access to the feed.
*   **Soft Mode:** Displays a full-screen warning overlay that pauses and mutes the video, requiring a conscious decision to "Watch Anyway."
*   **Passive Mode:** Disables active blocking while keeping visual cleaning active (unless toggled off).

### 🧹 Visual Cleaning
*   **YouTube:**
    *   Hides the **"Shorts" shelf** from the Homepage.
    *   Hides **Shorts** from Sidebar recommendations.
    *   Hides **Shorts** filter chips and navigation buttons across the site.
*   **Instagram:**
    *   Hides the **"Reels" tab** from the main navigation.
    *   Hides the **"Explore" tab**.

## Installation

### Official Stores
*   **Microsoft Edge:** *[Download from Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/focustube/emffahlehkfdlknpmpndaabhigchhoog)* (v1.6 Pending) NOT UPDATED YET
*   **Firefox Add-ons:** *[Pending Review]*
*   **Chrome Web Store:** *[Pending Review]*

### 🛠️ Manual Installation (Developer Mode)

1.  **Clone or Download** this repository to your computer.
2.  **Rename the correct manifest file:**
    *   For **Chrome** or **Edge**, rename `chrome-manifest.json` to `manifest.json`.
    *   For **Firefox**, rename `firefox-manifest.json` to `manifest.json`.
3.  **Load the extension:**
    *   **Chrome/Edge:** Go to `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**. Select the FocusTube folder.
    *   **Firefox:** Go to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on...**, and select the `manifest.json` file.

## Configuration

Click the extension icon in your toolbar to access the control panel:
*   **Master Toggle:** Turn the visual hiding features on/off.
*   **Platform Tabs:** Switch between YouTube, Instagram, and TikTok to configure each platform independently.
*   **Action Modes:** Switch between "Strict", "Soft", and "Passive" modes.
*   **Pomodoro Timer:** Start a 25-minute focus session. During the timer, all platforms are locked into "Strict" mode.

## Technical Details

*   **Architecture:** Built on **Manifest V3**. Uses a Background Service Worker (Chrome/Edge) or Background Script (Firefox) to maintain timer state across all tabs.
*   **Permissions:** Uses `host_permissions` to run on `youtube.com`, `instagram.com`, and `tiktok.com`.
*   **Performance:** Uses `MutationObserver` optimized with layout-shift prevention to ensure zero lag while scrolling.
*   **Privacy:** **100% Local.** FocusTube does not use external servers, tracking, or analytics. All data stays in your browser's `chrome.storage.local`.

## Known Issues

*   **CSS Obfuscation:** Social media sites frequently change their CSS class names. If you notice a feed or button is no longer hidden, please open an issue with a screenshot so the selectors can be updated.

## License

[MIT](LICENSE)