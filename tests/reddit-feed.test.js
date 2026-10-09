#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, firefox } = require("playwright");

const root = path.resolve(__dirname, "..");
const source = (name) => fs.readFileSync(path.join(root, name), "utf8");
const catalog = JSON.parse(source("_locales/en/messages.json"));

async function main() {
  const browserType = process.argv.includes("--firefox") ? firefox : chromium;
  const browser = await browserType.launch({ headless: true });
  let checks = 0;
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("https://www.reddit.com/**", (route) => route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><nav><a href="/search/">Search</a></nav><main><shreddit-feed style="color:red" aria-hidden="false"><a id="post" href="/r/test/comments/abc/post/">Post</a><video id="media"></video></shreddit-feed></main>',
    }));
    await context.addInitScript((messages) => {
      const data = location.search.includes("fresh-hidden")
        ? { restrictHiddenPlatforms: false, popup_visible_rd: false }
        : { platformSettings: { yt: "warn" } };
      const listeners = [];
      window.statMessages = [];
      window.chrome = {
        runtime: {
          id: "fixture-extension",
          getURL: (file) => `chrome-extension://fixture-extension/${file}`,
          sendMessage: (message, callback) => {
            if (message.action === "incrementStat") window.statMessages.push(message);
            callback?.({});
          },
          onMessage: { addListener() {} },
        },
        i18n: { getMessage: (key) => messages[key]?.message || "" },
        storage: {
          onChanged: { addListener: (listener) => listeners.push(listener) },
          local: {
            get: (keys, callback) => queueMicrotask(() => callback(Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]])))),
            set: (values, callback) => { Object.assign(data, values); callback?.(); },
            remove: (key) => { delete data[key]; },
          },
        },
      };
      window.changeSettings = (values) => {
        const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: data[key], newValue: value }]));
        Object.assign(data, values);
        listeners.forEach((listener) => listener(changes, "local"));
      };
    }, catalog);
    await page.goto("https://www.reddit.com/r/test/", { waitUntil: "domcontentloaded" });
    for (const file of ["i18n.js", "content-common.js", "content-rd.js"]) {
      await page.addScriptTag({ content: source(file) });
    }
    await page.addStyleTag({ content: source("content.css") });
    const state = () => page.evaluate(() => ({
      path: location.pathname,
      hidden: document.querySelector("shreddit-feed")?.style.display === "none",
      inert: document.querySelector("shreddit-feed")?.hasAttribute("inert"),
      notice: document.querySelectorAll(".ft-reddit-feed-notice").length,
      reveal: Boolean(document.querySelector(".ft-reddit-feed-notice button")),
      mode: CONFIG.platformSettings.rd,
      oldMode: CONFIG.platformSettings.yt,
    }));
    const wait = async (expected) => page.waitForFunction((want) => {
      const feed = document.querySelector("shreddit-feed");
      return Boolean(feed && (feed.style.display === "none") === want);
    }, expected);
    await wait(true);
    assert.deepEqual(await state(), { path: "/r/test/", hidden: true, inert: true, notice: 1, reveal: false, mode: "strict", oldMode: "warn" });
    checks++;
    const notice = page.locator(".ft-reddit-feed-notice");
    assert.equal(await notice.locator("h2").innerText(), catalog.redditFeedHidden.message);
    assert.equal(await notice.locator(".ft-reddit-notice-copy p").innerText(), catalog.redditFeedGuidance.message);
    assert.equal(await notice.locator(".ft-reddit-notice-mode").count(), 0);
    assert.equal(await notice.locator(".ft-reddit-notice-brand svg").count(), 1);
    assert.equal(await notice.locator("a").getAttribute("href"), "/search/");
    assert.equal(await notice.locator("button").count(), 0, "Strict has no reveal control");
    checks += 6;
    await page.setViewportSize({ width: 320, height: 650 });
    assert.equal(await notice.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true, "notice fits a narrow viewport");
    await notice.locator("a").focus();
    assert.notEqual(await notice.locator("a").evaluate((link) => getComputedStyle(link).outlineStyle), "none", "search has visible keyboard focus");
    await page.evaluate(() => window.changeSettings({ darkMode: false }));
    await page.waitForFunction(() => !document.querySelector(".ft-reddit-feed-notice")?.classList.contains("dark"));
    await page.evaluate(() => window.changeSettings({ darkMode: true }));
    await page.waitForFunction(() => document.querySelector(".ft-reddit-feed-notice")?.classList.contains("dark"));
    checks += 4;
    await page.setViewportSize({ width: 1200, height: 700 });
    await page.locator("main").evaluate((main) => { main.style.width = "320px"; });
    const narrowColumn = await notice.evaluate((element) => ({
      cardFits: element.scrollWidth <= element.clientWidth + 1,
      headingFits: element.querySelector("h2").scrollWidth <= element.querySelector("h2").clientWidth + 1,
      artHidden: getComputedStyle(element.querySelector(".ft-reddit-notice-visual")).display === "none",
    }));
    assert.deepEqual(narrowColumn, { cardFits: true, headingFits: true, artHidden: true }, "narrow desktop feed column uses compact layout");
    checks++;
    await page.locator("main").evaluate((main) => { main.style.width = ""; });
    await page.setViewportSize({ width: 900, height: 700 });

    await page.evaluate(() => {
      const prior = document.querySelector("shreddit-feed");
      window.priorRedditFeed = prior;
      const replacement = document.createElement("shreddit-feed");
      replacement.style.color = "red";
      replacement.setAttribute("aria-hidden", "false");
      replacement.innerHTML = '<a href="/r/test/comments/abc/post/">Post</a>';
      prior.replaceWith(replacement);
    });
    await page.waitForFunction(() => document.querySelector("shreddit-feed")?.style.display === "none" && window.priorRedditFeed.style.display === "");
    assert.equal(await page.evaluate(() => window.priorRedditFeed.style.display), "", "detached feed styles restored");
    assert.equal((await state()).notice, 1, "container replacement keeps one notice");
    checks += 2;

    await page.evaluate(() => window.changeSettings({ restrictHiddenPlatforms: false, popup_visible_rd: false }));
    await wait(false);
    await page.evaluate(() => window.changeSettings({ popup_visible_rd: true }));
    await wait(true);
    assert.equal((await state()).mode, "strict", "restored visibility keeps the saved mode");
    assert.equal((await state()).notice, 1, "restored visibility re-blocks the feed");
    checks += 2;

    const mediaResult = await page.evaluate(async () => {
      const feed = document.querySelector("shreddit-feed");
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      const canvas = document.createElement("canvas");
      video.srcObject = canvas.captureStream(5);
      feed.appendChild(video);
      let playEvents = 0;
      video.addEventListener("play", () => { playEvents++; });
      await video.play().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 650));
      const result = { playEvents, paused: video.paused, hidden: feed.style.display === "none" };
      video.srcObject.getTracks().forEach((track) => track.stop());
      video.remove();
      return result;
    });
    assert.ok(mediaResult.playEvents > 0, "hidden media attempted playback");
    assert.equal(mediaResult.paused, true, "late playback is paused while feed is hidden");
    assert.equal(mediaResult.hidden, true, "feed stays hidden after media activity");
    checks += 3;

    const shadowMediaResult = await page.evaluate(async () => {
      const player = document.createElement("shreddit-player");
      const shadow = player.attachShadow({ mode: "open" });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      canvas.getContext("2d").fillRect(0, 0, 16, 16);
      video.srcObject = canvas.captureStream(5);
      shadow.appendChild(video);
      document.querySelector("shreddit-feed").appendChild(player);
      let playEvents = 0;
      video.addEventListener("play", () => { playEvents++; });
      void video.play().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 650));
      const result = { playEvents, paused: video.paused };
      video.srcObject.getTracks().forEach((track) => track.stop());
      player.remove();
      return result;
    });
    assert.ok(shadowMediaResult.playEvents > 0, "shadow-root player attempted playback");
    assert.equal(shadowMediaResult.paused, true, "hidden shadow-root media is paused");
    checks += 2;

    const lateShadowResult = await page.evaluate(async () => {
      const player = document.createElement("shreddit-player");
      document.querySelector("shreddit-feed").appendChild(player);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const shadow = player.attachShadow({ mode: "open" });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      canvas.getContext("2d").fillRect(0, 0, 16, 16);
      video.srcObject = canvas.captureStream(5);
      shadow.appendChild(video);
      let playEvents = 0;
      video.addEventListener("play", () => { playEvents++; });
      void video.play().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 650));
      const result = { playEvents, paused: video.paused };
      video.srcObject.getTracks().forEach((track) => track.stop());
      player.remove();
      return result;
    });
    assert.ok(lateShadowResult.playEvents > 0, "late shadow-root media attempted playback");
    assert.equal(lateShadowResult.paused, true, "late shadow-root media is paused");
    await page.waitForFunction(() => Reddit.shadowObservers.size === 0 && Reddit.shadowMedia.size === 0);
    checks += 3;

    await page.evaluate(() => {
      const feed = document.querySelector("shreddit-feed");
      feed.style.display = "block";
      feed.removeAttribute("inert");
      feed.setAttribute("aria-hidden", "false");
    });
    await page.waitForFunction(() => {
      const feed = document.querySelector("shreddit-feed");
      return feed.style.display === "none" && feed.style.getPropertyPriority("display") === "important" &&
        feed.hasAttribute("inert") && feed.getAttribute("aria-hidden") === "true";
    });
    assert.equal((await state()).notice, 1, "site style changes do not duplicate the notice");
    checks++;

    await page.evaluate(() => window.changeSettings({ hide_rd_feed: false }));
    assert.equal((await state()).hidden, true, "old Reddit toggle values no longer override Strict mode");
    checks++;

    await page.evaluate(() => document.querySelector("main").appendChild(document.createElement("shreddit-feed")));
    await wait(false);
    assert.equal((await state()).notice, 0, "ambiguous feed markup fails open");
    await page.evaluate(() => document.querySelectorAll("shreddit-feed")[1].remove());
    await wait(true);
    checks++;

    await page.evaluate(() => {
      const feed = document.querySelector("shreddit-feed");
      window.delayedFeed = feed;
      feed.remove();
    });
    await page.waitForFunction(() => document.querySelectorAll(".ft-reddit-feed-notice").length === 0);
    await page.evaluate(() => {
      const feed = document.createElement("shreddit-feed");
      feed.style.color = "red";
      feed.setAttribute("aria-hidden", "false");
      feed.innerHTML = '<a href="/r/test/comments/abc/post/">Post</a>';
      document.querySelector("main").appendChild(feed);
    });
    await wait(true);
    assert.equal(await page.evaluate(() => window.delayedFeed.style.display), "", "removed feed is restored before replacement");
    assert.equal((await state()).notice, 1, "late feed arrival gets one notice");
    checks += 2;

    const routes = [
      ["/", "home"], ["/best/", "home"], ["/news/", "news"], ["/r/popular/", "r/popular"],
      ["/r/all/top/", "r/all"], ["/r/Test/new/", "r/test"],
      ["/r/test/comments/abc/post/", null], ["/comments/abc", null],
      ["/search/", null], ["/r/test/search/", null], ["/r/test/wiki/", null],
      ["/user/test/", null], ["/settings/", null], ["/r/test/unknown/", null],
    ];
    for (const [route, scope] of routes) {
      const actual = await page.evaluate((value) => Reddit.classifyRoute(value)?.scope || null, route);
      assert.equal(actual, scope, route);
      checks++;
    }
    await page.evaluate(() => window.changeSettings({ platformSettings: { yt: "warn", rd: "warn" } }));
    await page.waitForFunction(() => Boolean(document.querySelector(".ft-reddit-feed-notice button")));
    assert.equal((await state()).hidden, true);
    assert.equal(await notice.locator(".ft-reddit-notice-mode").count(), 0);
    assert.equal(await notice.locator("a").getAttribute("href"), "/search/");
    await page.locator(".ft-reddit-feed-notice button").click();
    await wait(false);
    assert.equal((await state()).notice, 0, "Warn reveal persists");
    await page.waitForTimeout(150);
    assert.equal((await state()).notice, 0, "mutation scan does not rehide revealed feed");
    checks += 5;

    await page.evaluate(() => window.changeSettings({ platformSettings: { rd: "strict" } }));
    await wait(true);
    assert.equal((await state()).reveal, false, "Strict revokes Warn reveal");
    await page.evaluate(() => window.changeSettings({ platformSettings: { rd: "warn" } }));
    await page.waitForFunction(() => Boolean(document.querySelector(".ft-reddit-feed-notice button")));
    checks += 2;

    const priorStats = await page.evaluate(() => window.statMessages.length);
    await page.evaluate(() => history.pushState({}, "", "/r/other/"));
    await page.waitForFunction(() => Reddit.route?.path === "/r/other" && document.querySelector("shreddit-feed")?.style.display === "none");
    assert.equal((await state()).reveal, true, "another community requires separate reveal");
    assert.equal(await page.evaluate(() => window.statMessages.length), priorStats + 1, "another blocked listing counts once");
    const transition = await page.evaluate(() => {
      history.pushState({}, "", "/news/");
      Reddit.apply();
      return {
        hidden: Reddit.isFeedHidden(),
        notice: document.querySelectorAll(".ft-reddit-feed-notice").length,
      };
    });
    assert.deepEqual(transition, { hidden: true, notice: 1 }, "old feed stays hidden while News replaces it");
    const overlapMedia = await page.evaluate(async () => {
      const old = document.querySelector("shreddit-feed");
      const next = document.createElement("shreddit-feed");
      next.setAttribute("data-feed", "news");
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      const canvas = document.createElement("canvas");
      video.srcObject = canvas.captureStream(5);
      let playEvents = 0;
      video.addEventListener("play", () => { playEvents++; });
      next.appendChild(video);
      old.after(next);
      await video.play().catch(() => {});
      Reddit.apply();
      window.overlapVideo = video;
      return { playEvents, paused: video.paused };
    });
    assert.ok(overlapMedia.playEvents > 0, "incoming feed video attempted playback");
    assert.equal(overlapMedia.paused, true, "incoming feed media is paused during overlap");
    assert.equal(await page.evaluate(() => Reddit.isFeedHidden()), true, "overlapping feeds do not expose the old listing");
    assert.equal(await page.locator('[data-feed="news"]').evaluate((feed) => getComputedStyle(feed).display), "none", "incoming feed stays hidden during overlap");
    await page.evaluate(() => window.overlapVideo.play().catch(() => {}));
    await page.waitForTimeout(3200);
    assert.equal(await page.evaluate(() => Reddit.isFeedHidden()), true, "overlap remains hidden through a render frame");
    assert.equal(await page.locator('[data-feed="news"]').evaluate((feed) => getComputedStyle(feed).display), "none", "incoming feed remains hidden through a render frame");
    assert.equal(await page.evaluate(() => window.overlapVideo.paused), true, "late incoming playback stays paused during a long overlap");
    await page.evaluate(() => window.overlapVideo.srcObject.getTracks().forEach((track) => track.stop()));
    await page.evaluate(() => document.querySelector("shreddit-feed:not([data-feed])").remove());
    await page.waitForFunction(() => document.querySelector('[data-feed="news"]')?.style.display === "none");
    assert.equal((await state()).notice, 1, "News listing is hidden without duplicate notices");
    const leaving = await page.evaluate(() => {
      history.pushState({}, "", "/r/other/comments/abc/");
      Reddit.apply();
      return Reddit.isFeedHidden();
    });
    assert.equal(leaving, true, "old listing stays hidden before a post replaces it");
    await page.evaluate(() => document.querySelector("shreddit-feed").remove());
    await page.waitForFunction(() => document.querySelectorAll(".ft-reddit-feed-notice").length === 0);
    await page.evaluate(() => {
      const post = document.createElement("article");
      post.id = "individual-post";
      post.textContent = "Individual post";
      document.querySelector("main").appendChild(post);
    });
    assert.equal(await page.locator("#individual-post").isVisible(), true, "post remains usable after transition");
    await page.evaluate(() => {
      document.querySelector("#individual-post").remove();
      document.querySelector("main").appendChild(document.createElement("shreddit-feed"));
      history.pushState({}, "", "/r/other/");
    });
    await wait(true);
    await page.evaluate(() => history.pushState({}, "", "/r/other/comments/abc/"));
    assert.equal((await state()).hidden, true, "post navigation does not flash the old listing");
    await page.evaluate(() => document.querySelector("shreddit-feed").remove());
    await page.waitForFunction(() => document.querySelectorAll(".ft-reddit-feed-notice").length === 0);
    await page.evaluate(() => {
      history.pushState({}, "", "/r/other/");
      document.querySelector("main").appendChild(document.createElement("shreddit-feed"));
    });
    await wait(true);
    await page.evaluate(() => {
      history.pushState({}, "", "/search/?q=focus");
      Reddit.apply();
    });
    assert.equal((await state()).hidden, true, "search navigation does not flash the old listing");
    await page.evaluate(() => document.querySelector("shreddit-feed").remove());
    await page.waitForFunction(() => document.querySelectorAll(".ft-reddit-feed-notice").length === 0);
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => location.pathname === "/r/other/");
    await page.evaluate(() => {
      const feed = document.createElement("shreddit-feed");
      feed.style.color = "red";
      feed.setAttribute("aria-hidden", "false");
      document.querySelector("main").appendChild(feed);
    });
    await wait(true);
    await page.evaluate(() => {
      history.pushState({}, "", "/search/?q=focus");
      Reddit.apply();
    });
    assert.equal((await state()).hidden, true, "old feed remains hidden while search navigation settles");
    await wait(false);
    assert.equal((await state()).notice, 0, "reused feed is restored after the bounded transition hold");
    await page.evaluate(() => history.pushState({}, "", "/r/other/"));
    await wait(true);
    await page.evaluate(() => {
      history.pushState({}, "", "/search/?q=focus");
      Reddit.apply();
      window.changeSettings({ visualHideHiddenPlatforms: false, popup_visible_rd: false });
    });
    await wait(false);
    assert.equal((await state()).notice, 0, "visual-hiding policy change releases an excluded-route hold");
    await page.evaluate(() => {
      window.changeSettings({ visualHideHiddenPlatforms: true, popup_visible_rd: true });
      history.pushState({}, "", "/r/other/");
    });
    await wait(true);
    checks += 20;

    await page.evaluate(() => window.changeSettings({ platformSettings: { rd: "allow" }, ft_timer_end: Date.now() + 1200, ft_timer_type: "work" }));
    await wait(true);
    assert.equal((await state()).reveal, false, "work timer forces Strict from Passive");
    assert.equal(await notice.locator(".ft-reddit-notice-mode").count(), 0, "work timer does not add a mode pill");
    await wait(false);
    assert.equal((await state()).notice, 0, "work timer expiry restores the feed without a storage event");
    await page.evaluate(() => window.changeSettings({ ft_timer_end: Date.now() + 60000, ft_timer_type: "work" }));
    await wait(true);
    await page.evaluate(() => window.changeSettings({ ft_timer_type: "break" }));
    await wait(false);
    await page.evaluate(() => window.changeSettings({ ft_timer_end: null, ft_timer_type: null }));
    await page.evaluate(() => window.changeSettings({ platformSettings: { rd: "strict" }, focusMode: false }));
    await wait(false);
    await page.evaluate(() => window.changeSettings({ focusMode: true, ft_enabled: false }));
    await wait(false);
    assert.equal((await state()).inert, false, "disable restores accessibility");
    assert.equal(await page.locator("shreddit-feed").getAttribute("aria-hidden"), "false", "disable restores original attribute");
    assert.equal(await page.locator("shreddit-feed").evaluate((feed) => feed.style.color), "red", "disable preserves original styles");
    assert.equal(await page.locator("nav a").isVisible(), true, "search navigation stays usable");
    checks += 10;

    assert.deepEqual(errors, [], "no content-script errors");
    checks++;
    const freshPage = await context.newPage();
    const freshErrors = [];
    freshPage.on("pageerror", (error) => freshErrors.push(error.message));
    await freshPage.goto("https://www.reddit.com/r/test/?fresh-hidden=1", { waitUntil: "domcontentloaded" });
    for (const file of ["i18n.js", "content-common.js", "content-rd.js"]) {
      await freshPage.addScriptTag({ content: source(file) });
    }
    await freshPage.waitForFunction(() => window.__ftSettingsReady === true);
    assert.equal(await freshPage.locator("shreddit-feed").evaluate((feed) => feed.style.display), "", "fresh hidden unrestricted Reddit remains visible");
    assert.equal(await freshPage.locator(".ft-reddit-feed-notice").count(), 0);
    assert.deepEqual(freshErrors, [], "fresh settings produce no content-script errors");
    checks += 3;
    await freshPage.close();
    await context.close();
  } finally {
    await browser.close();
  }
  console.log(`PASS ${checks} Reddit feed route and lifecycle assertions (${browserType.name()})`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
