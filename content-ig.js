const Instagram = {
  initialized: false,
  observer: null,
  checkScheduled: false,
  isRedirecting: false,
  currentMode: "strict",
  lastPath: "",
  storiesOverlayId: "ft-ig-stories-overlay",
  hiddenNavContainers: new Set(),
  igSelectors: {
    nav: {
      reels: 'a[href="/reels/"], a[href$="/reels/"]',
    },
  },
  init: function () {
    if (this.initialized) return;
    Utils.ensureBody(() => this._start());
  },
  _start: function () {
    if (this.initialized) return;
    if (!Utils.isExtensionEnabled()) return;
    this.initialized = true;
    document.body.classList.add("ft-platform-ig");
    this.isRedirecting = false;
    this.ensureObservers();
    window.addEventListener("popstate", () => this.runChecks());
    chrome.storage.onChanged.addListener((changes) => {
      if (
        changes.platformSettings ||
        changes.focusMode ||
        changes.ft_timer_end ||
        changes.ft_timer_type ||
        changes.hide_ig_stories ||
        changes.hide_ig_reels_nav ||
        changes.hide_ig_suggested ||
        changes.popup_visible_ig ||
        changes.restrictHiddenPlatforms ||
        changes.visualHideHiddenPlatforms
      ) {
        this.runChecks();
      }
    });
    document.addEventListener("ft-settings-changed", () => this.runChecks());
    this.runChecks();
    this.checkKick();
  },
  ensureObservers: function () {
    if (!document.body) return;
    if (!this.observer) {
      this.observer = Utils.trackObserver(
        new MutationObserver(() => this.scheduleChecks()),
      );
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
  },
  scheduleChecks: function () {
    if (this.checkScheduled) return;
    this.checkScheduled = true;
    requestAnimationFrame(() => {
      this.checkScheduled = false;
      this.runChecks();
    });
  },
  disable: function () {
    this.isRedirecting = false;
    UI.remove();
    IGFeed.disable();
    this.removeStoriesOverlay();
    this.applyVisible(
      document.body.querySelectorAll(this.igSelectors.nav.reels),
    );
    this.restoreHidden(this.hiddenNavContainers);
    if (this.observer) this.observer.disconnect();
    this.observer = null;
  },
  enable: function () {
    if (!document.body) return;
    document.body.classList.add("ft-platform-ig");
    this.ensureObservers();
    this.runChecks();
    this.checkKick();
  },
  runChecks: function () {
    if (!Utils.isExtensionEnabled()) {
      IGFeed.disable();
      this.removeStoriesOverlay();
      this.applyVisible(
        document.body.querySelectorAll(this.igSelectors.nav.reels),
      );
      this.restoreHidden(this.hiddenNavContainers);
      UI.remove();
      return;
    }
    if (this.isRedirecting || !document.body) return;
    const path = window.location.pathname;
    const isFocusActive = FocusState.shouldBlock;
    let action = "none";
    let reason = "";
    const mode = CONFIG.platformSettings.ig;
    if (mode === "strict" && this.currentMode !== "strict") {
      Utils.clearSession();
      this.removeStoriesOverlay();
    }
    this.currentMode = mode;
    if (FocusState.isBreak) {
      action = "remove";
      reason = "break timer";
      this.showNavLinks();
      IGFeed.sync();
      this.removeStoriesOverlay();
      Utils.debugLog("ig", {
        path,
        mode: this.currentMode,
        isWork: FocusState.isWork,
        isBreak: FocusState.isBreak,
        isFocusActive,
        action,
        reason,
      });
      return;
    }
    const shouldHideNav =
      isFocusActive &&
      CONFIG.visualHiding.igReelsNav &&
      Utils.shouldApplyVisualHiding("ig");
    if (shouldHideNav) {
      this.hideNavLinks();
    } else {
      this.showNavLinks();
    }
    if (this.isBlockablePath(path)) {
      const warnScope = this.getWarnScope(path);
      if (Utils.isSessionAllowed("ig", warnScope) && !FocusState.isWork) {
        action = "allow";
        reason = "session allowed";
        UI.remove();
      } else if ((FocusState.isWork || mode === "strict") && !this.isRedirecting) {
        action = "redirect";
        reason = "blockable path";
        this.rapidKick(path);
      } else if (mode === "warn") {
        action = "warn";
        reason = "warn mode";
        UI.create(
          "warn",
          "ig",
          () => {
            this.runChecks();
          },
          () => {
            window.location.href = "/";
          },
          { scope: warnScope },
        );
      } else {
        action = "allow";
        reason = "no block condition";
        UI.remove();
      }
    } else {
      action = "safe";
      reason = "non-blockable path";
      if (CONFIG.session.platform === "ig") Utils.clearSession();
      this.showKickNotice();
    }
    const isHomepage = path === "/" || path === "";
    const shouldHideStories =
      isHomepage &&
      isFocusActive &&
      CONFIG.visualHiding.igStories &&
      Utils.shouldApplyVisualHiding("ig");
    if (shouldHideStories) {
      this.showStoriesOverlay();
    } else {
      this.removeStoriesOverlay();
    }
    IGFeed.sync();
    Utils.debugLog("ig", {
      path,
      mode: this.currentMode,
      isWork: FocusState.isWork,
      isBreak: FocusState.isBreak,
      isFocusActive,
      action,
      reason,
    });
  },
  isBlockablePath: function (path) {
    return (
      path.startsWith("/reels/") ||
      path.startsWith("/reel/") ||
      path.startsWith("/explore/")
    );
  },
  getWarnScope: function (path) {
    if (path.startsWith("/explore/")) return "explore";
    return "reels";
  },
  rapidKick: function (path) {
    if (this.isRedirecting) return;
    if (
      sessionStorage.getItem("ft_kicked") &&
      Date.now() - parseInt(sessionStorage.getItem("ft_kicked_time") || "0") <
        5000
    )
      return;
    if (path === "/") return;
    this.isRedirecting = true;
    Utils.logStat();
    Utils.markKick("ig", () => {
      window.location.replace("/");
    });
    setTimeout(() => {
      this.isRedirecting = false;
      if (!this.isBlockablePath(window.location.pathname)) {
        this.showKickNotice();
      }
      this.runChecks();
    }, 2000);
  },
  checkKick: function () {
    if (!this.isBlockablePath(window.location.pathname)) {
      this.showKickNotice();
    }
  },
  showKickNotice: function () {
    Utils.consumeKick("ig", () => UI.showKickNotification());
  },
  applyHidden: function (elements) {
    if (!elements) return;
    if (elements instanceof NodeList) {
      elements.forEach((el) =>
        Utils.setInlineStyle(el, "display", "none", "important"),
      );
    } else {
      Utils.setInlineStyle(elements, "display", "none", "important");
    }
  },
  applyVisible: function (elements) {
    if (!elements) return;
    if (elements instanceof NodeList) {
      elements.forEach((el) => Utils.restoreInlineStyle(el, "display"));
    } else {
      Utils.restoreInlineStyle(elements, "display");
    }
  },
  hideNavLinks: function () {
    Utils.pruneDetachedElements(this.hiddenNavContainers);
    const reelsLinks = document.body.querySelectorAll(
      this.igSelectors.nav.reels,
    );
    this.applyHidden(reelsLinks);
    [...reelsLinks].forEach((link) => {
      if (!link) return;
      const navRoot = link.closest("nav");
      if (!navRoot) return;
      const parent = link.parentElement;
      if (
        parent &&
        (parent.tagName === "DIV" || parent.tagName === "LI") &&
        parent.querySelectorAll("a").length === 1
      ) {
        Utils.setInlineStyle(parent, "display", "none", "important");
        this.hiddenNavContainers.add(parent);
      }
    });
  },
  showNavLinks: function () {
    this.applyVisible(
      document.body.querySelectorAll(this.igSelectors.nav.reels),
    );
    this.restoreHidden(this.hiddenNavContainers);
  },
  restoreHidden: function (set) {
    set.forEach((el) => Utils.restoreInlineStyle(el, "display"));
    set.clear();
  },
  showStoriesOverlay: function () {
    const iconUrl = Utils.getExtensionUrl("icons/icon48.png");
    if (!iconUrl) return;
    if (document.getElementById(this.storiesOverlayId)) return;
    const storyTray = this.findStoriesTray();
    if (!storyTray) return;
    Utils.setInlineStyle(storyTray, "position", "relative");
    const overlay = document.createElement("div");
    overlay.id = this.storiesOverlayId;
    overlay.className = "ft-stories-overlay";
    if (CONFIG.isDarkMode) overlay.classList.add("dark");
    const icon = document.createElement("img");
    icon.src = iconUrl;
    icon.className = "ft-stories-overlay-icon";
    const text = document.createElement("span");
    text.textContent = "Stories Hidden";
    overlay.appendChild(icon);
    overlay.appendChild(text);
    storyTray.appendChild(overlay);
  },
  findStoriesTray: function () {
    const storyButton = document.querySelector('[aria-label^="Story by"]');
    if (storyButton) {
      const scrollableContainer = storyButton.closest('[scrollable="true"]');
      if (scrollableContainer) return scrollableContainer;
      const presentationContainer = storyButton.closest(
        '[role="presentation"]',
      );
      if (presentationContainer) {
        const rect = presentationContainer.getBoundingClientRect();
        if (rect.width > 200 && rect.height < 300) {
          return presentationContainer;
        }
      }
    }
    const storyUL = document.querySelector("ul._acay");
    if (storyUL) {
      const scrollableContainer = storyUL.closest('[scrollable="true"]');
      if (scrollableContainer) return scrollableContainer;
      const container = storyUL.closest('div[role="presentation"]');
      if (container) return container;
    }
    const scrollableContainers = document.querySelectorAll(
      '[scrollable="true"]',
    );
    for (const container of scrollableContainers) {
      if (container.querySelector('[aria-label^="Story by"]')) {
        return container;
      }
    }
    return null;
  },
  removeStoriesOverlay: function () {
    const overlay = document.getElementById(this.storiesOverlayId);
    if (overlay) {
      const parent = overlay.parentElement;
      overlay.remove();
      if (parent) Utils.restoreInlineStyles(parent);
    }
  },
};
/* --------------------------------------------------------------------------
 * IGFeed - hide home-feed posts that are not from accounts you follow.
 *
 * Instagram's home feed is already limited to accounts you follow, plus two
 * injected classes of post: "Suggested for you" and "Sponsored". So there is
 * no follow list to fetch or store - filtering those two classes out leaves
 * exactly the people you follow. Everything here is local DOM work; no
 * network calls, no new permissions.
 *
 * Hidden posts are collapsed to a stub rather than removed, and the stub
 * keeps the height the post had, so the page never gets shorter than it was.
 * Nothing here stops or throttles the feed: Instagram keeps paginating
 * exactly as it would without the extension.
 * ------------------------------------------------------------------------ */
const IGFeed = {
  COLLAPSED_CLASS: "ft-ig-collapsed",
  STUB_CLASS: "ft-ig-stub",
  // A collapsed post keeps the height it had, so collapsing a run of posts
  // cannot make the page shorter than it already was.
  MIN_COLLAPSED_HEIGHT: 400,
  MAX_COLLAPSE_PER_TICK: 8,
  MAX_STUB_REPAIRS: 3,
  TICK_INTERVAL_MS: 100,
  UNBOUNDED_SCAN: 20,
  MAX_BUTTON_TEXT: 24,
  ZERO_WIDTH: /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g,
  HAS_LETTER: /\p{L}/u,
  SPONSORED_LABELS: ["sponsored", "paid partnership"],
  SUGGESTED_LABELS: [
    "suggested for you",
    "suggested post",
    "suggested posts",
    "recommended for you",
  ],
  // Instagram's "You're all caught up" card, which it puts between the last
  // post from someone you follow and the suggestions below. The illustration
  // is a fixed asset path - not a hashed class, not a heading that could be
  // anything else, and identical in every interface language.
  //
  // It is also temporary: Instagram unmounts the card once it scrolls out of
  // view. So being past it cannot be recomputed each pass - it is recorded on
  // the posts themselves, and outlives the card.
  DIVIDER_MARK: 'img[src*="illo-confirm-refresh"]',
  NON_PROFILE_PATH:
    /^\/(explore|reel|reels|direct|stories|accounts|p|about|legal|privacy)(\/|$)/,

  observer: null,
  root: null,
  collapsed: new Set(),
  lastRevealAllowed: null,
  scheduled: false,
  trailingTimer: null,
  lastTick: 0,
  lastPath: null,
  sawDivider: false,
  active: false,

  norm: function (text) {
    return (text || "").replace(this.ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
  },
  isFeedPath: function (path) {
    return path === "/" || path === "";
  },
  revealAllowed: function () {
    // Strict means strict: no way to peek at a hidden post. A running work
    // timer forces strict everywhere else in the extension, so it does here.
    if (FocusState.isWork) return false;
    return CONFIG.platformSettings.ig !== "strict";
  },
  shouldRun: function () {
    return (
      Utils.isExtensionEnabled() &&
      this.isFeedPath(window.location.pathname) &&
      FocusState.shouldBlock &&
      CONFIG.visualHiding.igSuggested &&
      Utils.shouldApplyVisualHiding("ig")
    );
  },
  sync: function () {
    const path = window.location.pathname;
    if (path !== this.lastPath) {
      this.lastPath = path;
    }
    if (this.shouldRun()) this.enable();
    else this.disable();
  },
  enable: function () {
    this.active = true;
    this.ensureObserver();
    this.schedule();
  },
  disable: function () {
    if (!this.active && !this.collapsed.size) return;
    this.active = false;
    if (this.observer) this.observer.disconnect();
    this.root = null;
    if (this.trailingTimer) {
      clearTimeout(this.trailingTimer);
      this.trailingTimer = null;
    }
    this.scheduled = false;
    this.restoreAll();
  },
  findFeedRoot: function () {
    return (
      document.querySelector('main[role="main"]') ||
      document.querySelector("main") ||
      null
    );
  },
  ensureObserver: function () {
    const root = this.findFeedRoot();
    if (!root) return;
    if (!this.observer) {
      // Reused for the life of the page so repeated enable/disable cycles do
      // not pile up entries in Utils.observers.
      this.observer = Utils.trackObserver(
        new MutationObserver((records) => {
          for (const record of records) {
            if (!record.addedNodes.length) continue;
            // Our own stub going in is not news.
            if (this.isOwnMutation(record)) continue;
            const target = record.target;
            const post =
              target && target.nodeType === 1 ? target.closest("article") : null;
            if (post && post.dataset.ftIgClass) {
              // Video buffering, like counts, caption expansion - churn below
              // the post's chrome tells us nothing new. Churn inside the
              // chrome is different: that is where a follow control or a
              // "Sponsored" label appears when it paints late, so a verdict
              // already stamped on this post has to be taken again.
              if (!this.chromeChurn(post, record)) continue;
              delete post.dataset.ftIgClass;
            }
            this.schedule();
            return;
          }
        }),
      );
    }
    if (this.root !== root) {
      this.observer.disconnect();
      this.root = root;
      this.observer.observe(root, { childList: true, subtree: true });
    }
  },
  schedule: function () {
    if (!this.active || this.scheduled) return;
    this.scheduled = true;
    const wait = Math.max(0, this.TICK_INTERVAL_MS - (Date.now() - this.lastTick));
    const run = () => {
      this.trailingTimer = null;
      this.lastTick = Date.now();
      requestAnimationFrame(() => {
        this.scheduled = false;
        this.tick();
      });
    };
    if (wait === 0) run();
    else this.trailingTimer = setTimeout(run, wait);
  },
  tick: function () {
    if (!this.active) return;
    if (!this.shouldRun()) {
      this.disable();
      return;
    }
    this.ensureObserver();
    if (!this.root) return;
    Utils.pruneDetachedElements(this.collapsed);

    // Switching between strict and warn changes whether the stubs offer a way
    // through, so redraw the ones already on screen.
    const revealAllowed = this.revealAllowed();
    if (revealAllowed !== this.lastRevealAllowed) {
      this.lastRevealAllowed = revealAllowed;
      this.collapsed.forEach((post) =>
        this.renderStub(post, post.dataset.ftIgClass),
      );
    }

    // Articles and section headings together, in document order. Instagram
    // ends the followed part of the feed with a divider carrying an <h3>
    // ("Suggested Posts"); every post below it is a suggestion, whatever its
    // own markup says. Only honoured after a real post has gone by, so a
    // stray heading above the feed can never blank the whole thing.
    // Posts and the caught-up card together, in document order. Queried from
    // the document rather than the feed root, so where Instagram chooses to
    // put the card is not another assumption to get wrong; posts outside the
    // feed are skipped below.
    const nodes = document.querySelectorAll("article, " + this.DIVIDER_MARK);
    let collapsedThisTick = 0;
    let pastDivider = false;
    let run = 0;

    nodes.forEach((node) => {
      if (node.tagName === "IMG") {
        pastDivider = true;
        this.sawDivider = true;
        return;
      }
      const post = node;
      if (!this.root.contains(post)) return;
      // Either we have just walked past the card, or this post was stamped on
      // an earlier pass while the card still existed. Both mean everything
      // from here down is a suggestion.
      if (post.dataset.ftIgBelow === "1") pastDivider = true;
      else if (pastDivider) post.dataset.ftIgBelow = "1";
      if (post.dataset.ftIgGiveUp === "1") {
        run = 0;
        if (this.collapsed.has(post)) this.restore(post);
        return;
      }
      if (post.dataset.ftIgReveal === "1") {
        if (revealAllowed) {
          run = 0;
          if (this.collapsed.has(post)) this.restore(post);
          return;
        }
        // Dropping into strict mode retracts anything revealed under warn.
        delete post.dataset.ftIgReveal;
      }
      const kind = this.classify(post, pastDivider);
      // "pending" means the post has not painted its chrome yet. Look again
      // next tick rather than judging it early.
      if (kind === "pending") return;
      if (kind === "keep") {
        run = 0;
        if (this.collapsed.has(post)) this.restore(post);
        return;
      }
      if (this.collapsed.has(post)) {
        this.repairStub(post, kind);
      } else {
        if (collapsedThisTick >= this.MAX_COLLAPSE_PER_TICK) return;
        this.collapse(post, kind);
        collapsedThisTick += 1;
      }
      run += 1;
    });

    // Instagram restarts playback when it re-renders a post, so this is done
    // every pass rather than only at collapse time.
    this.collapsed.forEach((post) => this.hushMedia(post));

    // Written to the body every pass, so the state can be read from the page
    // console with `document.body.dataset.ftIgFeed` - no extension APIs, no
    // debug flag. Attribute writes do not feed back into our own observer,
    // which watches childList only.
    const state = {
      root: this.root ? this.root.tagName.toLowerCase() : null,
      posts: this.root.querySelectorAll("article").length,
      hidden: this.collapsed.size,
      run,
      pastDivider,
      // The card is transient, so 0 here is normal once it has scrolled away.
      dividerMarks: document.querySelectorAll(this.DIVIDER_MARK).length,
      sawDivider: this.sawDivider,
      belowStamped: this.root.querySelectorAll('article[data-ft-ig-below="1"]')
        .length,
      stubsSized: this.root.querySelectorAll(".ft-ig-stub[style]").length,
      docHeight: document.scrollingElement
        ? document.scrollingElement.scrollHeight
        : 0,
    };
    if (document.body) document.body.dataset.ftIgFeed = JSON.stringify(state);
    Utils.debugLog("ig-feed", state);
  },
  isOwnMutation: function (record) {
    for (const node of record.addedNodes) {
      if (node.nodeType === 1 && node.classList.contains(this.STUB_CLASS)) {
        return true;
      }
    }
    return false;
  },
  chromeChurn: function (post, record) {
    const boundary = this.postChrome(post);
    // No chrome boundary yet means the post is still painting; treat anything
    // arriving as worth another look.
    if (!boundary) return true;
    for (const node of record.addedNodes) {
      if (this.inChrome(boundary, node)) return true;
    }
    return false;
  },
  hushMedia: function (post) {
    // Collapsing hides the post's children with display:none, which does not
    // stop playback - a Reel in a post nobody can see would otherwise keep
    // playing its audio. Instagram restarts playback on re-render, so this is
    // run for every collapsed post on every pass, not only at collapse time.
    post.querySelectorAll("video, audio").forEach((media) => {
      try {
        if (!media.paused) media.pause();
      } catch (e) {
        // A media element being torn down is not worth throwing a tick over.
      }
    });
  },
  postChrome: function (post) {
    // Feed posts carry no <header>. The like/comment/share <section> is the
    // one stable landmark, and everything above it - avatar, username, time,
    // follow control, any "Suggested"/"Sponsored" label - is the post's own
    // chrome. Everything below is the caption and its trimmings.
    return post.querySelector("section");
  },
  inChrome: function (boundary, node) {
    if (!boundary) return true;
    return !!(
      boundary.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING
    );
  },
  labelNodes: function (post) {
    // Short text leaves in the post's chrome. Deliberately stops before the
    // caption - a caption that happens to say "sponsored" must not read as an
    // ad label.
    const boundary = this.postChrome(post);
    const labels = [];
    const walker = document.createTreeWalker(post, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!this.inChrome(boundary, node)) break;
      if (!boundary && labels.length >= this.UNBOUNDED_SCAN) break;
      const text = this.norm(node.nodeValue).toLowerCase();
      if (text && text.length <= 40) labels.push(text);
    }
    return labels;
  },
  textLeaves: function (element) {
    // How many separate runs of text the element holds. A follow control
    // holds exactly one - the word itself, in whatever language. A header
    // line, a collab byline or a menu row holds several.
    let count = 0;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!this.norm(node.nodeValue)) continue;
      count += 1;
      if (count > 1) return count;
    }
    return count;
  },
  followButton: function (post) {
    // A follow control in the post's own chrome is the plainest statement
    // Instagram makes that this is not somebody you follow - and it says it
    // in whatever language the interface is in, so there is no word list to
    // keep up to date.
    //
    // "Short text in a button" on its own is far too broad a reading of that,
    // though, so each test below rules out something else Instagram puts in a
    // post header. What is left is a standalone, textual, non-link control
    // offered after the account it applies to, which is what Follow is.
    const boundary = this.postChrome(post);
    const author = this.authorLink(post);
    const controls = post.querySelectorAll('[role="button"], button');
    for (const control of controls) {
      if (!this.inChrome(boundary, control)) break;
      // Icon controls - "More options", the verified tick, the audio pill -
      // and anything wrapping a link, an avatar or the timestamp.
      if (control.querySelector("svg, a, img, time")) continue;
      // The username, the location line and a collab post's "and N others"
      // are links; a control nested inside one belongs to that link.
      if (control.closest("a")) continue;
      // A follow control is offered after the account it applies to. This is
      // what keeps a control in the post's top bar from being read as one.
      if (
        author &&
        !(
          author.compareDocumentPosition(control) &
          Node.DOCUMENT_POSITION_FOLLOWING
        )
      ) {
        continue;
      }
      // One word, not a composite header line.
      if (this.textLeaves(control) !== 1) continue;
      const text = this.norm(control.textContent);
      if (!text || text.length > this.MAX_BUTTON_TEXT) continue;
      // Counters, dots and separators carry no letters in any script.
      if (!this.HAS_LETTER.test(text)) continue;
      return control;
    }
    return null;
  },
  authorLink: function (post) {
    const links = post.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      if (this.NON_PROFILE_PATH.test(href)) continue;
      if (/^\/[A-Za-z0-9._]+\/$/.test(href)) return link;
    }
    return null;
  },
  author: function (post) {
    const link = this.authorLink(post);
    if (!link) return null;
    const match = (link.getAttribute("href") || "").match(
      /^\/([A-Za-z0-9._]+)\/$/,
    );
    return match ? match[1] : null;
  },
  postKey: function (post) {
    // Which post this element is currently showing. Instagram recycles feed
    // nodes as you scroll, so a verdict stamped on the element has to be tied
    // to the post it was a verdict about - otherwise a recycled node carries
    // the previous post's answer onto a new one.
    const time = post.querySelector("time[datetime]");
    return (
      (this.author(post) || "?") +
      "|" +
      (time ? time.getAttribute("datetime") || "?" : "?")
    );
  },
  forget: function (post) {
    // Everything decided about the post this element used to hold.
    delete post.dataset.ftIgClass;
    delete post.dataset.ftIgReveal;
    delete post.dataset.ftIgGiveUp;
    delete post.dataset.ftIgStubs;
    if (this.collapsed.has(post)) this.restore(post);
  },
  classify: function (post, pastDivider) {
    const key = this.postKey(post);
    // A post that has not painted yet keys as "?|?"; once it paints, the key
    // changes and anything stamped in the meantime is dropped along with it.
    if (post.dataset.ftIgKey && post.dataset.ftIgKey !== key) this.forget(post);
    post.dataset.ftIgKey = key;
    const cached = post.dataset.ftIgClass;
    if (cached === "ad" || cached === "suggested") return cached;
    // A cached "keep" is only good while the post is still above the divider.
    // Instagram renders the divider after the posts below it have already been
    // judged, so the stamp has to be reconsidered once it turns up.
    if (cached === "keep" && !pastDivider) return "keep";
    const labels = this.labelNodes(post);
    const hasTime = !!post.querySelector("time[datetime]");
    if (
      labels.some((text) =>
        this.SPONSORED_LABELS.some((label) => text.startsWith(label)),
      )
    ) {
      post.dataset.ftIgClass = "ad";
      return "ad";
    }
    // Ads route their call-to-action through Instagram's link shim and carry
    // no post timestamp - a language-independent second signal.
    if (!hasTime && post.querySelector('a[href*="l.instagram.com/"]')) {
      post.dataset.ftIgClass = "ad";
      return "ad";
    }
    if (
      labels.some((text) =>
        this.SUGGESTED_LABELS.some((label) => text.includes(label)),
      ) ||
      this.followButton(post) ||
      pastDivider
    ) {
      post.dataset.ftIgClass = "suggested";
      return "suggested";
    }
    // Only commit to "keep" once the post has really rendered, so a label
    // that paints a moment late is not missed for good. Fail open otherwise.
    if (hasTime && this.author(post)) {
      post.dataset.ftIgClass = "keep";
      return "keep";
    }
    return "pending";
  },
  feedList: function (post) {
    // The lowest ancestor holding more than one post: the list Instagram
    // appends to. Used to tell its "Suggested Posts" divider apart from a
    // heading that belongs to something else on the page.
    let node = post.parentElement;
    while (node && node !== this.root) {
      if (node.querySelectorAll("article").length > 1) return node;
      node = node.parentElement;
    }
    return this.root;
  },
  measureHeight: function (post) {
    // Measured before collapsing, while the post is still laid out. The floor
    // covers a post whose media has not loaded yet and would otherwise pin
    // the page at a height it never really had.
    const height = Math.round(post.getBoundingClientRect().height);
    return Math.max(height, this.MIN_COLLAPSED_HEIGHT);
  },
  collapse: function (post, kind) {
    // Measured before collapsing, then carried on a data attribute. It cannot
    // live in an inline style on the post: Instagram re-renders these nodes
    // and blanks their style attribute, which is what defeated every earlier
    // attempt to hold the page height. Attributes and classes survive; the
    // height is applied to our own stub, which Instagram does not manage.
    post.dataset.ftIgHeight = String(this.measureHeight(post));
    post.classList.add(this.COLLAPSED_CLASS);
    this.collapsed.add(post);
    this.hushMedia(post);
    this.renderStub(post, kind);
  },
  restore: function (post) {
    if (!post) return;
    post.classList.remove(this.COLLAPSED_CLASS);
    delete post.dataset.ftIgHeight;
    post
      .querySelectorAll(":scope > ." + this.STUB_CLASS)
      .forEach((el) => el.remove());
    this.collapsed.delete(post);
  },
  restoreAll: function () {
    [...this.collapsed].forEach((post) => this.restore(post));
    this.collapsed.clear();
    this.lastRevealAllowed = null;
    this.sawDivider = false;
    // Switching the setting off retires every verdict, so switching it back
    // on judges the feed as it is now rather than as it was.
    // The verdicts go, so switching the setting back on judges the feed as it
    // is now rather than as it was. ftIgReveal stays: "View Anyway" is the
    // reader's decision about one post, and toggling the feature is not a
    // retraction of it.
    document.querySelectorAll("article[data-ft-ig-class]").forEach((post) => {
      delete post.dataset.ftIgClass;
      delete post.dataset.ftIgKey;
      delete post.dataset.ftIgGiveUp;
      delete post.dataset.ftIgStubs;
    });
    document
      .querySelectorAll('article[data-ft-ig-below="1"]')
      .forEach((post) => delete post.dataset.ftIgBelow);
    document
      .querySelectorAll("." + this.COLLAPSED_CLASS)
      .forEach((post) => this.restore(post));
    document
      .querySelectorAll("." + this.STUB_CLASS)
      .forEach((el) => el.remove());
  },
  repairStub: function (post, kind) {
    if (post.querySelector(":scope > ." + this.STUB_CLASS)) return;
    // Instagram re-rendered the post out from under us. Put the stub back a
    // few times, then leave the post alone rather than fight React forever.
    const attempts = parseInt(post.dataset.ftIgStubs || "0", 10);
    if (attempts >= this.MAX_STUB_REPAIRS) {
      post.dataset.ftIgGiveUp = "1";
      this.restore(post);
      return;
    }
    this.renderStub(post, kind);
  },
  renderStub: function (post, kind) {
    let stub = post.querySelector(":scope > ." + this.STUB_CLASS);
    if (!stub) {
      stub = document.createElement("div");
      stub.className = this.STUB_CLASS;
      if (CONFIG.isDarkMode) stub.classList.add("dark");
      post.appendChild(stub);
      post.dataset.ftIgStubs = String(
        parseInt(post.dataset.ftIgStubs || "0", 10) + 1,
      );
    }
    const height = parseInt(post.dataset.ftIgHeight || "0", 10);
    if (height > 0) stub.style.setProperty("height", height + "px", "important");
    while (stub.firstChild) stub.removeChild(stub.firstChild);

    // Drawn inline rather than loaded from the extension. An <img> pointing at
    // chrome-extension:// fails as "chrome-extension://invalid/" whenever the
    // extension context is replaced - on every reload of an unpacked build -
    // and the page retries it, which is where the endless GET errors came
    // from. This asks the network for nothing.
    const NS = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(NS, "svg");
    icon.setAttribute("viewBox", "0 0 64 64");
    icon.setAttribute("width", "64");
    icon.setAttribute("height", "64");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("class", "ft-ig-stub-icon");
    const plate = document.createElementNS(NS, "rect");
    plate.setAttribute("x", "2");
    plate.setAttribute("y", "2");
    plate.setAttribute("width", "60");
    plate.setAttribute("height", "60");
    plate.setAttribute("rx", "16");
    plate.setAttribute("fill", "#4facfe");
    const ring = document.createElementNS(NS, "circle");
    ring.setAttribute("cx", "32");
    ring.setAttribute("cy", "32");
    ring.setAttribute("r", "15");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "#fff");
    ring.setAttribute("stroke-width", "4");
    const slash = document.createElementNS(NS, "line");
    slash.setAttribute("x1", "21");
    slash.setAttribute("y1", "21");
    slash.setAttribute("x2", "43");
    slash.setAttribute("y2", "43");
    slash.setAttribute("stroke", "#fff");
    slash.setAttribute("stroke-width", "4");
    slash.setAttribute("stroke-linecap", "round");
    icon.appendChild(plate);
    icon.appendChild(ring);
    icon.appendChild(slash);
    stub.appendChild(icon);

    const title = document.createElement("h3");
    title.textContent = kind === "ad" ? "Sponsored post" : "Suggested post";
    stub.appendChild(title);

    const subtitle = document.createElement("p");
    const author = this.author(post);
    subtitle.textContent =
      kind === "ad"
        ? "We're keeping you productive."
        : author
          ? "@" + author + " is not someone you follow."
          : "Not from someone you follow.";
    stub.appendChild(subtitle);

    if (this.revealAllowed()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ft-ig-stub-btn";
      button.textContent = "View Anyway";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        post.dataset.ftIgReveal = "1";
        this.restore(post);
      });
      stub.appendChild(button);
    }
  },
};

if (Site.isIG()) {
  if (window.__ftSettingsReady) Instagram.init();
  else document.addEventListener("ft-settings-ready", () => Instagram.init());
  Utils.registerLifecycle({
    onDisable: () => Instagram.disable(),
    onEnable: () => {
      if (!Utils.isExtensionEnabled()) return;
      if (!Instagram.initialized) Instagram.init();
      else Instagram.enable();
    },
  });
}
