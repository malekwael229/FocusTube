#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const ZIP_SAFE_TIMESTAMP = new Date("1980-01-01T00:00:00.000Z");
const generatedDirectoryPattern = /^(?:chromium|firefox|FocusTube-(?:release-(?:chromium|firefox)-v[^/]+|test-(?:chromium|firefox)))$/;
const generatedZipPattern = /^(?:chromium|firefox)\.zip$|^FocusTube-(?:release-(?:chromium|firefox)-v[^/]+|test-(?:chromium|firefox))\.zip$/;
const runtimeFiles = [
  "background.js",
  "content-common.js",
  "content-fb.js",
  "content-ig.js",
  "content-li.js",
  "content-tt.js",
  "content-yt.js",
  "content.css",
  "styles.css",
  "popup.html",
  "popup.js",
  "options.html",
  "options.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

function enableReproducibleZipMetadata() {
  if (process.env.FOCUSTUBE_REPRODUCIBLE_ZIP !== "1") return;
  const originalDate = Date;
  const fixedTime = ZIP_SAFE_TIMESTAMP.getTime();
  global.Date = class extends originalDate {
    constructor(...args) {
      super(...(args.length === 0 ? [fixedTime] : args));
    }

    static now() {
      return fixedTime;
    }
  };

  const originalReaddir = fs.readdir;
  fs.readdir = (directory, callback) => originalReaddir(directory, (error, files) => {
    callback(error, files && files.sort());
  });
  fs.stat = (file, callback) => {
    try {
      callback(null, fs.statSync(file));
    } catch (error) {
      callback(error);
    }
  };
  fs.readFile = (file, callback) => {
    try {
      callback(null, fs.readFileSync(file));
    } catch (error) {
      callback(error);
    }
  };
}

enableReproducibleZipMetadata();

function parseArgs() {
  const args = process.argv.slice(2);
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const explicitOutput = positional.length > 0;
  return {
    outputRoot: path.resolve(root, positional[0] || path.join(".tmp", "test-builds")),
    explicitOutput,
    zip: process.argv.includes("--zip"),
    retain: process.argv.includes("--retain"),
  };
}

function realpathWithMissingTail(target) {
  let current = target;
  const missing = [];
  while (!fs.existsSync(current)) {
    missing.unshift(path.basename(current));
    current = path.dirname(current);
  }
  return path.join(fs.realpathSync(current), ...missing);
}

function isDescendant(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function validateOutputRoot(outputRoot) {
  const resolvedOutput = realpathWithMissingTail(outputRoot);
  const resolvedRepositoryRoot = fs.realpathSync(root);
  const allowedDistRoots = [
    path.join(resolvedRepositoryRoot, "dist-release-builds"),
    path.join(resolvedRepositoryRoot, "dist-test-builds"),
  ];
  const repositoryOutput = allowedDistRoots.some((directory) => resolvedOutput === directory);
  const temporaryRepositoryRoot = path.join(resolvedRepositoryRoot, ".tmp");
  const temporaryRepositoryOutput = isDescendant(resolvedOutput, temporaryRepositoryRoot);
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const temporaryOutput = isDescendant(resolvedOutput, temporaryRoot)
    && path.dirname(resolvedOutput) === temporaryRoot
    && path.basename(resolvedOutput).toLowerCase().startsWith("focustube-");

  if (!repositoryOutput && !temporaryRepositoryOutput && !temporaryOutput) {
    throw new Error(
      `Refusing unsafe output root ${outputRoot}; use a dedicated child of .tmp, dist-release-builds, dist-test-builds, or an owned temporary directory`,
    );
  }
}

function cleanGeneratedOutputs(outputRoot) {
  for (const entry of fs.readdirSync(outputRoot)) {
    if (entry === ".web-ext-artifacts" || generatedDirectoryPattern.test(entry) || generatedZipPattern.test(entry)) {
      fs.rmSync(path.join(outputRoot, entry), { recursive: true, force: true });
    }
  }
}

function copyRuntimeFiles(destination) {
  for (const relativePath of runtimeFiles) {
    const source = path.join(root, relativePath);
    const target = path.join(destination, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    fs.utimesSync(target, ZIP_SAFE_TIMESTAMP, ZIP_SAFE_TIMESTAMP);
  }
}

function createBuild(outputRoot, browser, manifestName, retained) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestName), "utf8"));
  const directoryName = retained
    ? `FocusTube-release-${browser}-v${manifest.version}`
    : browser;
  const destination = path.join(outputRoot, directoryName);
  fs.mkdirSync(destination, { recursive: true });
  copyRuntimeFiles(destination);
  const manifestPath = path.join(destination, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.utimesSync(manifestPath, ZIP_SAFE_TIMESTAMP, ZIP_SAFE_TIMESTAMP);
  return { destination, version: manifest.version };
}

function createZip(sourceDir, outputRoot, browser, version, retained) {
  const artifactsDir = path.join(outputRoot, ".web-ext-artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules", "web-ext", "bin", "web-ext.js"),
      "build",
      "--source-dir",
      sourceDir,
      "--artifacts-dir",
      artifactsDir,
      "--overwrite-dest",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        FOCUSTUBE_REPRODUCIBLE_ZIP: "1",
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${__filename}`.trim(),
      },
      stdio: "inherit",
    },
  );
  const artifact = fs.readdirSync(artifactsDir).find((file) => /\.(zip|xpi)$/i.test(file));
  if (!artifact) throw new Error(`web-ext produced no archive for ${browser}`);
  const archiveName = retained
    ? `FocusTube-release-${browser}-v${version}.zip`
    : `${browser}.zip`;
  fs.renameSync(path.join(artifactsDir, artifact), path.join(outputRoot, archiveName));
}

function main() {
  const { outputRoot, explicitOutput, zip, retain } = parseArgs();
  validateOutputRoot(outputRoot);
  fs.mkdirSync(outputRoot, { recursive: true });
  cleanGeneratedOutputs(outputRoot);
  const retainedBuild = explicitOutput && retain;
  const chromium = createBuild(outputRoot, "chromium", "chrome-manifest.json", retainedBuild);
  const firefox = createBuild(outputRoot, "firefox", "firefox-manifest.json", retainedBuild);
  if (zip) {
    createZip(chromium.destination, outputRoot, "chromium", chromium.version, retainedBuild);
    createZip(firefox.destination, outputRoot, "firefox", firefox.version, retainedBuild);
    fs.rmSync(path.join(outputRoot, ".web-ext-artifacts"), { recursive: true, force: true });
  }
  console.log(`Prepared Chromium and Firefox builds in ${outputRoot}`);
}

if (require.main === module) main();

module.exports = { runtimeFiles };
