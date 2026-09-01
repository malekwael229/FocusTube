<div align="center">
  <img width="1400" height="560" alt="focustube-promotional-tile-1400x560 (2)" src="https://github.com/user-attachments/assets/14ee134e-dbbd-4649-919d-bb2e494d5fdb" />

  <h1>FocusTube: Distraction Blocker</h1>

  <p><strong>A privacy-first browser extension for reducing distracting social video and feed surfaces.</strong></p>

  <p><strong>Supports YouTube Shorts, Instagram Reels, TikTok, Facebook Reels, and LinkedIn feed controls.</strong></p>

  <p>
    <a href="#installation">Installation</a> |
    <a href="#features">Features</a> |
    <a href="#configuration">Configuration</a> |
    <a href="#project-impact">Project Impact</a> |
    <a href="#technical-highlights">Technical Highlights</a> |
    <a href="#privacy">Privacy</a>
  </p>

  <p>
    <a href="https://github.com/malekwael229/FocusTube/actions/workflows/ci.yml"><img alt="CI status" src="https://github.com/malekwael229/FocusTube/actions/workflows/ci.yml/badge.svg?branch=main" /></a>
    <a href="https://www.bestpractices.dev/projects/14395"><img alt="OpenSSF Best Practices Passing" src="https://www.bestpractices.dev/projects/14395/badge" /></a>
    <a href="https://www.bestpractices.dev/projects/14395"><img alt="OpenSSF Best Practices Baseline Level 1" src="https://www.bestpractices.dev/projects/14395/baseline" /></a>
    <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" />
    <img alt="Version: 2.3.2" src="https://img.shields.io/badge/version-2.3.2-green.svg" />
    <img alt="Firefox compatible" src="https://img.shields.io/badge/firefox-compatible-orange.svg" />
  </p>
</div>

---

**FocusTube** is an open-source browser extension that helps reduce doomscrolling and stay focused. It blocks or hides distracting areas on supported platforms while keeping settings and usage data local to the browser.

The project supports Chromium browsers with a Manifest V3 build and Firefox with a separate compatibility manifest.

## Features

### Blocking Modes

- **Strict Mode:** Blocks distracting surfaces by redirecting or showing a blocking overlay.
- **Warn Mode:** Shows an interstitial before access where supported.
- **Passive Mode:** Allows normal browsing while visual hiding controls can still reduce distracting entry points.

### Supported Surfaces

- **YouTube:** Blocks Shorts URLs and can hide Shorts navigation/shelves plus the English "Most relevant" shelf on the Subscriptions page.
- **Instagram:** Blocks Reels/Explore paths and can hide Reels navigation and Stories.
- **TikTok:** Blocks common feed/video surfaces while allowing safer areas such as messages and settings.
- **Facebook:** Blocks Reels paths and can hide Reels navigation, Stories, and People You Might Know suggestions.
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

Impact figures are approximate as of September 1, 2026. Store dashboards use different activity windows, so the combined audience is rounded:

- Approximately 700 users across the Chrome Web Store, Microsoft Edge Add-ons, and Firefox Add-ons.
- 32 GitHub stars and 4 forks.
- 5.0 from 7 Chrome Web Store ratings and 5.0 from 3 Firefox Add-ons reviews.
- Chrome Web Store Featured status.
- Published on all three stores: Chrome, Edge, and Firefox.

## Development Note

AI tools contributed substantially to the implementation. The maintainer remains responsible for product direction, requirements, UX decisions, testing, debugging, publishing, maintenance, user feedback, and release management.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards. [TESTING.md](TESTING.md) covers automated commands and the browser matrix; [ARCHITECTURE.md](ARCHITECTURE.md) describes the runtime boundaries.

## Security

See [SECURITY.md](SECURITY.md) for reporting security or privacy issues.

## License

[MIT](LICENSE)
