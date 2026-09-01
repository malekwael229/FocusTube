"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { sites } = require("./site-checks");

function redact(value) {
  return String(value).replace(/https?:\/\/[^\s"<>]+/g, (text) => {
    try { const u = new URL(text); return u.origin + u.pathname; } catch { return "[URL]"; }
  }).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(token|authorization|cookie|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replaceAll(process.env.USERPROFILE || "__no_user_profile__", "[user-profile]").slice(0, 5000);
}

function matrixStatus(cases) {
  if (cases.some((c) => c.status === "FAIL")) return "FAIL";
  if (!cases.some((c) => c.status === "PASS")) return "BLOCKED";
  return cases.some((c) => c.status === "BLOCKED") ? "PARTIAL" : "PASS";
}

class Report {
  constructor(directory, metadata) {
    this.directory = directory;
    this.data = { ...metadata, startedAt: new Date().toISOString(), cases: [], browsers: [], manual: [], diagnostics: [] };
    fs.mkdirSync(directory, { recursive: true });
    this.session = null;
  }

  use(session) { this.session = session; }

  entry(meta) {
    return { timestamp: new Date().toISOString(), browser: this.session?.name || "Harness",
      browserVersion: this.session?.version || "unavailable", route: meta.route || "not applicable",
      mode: meta.mode || "not applicable", settings: meta.settings || {}, scope: meta.scope || "live-site",
      ...meta, consoleErrors: [], extensionErrors: [], screenshot: null };
  }

  block(meta, reason, category = "D") {
    this.lastCategory = category;
    this.data.cases.push({ ...this.entry(meta), status: "BLOCKED", actual: "Not proved", reason: redact(reason), category });
    this.write();
  }

  async case(meta, page, action) {
    const record = this.entry(meta);
    try {
      record.actual = await action();
      record.status = "PASS";
    } catch (error) {
      record.status = error.code === "BLOCKED" ? "BLOCKED" : "FAIL";
      record.category = error.category || "D";
      record.reason = redact(error.message);
      record.triage = error.category ? "Explicit classification" : "Unclassified mismatch; stop and diagnose harness versus product";
      this.lastCategory = record.category;
      if (page) {
        try {
          const file = String(this.data.cases.length).padStart(4, "0") + ".png";
          await page.screenshot(path.join(this.directory, file)); record.screenshot = file;
        } catch (captureError) { record.screenshotError = redact(captureError.message); }
      }
    }
    if (page?.getErrors) {
      try { record.consoleErrors = (await page.getErrors()).map((e) => redact(typeof e === "string" ? e : JSON.stringify(e))); }
      catch (error) { record.consoleCollectionGap = redact(error.message); }
    } else record.consoleCollectionGap = "Driver cannot collect page console errors";
    if (this.session?.backgroundErrors) {
      try { record.extensionErrors = (await this.session.backgroundErrors()).map((e) => redact(typeof e === "string" ? e : JSON.stringify(e))); }
      catch (error) { record.extensionCollectionGap = redact(error.message); }
    }
    this.data.cases.push(record);
    console.log(record.status + " " + record.browser + " " + record.id + (record.reason ? ": " + record.reason : ""));
    this.write();
    if (record.status === "FAIL") {
      const error = new Error(record.reason);
      error.code = "CASE_FAILURE";
      error.category = record.category;
      throw error;
    }
    return record.status === "PASS";
  }

  write() {
    const names = [...new Set(this.data.requestedBrowsers || this.data.browsers.map((b) => b.name))];
    this.data.matrix = Object.fromEntries(Object.values(sites).map((site) => [site.name,
      Object.fromEntries(names.map((name) => [name, matrixStatus(this.data.cases.filter((c) => c.site === site.name && c.browser === name && c.scope === "live-site"))]))]));
    const counts = { PASS: 0, FAIL: 0, BLOCKED: 0 };
    for (const record of this.data.cases) counts[record.status]++;
    this.data.counts = counts;
    fs.writeFileSync(path.join(this.directory, "results.json"), JSON.stringify(this.data, null, 2) + "\n");
    const text = ["# FocusTube 2.3.1 Browser Validation", "", "Started: " + this.data.startedAt,
      "", "PASS proves only the named scope. Fixtures, instrumented timers and live sites are not interchangeable.",
      "Run limits: " + JSON.stringify({ quick: this.data.quick, sitesOnly: this.data.sitesOnly, extensionOnly: this.data.extensionOnly, selectedSites: this.data.selectedSites }),
      "", "| Site | " + names.join(" | ") + " |", "| --- | " + names.map(() => "---").join(" | ") + " |",
      ...Object.entries(this.data.matrix).map(([site, values]) => "| " + site + " | " + names.map((name) => values[name]).join(" | ") + " |"),
      "", "## Results", "", "PASS " + counts.PASS + ", FAIL " + counts.FAIL + ", BLOCKED " + counts.BLOCKED,
      "", "| Browser | Case | Scope | Result | Detail |", "| --- | --- | --- | --- | --- |",
      ...this.data.cases.map((c) => "| " + [c.browser, c.id || c.mode, c.scope, c.status, c.reason || c.expected].map((s) => String(s).replace(/[\r\n|]/g, " ")).join(" | ") + " |"),
      "", "## Manual Checks Still Required", "", ...this.data.manual.map((m) => "- " + m),
      "", "## Boundaries", "", "No publishing or production source edits. Profiles and screenshots stay in ignored local storage. Do not upload them without inspecting for personal data.",
      "Classification: A product regression; B markup; C auth/account/locale/challenge; D automation limitation or untriaged assertion; E network.",
      "", ...this.data.diagnostics.map((d) => "- " + d)];
    fs.writeFileSync(path.join(this.directory, "report.md"), text.join("\n") + "\n");
  }
}

module.exports = { Report, matrixStatus, redact };
