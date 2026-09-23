# Feed DOM fixtures

These reduced, sanitized captures preserve the header, identity, control, body,
and nested-post signals used by the feed adapters. Capture dates and reductions
are recorded in each HTML fixture where known; the divider has no dated capture
metadata. They are offline examples, not evidence of current authenticated-site
behavior or universal language/markup support.

`tests/feed-filters.test.js` loads the checked-in HTML fixtures in real Chromium with the
production i18n, shared content runtime, adapters, CSS, and MutationObserver.
Browser-extension APIs and network requests are isolated; individual permalink
cases also spy on navigation and media methods to verify decisions without leaving
the fixture page. The test makes explicit derivatives of captured markup to cover
labels, first-degree/following
state, unknown labels, caption/control/link-shim false positives, nested content,
and ambiguous controls. These derivatives are authored test cases, not additional
live captures.

Synthetic posts separately exercise settings, timer and SPA navigation changes,
late labels, recycled keys, site class resets, detach/reinsert, reveal state,
observer settling, and actual canvas-stream video playback/pause behavior.

Run `npm run test:feeds`. This requires the existing Playwright Chromium install;
it adds no DOM emulator or new dependency.
