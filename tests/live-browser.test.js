"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline/promises");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { runtimeFiles } = require("../scripts/prepare-test-builds");
const { launchChromium } = require("./live/chromium-driver");
const { launchFirefox } = require("./live/firefox-driver");
const { runExtensionChecks } = require("./live/extension-checks");
const { runSiteChecks, sites } = require("./live/site-checks");
const { Report } = require("./live/report");

const root = path.resolve(__dirname, "..");
const local = path.join(root, ".tmp", "live-validation");
const flag = (key, fallback) => {
  const index = process.argv.indexOf(key);
  return index < 0 ? fallback : process.argv[index + 1];
};
function digest(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function firstFile(candidates) { return candidates.filter(Boolean).find((p) => fs.existsSync(p)); }

function environment() {
  const pf = process.env.PROGRAMFILES || "C:/Program Files";
  const pf86 = process.env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)";
  const app = process.env.LOCALAPPDATA || "";
  return {
    chrome: { name: "Chrome", executablePath: firstFile([process.env.FOCUSTUBE_CHROME, path.join(app, "Google/Chrome/Application/chrome.exe"), path.join(pf, "Google/Chrome/Application/chrome.exe")]) },
    edge: { name: "Edge", executablePath: firstFile([process.env.FOCUSTUBE_EDGE, path.join(pf86, "Microsoft/Edge/Application/msedge.exe"), path.join(pf, "Microsoft/Edge/Application/msedge.exe")]) },
    firefox: { name: "Firefox", executablePath: firstFile([process.env.FOCUSTUBE_FIREFOX, path.join(pf, "Firefox Developer Edition/firefox.exe"), path.join(pf, "Firefox Nightly/firefox.exe"), path.join(pf, "Mozilla Firefox/firefox.exe")]) },
    chromium: { name: "Chromium", executablePath: chromium.executablePath() },
  };
}

function candidate() {
  const files = [...runtimeFiles, "chrome-manifest.json", "firefox-manifest.json"];
  const hashes = Object.fromEntries(files.map((file) => [file, digest(path.join(root, file))]));
  const buildRoot = path.join(root, "dist-release-builds");
  for (const browser of ["chromium", "firefox"]) {
    const directory = path.join(buildRoot, "FocusTube-release-" + browser + "-v2.3.2");
    const sourceManifest = browser === "chromium" ? "chrome-manifest.json" : "firefox-manifest.json";
    if (JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, sourceManifest)))) !== JSON.stringify(JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"))))) throw new Error("Retained manifest differs from source");
    for (const file of runtimeFiles) if (digest(path.join(directory, file)) !== hashes[file]) throw new Error("Retained candidate differs from source: " + file);
    hashes["dist-release-builds/FocusTube-release-" + browser + "-v2.3.2.zip"] = digest(path.join(buildRoot, "FocusTube-release-" + browser + "-v2.3.2.zip"));
  }
  return hashes;
}

function safeLocalPaths() {
  let current = root;
  for (const part of [".tmp", "live-validation", "profiles"]) {
    current = path.join(current, part);
    fs.mkdirSync(current, { recursive: true });
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error("Local harness root must not contain symlinks/junctions");
  }
  execFileSync("git", ["check-ignore", "--quiet", path.join(local, "profiles", "probe")], { cwd: root });
}

async function main() {
  safeLocalPaths();
  const before = candidate();
  const available = environment();
  const setup = flag("--setup", "");
  const login = flag("--login", "");
  const chosen = setup || login ? [setup || login] : flag("--browsers", "chrome,edge,firefox").split(",");
  if (chosen.some((b) => !available[b])) throw new Error("Unknown browser; use chrome, edge, firefox or labelled chromium fallback");
  const selectedSites = flag("--sites", "yt,ig,tt,fb,li").split(",");
  if (selectedSites.some((s) => !sites[s])) throw new Error("Unknown site code");
  const reportDir = path.join(local, "runs", new Date().toISOString().replace(/[:.]/g, "-"));
  const report = new Report(reportDir, { candidateHashes: before, mode: setup ? "setup" : login ? "login" : "validation",
    requestedBrowsers: chosen.map((id) => available[id].name), selectedSites,
    quick: process.argv.includes("--quick"), sitesOnly: process.argv.includes("--sites-only"), extensionOnly: process.argv.includes("--extension-only") });
  report.data.manual = [
    "Load the candidate once in each isolated Chrome/Edge profile if sideloading is blocked; rerun automation afterwards.",
    "Sign in once per needed isolated browser profile; handle any account challenges yourself, then rerun the affected sites.",
    "Persistent Firefox restart needs a signed candidate or Developer Edition/Nightly; a temporary add-on reinstall does not qualify.",
    "Observe one enabled timer-completion OS notification and confirm notifications OFF suppresses it. API evidence alone does not prove delivery.",
    "Review remaining BLOCKED live cases only after authenticated rerun; do not repeat already-passed extension UI or deterministic tests.",
  ];
  let halted = false;
  try {
    for (const id of chosen) {
      const browser = available[id];
      const buildDir = path.join(root, "dist-release-builds", "FocusTube-release-" + (id === "firefox" ? "firefox" : "chromium") + "-v2.3.2");
      const profileDir = path.join(local, "profiles", id);
      if (fs.existsSync(profileDir) && fs.lstatSync(profileDir).isSymbolicLink()) throw new Error("Profile must not be a symlink/junction");
      report.data.browsers.push({ name: browser.name, executablePath: browser.executablePath || null, profile: path.relative(root, profileDir) });
      report.use({ name: browser.name, version: "unavailable" });
      let session;
      let launched = false;
      try {
        if (!browser.executablePath) throw new Error("Installed browser was not found");
        const options = { ...browser, buildDir, profileDir, setup: Boolean(setup),
          archivePath: buildDir + ".zip", driverPath: path.join(local, "tools", "geckodriver.exe"),
          logs: path.join(reportDir, id + "-driver.log"), downloadDir: path.join(reportDir, id + "-downloads"),
          persistent: process.argv.includes("--firefox-persistent") };
        session = id === "firefox" ? await launchFirefox(options) : await launchChromium(options);
        launched = true;
        report.use(session);
        report.data.browsers.at(-1).version = session.version;
        report.data.browsers.at(-1).extensionInstall = session.persistentExtension ? "persistent" : "temporary/CLI";
        if (setup || login) {
          if (login) {
            for (const code of selectedSites) { const page = await session.newPage(); await page.goto(sites[code].home); }
          }
          console.log("Isolated profile: " + profileDir + "\nCandidate: " + buildDir);
          console.log(setup ? "Enable Developer mode and Load unpacked using the candidate folder. No store installation or normal profile is involved." : "Log in manually. Credentials are not collected or written by the harness.");
          const input = readline.createInterface({ input: process.stdin, output: process.stdout });
          try { await input.question("Press Enter when finished to close and preserve this profile: "); } finally { input.close(); }
          continue;
        }
        const page = await session.newPage();
        await report.case({ id: "extension-load", site: "extension", scope: "extension-ui", route: "popup.html", expected: "The exact 2.3.2 manifest is loaded" }, page, async () => {
          await page.goto(session.extensionURL + "popup.html");
          const manifest = await page.evaluate(() => chrome.runtime.getManifest());
          if (manifest.version !== "2.3.2") throw new Error("Wrong version loaded");
          const loadedHashes = await page.evaluate(async (files) => {
            const entries = [];
            for (const file of files) {
              const response = await fetch(chrome.runtime.getURL(file));
              if (!response.ok) throw new Error("Cannot read packaged runtime " + file);
              const hash = await crypto.subtle.digest("SHA-256", await response.arrayBuffer());
              entries.push([file, [...new Uint8Array(hash)].map((v) => v.toString(16).padStart(2, "0")).join("")]);
            }
            return Object.fromEntries(entries);
          }, runtimeFiles);
          for (const file of runtimeFiles) if (loadedHashes[file] !== before[file]) throw new Error("Loaded extension differs from candidate: " + file);
          return { version: manifest.version, manifestVersion: manifest.manifest_version, runtimeByteParity: true };
        });
        await page.close();
        if (!process.argv.includes("--sites-only")) await runExtensionChecks(session, report, { workDir: path.join(reportDir, id + "-inputs"), quick: process.argv.includes("--quick") });
        if (!process.argv.includes("--extension-only")) await runSiteChecks(session, report, { selectedSites });
      } catch (error) {
        if (error.code === "CASE_FAILURE" || error.category === "A") {
          halted = true;
          report.data.diagnostics.push("Stopped on " + browser.name + " mismatch before changing runtime: " + error.message);
          console.error(report.data.diagnostics.at(-1));
        } else {
          report.block({ id: launched ? "harness-interrupted" : "browser-launch", site: "extension", scope: "browser-setup", expected: "Installed browser loads the candidate and harness completes" }, error.message, "D");
          if (!process.argv.includes("--extension-only")) {
            for (const code of selectedSites) report.block({ id: code + ".browser-unavailable", site: sites[code].name, expected: "Full live matrix" }, error.message, "D");
          }
        }
      } finally { if (session) await session.close(); }
      if (halted) break;
    }
  } finally {
    const after = candidate();
    report.data.candidateUnchanged = JSON.stringify(before) === JSON.stringify(after);
    report.data.finishedAt = new Date().toISOString();
    report.write();
    console.log("Evidence: " + reportDir);
    if (!report.data.candidateUnchanged) throw new Error("Candidate bytes changed; do not publish");
  }
  if (halted) process.exitCode = 1;
  else if (report.data.counts.BLOCKED && !setup && !login) process.exitCode = 2;
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { environment, candidate };
