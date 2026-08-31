import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

const SRC = path.join(ROOT, "content-ig.js");

function makeEnv(bodyHTML) {
  const dom = new JSDOM(
    `<!doctype html><html><body class="ft-platform-ig">${bodyHTML}</body></html>`,
    { url: "https://www.instagram.com/", pretendToBeVisual: true },
  );
  const w = dom.window;
  // jsdom lays nothing out; pretend every post is a normal 700px feed post.
  w.Element.prototype.getBoundingClientRect = function () {
    if (this.tagName === "ARTICLE") {
      // Stack the posts 700px apart so a cut height is meaningful.
      const all = [...this.ownerDocument.querySelectorAll("article")];
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
    platformSettings: { ig: "warn" },
    session: {},
    visualHiding: { igSuggested: true, igStories: true, igReelsNav: true },
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
    Site: { isIG: () => true, isYT: () => false, isTT: () => false, isFB: () => false, isLI: () => false },
    CONFIG, FocusState, Utils,
    UI: { remove() {}, create() {}, showKickNotification() {}, overlayId: "x" },
    chrome: {
      runtime: { id: "test", getURL: (p) => "chrome-extension://testid/" + p },
      storage: { onChanged: { addListener() {} } },
    },
    sessionStorage: w.sessionStorage,
  });
  ctx.globalThis = ctx;
  const code = fs.readFileSync(SRC, "utf8") + "\n;globalThis.__IGFeed = IGFeed;";
  vm.runInContext(code, ctx);
  return { w, doc: w.document, IGFeed: ctx.__IGFeed, CONFIG, FocusState, Utils };
}

const FIX = path.join(HERE, "fixtures") + path.sep;
const fixture = (name) => fs.readFileSync(FIX + name, "utf8");

const post = ({ author, time = true, label = "", shim = false, caption = "" }) => `
<article>
  <div>
    ${label ? `<div><span>${label}</span></div>` : ""}
    <header>
      <div><a href="/${author}/"><img src="x"></a></div>
      <div><a href="/${author}/">${author}</a>${time ? '<time datetime="2026-08-30T10:00:00.000Z">1h</time>' : ""}</div>
    </header>
    <div><img src="photo"></div>
    ${shim ? '<a href="https://l.instagram.com/?u=https%3A%2F%2Fbrand.example">Learn more</a>' : ""}
    <div class="caption"><a href="/${author}/">${author}</a> ${caption}</div>
  </div>
</article>`;

const feed = (posts) =>
  `<main role="main"><div class="feed">${posts.join("")}</div></main>`;

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log("  PASS  " + name); }
  catch (e) { failures++; console.log("  FAIL  " + name + "\n        " + e.message); }
};

// -------------------------------------------------- real captured markup
console.log("real Instagram markup (2026-08-30 capture)");
{
  const { doc, IGFeed } = makeEnv(
    `<main role="main"><div class="feed">` +
      fixture("ig-followed-post.html") +
      fixture("ig-divider.html") +
      fixture("ig-suggested-post.html") +
      `</div></main>`,
  );
  IGFeed.active = true;
  IGFeed.ensureObserver();
  const arts = [...doc.querySelectorAll("article")];
  check("<section> is found as the chrome boundary (no <header> exists)", () => {
    assert.equal(arts[0].querySelector("header"), null);
    assert.ok(IGFeed.postChrome(arts[0]));
  });
  check("follow control found on the suggested post", () =>
    assert.equal(IGFeed.norm(IGFeed.followButton(arts[1]).textContent), "Follow"));
  check("no follow control on the followed post", () =>
    assert.equal(IGFeed.followButton(arts[0]), null));
  check("like/comment counters are not mistaken for a follow control", () => {
    const b = IGFeed.followButton(arts[0]);
    assert.equal(b, null, b && IGFeed.norm(b.textContent));
  });
  check("chrome scan stops before the caption", () => {
    const labels = IGFeed.labelNodes(arts[1]);
    assert.ok(labels.includes("dicegoblin.tabletop"), "username missing: " + labels.join("|"));
    assert.ok(!labels.some((t) => t.includes("see translation")), "reached the footer");
    assert.ok(!labels.some((t) => t.includes("4.2k")), "reached the action bar");
  });
  IGFeed.tick();
  check("followed post kept, suggested post collapsed", () =>
    assert.deepEqual(arts.map((a) => a.dataset.ftIgClass), ["keep", "suggested"]));
  check("block names the real author", () =>
    assert.equal(arts[1].querySelector(".ft-ig-stub p").textContent,
      "@dicegoblin.tabletop is not someone you follow."));
  check("the 'Suggested Posts' divider itself is left alone", () =>
    assert.ok(doc.querySelector("h3").isConnected));
}

// -------------------------------------------------------- divider signal
console.log("\nsection-divider signal");
{
  // A post with no follow control, sitting below the divider, is still a
  // suggestion.
  const stripped = fs
    .readFileSync(FIX + "ig-followed-post.html", "utf8");
  const { doc, IGFeed } = makeEnv(
    `<main role="main"><div class="feed">` +
      stripped + fixture("ig-divider.html") + stripped +
      `</div></main>`,
  );
  IGFeed.active = true;
  IGFeed.ensureObserver();
  IGFeed.tick();
  const arts = [...doc.querySelectorAll("article")];
  check("post above the divider kept", () =>
    assert.equal(arts[0].dataset.ftIgClass, "keep"));
  check("identical post below the divider treated as suggested", () =>
    assert.equal(arts[1].dataset.ftIgClass, "suggested"));
}
{
  // The card above every post IS the divider when nothing new is left from
  // people you follow. Requiring a post above it, or requiring it to sit
  // inside the post list, are the two guards that stopped collab posts being
  // classified at all.
  const { doc, IGFeed } = makeEnv(
    `<main role="main"><div class="feed">` + fixture("ig-divider.html") +
      fs.readFileSync(FIX + "ig-followed-post.html", "utf8") +
      fs.readFileSync(FIX + "ig-followed-post.html", "utf8") +
      `</div></main>`,
  );
  IGFeed.active = true;
  IGFeed.ensureObserver();
  IGFeed.tick();
  check("the caught-up card leading the feed list marks what follows", () =>
    assert.ok([...doc.querySelectorAll("article")]
      .every((a) => a.dataset.ftIgClass === "suggested")));
}

// ------------------------------------------- divider above everything
console.log("\ndivider with nothing above it");
{
  // What the reported feed actually looks like: nothing new from people you
  // follow, so Instagram leads with the divider. A collab post below it has
  // no follow control - two accounts, no button - and is indistinguishable
  // from a friend's post on its own markup. The divider is the only thing
  // that can classify it.
  const collab = fs
    .readFileSync(FIX + "ig-followed-post.html", "utf8")
    .replace('href="/dicegoblin.tabletop/"', 'href="/condestactical/"');
  const { doc, IGFeed } = makeEnv(
    `<main role="main"><div class="feed">` +
      fixture("ig-divider.html") + collab + collab +
      `</div></main>`,
  );
  IGFeed.active = true;
  IGFeed.ensureObserver();
  IGFeed.tick();
  check("a divider with no post above it still counts", () =>
    assert.deepEqual([...doc.querySelectorAll("article")].map((a) => a.dataset.ftIgClass),
      ["suggested", "suggested"]));
  check("collab posts below it are hidden despite having no follow control", () =>
    assert.ok([...doc.querySelectorAll("article")]
      .every((a) => a.classList.contains("ft-ig-collapsed"))));
}
{
  // The divider usually arrives after the posts under it have been judged.
  const collab = fs.readFileSync(FIX + "ig-followed-post.html", "utf8");
  const { doc, IGFeed } = makeEnv(
    `<main role="main"><div class="feed">` + collab + collab + `</div></main>`,
  );
  IGFeed.active = true;
  IGFeed.ensureObserver();
  IGFeed.tick();
  check("without a divider those posts are kept", () =>
    assert.ok([...doc.querySelectorAll("article")]
      .every((a) => a.dataset.ftIgClass === "keep")));
  check("the divider arriving later re-judges them", () => {
    const list = doc.querySelector(".feed");
    const holder = doc.createElement("div");
    holder.innerHTML = fixture("ig-divider.html");
    list.insertBefore(holder.firstElementChild, list.firstElementChild);
    IGFeed.tick();
    assert.deepEqual([...doc.querySelectorAll("article")].map((a) => a.dataset.ftIgClass),
      ["suggested", "suggested"]);
  });
}
{
  // The card sits beside the post list, not inside it - which is the shape
  // that defeated the old containment guard. A heading elsewhere on the page
  // is now simply irrelevant: only the caught-up illustration counts.
  const { doc, IGFeed } = makeEnv(
    `<main role="main"><div class="rail"><h3>Stories</h3></div>` +
      fixture("ig-divider.html") +
      `<div class="feed">` +
      fs.readFileSync(FIX + "ig-followed-post.html", "utf8") +
      fs.readFileSync(FIX + "ig-followed-post.html", "utf8") +
      `</div></main>`,
  );
  IGFeed.active = true;
  IGFeed.ensureObserver();
  IGFeed.tick();
  check("the caught-up card beside the post list counts too", () =>
    assert.ok([...doc.querySelectorAll("article")]
      .every((a) => a.dataset.ftIgClass === "suggested")));
}
{
  // A stray heading can no longer blank the feed, because headings are not
  // what is being looked for any more.
  const { doc, IGFeed } = makeEnv(
    `<main role="main"><div class="rail"><h3>Stories</h3><h3>Suggested Posts</h3></div>` +
      `<div class="feed">` +
      fs.readFileSync(FIX + "ig-followed-post.html", "utf8") +
      fs.readFileSync(FIX + "ig-followed-post.html", "utf8") +
      `</div></main>`,
  );
  IGFeed.active = true;
  IGFeed.ensureObserver();
  IGFeed.tick();
  check("headings alone no longer mark anything", () =>
    assert.ok([...doc.querySelectorAll("article")]
      .every((a) => a.dataset.ftIgClass === "keep")));
}

// ------------------------------------------- divider unmounts on scroll
console.log("\nthe divider is temporary");
{
  // Instagram removes the caught-up card once it scrolls out of view. Live
  // debug output showed dividerMarks: 0 with posts still on screen, which is
  // why collab posts came back the moment you scrolled.
  const collab = fs
    .readFileSync(FIX + "ig-followed-post.html", "utf8")
    .replace('href="/dicegoblin.tabletop/"', 'href="/jillymaybesilly/"');
  const { doc, IGFeed } = makeEnv(
    `<main role="main"><div class="feed">` +
      fixture("ig-divider.html") + collab + collab +
      `</div></main>`,
  );
  IGFeed.active = true;
  IGFeed.ensureObserver();
  IGFeed.tick();
  check("posts below the card are stamped while it is there", () =>
    assert.ok([...doc.querySelectorAll("article")]
      .every((a) => a.dataset.ftIgBelow === "1")));

  check("they stay hidden after Instagram removes the card", () => {
    doc.querySelector(IGFeed.DIVIDER_MARK).closest("div").remove();
    assert.equal(doc.querySelectorAll(IGFeed.DIVIDER_MARK).length, 0);
    [...doc.querySelectorAll("article")].forEach((a) => {
      delete a.dataset.ftIgClass;
      IGFeed.restore(a);
    });
    IGFeed.tick();
    assert.deepEqual([...doc.querySelectorAll("article")].map((a) => a.dataset.ftIgClass),
      ["suggested", "suggested"]);
  });

  check("posts loaded after the card is gone are hidden too", () => {
    const list = doc.querySelector(".feed");
    const holder = doc.createElement("div");
    holder.innerHTML = collab;
    list.appendChild(holder.firstElementChild);
    IGFeed.tick();
    const last = doc.querySelectorAll("article")[2];
    assert.equal(last.dataset.ftIgClass, "suggested");
    assert.ok(last.classList.contains("ft-ig-collapsed"));
  });
}
{
  // Posts above the card must never inherit the stamp.
  const followed = fs.readFileSync(FIX + "ig-followed-post.html", "utf8");
  const { doc, IGFeed } = makeEnv(
    `<main role="main"><div class="feed">` +
      followed + fixture("ig-divider.html") + followed +
      `</div></main>`,
  );
  IGFeed.active = true;
  IGFeed.ensureObserver();
  IGFeed.tick();
  check("a post above the card is kept, the one below is not", () =>
    assert.deepEqual([...doc.querySelectorAll("article")].map((a) => a.dataset.ftIgClass),
      ["keep", "suggested"]));
  check("and it stays kept once the card is gone", () => {
    doc.querySelector(IGFeed.DIVIDER_MARK).closest("div").remove();
    IGFeed.tick();
    const arts = [...doc.querySelectorAll("article")];
    assert.equal(arts[0].dataset.ftIgBelow, undefined);
    assert.equal(arts[0].classList.contains("ft-ig-collapsed"), false);
  });
}

// ---------------------------------------------------------------- classify
console.log("\nsynthetic classification");
{
  const html = feed([
    post({ author: "realfriend" }),
    post({ author: "stranger", label: "Suggested for you" }),
    post({ author: "somebrand", time: false, label: "Sponsored", shim: true }),
    post({ author: "obfuscated", time: false, label: "S​pon‌sored" }),
    post({ author: "shimonly", time: false, shim: true }),
    "<article><div>loading</div></article>",
    post({ author: "friend2", caption: "check out this sponsored content lol" }),
  ]);
  const { doc, IGFeed } = makeEnv(html);
  IGFeed.active = true;
  IGFeed.ensureObserver();
  const arts = [...doc.querySelectorAll("article")];
  const got = arts.map((a) => IGFeed.classify(a));
  check("followed post -> keep", () => assert.equal(got[0], "keep"));
  check("'Suggested for you' -> suggested", () => assert.equal(got[1], "suggested"));
  check("'Sponsored' -> ad", () => assert.equal(got[2], "ad"));
  check("zero-width-obfuscated 'Sponsored' -> ad", () => assert.equal(got[3], "ad"));
  check("no timestamp + l.instagram.com shim -> ad", () => assert.equal(got[4], "ad"));
  check("unrendered post -> pending (fail open)", () => assert.equal(got[5], "pending"));
  check("'sponsored' in caption only -> keep", () => assert.equal(got[6], "keep"));
  check("author extracted, ignores non-profile hrefs", () =>
    assert.equal(IGFeed.author(arts[0]), "realfriend"));
}

// ------------------------------------------------------------- collapse/tick
console.log("\ncollapse + restore");
{
  const html = feed([
    post({ author: "friend1" }),
    post({ author: "stranger1", label: "Suggested for you" }),
    post({ author: "brand1", time: false, label: "Sponsored", shim: true }),
    post({ author: "friend2" }),
  ]);
  const { doc, IGFeed, CONFIG } = makeEnv(html);
  IGFeed.active = true;
  IGFeed.ensureObserver();
  IGFeed.tick();
  const arts = [...doc.querySelectorAll("article")];
  check("only non-followed posts collapse", () =>
    assert.deepEqual(arts.map((a) => a.classList.contains("ft-ig-collapsed")),
      [false, true, true, false]));
  check("each collapsed post gets exactly one stub", () =>
    assert.deepEqual(arts.map((a) => a.querySelectorAll(":scope > .ft-ig-stub").length),
      [0, 1, 1, 0]));
  check("ad block says Sponsored post", () =>
    assert.equal(arts[2].querySelector(".ft-ig-stub h3").textContent,
      "Sponsored post"));
  check("stub is a full block: icon, heading, subtitle, button", () => {
    const stub = arts[1].querySelector(".ft-ig-stub");
    assert.ok(stub.querySelector("svg.ft-ig-stub-icon"), "no icon");
    assert.equal(stub.querySelector("img"), null, "icon fetched from the extension");
    assert.equal(stub.querySelector("h3").textContent, "Suggested post");
    assert.equal(stub.querySelector("p").textContent,
      "@stranger1 is not someone you follow.");
    assert.equal(stub.querySelector(".ft-ig-stub-btn").textContent, "View Anyway");
  });

  check("tick is idempotent - no duplicate stubs", () => {
    IGFeed.tick(); IGFeed.tick();
    assert.deepEqual(arts.map((a) => a.querySelectorAll(":scope > .ft-ig-stub").length),
      [0, 1, 1, 0]);
  });

  check("'View Anyway' reveals that post and it stays revealed", () => {
    arts[1].querySelector(".ft-ig-stub-btn").dispatchEvent(
      new doc.defaultView.MouseEvent("click", { bubbles: true }));
    assert.equal(arts[1].classList.contains("ft-ig-collapsed"), false, "still collapsed");
    assert.equal(arts[1].querySelector(".ft-ig-stub"), null, "stub left behind");
    IGFeed.tick();
    assert.equal(arts[1].classList.contains("ft-ig-collapsed"), false, "re-collapsed after tick");
  });

  check("turning the setting off restores every post", () => {
    CONFIG.visualHiding.igSuggested = false;
    IGFeed.sync();
    assert.equal(doc.querySelectorAll(".ft-ig-collapsed").length, 0);
    assert.equal(doc.querySelectorAll(".ft-ig-stub").length, 0);
    assert.equal(IGFeed.collapsed.size, 0);
  });

  check("turning it back on re-collapses", () => {
    CONFIG.visualHiding.igSuggested = true;
    IGFeed.sync();
    IGFeed.tick();
    assert.equal(doc.querySelectorAll(".ft-ig-collapsed").length, 1); // stranger1 revealed
  });
}

// ------------------------------------------------- surviving re-renders
console.log("\nheight survives Instagram's re-renders");
{
  const { doc, IGFeed } = makeEnv(feed([
    post({ author: "friend1" }),
    post({ author: "stranger1", label: "Suggested for you" }),
  ]));
  IGFeed.active = true;
  IGFeed.ensureObserver();
  IGFeed.tick();
  const target = doc.querySelectorAll("article")[1];
  check("the height is carried on an attribute, not the post's style", () => {
    assert.equal(target.dataset.ftIgHeight, "700");
    assert.equal(target.style.getPropertyValue("min-height"), "",
      "still styling a node Instagram owns");
  });
  check("our own stub carries the height", () => {
    const stub = target.querySelector(".ft-ig-stub");
    assert.equal(stub.style.getPropertyValue("height"), "700px");
    assert.equal(stub.style.getPropertyPriority("height"), "important");
  });
  check("Instagram blanking the post's style attribute changes nothing", () => {
    // Exactly what the live feed does - captured posts come back style="".
    target.setAttribute("style", "");
    IGFeed.tick();
    assert.equal(target.querySelector(".ft-ig-stub").style.getPropertyValue("height"),
      "700px");
    assert.ok(target.classList.contains("ft-ig-collapsed"));
  });
  check("a rebuilt stub is re-sized from the attribute", () => {
    target.querySelector(".ft-ig-stub").remove();
    IGFeed.tick();
    assert.equal(target.querySelector(".ft-ig-stub").style.getPropertyValue("height"),
      "700px");
  });
  check("restoring drops the attribute and the stub together", () => {
    IGFeed.restore(target);
    assert.equal(target.dataset.ftIgHeight, undefined);
    assert.equal(target.querySelector(".ft-ig-stub"), null);
  });
  check("a short post is floored, not pinned to nothing", () => {
    target.getBoundingClientRect = () => ({ height: 12, width: 470, top: 0, bottom: 12, left: 0, right: 470, x: 0, y: 0 });
    delete target.dataset.ftIgClass;
    IGFeed.collapse(target, "suggested");
    assert.equal(target.dataset.ftIgHeight, String(IGFeed.MIN_COLLAPSED_HEIGHT));
  });
}

// -------------------------------------------------------------- anti-thrash
console.log("\nreact-rerender resilience");
{
  const { doc, IGFeed } = makeEnv(feed([
    post({ author: "friend1" }),
    post({ author: "stranger1", label: "Suggested for you" }),
  ]));
  IGFeed.active = true;
  IGFeed.ensureObserver();
  const target = doc.querySelectorAll("article")[1];
  IGFeed.tick();
  check("stub is replaced when Instagram tears it out", () => {
    target.querySelector(".ft-ig-stub").remove();
    IGFeed.tick();
    assert.ok(target.querySelector(".ft-ig-stub"), "stub not repaired");
  });
  check("gives up after MAX_STUB_REPAIRS instead of fighting forever", () => {
    for (let i = 0; i < 6; i++) {
      const s = target.querySelector(".ft-ig-stub");
      if (s) s.remove();
      IGFeed.tick();
    }
    assert.equal(target.dataset.ftIgGiveUp, "1", "never gave up");
    assert.equal(target.classList.contains("ft-ig-collapsed"), false, "left collapsed");
  });
}

// ------------------------------------------------------------------ gating
console.log("\ngating");
{
  const html = feed([post({ author: "stranger1", label: "Suggested for you" })]);
  {
    const { doc, IGFeed, FocusState } = makeEnv(html);
    FocusState.shouldBlock = false;
    IGFeed.sync();
    check("does nothing when focus mode is not active", () =>
      assert.equal(doc.querySelectorAll(".ft-ig-collapsed").length, 0));
  }
  {
    const { doc, IGFeed, w } = makeEnv(html);
    w.history.pushState({}, "", "/explore/");
    IGFeed.sync();
    check("does nothing off the home feed", () =>
      assert.equal(doc.querySelectorAll(".ft-ig-collapsed").length, 0));
  }
  {
    const { doc, IGFeed, Utils } = makeEnv(html);
    Utils.isExtensionEnabled = () => false;
    IGFeed.sync();
    check("does nothing when the extension is off", () =>
      assert.equal(doc.querySelectorAll(".ft-ig-collapsed").length, 0));
  }
}

// ------------------------------------ what counts as a follow control
// The chrome of a real post holds several text-bearing controls. Only one of
// them is a follow control, and "short text in a button" does not tell them
// apart - these are the things that reading would have swallowed.
console.log("\nfollow control is not just any short-text button");
{
  const { doc, IGFeed } = makeEnv(
    `<main role="main"><div class="feed">${fixture("ig-followed-post.html")}</div></main>`,
  );
  IGFeed.active = true;
  IGFeed.ensureObserver();
  const art = doc.querySelector("article");
  const boundary = IGFeed.postChrome(art);
  // Found here rather than via IGFeed, so the setup does not lean on the
  // method under test.
  const author = [...art.querySelectorAll('a[href^="/"]')].find((a) =>
    /^\/[A-Za-z0-9._]+\/$/.test(a.getAttribute("href")),
  );

  // Put a control in the chrome, just above the action bar, and ask whether
  // the classifier reads it as a follow control.
  const withControl = (build) => {
    const node = build();
    boundary.parentNode.insertBefore(node, boundary);
    const found = IGFeed.followButton(art);
    node.remove();
    return found;
  };
  const button = (fill) => {
    const b = doc.createElement("div");
    b.setAttribute("role", "button");
    fill(b);
    return b;
  };

  check("a plain one-word control is read as one", () =>
    assert.ok(withControl(() => button((b) => (b.textContent = "Follow")))));
  check("so is one in another language", () =>
    assert.ok(withControl(() => button((b) => (b.textContent = "Abonnieren")))));
  check("a control wrapping a link is not - that is the username", () =>
    assert.equal(
      withControl(() =>
        button((b) => (b.innerHTML = '<a href="/someone/">someone</a>')),
      ),
      null,
    ));
  check("a control nested inside a link is not either", () =>
    assert.equal(
      withControl(() => {
        const a = doc.createElement("a");
        a.setAttribute("href", "/someone/");
        a.appendChild(button((b) => (b.textContent = "and 2 others")));
        return a;
      }),
      null,
    ));
  check("a composite header line is not - it has several text leaves", () =>
    assert.equal(
      withControl(() =>
        button((b) => (b.innerHTML = "<span>alice</span><span>2d</span>")),
      ),
      null,
    ));
  check("a counter is not - no letters in it", () =>
    assert.equal(
      withControl(() => button((b) => (b.textContent = "1,204"))),
      null,
    ));
  check("an icon control is not - 'More options' and the verified tick", () =>
    assert.equal(
      withControl(() =>
        button((b) => (b.innerHTML = "<svg></svg><span>More</span>")),
      ),
      null,
    ));
  check("a control wrapping the timestamp is not", () =>
    assert.equal(
      withControl(() =>
        button(
          (b) => (b.innerHTML = '<time datetime="2026-08-30T10:00:00Z">2d</time>'),
        ),
      ),
      null,
    ));
  check("a control above the author is not - follow is offered after it", () => {
    const b = button((x) => (x.textContent = "Follow"));
    author.parentNode.insertBefore(b, author);
    const found = IGFeed.followButton(art);
    b.remove();
    assert.equal(found, null);
  });
  check("and the post itself is still kept", () =>
    assert.equal(IGFeed.classify(art, false), "keep"));
}

// --------------------------------------------- a control that paints late
console.log("\na follow control that paints late");
{
  const { doc, IGFeed } = makeEnv(
    `<main role="main"><div class="feed">${fixture("ig-followed-post.html")}</div></main>`,
  );
  IGFeed.active = true;
  IGFeed.ensureObserver();
  IGFeed.tick();
  const art = doc.querySelector("article");
  check("judged 'keep' while the control is not there yet", () =>
    assert.equal(art.dataset.ftIgClass, "keep"));

  const boundary = IGFeed.postChrome(art);
  const late = doc.createElement("div");
  late.setAttribute("role", "button");
  late.textContent = "Follow";
  boundary.parentNode.insertBefore(late, boundary);
  await new Promise((resolve) => setTimeout(resolve, 0));
  IGFeed.tick();
  check("once it paints, the cached verdict is retired and the post hidden", () =>
    assert.equal(art.dataset.ftIgClass, "suggested"));
  check("and the post is collapsed", () =>
    assert.ok(art.classList.contains("ft-ig-collapsed")));

  // The other half: churn below the chrome must not retire anything, or every
  // buffering video would re-open the question on every frame.
  const caption = art.querySelector(".caption") || boundary;
  check("churn below the chrome leaves the verdict alone", () =>
    assert.equal(IGFeed.chromeChurn(art, { addedNodes: [caption] }), false));
  check("churn inside the chrome does not", () =>
    assert.equal(IGFeed.chromeChurn(art, { addedNodes: [late] }), true));
  check("our own stub going in is not treated as churn at all", () => {
    const stub = art.querySelector(".ft-ig-stub");
    assert.ok(stub, "no stub to test with");
    assert.equal(IGFeed.isOwnMutation({ addedNodes: [stub] }), true);
  });
}

// --------------------------------------------------- recycled feed nodes
console.log("\nInstagram recycling an <article> for a different post");
{
  const { doc, IGFeed } = makeEnv(
    feed([post({ author: "stranger1", label: "Suggested for you" })]),
  );
  IGFeed.active = true;
  IGFeed.ensureObserver();
  IGFeed.tick();
  const art = doc.querySelector("article");
  check("the suggested post is collapsed", () => {
    assert.equal(art.dataset.ftIgClass, "suggested");
    assert.ok(art.classList.contains("ft-ig-collapsed"));
  });

  // The same element, now holding a post from somebody you do follow. Nothing
  // about the element changed - only its contents.
  const holder = doc.createElement("div");
  holder.innerHTML = post({ author: "friend9" });
  art.replaceChildren(...holder.querySelector("article").childNodes);
  IGFeed.tick();
  check("the previous post's verdict is not carried over", () =>
    assert.equal(art.dataset.ftIgClass, "keep"));
  check("the element is restored rather than left collapsed", () => {
    assert.equal(art.classList.contains("ft-ig-collapsed"), false);
    assert.equal(art.querySelector(".ft-ig-stub"), null);
    assert.equal(IGFeed.collapsed.has(art), false);
  });
  check("the height attribute goes with it", () =>
    assert.equal(art.dataset.ftIgHeight, undefined));
}

// ------------------------------------------------ audio behind a collapse
console.log("\ncollapsing a post stops its video");
{
  const { doc, IGFeed } = makeEnv(
    feed([post({ author: "stranger1", label: "Suggested for you" })]),
  );
  const art = doc.querySelector("article");
  const video = doc.createElement("video");
  // jsdom has no media stack: model just enough of one to be paused.
  let paused = false;
  Object.defineProperty(video, "paused", { get: () => paused });
  video.pause = () => { paused = true; };
  art.appendChild(video);

  IGFeed.active = true;
  IGFeed.ensureObserver();
  IGFeed.tick();
  check("the post is collapsed", () =>
    assert.ok(art.classList.contains("ft-ig-collapsed")));
  check("and its video is paused, not merely hidden", () =>
    assert.equal(video.paused, true));

  paused = false;
  IGFeed.tick();
  check("playback restarting after a re-render is caught on the next pass", () =>
    assert.equal(video.paused, true));
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall green");
process.exit(failures ? 1 : 0);
