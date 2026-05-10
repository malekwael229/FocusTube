<div align="center">
  <img width="1400" height="560" alt="FocusTube promotional tile" src="https://github.com/user-attachments/assets/7cb5e68f-e575-40da-8084-333c4f26c7e2" />

  # FocusTube: Distraction Blocker

  **A privacy-first browser extension for reducing distracting social video and feed surfaces.**

  **Supports YouTube Shorts, Instagram Reels, TikTok, Facebook Reels, and LinkedIn feed controls.**

  [Installation](#installation) • [Features](#features) • [Configuration](#configuration) • [Project Impact](#project-impact) • [Technical Highlights](#technical-highlights) • [Privacy](#privacy)

  ![License](https://img.shields.io/badge/license-MIT-blue.svg)
  ![Version](https://img.shields.io/badge/version-2.2.0-green.svg)
  ![Firefox](https://img.shields.io/badge/firefox-compatible-orange.svg)
</div>

---

**FocusTube** is an open-source browser extension built and maintained to help users reduce doomscrolling and stay focused. It blocks or hides distracting areas on supported platforms while keeping all settings and usage data local to the browser.

The project supports Chromium browsers with a Manifest V3 build and Firefox with a separate compatibility manifest.

## Features

### Blocking Modes

- **Strict Mode:** Blocks distracting surfaces by redirecting or showing a blocking overlay.
- **Warn Mode:** Shows an interstitial before access where supported.
- **Passive Mode:** Allows normal browsing while visual hiding controls can still reduce distracting entry points.

### Supported Surfaces

- **YouTube:** Blocks Shorts URLs and can hide Shorts navigation/shelves.
- **Instagram:** Blocks Reels/Explore paths and can hide Reels navigation and Stories.
- **TikTok:** Blocks common feed/video surfaces while allowing safer areas such as messages and settings.
- **Facebook:** Blocks Reels paths and can hide Reels navigation and Stories.
- **LinkedIn:** Can hide the main feed and "Add to your feed" sidebar card.

### Productivity Tools

- Built-in focus/break timer.
- Optional browser notifications when timers complete.
- Local blocked-count and time-saved estimates.
- Popup and options pages for browser-local configuration.

---

## Installation

### Official Stores

- **Chrome Web Store:** [FocusTube](https://chromewebstore.google.com/detail/focustube-distraction-blo/ppdjgkniggbikifojmkindmbhppmoell)
- **Microsoft Edge Add-ons:** [FocusTube](https://microsoftedge.microsoft.com/addons/detail/focustube/emffahlehkfdlknpmpndaabhigchhoog)
- **Firefox Add-ons:** [FocusTube](https://addons.mozilla.org/addon/focus-tube/)

### Manual Installation

Clone or download this repository, then choose the manifest for your browser.

#### Chrome, Edge, Brave, and other Chromium browsers

The Chromium build uses **Manifest V3**.

1. Copy or rename `chrome-manifest.json` to `manifest.json`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository folder containing the renamed `manifest.json`.

#### Firefox

The Firefox build currently uses **Manifest V2** for compatibility.

1. Copy or rename `firefox-manifest.json` to `manifest.json`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select the copied/renamed `manifest.json` file.

Firefox temporary add-ons are removed when the browser restarts. Reload the manifest from `about:debugging` when testing changes.

---

## Configuration

Click the extension icon to open the popup:

- Toggle FocusTube on or off.
- Toggle visual distraction hiding.
- Configure each supported platform.
- Start or stop the focus/break timer.
- Open the options page for timer settings, platform visibility, import/export, and reset controls.

---

## Project Impact

- Published on Chrome Web Store, Microsoft Edge Add-ons, and Firefox Add-ons.
- Open-source MIT-licensed project.
- Privacy-first: no extension-side analytics or remote backend; settings stay in browser storage.

---

## Technical Highlights

- Browser extension APIs for storage, alarms, notifications, popup UI, options UI, and content scripts.
- Cross-browser manifests for Chromium and Firefox.
- Site-specific content scripts for YouTube, Instagram, TikTok, Facebook, and LinkedIn.
- Shared DOM utilities for overlays, visual hiding, timer state, and SPA updates.
- `MutationObserver`, browser navigation events, and timer-driven messaging for dynamic single-page applications.
- Local browser storage for preferences, timer state, stats, and import/export data.

---

## Privacy

FocusTube is designed to run locally in the browser.

- **No analytics or tracking:** The extension code does not include analytics SDKs or telemetry calls.
- **No remote backend:** The extension does not send browsing data or settings to a project-controlled server.
- **Local storage:** Preferences, timer state, stats, and settings backups use browser-local APIs such as `chrome.storage.local`.
- **User-opened links only:** The popup/options UI can open GitHub or store listing pages when the user clicks related buttons.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and testing notes.

## Security

See [SECURITY.md](SECURITY.md) for reporting security or privacy issues.

## License

[MIT](LICENSE)
