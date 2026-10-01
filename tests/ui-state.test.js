#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { exerciseVisualToggle } = require("./live/extension-checks");
const root = path.resolve(__dirname, "..");

async function main() {
  const buildIndex = process.argv.indexOf("--build-dir");
  const suppliedBuild = (buildIndex >= 0 && process.argv[buildIndex + 1]) || process.env.FOCUSTUBE_CHROMIUM_BUILD;
  if (!suppliedBuild) execFileSync(process.execPath, ["scripts/prepare-test-builds.js", ".tmp/ui-state-build"], { cwd: root, stdio: "inherit" });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "focustube-ui-state-"));
  const build = path.resolve(suppliedBuild || path.join(root, ".tmp/ui-state-build/chromium"));
  const context = await chromium.launchPersistentContext(profile, { headless: false, args: [`--disable-extensions-except=${build}`, `--load-extension=${build}`] });
  const failures = [];
  const errors = [];
  const check = async (name, action) => {
    try { await action(); console.log(`PASS ${name}`); }
    catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name}: ${error.message}`); }
  };
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const base = `chrome-extension://${new URL(worker.url()).host}`;
    const options = await context.newPage();
    options.on("pageerror", error => errors.push(error.message));
    await options.addInitScript(() => {
      window.uiListenerCount = 0;
      const add = chrome.storage.onChanged.addListener.bind(chrome.storage.onChanged);
      chrome.storage.onChanged.addListener = (...args) => { window.uiListenerCount++; return add(...args); };
    });
    await options.goto(`${base}/options.html`);
    const set = async values => { await options.evaluate(values => chrome.storage.local.set(values), values); await options.waitForTimeout(100); };
    const fresh = async () => {
      await set({ ft_enabled: true, ft_timer_end: null, ft_timer_type: "work", lockSettings: false, tutorialCompleted: true, reviewDismissed: true });
      await options.reload();
      await options.waitForTimeout(150);
    };
    const open = async () => {
      await options.locator('[data-platform="yt"]').click();
      await options.locator("#settingsToggles > .setting-row").first().waitFor();
      await options.waitForTimeout(100);
    };
    const toggle = () => options.locator("#settingsToggles input[type=checkbox]").first();
    await check("detail controls use one stable storage listener", async () => {
      await fresh();
      const count = await options.evaluate(() => window.uiListenerCount);
      for (let i = 0; i < 4; i++) {
        await open();
        assert.equal(await options.evaluate(() => window.uiListenerCount), count);
        await options.locator("#backBtn").click();
        await options.waitForTimeout(300);
      }
    });
    for (const type of ["work", "break"]) for (const lock of [false, true]) for (const enabled of [true, false]) {
      await check(`${type} lock=${lock} enabled=${enabled} policy`, async () => {
        await fresh(); await open();
        await set({ ft_timer_end: Date.now() + 600000, ft_timer_type: type, ft_enabled: enabled, lockSettings: lock });
        const disabled = !enabled || lock;
        assert.equal(await options.locator("#focusDuration").isDisabled(), disabled);
        assert.equal(await toggle().isDisabled(), disabled);
        assert.equal(await options.locator("#exportData").isDisabled(), false);
        assert.equal(await options.locator(".mode-btn").first().isDisabled(), true);
        const before = await options.evaluate(() => chrome.storage.local.get("hide_yt_shorts_nav"));
        if (disabled) { await toggle().evaluate(input => input.click()); assert.deepEqual(await options.evaluate(() => chrome.storage.local.get("hide_yt_shorts_nav")), before); }
      });
    }
    await check("native visual toggle Space and external storage synchronization", async () => {
      await fresh(); await open(); await set({ hide_yt_shorts_nav: true });
      await options.evaluate(() => {
        window.uiHideWrites = 0;
        chrome.storage.onChanged.addListener(changes => {
          if (changes.hide_yt_shorts_nav) window.uiHideWrites++;
        });
      });
      await toggle().focus(); await options.keyboard.press("Space"); await options.waitForTimeout(100);
      assert.equal(await toggle().isChecked(), false);
      assert.equal((await options.evaluate(() => chrome.storage.local.get("hide_yt_shorts_nav"))).hide_yt_shorts_nav, false);
      assert.equal(await options.evaluate(() => window.uiHideWrites), 1);
      assert.ok(await toggle().getAttribute("aria-labelledby"));
      await set({ hide_yt_shorts_nav: true }); assert.equal(await toggle().isChecked(), true);
      await options.evaluate(() => chrome.storage.local.remove("hide_yt_shorts_nav")); await options.waitForTimeout(100);
      assert.equal(await toggle().isChecked(), true);
    });
    await check("lockSettings reacts immediately and delayed reads cannot undo latest policy", async () => {
      await fresh(); await open(); await set({ ft_timer_end: Date.now() + 600000, lockSettings: false });
      await options.evaluate(() => {
        const original = chrome.storage.local.get.bind(chrome.storage.local);
        window.uiOriginalGet = original;
        chrome.storage.local.get = (keys, callback) => {
          if (Array.isArray(keys) && keys.includes("lockSettings") && window.uiDelayNextRead) {
            window.uiDelayNextRead = false;
            return original(keys, result => { window.uiPendingRead = () => callback(result); });
          }
          return original(keys, callback);
        };
        window.uiDelayNextRead = true;
        document.dispatchEvent(new Event("ft-settings-detail-rendered"));
      });
      await options.waitForFunction(() => Boolean(window.uiPendingRead));
      await set({ lockSettings: true }); assert.equal(await toggle().isDisabled(), true);
      await options.evaluate(() => { window.uiPendingRead(); chrome.storage.local.get = window.uiOriginalGet; });
      assert.equal(await toggle().isDisabled(), true);
      await set({ lockSettings: false }); assert.equal(await toggle().isDisabled(), false);
    });
    await check("delayed detail rendering uses latest visual setting and lock state", async () => {
      await fresh(); await set({ hide_yt_shorts_nav: true });
      await options.evaluate(() => {
        const original = chrome.storage.local.get.bind(chrome.storage.local);
        window.uiOriginalGet = original;
        chrome.storage.local.get = (keys, callback) => {
          if (Array.isArray(keys) && keys.includes("hide_yt_shorts_nav") && !window.uiPendingDetail) {
            return original(keys, result => { window.uiPendingDetail = () => callback(result); });
          }
          return original(keys, callback);
        };
      });
      await options.locator('[data-platform="yt"]').click();
      await options.waitForFunction(() => Boolean(window.uiPendingDetail));
      await set({ hide_yt_shorts_nav: false, ft_enabled: false });
      await options.evaluate(() => window.uiPendingDetail());
      await toggle().waitFor({ state: "attached" });
      await options.waitForFunction(() => document.querySelector("#hide_yt_shorts_nav")?.disabled === true);
      assert.equal(await toggle().isChecked(), false);
      await options.evaluate(() => { chrome.storage.local.get = window.uiOriginalGet; });
    });
    await check("new detail checkbox cannot write while lock reconciliation is pending", async () => {
      await fresh(); await set({ hide_yt_shorts_nav: true });
      await options.evaluate(() => {
        const original = chrome.storage.local.get.bind(chrome.storage.local);
        window.uiOriginalGet = original;
        chrome.storage.local.get = (keys, callback) => {
          if (Array.isArray(keys) && keys.includes("hide_yt_shorts_nav") && !window.uiPendingDetail) {
            return original(keys, result => { window.uiPendingDetail = () => callback(result); });
          }
          if (Array.isArray(keys) && keys.includes("lockSettings") && window.uiHoldNewPolicy) {
            window.uiHoldNewPolicy = false;
            return original(keys, result => { window.uiPendingPolicy = () => callback(result); });
          }
          return original(keys, callback);
        };
      });
      try {
        await options.locator('[data-platform="yt"]').click();
        await options.waitForFunction(() => Boolean(window.uiPendingDetail));
        await set({ ft_enabled: false });
        await options.evaluate(() => { window.uiHoldNewPolicy = true; window.uiPendingDetail(); });
        await options.waitForFunction(() => Boolean(window.uiPendingPolicy));
        await toggle().evaluate(input => input.click());
        const stored = await options.evaluate(() => chrome.storage.local.get("hide_yt_shorts_nav"));
        assert.equal(stored.hide_yt_shorts_nav, true, "new checkbox must not write before locked policy arrives");
        assert.equal(await toggle().isDisabled(), true);
      } finally {
        await options.evaluate(() => { window.uiPendingPolicy?.(); chrome.storage.local.get = window.uiOriginalGet; });
      }
    });
    for (const activation of ["native click", "Space"]) await check(`pending mode policy prevents ${activation} writes`, async () => {
      await fresh(); await set({ platformSettings: { yt: "strict" } });
      await options.evaluate(() => {
        const original = chrome.storage.local.get.bind(chrome.storage.local);
        window.uiOriginalGet = original;
        window.uiHeldPolicies = [];
        chrome.storage.local.get = (keys, callback) => {
          if (Array.isArray(keys) && keys.includes("lockSettings")) {
            return original(keys, result => window.uiHeldPolicies.push(() => callback(result)));
          }
          return original(keys, callback);
        };
      });
      const warn = options.locator('.mode-btn[data-mode="W"]');
      try {
        await open();
        await warn.evaluate(button => button.focus());
        await set({ ft_enabled: false });
        if (activation === "Space") await options.keyboard.press("Space");
        else await warn.evaluate(button => button.click());
        await options.waitForTimeout(100);
        assert.equal((await options.evaluate(() => chrome.storage.local.get("platformSettings"))).platformSettings.yt, "strict", "pending mode control cannot write while disabled");
        assert.equal(await warn.isDisabled(), true);
        await options.evaluate(() => {
          chrome.storage.local.get = window.uiOriginalGet;
          window.uiHeldPolicies.forEach(callback => callback());
          window.uiHeldPolicies = [];
        });
        assert.equal(await warn.isDisabled(), true);
        await set({ ft_enabled: true });
        assert.equal(await warn.isDisabled(), false, "single owner enables permitted controls after reconciliation");
        await warn.click(); await options.waitForTimeout(100);
        assert.equal((await options.evaluate(() => chrome.storage.local.get("platformSettings"))).platformSettings.yt, "warn");
      } finally {
        await options.evaluate(() => {
          chrome.storage.local.get = window.uiOriginalGet;
          window.uiHeldPolicies.forEach(callback => callback());
        });
      }
    });
    await check("native harness visual exercise checks real checkbox and reload persistence", async () => {
      await fresh(); await set({ hide_yt_shorts_nav: true }); await open();
      assert.deepEqual(await exerciseVisualToggle(options, "hide_yt_shorts_nav"), { before: true, after: false });
      await options.reload(); await options.waitForTimeout(150); await open();
      assert.equal(await toggle().isChecked(), false);
      assert.deepEqual(await exerciseVisualToggle(options, "hide_yt_shorts_nav"), { before: false, after: true });
    });
    const popup = await context.newPage();
    popup.on("pageerror", error => errors.push(error.message));
    for (const replacement of [undefined, { rd: "warn" }]) await check(`mode snapshots reset omitted keys ${JSON.stringify(replacement)}`, async () => {
      await fresh(); await set({ platformSettings: { yt: "allow", ig: "warn", tt: "allow", fb: "warn", li: "allow", rd: "warn" } });
      await popup.goto(`${base}/popup.html`); await popup.waitForTimeout(200); await open();
      await popup.locator('[data-platform="yt"]').click();
      await options.locator('.mode-btn[data-mode="P"]').focus();
      if (replacement) await set({ platformSettings: replacement });
      else { await options.evaluate(() => chrome.storage.local.remove("platformSettings")); await options.waitForTimeout(100); }
      assert.equal(await options.locator("#badge-yt").textContent(), "S");
      assert.equal(await popup.locator('[data-platform="yt"] .platform-mode-badge').textContent(), "S");
      assert.equal(await options.locator(".mode-btn.selected").getAttribute("data-mode"), "S");
      assert.equal(await popup.locator(".mode-option-detail.selected").getAttribute("data-value"), "strict");
      assert.equal(await options.locator('.mode-btn[data-mode="P"]').evaluate(input => document.activeElement === input), true);
      await popup.locator('[data-value="warn"]').click(); await options.waitForTimeout(150);
      assert.deepEqual((await options.evaluate(() => chrome.storage.local.get("platformSettings"))).platformSettings, { ...replacement, yt: "warn" });
    });
    await check("open popup statistics update across hour boundary and reset", async () => {
      await fresh(); await set({ ft_stats_blocked: 59 }); await popup.goto(`${base}/popup.html`); await popup.waitForTimeout(150);
      for (const value of [60, 61, 0]) {
        await set({ ft_stats_blocked: value });
        assert.equal(await popup.locator("#statShorts").textContent(), `${value} blocked`);
        assert.equal(await popup.locator("#statTime").textContent(), value === 60 ? "1h 0m saved" : value === 61 ? "1h 1m saved" : "0m saved");
      }
    });
    const dialogs = [];
    options.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    for (const value of [0, 77, null, "77", -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await check(`review snooze backup ${JSON.stringify(value)}`, async () => {
      await fresh(); await set({ reviewNextBlock: value });
      const downloaded = options.waitForEvent("download"); await options.locator("#exportData").click();
      const download = await downloaded;
      const file = path.join(profile, "backup.json"); await download.saveAs(file);
      await set({ reviewNextBlock: 999 }); const firstDialog = dialogs.length;
      await options.locator("#importFile").setInputFiles(file); await options.waitForTimeout(1200);
      const stored = (await options.evaluate(() => chrome.storage.local.get("reviewNextBlock"))).reviewNextBlock;
      const valid = value === null || value === 77 || value === 0;
      assert.equal(stored, valid ? value : 999);
      assert.ok(dialogs.slice(firstDialog).some(message => valid ? /successfully/i.test(message) : /invalid/i.test(message)));
    });
    assert.deepEqual(errors, [], "extension UI runtime errors");
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
    if (!suppliedBuild) fs.rmSync(path.join(root, ".tmp/ui-state-build"), { recursive: true, force: true });
  }
  assert.deepEqual(failures, [], "UI state regression failures");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
