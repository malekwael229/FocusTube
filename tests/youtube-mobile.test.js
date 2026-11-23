#!/usr/bin/env node
// m.youtube.com (the layout Firefox for Android gets) Shorts rules, run in real
// Chromium against a reduced live capture. Extension APIs and the network are isolated.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fixture = read("tests/fixtures/feeds/ytm-mobile.html");
const catalog = JSON.parse(read("_locales/en/messages.json"));

const SHORTS = ["ytm-short-singleton", "ytm-grid-shelf", "tab-shorts", "ytm-reel-shelf", "ytm-shorts-section", "pivot-shorts"];
const KEPT = ["ytm-video", "tab-home", "tab-videos", "tab-live", "ytm-video-shelf", "ytm-empty-section", "pivot-home", "pivot-you"];
let checks = 0;

function matchPatternToRegExp(pattern) {
  const [, scheme, host, pathPart] = pattern.match(/^(\*|https?):\/\/([^/]+)(\/.*)$/);
  const schemeRe = scheme === "*" ? "https?" : scheme;
  const hostRe = host.startsWith("*.")
    ? `([^/]+\\.)?${host.slice(2).replace(/\./g, "\\.")}`
    : host.replace(/\./g, "\\.");
  const pathRe = pathPart.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${schemeRe}://${hostRe}${pathRe}$`);
}

function testManifestsCoverMobileYouTube() {
  for (const file of ["chrome-manifest.json", "firefox-manifest.json"]) {
    const manifest = JSON.parse(read(file));
    const entry = manifest.content_scripts.find((script) => script.js.includes("content-yt.js"));
    const matches = (url, patterns = []) => patterns.some((pattern) => matchPatternToRegExp(pattern).test(url));
    for (const url of ["https://m.youtube.com/", "https://m.youtube.com/shorts/abc", "https://m.youtube.com/@channel/shorts"]) {
      assert.ok(matches(url, entry.matches), `${file} injects into ${url}`);
      assert.ok(!matches(url, entry.exclude_matches), `${file} does not exclude ${url}`);
      checks += 2;
    }
    assert.ok(matches("https://music.youtube.com/", entry.exclude_matches), `${file} still excludes YouTube Music`);
    checks++;
  }
}

async function main() {
  testManifestsCoverMobileYouTube();
  const browser = await chromium.launch({ headless: true });
  try {
    async function open(pathname, settings = {}) {
      const context = await browser.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const requests = [];
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => {
        if (route.request().isNavigationRequest()) {
          return route.fulfill({ contentType: "text/html", body: `<!doctype html><body>${fixture}</body>` });
        }
        requests.push(route.request().url());
        return route.abort();
      });
      await page.addInitScript(({ settings, catalog }) => {
        const listeners = [];
        const data = { ...settings };
        window.chrome = {
          runtime: {
            id: "fixture-extension",
            getURL: (value) => "chrome-extension://fixture-extension/" + value,
            sendMessage: (_message, callback) => callback?.({}),
            onMessage: { addListener() {} },
          },
          i18n: { getMessage: (key) => catalog[key]?.message || "" },
          storage: {
            onChanged: { addListener: (listener) => listeners.push(listener) },
            local: {
              get: (keys, callback) => queueMicrotask(() => callback(Object.fromEntries(
                (Array.isArray(keys) ? keys : [keys]).filter((key) => key in data).map((key) => [key, data[key]]),
              ))),
              set: (values, callback) => { Object.assign(data, values); callback?.(); },
              remove: (key, callback) => { delete data[key]; callback?.(); },
            },
          },
        };
        window.changeSettings = (values) => {
          const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: data[key], newValue: value }]));
          Object.assign(data, values);
          listeners.forEach((listener) => listener(changes, "local"));
        };
      }, { settings, catalog });
      await page.goto(`https://m.youtube.com${pathname}`);
      await page.addStyleTag({ content: read("content.css") });
      for (const name of ["i18n.js", "content-common.js", "content-yt.js"]) {
        await page.addScriptTag({ content: read(name) });
      }
      await page.waitForFunction(() => window.__ftSettingsReady);
      await page.waitForTimeout(300);
      const hidden = (id) => page.evaluate((id) => getComputedStyle(document.getElementById(id)).display === "none", id);
      const expect = async (ids, expected, label) => {
        for (const id of ids) {
          assert.equal(await hidden(id), expected, `${label}: #${id} hidden=${expected}`);
          checks++;
        }
      };
      const change = async (values) => {
        await page.evaluate((values) => window.changeSettings(values), values);
        await page.waitForTimeout(250);
      };
      const close = async () => {
        assert.deepEqual(errors, [], "no runtime errors");
        assert.deepEqual(requests, [], "no runtime network requests");
        checks += 2;
        await context.close();
      };
      return { page, expect, change, close };
    }

    {
      const env = await open("/results?search_query=cats");
      await env.expect(SHORTS, true, "default settings");
      await env.expect(KEPT, false, "default settings");
      await env.change({ hide_yt_shorts_nav: false });
      await env.expect(["pivot-shorts"], false, "Shorts button setting off");
      await env.expect(SHORTS.filter((id) => id !== "pivot-shorts"), true, "Shorts button setting off");
      await env.change({ hide_yt_shorts_shelves: false });
      await env.expect(SHORTS, false, "both Shorts settings off");
      await env.change({ hide_yt_shorts_nav: true, hide_yt_shorts_shelves: true });
      await env.expect(SHORTS, true, "settings back on");
      await env.change({ focusMode: false });
      await env.expect(SHORTS, false, "Hide UI distractions off");
      await env.close();
    }

    {
      // Tapping into a Short is an in-app navigation that ends with
      // state-navigateend. Strict mode must send the user home.
      const env = await open("/results?search_query=cats");
      await env.page.evaluate(() => {
        history.pushState({}, "", "/shorts/fixture2");
        window.dispatchEvent(new Event("state-navigateend"));
      });
      await env.page.waitForURL("https://m.youtube.com/", { timeout: 4000 });
      checks++;
      await env.close();
    }

    {
      const env = await open("/results?search_query=cats", { platformSettings: { yt: "allow" } });
      await env.page.evaluate(() => {
        history.pushState({}, "", "/shorts/fixture2");
        window.dispatchEvent(new Event("state-navigateend"));
      });
      await env.page.waitForTimeout(1200);
      assert.equal(env.page.url(), "https://m.youtube.com/shorts/fixture2", "allow mode leaves the Short open");
      checks++;
      await env.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`PASS m.youtube.com Shorts rules (${checks} checks)`);
}

main().catch((error) => {
  console.error(`FAIL m.youtube.com Shorts rules: ${error.message}`);
  process.exitCode = 1;
});
