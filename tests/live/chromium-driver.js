"use strict";

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function launchChromium(options) {
  const { name, executablePath, profileDir, buildDir, setup = false } = options;
  if (!fs.existsSync(executablePath)) throw new Error(name + " executable not found");
  fs.mkdirSync(profileDir, { recursive: true });
  let browser, context, processHandle, extensionId, version;
  const errors = [];
  const workers = new Set();
  let backgroundDiagnosticGap = null;

  async function observeWorker(worker) {
    if (workers.has(worker)) return;
    workers.add(worker);
    try {
      await worker.evaluate(() => {
        globalThis.__ftValidationErrors = [];
        self.addEventListener("error", (event) => globalThis.__ftValidationErrors.push(String(event.message)));
        self.addEventListener("unhandledrejection", (event) => globalThis.__ftValidationErrors.push(String(event.reason)));
      });
    } catch (error) { backgroundDiagnosticGap = error.message; }
  }

  function wrap(page) {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.setDefaultTimeout(8000);
    async function goto(url) {
      try {
        return await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      } catch (error) {
        if (!/net::ERR_ABORTED/i.test(error.message)) throw error;
        await delay(350);
        return page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      }
    }
    return {
      goto,
      url: async () => page.url(),
      evaluate: (fn, arg) => page.evaluate(fn, arg),
      click: (selector) => page.locator(selector).click(),
      selectOption: (selector, value) => page.locator(selector).selectOption(value),
      setInputFiles: (selector, file) => page.locator(selector).setInputFiles(file),
      screenshot: (file) => page.screenshot({ path: file, timeout: 8000 }),
      reload: () => page.reload({ waitUntil: "domcontentloaded", timeout: 25000 }),
      back: () => page.goBack({ waitUntil: "domcontentloaded", timeout: 25000 }),
      forward: () => page.goForward({ waitUntil: "domcontentloaded", timeout: 25000 }),
      close: () => page.close(),
      getErrors: async () => pageErrors.splice(0),
    };
  }

  async function start(install) {
    workers.clear();
    const port = await freePort();
    const args = ["--user-data-dir=" + profileDir, "--remote-debugging-port=" + port,
      "--remote-debugging-address=127.0.0.1", "--no-first-run", "--no-default-browser-check",
      "--disable-sync", "--enable-unsafe-extension-debugging", "about:blank"];
    // Only the explicitly labelled bundled Chromium fallback uses CLI sideloading.
    if (name === "Chromium") args.push("--load-extension=" + buildDir);
    processHandle = spawn(executablePath, args, { windowsHide: true, stdio: "ignore" });
    let launchError;
    processHandle.once("error", (error) => { launchError = error; });
    for (let attempt = 0; attempt < 30; attempt++) {
      if (launchError) throw launchError;
      try {
        browser = await chromium.connectOverCDP("http://127.0.0.1:" + port, { timeout: 800 });
        break;
      } catch { await delay(300); }
    }
    if (!browser) throw new Error(name + " did not expose its isolated debugging endpoint");
    context = browser.contexts()[0];
    version = browser.version();
    context.on("serviceworker", (worker) => { void observeWorker(worker); });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const manager = await context.newPage();
    await manager.goto(name === "Edge" ? "edge://extensions/" : "chrome://extensions/");
    let extensions = [];
    try {
      extensions = await manager.evaluate(() => new Promise((resolve) => {
        chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true }, resolve);
      }));
    } catch (error) { errors.push("Extension inventory unavailable: " + error.message); }
    const installed = extensions.find((item) => item.name?.startsWith("FocusTube") && item.version === "2.3.2");
    if (installed?.state === "ENABLED") extensionId = installed.id;
    if (!extensionId && install) {
      try { extensionId = (await cdp.send("Extensions.loadUnpacked", { path: buildDir })).id; }
      catch (error) { errors.push("Automated sideload unavailable: " + error.message); }
    }
    if (!extensionId) {
      for (const worker of context.serviceWorkers()) {
        if (!worker.url().startsWith("chrome-extension://")) continue;
        try {
          const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
          if (manifest.name.startsWith("FocusTube") && manifest.version === "2.3.2") {
            extensionId = new URL(worker.url()).host;
            break;
          }
        } catch (error) { errors.push("Worker identification unavailable: " + error.message); }
      }
    }
    if (!extensionId && !setup) {
      const error = new Error(name + " requires one-time Developer mode > Load unpacked in its isolated profile. Run --setup " + name.toLowerCase());
      error.code = "BLOCKED";
      throw error;
    }
    for (const worker of context.serviceWorkers()) await observeWorker(worker);
    await page.close();
    if (!setup) await manager.close();
  }

  async function close() {
    if (browser) {
      try { const cdp = await browser.newBrowserCDPSession(); await cdp.send("Browser.close"); }
      catch (error) { errors.push("Browser close: " + error.message); }
      await browser.close().catch(() => {});
      browser = null;
    } else if (processHandle && processHandle.exitCode === null) processHandle.kill();
    await delay(750);
  }

  try { await start(true); } catch (error) { await close(); throw error; }
  return {
    name, get version() { return version; }, get extensionId() { return extensionId; },
    get extensionURL() { return extensionId ? "chrome-extension://" + extensionId + "/" : null; },
    persistentExtension: name !== "Chromium",
    newPage: async () => wrap(await context.newPage()),
    restart: async () => { await close(); extensionId = null; await start(false); },
    close,
    backgroundErrors: async () => {
      const result = errors.splice(0);
      for (const worker of context.serviceWorkers()) {
        try { result.push(...await worker.evaluate(() => (globalThis.__ftValidationErrors || []).splice(0))); }
        catch (error) { backgroundDiagnosticGap = error.message; }
      }
      if (backgroundDiagnosticGap) result.push("DIAGNOSTIC GAP: " + backgroundDiagnosticGap);
      return result;
    },
  };
}

module.exports = { launchChromium };
