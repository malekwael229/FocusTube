# Architecture

FocusTube is a local browser extension. It has no project-controlled backend, analytics, telemetry, remote configuration, or remote code.

## Browser Manifests

The repository keeps one manifest per browser family:

| File | Browser model | Background entry |
| --- | --- | --- |
| `chrome-manifest.json` | Chromium Manifest V3 | Event-driven `background.js` service worker |
| `firefox-manifest.json` | Firefox Manifest V2 | `background.js` background script |

Both manifests declare `storage`, `alarms`, and `notifications`. They grant access only to the YouTube, Instagram, TikTok, Facebook, and LinkedIn host patterns used by the content scripts. Both use extension-page CSP that permits scripts from `self` only. Firefox also declares its extension ID, minimum Firefox version, and no required data collection.

The Chromium manifest uses `action`; the Firefox manifest uses `browser_action`. The Chromium manifest puts host patterns in `host_permissions`, while Firefox includes them in `permissions`. Both manifests provide the popup, options page, platform-specific content scripts, shared CSS, and the existing 16, 48, and 128 pixel icons.

## Build and Packaging

`scripts/prepare-test-builds.js` validates that the output root is a dedicated child of an approved repository build directory or an owned temporary directory. Before each build, it removes only known generated FocusTube directories, ZIPs, and `.web-ext-artifacts`; unrelated output remains untouched.

## Background Context

`background.js` owns privileged, browser-wide work:

- It records blocked-count increments in local storage.
- Operation-owned enable markers retire on every path, including same-value writes and no-event paths, so delayed external events are not misclassified as internal work.
- It is the only timer-state mutation authority. It owns focus and break timer state, including the absolute `ft_timer_end` timestamp and `ft_timer_type`.
- It serializes `ft_enabled` mutations and timer operations such as background initialization, browser-startup cleanup, timer start and stop, disable cleanup, alarm delivery, notifications, tab messages, and work-to-break transitions. Disable cleanup joins this lifecycle, rechecks the durable enabled state, suppresses completion side effects, and removes timer state before clearing the primary alarm. External `ft_enabled=false` cleanup does not require an enabled timer.
- User timer starts and settings replacement snapshot the existing timer fields and primary alarm before writing a replacement. They create the primary `focusTubeTimer` alarm directly after persisting the timer end and type. Alarm creation is verified across the supported browser API variants: the create callback must succeed, and when `chrome.alarms.get` is available the stored alarm must report the expected scheduled time. A create or verification failure restores the prior storage and alarm. Timer commands return structured errors when storage, alarm creation, or alarm clearing fails; alarm-clear failures propagate transactionally instead of reporting success. Alarm delivery validates both the alarm name and scheduled time against the current persisted timer before side effects.
- It sends `TIMER_COMPLETE` messages to the extension and matching supported-site tabs.
- If replacement storage rollback also fails and no prior alarm exists, recovery clears the newly created primary alarm. `stopTimer` restores durable timer state when primary alarm clearing fails instead of reporting success.
- Generic background or service-worker initialization restores an alarm only for a future persisted timer. It leaves an expired timer available for a matching alarm, so an MV3 cold wake can complete it instead of consuming it during initialization. If future-alarm recreation fails, it schedules bounded identity-safe recovery.
- Explicit browser startup performs a second reconciliation for expired timer state. Its deferred primary-alarm lookup revalidates the current timer identity (end and type), enabled state, and timer revision: when an enabled matching primary alarm exists, it completes the overdue timer once; otherwise it silently removes the expired state without completion side effects.
- Alarm handling owns completion. It validates the alarm, sends completion messages and notifications, then performs the work-to-break or timer-clear transition.
- Completion storage failures retain the current timer state and schedule up to three durable retry alarms. Retry names encode the expected timer identity and attempt, using `focusTubeTimerRetry:<encoded-end>:<encoded-type>:<attempt>` for completion retries. Retries skip notification, extension runtime, and tab messages after the initial attempt. An initial primary-alarm read failure defers reconciliation without a wildcard completion retry. Retry delivery validates both persisted end and type, so same-end different-type replacements and other stale retries cannot complete a replacement timer. Changes to `ft_timer_end` or `ft_timer_type` advance the timer revision and invalidate in-flight transitions.
- An exact durable completion claim keyed by timer end and type suppresses duplicate notification and message effects across startup, primary-alarm, retry, and fresh background contexts.
- Automatic work-to-break completion writes the new break identity before creating its primary alarm. A failed break write retries the still-durable work identity; an alarm failure after the break write retries the new break identity. User-initiated break starts use the timer transaction snapshot and restore the prior timer and alarm when the replacement fails.

Listeners register synchronously at the top level before startup reconciliation is queued. This matters for Chromium service-worker startup, where the background context can be suspended and started again.

## Content Scripts

Each supported host receives `content-common.js` followed by one adapter at `document_start`:

| Host | Adapter |
| --- | --- |
| YouTube | `content-yt.js` |
| Instagram | `content-ig.js` |
| TikTok | `content-tt.js` |
| Facebook | `content-fb.js` |
| LinkedIn | `content-li.js` |

The shared script defines site detection, configuration, focus and timer state, DOM utilities, media locking and recovery, overlays, local statistics messages, settings synchronization, and timer-completion handling. The adapter owns route rules and selectors for its site. Adapters add platform classes, apply blocking or Warn overlays, hide configured visual surfaces, and restore page state when disabled.

## DOM and SPA Behavior

Content scripts inspect and modify the site's DOM. They add classes, inject or remove extension overlays and styles, cache inline styles before hiding elements, and track media that must be paused while a warning is visible. The shared `ensureBody()` helper waits for `document.body` when scripts start before the body exists and tracks its temporary observer so disabling can disconnect it.

MutationObservers handle late-loaded page content. YouTube rechecks its DOM and inline hiding on mutations. Instagram, TikTok, and Facebook schedule one pending mutation check per burst without resetting the delay, so sustained mutations cannot postpone a check indefinitely. LinkedIn uses a delayed check. Platform observers and pending timers are cleaned up when a platform or the extension is disabled.

SPA navigation is handled through `popstate`, site-specific navigation events where available, route checks, settings-change events, and mutation-triggered scans. This lets the extension respond when the document remains loaded while the URL or page content changes.

## Storage, Alarms, and Messaging

`chrome.storage.local` is the durable source of truth for extension settings, platform modes, visual-hiding toggles, popup visibility, timer state, notification preference, and local blocked-count statistics. Popup, options, background, and content scripts read or react to the same storage area, but only `background.js` mutates timer-state keys. Popup, options, and content scripts request timer mutations through serialized runtime messages handled by the background context. Partial `storage.onChanged` events are not reconstructed into timer state or alarms; timer identity is read from storage before timer side effects.

The popup starts and stops timers by sending runtime messages to the background context. A failed popup stop does not show a false stopped state; it re-reads the durable timer end and type and repaints an active timer when one remains. If that recovery read fails, it leaves the current active display unchanged. Popup break start waits for a successful response and rereads durable timer state after failure; dismiss waits for a successful response and rereads the durable ended-session marker after failure. `dismissEndedPrompt` returns a structured failure when marker removal fails. Options import and Clear All Data use the `replaceSettings` message; the background accepts it only from a sender whose runtime ID matches `chrome.runtime.id` and whose URL starts with the `chrome.runtime.getURL("")` origin, including Firefox `moz-extension://` pages. Import validation requires `ft_timer_end` and `ft_timer_type` together, with `work` or `break` as the timer type. Replacement stages existing-key writes, obsolete-key removal, and introduced-key writes, and restores the previous storage and primary alarm on failure without using `storage.clear`. A disabled replacement removes timer state before the primary alarm is cleared, and stop and disable operations use the same ordering. The popup derives its display from the stored timestamp, so closing the popup does not stop the timer. Only a matching enabled timer alarm completes a timer: the background optionally creates a browser notification, sends `TIMER_COMPLETE` to extension listeners and supported-site tabs, then transitions from work to break or clears the completed break. Content scripts show the corresponding local toast and update blocking state from storage. When either timer field changes, content scripts re-read `ft_timer_end` and `ft_timer_type` together before updating `CONFIG.timer` or dispatching the settings-change event.

## Privacy Boundary

The extension runs its logic in the browser. It does not send settings, browsing activity, or statistics to a project-controlled server. Site access is used by content scripts to inspect and modify supported pages. Settings, timer state, and simple blocked-count statistics remain in browser-local storage. The only external links exposed by extension pages are user-opened project or store links.

## MV2 and MV3 Differences

Chromium uses a Manifest V3 service worker, so its background context may be suspended between events. Generic service-worker initialization restores future alarms without clearing expired state; a matching alarm can therefore complete a timer after a cold wake. Explicit browser startup checks the primary alarm against an overdue persisted timer: with a matching enabled alarm, completion occurs once regardless of whether startup or alarm delivery arrives first; without a matching alarm, expired state is cleaned silently without completion side effects. Firefox currently uses Manifest V2 with a background script and does not preserve alarms across browser restart, so restart recovery also depends on startup reconciliation.

The code keeps callback-based `chrome.*` APIs for cross-browser compatibility. The browser-specific boundary is intentionally limited to manifest shape and background lifecycle; the popup, options page, shared content logic, platform adapters, storage keys, and message contracts are shared.
