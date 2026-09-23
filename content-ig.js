const scheduleFrame = (callback) =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : setTimeout(callback, 0);

const cancelFrame = (id) =>
  typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id);

const Instagram = {
  initialized: false,
  observer: null,
  checkScheduled: false,
  checkFrame: null,
  routeCheckTimer: null,
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
    this.lastPath = window.location.pathname;
    this.ensureObservers();
    this.startRouteWatcher();
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
  startRouteWatcher: function () {
    if (this.routeCheckTimer === null) {
      const checkRoute = () => {
        const path = window.location.pathname;
        if (path !== this.lastPath) {
          this.lastPath = path;
          this.runChecks();
        } else if (
          /^\/p\/[A-Za-z0-9_-]+\/?$/.test(path) &&
          Utils.isExtensionEnabled() &&
          !FocusState.isBreak &&
          (FocusState.isWork || CONFIG.platformSettings.ig === "strict") &&
          this.getReelPermalinkArticle(path)
        ) {
          this.runChecks();
        }
        this.routeCheckTimer = setTimeout(checkRoute, 250);
      };
      this.routeCheckTimer = setTimeout(checkRoute, 250);
    }
  },
  getReelPermalinkArticle: function (path) {
    const permalink = /^\/p\/([A-Za-z0-9_-]+)\/?$/.exec(path);
    if (!permalink) return null;
    const code = permalink[1];
    const isVisible = (element) => {
      if (!element || !element.isConnected || !element.getClientRects().length) return false;
      for (let current = element; current; current = current.parentElement) {
        if (current.hidden || current.getAttribute("aria-hidden") === "true") return false;
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
      }
      return true;
    };
    const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
      .filter(isVisible);
    if (dialogs.length !== 1) return null;
    const dialog = dialogs[0];
    const articles = [...dialog.querySelectorAll("article")].filter((article) =>
      isVisible(article) &&
      article.closest('[role="dialog"]') === dialog &&
      !article.parentElement?.closest("article"),
    );
    if (articles.length !== 1) return null;
    const article = articles[0];
    const timestampAnchors = [];
    for (const time of article.querySelectorAll("time[datetime]")) {
      if (
        time.closest("ul, ol, li, [role='list'], [role='listitem']") ||
        time.closest("article") !== article ||
        time.closest('[role="dialog"]') !== dialog
      ) continue;
      if (!isVisible(time)) continue;
      const anchor = time.closest("a[href]");
      if (!anchor || !article.contains(anchor) || !isVisible(anchor)) continue;
      timestampAnchors.push(anchor);
    }
    if (timestampAnchors.length !== 1) return null;
    let url;
    try {
      url = new URL(timestampAnchors[0].href, window.location.origin);
    } catch (error) {
      return null;
    }
    if (url.origin !== window.location.origin) return null;
    const identity = /^\/(?:[^/]+\/)?reel\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
    return identity && identity[1] === code ? article : null;
  },
  scheduleChecks: function () {
    if (this.checkScheduled) return;
    this.checkScheduled = true;
    this.checkFrame = scheduleFrame(() => {
      this.checkFrame = null;
      this.checkScheduled = false;
      this.runChecks();
    });
  },
  disable: function () {
    if (this.checkFrame !== null) cancelFrame(this.checkFrame);
    this.checkFrame = null;
    this.checkScheduled = false;
    if (this.routeCheckTimer !== null) {
      clearTimeout(this.routeCheckTimer);
      this.routeCheckTimer = null;
    }
    this.lastPath = "";
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
    this.startRouteWatcher();
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
    if (FocusState.isWork || mode === "strict") {
      const reelArticle = this.getReelPermalinkArticle(path);
      if (reelArticle) {
        IGFeed.hushMedia(reelArticle);
        Utils.debugLog("ig", {
          path,
          mode: this.currentMode,
          isWork: FocusState.isWork,
          isBreak: FocusState.isBreak,
          isFocusActive,
          action: "redirect",
          reason: "reel permalink",
        });
        this.rapidKick(path);
        return;
      }
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
    if (document.getElementById(this.storiesOverlayId)) return;
    const storyTray = this.findStoriesTray();
    if (!storyTray) return;
    Utils.setInlineStyle(storyTray, "position", "relative");
    const overlay = document.createElement("div");
    overlay.id = this.storiesOverlayId;
    overlay.className = "ft-stories-overlay";
    localizeOwnedRoot(overlay);
    if (CONFIG.isDarkMode) overlay.classList.add("dark");
    const icon = Utils.createBadge("ft-stories-overlay-icon");
    const text = document.createElement("span");
    text.textContent = ftMessage("storiesHidden");
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
// Optional home-feed filtering uses exact English labels in post chrome.
// The site's language is independent of the extension locale. Unknown labels,
// divider cards and ambiguous controls fail open; no followed-only guarantee.
// Collapsed posts stay compact. The filter itself does not scroll or request posts.
const IGFeed = {
  COLLAPSED_CLASS: "ft-ig-collapsed",
  STUB_CLASS: "ft-ig-stub",
  MAX_COLLAPSE_PER_TICK: 8,
  MAX_STUB_REPAIRS: 3,
  TICK_INTERVAL_MS: 100,
  MAX_LABEL_NODES: 200,
  ZERO_WIDTH: /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g,
  SPONSORED_LABELS: ["sponsored", "paid partnership"],
  SUGGESTED_LABELS: [
    "suggested for you", "suggested post", "suggested posts", "recommended for you",
  ],
  NON_PROFILE_PATH:
    /^\/(explore|reel|reels|direct|stories|accounts|p|about|legal|privacy)(\/|$)/,

  observer: null,
  root: null,
  collapsed: new Set(),
  touched: new Set(),
  dirtyPosts: new Set(),
  scanNeeded: true,
  settingsKey: null,
  lastRevealAllowed: null,
  scheduled: false,
  trailingTimer: null,
  lastTick: 0,
  frame: null,
  playHandler: null,
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
      !FocusState.isBreak &&
      CONFIG.visualHiding.igSuggested &&
      Utils.shouldApplyVisualHiding("ig")
    );
  },
  sync: function () {
    if (!this.shouldRun()) {
      this.disable();
      return;
    }
    const settings = [this.revealAllowed(), CONFIG.isDarkMode].join("|");
    if (!this.active || settings !== this.settingsKey) {
      this.settingsKey = settings;
      this.scanNeeded = true;
      this.collapsed.forEach((post) => this.renderStub(post));
      this.enable();
    } else this.ensureObserver();
  },
  enable: function () {
    this.active = true;
    this.ensureObserver();
    this.schedule();
  },
  disable: function () {
    if (!this.active && !this.collapsed.size && !this.touched.size) return;
    this.active = false;
    if (this.observer) this.observer.disconnect();
    if (this.frame !== null) cancelFrame(this.frame);
    this.frame = null;
    if (this.playHandler && this.root) this.root.removeEventListener("play", this.playHandler, true);
    this.root = null;
    if (this.trailingTimer !== null) {
      clearTimeout(this.trailingTimer);
      this.trailingTimer = null;
    }
    this.scheduled = false;
    this.dirtyPosts.clear();
    this.scanNeeded = true;
    this.settingsKey = null;
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
    if (this.root === root) return;
    if (this.observer) this.observer.disconnect();
    if (this.root && this.playHandler) this.root.removeEventListener("play", this.playHandler, true);
    this.restoreAll();
    this.root = root;
    if (!root) return;
    if (!this.playHandler) this.playHandler = (event) => {
      const post = event.target.closest?.("article");
      if (post && this.collapsed.has(post)) this.hushMedia(post);
    };
    root.addEventListener("play", this.playHandler, true);
    if (!this.observer) {
      this.observer = Utils.trackObserver(new MutationObserver((records) => {
        for (const record of records) {
          if (this.isOwnMutation(record)) continue;
          const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
          let post = target?.closest("article");
          while (post?.parentElement?.closest("article")) post = post.parentElement.closest("article");
          if (post) this.dirtyPosts.add(post);
          else if (record.type === "childList") this.scanNeeded = true;
        }
        if (this.dirtyPosts.size || this.scanNeeded) this.schedule();
      }));
    }
    if (!Utils.observers.includes(this.observer)) Utils.trackObserver(this.observer);
    this.observer.observe(root, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ["href", "datetime", "class"],
    });
    this.scanNeeded = true;
    this.schedule();
  },
  schedule: function () {
    if (!this.active || this.scheduled) return;
    this.scheduled = true;
    const wait = Math.max(0, this.TICK_INTERVAL_MS - (Date.now() - this.lastTick));
    const run = () => {
      this.trailingTimer = null;
      this.lastTick = Date.now();
      this.frame = scheduleFrame(() => {
        this.frame = null;
        this.scheduled = false;
        this.tick(true);
      });
    };
    if (wait === 0) run();
    else this.trailingTimer = setTimeout(run, wait);
  },
  tick: function (targeted = false) {
    if (!this.active) return;
    if (!this.shouldRun()) {
      this.disable();
      return;
    }
    this.ensureObserver();
    if (!this.root) return;
    // Restore even detached nodes: Instagram may reinsert the same element.
    if (this.scanNeeded) [...this.touched].forEach((post) => {
      if (!post.isConnected || !this.root.contains(post)) {
        this.forget(post);
        delete post.dataset.ftIgKey;
        this.touched.delete(post);
      }
    });
    const revealAllowed = this.revealAllowed();
    if (revealAllowed !== this.lastRevealAllowed) {
      this.lastRevealAllowed = revealAllowed;
      this.collapsed.forEach((post) => this.renderStub(post, post.dataset.ftIgClass));
    }
    const posts = !targeted || this.scanNeeded
      ? [...this.root.querySelectorAll("article")].filter((post) => !post.parentElement?.closest("article"))
      : [...this.dirtyPosts];
    this.dirtyPosts.clear();
    this.scanNeeded = false;
    let count = 0;
    posts.forEach((post) => {
      if (!post.isConnected || !this.root.contains(post)) return;
      const kind = this.classify(post);
      if (post.dataset.ftIgGiveUp === "1") return;
      if (post.dataset.ftIgReveal === "1" && revealAllowed) return;
      delete post.dataset.ftIgReveal;
      if (kind === "keep" || kind === "pending") {
        if (this.collapsed.has(post)) this.restore(post);
      } else if (this.collapsed.has(post)) {
        this.repairStub(post, kind);
        this.hushMedia(post);
      } else if (count < this.MAX_COLLAPSE_PER_TICK) {
        this.collapse(post, kind);
        count += 1;
      } else this.dirtyPosts.add(post);
    });
    if (this.dirtyPosts.size) this.schedule();
  },
  isOwnMutation: function (record) {
    const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (target?.closest("." + this.STUB_CLASS)) return true;
    // Only ignore addition of our stub. Removal must trigger bounded repair.
    return record.type === "childList" && !record.removedNodes.length &&
      record.addedNodes.length > 0 && [...record.addedNodes].every((node) =>
        node.nodeType === 1 && node.classList.contains(this.STUB_CLASS));
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
    // No known chrome/caption boundary means no safe label classification.
    const boundary = this.postChrome(post);
    if (!boundary) return [];
    const labels = [];
    const walker = document.createTreeWalker(post, NodeFilter.SHOW_TEXT);
    let node;
    let scanned = 0;
    while ((node = walker.nextNode()) && scanned++ < this.MAX_LABEL_NODES) {
      if (!this.inChrome(boundary, node)) break;
      if (node.parentElement.closest("a, button, [role=button], figure, blockquote, ." + this.STUB_CLASS)) continue;
      const text = this.norm(node.nodeValue).toLowerCase();
      if (text && text.length <= 40) labels.push(text);
    }
    return labels;
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
      (post.querySelector('a[href^="/p/"], a[href^="/reel/"]')?.getAttribute("href") || "?") + "|" +
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
  classify: function (post) {
    this.touched.add(post);
    const key = this.postKey(post);
    if (post.dataset.ftIgKey && post.dataset.ftIgKey !== key) this.forget(post);
    post.dataset.ftIgKey = key;
    // Re-evaluate current evidence, including text edits and removed labels.
    // A DOM element's old verdict is never evidence for its recycled content.
    const labels = this.labelNodes(post);
    const kind = labels.some((text) => this.SPONSORED_LABELS.includes(text)) ? "ad" :
      labels.some((text) => this.SUGGESTED_LABELS.includes(text)) ? "suggested" : "keep";
    if (post.dataset.ftIgClass && post.dataset.ftIgClass !== kind) this.forget(post);
    post.dataset.ftIgClass = kind;
    return kind;
  },
  collapse: function (post, kind) {
    post.classList.add(this.COLLAPSED_CLASS);
    this.collapsed.add(post);
    this.hushMedia(post);
    this.renderStub(post, kind);
  },
  restore: function (post) {
    if (!post) return;
    post.classList.remove(this.COLLAPSED_CLASS);
    post
      .querySelectorAll(":scope > ." + this.STUB_CLASS)
      .forEach((el) => el.remove());
    this.collapsed.delete(post);
  },
  restoreAll: function () {
    [...this.collapsed].forEach((post) => this.restore(post));
    this.collapsed.clear();
    this.lastRevealAllowed = null;
    this.touched.forEach((post) => {
      for (const key of ["ftIgClass", "ftIgKey", "ftIgReveal", "ftIgGiveUp", "ftIgStubs"]) delete post.dataset[key];
    });
    this.touched.clear();
  },
  repairStub: function (post, kind) {
    if (!post.classList.contains(this.COLLAPSED_CLASS)) post.classList.add(this.COLLAPSED_CLASS);
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
  renderStub: function (post) {
    const revealAllowed = this.revealAllowed();
    let stub = post.querySelector(":scope > ." + this.STUB_CLASS);
    if (!stub) {
      stub = document.createElement("div");
      stub.className = this.STUB_CLASS;
      localizeOwnedRoot(stub);
      post.appendChild(stub);
      post.dataset.ftIgStubs = String(
        parseInt(post.dataset.ftIgStubs || "0", 10) + 1,
      );
    }
    stub.classList.toggle("dark", !!CONFIG.isDarkMode);
    stub.hidden = !revealAllowed;
    while (stub.firstChild) stub.removeChild(stub.firstChild);

    if (!revealAllowed) return;

    const title = document.createElement("span");
    title.textContent = ftMessage("hidden");
    stub.appendChild(title);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ft-ig-stub-btn";
    button.textContent = ftMessage("viewAnyway");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      post.dataset.ftIgReveal = "1";
      this.restore(post);
    });
    stub.appendChild(button);
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
