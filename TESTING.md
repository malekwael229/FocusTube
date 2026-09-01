# Testing

FocusTube uses deterministic Node tests, a headful Chromium smoke runner, and Firefox package linting. The automated fixture tests do not replace live-site checks.

## Windows Setup

From PowerShell in the repository root:

```powershell
cd path\to\FocusTube
npm.cmd ci
npx.cmd playwright install chromium
```

The repository requires Node.js 20 or newer. The test dependencies are pinned in `package-lock.json`, including Playwright and `web-ext` 10.6.0.

`npm audit --omit=dev` reports zero vulnerabilities. The full dev-inclusive audit reports three high-severity vulnerability entries in the `web-ext`/`addons-linter` validation chain, driven by two underlying image-size advisories plus an aggregate dependency entry. These findings are dev-only and not packaged in the extension; there is no safe non-breaking current upgrade, so monitor the findings. Audit output is intentionally not suppressed.

## Automated Commands

Run the complete local gate:

```powershell
npm.cmd run test:all
```

The aggregate runner creates fresh `.tmp/test-builds/chromium` and `.tmp/test-builds/firefox` packages, then runs the package reproducibility check covered by `test:package`, JavaScript syntax checks, regression tests, background timer tests, the Chromium smoke suite, and Firefox lint. It removes the temporary packages after success or failure.

Run individual checks when narrowing a failure:

```powershell
npm.cmd run test:regression
npm.cmd run test:background
npm.cmd run test:package
node scripts/prepare-test-builds.js
npm.cmd run test:smoke
node .\node_modules\web-ext\bin\web-ext.js lint --warnings-as-errors --source-dir .tmp\test-builds\firefox
```

The smoke runner is headful and requires an active desktop session. The optional live YouTube check requires network access:

```powershell
npm.cmd run test:smoke:youtube
```

## Automated Coverage

The deterministic suites cover:

- Manifest parsing, permission and CSP checks, per-platform content-script splitting, icon metadata, and the package allowlist.
- Background initialization restores future alarms without consuming expired state. Explicit browser startup completes an overdue timer once when its primary alarm matches, regardless of startup and alarm event order, and otherwise cleans expired state silently. A primary alarm lookup failure preserves the timer and defers reconciliation, future-alarm recreation failure schedules bounded identity-safe recovery, and expired cleanup revalidates timer identity before removal. Stale or mismatched alarms have no side effects.
- Regression checks verify that `background.js` is the only timer-state mutation authority, `ft_enabled` mutations and timer mutations are requested through serialized background messages, operation-owned enable markers retire on same-value and no-event paths, external `ft_enabled=false` cleanup works without an enabled timer and removes timer state before alarm clear, partial `storage.onChanged` events do not reconstruct timers, and settings replacement is limited to extension-page senders validated by runtime ID and runtime URL origin.
- Background timer tests cover direct primary-alarm creation and scheduled-time verification for user timer writes, replacement starts, structured storage and alarm errors, MV3 cold-wake completion, external timer replacement races, stale and same-end different-type timer protection, storage read, storage remove, tabs query, completion-write failures, durable retry alarms bound to timer identity and attempt, the three-attempt retry limit, and exact durable completion claims that suppress duplicate notification, runtime, and tab effects across startup, alarm, retry, and fresh contexts.
- Settings replacement tests cover the prior timer and alarm snapshot, staged writes, rollback-safe storage and alarm failures without `storage.clear`, replacement rollback cleanup of a newly created alarm when storage rollback fails, alarm-clear failures that restore durable timer state and return transactional errors instead of success, and disabled replacement, stop, and disable cleanup that removes timer state before clearing the primary alarm. Work-to-break tests verify that alarm failures retry the new break identity while storage failures retry the still-durable work identity, and disable-during-completion tests verify that notification, extension-message, and tab-message side effects are suppressed.
- Popup regression checks verify that a failed stop re-reads durable timer end and type before repainting the timer and leaves the active display unchanged when that recovery read fails, while break start and dismiss failures reconcile the prompt from durable state. Background tests verify that `dismissEndedPrompt` returns a structured failure when marker removal fails, and import checks require a valid `ft_timer_end` and `ft_timer_type` pair. Content regression checks verify that a partial timer change re-reads both durable fields atomically before updating state or dispatching an event.
- Package tests validate safe output roots, remove only known generated FocusTube artifacts, preserve unrelated output, reject unsafe roots without touching sentinels, build Chromium and Firefox ZIPs twice, validate their contents and manifest versions, and compare their hashes byte for byte.
- One non-resetting pending mutation check for Instagram, TikTok, and Facebook, including disable and re-enable lifecycle behavior.
- Cleanup of the pre-body `ensureBody()` observer and scoped Facebook Stories selectors.
- Popup and options rendering, mode and visual-hiding settings, storage persistence after reload, timer start and stop, and removal of retired settings.
- Chromium fixture behavior for YouTube, Instagram, TikTok, Facebook, and LinkedIn, including route blocking, Warn-mode media recovery, late DOM content, SPA navigation events where covered, and platform-specific visual hiding.

The regression and package results above are automated test evidence only. They do not claim live-browser validation or a manual Firefox restart validation pass.

Injected failure coverage includes storage set, remove, and read failures; primary alarm creation failures and scheduled-time matching on successful writes; alarm-clear failures; retry alarm failures; startup alarm lookup and future-alarm recreation failures; completion retries; replacement rollback; stale identity protection; and popup recovery-read failures. The tests assert preserved state, transactional error reporting, identity-safe recovery, and no duplicate completion side effects where those paths apply.

## Manual Browser Matrix

Run the following matrix in current Chrome, Edge, and Firefox. Record browser version, site and route, settings, expected result, actual result, and evidence for failures.

| Site | Chrome | Edge | Firefox |
| --- | --- | --- | --- |
| YouTube | [ ] | [ ] | [ ] |
| Instagram | [ ] | [ ] | [ ] |
| TikTok | [ ] | [ ] | [ ] |
| Facebook | [ ] | [ ] | [ ] |
| LinkedIn | [ ] | [ ] | [ ] |

For every matrix cell, check:

- Extension enable and disable, plus the platform enable state.
- Strict, Warn, and Passive behavior on blocked and allowed routes.
- Watch Anyway, navigation away and back, refresh, and media controls where supported.
- Every platform-specific visual-hiding toggle, including late-loaded elements.
- SPA or tab navigation and DOM content added after the initial page load.
- Popup and options parity, settings persistence after reload, and settings persistence after browser restart where the browser installation supports it.
- Timer start, stop, work-to-break transition, focus locking, storage state, and optional browser notifications.
- Disable and re-enable while an overlay, observer, or timer is active.

### Firefox Restart Limitation

Firefox temporary add-ons are removed when the browser restarts. Do not claim a manual Firefox restart recovery pass for the ordinary temporary-add-on workflow. To test persistent restart recovery on the current unsigned build, use Firefox Developer Edition or Nightly with signature enforcement disabled and install the staged XPI persistently. If that environment is unavailable, record the limitation and rely on deterministic background reload tests instead.

## Fixtures Versus Live Sites

The Playwright smoke suite uses local HTML fixtures served through route interception. These fixtures provide stable DOM and media cases for the five supported sites, but they do not prove compatibility with each site's current production markup, account state, locale, or anti-bot behavior. A fixture pass also does not prove Firefox live-site behavior.

Use `tests/manual-live-site-notes.md` for optional live YouTube and account-based checks. Live-site results are manual evidence and should be recorded separately from deterministic fixture results. English and locale-dependent selectors can limit the visual-hiding checks.
