#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
function getOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const chromiumBuild = path.resolve(
  getOption("--build-dir") ||
    process.env.FOCUSTUBE_CHROMIUM_BUILD ||
    path.join(root, ".tmp", "test-builds", "chromium"),
);
const runYouTube = process.argv.includes("--youtube");
const keepOpen = process.argv.includes("--keep-open");

function pass(message) {
  console.log(`PASS ${message}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function requirePlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    console.error(
      [
        "Playwright is not installed.",
        "Run:",
        "  npm install",
        "  npm run test:smoke",
      ].join("\n"),
    );
    process.exit(1);
  }
}

function assertSameMembers(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

function assertNoText(source, pattern, label) {
  assert.doesNotMatch(source, pattern, label);
}

function assertPerPlatformContentScripts(manifest, label) {
  const expectedPlatformScripts = [
    ["*://*.youtube.com/*", "content-yt.js"],
    ["*://*.instagram.com/*", "content-ig.js"],
    ["*://*.tiktok.com/*", "content-tt.js"],
    ["*://*.facebook.com/*", "content-fb.js"],
    ["*://*.linkedin.com/*", "content-li.js"],
  ];

  assert.equal(
    manifest.content_scripts.length,
    expectedPlatformScripts.length,
    `${label} should have one content script entry per platform`,
  );

  expectedPlatformScripts.forEach(([match, platformScript]) => {
    const entry = manifest.content_scripts.find((script) =>
      script.matches.includes(match),
    );

    assert.ok(entry, `${label} missing content script entry for ${match}`);
    assert.deepEqual(entry.matches, [match], `${label} ${match} matches`);
    assert.deepEqual(entry.css, ["content.css"], `${label} ${match} css`);
    assert.deepEqual(
      entry.js,
      ["content-common.js", platformScript],
      `${label} ${match} js`,
    );
    assert.equal(entry.run_at, "document_start", `${label} ${match} run_at`);
  });
}

function verifyManifests() {
  const chromeManifest = readJson("chrome-manifest.json");
  const firefoxManifest = readJson("firefox-manifest.json");
  const buildManifestPath = path.join(chromiumBuild, "manifest.json");

  assert.ok(fs.existsSync(buildManifestPath), `${buildManifestPath} is missing`);
  const buildManifest = JSON.parse(fs.readFileSync(buildManifestPath, "utf8"));

  const expectedApiPermissions = ["storage", "alarms", "notifications"];
  const expectedHosts = [
    "*://*.youtube.com/*",
    "*://*.instagram.com/*",
    "*://*.tiktok.com/*",
    "*://*.facebook.com/*",
    "*://*.linkedin.com/*",
  ];

  assert.equal(chromeManifest.manifest_version, 3);
  assert.equal(chromeManifest.version, "2.3.2");
  assert.equal(buildManifest.version, "2.3.2");
  assert.equal(firefoxManifest.version, "2.3.2");
  assert.equal(buildManifest.manifest_version, 3);
  assert.equal(firefoxManifest.manifest_version, 2);
  assert.deepEqual(chromeManifest.content_security_policy, {
    extension_pages: "script-src 'self'; object-src 'self';",
  });
  assert.deepEqual(buildManifest.content_security_policy, {
    extension_pages: "script-src 'self'; object-src 'self';",
  });
  assert.equal(
    firefoxManifest.content_security_policy,
    "script-src 'self'; object-src 'self';",
  );
  assertSameMembers(
    chromeManifest.permissions,
    expectedApiPermissions,
    "Unexpected Chromium API permissions",
  );
  assertSameMembers(
    chromeManifest.host_permissions,
    expectedHosts,
    "Unexpected Chromium host permissions",
  );
  assertSameMembers(
    firefoxManifest.permissions,
    [...expectedApiPermissions, ...expectedHosts],
    "Unexpected Firefox permissions",
  );
  assertPerPlatformContentScripts(chromeManifest, "Chromium manifest");
  assertPerPlatformContentScripts(buildManifest, "Chromium test build manifest");
  assertPerPlatformContentScripts(firefoxManifest, "Firefox manifest");
  assertNoText(JSON.stringify(chromeManifest), /hide_ig_feed_reels/, "Chromium manifest has removed setting");
  assertNoText(JSON.stringify(firefoxManifest), /hide_ig_feed_reels/, "Firefox manifest has removed setting");
  pass("manifests parse and permission sets match expectations");
}

function runRegressionAssertions() {
  require(path.join(root, "tests", "regression.test.js"));
  pass("regression assertions pass");
}

async function getExtensionId(context) {
  let worker = context
    .serviceWorkers()
    .find((item) => item.url().startsWith("chrome-extension://"));

  if (!worker) {
    worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  }

  const url = new URL(worker.url());
  assert.equal(url.protocol, "chrome-extension:");
  assert.ok(url.host, `Could not resolve extension id from ${worker.url()}`);
  return url.host;
}

async function setStorage(page, values) {
  await page.evaluate(
    (items) =>
      new Promise((resolve) => {
        chrome.storage.local.set(items, resolve);
      }),
    values,
  );
}

async function getStorage(page, keys) {
  return page.evaluate(
    (storageKeys) =>
      new Promise((resolve) => {
        chrome.storage.local.get(storageKeys, resolve);
      }),
    keys,
  );
}

async function waitForStorageValue(page, key, expected) {
  await page.waitForFunction(
    ({ storageKey, expectedValue }) =>
      new Promise((resolve) => {
        chrome.storage.local.get([storageKey], (result) => {
          resolve(result[storageKey] === expectedValue);
        });
      }),
    { storageKey: key, expectedValue: expected },
    { timeout: 5000 },
  );
}

async function setCheckboxValue(page, selector, checked) {
  await page.evaluate(
    ({ inputSelector, nextChecked }) => {
      const input = document.querySelector(inputSelector);
      if (!input) throw new Error(`Missing checkbox: ${inputSelector}`);
      input.checked = nextChecked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { inputSelector: selector, nextChecked: checked },
  );
}

async function seedStorage(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await setStorage(page, {
    ft_enabled: true,
    focusMode: true,
    ft_timer_duration: 25,
    breakDuration: 5,
    autoStartBreaks: true,
    showBreakButton: true,
    showNotifications: true,
    tutorialCompleted: true,
    reviewDismissed: true,
    ft_stats_blocked: 0,
    platformSettings: {
      yt: "strict",
      ig: "strict",
      tt: "strict",
      fb: "strict",
      li: "strict",
    },
    hide_ig_stories: true,
    hide_ig_reels_nav: true,
  });
  await page.close();
}

async function openExtensionPage(context, extensionId, file) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${file}`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

async function assertControlsUsePageFont(page, label) {
  const fontAudit = await page.evaluate(() => {
    const pageFont = getComputedStyle(document.body).fontFamily;
    const controls = [...document.querySelectorAll("button, input, select, textarea")];

    return {
      pageFont,
      mismatches: controls
        .filter((control) => getComputedStyle(control).fontFamily !== pageFont)
        .map((control) => ({
          element: control.tagName.toLowerCase(),
          id: control.id,
          className: control.className,
          fontFamily: getComputedStyle(control).fontFamily,
        })),
    };
  });

  assert.deepEqual(
    fontAudit.mismatches,
    [],
    `${label} controls should inherit ${fontAudit.pageFont}`,
  );
}

async function verifyInlineBadge(
  page,
  containerSelector,
  badgeClass,
  { requireVisible = true } = {},
) {
  const container = page.locator(containerSelector);
  const badge = container.locator(`svg.${badgeClass}`);
  await badge.waitFor({
    state: requireVisible ? "visible" : "attached",
    timeout: 5000,
  });
  assert.equal(await container.locator("img").count(), 0);
  const shape = await badge.evaluate((svg) => ({
    hidden: svg.getAttribute("aria-hidden"),
    viewBox: svg.getAttribute("viewBox"),
    plate: Object.fromEntries(
      ["x", "y", "width", "height", "rx", "fill"].map((name) => [
        name,
        svg.querySelector("rect")?.getAttribute(name),
      ]),
    ),
    rings: [...svg.querySelectorAll("circle")].map((ring) => [
      ring.getAttribute("r"),
      ring.getAttribute("stroke-width"),
    ]),
    gradientIds: [...svg.querySelectorAll("linearGradient")].map((node) => node.id),
    stops: [...svg.querySelectorAll("stop")].map((stop) => [
      stop.getAttribute("offset"),
      stop.getAttribute("stop-color"),
    ]),
  }));
  assert.equal(shape.hidden, "true");
  assert.equal(shape.viewBox, "0 0 128 128");
  assert.equal(shape.gradientIds.length, 1);
  assert.deepEqual(shape.plate, {
    x: "9",
    y: "9",
    width: "110",
    height: "110",
    rx: "44",
    fill: `url(#${shape.gradientIds[0]})`,
  });
  assert.deepEqual(shape.rings, [
    ["6.35", "0.7"],
    ["11.2", "1.6"],
    ["17.8", "2.4"],
    ["27.45", "3.5"],
  ]);
  assert.deepEqual(shape.stops, [
    ["0%", "#0969db"],
    ["100%", "#06cecb"],
  ]);
}

async function verifyPopup(context, extensionId) {
  const page = await openExtensionPage(context, extensionId, "popup.html");

  await assertControlsUsePageFont(page, "Popup");

  for (const label of [
    "YouTube settings",
    "Instagram settings",
    "TikTok settings",
    "Facebook settings",
    "LinkedIn settings",
  ]) {
    await page.locator(`button[aria-label="${label}"]`).waitFor({
      state: "visible",
      timeout: 5000,
    });
  }

  await page.locator('button[data-platform="ig"]').click();
  await page.waitForFunction(
    () => !document.querySelector("#platform-detail")?.classList.contains("hidden"),
  );

  const popupText = await page.locator("body").innerText();
  assert.match(popupText, /Instagram/);
  assert.match(popupText, /Hide Stories/);
  assert.match(popupText, /Hide Reels Button/);
  assertNoText(popupText, /Hide Reels in Feed/, "Popup still shows removed Instagram feed setting");

  await page.locator("#backBtn").click();
  await page.waitForFunction(
    () => document.querySelector("#platform-detail")?.classList.contains("hidden"),
  );
  await page.locator('button[data-platform="yt"]').click();
  await page.waitForFunction(
    () => !document.querySelector("#platform-detail")?.classList.contains("hidden"),
  );
  const youtubePopupText = await page.locator("body").innerText();
  assert.match(youtubePopupText, /YouTube/);
  assert.match(youtubePopupText, /Hide Shorts Button/);
  assert.match(youtubePopupText, /Hide Shorts Shelves/);
  assert.match(youtubePopupText, /Hide "Most Relevant"/);

  await page.locator("#backBtn").click();
  await page.locator('button[data-platform="fb"]').click();
  await page.waitForFunction(
    () => !document.querySelector("#platform-detail")?.classList.contains("hidden"),
  );
  const facebookPopupText = await page.locator("body").innerText();
  assert.match(facebookPopupText, /Facebook/);
  assert.match(facebookPopupText, /Hide Stories/);
  assert.match(facebookPopupText, /Hide People You Might Know/);
  assertNoText(facebookPopupText, /Hide Reels Shelves/);

  await page.close();
  pass("popup loads and platform settings match expected controls");
}

async function verifyOptions(context, extensionId) {
  const page = await openExtensionPage(context, extensionId, "options.html");
  await assertControlsUsePageFont(page, "Options page");
  const bodyText = await page.locator("body").innerText();

  assert.match(bodyText, /Version 2\.3\.2/);
  assertNoText(bodyText, /1 minute \(testing only\)/, "Options still show temporary one-minute test option");
  assertNoText(bodyText, /play\s*sound/i, "Options still show sound option text");
  assert.equal(await page.locator("#playSound").count(), 0);
  await page.locator("#showNotifications").waitFor({ state: "attached" });
  assert.match(bodyText, /System Notifications/);

  await page.locator('button[data-platform="yt"]').click();
  await page.locator('[data-setting-key="hide_yt_most_relevant_shelf"]').waitFor({
    state: "visible",
    timeout: 5000,
  });
  const youtubeOptionsText = await page.locator("#visualHidingSection").innerText();
  assert.match(youtubeOptionsText, /Hide "Most Relevant" Shelf/);

  const mostRelevantToggle = page.locator(
    '[data-setting-key="hide_yt_most_relevant_shelf"]',
  );
  await mostRelevantToggle.click();
  await waitForStorageValue(page, "hide_yt_most_relevant_shelf", false);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.locator('button[data-platform="yt"]').click();
  await page.locator('[data-setting-key="hide_yt_most_relevant_shelf"]').waitFor({
    state: "visible",
    timeout: 5000,
  });
  assert.equal(
    await page
      .locator('[data-setting-key="hide_yt_most_relevant_shelf"]')
      .evaluate((toggle) => toggle.classList.contains("on")),
    false,
  );
  await page.locator('[data-setting-key="hide_yt_most_relevant_shelf"]').click();
  await waitForStorageValue(page, "hide_yt_most_relevant_shelf", true);

  await page.locator("#backBtn").click();
  await page.locator('button[data-platform="fb"]').click();
  await page.locator('[data-setting-key="hide_fb_stories"]').waitFor({
    state: "visible",
    timeout: 5000,
  });
  const facebookOptionsText = await page.locator("#visualHidingSection").innerText();
  assert.match(facebookOptionsText, /Hide Stories/);
  assert.match(facebookOptionsText, /Hide People You Might Know/);
  assertNoText(facebookOptionsText, /Hide Reels Shelves/);

  await setCheckboxValue(page, "#showNotifications", false);
  await waitForStorageValue(page, "showNotifications", false);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  assert.equal(
    await page.locator("#showNotifications").evaluate((input) => input.checked),
    false,
  );

  await setCheckboxValue(page, "#showNotifications", true);
  await waitForStorageValue(page, "showNotifications", true);

  await page.evaluate(() => {
    const select = document.querySelector("#focusDuration");
    select.value = "45";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitForStorageValue(page, "ft_timer_duration", 45);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  const duration = await page.locator("#focusDuration").evaluate((select) => select.value);
  assert.equal(duration, "45");

  await page.evaluate(() => {
    const select = document.querySelector("#focusDuration");
    select.value = "25";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitForStorageValue(page, "ft_timer_duration", 25);

  await page.close();
  pass("options page loads, removed options stay removed, and settings persist after reload");
}

async function verifyTimer(context, extensionId) {
  const page = await openExtensionPage(context, extensionId, "popup.html");
  const timerButton = page.locator("#timerBtn");

  const breakColors = await page.evaluate(() => {
    const timerDisplay = document.querySelector("#timerDisplay");
    const timerLabel = document.querySelector("#timerTypeLabel");
    const textColor = getComputedStyle(document.body).color;
    timerDisplay.classList.add("break");
    timerLabel.classList.add("break");

    return {
      textColor,
      displayColor: getComputedStyle(timerDisplay).color,
      labelColor: getComputedStyle(timerLabel).color,
    };
  });
  assert.equal(breakColors.displayColor, breakColors.textColor);
  assert.equal(breakColors.labelColor, breakColors.textColor);

  await timerButton.click();
  await page.waitForFunction(
    () => document.querySelector("#timerBtn")?.classList.contains("active"),
    null,
    { timeout: 5000 },
  );
  const activeTimer = await getStorage(page, ["ft_timer_end", "ft_timer_type"]);
  assert.equal(activeTimer.ft_timer_type, "work");
  assert.ok(activeTimer.ft_timer_end > Date.now());

  await timerButton.click();
  await page.waitForFunction(
    () => !document.querySelector("#timerBtn")?.classList.contains("active"),
    null,
    { timeout: 5000 },
  );
  assert.equal(await timerButton.innerText(), "Start Timer");
  const stoppedTimer = await getStorage(page, ["ft_timer_end", "ft_timer_type"]);
  assert.equal(stoppedTimer.ft_timer_end, undefined);

  await page.close();
  pass("timer UI can start and stop");
}

function youtubeFixtureHtml(title = "Most relevant") {
  return `<!doctype html>
<html>
  <head><title>FocusTube YouTube Fixture</title></head>
  <body>
    <ytd-rich-section-renderer id="target-shelf">
      <div id="title">${title}</div>
      <div>Fixture shelf content</div>
    </ytd-rich-section-renderer>
    <ytd-rich-section-renderer id="other-shelf">
      <div id="title">Recently uploaded</div>
      <div>Unrelated shelf content</div>
    </ytd-rich-section-renderer>
  </body>
</html>`;
}

function facebookFixtureHtml({ reelsPath = false, warnMedia = false } = {}) {
  return `<!doctype html>
<html>
  <head><title>FocusTube Facebook Fixture</title></head>
  <body>
    <nav><ul><li id="reels-nav"><a href="/reel/?s=tab" aria-label="Reels">Reels</a></li></ul></nav>
    <section id="stories" aria-label="Stories" style="position: relative; width: 640px; height: 180px"><button>Story</button></section>
    <aside id="people" data-pagelet="PeopleYouMayKnow"><h2>People You May Know</h2><div>Suggestion</div></aside>
    <section id="friends-page-people">
      <div class="x1xnnf8n">
        <div>Friends heading</div>
        <div>Friends content</div>
        <div id="structural-people">
          <h2>People you may know</h2>
          <a href="/friends/suggestions/">See all suggestions</a>
          <button aria-label="Add Friend Test User">Add friend</button>
        </div>
      </div>
    </section>
    <main id="main-content"><p>Normal Facebook content</p></main>
    ${reelsPath || warnMedia ? `<div id="visible-player" aria-label="Video player"><a id="visible-reel" href="/reel/warn"><video id="visible-video" style="width: 480px; height: 270px" autoplay muted></video></a><div data-instancekey="visible"><div role="group"><button id="fb-audio" aria-label="Toggle audio"><svg id="fb-audio-icon" aria-label="Audio is muted"></svg></button></div></div></div><video id="offscreen-video" style="position: fixed; top: -1000px; width: 900px; height: 500px" autoplay muted></video><video id="hidden-video" style="display: none" autoplay muted></video>` : ""}
    ${warnMedia ? `<script>
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      canvas.getContext("2d").fillRect(0, 0, 2, 2);
      const stream = canvas.captureStream(30);
      const visibleVideo = document.getElementById("visible-video");
      const offscreenVideo = document.getElementById("offscreen-video");
      const hiddenVideo = document.getElementById("hidden-video");
      const audioButton = document.getElementById("fb-audio");
      const audioIcon = document.getElementById("fb-audio-icon");
      visibleVideo.srcObject = stream;
      offscreenVideo.srcObject = stream;
      hiddenVideo.srcObject = stream;
      audioButton.addEventListener("click", () => {
        visibleVideo.muted = !visibleVideo.muted;
        audioIcon.setAttribute(
          "aria-label",
          visibleVideo.muted ? "Audio is muted" : "Audio is on",
        );
      });
      const syncMediaState = () => {
        visibleVideo.dataset.running = visibleVideo.paused ? "0" : "1";
        offscreenVideo.dataset.running = offscreenVideo.paused ? "0" : "1";
        hiddenVideo.dataset.running = hiddenVideo.paused ? "0" : "1";
      };
      setInterval(syncMediaState, 25);
      Promise.all([visibleVideo.play(), offscreenVideo.play(), hiddenVideo.play()]).then(syncMediaState).catch(syncMediaState);
    </script>` : ""}
  </body>
</html>`;
}

function instagramFixtureHtml({ warnMedia = false } = {}) {
  return `<!doctype html>
<html>
  <head><title>FocusTube Instagram Fixture</title></head>
  <body>
    <nav>
      <a id="ig-search" href="/explore/">Search</a>
      <a id="ig-reels" href="/reels/">Reels</a>
    </nav>
    ${warnMedia ? `<video id="ig-visible-video" style="width: 480px; height: 270px" autoplay muted></video><script>
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      canvas.getContext("2d").fillRect(0, 0, 2, 2);
      const stream = canvas.captureStream(30);
      const video = document.getElementById("ig-visible-video");
      video.srcObject = stream;
      const syncMediaState = () => {
        video.dataset.running = video.paused ? "0" : "1";
      };
      setInterval(syncMediaState, 25);
      video.play().then(syncMediaState).catch(syncMediaState);
    </script>` : ""}
  </body>
</html>`;
}

function linkedinFixtureHtml() {
  return `<!doctype html>
<html>
  <head><title>FocusTube LinkedIn Fixture</title></head>
  <body>
    <main id="main-content"><p>Normal LinkedIn feed</p></main>
    <aside id="unrelated-sidebar"><div>Unrelated sidebar content</div></aside>
    <div id="add-feed-card" class="_739dbf16 _1f3f3b6f">
      <div class="baa8df48"><p>Add to your feed</p><a href="/in/example/">Example profile</a></div>
    </div>
  </body>
</html>`;
}

function tiktokFixtureHtml() {
  return `<!doctype html>
<html>
  <head><title>FocusTube TikTok Fixture</title></head>
  <body><main id="tiktok-content">TikTok content</main></body>
</html>`;
}

async function verifyYouTubeMostRelevantRuntime(context, extensionId) {
  const settingsPage = await openExtensionPage(context, extensionId, "popup.html");
  await setStorage(settingsPage, {
    ft_enabled: true,
    focusMode: true,
    platformSettings: { yt: "strict" },
    hide_yt_most_relevant_shelf: true,
    hide_yt_shorts_nav: true,
    hide_yt_shorts_shelves: true,
  });

  await context.route(
    "https://www.youtube.com/feed/subscriptions**",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: youtubeFixtureHtml(),
      }),
  );
  await context.route("https://www.youtube.com/feed/trending**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: youtubeFixtureHtml(),
    }),
  );

  const page = await context.newPage();
  await page.goto("https://www.youtube.com/feed/subscriptions", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector("#target-shelf")).display === "none",
  );
  assert.notEqual(
    await page.locator("#other-shelf").evaluate((el) => getComputedStyle(el).display),
    "none",
  );

  await page.evaluate(() => {
    const shelf = document.createElement("ytd-rich-section-renderer");
    shelf.id = "late-shelf";
    const title = document.createElement("div");
    title.id = "title";
    title.textContent = "Most relevant";
    shelf.appendChild(title);
    document.body.appendChild(shelf);
  });
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector("#late-shelf")).display === "none",
  );

  await setStorage(settingsPage, { hide_yt_most_relevant_shelf: false });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("#target-shelf")).display !== "none" &&
      getComputedStyle(document.querySelector("#late-shelf")).display !== "none",
  );

  await setStorage(settingsPage, { hide_yt_most_relevant_shelf: true });
  await page.goto("https://www.youtube.com/feed/trending", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(500);
  assert.notEqual(
    await page.locator("#target-shelf").evaluate((el) => getComputedStyle(el).display),
    "none",
  );

  await page.close();
  await settingsPage.close();
  pass("YouTube Most Relevant shelf hiding works in a runtime subscriptions fixture");
}

async function verifyFacebookRuntime(context, extensionId) {
  const settingsPage = await openExtensionPage(context, extensionId, "popup.html");
  await setStorage(settingsPage, {
    ft_enabled: true,
    focusMode: true,
    platformSettings: { fb: "strict" },
    hide_fb_stories: true,
    hide_fb_reels_nav: true,
    hide_fb_people_you_might_know: true,
  });

  await context.route("https://www.facebook.com/**", (route) => {
    const url = new URL(route.request().url());
    const isReelsPath = /^\/(?:reel|reels)(?:\/|$)/.test(url.pathname);
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: facebookFixtureHtml({
        reelsPath: isReelsPath,
        warnMedia: url.pathname === "/reel/warn",
      }),
    });
  });

  const home = await context.newPage();
  await home.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
  await home.waitForFunction(
    () => document.querySelector("#reels-nav")?.style.display === "none",
  );
  await verifyInlineBadge(home, "#ft-fb-stories-overlay", "ft-stories-overlay-icon");
  assert.equal(await home.locator("#people").evaluate((el) => getComputedStyle(el).display), "none");
  assert.equal(
    await home.locator("#structural-people").evaluate((el) => getComputedStyle(el).display),
    "none",
  );
  assert.notEqual(
    await home.locator("#main-content").evaluate((el) => getComputedStyle(el).display),
    "none",
  );
  assert.equal(await home.locator("#focus-tube-warning-overlay").count(), 0);

  await setStorage(settingsPage, { hide_fb_people_you_might_know: false });
  await home.waitForFunction(
    () => getComputedStyle(document.querySelector("#people")).display !== "none",
  );

  const watch = await context.newPage();
  await watch.goto("https://www.facebook.com/watch/?v=123", {
    waitUntil: "domcontentloaded",
  });
  await watch.waitForTimeout(500);
  assert.equal(await watch.locator("#focus-tube-warning-overlay").count(), 0);
  await watch.close();

  const reels = await context.newPage();
  await reels.goto("https://www.facebook.com/reel/123", {
    waitUntil: "domcontentloaded",
  });
  await reels.locator("#focus-tube-warning-overlay").waitFor({ state: "visible" });
  await verifyInlineBadge(
    reels,
    "#focus-tube-warning-overlay",
    "focus-tube-icon-img",
  );
  await reels.close();
  await home.close();
  await settingsPage.close();
  pass("Facebook strict blocking stays on Reels paths and targeted hiding leaves normal pages intact");
}

async function verifyWarnSingleVideoRuntime(context, extensionId) {
  const settingsPage = await openExtensionPage(context, extensionId, "popup.html");
  await setStorage(settingsPage, {
    ft_enabled: true,
    focusMode: true,
    platformSettings: { fb: "warn" },
    hide_fb_stories: false,
    hide_fb_reels_nav: false,
    hide_fb_people_you_might_know: false,
  });
  const warnPage = await context.newPage();
  await warnPage.goto("https://www.facebook.com/reel/warn", {
    waitUntil: "domcontentloaded",
  });
  await warnPage.locator("#focus-tube-warning-overlay").waitFor({ state: "visible" });
  await warnPage.waitForTimeout(3200);
  await warnPage.getByRole("button", { name: "Watch Anyway" }).click();
  await warnPage.waitForFunction(
    () =>
      document.querySelector("#visible-video")?.dataset.running === "1" &&
      document.querySelector("#offscreen-video")?.dataset.running !== "1" &&
      document.querySelector("#hidden-video")?.dataset.running !== "1" &&
      document.querySelector("#visible-video")?.muted === true &&
      document.querySelector("#fb-audio-icon")?.getAttribute("aria-label")?.includes("muted"),
  );
  assert.equal(await warnPage.locator("#focus-tube-warning-overlay").count(), 0);

  await warnPage.locator("#fb-audio").click();
  await warnPage.waitForFunction(
    () =>
      document.querySelector("#visible-video")?.muted === false &&
      !document.querySelector("#fb-audio-icon")?.getAttribute("aria-label")?.includes("muted"),
  );

  await warnPage.locator("#fb-audio").click();
  await warnPage.waitForFunction(
    () =>
      document.querySelector("#visible-video")?.muted === true &&
      document.querySelector("#fb-audio-icon")?.getAttribute("aria-label")?.includes("muted"),
  );

  await warnPage.evaluate(() => {
    const currentVideo = document.querySelector("#visible-video");
    currentVideo.pause();
    document.body.appendChild(document.createElement("div"));
    window.dispatchEvent(new Event("scroll"));
  });
  await warnPage.waitForTimeout(300);
  assert.deepEqual(
    await warnPage.locator("#visible-video").evaluate((video) => ({
      paused: video.paused,
      muted: video.muted,
    })),
    { paused: true, muted: true },
  );

  await warnPage.evaluate(() => {
    const currentVideo = document.querySelector("#visible-video");
    const nextPlayer = document.createElement("div");
    nextPlayer.id = "next-player";
    nextPlayer.setAttribute("aria-label", "Video player");
    const nextVideo = document.createElement("video");
    nextVideo.id = "next-video";
    nextVideo.style.width = "480px";
    nextVideo.style.height = "270px";
    nextVideo.autoplay = true;
    nextVideo.muted = true;
    nextVideo.srcObject = currentVideo.srcObject;
    const nextButton = document.createElement("button");
    nextButton.id = "next-audio";
    nextButton.setAttribute("aria-label", "Toggle audio");
    const nextIcon = document.createElement("svg");
    nextIcon.id = "next-audio-icon";
    nextIcon.setAttribute("aria-label", "Audio is muted");
    nextButton.appendChild(nextIcon);
    nextButton.addEventListener("click", () => {
      nextVideo.muted = !nextVideo.muted;
      nextIcon.setAttribute(
        "aria-label",
        nextVideo.muted ? "Audio is muted" : "Audio is on",
      );
    });
    nextPlayer.append(nextVideo, nextButton);
    currentVideo.style.display = "none";
    document.body.appendChild(nextPlayer);
    nextVideo.play().catch(() => {});
  });
  await warnPage.waitForFunction(
    () =>
      document.querySelector("#next-video")?.muted === true &&
      document.querySelector("#next-video")?.paused === false &&
      document.querySelector("#next-audio-icon")?.getAttribute("aria-label")?.includes("muted"),
  );
  await warnPage.close();
  await settingsPage.close();
  pass("Facebook Watch Anyway preserves native mute state and controls");
}

async function verifyInstagramRuntime(context, extensionId) {
  const settingsPage = await openExtensionPage(context, extensionId, "popup.html");
  await setStorage(settingsPage, {
    ft_enabled: true,
    focusMode: true,
    platformSettings: { ig: "warn" },
    hide_ig_stories: false,
    hide_ig_reels_nav: true,
  });

  await context.route("https://www.instagram.com/**", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: instagramFixtureHtml({ warnMedia: url.pathname.startsWith("/reels/") }),
    });
  });

  const home = await context.newPage();
  await home.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded" });
  await home.waitForFunction(
    () => getComputedStyle(document.querySelector("#ig-reels")).display === "none",
  );
  assert.notEqual(
    await home.locator("#ig-search").evaluate((el) => getComputedStyle(el).display),
    "none",
  );
  await home.close();

  const reels = await context.newPage();
  await reels.goto("https://www.instagram.com/reels/warn", {
    waitUntil: "domcontentloaded",
  });
  await reels.locator("#focus-tube-warning-overlay").waitFor({ state: "visible" });
  await verifyInlineBadge(
    reels,
    "#focus-tube-warning-overlay",
    "focus-tube-icon-img",
  );
  await reels.waitForTimeout(3200);
  await reels.getByRole("button", { name: "Watch Anyway" }).click();
  await reels.waitForFunction(
    () =>
      document.querySelector("#ig-visible-video")?.dataset.running === "1" &&
      document.querySelector("#ig-visible-video")?.muted === false &&
      document.querySelector("#ig-visible-video")?.volume > 0,
  );
  assert.equal(await reels.locator("#focus-tube-warning-overlay").count(), 0);
  await reels.close();
  await settingsPage.close();
  pass("Instagram Reels nav hiding preserves Search and Watch Anyway restores audio");
}

async function verifyLocalizedTikTokRuntime(context, extensionId) {
  const settingsPage = await openExtensionPage(context, extensionId, "popup.html");
  await setStorage(settingsPage, {
    ft_enabled: true,
    focusMode: true,
    platformSettings: { tt: "strict" },
  });
  await context.route("https://www.tiktok.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: tiktokFixtureHtml(),
    }),
  );
  const page = await context.newPage();
  await page.goto("https://www.tiktok.com/fr", { waitUntil: "domcontentloaded" });
  await page.locator("#focus-tube-warning-overlay").waitFor({ state: "visible" });
  await page.close();
  await settingsPage.close();
  pass("TikTok strict blocking recognizes locale-prefixed routes");
}

async function verifyLinkedInRuntime(context, extensionId) {
  const settingsPage = await openExtensionPage(context, extensionId, "popup.html");
  await setStorage(settingsPage, {
    ft_enabled: true,
    focusMode: true,
    platformSettings: { li: "strict" },
    hide_li_feed: true,
    hide_li_addfeed: true,
  });
  await context.route("https://www.linkedin.com/feed**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: linkedinFixtureHtml(),
    }),
  );
  const page = await context.newPage();
  await page.goto("https://www.linkedin.com/feed", { waitUntil: "domcontentloaded" });
  await page.locator("#ft-linkedin-addfeed-overlay").waitFor({ state: "visible" });
  await verifyInlineBadge(
    page,
    "#ft-linkedin-addfeed-overlay",
    "ft-stories-overlay-icon",
  );
  await verifyInlineBadge(
    page,
    "#ft-linkedin-feed-overlay",
    "ft-linkedin-overlay-icon",
    { requireVisible: false },
  );
  const gradientIds = await page
    .locator('linearGradient[id^="ft-badge-gradient-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.id));
  assert.equal(new Set(gradientIds).size, gradientIds.length);
  assert.equal(await page.locator("#add-feed-card").count(), 1);
  await page.close();
  await settingsPage.close();
  pass("LinkedIn Add to your feed hiding finds the current card wrapper");
}

async function verifyYouTubeShortsRedirectFixture(context, extensionId) {
  const settingsPage = await openExtensionPage(context, extensionId, "popup.html");
  await setStorage(settingsPage, {
    ft_enabled: true,
    focusMode: true,
    platformSettings: { yt: "strict" },
  });
  await context.route("https://www.youtube.com/shorts/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body><a id="home-link" href="/">Home</a><script>
        document.getElementById("home-link").addEventListener("click", (event) => {
          event.preventDefault();
          history.replaceState({}, "", "/");
          document.getElementById("home-link").dataset.clicked = "1";
        });
      </script></body></html>`,
    }),
  );
  const page = await context.newPage();
  await page.goto("https://www.youtube.com/shorts/test", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => document.querySelector("#home-link")?.dataset.clicked === "1",
  );
  assert.equal(new URL(page.url()).pathname, "/");
  await page.close();
  await settingsPage.close();
  pass("YouTube Shorts strict mode prefers the in-app Home navigation");
}

async function verifyYouTubeShorts(context) {
  const page = await context.newPage();
  await page.goto("https://www.youtube.com/shorts/test", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForTimeout(3000);
  assertNoText(page.url(), /\/shorts\//, "YouTube Shorts path was not blocked or redirected");
  await page.close();
  pass("optional YouTube Shorts smoke check passed");
}

async function runBrowserSmoke() {
  assert.ok(
    fs.existsSync(chromiumBuild),
    `Missing Chromium test build folder: ${chromiumBuild}`,
  );

  const { chromium } = requirePlaywright();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "focustube-smoke-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${chromiumBuild}`,
      `--load-extension=${chromiumBuild}`,
      "--disable-default-apps",
      "--no-first-run",
    ],
  });

  try {
    const extensionId = await getExtensionId(context);
    assert.match(extensionId, /^[a-p]{32}$/);
    pass(`extension loaded with id ${extensionId}`);

    await seedStorage(context, extensionId);
    await verifyPopup(context, extensionId);
    await verifyOptions(context, extensionId);
    await verifyTimer(context, extensionId);
    await verifyFacebookRuntime(context, extensionId);
    await verifyWarnSingleVideoRuntime(context, extensionId);
    await verifyInstagramRuntime(context, extensionId);
    await verifyLocalizedTikTokRuntime(context, extensionId);
    await verifyLinkedInRuntime(context, extensionId);
    await verifyYouTubeShortsRedirectFixture(context, extensionId);
    await verifyYouTubeMostRelevantRuntime(context, extensionId);

    if (runYouTube) {
      await verifyYouTubeShorts(context);
    }
  } finally {
    if (keepOpen) {
      console.log("Browser left open because --keep-open was passed.");
    } else {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
}

async function main() {
  verifyManifests();
  runRegressionAssertions();
  await runBrowserSmoke();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
