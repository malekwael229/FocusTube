# Manual Live-Site Test Notes

These checks are intentionally not part of the required Playwright smoke test because they can require real accounts, location-specific UI, anti-bot checks, or changing third-party site markup.

## Optional Automated Check

YouTube Shorts can be checked with:

```powershell
npm run test:smoke:youtube
```

This opens a real YouTube Shorts URL and expects FocusTube to move away from the Shorts path while strict/focus mode is active. Run it only when network access is available.

## Manual Account-Based Checks

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

For any issue, record the browser, website, FocusTube mode, timer state, enabled setting, expected result, actual result, and a screenshot or short recording.
