"use strict";

const assert = require("node:assert/strict");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sites = {
  yt: { name: "YouTube", home: "https://www.youtube.com/", blocked: "https://www.youtube.com/shorts/", allowed: "https://www.youtube.com/", ready: "ytd-app", overlay: "#focus-tube-warning-overlay" },
  ig: { name: "Instagram", home: "https://www.instagram.com/", blocked: "https://www.instagram.com/reels/", allowed: "https://www.instagram.com/", ready: "main, [role=main]", overlay: "#focus-tube-warning-overlay" },
  tt: { name: "TikTok", home: "https://www.tiktok.com/", blocked: "https://www.tiktok.com/", allowed: "https://www.tiktok.com/settings", ready: "#app, #main-content-homepage, [data-e2e=recommend-list-item-container]", overlay: "#focus-tube-warning-overlay" },
  fb: { name: "Facebook", home: "https://www.facebook.com/", blocked: "https://www.facebook.com/reel/", allowed: "https://www.facebook.com/", ready: "[role=main]", overlay: "#focus-tube-warning-overlay" },
  li: { name: "LinkedIn", home: "https://www.linkedin.com/feed/", blocked: "https://www.linkedin.com/feed/", allowed: "https://www.linkedin.com/jobs/", ready: "[data-testid=mainFeed], main.scaffold-layout__main, #main-content", overlay: "#ft-linkedin-feed-overlay" },
};

const visualTargets = {
  yt: [
    { key: "hide_yt_shorts_nav", selector: 'ytd-guide-entry-renderer:has(a[href="/shorts/"]), ytd-mini-guide-entry-renderer:has(a[href="/shorts/"])' },
    { key: "hide_yt_shorts_shelves", selector: "ytd-rich-shelf-renderer[is-shorts], ytd-reel-shelf-renderer" },
    { key: "hide_yt_most_relevant_shelf", selector: "ytd-rich-shelf-renderer", route: "https://www.youtube.com/feed/subscriptions", text: "Most relevant" },
  ],
  ig: [
    { key: "hide_ig_stories", selector: 'ul._acay, [scrollable=true]:has([aria-label^="Story by"])', overlay: "#ft-ig-stories-overlay" },
    { key: "hide_ig_reels_nav", selector: 'nav a[href="/reels/"]' },
  ],
  tt: [],
  fb: [
    { key: "hide_fb_stories", selector: '[aria-label="Stories"]', overlay: "#ft-fb-stories-overlay" },
    { key: "hide_fb_reels_nav", selector: 'li:has(a[href="/reel/?s=tab"]), li:has(a[href="https://www.facebook.com/reel/?s=tab"])' },
    { key: "hide_fb_people_you_might_know", selector: '[role=main] h2, [role=main] h3, [role=main] [role=heading]', text: "People you may know", route: "https://www.facebook.com/friends/" },
  ],
  li: [
    { key: "hide_li_feed", selector: '[data-testid="mainFeed"], main.scaffold-layout__main, #main-content', overlay: "#ft-linkedin-feed-overlay" },
    { key: "hide_li_addfeed", selector: "aside h2, aside h3, aside [role=heading]", text: "Add to your feed", overlay: "#ft-linkedin-addfeed-overlay" },
  ],
};

function blocked(reason, category = "C") {
  const error = new Error(reason);
  error.code = "BLOCKED";
  error.category = category;
  return error;
}

async function settings(page, values) {
  return page.evaluate(async (items) => {
    const normalize = (value) => {
      if (Array.isArray(value)) return value.map(normalize);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, normalize(value[key])]),
      );
    };
    await new Promise((resolve, reject) => chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    }));
    const stored = await new Promise((resolve, reject) => chrome.storage.local.get(Object.keys(items), (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    }));
    for (const [key, expected] of Object.entries(items)) {
      if (JSON.stringify(normalize(stored[key])) !== JSON.stringify(normalize(expected))) {
        throw new Error("Settings write did not persist: " + key);
      }
    }
    return stored;
  }, values);
}

async function inspect(page, site) {
  const read = () => page.evaluate(({ ready, overlay }) => {
    const text = (document.body?.innerText || "").slice(0, 15000);
    const url = new URL(location.href);
    const challenge = /captcha|verify you are human|unusual traffic|security check|confirm you're human|access denied|something went wrong/i.test(text);
    const login = /\/accounts\/login|\/login|\/checkpoint|\/authwall|\/uas\//i.test(url.pathname) ||
      !!document.querySelector('input[type=password]') || /log in to continue|sign in to continue|join linkedin|log in to facebook/i.test(text);
    const network = /ERR_|server not found|you are offline|no internet|page isn't available/i.test(text);
    const visible = (node) => {
      if (!node) return false;
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight &&
        r.right > 0 && r.left < innerWidth && getComputedStyle(node).visibility !== "hidden";
    };
    const visibleMedia = (video) => {
      if (visible(video)) return true;
      let node = video.parentElement;
      for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
        const rect = node.getBoundingClientRect();
        if (visible(node) && rect.width >= 160 && rect.height >= 160) return true;
      }
      return false;
    };
    return { path: url.pathname, ready: !!document.querySelector(ready), challenge, login, network,
      overlay: visible(document.querySelector(overlay)), platformClasses: [...(document.body?.classList || [])].filter((c) => c.startsWith("ft-platform-")),
      visibleMain: [...document.querySelectorAll("main,[role=main],ytd-app")].some(visible),
      videos: [...document.querySelectorAll("video")].map((v) => ({ paused: v.paused, muted: v.muted, readyState: v.readyState, time: v.currentTime, visible: visibleMedia(v) })) };
  }, site);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (!/execution context was destroyed|navigation/i.test(error.message) || attempt === 2) throw error;
      await delay(300);
    }
  }
}

async function healthy(page, site) {
  await delay(1200);
  const state = await inspect(page, site);
  if (state.challenge) throw blocked("Site challenge or error page; no attempt to bypass it");
  if (state.login) throw blocked("Authentication required in this isolated profile");
  if (state.network) throw blocked("Site/network error page", "E");
  if (!state.ready) throw blocked("Live page landmark unavailable; locale/markup or rendering cannot be established", "B");
  return state;
}

async function poll(check, expected, timeout = 6000) {
  const end = Date.now() + timeout;
  let value;
  do { value = await check(); if (expected(value)) return value; await delay(250); } while (Date.now() < end);
  assert.ok(expected(value), "Expected state not observed: " + JSON.stringify(value));
}

async function clearWarning(page, overlay) {
  const found = await page.evaluate((selector) => {
    const root = document.querySelector(selector);
    const button = [...(root?.querySelectorAll("button") || [])].find((node) =>
      /^(?:Watch|View) Anyway$/.test(node.textContent?.trim() || ""),
    );
    if (!button) return false;
    button.dataset.ftValidationWatchAnyway = "true";
    return true;
  }, overlay);
  assert.equal(found, true, "Watch Anyway button is unavailable");
  await page.click('[data-ft-validation-watch-anyway="true"]');
}

function baseSettings(code, mode) {
  return { ft_enabled: true, focusMode: true, tutorialCompleted: true, reviewDismissed: true,
    showNotifications: false, ft_timer_end: null, ft_timer_type: null, ft_work_session_ended: false,
    platformSettings: { yt: "allow", ig: "allow", tt: "allow", fb: "allow", li: "allow", [code]: mode },
    ["popup_visible_" + code]: true, restrictHiddenPlatforms: false, visualHideHiddenPlatforms: false,
    hide_yt_shorts_nav: false, hide_yt_shorts_shelves: false, hide_yt_most_relevant_shelf: false,
    hide_ig_stories: false, hide_ig_reels_nav: false, hide_fb_stories: false,
    hide_fb_reels_nav: false, hide_fb_people_you_might_know: false,
    hide_li_feed: true, hide_li_addfeed: false };
}

async function runSiteChecks(session, report, { routes = {}, selectedSites = Object.keys(sites) } = {}) {
  let control = await session.newPage();
  await control.goto(session.extensionURL + "options.html");
  for (const code of selectedSites) {
    const site = { ...sites[code], ...routes[code] };
    let page = await session.newPage();
    const meta = (id, expected, mode = "allow", route = site.blocked, scope = "live-site") => ({ id: code + "." + id, site: site.name, route, mode, settings: baseSettings(code, mode), expected, scope });
    const navigation = ["enabled", "disabled", "platform-disabled", "strict.blocked", "strict.allowed", "warn", "watch-anyway", "warn.return", "warn.refresh", "passive.blocked", "passive.allowed", "back", "forward", "spa"];
    const baseline = await report.case(meta("baseline", "Real site loads without login/challenge", "allow", site.blocked), page, async () => {
      await settings(control, { ...baseSettings(code, "allow"), ft_enabled: false });
      await page.goto(site.blocked);
      return healthy(page, site);
    });
    if (!baseline) {
      for (const id of [...navigation, "reload-persistence", "restart-live", "media.pause", "media.resume", "media.native-controls", "timer-state", ...visualTargets[code].flatMap((t) => [t.key, t.key + ".dynamic"])]) {
        report.block(meta(id, "Live behavior verified"), "Blocked by live baseline: login, challenge, network or missing landmark; no fixture substituted", report.lastCategory || "C");
      }
      await page.close();
      continue;
    }

    async function modeTest(id, mode, route, expectedBlock) {
      return report.case(meta(id, expectedBlock ? "Block overlay or verified Strict redirect" : "Site accessible without blocking overlay", mode, route), page, async () => {
        await settings(control, baseSettings(code, mode));
        await page.goto(route);
        if (code === "tt" && route === site.allowed && !expectedBlock) {
          await delay(1200);
          const redirected = await inspect(page, site);
          if (redirected.overlay && !redirected.path.startsWith("/settings")) {
            throw blocked("TikTok redirected the logged-out safe route to a blockable feed", "C");
          }
        }
        if (expectedBlock && mode === "strict" && ["yt", "ig", "fb"].includes(code)) {
          const state = await poll(() => inspect(page, site), (s) => s.path === new URL(site.home).pathname || s.overlay);
          // A redirect alone is not proof: require the extension kick marker as attribution.
          const marker = await page.evaluate(() => sessionStorage.getItem("ft_kicked") || document.querySelector("#ft-kick-notification")?.textContent || "");
          if (!marker && !state.overlay) throw blocked("Redirect occurred, but extension attribution could not be established", "D");
          return { ...state, redirectAttributed: true };
        }
        await healthy(page, site);
        return poll(() => inspect(page, site), (s) => s.overlay === expectedBlock);
      });
    }
    await modeTest("passive.blocked", "allow", site.blocked, false);
    await modeTest("passive.allowed", "allow", site.allowed, false);
    await modeTest("strict.blocked", "strict", site.blocked, true);
    await modeTest("strict.allowed", "strict", site.allowed, false);
    const warned = await modeTest("warn", "warn", site.blocked, true);
    if (warned) {
      await report.case(meta("media.pause", "Every existing video is paused under warning", "warn"), page, async () => {
        const state = await inspect(page, site);
        if (!state.videos.length) throw blocked("No video mounted beneath warning; playback cannot be inspected", "D");
        await delay(750);
        assert.ok((await inspect(page, site)).videos.every((v) => v.paused), "Video plays beneath warning");
        return { videos: state.videos.length, paused: true };
      });
      await report.case(meta("watch-anyway", "Warning closes using its real button", "warn"), page, async () => {
        await delay(3200);
        await clearWarning(page, site.overlay);
        return poll(() => inspect(page, site), (s) => !s.overlay);
      });
      await report.case(meta("media.resume", "Exactly one playable visible video resumes; no hidden audio", "warn"), page, async () => {
        if (code === "li") {
          throw blocked("LinkedIn View Anyway reveals the feed but does not promise media autoplay", "D");
        }
        const state = await inspect(page, site);
        if (!state.videos.some((v) => v.readyState >= 2)) throw blocked("No playable media after warning; account/autoplay/media loading unresolved", "D");
        const playing = state.videos.filter((v) => !v.paused);
        assert.equal(playing.length, 1, "Expected one playing video");
        assert.ok(playing[0].visible, "Playing video is not visible");
        return { playing: playing.length, visible: true };
      });
      await report.case(meta("warn.refresh", "Refresh restores warning", "warn"), page, async () => {
        await page.reload(); await healthy(page, site);
        return poll(() => inspect(page, site), (s) => s.overlay);
      });
      await report.case(meta("warn.return", "Leaving then returning restores warning", "warn"), page, async () => {
        await delay(3200);
        await clearWarning(page, site.overlay);
        await page.goto(site.allowed); await healthy(page, site);
        await page.goto(site.blocked); await healthy(page, site);
        return poll(() => inspect(page, site), (s) => s.overlay);
      });
    } else {
      for (const id of ["watch-anyway", "warn.refresh", "warn.return", "media.pause", "media.resume"]) report.block(meta(id, "Warn lifecycle verified", "warn"), "Warn prerequisite failed", "D");
    }
    await report.case(meta("disabled", "Disabling clears overlay without navigation", "warn"), page, async () => {
      await settings(control, baseSettings(code, "warn"));
      await page.goto(site.blocked); await healthy(page, site);
      await poll(() => inspect(page, site), (s) => s.overlay);
      await settings(control, { ft_enabled: false });
      return poll(() => inspect(page, site), (s) => !s.overlay);
    });
    await report.case(meta("enabled", "Re-enabling restores enforcement", "warn"), page, async () => {
      await settings(control, baseSettings(code, "warn"));
      return poll(() => inspect(page, site), (s) => s.overlay);
    });
    await report.case(meta("platform-disabled", "Hidden unrestricted platform has no overlay", "warn"), page, async () => {
      await settings(control, { ["popup_visible_" + code]: false, restrictHiddenPlatforms: false, visualHideHiddenPlatforms: false });
      return poll(() => inspect(page, site), (s) => !s.overlay);
    });
    await report.case(meta("reload-persistence", "Warn mode survives a real tab reload", "warn"), page, async () => {
      await settings(control, baseSettings(code, "warn"));
      await page.goto(site.blocked); await healthy(page, site);
      await page.reload(); await healthy(page, site);
      return poll(() => inspect(page, site), (s) => s.overlay);
    });
    for (const direction of ["back", "forward"]) {
      await report.case(meta(direction, "History navigation retains correct route behavior", "allow"), page, async () => {
        await settings(control, baseSettings(code, "allow"));
        await page.goto(site.blocked); await healthy(page, site);
        await page.goto(site.allowed); await healthy(page, site);
        await page.back(); if (direction === "forward") await page.forward();
        const state = await healthy(page, site);
        assert.equal(state.overlay, false);
        return state;
      });
    }
    await report.case(meta("spa", "Real site link changes route without replacing document", "warn"), page, async () => {
      await settings(control, baseSettings(code, "warn"));
      await page.goto(site.allowed);
      const allowedState = await healthy(page, site);
      if (allowedState.overlay) {
        throw blocked("The site redirected the safe starting route to warned content", "C");
      }
      const selector = 'a[href="' + new URL(site.blocked).pathname + '"]';
      const present = await page.evaluate((s) => {
        const a = document.querySelector(s);
        if (!a || !a.getClientRects().length) return false;
        window.__ftValidationDocument = true;
        return true;
      }, selector);
      if (!present) throw blocked("No visible safe navigation link for this route; no synthetic history event substituted", "B");
      try {
        await page.click(selector);
      } catch (error) {
        if (!/not clickable|obscures/i.test(error.message)) throw error;
        throw blocked("The real SPA link is obscured in this layout; no synthetic click substituted", "B");
      }
      await healthy(page, site);
      if (!await page.evaluate(() => window.__ftValidationDocument === true)) throw blocked("Site performed a full document navigation, not SPA navigation", "D");
      return poll(() => inspect(page, site), (s) => s.overlay);
    });

    for (const target of visualTargets[code]) {
      await report.case(meta(target.key, "Real target is covered/hidden, restored, with unrelated navigation preserved", "strict", target.route || site.home), page, async () => {
        await settings(control, { ...baseSettings(code, "strict"), [target.key]: false });
        await page.goto(target.route || site.home); await healthy(page, site);
        const found = await page.evaluate((t) => {
          const elements = [...document.querySelectorAll(t.selector)];
          const el = elements.find((n) => (!t.text || n.textContent.includes(t.text)) && n.getClientRects().length);
          if (!el) return false;
          el.dataset.ftValidationTarget = t.key;
          const control = document.querySelector('input[type=search], input[name=q], [role=search], a[href="/"]');
          if (control?.getClientRects().length) control.dataset.ftValidationUnrelated = t.key;
          return true;
        }, target);
        if (!found) throw blocked("Expected target is absent in this live layout/account/locale; cannot prove hiding", "B");
        await settings(control, { [target.key]: true });
        await delay(1500);
        const hidden = await page.evaluate((t) => {
          const n = document.querySelector('[data-ft-validation-target="' + t.key + '"]');
          const overlay = t.overlay && document.querySelector(t.overlay);
          const unrelated = document.querySelector('[data-ft-validation-unrelated="' + t.key + '"]');
          return { found: !!n, hidden: !!n && !n.getClientRects().length, covered: !!overlay?.getClientRects().length,
            unrelatedFound: !!unrelated, unrelatedVisible: !!unrelated?.getClientRects().length,
            targetTag: n?.tagName || null, targetClasses: n?.className || null,
            targetDisplay: n ? getComputedStyle(n).display : null,
            parentTag: n?.parentElement?.tagName || null, parentDisplay: n?.parentElement ? getComputedStyle(n.parentElement).display : null,
            bodyClasses: [...(document.body?.classList || [])].filter((name) => name.startsWith("ft-") || name === "focus-mode-active") };
        }, target);
        if (!hidden.found) throw blocked("Site replaced marked target during check; no stable comparison", "B");
        assert.ok(hidden.hidden || hidden.covered, "Real target was neither hidden nor covered");
        if (hidden.unrelatedFound) assert.ok(hidden.unrelatedVisible, "Unrelated control hidden");
        await settings(control, { [target.key]: false }); await delay(1000);
        const restored = await page.evaluate((t) => !!document.querySelector('[data-ft-validation-target="' + t.key + '"]')?.getClientRects().length && !(t.overlay && document.querySelector(t.overlay)), target);
        assert.ok(restored, "Target not restored");
        if (!hidden.unrelatedFound) throw blocked("Target hides and restores, but no unrelated control was available for the preservation check", "B");
        return { ...hidden, restored, unrelatedProof: hidden.unrelatedFound ? "visible" : "not present, not proved" };
      });
      await report.case(meta(target.key + ".dynamic", "A naturally inserted target hides and restores after bounded scrolling", "strict", target.route || site.home), page, async () => {
        await settings(control, { ...baseSettings(code, "strict"), [target.key]: false });
        await page.goto(target.route || site.home); await healthy(page, site);
        await page.evaluate((t) => {
          window.__ftValidationInitialTargets = new WeakSet(document.querySelectorAll(t.selector));
        }, target);
        await settings(control, { [target.key]: true }); await delay(1000);
        let found = false;
        for (let attempt = 0; attempt < 3 && !found; attempt++) {
          await page.evaluate(() => window.scrollBy(0, 700));
          await delay(1500);
          found = await page.evaluate((t) => {
            const node = [...document.querySelectorAll(t.selector)].find((n) =>
              !window.__ftValidationInitialTargets.has(n) && (!t.text || n.textContent.includes(t.text)));
            if (node) node.dataset.ftValidationDynamic = t.key;
            return !!node;
          }, target);
        }
        if (!found) throw blocked("No new matching target appeared during three bounded scrolls; dynamic live insertion not proved", "D");
        await delay(1000);
        const hidden = await page.evaluate((t) => {
          const n = document.querySelector('[data-ft-validation-dynamic="' + t.key + '"]');
          return n ? !n.getClientRects().length || !!(t.overlay && document.querySelector(t.overlay)?.getClientRects().length) : null;
        }, target);
        if (hidden === null) throw blocked("Site recycled the late target before comparison", "B");
        assert.ok(hidden, "Late live target was not hidden or covered");
        await settings(control, { [target.key]: false }); await delay(1000);
        const restored = await page.evaluate((t) => !!document.querySelector('[data-ft-validation-dynamic="' + t.key + '"]')?.getClientRects().length, target);
        assert.ok(restored, "Late live target was not restored");
        return { naturallyInserted: true, hidden, restored };
      });
    }
    await report.case(meta("media.native-controls", "Native pause/play and mute/unmute controls still operate", "allow"), page, async () => {
      await settings(control, baseSettings(code, "allow"));
      await page.goto(site.blocked); await healthy(page, site);
      const target = await page.evaluate(() => {
        const video = [...document.querySelectorAll("video")].find((v) => {
          const r = v.getBoundingClientRect();
          return v.readyState >= 2 && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
        });
        if (!video) return null;
        video.dataset.ftValidationPlayer = "true";
        return { paused: video.paused, muted: video.muted };
      });
      if (!target) throw blocked("No loaded visible video for deterministic native control checks", "D");
      for (const property of ["paused", "muted"]) {
        const before = await page.evaluate((key) => document.querySelector("video[data-ft-validation-player]")?.[key], property);
        for (let toggle = 0; toggle < 2; toggle++) {
          const found = await page.evaluate(({ property }) => {
            const video = document.querySelector("video[data-ft-validation-player]");
            if (!video) return false;
            const region = video.closest('article, [role=article], ytd-reel-video-renderer, [data-e2e="recommend-list-item-container"]') || video.parentElement?.parentElement;
            if (!region) return false;
            const desired = property === "paused" ? (video.paused ? /^play(?: video)?$/i : /^pause(?: video)?$/i) :
              (video.muted ? /^(?:unmute(?: video)?|turn sound on|click to unmute)$/i : /^(?:mute(?: video)?|turn sound off|click to mute)$/i);
            const button = [...region.querySelectorAll('button, [role=button]')].find((b) =>
              desired.test(b.getAttribute("aria-label") || b.getAttribute("title") || "") && b.getClientRects().length);
            if (button) button.dataset.ftValidationMediaControl = "true";
            return !!button;
          }, { property });
          if (!found) throw blocked("A uniquely labelled native " + property + " control is unavailable; no guessed click", "B");
          await page.click('[data-ft-validation-media-control="true"]');
          await delay(650);
          const actual = await page.evaluate((key) => document.querySelector("video[data-ft-validation-player]")?.[key], property);
          assert.equal(actual, toggle === 0 ? !before : before, "Native control did not retain the requested state");
          await page.evaluate(() => document.querySelectorAll("[data-ft-validation-media-control]").forEach((n) => n.removeAttribute("data-ft-validation-media-control")));
        }
      }
      return { nativeControls: true, originalStateRestored: true };
    });
    await report.case(meta("timer-state", "A work timer enforces blocking even when this platform is Passive", "allow"), page, async () => {
      await settings(control, baseSettings(code, "allow"));
      const response = await control.evaluate(() => new Promise((resolve) => chrome.runtime.sendMessage({ action: "startTimer", duration: 1 }, resolve)));
      if (!response || response.error) throw new Error("Timer setup failed: " + JSON.stringify(response));
      try {
        await page.goto(site.blocked);
        const state = await poll(() => inspect(page, site), (s) => s.overlay || (["yt", "ig", "fb"].includes(code) && s.path === new URL(site.home).pathname));
        const attribution = await page.evaluate(() => document.body?.classList.contains("focus-mode-active") &&
          (!!document.querySelector("#focus-tube-warning-overlay,#ft-linkedin-feed-overlay,#ft-kick-notification") || !!sessionStorage.getItem("ft_kicked")));
        if (!attribution) throw blocked("Timer route response could not be attributed to FocusTube", "D");
        return { timerEnforced: true, state };
      } finally {
        await control.evaluate(() => new Promise((resolve) => chrome.runtime.sendMessage({ action: "stopTimer" }, resolve)));
      }
    });
    if (session.persistentExtension) {
      await settings(control, baseSettings(code, "warn"));
      await page.close(); await control.close();
      await session.restart();
      control = await session.newPage(); await control.goto(session.extensionURL + "options.html");
      page = await session.newPage();
      await report.case(meta("restart-live", "The same profile preserves mode, authentication, and enforcement after restart", "warn"), page, async () => {
        const mode = await control.evaluate(async (platform) => (await chrome.storage.local.get("platformSettings")).platformSettings?.[platform], code);
        assert.equal(mode, "warn");
        await page.goto(site.blocked); await healthy(page, site);
        return poll(() => inspect(page, site), (s) => s.overlay);
      });
    } else report.block(meta("restart-live", "Persistent extension and authenticated site enforce Warn after browser restart", "warn"), "Temporary/CLI extension installation does not prove persistent installed-browser restart", "D");
    await page.close();
  }
  await control.close();
}

module.exports = { runSiteChecks, sites, visualTargets, inspect, healthy };
