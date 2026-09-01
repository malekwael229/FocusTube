#!/usr/bin/env node

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const AdmZip = require("adm-zip");

const root = path.resolve(__dirname, "..");
const prepareBuilds = path.join(root, "scripts", "prepare-test-builds.js");
const { runtimeFiles } = require(prepareBuilds);
const expectedVersion = "2.3.2";
const browsers = ["chromium", "firefox"];
const tempPrefix = "focustube-package-repro-";
const distOutputs = [
  path.join(root, "dist-release-builds"),
  path.join(root, "dist-test-builds"),
];

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function expectedArchiveName(browser) {
  return `FocusTube-release-${browser}-v${expectedVersion}.zip`;
}

function assertArchiveContents(archivePath, browser) {
  const entries = new AdmZip(archivePath).getEntries();
  const entryNames = entries.map((entry) => entry.entryName);
  const expectedNames = [...runtimeFiles, "icons/", "manifest.json"].sort();

  assert.deepEqual([...entryNames].sort(), expectedNames, `${browser} ZIP contents`);
  for (const entryName of entryNames) {
    assert.doesNotMatch(entryName, /[\\]/, `${browser} entry uses POSIX paths: ${entryName}`);
    assert.doesNotMatch(entryName, /(^|\/)\.\.?($|\/)/, `${browser} entry is not nested or traversing: ${entryName}`);
    assert.ok(!entryName.startsWith("/"), `${browser} entry is not absolute: ${entryName}`);
  }

  const manifest = JSON.parse(new AdmZip(archivePath).readAsText("manifest.json"));
  assert.equal(manifest.version, expectedVersion, `${browser} manifest version`);
}

function build(outputRoot, stdio = "inherit") {
  execFileSync(process.execPath, [prepareBuilds, outputRoot, "--zip", "--retain"], {
    cwd: root,
    stdio,
  });
}

function isOwnedTempDirectory(directory) {
  const resolved = path.resolve(directory);
  const stats = fs.statSync(resolved);
  return stats.isDirectory()
    && path.dirname(resolved) === path.resolve(os.tmpdir())
    && path.basename(resolved).startsWith(tempPrefix);
}

const buildDirectories = [];
let unsafeOutputDirectory;
const distSentinelPaths = [];
const createdDistOutputs = [];
try {
  buildDirectories.push(fs.mkdtempSync(path.join(os.tmpdir(), tempPrefix)));
  buildDirectories.push(fs.mkdtempSync(path.join(os.tmpdir(), tempPrefix)));

  const sentinelPath = path.join(buildDirectories[0], "unrelated-sentinel.txt");
  fs.writeFileSync(sentinelPath, "preserve me\n");
  for (const buildDirectory of buildDirectories) build(buildDirectory);
  build(buildDirectories[0]);
  assert.equal(fs.readFileSync(sentinelPath, "utf8"), "preserve me\n", "unrelated output survives repeated builds");

  for (const distOutput of distOutputs) {
    if (!fs.existsSync(distOutput)) {
      fs.mkdirSync(distOutput, { recursive: true });
      createdDistOutputs.push(distOutput);
    }
    const distSentinelPath = path.join(distOutput, `unrelated-sentinel-${process.pid}.txt`);
    distSentinelPaths.push(distSentinelPath);
    fs.writeFileSync(distSentinelPath, "preserve dist root sentinel\n");
    build(distOutput);
    assert.equal(
      fs.readFileSync(distSentinelPath, "utf8"),
      "preserve dist root sentinel\n",
      `unrelated output survives a build at ${path.basename(distOutput)}`,
    );
  }

  for (const browser of browsers) {
    const archives = buildDirectories.map((buildDirectory) => {
      const archivePath = path.join(buildDirectory, expectedArchiveName(browser));
      assert.ok(fs.existsSync(archivePath), `${browser} retained ZIP is missing`);
      assertArchiveContents(archivePath, browser);
      return archivePath;
    });

    assert.equal(
      sha256(archives[0]),
      sha256(archives[1]),
      `${browser} ZIP should be byte-for-byte reproducible`,
    );
  }

  unsafeOutputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arbitrary-output-"));
  const unsafeOutput = unsafeOutputDirectory;
  const unsafeSentinel = path.join(unsafeOutput, "unrelated-sentinel.txt");
  fs.writeFileSync(unsafeSentinel, "leave this directory alone\n");
  assert.throws(
    () => build(unsafeOutput, "pipe"),
    (error) => error.status === 1 && String(error.stderr).includes("Refusing unsafe output root"),
    "arbitrary output roots are rejected",
  );
  assert.equal(fs.readFileSync(unsafeSentinel, "utf8"), "leave this directory alone\n", "rejected root is untouched");

  console.log("Package reproducibility checks passed");
} finally {
  for (const buildDirectory of buildDirectories) {
    if (fs.existsSync(buildDirectory) && isOwnedTempDirectory(buildDirectory)) {
      fs.rmSync(buildDirectory, { recursive: true, force: true });
    }
  }
  if (unsafeOutputDirectory && fs.existsSync(unsafeOutputDirectory)) {
    fs.rmSync(unsafeOutputDirectory, { recursive: true, force: true });
  }
  for (const sentinelPath of distSentinelPaths) {
    if (fs.existsSync(sentinelPath)) fs.rmSync(sentinelPath, { force: true });
  }
  for (const distOutput of createdDistOutputs) {
    if (fs.existsSync(distOutput)) fs.rmSync(distOutput, { recursive: true, force: true });
  }
}
