<div align="center">
<img width="1672" height="941" alt="focustube-screenshot-01-hero" src="https://github.com/user-attachments/assets/da3954d3-9a88-4ae8-81bf-62eafff7bfb5" />

  <h1>FocusTube - Shorts, Reels &amp; Feed Blocker</h1>

  <p><strong>A privacy-first browser extension for reducing distracting social video and feed surfaces.</strong></p>

  <p><strong>Supports YouTube Shorts, Instagram Reels, TikTok, Facebook Reels, LinkedIn feeds, and current Reddit feeds.</strong></p>

  <p>
    <strong>Install:</strong>
    <a href="https://chromewebstore.google.com/detail/focustube-distraction-blo/ppdjgkniggbikifojmkindmbhppmoell">Chrome</a> |
    <a href="https://addons.mozilla.org/en-US/firefox/addon/focus-tube/">Firefox</a> |
    <a href="https://microsoftedge.microsoft.com/addons/detail/focustube-distraction-bl/emffahlehkfdlknpmpndaabhigchhoog">Edge</a>
  </p>

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
    <img alt="GitHub release version: 2.5.0" src="https://img.shields.io/badge/version-2.5.0-green.svg" />
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

- **YouTube:** Redirects Shorts and Playables routes in Strict Mode or work sessions, warns in Warn Mode, and can hide their navigation and discovery shelves plus the English "Most relevant" shelf on the Subscriptions page.
- **Instagram:** Blocks Reels/Explore paths; can hide Reels navigation and Stories; and optionally filters suggested or sponsored posts when detected.
- **TikTok:** Blocks common feed/video surfaces while allowing safer areas such as messages and settings.
- **Facebook:** Blocks Reels paths and can hide Reels navigation, Stories, and People You Might Know suggestions.
- **LinkedIn:** Can hide the main feed and "Add to your feed" sidebar card, with optional filtering for suggested, outside-network, promoted, and network-activity posts when detected.
- **Reddit:** Hides current Reddit Home, News, Popular, All, and community feeds in Strict mode or during work timers. Warn mode offers a per-feed reveal; Passive shows feeds. Individual posts, comments, and search remain available. The legacy `old.reddit.com` interface is not covered.

### Productivity Tools

- Built-in focus/break timer.
- Optional browser notifications when timers complete.
- Local blocked-count and time-saved estimates.
- Popup and options pages for browser-local configuration.

---

## Installation

The [FocusTube project website](https://malekwael229.github.io/FocusTube/) includes platform-specific guides and the same official store links used by the extension.

The latest published GitHub release is 2.5.0. Browser-store updates are separate; check the version shown on each listing before treating a store listing as current.

### Official Stores

- **Chrome Web Store:** [FocusTube](https://chromewebstore.google.com/detail/focustube-distraction-blo/ppdjgkniggbikifojmkindmbhppmoell)
- **Microsoft Edge Add-ons:** [FocusTube](https://microsoftedge.microsoft.com/addons/detail/focustube-distraction-bl/emffahlehkfdlknpmpndaabhigchhoog)
- **Firefox Add-ons:** [FocusTube](https://addons.mozilla.org/en-US/firefox/addon/focus-tube/)

### Manual Installation

Clone or download this repository, then choose the manifest for your browser.

#### Chrome, Edge, Brave, and other Chromium browsers

The Chromium build uses **Manifest V3**.

1. Copy `chrome-manifest.json` to `manifest.json`, keeping the original file for builds and tests.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository folder containing the copied `manifest.json`.

#### Firefox

The Firefox build currently uses **Manifest V2** for compatibility.

1. Copy `firefox-manifest.json` to `manifest.json`, keeping the original file for builds and tests.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select the copied `manifest.json` file.

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

Snapshot refreshed September 13, 2026. Store analytics use different activity windows, so the figures below are kept separate rather than summed:

- Chrome Web Store: 390 weekly users on September 11; 5.0 from 7 ratings; Featured status.
- Firefox Add-ons: 298 daily users on September 12; 5.0 from 3 reviews.
- Microsoft Edge Add-ons: 129 users in the week ending September 6, including 110 enabled and 19 disabled.
- GitHub: 33 stars and 4 forks.
- Published listings: Chrome, Firefox, and Edge.

---

## Technical Highlights

- Browser extension APIs for storage, alarms, notifications, popup UI, options UI, and content scripts.
- Cross-browser manifests for Chromium and Firefox.
- Site-specific content scripts for YouTube, Instagram, TikTok, Facebook, LinkedIn, and the current Reddit interface.
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
