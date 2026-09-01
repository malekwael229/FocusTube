const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PLATFORMS = ["yt", "ig", "tt", "fb", "li"];
const MODES = ["strict", "warn", "allow"];
const VISUAL_KEYS = {
  yt: ["hide_yt_shorts_nav", "hide_yt_shorts_shelves", "hide_yt_most_relevant_shelf"],
  ig: ["hide_ig_stories", "hide_ig_reels_nav"],
  tt: [],
  fb: ["hide_fb_stories", "hide_fb_reels_nav", "hide_fb_people_you_might_know"],
  li: ["hide_li_feed", "hide_li_addfeed"],
};
const DEFAULT_SETTINGS = {
  ft_enabled: true, ft_timer_duration: 25, breakDuration: 5, autoStartBreaks: true,
  focusMode: true, lockSettings: false, showNotifications: false, darkMode: true,
  ft_stats_blocked: 0, popup_visible_yt: true, popup_visible_ig: true,
  popup_visible_tt: true, popup_visible_fb: true, popup_visible_li: true,
  restrictHiddenPlatforms: true, visualHideHiddenPlatforms: true,
  hide_ig_stories: true, hide_fb_stories: true, hide_yt_shorts_nav: true,
  hide_yt_shorts_shelves: true, hide_yt_most_relevant_shelf: true,
  hide_ig_reels_nav: true, hide_fb_reels_nav: true,
  hide_fb_people_you_might_know: true, hide_li_feed: true, hide_li_addfeed: true,
  showBreakButton: true, accentColor: "#4facfe", tutorialCompleted: true,
  ft_timer_end: null, ft_timer_type: null, ft_work_session_ended: false,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extensionUrl(session, route) {
  return `${session.extensionURL}${route}`;
}

function categoryError(message, category) {
  const error = new Error(message);
  error.category = category;
  return error;
}

async function storage(page, method, value) {
  return page.evaluate(async ({ method, value }) => {
    if (method === "get") {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(value, (result) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(result);
        });
      });
    }
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(value, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(true);
      });
    });
  }, { method, value });
}

async function replaceSettings(page, settings) {
  return page.evaluate((settings) => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "replaceSettings", settings }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  }), settings);
}

async function seed(page, overrides = {}) {
  const response = await replaceSettings(page, { ...DEFAULT_SETTINGS, ...overrides });
  assert.equal(response.replaced, true, "deterministic extension baseline replacement failed");
  return response;
}

async function readDom(page, selector, property) {
  return page.evaluate(({ selector, property }) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    if (property === "checked") return node.checked;
    if (property === "disabled") return node.disabled;
    if (property === "value") return node.value;
    if (property === "text") return node.textContent.trim();
    if (property === "display") return getComputedStyle(node).display;
    return node.className;
  }, { selector, property });
}

async function choose(page, selector, value) {
  await page.click(`${selector} + .custom-select-wrapper .custom-select-trigger`);
  await page.click(`${selector} + .custom-select-wrapper .custom-option[data-value="${value}"]`);
  await waitForStorage(page, [selector === "#focusDuration" ? "ft_timer_duration" : "breakDuration"],
    (state) => String(Object.values(state)[0]) === String(value));
}

async function setCheckbox(page, selector, checked) {
  await page.evaluate(({ selector, checked }) => {
    const input = document.querySelector(selector);
    if (!input) throw new Error(`Missing checkbox ${selector}`);
    input.checked = checked === undefined ? !input.checked : checked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { selector, checked });
  const key = await page.evaluate((value) => {
    const input = document.querySelector(value);
    const id = input?.id;
    if (id === "enabledToggle") return "ft_enabled";
    if (id === "mainToggle") return "focusMode";
    return input?.dataset?.key || id || null;
  }, selector);
  if (key) {
    const expected = await readDom(page, selector, "checked");
    await waitForStorage(page, [key], (state) => state[key] === expected);
  }
}

async function waitFor(page, predicate, timeout = 10000, interval = 200, arg) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(predicate, arg)) return;
    } catch (error) {
      if (!/execution context was destroyed|target closed|navigation/i.test(error.message)) throw error;
    }
    await sleep(interval);
  }
  throw categoryError(`Timed out after ${timeout}ms waiting for extension state`, "D");
}

async function waitForStorage(page, keys, predicate, timeout = 10000, interval = 200) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const value = await storage(page, "get", keys);
      if (predicate(value)) return value;
    } catch (error) {
      if (!/execution context was destroyed|target closed|navigation/i.test(error.message)) throw error;
    }
    await sleep(interval);
  }
  throw categoryError(`Timed out after ${timeout}ms waiting for storage state`, "D");
}

async function installDialogInstrumentation(page, answers) {
  return page.evaluate((answers) => {
    const events = [];
    const originalConfirm = window.confirm;
    const originalAlert = window.alert;
    window.confirm = (message) => {
      const answer = answers.confirm === undefined ? true : Boolean(answers.confirm);
      events.push({ type: "confirm", message, answer, instrumentation: "extension-page" });
      return answer;
    };
    window.alert = (message) => {
      events.push({ type: "alert", message, instrumentation: "extension-page" });
    };
    window.__focusTubeDialogInstrumentation = { events, restore() {
      window.confirm = originalConfirm;
      window.alert = originalAlert;
      const result = events.slice();
      delete window.__focusTubeDialogInstrumentation;
      return result;
    } };
    return true;
  }, answers);
}

async function readDialogInstrumentation(page) {
  return page.evaluate(() => window.__focusTubeDialogInstrumentation
    ? window.__focusTubeDialogInstrumentation.restore()
    : []);
}

async function waitForDialog(page, predicate, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const events = await page.evaluate(() => window.__focusTubeDialogInstrumentation?.events || []);
    if (events.some(predicate)) return events;
    await sleep(100);
  }
  throw categoryError(`Timed out after ${timeout}ms waiting for instrumented dialog`, "D");
}

async function captureExport(page) {
  return page.evaluate(async () => {
    const captured = { instrumentation: "extension-page", blobs: [], anchors: [] };
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalCreateElement = document.createElement;
    const originalClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (blob) => {
      const token = `blob:instrumented-${captured.blobs.length}`;
      captured.blobs.push({ token, text: null, type: blob.type });
      blob.text().then((text) => {
        const item = captured.blobs.find((entry) => entry.token === token);
        if (item) item.text = text;
      });
      return token;
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () {
      captured.anchors.push({ href: this.href, download: this.download, instrumentation: "extension-page" });
    };
    document.createElement = function (tagName, options) {
      const element = originalCreateElement.call(document, tagName, options);
      if (String(tagName).toLowerCase() === "a") {
        element.click = function () {
          captured.anchors.push({ href: this.href, download: this.download, instrumentation: "extension-page" });
        };
      }
      return element;
    };
    try {
      document.getElementById("exportData").click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return captured;
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      document.createElement = originalCreateElement;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });
}

async function open(session, route) {
  const page = await session.newPage();
  await page.goto(extensionUrl(session, route));
  await waitFor(page, () => document.readyState === "complete", 5000, 100);
  await sleep(250);
  return page;
}

async function close(page) {
  if (page) await page.close();
}

async function clearTimer(page) {
  const state = await storage(page, "get", ["ft_timer_end", "ft_timer_type"]);
  if (state.ft_timer_end) {
    await page.evaluate(() => new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "stopTimer" }, () => resolve());
    }));
  }
  await storage(page, "set", { ft_work_session_ended: false, showNotifications: false });
}

async function runCase(report, meta, page, body) {
  return report.case({ site: "extension", scope: "extension-ui", ...meta }, page, body);
}

async function runExtensionChecks(session, report, { workDir, quick = false } = {}) {
  assert.ok(session && session.extensionURL && session.newPage, "valid extension session is required");
  assert.ok(session.extensionId, "extensionId is required by the live session contract");
  assert.ok(report && typeof report.case === "function", "live report contract is required");
  assert.ok(workDir, "workDir is required for import fixtures");
  fs.mkdirSync(workDir, { recursive: true });

  let options;
  let popup;
  try {
    options = await open(session, "options.html");
    await seed(options);
    await options.reload();

    await runCase(report, {
      id: "extension-options-controls",
      route: "options.html",
      mode: "options",
      settings: "defaults",
      expected: "all supported settings controls are present",
    }, options, async () => {
      const ids = [
        "focusDuration", "breakDuration", "autoStartBreaks", "showBreakButton", "lockSettings",
        ...PLATFORMS.map((id) => `popup_visible_${id}`), "restrictHiddenPlatforms",
        "visualHideHiddenPlatforms", "showNotifications", "importFile", "importData",
        "exportData", "resetSettings", "clearData",
      ];
      const missing = await options.evaluate((ids) => ids.filter((id) => !document.getElementById(id)), ids);
      assert.deepEqual(missing, []);
      assert.deepEqual(await options.evaluate(() => ({
        focus: [...document.querySelectorAll("#focusDuration option")].map((o) => o.value),
        break: [...document.querySelectorAll("#breakDuration option")].map((o) => o.value),
      })), { focus: ["15", "25", "30", "45", "60"], break: ["5", "10", "15"] });
      return { missing, controls: ids.length };
    });

    await runCase(report, {
      id: "extension-options-settings-persist",
      route: "options.html",
      mode: "settings",
      settings: { focusDuration: 30, breakDuration: 10, autoStartBreaks: false, lockSettings: true, showNotifications: false },
      expected: "option values persist and reload",
    }, options, async () => {
      await choose(options, "#focusDuration", "30");
      await choose(options, "#breakDuration", "10");
      await setCheckbox(options, "#autoStartBreaks", false);
      await setCheckbox(options, "#lockSettings", true);
      await options.reload();
      await sleep(1200);
      const actual = await options.evaluate(() => ({
        focus: document.getElementById("focusDuration").value,
        break: document.getElementById("breakDuration").value,
        auto: document.getElementById("autoStartBreaks").checked,
        lock: document.getElementById("lockSettings").checked,
        notifications: document.getElementById("showNotifications").checked,
      }));
      assert.deepEqual(actual, { focus: "30", break: "10", auto: false, lock: true, notifications: false });
      return actual;
    });

    await runCase(report, {
      id: "extension-options-visibility-and-visual-persistence",
      route: "options.html",
      mode: "visibility-and-visual-settings",
      settings: { popup_visible_li: false, hide_yt_shorts_nav: false },
      expected: "popup visibility and platform visual-hiding toggles persist and affect popup UI",
    }, options, async () => {
      await setCheckbox(options, "#popup_visible_li", false);
      await setCheckbox(options, "#visualHideHiddenPlatforms", false);
      await options.click('.platform-btn[data-platform="yt"]');
      await waitFor(options, () => Boolean(document.querySelector("#platformDetail.active")), 5000, 100);
      const visualToggle = ".toggle[data-setting-key=\"hide_yt_shorts_nav\"]";
      await options.click(visualToggle);
      await options.reload();
      await options.click('.platform-btn[data-platform="yt"]');
      await waitFor(options, () => Boolean(document.querySelector("#platformDetail.active")), 5000, 100);
      const actual = await options.evaluate(() => ({
        linkedinVisible: document.getElementById("popup_visible_li").checked,
        hiddenVisual: document.getElementById("visualHideHiddenPlatforms").checked,
        ytShortsNav: document.querySelector(".toggle[data-setting-key=\"hide_yt_shorts_nav\"]")?.classList.contains("on"),
      }));
      assert.equal(actual.linkedinVisible, false);
      assert.equal(actual.hiddenVisual, false);
      assert.equal(actual.ytShortsNav, false);
      return actual;
    });
    await options.click("#backBtn");
    await waitFor(options, () => !document.querySelector("#platformDetail.active"), 5000, 100);

    await runCase(report, {
      id: "extension-options-platform-parity",
      route: "options.html",
      mode: "platform-settings",
      settings: { modes: MODES, visualKeys: VISUAL_KEYS },
      expected: "options exercises every platform mode and every supported visual toggle",
    }, options, async () => {
      const actual = {};
      for (const platform of PLATFORMS) {
        await options.click(`.platform-btn[data-platform="${platform}"]`);
        await waitFor(options, () => Boolean(document.querySelector("#platformDetail.active")), 5000, 100);
        for (const mode of ["S", "W", "P"]) {
          await options.click(`.mode-btn[data-mode="${mode}"]`);
          const name = { S: "strict", W: "warn", P: "allow" }[mode];
          await waitForStorage(options, ["platformSettings"], (state) => state.platformSettings?.[platform] === name);
        }
        for (const key of VISUAL_KEYS[platform]) {
          const selector = `.toggle[data-setting-key="${key}"]`;
          const before = await readDom(options, selector, "class");
          await options.click(selector);
          const expected = !before.includes("on");
          await waitForStorage(options, [key], (state) => state[key] === expected);
        }
        actual[platform] = { modes: MODES.length, visualToggles: VISUAL_KEYS[platform].length };
        await options.click("#backBtn");
        await waitFor(options, () => !document.querySelector("#platformDetail.active"), 5000, 100);
      }
      return actual;
    });

    await seed(options, { popup_visible_li: true, lockSettings: false, ft_timer_duration: 25, breakDuration: 5, autoStartBreaks: true, showBreakButton: true });
    popup = await open(session, "popup.html");
    await runCase(report, {
      id: "extension-popup-enable-focus-toggle",
      route: "popup.html",
      mode: "global-toggles",
      settings: { notifications: false },
      expected: "extension and focus toggles update durable settings",
    }, popup, async () => {
      await setCheckbox(popup, "#enabledToggle", false);
      await waitForStorage(popup, ["ft_enabled"], (state) => state.ft_enabled === false);
      await setCheckbox(popup, "#enabledToggle", true);
      await waitForStorage(popup, ["ft_enabled"], (state) => state.ft_enabled === true);
      await setCheckbox(popup, "#mainToggle", false);
      await waitForStorage(popup, ["focusMode"], (state) => state.focusMode === false);
      await setCheckbox(popup, "#mainToggle", true);
      await waitForStorage(popup, ["focusMode"], (state) => state.focusMode === true);
      return { ft_enabled: true, focusMode: true };
    });
    await runCase(report, {
      id: "extension-popup-platform-parity",
      route: "popup.html",
      mode: "modes-and-visual-settings",
      settings: { platformSettings: Object.fromEntries(PLATFORMS.map((id) => [id, "strict"])) },
      expected: "each platform exposes strict, warn, passive and its supported visual toggles",
    }, popup, async () => {
      assert.equal(await popup.evaluate(() => document.querySelectorAll("button[data-platform]").length), 5);
      const result = {};
      for (const platform of PLATFORMS) {
        await popup.click(`.platform-icon[data-platform="${platform}"]`);
        await waitFor(popup, () => Boolean(document.querySelector("#platform-detail:not(.hidden) .mode-option-detail")), 5000, 100);
        const actual = await popup.evaluate(() => ({
          modes: [...document.querySelectorAll(".mode-option-detail")].map((node) => node.dataset.value),
          toggles: [...document.querySelectorAll("#platformSettings input[data-key]")].map((node) => node.dataset.key),
        }));
        assert.deepEqual(actual.modes, MODES);
        assert.deepEqual(actual.toggles, VISUAL_KEYS[platform]);
        for (const mode of MODES) {
          await popup.click(`.mode-option-detail[data-value="${mode}"]`);
          await waitForStorage(popup, ["platformSettings"], (state) => state.platformSettings?.[platform] === mode);
        }
        for (const key of VISUAL_KEYS[platform]) {
          const selector = `.mini-switch input[data-key="${key}"]`;
          const before = await readDom(popup, selector, "checked");
          await setCheckbox(popup, selector);
          await waitForStorage(popup, [key], (state) => state[key] === !before);
        }
        result[platform] = actual;
        await popup.click("#backBtn");
        await waitFor(popup, () => document.querySelector("#platform-detail")?.classList.contains("hidden"), 5000, 100);
      }
      return result;
    });

    await runCase(report, {
      id: "extension-popup-mode-persistence",
      route: "popup.html",
      mode: "mode-selection",
      settings: { platform: "yt", mode: "warn" },
      expected: "popup mode selection persists in storage and badge",
    }, popup, async () => {
      await popup.click('.platform-icon[data-platform="yt"]');
      await popup.click('.mode-option-detail[data-value="warn"]');
      await waitFor(popup, () => document.querySelector('.mode-option-detail[data-value="warn"]')?.classList.contains("selected"));
      const actual = await storage(popup, "get", ["platformSettings"]);
      assert.equal(actual.platformSettings.yt, "warn");
      return actual.platformSettings;
    });

    await close(popup);
    popup = await open(session, "popup.html");
    await runCase(report, {
      id: "extension-popup-close-reopen-reload",
      route: "popup.html",
      mode: "lifecycle",
      settings: { platformSettings: { yt: "warn" } },
      expected: "popup state survives close, reopen and reload",
    }, popup, async () => {
      await waitFor(popup, () => document.querySelector('.platform-icon[data-platform="yt"] .platform-mode-badge')?.textContent?.trim() === "W");
      const before = await readDom(popup, '.platform-icon[data-platform="yt"] .platform-mode-badge', "text");
      assert.equal(before, "W");
      await popup.reload();
      await waitFor(popup, () => document.querySelector('.platform-icon[data-platform="yt"] .platform-mode-badge')?.textContent?.trim() === "W");
      const after = await readDom(popup, '.platform-icon[data-platform="yt"] .platform-mode-badge', "text");
      assert.equal(after, "W");
      return { before, after };
    });

    await runCase(report, {
      id: "extension-timer-normal-start-stop",
      route: "popup.html",
      mode: "normal-timer",
      settings: { duration: "25 minutes", notifications: false },
      expected: "start creates a future work timer and stop clears it",
    }, popup, async () => {
      await clearTimer(popup);
      await popup.click("#timerBtn");
      await waitFor(popup, () => document.getElementById("timerBtn")?.classList.contains("active"));
      const started = await storage(popup, "get", ["ft_timer_end", "ft_timer_type"]);
      assert.equal(started.ft_timer_type, "work");
      assert.ok(started.ft_timer_end > Date.now());
      assert.equal(await readDom(popup, "#timerBtn", "text"), "Stop Timer");
      await popup.click("#timerBtn");
      await waitFor(popup, () => !document.getElementById("timerBtn")?.classList.contains("active"));
      const stopped = await storage(popup, "get", ["ft_timer_end", "ft_timer_type"]);
      assert.equal(stopped.ft_timer_end, undefined);
      assert.equal(stopped.ft_timer_type, undefined);
      return { started, stopped };
    });

    await runCase(report, {
      id: "extension-timer-lock",
      route: "popup.html",
      mode: "timer-lock",
      settings: { lockSettings: true, notifications: false },
      expected: "active work timer locks focus mode and platform choices",
    }, popup, async () => {
      await replaceSettings(popup, { lockSettings: true, ft_timer_duration: 25, showNotifications: false });
      await popup.reload();
      await popup.click("#timerBtn");
      await waitFor(popup, () => document.getElementById("timerBtn")?.classList.contains("active"));
      assert.equal(await readDom(popup, "#mainToggle", "disabled"), true);
      await popup.click('.platform-icon[data-platform="yt"]');
      assert.match(await readDom(popup, '.mode-option-detail[data-value="warn"]', "class"), /disabled/);
      await clearTimer(popup);
      return { focusLocked: true, modesDisabled: true };
    });

    if (!quick) {
      await runCase(report, {
        id: "instrumented-timer-accelerated-completion",
        route: "popup.html",
        mode: "accelerated-completion",
        settings: { end: "short future", type: "break", notifications: false },
        expected: "a valid replaced timer completes through the real browser alarm",
        scope: "instrumented-timer",
      }, popup, async () => {
        const end = Date.now() + 46000;
        const replaced = await replaceSettings(popup, {
          ft_enabled: true, ft_timer_end: end, ft_timer_type: "break", showNotifications: false,
        });
        assert.equal(replaced.replaced, true);
        await waitForStorage(popup, ["ft_timer_end", "ft_timer_type"],
          (state) => state.ft_timer_end === undefined && state.ft_timer_type === undefined,
          60000, 1000);
        return { completedBy: "browser alarm", notifications: "disabled by default" };
      });
      await runCase(report, {
        id: "instrumented-timer-work-break-transitions",
        route: "popup.html",
        mode: "accelerated-work-transitions",
        settings: { workEnd: "short future", autoStartBreaks: "on and off", notifications: false },
        expected: "real alarm completes short work timers with both auto-break policies",
        scope: "instrumented-timer",
      }, popup, async () => {
        await seed(popup, { autoStartBreaks: false, showBreakButton: true, ft_timer_end: Date.now() + 46000, ft_timer_type: "work" });
        await waitForStorage(popup, ["ft_timer_end", "ft_timer_type", "ft_work_session_ended"],
          (state) => state.ft_timer_end === undefined && state.ft_timer_type === undefined && state.ft_work_session_ended === true,
          60000, 1000);
        await seed(popup, { autoStartBreaks: true, showBreakButton: true, breakDuration: 5, ft_timer_end: Date.now() + 46000, ft_timer_type: "work" });
        const transitioned = await waitForStorage(popup, ["ft_timer_end", "ft_timer_type"],
          (state) => state.ft_timer_type === "break" && state.ft_timer_end > Date.now(),
          60000, 1000);
        await clearTimer(popup);
        return { manualBreakPrompt: true, autoBreak: transitioned.ft_timer_type };
      });
    }

    await clearTimer(popup);
    await close(popup);
    popup = null;

    const validFixture = path.join(workDir, "focustube-live-valid.json");
    const invalidFixture = path.join(workDir, "focustube-live-invalid.json");
    const incompleteFixture = path.join(workDir, "focustube-live-incomplete.json");
    fs.writeFileSync(validFixture, JSON.stringify({ ft_timer_duration: 15, platformSettings: { yt: "allow" }, showNotifications: false }));
    fs.writeFileSync(invalidFixture, "{not-json");
    fs.writeFileSync(incompleteFixture, JSON.stringify({ ft_timer_end: Date.now() + 60000 }));

    options = await open(session, "options.html");

    await runCase(report, {
      id: "extension-reset-confirmation",
      route: "options.html",
      mode: "reset",
      settings: { cancel: true, confirm: true },
      expected: "reset cancellation preserves data and confirmation restores defaults",
    }, options, async () => {
      await storage(options, "set", { accentColor: "#123456" });
      await waitForStorage(options, ["accentColor"], (state) => state.accentColor === "#123456");
      await installDialogInstrumentation(options, { confirm: false });
      await options.click("#resetSettings");
      const cancelled = await readDialogInstrumentation(options);
      assert.ok(cancelled.some((event) => event.type === "confirm" && event.answer === false));
      assert.equal((await storage(options, "get", ["accentColor"])).accentColor, "#123456");
      await installDialogInstrumentation(options, { confirm: true });
      await options.click("#resetSettings");
      await sleep(1200);
      await close(options);
      options = await open(session, "options.html");
      const actual = await waitForStorage(options, ["ft_timer_duration", "ft_enabled", "accentColor"],
        (state) => Number(state.ft_timer_duration) === 25 && state.ft_enabled !== false && state.accentColor === "#4facfe");
      assert.equal(Number(actual.ft_timer_duration), 25);
      assert.notEqual(actual.ft_enabled, false);
      return actual;
    });

    await runCase(report, {
      id: "extension-data-export",
      route: "options.html",
      mode: "data",
      settings: { instrumentation: "Blob and temporary download anchor" },
      expected: "export creates one JSON settings download",
    }, options, async () => {
      const exported = await captureExport(options);
      if (exported.anchors.length !== 1) {
        const error = categoryError("The driver could not observe Firefox's temporary export anchor; actual file delivery remains unproved", "D");
        error.code = "BLOCKED";
        throw error;
      }
      assert.equal(exported.anchors[0].download, "focustube-settings-backup.json");
      assert.equal(exported.blobs[0].type, "application/json");
      return { export: "instrumented Blob/anchor" };
    });

    await runCase(report, {
      id: "extension-data-valid-import",
      route: "options.html",
      mode: "data",
      settings: { validImport: { ft_timer_duration: 15, platformSettings: { yt: "allow" } } },
      expected: "valid import confirmation replaces supported settings",
    }, options, async () => {
      if (session.name === "Firefox") {
        const error = categoryError("Firefox WebDriver loses the extension-page command context when successful import reloads the page", "D");
        error.code = "BLOCKED";
        throw error;
      }
      await installDialogInstrumentation(options, { confirm: true });
      try {
        await options.setInputFiles("#importFile", validFixture);
      } catch (error) {
        if (!/execution context was destroyed|timed out|navigation/i.test(error.message)) throw error;
      }
      await sleep(1200);
      await close(options);
      options = await open(session, "options.html");
      const imported = await waitForStorage(options, ["ft_timer_duration", "platformSettings"], (state) => Number(state.ft_timer_duration) === 15 && state.platformSettings?.yt === "allow");
      assert.equal(Number(imported.ft_timer_duration), 15);
      assert.equal(imported.platformSettings.yt, "allow");
      return { imported };
    });

    await runCase(report, {
      id: "extension-data-invalid-incomplete",
      route: "options.html",
      mode: "data-validation",
      settings: { fixtures: ["invalid JSON", "timer fields incomplete"] },
      expected: "invalid imports alert and do not replace durable settings",
    }, options, async () => {
      if (session.name === "Firefox") {
        const error = categoryError("Firefox WebDriver file-input commands are not stable enough to prove import validation", "D");
        error.code = "BLOCKED";
        throw error;
      }
      const before = await storage(options, "get", ["ft_timer_duration", "platformSettings"]);
      for (const fixture of [invalidFixture, incompleteFixture]) {
        await installDialogInstrumentation(options, { confirm: true });
        await options.setInputFiles("#importFile", fixture);
        const dialogs = await waitForDialog(options, (event) => event.type === "alert" && /Error importing data/.test(event.message));
        assert.ok(dialogs.some((event) => event.type === "alert" && /Error importing data/.test(event.message)));
      }
      const after = await storage(options, "get", ["ft_timer_duration", "platformSettings"]);
      assert.deepEqual(after, before);
      return { unchanged: true };
    });

    await runCase(report, {
      id: "extension-clear-all-confirmation",
      route: "options.html",
      mode: "clear-all",
      settings: { confirm: "instrumented false then true" },
      expected: "cancel preserves data and confirmation clears settings to defaults",
    }, options, async () => {
      if (session.name === "Firefox") {
        const error = categoryError("Firefox WebDriver loses the extension-page command context when Clear All reloads the page", "D");
        error.code = "BLOCKED";
        throw error;
      }
      await storage(options, "set", { ft_stats_blocked: 7, ft_timer_duration: 15 });
      await installDialogInstrumentation(options, { confirm: false });
      await options.click("#clearData");
      assert.equal((await storage(options, "get", ["ft_stats_blocked"])).ft_stats_blocked, 7);
      await installDialogInstrumentation(options, { confirm: true });
      await options.evaluate(() => { window.__ftClearContext = true; });
      await options.click("#clearData");
      await sleep(1200);
      await close(options);
      options = await open(session, "options.html");
      const actual = await waitForStorage(options, ["ft_stats_blocked", "ft_timer_duration", "ft_enabled"], (state) => state.ft_stats_blocked === 0 && Number(state.ft_timer_duration) === 25 && state.ft_enabled !== false);
      assert.equal(actual.ft_stats_blocked, 0);
      assert.equal(Number(actual.ft_timer_duration), 25);
      assert.notEqual(actual.ft_enabled, false);
      return actual;
    });

    await seed(options, { ft_timer_duration: 30, ft_timer_end: Date.now() + 150000, ft_timer_type: "work", ft_work_session_ended: false });
    if (session.persistentExtension && session.name !== "Firefox") {
      await close(options);
      options = null;
      await session.restart();
      options = await open(session, "options.html");
      await runCase(report, {
        id: "extension-browser-restart-persistence",
        route: "options.html",
        mode: "browser-restart",
        settings: { persistentExtension: true },
        expected: "settings remain available after same-profile browser restart",
      }, options, async () => {
        const actual = await storage(options, "get", ["ft_enabled", "ft_timer_duration", "ft_timer_end", "ft_timer_type"]);
        assert.equal(actual.ft_enabled, true);
        assert.equal(actual.ft_timer_duration, 30);
        assert.equal(actual.ft_timer_type, "work");
        assert.ok(actual.ft_timer_end > Date.now());
        assert.notEqual(await readDom(options, "#timerActivePill", "display"), "none");
        return actual;
      });
    } else {
      report.block({ id: "extension-browser-restart-persistence", site: "extension", route: "options.html", mode: "browser-restart", scope: "extension-ui", expected: "same-profile persistent restart without reinstall" }, session.name === "Firefox" ? "Firefox temporary extension cannot establish persistence" : "CLI-sideloaded fallback is not a persistent browser installation", "D");
    }

    const errors = typeof session.backgroundErrors === "function" ? await session.backgroundErrors() : [];
    return { completed: true, quick, backgroundDiagnostics: errors };
  } finally {
    await close(popup);
    await close(options);
  }
}

module.exports = { runExtensionChecks };
