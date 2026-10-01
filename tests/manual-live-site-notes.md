# Manual Live-Site Test Notes

These checks are intentionally not part of the required Playwright smoke test because they can require real accounts, location-specific UI, anti-bot checks, or changing third-party site markup.

## Optional Automated Check

YouTube Shorts can be checked with:

```powershell
npm run test:smoke:youtube
```

This uses a fresh isolated extension context, requires a real successful YouTube HTTP response and application root, then opens a real Shorts URL and expects FocusTube to move away from the Shorts path while strict/focus mode is active. Network/challenge failure blocks the live prerequisite; deterministic fixtures do not certify this optional check. Run it only when network access is available.

## Manual Account-Based Checks

YouTube:
- Where Playables is available, enable Hide Playables while Focus Mode is active and keep the break inactive while confirming its Home shelf and Explore navigation link disappear while ordinary video shelves stay visible. Turn the setting off and confirm both entry points return. Work mode forces direct-route blocking, while a break restores visual and route access. With Focus Mode active outside work, a direct Playables URL in Strict mode redirects Home, Warn shows an interstitial, and Passive allows the route.

Instagram:
- Log in manually.
- Confirm Reels/Explore paths are blocked in strict/focus mode.
- Confirm the Reels navigation button can be hidden.
- Confirm Stories hiding works.
- Confirm there is no "Hide Reels in Feed" setting.
- With an active work timer or Strict mode, open a real Reel from DMs that uses a `/p/<shortcode>/` URL. Confirm it is blocked, then verify ordinary photo, carousel, and non-Reel video `/p/` posts remain available.
- On the home feed, enable optional suggested/sponsored filtering. Check a detected post collapses without a visible row in Strict/work mode and has a compact View anyway row in Warn/Passive. Toggle the setting off and confirm restoration and media-pausing behavior; check ordinary or ambiguous posts remain visible.

TikTok:
- Log in manually if needed.
- Confirm feed/video pages are blocked in strict/focus mode.
- Confirm safer pages such as messages/settings are not unnecessarily broken.

Facebook:
- Log in manually.
- Confirm Reels paths are blocked in strict/focus mode.
- Confirm Reels navigation, Stories, and People You Might Know hiding still work where available.
- In Warn mode, choose Watch Anyway and confirm the current video resumes without audio from another hidden player.

Warn-mode media recovery:
- On YouTube Shorts, Instagram Reels, TikTok video pages, and Facebook Reels, choose Watch Anyway after the button becomes available.
- Confirm the interstitial disappears, the current visible player resumes when the site permits it, and no hidden or duplicate player produces audio.

LinkedIn:
- Log in manually.
- Confirm the main feed can be hidden.
- Confirm the "Add to your feed" sidebar card can be hidden.
- Enable the optional suggested/outside-network/promoted and network-activity filters separately. Check detected feed posts, View anyway where offered, setting-off restoration, and ordinary/ambiguous first-degree or followed posts that should remain visible.

Reddit:
- On `reddit.com` or `www.reddit.com`, with Focus Mode on outside a break, check current Home, `/news`, `/r/popular`, `/r/all`, and community routes. Strict mode and an active work timer hide the feed; Warn offers a page-local reveal; Passive and breaks leave it visible.
- Confirm navigation and search remain available, while individual posts and comments remain accessible. Turn Focus Mode off or disable the extension and confirm the feed restores; refresh and SPA navigation should restore it without a stale notice or hidden reused node. The legacy `old.reddit.com` interface is excluded. Fresh missing or ambiguous feed markup should fail open on initial load; during a blocked listing transition, an existing hidden feed or overlapping nodes remain held until one current feed is identifiable.

For any issue, record the browser, website, FocusTube mode, timer state, enabled setting, expected result, actual result, and a screenshot or short recording.
