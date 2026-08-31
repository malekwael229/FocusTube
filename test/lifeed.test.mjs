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
    visualHiding: { liSuggested: true, liFeed: true, liAddFeed: true, liActivity: true },
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
      ["keep", "activity", "ad"]));
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
    assert.equal(post.dataset.ftLiClass, "activity");
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

// ------------------------------------------------------- nested reposts
// The case the unscoped search got wrong: you follow somebody, they reshare
// a post from somebody you are not connected to, and the nested post's
// Connect control was read as the outer post's - hiding a post from a person
// you actually follow.
console.log("\na repost of somebody you are not connected to");

// Both captures are real; the repost is assembled from them rather than
// hand-written, so the nested header is real markup with a real Connect
// control in it.
function graft(doc, outerPost, donorHTML, { keepCommentary = true } = {}) {
  const donor = new JSDOM(`<main>${donorHTML}</main>`).window.document;
  const identity = donor.querySelector(
    'a[href*="/in/"] [aria-label], a[href*="/company/"] [aria-label]',
  );
  const connect = donor.querySelector('svg[id="connect-small"], svg[id="add-small"]');
  assert.ok(identity && connect, "donor capture lost its header or its control");
  // The smallest block holding both: the nested post's own author header.
  let block = identity;
  while (block && !block.contains(connect)) block = block.parentElement;
  assert.ok(block, "no common ancestor for the donor header");

  const body = outerPost.querySelector('[data-testid="expandable-text-box"]');
  assert.ok(body, "outer capture has no body mark");
  const anchor = keepCommentary ? body : null;
  const nested = doc.importNode(block, true);
  if (anchor) {
    // A reshare with commentary: the nested post sits below the commentary.
    anchor.parentNode.insertBefore(nested, anchor.nextSibling);
  } else {
    // A reshare with no commentary: no body mark at all, so the nested
    // header is the only thing marking where the outer header ended.
    body.parentNode.insertBefore(nested, body);
    body.remove();
  }
  return nested;
}

{
  const { doc, LIFeed } = makeEnv(feed([fixture("li-connection-post.html")]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  const post = LIFeed.posts()[0];
  const nested = graft(doc, post, fixture("li-connect-post.html"));

  check("the repost really does carry a Connect control", () =>
    assert.ok(post.querySelector('svg[id="connect-small"]')));
  check("it belongs to the nested post, not the outer one", () =>
    assert.ok(nested.querySelector('svg[id="connect-small"]')));
  check("the outer header stops before it", () => {
    const boundary = LIFeed.headerBoundary(post);
    assert.ok(boundary, "no boundary found");
    assert.equal(LIFeed.inHeader(boundary, nested), false);
  });
  check("so it is not read as the outer post's follow control", () =>
    assert.equal(LIFeed.followButton(post), null));
  check("and the repost is kept", () =>
    assert.equal(LIFeed.classify(post), "keep"));
  check("the outer author is still the one named", () =>
    assert.equal(LIFeed.author(post), "Marcus Elliott"));
}
{
  // The same repost with no commentary of its own, so there is no body mark
  // to stop at. The second identity block is what has to do the work.
  const { doc, LIFeed } = makeEnv(feed([fixture("li-connection-post.html")]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  const post = LIFeed.posts()[0];
  graft(doc, post, fixture("li-connect-post.html"), { keepCommentary: false });

  check("with no commentary there is no body mark", () =>
    assert.equal(post.querySelector('[data-testid="expandable-text-box"]'), null));
  check("the second author identity bounds the header instead", () => {
    const boundary = LIFeed.headerBoundary(post);
    assert.ok(boundary, "fell back to an unbounded search");
    assert.equal(boundary.getAttribute("aria-label"), "Dana Whitfield  2nd");
  });
  check("the nested Connect control is still not the outer post's", () =>
    assert.equal(LIFeed.followButton(post), null));
  check("and this repost is kept too", () =>
    assert.equal(LIFeed.classify(post), "keep"));
}
{
  // The scoping must not cost us the real case: a post from somebody outside
  // your network still has its own Follow control, in its own header.
  const { LIFeed } = makeEnv(feed([fixture("li-outside-network-post.html")]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  const post = LIFeed.posts()[0];
  check("a stranger's own Follow control is still found", () =>
    assert.ok(LIFeed.followButton(post)));
  check("and the post is still hidden", () =>
    assert.equal(LIFeed.classify(post), "activity"));
}
{
  // A promoted post nested inside a repost must not make the outer post an ad
  // either - headerLabels reads to the same boundary.
  const { doc, LIFeed } = makeEnv(feed([fixture("li-connection-post.html")]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  const post = LIFeed.posts()[0];
  const body = post.querySelector('[data-testid="expandable-text-box"]');
  const nested = doc.importNode(
    new JSDOM(`<main>${fixture("li-promoted-post.html")}</main>`).window.document
      .querySelector('[role="listitem"]'),
    true,
  );
  body.parentNode.insertBefore(nested, body.nextSibling);
  check("a nested promoted post does not make the outer post an ad", () =>
    assert.equal(LIFeed.classify(post), "keep"));
}

// --------------------------------------------- a control that paints late
console.log("\na Follow control that paints late");
{
  const { doc, LIFeed } = makeEnv(feed([fixture("li-connection-post.html")]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  LIFeed.tick();
  const post = LIFeed.posts()[0];
  check("judged 'keep' while the control is not there yet", () =>
    assert.equal(post.dataset.ftLiClass, "keep"));

  // LinkedIn paints the Follow control into the header a moment later.
  const donor = new JSDOM(`<main>${fixture("li-outside-network-post.html")}</main>`)
    .window.document;
  const control = donor.querySelector('svg[id="add-small"]').closest("button, a");
  assert.ok(control, "donor capture lost its Follow control");
  const boundary = LIFeed.headerBoundary(post);
  boundary.parentNode.insertBefore(doc.importNode(control, true), boundary);
  await new Promise((resolve) => setTimeout(resolve, 0));
  LIFeed.tick();
  check("the cached verdict is retired and the post hidden", () =>
    assert.equal(post.dataset.ftLiClass, "activity"));
  check("churn below the header leaves the verdict alone", () =>
    assert.equal(
      LIFeed.headerChurn(post, { addedNodes: [post.querySelector('[data-testid="expandable-text-box"]')] }),
      false,
    ));
  check("our own stub is not treated as churn", () =>
    assert.equal(
      LIFeed.isOwnMutation({ addedNodes: [post.querySelector(".ft-li-stub")] }),
      true,
    ));
}

// --------------------------------------------------- recycled feed nodes
console.log("\nLinkedIn recycling a feed item for a different post");
{
  const { doc, LIFeed } = makeEnv(feed([fixture("li-outside-network-post.html")]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  LIFeed.tick();
  const item = LIFeed.posts()[0];
  check("the outside-network post is collapsed", () => {
    assert.equal(item.dataset.ftLiClass, "activity");
    assert.ok(item.classList.contains("ft-li-collapsed"));
  });
  const wasKey = item.dataset.ftLiKey;
  check("the verdict is keyed to the post, not just the element", () =>
    assert.ok(wasKey, "no identity recorded"));

  // The same element, now holding a post from a connection.
  const holder = doc.createElement("div");
  holder.innerHTML = fixture("li-connection-post.html");
  const replacement = holder.querySelector('[role="listitem"]');
  item.setAttribute("componentkey", replacement.getAttribute("componentkey"));
  item.replaceChildren(...replacement.childNodes);
  LIFeed.tick();
  check("the previous post's verdict is not carried over", () =>
    assert.equal(item.dataset.ftLiClass, "keep"));
  check("the element is restored rather than left collapsed", () => {
    assert.equal(item.classList.contains("ft-li-collapsed"), false);
    assert.equal(item.querySelector(".ft-li-stub"), null);
    assert.equal(LIFeed.collapsed.has(item), false);
  });
}

// ------------------------------------------------ audio behind a collapse
console.log("\ncollapsing a post stops its video");
{
  const { doc, LIFeed } = makeEnv(feed([fixture("li-outside-network-post.html")]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  const post = LIFeed.posts()[0];
  const video = doc.createElement("video");
  let paused = false;
  Object.defineProperty(video, "paused", { get: () => paused });
  video.pause = () => { paused = true; };
  post.appendChild(video);
  LIFeed.tick();
  check("the post is collapsed", () =>
    assert.ok(post.classList.contains("ft-li-collapsed")));
  check("and its video is paused, not merely hidden", () =>
    assert.equal(video.paused, true));
  paused = false;
  LIFeed.tick();
  check("playback restarting after a re-render is caught on the next pass", () =>
    assert.equal(video.paused, true));
}

// ------------------------------------------- one author, three aria-labels
// The live-feed shape that the earlier fixtures had been reduced past: an
// author matches IDENTITY_MARK three times - avatar, name block, and the
// repeat of the name block below the timestamp. Counting those as three
// people ended the header above the author's own Follow control, so every
// post on the feed classified as "keep" and nothing was hidden at all.
console.log("\nan author with an avatar label and a repeated name block");
{
  const { LIFeed } = makeEnv(feed([fixture("li-follow-post.html")]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  const post = LIFeed.posts()[0];

  check("the selector really does match this author three times", () =>
    assert.equal(post.querySelectorAll(LIFeed.IDENTITY_MARK).length, 3));
  check("but they are all one person", () =>
    assert.equal(LIFeed.identities(post).length, 1));
  check("the avatar's own label is not counted", () => {
    const avatar = post.querySelector("figure [aria-label]");
    assert.ok(avatar, "fixture lost its avatar label");
    assert.ok(!LIFeed.identities(post).includes(avatar));
  });
  check("so the header runs to the body, not to a phantom second person", () => {
    const boundary = LIFeed.headerBoundary(post);
    assert.equal(boundary, post.querySelector('[data-testid="expandable-text-box"]'));
  });
  check("the Follow control is found", () => {
    const control = LIFeed.followButton(post);
    assert.ok(control, "not found");
    assert.ok(control.querySelector('svg[id="add-small"]'));
  });
  check("the post is hidden", () =>
    assert.equal(LIFeed.classify(post), "suggested"));
  check("the author is the writer, not the avatar's alt text", () =>
    assert.equal(LIFeed.author(post), "Harriet Vance"));

  LIFeed.tick();
  check("and it actually collapses on a tick", () =>
    assert.ok(post.classList.contains("ft-li-collapsed")));
}
{
  // The scoping still has to hold: the same post with a repost grafted in
  // below the commentary is a second real person, and must stay visible.
  const { doc, LIFeed } = makeEnv(feed([fixture("li-connection-post.html")]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  const post = LIFeed.posts()[0];
  const donor = new JSDOM(`<main>${fixture("li-follow-post.html")}</main>`).window.document;
  const identity = donor.querySelector('[aria-label="Harriet Vance Verified Profile 3rd+"]');
  const connect = donor.querySelector('svg[id="add-small"]');
  let block = identity;
  while (block && !block.contains(connect)) block = block.parentElement;
  const body = post.querySelector('[data-testid="expandable-text-box"]');
  body.parentNode.insertBefore(doc.importNode(block, true), body.nextSibling);

  check("a grafted repost is a genuinely second person", () =>
    assert.equal(LIFeed.identities(post).length, 2));
  check("the header stops at it or at the body, whichever comes first", () =>
    assert.ok(LIFeed.headerBoundary(post)));
  check("the nested Follow control is not the outer post's", () =>
    assert.equal(LIFeed.followButton(post), null));
  check("so the repost stays visible", () =>
    assert.equal(LIFeed.classify(post), "keep"));
}

// ------------------------------------------------------------- the two modes
// What reached you because somebody you know reacted to it is a different
// thing from what the feed guessed on its own, so the two are separable.
console.log("\nfriends only, or friends plus their activity");
{
  const { doc, LIFeed, CONFIG } = makeEnv(feed([
    fixture("li-connection-post.html"),        // a connection's own post
    fixture("li-outside-network-post.html"),   // "Followed by ..." - surfaced
    fixture("li-follow-post.html"),            // "From your activity" - guessed
    fixture("li-promoted-post.html"),          // an ad
  ]));
  LIFeed.active = true;
  LIFeed.ensureObserver();
  const posts = LIFeed.posts();
  LIFeed.tick();

  check("each post is judged by what it is, not by the setting", () =>
    assert.deepEqual(posts.map((p) => p.dataset.ftLiClass),
      ["keep", "activity", "suggested", "ad"]));
  check("the surfacing line is what separates the middle two", () => {
    assert.equal(LIFeed.surfacedByPerson(posts[1]), true);
    assert.equal(LIFeed.surfacedByPerson(posts[2]), false);
  });
  check("friends only: everything but the connection's post is hidden", () =>
    assert.deepEqual(posts.map((p) => p.classList.contains("ft-li-collapsed")),
      [false, true, true, true]));
  check("the activity block says why it is there", () =>
    assert.equal(posts[1].querySelector(".ft-li-stub h3").textContent,
      "Someone in your network reacted to this"));

  CONFIG.visualHiding.liActivity = false;
  LIFeed.tick();
  check("plus activity: the reacted-to post comes back", () =>
    assert.deepEqual(posts.map((p) => p.classList.contains("ft-li-collapsed")),
      [false, false, true, true]));
  check("its block is taken away with it", () =>
    assert.equal(posts[1].querySelector(".ft-li-stub"), null));
  check("the guess and the ad stay hidden", () => {
    assert.ok(posts[2].classList.contains("ft-li-collapsed"));
    assert.ok(posts[3].classList.contains("ft-li-collapsed"));
  });

  CONFIG.visualHiding.liActivity = true;
  LIFeed.tick();
  check("switching back hides it again, with no stale verdict", () => {
    assert.equal(posts[1].dataset.ftLiClass, "activity");
    assert.ok(posts[1].classList.contains("ft-li-collapsed"));
  });
  check("a connection's own post is untouched in either mode", () => {
    // It has no Follow control, so it never reaches the activity branch at
    // all - whatever else is in its header.
    assert.equal(posts[0].dataset.ftLiClass, "keep");
    assert.equal(posts[0].classList.contains("ft-li-collapsed"), false);
    CONFIG.visualHiding.liActivity = false;
    LIFeed.tick();
    assert.equal(posts[0].classList.contains("ft-li-collapsed"), false);
    CONFIG.visualHiding.liActivity = true;
  });
  check("the author's own avatar link is not read as a surfacing link", () =>
    // li-follow-post carries one profile - the author's, twice over.
    assert.equal(LIFeed.surfacedByPerson(posts[2]), false));
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall green");
process.exit(failures ? 1 : 0);
