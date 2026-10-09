# Testing

FocusTube uses deterministic Node tests, localization contract tests, a headful Chromium smoke runner, and Firefox package linting. The automated fixture tests do not replace live-site checks.

## Windows Setup

From PowerShell in the repository root:

```powershell
cd path\to\FocusTube
npm.cmd ci
npx.cmd playwright install chromium
```

The repository requires Node.js 20 or newer. The test dependencies are pinned in `package-lock.json`, including Playwright and `web-ext` 10.7.0.

On October 9, 2026, the production-only audit reports zero vulnerabilities. The full audit still reports the unpatched `node-forge` advisory [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), reached through development-only `web-ext` → `@devicefarmer/adbkit`. The affected signature-verification path belongs to Android ADB authentication, not FocusTube's build/lint commands or shipped extension. Keep this finding visible until upstream publishes a fix. Audit output is not suppressed.

The installed tooling tree fixes [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) with `source-map-js` 1.2.2 and [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) with `shell-quote` 1.11.0. A scoped override selects `fx-runner` 1.7.0 under `web-ext` 10.7.0; this upstream runner release updates the dependency without changing its runtime JavaScript. Remove the override when a compatible `web-ext` release includes that runner. The earlier `image-size` 2.0.4 fix remains in place.

## Automated Commands

The development-only `adm-zip` override pins 0.6.1 because it includes upstream fixes for extraction through destination symlinks and malformed ZIP data ([release notes](https://github.com/cthackers/adm-zip/releases/tag/v0.6.1), [advisory](https://github.com/advisories/GHSA-vwc7-r8mq-g2x9)). It is used by Firefox tooling and package-content checks and is not shipped inside the extension. No additional DOM-test dependency is required.

Run the complete local gate:

```powershell
npm.cmd run test:all
```

The aggregate runner creates fresh `.tmp/test-builds/chromium` and `.tmp/test-builds/firefox` packages, then runs JavaScript syntax checks, localization and website validation, package reproducibility, regression, tooling-security and generated property tests, background timer, live-harness unit, Instagram/LinkedIn feed-filter fixture, Reddit-feed fixture, Chromium UI-state and smoke, and Firefox lint checks. It removes the temporary packages after success or failure. Package reproducibility tests also rebuild generated files in `dist-release-builds` and `dist-test-builds` if those directories exist; keep any release artifacts you need to preserve outside these disposable local build directories.

Run individual checks when narrowing a failure:

```powershell
npm.cmd run test:regression
npm.cmd run test:security
npm.cmd run test:fuzz
npm.cmd run test:background
npm.cmd run test:package
npm.cmd run test:localization
npm.cmd run test:feeds
npm.cmd run test:live:harness
node tests/reddit-feed.test.js
node scripts/prepare-test-builds.js
node tests/ui-state.test.js --build-dir .tmp/test-builds/chromium
npm.cmd run test:smoke
node .\node_modules\web-ext\bin\web-ext.js lint --warnings-as-errors --source-dir .tmp\test-builds\firefox
```

The smoke runner is headful and requires an active desktop session. The optional live YouTube check requires network access:

```powershell
npm.cmd run test:smoke:youtube
```

## Automated Coverage

`test:security` exercises the dependency copies actually resolved by Firefox tooling. It checks that malicious indexed source-map offsets are rejected and that shell quoting rejects line terminators after comment tokens. The quoting test never executes a shell.

`test:fuzz` uses development-only `fast-check` to generate settings-import and hostname-classification cases against the real helpers extracted from `options.js` and `content-common.js`. It covers accepted values, malformed fields, timer pairs, prototype-looking keys, input immutability, re-importability, and lookalike hostnames. A test-only mutation confirms that an unsafe-integer regression is detected. Each property uses 500 cases with seed `20261009`; failures report a shrinking path. Replay a failure in PowerShell with the reported enclosing test name:

```powershell
$env:FC_SEED = "20261009"
$env:FC_PATH = "path reported by fast-check"
node --test --test-name-pattern="test name reported by the failure" tests/property-security.test.js
Remove-Item Env:FC_SEED, Env:FC_PATH
```

These bounded generated tests run in `test:all`; they are not continuous fuzzing, browser-runtime execution, or coverage measurements. Neither `fast-check` nor the other development dependencies is included in extension packages.

`test:feeds` runs sanitized Instagram/LinkedIn fixtures in Chromium with real DOM layout, mutation observers and content scripts, substituting only browser-extension APIs and site responses. It is included in `test:all`. Positive, negative, settings, timer, restoration, recycled-node and media cases exercise the opt-in filters. Requests are intercepted; these checks provide no evidence about a signed-in account or today's production site markup. Native-speaker review and authenticated cross-browser site checks remain manual release-review items.

`test:all` also runs `tests/reddit-feed.test.js`, a Chromium fixture check for Reddit feed-route classification, Strict/Warn/Passive behavior, work and break timers, SPA navigation without a feed flash, media pausing, and restoration. For the optional Firefox fixture run, install its browser with `npx.cmd playwright install firefox`, then run `node tests/reddit-feed.test.js --firefox`. This is a Playwright Firefox fixture run, not proof of behavior in an installed native Firefox browser. Current Home, News, Popular, and community pages were inspected in Brave and each exposed one `shreddit-feed` container; individual post pages did not. Fixture results and DOM inspection do not establish compatibility with every live Reddit route or browser.

The deterministic suites cover:

- Manifest parsing, permission and CSP checks, per-platform content-script splitting, icon metadata, and the package allowlist.
- Localization checks verify the canonical English catalog, referenced-key and placeholder integrity, all eight packaged catalogs, default English manifest fallback, script order, package inclusion, localized text and accessibility attributes, substitution parsing, safe fallback behavior, scoped host-page localization, resolved-catalog language and direction metadata for supported Arabic and unsupported Japanese/right-to-left browser locales, and stable internal storage keys and message types.
- Background initialization restores future alarms without consuming expired state. Explicit browser startup completes an overdue timer once when its primary alarm matches, regardless of startup and alarm event order, and otherwise cleans expired state silently. A primary alarm lookup failure preserves the timer and defers reconciliation, future-alarm recreation failure schedules bounded identity-safe recovery, and expired cleanup revalidates timer identity before removal. Stale or mismatched alarms have no side effects.
- Regression checks verify that `background.js` is the only timer-state mutation authority, `ft_enabled` mutations and timer mutations are requested through serialized background messages, operation-owned enable markers retire on same-value and no-event paths, external `ft_enabled=false` cleanup works without an enabled timer and removes timer state before alarm clear, partial `storage.onChanged` events do not reconstruct timers, and settings replacement is limited to extension-page senders validated by runtime ID and runtime URL origin.
- Background timer tests cover direct primary-alarm creation and scheduled-time verification for user timer writes, replacement starts, structured storage and alarm errors, MV3 cold-wake completion, external timer replacement races, stale and same-end different-type timer protection, storage read, storage remove, tabs query, completion-write failures, durable retry alarms bound to timer identity and attempt, the three-attempt retry limit, and exact durable completion claims that suppress duplicate notification, runtime, and tab effects across startup, alarm, retry, and fresh contexts.
- Settings replacement tests cover the prior timer and alarm snapshot, staged writes, rollback-safe storage and alarm failures without `storage.clear`, replacement rollback cleanup of a newly created alarm when storage rollback fails, alarm-clear failures that restore durable timer state and return transactional errors instead of success, and disabled replacement, stop, and disable cleanup that removes timer state before clearing the primary alarm. Work-to-break tests verify that alarm failures retry the new break identity while storage failures retry the still-durable work identity, and disable-during-completion tests verify that notification, extension-message, and tab-message side effects are suppressed.
- Popup regression checks verify that a failed stop re-reads durable timer end and type before repainting the timer and leaves the active display unchanged when that recovery read fails, while break start and dismiss failures reconcile the prompt from durable state. Background tests verify that `dismissEndedPrompt` returns a structured failure when marker removal fails, and import checks require a valid `ft_timer_end` and `ft_timer_type` pair. Content regression checks verify that a partial timer change re-reads both durable fields atomically before updating state or dispatching an event.
- Package tests validate safe output roots, remove only known generated FocusTube artifacts, preserve unrelated output, reject unsafe roots without touching sentinels, build Chromium and Firefox ZIPs twice, validate their contents and manifest versions, and compare their hashes byte for byte.
- One non-resetting pending mutation check for Instagram, TikTok, Facebook, and LinkedIn, including disable and re-enable lifecycle behavior. LinkedIn coverage also verifies that sustained mutations cannot starve its pending check.
- Selector and mutation regressions cover bounded LinkedIn feed and sidebar matching, targeted platform hiding, cleanup of pending checks when a platform is disabled, and bounded YouTube inline hiding for late-loaded surfaces. The broad YouTube body observer schedules an animation-frame pass without filtering individual mutation trees or running route checks; route enforcement is covered through navigation, settings-change, and lifecycle paths.
- Background message regressions verify that null, undefined, primitive, array, and invalid-JSON request shapes are rejected without breaking valid commands.
- Cleanup of the pre-body `ensureBody()` observer and scoped Facebook Stories selectors.
- Popup and options rendering, mode and visual-hiding settings, storage persistence after reload, timer start and stop, and removal of retired settings.
- Chromium fixture behavior for YouTube, Instagram, TikTok, Facebook, and LinkedIn, including route blocking, Warn-mode media recovery, late DOM content, SPA navigation events where covered, and platform-specific visual hiding.

The regression and package results above are automated test evidence only. They do not claim live-browser validation or a manual Firefox restart validation pass.

Injected failure coverage includes storage set, remove, and read failures; primary alarm creation failures and scheduled-time matching on successful writes; alarm-clear failures; retry alarm failures; startup alarm lookup and future-alarm recreation failures; completion retries; replacement rollback; stale identity protection; and popup recovery-read failures. The tests assert preserved state, transactional error reporting, identity-safe recovery, and no duplicate completion side effects where those paths apply.

## Localization Evidence

`tests/localization.test.js` uses mocked catalogs, DOM objects, and `chrome.i18n.getMessage` behavior. It provides deterministic contract coverage, not a native browser-runtime result.

The Chromium smoke suite loads the packaged extension with a native Arabic browser locale and verifies localized popup, options, and extension-owned overlay rendering, bounded right-to-left layout, accessibility labels, timer digits, and direction metadata. It also starts an unsupported native Japanese locale profile and verifies canonical English text with `lang="en"` and `dir="ltr"` on extension pages and extension-owned overlays while retaining separate proof of the browser's actual Japanese UI locale. The supported-site smoke checks still use local fixtures, including localized route text where relevant.

Firefox lint validates the staged Firefox package, including manifest and packaged-file rules. It does not execute Firefox localization or prove Firefox live-site behavior. A reviewer also checked the current native Arabic Chromium screenshots and found them readable with no obvious clipping. On September 9, 2026, a serial Windows `test:all` gate passed at commit `fa3d7ad`, including package reproducibility, the native Chromium Arabic bounded-rendering check, the unsupported Japanese locale profile's default-English fallback, and Firefox lint with zero errors, notices, or warnings. A pinned ESLint 9.39.5 check also passed at that commit. The September 6 earlier-tree pass remains part of the validation history but is superseded for the integrated repair tree. Native-speaker review, the manual browser matrix, live-site locale checks, and a native Firefox localization pass remain unperformed, so this evidence is not a complete live-site or cross-browser validation claim.

## Manual Browser Matrix

Run the following matrix in current Chrome, Edge, and Firefox. Record browser version, site and route, settings, expected result, actual result, and evidence for failures.

| Site | Chrome | Edge | Firefox |
| --- | --- | --- | --- |
| YouTube | [ ] | [ ] | [ ] |
| Instagram | [ ] | [ ] | [ ] |
| TikTok | [ ] | [ ] | [ ] |
| Facebook | [ ] | [ ] | [ ] |
| LinkedIn | [ ] | [ ] | [ ] |
| Reddit | [ ] | [ ] | [ ] |

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

The Playwright smoke suite uses local HTML fixtures served through route interception. These fixtures provide stable DOM and media cases for the established platforms; the separate Reddit fixture checks its new feed adapter. Neither suite proves compatibility with a site's current production markup, account state, locale, or anti-bot behavior. A fixture pass also does not prove Firefox live-site behavior.

Use [the optional live-browser harness](tests/live/README.md) and [manual live-site notes](tests/manual-live-site-notes.md) for account-based checks. Run the full deterministic gate before staging a retained candidate for live testing, because the package test rebuilds `dist-release-builds`. Live-site results are separate evidence from fixture results. English and locale-dependent selectors can limit visual-hiding checks.
