'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { spawn } = require('node:child_process');

const HTTP_TIMEOUT_MS = 15_000;
const START_TIMEOUT_MS = 30_000;
const DEFAULT_EXTENSION_ID = 'focustube@malekwael.com';

function blocked(message) {
  const error = new Error(`BLOCKED: ${message}`);
  error.code = 'BLOCKED';
  return error;
}

async function assertRealProfile(profileDir) {
  if (!profileDir) throw new TypeError('profileDir is required');
  const absolute = path.resolve(profileDir);
  await fsp.mkdir(absolute, { recursive: true });
  const stat = await fsp.lstat(absolute);
  if (stat.isSymbolicLink()) throw blocked('profileDir must not be a symbolic link');
  return absolute;
}

function parseListeningPort(output) {
  const match = /(?:^|\s)Listening on 127\.0\.0\.1:(\d+)(?:\s|$)/.exec(output);
  const port = Number(match?.[1]);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function waitForDriverPort(processHandle, logFile) {
  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const timer = setTimeout(() => finish(new Error('Timed out waiting for geckodriver to bind')), START_TIMEOUT_MS);
    const onData = (chunk) => {
      const text = chunk.toString('utf8');
      if (logFile) fs.appendFileSync(logFile, text);
      if (settled) return;
      output = (output + text).slice(-4096);
      const port = parseListeningPort(output);
      if (port) finish(null, port);
    };
    const onError = (error) => finish(error);
    const onExit = (code) => finish(new Error(`geckodriver exited before binding (${code})`));
    const finish = (error, port) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      processHandle.off('error', onError);
      processHandle.off('exit', onExit);
      if (error) reject(error);
      else resolve(port);
    };

    processHandle.stdout.on('data', onData);
    processHandle.stderr.on('data', onData);
    processHandle.once('error', onError);
    processHandle.once('exit', onExit);
  });
}

function readJson(response, body) {
  if (!body) return null;
  try { return JSON.parse(body); } catch { throw new Error(`Invalid WebDriver response (${response.statusCode})`); }
}

function firefoxChannel(executablePath) {
  try {
    const ini = fs.readFileSync(path.join(path.dirname(executablePath), 'application.ini'), 'utf8');
    const app = ini.match(/^\[App\]([\s\S]*?)(?=^\[|$)/m)?.[1] || '';
    const name = app.match(/^Name=(.*)$/m)?.[1] || '';
    const pathName = executablePath.toLowerCase();
    return /developer|nightly/i.test(`${name} ${pathName}`) ? 'non-release' : 'release';
  } catch {
    return /developer|nightly/i.test(executablePath) ? 'non-release' : 'release';
  }
}

function findFirefox() {
  const candidates = [
    process.env.FIREFOX_BIN,
    process.env.MOZ_BROWSER_BIN,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Mozilla Firefox', 'firefox.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Mozilla Firefox', 'firefox.exe'),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function launchFirefox({
  executablePath,
  driverPath,
  profileDir,
  buildDir,
  archivePath,
  logs,
  persistent = false,
  loadExtension = true,
  downloadDir,
} = {}) {
  const profile = await assertRealProfile(profileDir);
  const firefox = executablePath || findFirefox();
  if (!firefox || !fs.existsSync(firefox)) throw blocked('Firefox executable was not found');
  if (!driverPath || !fs.existsSync(driverPath)) throw blocked(`geckodriver was not found at ${driverPath || '(missing path)'}`);
  if (persistent && firefoxChannel(firefox) === 'release') {
    throw blocked('persistent extensions are supported only with Firefox Developer Edition or Nightly');
  }

  const extensionPath = archivePath || buildDir;
  if (loadExtension && (!extensionPath || !fs.existsSync(extensionPath))) {
    throw blocked(`extension build/archive was not found at ${extensionPath || '(missing path)'}`);
  }

  const logFile = logs ? path.resolve(logs) : null;
  if (logFile) await fsp.mkdir(path.dirname(logFile), { recursive: true });
  const downloadPath = downloadDir ? path.resolve(downloadDir) : null;
  if (downloadPath) await fsp.mkdir(downloadPath, { recursive: true });

  let driver;
  let sessionId;
  let closed = false;
  let extensionId = DEFAULT_EXTENSION_ID;
  let extensionURL;
  let version;
  let currentContext = 'content';
  const seenErrors = new Set();

  async function manifestExtensionId() {
    if (buildDir) {
      try {
        const manifest = JSON.parse(await fsp.readFile(path.join(buildDir, 'manifest.json'), 'utf8'));
        const id = manifest.browser_specific_settings?.gecko?.id || manifest.applications?.gecko?.id;
        if (id) return id;
      } catch { /* Fall back to the repository manifest or default ID. */ }
    }
    try {
      const manifest = JSON.parse(await fsp.readFile(path.resolve(__dirname, '../../firefox-manifest.json'), 'utf8'));
      return manifest.browser_specific_settings?.gecko?.id || manifest.applications?.gecko?.id || DEFAULT_EXTENSION_ID;
    } catch {
      return DEFAULT_EXTENSION_ID;
    }
  }
  extensionId = await manifestExtensionId();

  async function request(method, endpoint, body) {
    if (!driver) throw new Error('Firefox driver is not running');
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const response = await new Promise((resolve, reject) => {
      const req = require('node:http').request({
        host: '127.0.0.1', port: driver.port, method,
        path: `/session${sessionId ? `/${sessionId}` : ''}${endpoint}`,
        headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {},
        timeout: HTTP_TIMEOUT_MS,
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('timeout', () => req.destroy(new Error(`WebDriver request timed out: ${method} ${endpoint}`)));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
    const data = readJson(response, response.body);
    if (response.statusCode < 200 || response.statusCode >= 300 || data?.value?.error) {
      const detail = data?.value?.message || data?.message || response.body;
      throw new Error(`WebDriver ${method} ${endpoint} failed (${response.statusCode}): ${detail}`);
    }
    return data?.value;
  }

  async function waitForDriver() {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        await new Promise((resolve, reject) => {
          const req = require('node:http').get({ host: '127.0.0.1', port: driver.port, path: '/status', timeout: 500 }, (res) => {
            res.resume(); res.on('end', resolve);
          });
          req.on('timeout', () => req.destroy());
          req.on('error', reject);
        });
        return;
      } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    throw new Error('Timed out waiting for geckodriver');
  }

  async function privileged(script, arg) {
    if (currentContext !== 'chrome') {
      await request('POST', '/moz/context', { context: 'chrome' });
      currentContext = 'chrome';
    }
    try {
      return await request('POST', '/execute/sync', { script, args: [arg] });
    } finally {
      await request('POST', '/moz/context', { context: 'content' });
      currentContext = 'content';
    }
  }

  async function contentContext() {
    if (currentContext !== 'content') {
      await request('POST', '/moz/context', { context: 'content' });
      currentContext = 'content';
    }
  }

  async function extensionState() {
    const result = await privileged(`
      const id = arguments[0];
      let policy = null;
      try {
        const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
        policy = ExtensionParent.WebExtensionPolicy.getByID(id);
      } catch (_) {}
      let url = policy?.baseURL?.spec || policy?.extension?.baseURL?.spec || null;
      if (!url && policy?.active) {
        try {
          const raw = Services.prefs.getStringPref('extensions.webextensions.uuids', '{}');
          const map = JSON.parse(raw);
          if (map[id]) url = 'moz-extension://' + map[id] + '/';
        } catch (_) {}
      }
      return { id, active: Boolean(policy && policy.active), url };
    `, extensionId);
    return result;
  }

  async function installExtension(temporary) {
    const result = await request('POST', '/moz/addon/install', { path: extensionPath, temporary });
    if (typeof result === 'string') extensionId = result;
    else if (result?.addon) extensionId = result.addon;
    const state = await extensionState();
    if (!state.active || !state.url) throw blocked('Firefox installed the add-on but no active WebExtensionPolicy or UUID was found');
    extensionId = state.id || extensionId;
    extensionURL = state.url;
  }

  async function start(load) {
    const args = ['--host', '127.0.0.1', '--port', '0', '--allow-system-access'];
    driver = {
      port: null,
      process: spawn(driverPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
    driver.port = await waitForDriverPort(driver.process, logFile);
    await waitForDriver();
    const prefs = {};
    if (persistent) prefs['xpinstall.signatures.required'] = false;
    if (downloadPath) {
      prefs['browser.download.dir'] = downloadPath;
      prefs['browser.download.folderList'] = 2;
      prefs['browser.helperApps.alwaysAsk.force'] = false;
    }
    const value = await request('POST', '', {
      capabilities: { alwaysMatch: { browserName: 'firefox', pageLoadStrategy: 'eager', timeouts: { pageLoad: 20_000, script: 10_000, implicit: 0 }, 'moz:firefoxOptions': {
        binary: firefox, args: ['-profile', profile], prefs,
      } } },
    });
    sessionId = value.sessionId;
    version = value.capabilities?.browserVersion;
    currentContext = 'content';
    if (load) await installExtension(!persistent);
    else {
      const state = await extensionState();
      if (!state.active || !state.url) throw blocked('temporary extension is absent after restart; Firefox cannot preserve it without a signed persistent install');
      extensionURL = state.url;
    }
  }

  async function closeDriver() {
    if (closed) return;
    closed = true;
    try { if (sessionId) await request('DELETE', ''); } catch { /* process cleanup is best effort */ }
    if (driver?.process && !driver.process.killed) {
      const owned = driver.process;
      if (process.platform === 'win32') {
        await new Promise((resolve) => {
          const killer = spawn('taskkill', ['/pid', String(owned.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
          killer.once('close', resolve);
          killer.once('error', resolve);
        });
      } else owned.kill('SIGTERM');
      await new Promise((resolve) => {
        if (owned.exitCode !== null || owned.signalCode) return resolve();
        const timer = setTimeout(resolve, 2_000);
        owned.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
  }

  async function backgroundErrors() {
    const messages = await privileged(`
      const id = arguments[0];
      return Services.console.getMessageArray().map((m) => ({
        message: String(m.errorMessage || m.message || ''),
        sourceName: String(m.sourceName || ''),
        category: String(m.category || ''),
      })).filter((m) => m.sourceName.includes(id) || m.message.includes(id) || m.sourceName.includes('moz-extension://'));
    `, extensionId);
    return messages.filter((item) => {
      const key = JSON.stringify(item);
      if (seenErrors.has(key)) return false;
      seenErrors.add(key);
      return true;
    });
  }

  async function pageErrors(handle) {
    await contentContext();
    await request('POST', '/window', { handle });
    const currentUrl = await request('GET', '/url');
    let host = '';
    try { host = new URL(currentUrl).hostname; } catch { return []; }
    return privileged(`
      const host = arguments[0];
      return Services.console.getMessageArray().map((m) => ({
        message: String(m.errorMessage || m.message || ''),
        sourceName: String(m.sourceName || ''),
        category: String(m.category || ''),
      })).filter((m) => m.sourceName.includes(host) && m.category.toLowerCase().includes('error'));
    `, host);
  }

  async function liveHandles() {
    return request('GET', '/window/handles');
  }

  async function switchToAnchor() {
    const handles = await liveHandles();
    if (!handles?.length) throw blocked('Firefox has no live browsing context to use as the page anchor');
    await request('POST', '/window', { handle: handles[0] });
    return handles[0];
  }

  function page(handle) {
    async function call(method, endpoint, body) {
      await contentContext();
      await request('POST', '/window', { handle });
      return request(method, endpoint, body);
    }
    async function element(selector) {
      const result = await call('POST', '/element', { using: 'css selector', value: selector });
      return result['element-6066-11e4-a52e-4f735466cecf'] || result.ELEMENT;
    }
    return {
      goto: (url) => call('POST', '/url', { url }),
      url: async () => (await call('GET', '/url')).toString(),
      evaluate: async (fn, arg) => {
        const result = await call('POST', '/execute/async', { script: `const fn = ${fn.toString()}; Promise.resolve().then(() => fn(arguments[0])).then((value) => arguments[arguments.length - 1]({ ok: true, value }), (error) => arguments[arguments.length - 1]({ ok: false, error: { name: String(error?.name || 'Error'), message: String(error?.message || error), stack: String(error?.stack || '') } }));`, args: [arg] });
        if (!result?.ok) throw new Error(`${result?.error?.name || 'Error'}: ${result?.error?.message || 'evaluate rejected'}${result?.error?.stack ? `\n${result.error.stack}` : ''}`);
        return result.value;
      },
      click: async (selector) => { const id = await element(selector); return call('POST', `/element/${id}/click`, {}); },
      selectOption: async (selector, value) => { const id = await element(selector); return call('POST', `/element/${id}/click`, {}).then(() => call('POST', '/execute/sync', { script: `document.querySelector(arguments[0]).value = arguments[1]; document.querySelector(arguments[0]).dispatchEvent(new Event('change', { bubbles: true }));`, args: [selector, value] })); },
      setInputFiles: async (selector, file) => { const id = await element(selector); return call('POST', `/element/${id}/value`, { text: path.resolve(file) }); },
      screenshot: async (file) => { const data = await call('GET', '/screenshot'); await fsp.writeFile(file, Buffer.from(data, 'base64')); },
      reload: () => call('POST', '/refresh', {}),
      back: () => call('POST', '/back', {}),
      forward: () => call('POST', '/forward', {}),
      close: async () => {
        await contentContext();
        await request('POST', '/window', { handle });
        const handles = await liveHandles();
        let anchor = handles.find((candidate) => candidate !== handle);
        if (!anchor) {
          anchor = (await request('POST', '/window/new', { type: 'tab' })).handle;
          await request('POST', '/window', { handle });
        }
        await request('DELETE', '/window');
        await request('POST', '/window', { handle: anchor });
      },
      getErrors: () => pageErrors(handle),
    };
  }

  try {
    await start(loadExtension);
  } catch (error) {
    await closeDriver();
    throw error;
  }
  return {
    name: 'Firefox',
    get version() { return version; },
    get extensionURL() { return extensionURL; },
    get extensionId() { return extensionId; },
    get persistentExtension() { return Boolean(persistent); },
    newPage: async () => {
      await contentContext();
      await switchToAnchor();
      return page((await request('POST', '/window/new', { type: 'tab' })).handle);
    },
    restart: async () => {
      await closeDriver();
      closed = false; sessionId = undefined; driver = undefined;
      try {
        await start(false);
      } catch (error) {
        await closeDriver();
        throw error;
      }
    },
    close: closeDriver,
    backgroundErrors,
  };
}

module.exports = { launchFirefox, parseListeningPort };
