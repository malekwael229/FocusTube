# Changelog

All notable project-facing changes are documented here.

## [Unreleased]

No unreleased changes yet.

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
