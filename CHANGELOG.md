# Changelog

All notable project-facing changes are documented here.

## [Unreleased]

No unreleased changes yet.

## [2.3.2] - 2026-09-01

- Disabled Firefox private-window access so FocusTube does not persist data from private browsing sessions.

## [2.3.1] - 2026-09-01

- Hardened timer recovery across Chromium service-worker and Firefox background restarts. Future alarms are restored, stale alarms cannot affect replacement timers, failed writes roll back safely, and completion side effects are deduplicated.
- Improved popup, import, and content-script timer synchronization after partial storage changes or failed timer operations.
- Reduced repeated Instagram, TikTok, and Facebook DOM scans, cleaned up temporary observers, and narrowed Facebook Stories hiding so unrelated controls remain visible.
- Replaced content-page icon URL loads with an inline FocusTube badge so overlays survive extension reloads without invalid extension URLs.
- Limited Warn-mode media recovery to visible videos so an earlier Reel cannot resume as hidden audio.
- Kept timer durations numeric across browser restarts and aligned popup, options, overlay, and break-timer typography across Firefox and Chromium.
- Added a tracked, reproducible test harness, byte-reproducible Chromium and Firefox packages, Firefox validation, `TESTING.md`, and `ARCHITECTURE.md`.
- Added dated project-impact figures and a concise AI-assisted development disclosure.

Thanks to [@AlexanderMishutkin](https://github.com/AlexanderMishutkin) for reporting and contributing the inline badge fix in [#12](https://github.com/malekwael229/FocusTube/pull/12).

## [2.3.0] - 2026-08-04

- Added a separate YouTube setting to hide the English "Most relevant" shelf on the Subscriptions page, including late-loaded shelves.
- Tightened Facebook Strict and Warn blocking so it applies only to `/reel` and `/reels` routes; normal Facebook pages remain accessible.
- Replaced broad Facebook Reels-shelf hiding with targeted Reels navigation, Stories, and People You Might Know hiding.
- Added the Facebook Stories and People You Might Know controls to the popup and options page.
- Hardened Warn-mode media recovery so the interstitial pauses page media and resumes only one visible video after "Watch Anyway."
- Removed Facebook-specific automatic audio handling so Facebook's native mute controls remain authoritative after "Watch Anyway."
- Removed the YouTube Warn-mode play-all fallback that could restart hidden players after the overlay was dismissed.
- Hardened timer/stat lifecycle handling, import validation, tab messaging, and detached DOM tracking without adding permissions or telemetry.
- Added regression and browser smoke coverage for route boundaries, dynamic hiding, settings persistence, and media recovery.

## [2.2.0] - 2026-05-10

- Refined repository documentation for clearer cross-browser installation and privacy expectations.
- Added contributor, security, and store listing notes for project maintenance.
- Updated manifest icon metadata to use the existing icon sizes.
- Removed the unstable in-feed Instagram Reels hiding option while keeping Reels/Explore path blocking and Reels navigation hiding.
- Added explicit extension-page CSP declarations for Chromium and Firefox manifests.
- Split content script manifest entries so each supported site receives only the shared script and its own platform script.
- Removed the unused packaged `icons/icon.png` asset.
- Fixed TikTok warn mode so "Watch Anyway" opens the allow window before the overlay is removed.
- Kept TikTok warn allow windows page-local so a refresh shows the warning again.
- Restored audible TikTok playback after choosing "Watch Anyway."
- Added warn mode support for Instagram Reels and Explore pages.
- Kept Instagram warn mode allowed until page refresh after choosing "Watch Anyway."
- Resumed Instagram video playback where the page allows it after choosing "Watch Anyway."
- Fixed the popup mode picker so Instagram warn mode can be selected.
- Added a Facebook setting to hide Reels shelves in the feed.
- Improved Facebook Reels shelf hiding to target the full feed shelf/card.
- Guarded extension image URL lookups so stale content scripts do not throw after extension reloads.
- Centered popup menu toggle knobs.
