#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const buildRoot = path.join(root, ".tmp", "test-builds");
const chromiumBuild = path.join(buildRoot, "chromium");
const firefoxBuild = path.join(buildRoot, "firefox");

function run(command, args, env = process.env) {
  execFileSync(command, args, { cwd: root, env, stdio: "inherit" });
}

function collectJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
  });
}

function runSyntaxChecks() {
  const topLevelFiles = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.join(root, entry.name));
  const javascriptFiles = [
    ...topLevelFiles,
    ...collectJavaScriptFiles(path.join(root, "scripts")),
    ...collectJavaScriptFiles(path.join(root, "tests")),
  ].sort();
  for (const file of javascriptFiles) {
    run(process.execPath, ["--check", path.relative(root, file)]);
  }
}

function main() {
  if (process.argv.includes("--syntax")) {
    runSyntaxChecks();
    return;
  }

  fs.rmSync(buildRoot, { recursive: true, force: true });
  try {
    run(process.execPath, [path.join("scripts", "prepare-test-builds.js"), buildRoot]);
    runSyntaxChecks();
    run(process.execPath, [path.join("tests", "package-reproducibility.test.js")]);
    run(process.execPath, [path.join("tests", "regression.test.js")]);
    run(process.execPath, [path.join("tests", "pages-site.test.js")]);
    run(process.execPath, [path.join("tests", "background-timer.test.js")]);
    run(process.execPath, [path.join("tests", "playwright-smoke.test.js"), "--build-dir", chromiumBuild], {
      ...process.env,
      FOCUSTUBE_CHROMIUM_BUILD: chromiumBuild,
    });
    run(process.execPath, [
      path.join(root, "node_modules", "web-ext", "bin", "web-ext.js"),
      "lint",
      "--warnings-as-errors",
      "--source-dir",
      firefoxBuild,
    ]);
  } finally {
    fs.rmSync(buildRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main();
}
