#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const catalog = JSON.parse(read("_locales/en/messages.json"));
const arabicCatalog = JSON.parse(read("_locales/ar/messages.json"));

function renderCatalogMessage(sourceCatalog, key, substitutions) {
  const entry = sourceCatalog[key];
  if (!entry) return "";
  const values = Array.isArray(substitutions)
    ? substitutions
    : substitutions === undefined
      ? []
      : [substitutions];
  let result = entry.message;
  Object.entries(entry.placeholders || {}).forEach(([name, placeholder]) => {
    const index = Number(placeholder.content.slice(1)) - 1;
    result = result.replaceAll(`$${name.toUpperCase()}$`, String(values[index] ?? ""));
  });
  return result;
}

function renderMessage(key, substitutions) {
  if (key === "@@bidi_dir") return "rtl";
  if (key === "@@ui_locale") return "ar_EG";
  return renderCatalogMessage(catalog, key, substitutions);
}

class FakeElement {
  constructor(attributes = {}, textContent = "") {
    this.attributes = { ...attributes };
    this.textContent = textContent;
    this.dataset = {};
    Object.entries(attributes).forEach(([name, value]) => {
      if (!name.startsWith("data-")) return;
      const property = name
        .slice(5)
        .replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      this.dataset[property] = value;
    });
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  matches(selector) {
    const match = selector.match(/^\[([^\]]+)\]$/);
    return Boolean(match && this.attributes[match[1]] !== undefined);
  }

  querySelectorAll() {
    return [];
  }
}

class FakeDocument {
  constructor(elements = [], readyState = "complete") {
    this.elements = elements;
    this.readyState = readyState;
    this.documentElement = new FakeElement();
    this.listeners = [];
  }

  querySelectorAll(selector) {
    return this.elements.filter((element) => element.matches(selector));
  }

  addEventListener(type, listener) {
    this.listeners.push([type, listener]);
  }
}

function loadHelper({ protocol, document, getMessage = renderMessage }) {
  const calls = [];
  const context = {
    chrome: {
      i18n: {
        getMessage(key, substitutions) {
          calls.push([key, substitutions]);
          return getMessage(key, substitutions);
        },
      },
    },
    document,
    location: { protocol },
  };
  context.globalThis = context;
  vm.runInNewContext(read("i18n.js"), context, { filename: "i18n.js" });
  return { helper: context.FT_I18N, calls };
}

function collectCatalogKeys() {
  const keys = new Set();
  for (const file of ["popup.html", "options.html"]) {
    for (const match of read(file).matchAll(/data-i18n(?:-(?:title|aria-label|placeholder))?="([^"]+)"/g)) {
      keys.add(match[1]);
    }
  }
  for (const file of [
    "background.js",
    "content-common.js",
    "content-fb.js",
    "content-ig.js",
    "content-li.js",
    "popup.js",
    "options.js",
  ]) {
    for (const match of read(file).matchAll(/(?:ftMessage|msg)\(\s*"([^"]+)"/g)) {
      keys.add(match[1]);
    }
  }
  for (const file of ["chrome-manifest.json", "firefox-manifest.json"]) {
    for (const match of read(file).matchAll(/__MSG_([^_][A-Za-z0-9_]*)__/g)) {
      keys.add(match[1]);
    }
  }
  return keys;
}

function placeholderContract(entry) {
  return Object.fromEntries(
    Object.entries(entry.placeholders || {})
      .map(([name, placeholder]) => [name.toLowerCase(), placeholder.content])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function namedTokens(message) {
  return [...new Set(message.match(/\$[A-Za-z][A-Za-z0-9_]*\$/g) || [])]
    .map((token) => token.toLowerCase())
    .sort();
}

function run() {
  assert.equal(Object.keys(catalog).length, 158, "canonical English key count");
  for (const [key, entry] of Object.entries(catalog)) {
    assert.equal(typeof entry.message, "string", `${key} has a message`);
    for (const [name, placeholder] of Object.entries(entry.placeholders || {})) {
      assert.match(placeholder.content, /^\$\d+$/, `${key}.${name} placeholder index`);
      assert.ok(
        entry.message.includes(`$${name.toUpperCase()}$`),
        `${key} message references ${name}`,
      );
    }
  }
  for (const key of collectCatalogKeys()) {
    assert.ok(catalog[key], `catalog contains referenced key ${key}`);
  }

  const text = new FakeElement(
    { "data-i18n": "tutorialProgress", "data-i18n-args": '[1,"7"]' },
    "fallback",
  );
  const accessible = new FakeElement(
    {
      "data-i18n-aria-label": "platformSettings",
      "data-i18n-args": '["YouTube"]',
      "aria-label": "fallback",
    },
  );
  const extensionDocument = new FakeDocument([text, accessible]);
  const { helper, calls } = loadHelper({
    protocol: "chrome-extension:",
    document: extensionDocument,
  });
  assert.equal(text.textContent, "1 of 7");
  assert.equal(accessible.getAttribute("aria-label"), "YouTube settings");
  assert.deepEqual(Array.from(helper.parseSubstitutions('[1,"two"]')), ["1", "two"]);
  assert.equal(helper.parseSubstitutions("plain"), "plain");
  assert.equal(extensionDocument.documentElement.getAttribute("dir"), "rtl");
  assert.equal(extensionDocument.documentElement.getAttribute("lang"), "ar-EG");
  assert.ok(calls.some(([key, values]) => key === "tutorialProgress" && values[0] === "1"));

  const hostText = new FakeElement({ "data-i18n": "enabled" }, "Host label");
  const hostDocument = new FakeDocument([hostText]);
  loadHelper({ protocol: "https:", document: hostDocument });
  assert.equal(hostText.textContent, "Host label");
  assert.equal(hostDocument.documentElement.getAttribute("dir"), null);
  assert.equal(hostDocument.documentElement.getAttribute("lang"), null);

  const scoped = new FakeElement({ "data-i18n": "storiesHidden" }, "fallback");
  const hostScopeDocument = new FakeDocument([hostText]);
  const { helper: hostHelper } = loadHelper({
    protocol: "https:",
    document: hostScopeDocument,
  });
  hostHelper.localizePage(scoped);
  hostHelper.applyDirection(scoped);
  assert.equal(scoped.textContent, "Stories Hidden");
  assert.equal(scoped.getAttribute("dir"), "rtl");
  assert.equal(hostText.textContent, "Host label");

  const fallbackDocument = new FakeDocument([]);
  const { helper: fallbackHelper } = loadHelper({
    protocol: "https:",
    document: fallbackDocument,
    getMessage() {
      throw new Error("unsupported");
    },
  });
  assert.equal(fallbackHelper.message("enabled", undefined, "Readable"), "Readable");

  const popupText = new FakeElement(
    { "data-i18n": "hideUiDistractions" },
    catalog.hideUiDistractions.message,
  );
  const optionsText = new FakeElement(
    { "data-i18n": "optionsPageTitle" },
    catalog.optionsPageTitle.message,
  );
  const arabicExtensionDocument = new FakeDocument([popupText, optionsText]);
  loadHelper({
    protocol: "chrome-extension:",
    document: arabicExtensionDocument,
    getMessage(key, substitutions) {
      if (key === "@@bidi_dir") return "rtl";
      if (key === "@@ui_locale") return "ar";
      return renderCatalogMessage(arabicCatalog, key, substitutions);
    },
  });
  assert.equal(popupText.textContent, arabicCatalog.hideUiDistractions.message);
  assert.equal(optionsText.textContent, arabicCatalog.optionsPageTitle.message);
  assert.equal(arabicExtensionDocument.documentElement.getAttribute("dir"), "rtl");
  assert.equal(arabicExtensionDocument.documentElement.getAttribute("lang"), "ar");

  const arabicOverlay = new FakeElement(
    { "data-i18n": "overlayStrictModeActive" },
    catalog.overlayStrictModeActive.message,
  );
  const arabicHostDocument = new FakeDocument([]);
  const { helper: arabicHostHelper } = loadHelper({
    protocol: "https:",
    document: arabicHostDocument,
    getMessage(key, substitutions) {
      if (key === "@@bidi_dir") return "rtl";
      if (key === "@@ui_locale") return "ar";
      return renderCatalogMessage(arabicCatalog, key, substitutions);
    },
  });
  arabicHostHelper.localizePage(arabicOverlay);
  arabicHostHelper.applyDirection(arabicOverlay);
  assert.equal(arabicOverlay.textContent, arabicCatalog.overlayStrictModeActive.message);
  assert.equal(arabicOverlay.getAttribute("dir"), "rtl");
  assert.equal(arabicOverlay.getAttribute("lang"), "ar");
  assert.equal(arabicHostDocument.documentElement.getAttribute("dir"), null);
  assert.equal(arabicHostDocument.documentElement.getAttribute("lang"), null);

  const chromeManifest = JSON.parse(read("chrome-manifest.json"));
  const firefoxManifest = JSON.parse(read("firefox-manifest.json"));
  assert.equal(chromeManifest.default_locale, "en");
  assert.equal(firefoxManifest.default_locale, "en");
  assert.deepEqual(firefoxManifest.background.scripts, ["i18n.js", "background.js"]);
  for (const manifest of [chromeManifest, firefoxManifest]) {
    manifest.content_scripts.forEach((entry) => assert.equal(entry.js[0], "i18n.js"));
  }
  assert.match(read("popup.html"), /i18n\.js[\s\S]*popup\.js/);
  assert.match(read("options.html"), /i18n\.js[\s\S]*options\.js/);

  const { runtimeFiles, supportedLocales } = require("../scripts/prepare-test-builds.js");
  assert.deepEqual(supportedLocales, ["en", "ar", "es", "pt_BR", "fr", "de", "tr", "id"]);
  const englishKeys = Object.keys(catalog).sort();
  for (const locale of supportedLocales) {
    const localizedCatalog = JSON.parse(read(`_locales/${locale}/messages.json`));
    assert.deepEqual(Object.keys(localizedCatalog).sort(), englishKeys, `${locale} catalog keys`);
    for (const key of englishKeys) {
      const entry = localizedCatalog[key];
      assert.equal(typeof entry.message, "string", `${locale}.${key} has a message`);
      assert.ok(entry.message.trim(), `${locale}.${key} message is not empty`);
      assert.deepEqual(
        placeholderContract(entry),
        placeholderContract(catalog[key]),
        `${locale}.${key} placeholder contract`,
      );
      assert.deepEqual(
        namedTokens(entry.message),
        namedTokens(catalog[key].message),
        `${locale}.${key} named substitution tokens`,
      );
    }
    assert.ok(localizedCatalog.extensionName.message.length <= 75, `${locale} manifest name length`);
    assert.ok(
      localizedCatalog.extensionDescription.message.length <= 132,
      `${locale} manifest description length`,
    );
  }
  assert.ok(runtimeFiles.includes("i18n.js"));
  assert.ok(runtimeFiles.includes("_locales/en/messages.json"));
  assert.match(read("styles.css"), /#timerDisplay[\s\S]*unicode-bidi:\s*isolate/);
  assert.match(read("content.css"), /\.focus-tube-warning\[dir="rtl"\]/);

  console.log("Localization checks passed");
}

run();
