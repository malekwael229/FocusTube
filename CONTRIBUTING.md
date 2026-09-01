# Contributing

Thanks for helping maintain FocusTube. This project is a live browser extension, so changes should be small, testable, and privacy-preserving.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Local Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/malekwael229/FocusTube.git
   cd FocusTube
   ```

2. Choose the correct manifest for your browser.

### Chromium Browsers

Chrome, Edge, Brave, and other Chromium browsers use `chrome-manifest.json`.

1. Copy or rename `chrome-manifest.json` to `manifest.json`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository folder.

### Firefox

Firefox uses `firefox-manifest.json`.

1. Copy or rename `firefox-manifest.json` to `manifest.json`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select the copied/renamed `manifest.json` file.

## Contribution Process

- Open an issue first when a change is large, changes permissions, changes privacy behavior, or affects several supported sites.
- Submit code changes through a pull request rather than committing directly to `main`.
- Keep each pull request focused on one problem or closely related set of changes.
- Explain the problem, the proposed behavior, and the validation performed.

## Testing Changes

Read [TESTING.md](TESTING.md) for automated commands, fixture boundaries, the Firefox restart limitation, and the browser matrix. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing manifest, background, content-script, storage, or messaging behavior.

Before submitting changes, manually test the affected browser and platform behavior:

- YouTube Shorts blocking, Shorts navigation/shelf hiding, and Subscriptions "Most relevant" shelf hiding in English YouTube UI.
- Instagram Reels/Explore path blocking, Stories, and Reels navigation behavior.
- TikTok feed/video blocking and safe pages such as messages/settings.
- Facebook Reels route blocking, Reels navigation, Stories, and People You Might Know hiding behavior.
- LinkedIn feed and sidebar hiding behavior.
- Popup controls, per-platform modes, and timer controls.
- Options page settings, import/export, reset, and clear-data flows.

Run the focused checks for the change, then run `npm.cmd run test:all` on Windows or `npm run test:all` in a Unix-like shell when practical. The smoke runner is headful and requires an active desktop session.

Major new functionality must add or update automated tests for the new behavior. Bug fixes should add a regression test when the failure can be reproduced reliably in the automated harness.

Keep changes focused. Do not add analytics, tracking, remote servers, or new permissions unless there is a clear product need and it is documented.

## Bug Report Format

When reporting a bug, please include:

- **Browser:**
- **Extension version:**
- **Website affected:**
- **Blocking mode:** Strict, Warn, Passive, timer work mode, or timer break mode
- **Expected behavior:**
- **Actual behavior:**
- **Steps to reproduce:**
- **Screenshots or screen recording if possible:**

## Pull Request Guidance

- Keep behavior changes small and explain why they are needed.
- Update README or other docs when user-facing behavior changes.
- Avoid broad formatting mixed with behavior changes.
- Do not add telemetry, tracking, remote configuration, or unnecessary permissions.
- Do not commit secrets, credentials, private browsing data, or personal data.
- Keep third-party dependencies minimal and document why a new dependency is required.
