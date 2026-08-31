import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

const SRC = path.join(ROOT, "content-li.js");

function makeEnv(bodyHTML) {
  const dom = new JSDOM(
    `<!doctype html><html><body class="ft-platform-li">${bodyHTML}</body></html>`,
    { url: "https://www.linkedin.com/feed/", pretendToBeVisual: true },
  );
  const w = dom.window;
  // jsdom lays nothing out; pretend every post is a normal 700px feed post.
  w.Element.prototype.getBoundingClientRect = function () {
    if (this.getAttribute("role") === "listitem") {
      // Stack the posts 700px apart so a cut height is meaningful.
      const all = [...this.ownerDocument.querySelectorAll('[role="listitem"]')];
      const top = all.indexOf(this) * 700;
      return { x: 0, y: top, top, left: 0, right: 470, bottom: top + 700, width: 470, height: 700 };
    }
    return { x: 0, y: 0, top: 0, left: 0, right: 470, bottom: 0, width: 470, height: 0 };
  };

  globalThis.__ftDoc = w.document;
  const CONFIG = {
    extensionEnabled: true,
    isDarkMode: true,
    isFocusMode: true,
    platformSettings: { li: "warn" },
    session: {},
    visualHiding: { liSuggested: true, liFeed: true, liAddFeed: true },
  };
  const FocusState = { shouldBlock: true, isWork: false, isBreak: false, isTimerActive: false };
  const Utils = {
    observers: [],
    isExtensionEnabled: () => true,
    shouldApplyVisualHiding: () => true,
    trackObserver: (o) => o,
    // Returns "" only when the runtime is dead; a stub that always did so
    // would silently skip the icon and never test it.
    getExtensionUrl: (path) => "chrome-extension://testid/" + path,
    // Real, not a stub: renderStub calls it, and a no-op would hide whether
    // the block draws its icon at all.
    createBadge(className) {
      const NS = "http://www.w3.org/2000/svg";
      const svg = globalThis.__ftDoc.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 64 64");
      svg.setAttribute("aria-hidden", "true");
      if (className) svg.setAttribute("class", className);
      const plate = globalThis.__ftDoc.createElementNS(NS, "rect");
      plate.setAttribute("fill", "#4facfe");
      svg.appendChild(plate);
      return svg;
    },
    registerLifecycle: () => {},
    ensureBody: (cb) => cb(),
    debugLog: () => {},
    // Faithful to content-common.js: caches the prior value so restore puts
    // it back. A no-op here would hide the very thing these tests check.
    _inlineStyleCache: new WeakMap(),
    setInlineStyle(el, prop, value, priority) {
      if (!el || !prop) return;
      let cache = this._inlineStyleCache.get(el);
      if (!cache) { cache = {}; this._inlineStyleCache.set(el, cache); }
      if (!cache[prop]) {
        cache[prop] = {
          value: el.style.getPropertyValue(prop),
          priority: el.style.getPropertyPriority(prop),
        };
      }
      if (value === null) el.style.removeProperty(prop);
      else el.style.setProperty(prop, value, priority || "");
    },
    restoreInlineStyle(el, prop) {
      if (!el || !prop) return;
      const cache = this._inlineStyleCache.get(el);
      if (!cache || !cache[prop]) return;
      const prior = cache[prop];
      if (prior.value === "") el.style.removeProperty(prop);
      else el.style.setProperty(prop, prior.value, prior.priority || "");
      delete cache[prop];
    },
    restoreInlineStyles: () => {},
    clearSession: () => {},
    isSessionAllowed: () => false,
    logStat: () => {},
    markKick: () => {},
    consumeKick: () => {},
    setAllowWindow: () => {},
    pruneDetachedElements: (set) => {
      set.forEach((el) => { if (!el || !el.isConnected) set.delete(el); });
    },
  };
  const ctx = vm.createContext({
    window: w, document: w.document, location: w.location,
    MutationObserver: w.MutationObserver,
    requestAnimationFrame: w.requestAnimationFrame.bind(w),
    setTimeout: w.setTimeout.bind(w), clearTimeout: w.clearTimeout.bind(w),
    NodeList: w.NodeList, Node: w.Node, NodeFilter: w.NodeFilter, URL: w.URL,
    console,
    Site: { isLI: () => true, isYT: () => false, isTT: () => false, isFB: () => false, isIG: () => false },
    CONFIG, FocusState, Utils,
    UI: { remove() {}, create() {}, showKickNotification() {}, overlayId: "x" },
    setTimeoutRef: null,
    chrome: {
      runtime: { id: "test", getURL: (p) => "chrome-extension://testid/" + p },
      storage: { onChanged: { addListener() {} } },
    },
    sessionStorage: w.sessionStorage,
  });
  ctx.globalThis = ctx;
  const code = fs.readFileSync(SRC, "utf8") + "\n;globalThis.__LIFeed = LIFeed;";
  vm.runInContext(code, ctx);
  return { w, doc: w.document, LIFeed: ctx.__LIFeed, CONFIG, FocusState, Utils };
}

const FIX = path.join(HERE, "fixtures") + path.sep;
const fixture = (name) => fs.readFileSync(FIX + name, "utf8");
const feed = (posts) => `<main>${posts.join("")}</main>`;

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { failures++; console.log("  FAIL  " + name + "\n        " + e.message); }
};

console.log("real LinkedIn markup (2026-08-30 capture)");
{
  const { doc, LIFeed } = makeEnv(feed([
    fixture("li-connection-post.html"),
    fixture("li-outside-network-post.html"),
    fixture("li-promoted-post.html"),
  ]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  const posts = LIFeed.posts();
  check("three top-level feed items found", () => assert.equal(posts.length, 3));
  check("the Follow control is found by its icon, not its label", () => {
    assert.ok(LIFeed.followButton(posts[1]), "not found on the outside-network post");
    assert.equal(LIFeed.followButton(posts[0]), null, "found on a connection's post");
  });
  check("Like/Comment/Repost/Send are not mistaken for a Follow control", () =>
    assert.equal(LIFeed.followButton(posts[0]), null));
  check("an organic post carries no Promoted label", () =>
    assert.ok(!LIFeed.headerLabels(posts[1]).some((t) => t.startsWith("promoted"))));
  check("the Promoted label is read from the header, not the caption", () =>
    assert.ok(LIFeed.headerLabels(posts[2]).includes("promoted")));

  LIFeed.tick();
  check("connection kept, outside-network hidden, promoted hidden", () =>
    assert.deepEqual(posts.map((p) => p.dataset.ftLiClass),
      ["keep", "suggested", "ad"]));
  check("only the two are collapsed", () =>
    assert.deepEqual(posts.map((p) => p.classList.contains("ft-li-collapsed")),
      [false, true, true]));
  check("the block names the author", () =>
    assert.equal(posts[1].querySelector(".ft-li-stub p").textContent,
      "Marcus Elliott is not someone you follow."));
  check("the promoted block says so", () =>
    assert.equal(posts[2].querySelector(".ft-li-stub h3").textContent,
      "Promoted post"));
  check("height rides on an attribute, never the post's style", () => {
    assert.equal(posts[1].dataset.ftLiHeight, "700");
    assert.equal(posts[1].getAttribute("style"), null);
    assert.equal(posts[1].querySelector(".ft-li-stub").style.getPropertyValue("height"),
      "700px");
  });
  check("LinkedIn blanking style attributes changes nothing", () => {
    posts.forEach((p) => p.setAttribute("style", ""));
    LIFeed.tick();
    assert.deepEqual(posts.map((p) => p.classList.contains("ft-li-collapsed")),
      [false, true, true]);
    assert.equal(posts[1].querySelector(".ft-li-stub").style.getPropertyValue("height"),
      "700px");
  });
  check("ticking again makes no duplicate blocks", () => {
    LIFeed.tick(); LIFeed.tick();
    assert.deepEqual(posts.map((p) => p.querySelectorAll(":scope > .ft-li-stub").length),
      [0, 1, 1]);
  });
}

console.log("\nthe two cases that got through");
{
  // "Connect" is an <a>, not a <button>, and carries a different icon. Looking
  // only for buttons with the plus icon missed it entirely.
  const { doc, LIFeed } = makeEnv(feed([fixture("li-connect-post.html")]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  const post = LIFeed.posts()[0];
  check("a Connect link counts as a connect control", () => {
    const control = LIFeed.followButton(post);
    assert.ok(control, "not found");
    assert.equal(control.tagName, "A");
  });
  LIFeed.tick();
  check("the post is hidden", () => {
    assert.equal(post.dataset.ftLiClass, "suggested");
    assert.ok(post.classList.contains("ft-li-collapsed"));
  });
  check("the author is the post author, not whoever reacted to it", () =>
    assert.equal(post.querySelector(".ft-li-stub p").textContent,
      "Dana Whitfield is not someone you follow."));
}
{
  // This promoted post routes its call-to-action through
  // linkedin.com/safety/go/ exactly as an organic post does, so "links
  // straight out of LinkedIn" was never a usable signal.
  const { doc, LIFeed } = makeEnv(feed([fixture("li-promoted-safelink-post.html")]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  LIFeed.tick();
  const post = LIFeed.posts()[0];
  check("a promoted post using the safety redirect is still an ad", () =>
    assert.equal(post.dataset.ftLiClass, "ad"));
  check("it is hidden and labelled", () => {
    assert.ok(post.classList.contains("ft-li-collapsed"));
    assert.equal(post.querySelector(".ft-li-stub h3").textContent, "Promoted post");
  });
}
{
  // A caption that happens to say "promoted" must not read as an ad label.
  const post = fixture("li-connection-post.html").replace(
    "Откликаюсь на hh — много отказов",
    "Just got promoted at work, sponsored by a lot of coffee");
  const { doc, LIFeed } = makeEnv(feed([post]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  LIFeed.tick();
  check("'promoted' in the caption is not an ad label", () =>
    assert.equal(LIFeed.posts()[0].dataset.ftLiClass, "keep"));
}
{
  // The whole point of dropping the <img>: no extension URL, no request.
  const { doc, LIFeed } = makeEnv(feed([fixture("li-outside-network-post.html")]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  LIFeed.tick();
  check("the block icon is inline, not fetched from the extension", () => {
    const stub = doc.querySelector(".ft-li-stub");
    assert.equal(stub.querySelector("img"), null, "still using an <img>");
    assert.ok(stub.querySelector("svg.ft-li-stub-icon"), "no inline icon");
    assert.equal(doc.querySelectorAll("[src]").length > 0, true, "fixture images missing");
    assert.equal(doc.querySelectorAll('[src^="chrome-extension"]').length, 0);
  });
}

console.log("\nfailing open");
{
  const half = fixture("li-outside-network-post.html")
    .replace(/<svg[^>]*id="thumbs-up-outline-small"[\s\S]*?<\/svg>/, "");
  const { doc, LIFeed } = makeEnv(feed([half]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  LIFeed.tick();
  check("a post that has not finished rendering is left alone", () => {
    const p = LIFeed.posts()[0];
    assert.equal(p.dataset.ftLiClass, undefined);
    assert.equal(p.classList.contains("ft-li-collapsed"), false);
  });
}
{
  // A reshared post nests a second listitem; judging the inner one would
  // collapse part of the outer post.
  const inner = fixture("li-outside-network-post.html");
  const outer = fixture("li-connection-post.html")
    .replace("</div>\n</div>\n", inner + "</div>\n</div>\n");
  const { doc, LIFeed } = makeEnv(feed([outer]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  check("only top-level feed items are judged", () =>
    assert.equal(LIFeed.posts().length, 1));
}

console.log("\nrestore and gating");
{
  const { doc, LIFeed, CONFIG, FocusState, Utils } = makeEnv(feed([
    fixture("li-connection-post.html"),
    fixture("li-outside-network-post.html"),
  ]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  LIFeed.tick();
  const target = LIFeed.posts()[1];
  check("'View Anyway' reveals that post and it stays revealed", () => {
    target.querySelector(".ft-li-stub-btn").dispatchEvent(
      new doc.defaultView.MouseEvent("click", { bubbles: true }));
    assert.equal(target.classList.contains("ft-li-collapsed"), false);
    assert.equal(target.dataset.ftLiHeight, undefined);
    LIFeed.tick();
    assert.equal(target.classList.contains("ft-li-collapsed"), false);
  });
  check("strict mode retakes it and offers no way through", () => {
    CONFIG.platformSettings.li = "strict";
    LIFeed.tick();
    assert.equal(target.classList.contains("ft-li-collapsed"), true);
    assert.equal(target.dataset.ftLiReveal, undefined);
    assert.equal(doc.querySelector(".ft-li-stub-btn"), null);
  });
  check("switching back to warn redraws the button", () => {
    CONFIG.platformSettings.li = "warn";
    LIFeed.tick();
    assert.ok(doc.querySelector(".ft-li-stub-btn"));
  });
  check("a work timer forces strict", () => {
    FocusState.isWork = true;
    LIFeed.tick();
    assert.equal(doc.querySelector(".ft-li-stub-btn"), null);
    FocusState.isWork = false;
  });
  check("turning the setting off restores everything", () => {
    CONFIG.visualHiding.liSuggested = false;
    LIFeed.sync();
    assert.equal(doc.querySelectorAll(".ft-li-collapsed").length, 0);
    assert.equal(doc.querySelectorAll(".ft-li-stub").length, 0);
    assert.equal(doc.querySelectorAll("[data-ft-li-height]").length, 0);
    CONFIG.visualHiding.liSuggested = true;
  });
  check("off the feed it does nothing", () => {
    LIFeed.sync();
    LIFeed.tick();
    assert.ok(doc.querySelectorAll(".ft-li-collapsed").length > 0);
    doc.defaultView.history.pushState({}, "", "/jobs/");
    LIFeed.sync();
    assert.equal(doc.querySelectorAll(".ft-li-collapsed").length, 0);
    doc.defaultView.history.pushState({}, "", "/feed/");
  });
  check("with focus off it does nothing", () => {
    LIFeed.sync(); LIFeed.tick();
    assert.ok(doc.querySelectorAll(".ft-li-collapsed").length > 0);
    FocusState.shouldBlock = false;
    LIFeed.sync();
    assert.equal(doc.querySelectorAll(".ft-li-collapsed").length, 0);
    FocusState.shouldBlock = true;
  });
  check("with the extension off it does nothing", () => {
    LIFeed.sync(); LIFeed.tick();
    assert.ok(doc.querySelectorAll(".ft-li-collapsed").length > 0);
    Utils.isExtensionEnabled = () => false;
    LIFeed.sync();
    assert.equal(doc.querySelectorAll(".ft-li-collapsed").length, 0);
  });
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall green");
process.exit(failures ? 1 : 0);
