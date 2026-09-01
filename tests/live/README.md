# Live Browser Validation

This optional harness tests the retained 2.3.1 release candidate, not a rebuilt or patched extension. It never publishes anything. Use the existing deterministic suite first; live-site results complement it, not replace it.

## Setup on Windows

Run from the FocusTube repository in PowerShell:

```powershell
npm.cmd ci
npx.cmd playwright install chromium
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/live/setup-firefox.ps1
npm.cmd run test:live:harness
```

The Firefox setup downloads pinned geckodriver 0.37.1 from Mozilla's official GitHub release and checks its SHA-256. No Selenium dependency is needed. The harness uses Playwright for Chromium browsers and the WebDriver protocol for Firefox.

The extracted release folders and ZIPs must already exist under `dist-release-builds`, with names `FocusTube-release-chromium-v2.3.1` and `FocusTube-release-firefox-v2.3.1`. Runtime files must match the working candidate exactly. The harness refuses stale packages and checks that candidate bytes remain unchanged afterwards.

## One-Time Browser and Login Steps

Current branded Chrome and Edge do not reliably allow automated unpacked-extension installation. Set up each isolated profile once:

```powershell
npm.cmd run test:live -- --setup chrome
npm.cmd run test:live -- --setup edge
```

In the opened extension manager, enable Developer mode, choose **Load unpacked**, and select `dist-release-builds/FocusTube-release-chromium-v2.3.1`. Return to the terminal and press Enter. Do not choose your normal browser profile.

Sign in only where needed, using your own keyboard in these isolated profiles:

```powershell
npm.cmd run test:live -- --login chrome --sites ig,tt,fb,li
npm.cmd run test:live -- --login edge --sites ig,tt,fb,li
npm.cmd run test:live -- --login firefox --sites ig,tt,fb,li
```

For subscriptions tests, include `yt` too. Complete any consent screen or account challenge yourself. The harness does not collect credentials, copy cookies from other profiles, or bypass challenges. Press Enter after login to close the browser and preserve its isolated profile.

Profiles live in ignored `.tmp/live-validation/profiles`. They contain sensitive browsing sessions. Reports, screenshots and driver logs also stay under ignored `.tmp/live-validation`. Do not commit or share them without reviewing for personal information. Avoid running two processes against the same profile.

## Run

```powershell
npm.cmd run test:all
npm.cmd run test:live
```

Targeted reruns:

```powershell
npm.cmd run test:live -- --browsers firefox --extension-only
npm.cmd run test:live -- --browsers chrome --sites fb,ig --sites-only
npm.cmd run test:live -- --browsers chromium
```

`chromium` is Playwright's supplementary browser, not evidence for installed Chrome or Edge. `--quick` skips longer timer cases and is for debugging the harness, not release sign-off. Exit 0 means all attempted checks passed; 1 means a mismatch/fatal error; 2 means checks remain blocked. A run with restricted scope is not a complete release matrix.

Optional binary overrides: `FOCUSTUBE_CHROME`, `FOCUSTUBE_EDGE`, `FOCUSTUBE_FIREFOX`. These select an executable, never a normal user profile.

## Restart and Timer Boundaries

Chrome/Edge restart checks close and relaunch the same isolated profile without installing the extension again. They only run after persistent installation is established. Bundled Chromium's CLI sideload does not qualify as a persistent-install restart.

Release Firefox can run the unsigned candidate as a temporary add-on. A temporary add-on does not survive restart, so that restart case stays BLOCKED. For a genuine unsigned restart test, install Firefox Developer Edition or Nightly and explicitly run:

```powershell
$env:FOCUSTUBE_FIREFOX = 'C:\Program Files\Firefox Developer Edition\firefox.exe'
npm.cmd run test:live -- --browsers firefox --firefox-persistent
```

Only this explicit test uses signature preferences in the isolated non-release profile. Do not use a normal Firefox profile. A signed candidate is another route to persistent testing, but this harness does not obtain or publish signatures.

Real UI timer starts, close/reopen and stop checks are separate from accelerated completion checks. Short completion deadlines are seeded through the extension's settings transaction and labelled instrumented, not presented as a full 25-minute session. Existing deterministic background tests cover stale callbacks, cold-start state and injected failures; they do not by themselves prove browser or OS delivery.

## Evidence and Failure Rules

Each run writes `results.json` and `report.md` to a timestamped directory in `.tmp/live-validation/runs`. Cases record browser/version, site, route, mode/settings, expected/actual result, time, status, errors and failure screenshots where available.

- PASS proves only the named case and scope.
- BLOCKED means authentication, a challenge, missing target, network or automation prevented proof.
- FAIL stops the run for diagnosis. It is not automatically a product defect.
- PARTIAL in the site matrix means some live checks passed while others remain blocked.

Failure categories: A product regression; B changed/missing markup; C account, locale or challenge; D automation limitation or an untriaged mismatch; E network.

The runner never substitutes synthetic content for a live site. It uses bounded polling and at most three scrolls to seek naturally inserted targets. Absent media, ambiguous controls and unavailable SPA links stay blocked. It does not post, like, follow, message or change account settings. It changes only the isolated extension's settings and test data.

If a real product defect is confirmed, stop and report it before editing production code. Fixing a harness defect must not turn the earlier failed evidence into a retroactive pass; rerun and keep the fresh report.

## Remaining Human Validation

1. One-time unpacked installation and any required logins above, then rerun automation.
2. Resolve only remaining live BLOCKED cases in the report. Do not repeat automated cases that already passed on that browser.
3. Observe one timer-completion OS notification with notifications enabled, and confirm disabling notifications suppresses it. Notification API evidence cannot prove that Windows displayed a toast.
4. Complete genuine Firefox persistence testing using an eligible environment before claiming restart validation.

## References

- [Playwright extension testing and branded-browser restrictions](https://playwright.dev/docs/chrome-extensions)
- [Mozilla geckodriver flags](https://firefox-source-docs.mozilla.org/testing/geckodriver/Flags.html)
- [Firefox temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)
