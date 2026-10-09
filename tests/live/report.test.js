"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Report, matrixStatus, redact } = require("./report");
const { reportExitCode } = require("../live-browser.test");
const { parseListeningPort } = require("./firefox-driver");
const { isOwnChromiumError } = require("./chromium-driver");
const { verifyYouTubeShortsRedirectFixture, verifyYouTubeShorts } = require("../playwright-smoke.test");

test("an absent or entirely blocked site never passes", () => {
  assert.equal(matrixStatus([]), "BLOCKED");
  assert.equal(matrixStatus([{ status: "BLOCKED" }]), "BLOCKED");
});
test("a partial pass is not full matrix completion", () => {
  assert.equal(matrixStatus([{ status: "PASS" }, { status: "BLOCKED" }]), "PARTIAL");
  assert.equal(matrixStatus([{ status: "PASS" }]), "PASS");
});
test("failures are never erased by other passing checks", () => {
  assert.equal(matrixStatus([{ status: "PASS" }, { status: "FAIL" }, { status: "BLOCKED" }]), "FAIL");
});
test("diagnostics redact query tokens, email addresses and authorization values", () => {
  const result = redact("https://example.com/path?token=secret#private person@example.com token=secret");
  assert.equal(result, "https://example.com/path [email] token=[redacted]");
});
test("report output identifies the 2.5.0 browser validation", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "focustube-report-heading-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const report = new Report(directory, { requestedBrowsers: ["Fixture"] });
  report.write();
  const output = fs.readFileSync(path.join(directory, "report.md"), "utf8");
  assert.match(output, /^# FocusTube 2\.5\.0 Browser Validation$/m);
});
test("Firefox driver accepts only a loopback port reported by geckodriver", () => {
  assert.equal(
    parseListeningPort("123 geckodriver INFO Listening on 127.0.0.1:55056\n"),
    55056,
  );
  assert.equal(parseListeningPort("Listening on 0.0.0.0:55056"), null);
  assert.equal(parseListeningPort("Listening on 127.0.0.1:70000"), null);
});

function fixtureReport(t, diagnostics = []) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "focustube-report-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const report = new Report(directory, { requestedBrowsers: ["Fixture"] });
  report.use({ name: "Fixture", version: "1", extensionId: "ours",
    extensionURL: "moz-extension://ours/", backgroundErrors: async () => diagnostics.splice(0) });
  return report;
}
const caseMeta = { id: "probe", site: "extension", scope: "extension-ui", expected: "successful action and truthful diagnostics" };

test("confirmed own runtime error fails a successful action and takes precedence over a gap", async (t) => {
  const report = fixtureReport(t, [
    { message: "uncaught failure", severity: "error", sourceName: "moz-extension://ours/background.js", ownExtension: true },
    { message: "collector unavailable", kind: "gap" },
  ]);
  await assert.rejects(report.case(caseMeta, null, async () => "action succeeded"), { code: "CASE_FAILURE", category: "A" });
  assert.equal(report.data.cases[0].status, "FAIL");
  assert.equal(report.data.cases[0].extensionErrors.length, 2);
  assert.equal(report.data.counts.FAIL, 1);
  assert.equal(reportExitCode(report), 1);
});

test("collection gaps block a successful action", async (t) => {
  const report = fixtureReport(t, ["DIAGNOSTIC GAP: worker collector unavailable"]);
  assert.equal(await report.case(caseMeta, null, async () => "action succeeded"), false);
  assert.equal(report.data.cases[0].status, "BLOCKED");
  assert.equal(reportExitCode(report), 2);
});

test("warning, info, unrelated extension and site errors remain recorded without false failure", async (t) => {
  const report = fixtureReport(t, [
    { message: "warning", severity: "warning", ownExtension: true },
    { message: "information", severity: "info", ownExtension: true },
    { message: "another add-on", severity: "error", sourceName: "moz-extension://another/background.js", ownExtension: false },
  ]);
  const page = { url: async () => "https://www.youtube.com/", getErrors: async () => [{ message: "site exception", severity: "error", sourceName: "https://www.youtube.com/site.js" }] };
  assert.equal(await report.case(caseMeta, page, async () => "action succeeded"), true);
  assert.equal(report.data.cases[0].extensionErrors.length, 3);
  assert.equal(report.data.cases[0].consoleErrors.length, 1);
  assert.equal(reportExitCode(report), 0);
});

test("own extension page errors fail while unavailable page collectors block", async (t) => {
  const report = fixtureReport(t);
  const page = { url: async () => "moz-extension://ours/popup.html", getErrors: async () => ["uncaught page error"] };
  await assert.rejects(report.case(caseMeta, page, async () => "action succeeded"), { code: "CASE_FAILURE" });
  const gap = fixtureReport(t);
  await gap.case(caseMeta, { getErrors: async () => { throw new Error("collector failed"); } }, async () => "action succeeded");
  assert.equal(gap.data.cases[0].status, "BLOCKED");
});

test("terminal-only errors and gaps affect counts and exit before session close", async (t) => {
  for (const [diagnostic, status, exitCode] of [
    [{ message: "last worker exception", severity: "error", ownExtension: true }, "FAIL", 1],
    [{ message: "last collection gap", kind: "gap" }, "BLOCKED", 2],
  ]) {
    const diagnostics = [];
    const report = fixtureReport(t, diagnostics);
    await report.case(caseMeta, null, async () => "action succeeded");
    diagnostics.push(diagnostic);
    let closed = false;
    report.session.close = async () => { closed = true; };
    const finish = report.finishSession();
    if (status === "FAIL") await assert.rejects(finish, { code: "CASE_FAILURE" });
    else await finish;
    assert.equal(closed, false, "final collection runs before browser closure");
    assert.equal(report.data.cases.at(-1).status, status);
    assert.equal(report.data.counts[status], 1);
    assert.equal(report.data.cases.at(-1).extensionErrors.length, 1);
    assert.equal(reportExitCode(report), exitCode);
    await report.session.close();
  }
});

test("page-less cases do not invent a page diagnostic gap and action FAIL survives collection gaps", async (t) => {
  const report = fixtureReport(t);
  assert.equal(await report.case(caseMeta, null, async () => "no page needed"), true);
  assert.equal(report.data.cases[0].consoleCollectionGap, undefined);
  const failed = fixtureReport(t, [{ message: "gap", kind: "gap" }]);
  await assert.rejects(failed.case(caseMeta, null, async () => { throw new Error("actual mismatch"); }), { code: "CASE_FAILURE" });
  assert.equal(failed.data.cases[0].status, "FAIL");
});

test("Shorts fixture removes only its owned handler and closes pages after assertion failure", async () => {
  const calls = [], failure = new Error("fixture assertion failed");
  const settings = { goto: async () => {}, waitForLoadState: async () => {}, evaluate: async () => {}, close: async () => calls.push("settings-close") };
  const page = { goto: async () => {}, waitForFunction: async () => { throw failure; }, close: async () => calls.push("page-close") };
  let ownHandler;
  const context = {
    newPage: async () => ownHandler ? page : settings,
    route: async (pattern, handler) => { calls.push(pattern); ownHandler = handler; },
    unroute: async (pattern, handler) => { assert.equal(pattern, "https://www.youtube.com/shorts/**"); assert.equal(handler, ownHandler); calls.push("unroute"); },
  };
  await assert.rejects(verifyYouTubeShortsRedirectFixture(context, "ours"), failure);
  assert.deepEqual(calls, ["https://www.youtube.com/shorts/**", "unroute", "page-close", "settings-close"]);
});

test("optional Shorts uses a fresh context and cannot pass a failed real-response prerequisite", async () => {
  let closed = false, launched = false;
  const page = { goto: async () => ({ ok: () => false, status: () => 503 }), close: async () => {} };
  const context = { newPage: async () => page, close: async () => { closed = true; } };
  const browserType = { launchPersistentContext: async () => { launched = true; return context; } };
  await assert.rejects(verifyYouTubeShorts(browserType), /BLOCKED.*real YouTube/i);
  assert.equal(launched, true);
  assert.equal(closed, true);
});

test("Chromium attributes content-script errors by exact own extension frames", () => {
  const extension = "chrome-extension://ours/", site = "https://www.youtube.com/";
  assert.equal(isOwnChromiumError({ stack: "at chrome-extension://ours/content-yt.js:10:1" }, site, extension), true);
  assert.equal(isOwnChromiumError({ stack: "at chrome-extension://another/content.js:10:1" }, site, extension), false);
  assert.equal(isOwnChromiumError({ stack: "at https://www.youtube.com/site.js:10:1" }, site, extension), false);
  assert.equal(isOwnChromiumError({}, extension + "popup.html", extension), true);
});

test("Firefox injected collector preserves nsIScriptError flags and separates severity", () => {
  const driver = fs.readFileSync(path.join(__dirname, "firefox-driver.js"), "utf8");
  const collector = driver.match(/async function backgroundErrors\(\) \{\s*const messages = await privileged\(`([\s\S]*?)`, extensionId\);/)[1];
  class ScriptError {
    constructor(message, flags, sourceName) { Object.assign(this, { errorMessage: message, flags, sourceName, category: "JavaScript" }); }
  }
  ScriptError.warningFlag = 1;
  ScriptError.infoFlag = 8;
  const sourceName = "moz-extension://ours/background.js";
  const messages = [new ScriptError("error", 0, sourceName), new ScriptError("exception", 2, sourceName),
    new ScriptError("warning", 1, sourceName), new ScriptError("info", 8, sourceName),
    new ScriptError("other extension", 0, "moz-extension://another/background.js"),
    new ScriptError("site noise", 0, "https://www.youtube.com/site.js")];
  // Execute the same serialized collector sent to Firefox, with its native console boundary isolated.
  const collect = new Function("Services", "Ci", "return function () {" + collector + "};")(
    { console: { getMessageArray: () => messages } }, { nsIScriptError: ScriptError });
  const result = collect("ours@addon");
  assert.deepEqual(result.map(item => [item.message, item.flags, item.severity]), [
    ["error", 0, "error"], ["exception", 2, "error"], ["warning", 1, "warning"],
    ["info", 8, "info"], ["other extension", 0, "error"],
  ]);
});

test("exact own origin errors fail without flags from a different add-on and unknown own severity blocks", async (t) => {
  const report = fixtureReport(t, [{ message: "ours", sourceName: "moz-extension://ours/background.js", severity: "error" }]);
  await assert.rejects(report.case(caseMeta, null, async () => "succeeded"), { code: "CASE_FAILURE" });
  const unknown = fixtureReport(t, [{ message: "unclassified", sourceName: "moz-extension://ours/background.js" }]);
  assert.equal(await unknown.case(caseMeta, null, async () => "succeeded"), false);
  assert.equal(unknown.data.cases[0].status, "BLOCKED");
});

test("Chromium inventory, sideload and worker identification limitations block instead of becoming runtime errors", async (t) => {
  for (const message of ["Extension inventory unavailable: denied", "Automated sideload unavailable: denied", "Worker identification unavailable: denied"]) {
    const report = fixtureReport(t, [message]);
    assert.equal(await report.case(caseMeta, null, async () => "succeeded"), false);
    assert.equal(report.data.cases[0].status, "BLOCKED");
    assert.equal(report.data.cases[0].category, "D");
  }
});

test("a session missing its required background collector cannot silently pass", async (t) => {
  const report = fixtureReport(t);
  delete report.session.backgroundErrors;
  assert.equal(await report.case(caseMeta, null, async () => "action succeeded"), false);
  assert.equal(report.data.cases[0].status, "BLOCKED");
  assert.match(report.data.cases[0].extensionCollectionGap, /cannot collect extension/i);
  assert.equal(reportExitCode(report), 2);
});
