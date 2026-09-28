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
    await page.route("https://www.reddit.com/**", (route) => route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><nav><a href="/search/">Search</a></nav><main><shreddit-feed style="color:red" aria-hidden="false"><a id="post" href="/r/test/comments/abc/post/">Post</a><video id="media"></video></shreddit-feed></main>',
    }));
    await page.addInitScript((messages) => {
      const data = { platformSettings: { yt: "warn" } };
      const listeners = [];
      window.chrome = {
        runtime: {
          id: "fixture-extension",
          getURL: (file) => `chrome-extension://fixture-extension/${file}`,
          sendMessage: (_message, callback) => callback?.({}),
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
    await wait(false);
    assert.equal((await state()).notice, 0, "feed toggle restores the container");
    await page.evaluate(() => window.changeSettings({ hide_rd_feed: true }));
    await wait(true);
    checks++;

    await page.evaluate(() => document.querySelector("main").appendChild(document.createElement("shreddit-feed")));
    await wait(false);
    assert.equal((await state()).notice, 0, "ambiguous feed markup fails open");
    await page.evaluate(() => document.querySelectorAll("shreddit-feed")[1].remove());
    await wait(true);
    checks++;

    const routes = [
      ["/", "home"], ["/best/", "home"], ["/r/popular/", "r/popular"],
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
    await page.locator(".ft-reddit-feed-notice button").click();
    await wait(false);
    assert.equal((await state()).notice, 0, "Warn reveal persists");
    await page.waitForTimeout(150);
    assert.equal((await state()).notice, 0, "mutation scan does not rehide revealed feed");
    checks += 3;

    await page.evaluate(() => window.changeSettings({ platformSettings: { rd: "strict" } }));
    await wait(true);
    assert.equal((await state()).reveal, false, "Strict revokes Warn reveal");
    await page.evaluate(() => window.changeSettings({ platformSettings: { rd: "warn" } }));
    await page.waitForFunction(() => Boolean(document.querySelector(".ft-reddit-feed-notice button")));
    checks += 2;

    await page.evaluate(() => history.pushState({}, "", "/r/other/"));
    await wait(true);
    assert.equal((await state()).reveal, true, "another community requires separate reveal");
    await page.evaluate(() => history.pushState({}, "", "/r/other/comments/abc/"));
    await wait(false);
    assert.equal((await state()).notice, 0, "post restores feed");
    await page.evaluate(() => history.pushState({}, "", "/r/other/"));
    await wait(true);
    checks += 3;

    await page.evaluate(() => window.changeSettings({ platformSettings: { rd: "allow" }, ft_timer_end: Date.now() + 60000, ft_timer_type: "work" }));
    await wait(true);
    assert.equal((await state()).reveal, false, "work timer forces Strict from Passive");
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
    checks += 8;

    assert.deepEqual(errors, [], "no content-script errors");
    checks++;
    await context.close();
  } finally {
    await browser.close();
  }
  console.log(`PASS ${checks} Reddit feed route and lifecycle assertions (${browserType.name()})`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
