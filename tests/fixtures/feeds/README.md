# Feed DOM fixtures

These reduced, sanitized captures preserve the header, identity, control, body,
and nested-post signals used by the feed adapters. Most files are reduced captures;
`ig-permalink-modal.html` is an authored permalink/modal fixture
for a detected Instagram Reel shape, not an added live capture. Capture dates and
reductions are recorded in each HTML fixture where known; the divider has no dated
capture metadata. They are offline examples, not evidence of current
authenticated-site behavior or universal language/markup support.

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

`ytm-mobile.html` is a reduced m.youtube.com capture from 2026-11-23, logged out,
with a Firefox for Android user agent at 360px. It merges search results, a channel
page and the bottom bar into one page. `tests/youtube-mobile.test.js` checks the
Shorts rules against it and the in-app `state-navigateend` route change. The home
feed Shorts section in it is authored from public filter lists, because the logged-out
home feed was empty at capture time. Run `npm run test:youtube-mobile`.
