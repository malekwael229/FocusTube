const LinkedIn = {
  initialized: false,
  observer: null,
  pendingTimeout: null,
  currentMode: "strict",
  feedOverlayId: "ft-linkedin-feed-overlay",
  addFeedOverlayId: "ft-linkedin-addfeed-overlay",
  init: function () {
    if (this.initialized) return;
    Utils.ensureBody(() => this._start());
  },
  _start: function () {
    if (this.initialized) return;
    if (!Utils.isExtensionEnabled()) return;
    this.initialized = true;
    document.body.classList.add("ft-platform-li");
    if (CONFIG.session.platform === "li") {
      Utils.clearSession();
    }
    this.clearDismissalFlags();
    this.ensureObservers();
    window.addEventListener("focus", () => {
      if (
        CONFIG.platformSettings.li === "warn" &&
        CONFIG.session.platform === "li"
      ) {
        Utils.clearSession();
        this.runChecks();
      }
    });
    window.addEventListener("popstate", () => this.runChecks());
    chrome.storage.onChanged.addListener((changes) => {
      if (
        changes.platformSettings ||
        changes.focusMode ||
        changes.ft_timer_end ||
        changes.ft_timer_type ||
        changes.hide_li_feed ||
        changes.hide_li_addfeed ||
        changes.hide_li_suggested ||
        changes.hide_li_activity ||
        changes.popup_visible_li ||
        changes.restrictHiddenPlatforms ||
        changes.visualHideHiddenPlatforms
      ) {
        this.runChecks();
      }
    });
    document.addEventListener("ft-settings-changed", () => this.runChecks());
    this.runChecks();
  },
  ensureObservers: function () {
    if (!document.body) return;
    if (!this.observer) {
      this.observer = Utils.trackObserver(
        new MutationObserver(() => this.scheduleMutationCheck()),
      );
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
  },
  disable: function () {
    if (this.pendingTimeout !== null) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
    this.removeAllOverlays();
    this.clearDismissalFlags();
    LIFeed.disable();
    if (this.observer) this.observer.disconnect();
    this.observer = null;
  },
  scheduleMutationCheck: function () {
    if (this.pendingTimeout !== null) return;
    this.pendingTimeout = setTimeout(() => {
      this.pendingTimeout = null;
      this.runChecks();
    }, 50);
  },
  enable: function () {
    if (!document.body) return;
    document.body.classList.add("ft-platform-li");
    this.ensureObservers();
    this.runChecks();
  },
  runChecks: function () {
    if (!Utils.isExtensionEnabled()) {
      LIFeed.disable();
      this.removeAllOverlays();
      return;
    }
    let action = "none";
    let reason = "";
    const path = window.location.pathname;
    const nextMode = CONFIG.platformSettings.li;
    const modeChanged = nextMode !== this.currentMode;
    if (nextMode === "strict" && this.currentMode !== "strict") {
      Utils.clearSession();
      this.clearDismissalFlags();
    }
    if (modeChanged) {
      this.removeAllOverlays();
    }
    this.currentMode = nextMode;
    if (!FocusState.shouldBlock) {
      action = "remove";
      reason = "focus not active";
      LIFeed.sync();
      this.removeAllOverlays();
      Utils.debugLog("li", {
        path,
        mode: this.currentMode,
        isWork: FocusState.isWork,
        isBreak: FocusState.isBreak,
        action,
        reason,
      });
      return;
    }
    if (this.isSafePage()) {
      LIFeed.disable();
      action = "remove";
      reason = "safe page";
      this.removeAllOverlays();
      Utils.debugLog("li", {
        path,
        mode: this.currentMode,
        isWork: FocusState.isWork,
        isBreak: FocusState.isBreak,
        action,
        reason,
      });
      return;
    }
    if (this.currentMode === "allow" && !FocusState.isWork) {
      action = "remove";
      reason = "allow mode";
      this.removeAllOverlays();
      LIFeed.sync();
      Utils.debugLog("li", {
        path,
        mode: this.currentMode,
        isWork: FocusState.isWork,
        isBreak: FocusState.isBreak,
        action,
        reason,
      });
      return;
    }
    if (FocusState.isBreak) {
      LIFeed.disable();
      action = "remove";
      reason = "break timer";
      this.removeAllOverlays();
      Utils.debugLog("li", {
        path,
        mode: this.currentMode,
        isWork: FocusState.isWork,
        isBreak: FocusState.isBreak,
        action,
        reason,
      });
      return;
    }
    const feedAllowed = Utils.isSessionAllowed("li") && !FocusState.isWork;
    if (!this.isFeedPage()) {
      LIFeed.disable();
      action = "remove";
      reason = "not feed page";
      this.removeAllOverlays();
      Utils.debugLog("li", {
        path,
        mode: this.currentMode,
        isWork: FocusState.isWork,
        isBreak: FocusState.isBreak,
        action,
        reason,
      });
      return;
    }
    const allowVisual = Utils.shouldApplyVisualHiding("li");
    if (CONFIG.visualHiding.liFeed && allowVisual && !feedAllowed) {
      action = "overlay";
      reason = "feed hidden";
      this.showFeedOverlay(FocusState.isWork);
    } else {
      action = "allow";
      reason = feedAllowed ? "session allowed" : "feed not hidden";
      this.removeFeedOverlay();
    }
    if (allowVisual && CONFIG.visualHiding.liAddFeed) {
      this.showSidebarOverlays(FocusState.isWork);
    } else {
      this.removeSidebarOverlays();
    }
    LIFeed.sync();
    Utils.debugLog("li", {
      path,
      mode: this.currentMode,
      isWork: FocusState.isWork,
      isBreak: FocusState.isBreak,
      feedAllowed,
      action,
      reason,
    });
  },
  isSafePage: function () {
    const path = window.location.pathname;
    return (
      path.startsWith("/messaging") ||
      path.startsWith("/jobs") ||
      path.startsWith("/mynetwork") ||
      path.startsWith("/learning") ||
      path.startsWith("/in/") ||
      path.startsWith("/company/") ||
      path.startsWith("/school/") ||
      path.startsWith("/notifications") ||
      path.startsWith("/settings")
    );
  },
  isFeedPage: function () {
    return LIFeed.isFeedPath(window.location.pathname);
  },
  showFeedOverlay: function (isForced) {
    const mode = isForced ? "strict" : CONFIG.platformSettings.li;
    if (mode === "allow") return;
    const existing = document.getElementById(this.feedOverlayId);
    if (existing) {
      const existingMode =
        existing.dataset.ftMode ||
        (existing.querySelector("button") ? "warn" : "strict");
      if (existingMode === mode) return;
      this.removeOverlayAndRestore(existing);
    }
    const feedColumn =
      document.querySelector('[data-testid="mainFeed"]') ||
      document.querySelector("main.scaffold-layout__main") ||
      document.querySelector("main#workspace > div > div > div:nth-child(2)") ||
      document.querySelector("#main-content") ||
      null;
    if (!feedColumn) return;
    Utils.setInlineStyle(feedColumn, "position", "relative");
    Utils.setInlineStyle(feedColumn, "overflow", "hidden");
    Utils.setInlineStyle(feedColumn, "max-height", "400px");
    feedColumn.dataset.ftHidden = "true";
    const overlay = this.createOverlayElement(
      this.feedOverlayId,
      ftMessage("feedHidden"),
      mode === "warn",
    );
    overlay.dataset.ftMode = mode;
    feedColumn.appendChild(overlay);
    Utils.logStat();
  },
  findSidebarCard: function (headerText) {
    const normalizeText = (str) =>
      str
        .replace(/[\u0027\u0060\u00B4\u2018\u2019\u201B\u02BC]/g, "'")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const searchText = normalizeText(headerText);
    const matchesHeader = (element) =>
      normalizeText(element.textContent || "").includes(searchText);
    const roots = [
      document.querySelector("aside.scaffold-layout__aside"),
      ...Array.from(document.querySelectorAll("aside")),
    ].filter(Boolean);
    const visitedRoots = new Set();
    for (const root of roots) {
      if (visitedRoots.has(root)) continue;
      visitedRoots.add(root);
      const currentCard = Array.from(
        root.querySelectorAll("div._1f3f3b6f"),
      ).find(matchesHeader);
      if (currentCard) return currentCard;
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        null,
        false,
      );
      let node;
      while ((node = walker.nextNode())) {
        const text = normalizeText(node.textContent || "");
        if (!text || (text !== searchText && !text.includes(searchText))) {
          continue;
        }
        const card =
          node.parentElement && node.parentElement.closest("div._1f3f3b6f");
        if (card && card !== root && root.contains(card)) return card;
        const artdecoCard =
          node.parentElement && node.parentElement.closest(".artdeco-card");
        if (
          artdecoCard &&
          artdecoCard !== root &&
          root.contains(artdecoCard)
        ) {
          return artdecoCard;
        }
        let el = node.parentElement;
        let depth = 0;
        while (el && depth < 12 && el !== root) {
          if (el.nodeType === Node.ELEMENT_NODE) {
            const tag = el.tagName;
            if (tag === "DIV" || tag === "SECTION" || tag === "ARTICLE") {
              const style = window.getComputedStyle(el);
              const bg = style.backgroundColor;
              const hasBg =
                bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
              const hasRadius = parseFloat(style.borderRadius) > 0;
              if (hasBg || hasRadius) return el;
            }
          }
          el = el.parentElement;
          depth++;
        }
      }
    }
    return null;
  },
  showSidebarOverlays: function (isForced) {
    const mode = isForced ? "strict" : CONFIG.platformSettings.li;
    if (mode === "allow") return;
    const allowDismiss = mode === "warn";
    if (CONFIG.visualHiding.liAddFeed) {
      const existing = document.getElementById(this.addFeedOverlayId);
      if (
        existing &&
        (existing.dataset.ftDismiss === "true") !== allowDismiss
      ) {
        this.removeOverlayAndRestore(existing);
      }
      if (!document.getElementById(this.addFeedOverlayId)) {
        const addFeedCard = this.findSidebarCard("Add to your feed");
        if (addFeedCard && !addFeedCard.dataset.ftDismissed) {
          Utils.setInlineStyle(addFeedCard, "position", "relative");
          Utils.setInlineStyle(addFeedCard, "overflow", "hidden");
          const overlay = this.createSmallOverlay(
            this.addFeedOverlayId,
            ftMessage("hidden"),
            allowDismiss,
            addFeedCard,
          );
          addFeedCard.appendChild(overlay);
        }
      }
    } else {
      const existing = document.getElementById(this.addFeedOverlayId);
      if (existing) this.removeOverlayAndRestore(existing);
    }
  },
  removeSidebarOverlays: function () {
    const addFeed = document.getElementById(this.addFeedOverlayId);
    if (addFeed) this.removeOverlayAndRestore(addFeed);
  },
  clearDismissalFlags: function () {
    document.querySelectorAll("[data-ft-dismissed]").forEach((el) => {
      delete el.dataset.ftDismissed;
    });
  },
  createSmallOverlay: function (id, title, showDismiss, parentCard) {
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "ft-stories-overlay";
    localizeOwnedRoot(overlay);
    overlay.dataset.ftDismiss = showDismiss ? "true" : "false";
    if (CONFIG.isDarkMode) overlay.classList.add("dark");
    const icon = Utils.createBadge("ft-stories-overlay-icon");
    const text = document.createElement("span");
    text.textContent = title;
    overlay.appendChild(icon);
    overlay.appendChild(text);
    if (showDismiss) {
      const btn = document.createElement("button");
      btn.className = "ft-linkedin-overlay-btn";
      btn.textContent = ftMessage("view");
      btn.style.cssText =
        "margin-top: 8px; padding: 6px 16px; font-size: 12px; position: relative; z-index: 10; cursor: pointer;";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (parentCard) parentCard.dataset.ftDismissed = "true";
        overlay.remove();
      });
      overlay.appendChild(btn);
    }
    return overlay;
  },
  createOverlayElement: function (id, title, showDismiss) {
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "ft-linkedin-overlay";
    localizeOwnedRoot(overlay);
    if (CONFIG.isDarkMode) overlay.classList.add("dark");
    const icon = Utils.createBadge("ft-linkedin-overlay-icon");
    const h3 = document.createElement("h3");
    h3.textContent = title;
    const subtitle = document.createElement("p");
    subtitle.textContent = ftMessage("overlayProductiveShort");
    overlay.appendChild(icon);
    overlay.appendChild(h3);
    overlay.appendChild(subtitle);
    if (showDismiss) {
      const btn = document.createElement("button");
      btn.className = "ft-linkedin-overlay-btn";
      btn.textContent = ftMessage("viewAnyway");
      btn.onclick = () => {
        Utils.setAllowWindow("li", 5);
        this.removeFeedOverlay();
      };
      overlay.appendChild(btn);
    }
    return overlay;
  },
  removeFeedOverlay: function () {
    const overlay = document.getElementById(this.feedOverlayId);
    if (overlay) {
      const parent = overlay.parentElement;
      if (parent && parent.dataset.ftHidden) {
        Utils.restoreInlineStyles(parent);
        delete parent.dataset.ftHidden;
      }
      overlay.remove();
    }
  },
  removeOverlayAndRestore: function (overlay) {
    if (!overlay) return;
    const parent = overlay.parentElement;
    overlay.remove();
    if (parent) Utils.restoreInlineStyles(parent);
  },
  removeAllOverlays: function () {
    this.removeFeedOverlay();
    this.removeSidebarOverlays();
    UI.remove();
  },
};
/* --------------------------------------------------------------------------
 * LIFeed - optional classification of detected home-feed posts.
 *
 * Same shape as the Instagram module, and deliberately so: every mark is a
 * data attribute or a class, never an inline style. LinkedIn re-renders its
 * feed nodes and blanks their style attribute; attributes survive.
 *
 * Captured English author controls and exact promotion/activity labels are
 * checked only within the outer header. Icons alone and caption text are
 * not evidence. Unsupported markup/languages are left visible; extension
 * translations do not translate the site's detection signals.
 * ------------------------------------------------------------------------ */
const LIFeed = {
  COLLAPSED_CLASS: "ft-li-collapsed",
  STUB_CLASS: "ft-li-stub",
  // Require a matching named author control as well as a captured icon.
  CONNECT_ICONS: ["add-small", "connect-small"],
  // Marks the start of the post body. Everything above it is the header,
  // which is the only place a "Promoted" label is trustworthy - the caption
  // is not.
  BODY_MARK: '[data-testid="expandable-text-box"]',
  // A post author's identity block: the aria-labelled element inside the
  // author link, e.g. aria-label="Dana Whitfield  2nd". A reshared post
  // carries one of its own, which is how the outer post's header is told
  // apart from the header of the post nested inside it.
  //
  // Read through identities() rather than directly: one author accounts for
  // several matches of this selector, and counting them as separate people
  // is what has to be avoided.
  IDENTITY_MARK:
    'a[href*="/in/"] [aria-label], a[href*="/company/"] [aria-label]',
  MIN_COLLAPSED_HEIGHT: 260,
  MAX_COLLAPSE_PER_TICK: 8,
  MAX_STUB_REPAIRS: 3,
  TICK_INTERVAL_MS: 100,
  PROMOTED_LABELS: ["promoted", "sponsored"],

  observer: null,
  root: null,
  collapsed: new Set(),
  touched: new Set(),
  scheduled: false,
  trailingTimer: null,
  frame: null,
  dirtyPosts: new Set(),
  scanNeeded: true,
  settingsKey: null,
  onPlay: null,
  lastTick: 0,
  lastPath: null,
  lastRevealAllowed: null,
  active: false,

  norm: function (text) {
    return (text || "").replace(/\s+/g, " ").trim();
  },
  isFeedPath: function (path) {
    return path === "/" || path === "/feed" || path === "/feed/";
  },
  revealAllowed: function () {
    if (FocusState.isWork) return false;
    return CONFIG.platformSettings.li !== "strict";
  },
  shouldRun: function () {
    return (
      Utils.isExtensionEnabled() &&
      this.isFeedPath(window.location.pathname) &&
      FocusState.shouldBlock &&
      !FocusState.isBreak &&
      (CONFIG.visualHiding.liSuggested || CONFIG.visualHiding.liActivity) &&
      !document.getElementById(LinkedIn.feedOverlayId) &&
      Utils.shouldApplyVisualHiding("li")
    );
  },
  sync: function () {
    const path = window.location.pathname;
    if (path !== this.lastPath) {
      this.disable();
      this.lastPath = path;
    }
    if (!this.shouldRun()) {
      this.disable();
      return;
    }
    const settings = [CONFIG.visualHiding.liSuggested,
      CONFIG.visualHiding.liActivity, this.revealAllowed(), CONFIG.isDarkMode].join("|");
    if (!this.active || settings !== this.settingsKey) {
      if (this.active) this.collapsed.forEach((post) => this.renderStub(post, post.dataset.ftLiClass));
      this.settingsKey = settings;
      this.scanNeeded = true;
      this.enable();
    } else {
      this.ensureObserver();
    }
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
    if (this.root && this.onPlay) this.root.removeEventListener("play", this.onPlay, true);
    this.root = null;
    if (this.trailingTimer) {
      clearTimeout(this.trailingTimer);
      this.trailingTimer = null;
    }
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.scheduled = false;
    this.dirtyPosts.clear();
    this.scanNeeded = true;
    this.settingsKey = null;
    this.restoreAll();
  },
  findFeedRoot: function () {
    return document.querySelector("main") || null;
  },
  ensureObserver: function () {
    const root = this.findFeedRoot();
    if (!root) {
      if (this.observer) this.observer.disconnect();
      if (this.root && this.onPlay) this.root.removeEventListener("play", this.onPlay, true);
      this.root = null;
      this.dirtyPosts.clear();
      this.restoreAll();
      return;
    }
    if (!this.observer) {
      this.observer = Utils.trackObserver(
        new MutationObserver((records) => {
          for (const record of records) {
            if (this.isOwnMutation(record)) continue;
            const target = record.target.nodeType === 1
              ? record.target : record.target.parentElement;
            let post = target && target.closest('[role="listitem"]');
            while (post && post.parentElement?.closest('[role="listitem"]')) {
              post = post.parentElement.closest('[role="listitem"]');
            }
            if (post) this.dirtyPosts.add(post);
            else this.scanNeeded = true;
          }
          if (this.dirtyPosts.size || this.scanNeeded) this.schedule();
        }),
      );
    }
    if (!Utils.observers.includes(this.observer)) Utils.trackObserver(this.observer);
    if (this.root !== root) {
      this.observer.disconnect();
      if (this.root && this.onPlay) this.root.removeEventListener("play", this.onPlay, true);
      this.restoreAll();
      this.root = root;
      if (!this.onPlay) this.onPlay = (event) => {
        const post = event.target.closest && event.target.closest("." + this.COLLAPSED_CLASS);
        if (post && this.collapsed.has(post)) this.hushMedia(post);
      };
      root.addEventListener("play", this.onPlay, true);
      this.observer.observe(root, {
        childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ["aria-label", "aria-pressed", "aria-disabled", "href", "id", "class", "componentkey", "role", "data-testid"],
      });
      this.scanNeeded = true;
      this.schedule();
    }
  },
  schedule: function () {
    if (!this.active || this.scheduled) return;
    this.scheduled = true;
    const wait = Math.max(
      0,
      this.TICK_INTERVAL_MS - (Date.now() - this.lastTick),
    );
    const run = () => {
      this.trailingTimer = null;
      this.lastTick = Date.now();
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.scheduled = false;
        this.tick(true);
      });
    };
    if (wait === 0) run();
    else this.trailingTimer = setTimeout(run, wait);
  },
  posts: function () {
    // Top-level feed items only. A reshared post nests another listitem, and
    // judging the inner one would collapse a piece of an outer post.
    return [...this.root.querySelectorAll('[role="listitem"]')].filter(
      (el) => !el.parentElement || !el.parentElement.closest('[role="listitem"]'),
    );
  },
  tick: function (targeted = false) {
    if (!this.active) return;
    if (!this.shouldRun()) {
      this.disable();
      return;
    }
    this.ensureObserver();
    if (!this.root) return;
    if (this.scanNeeded) this.touched.forEach((post) => {
      if (!post.isConnected || !this.root.contains(post)) {
        this.forget(post);
        delete post.dataset.ftLiKey;
        this.touched.delete(post);
      } else if (post.getAttribute("role") !== "listitem") {
        // LinkedIn can recycle a tracked node and remove its listitem role;
        // stop treating the stale element as a feed post and restore it.
        this.forget(post);
        delete post.dataset.ftLiKey;
        this.touched.delete(post);
      }
    });

    const revealAllowed = this.revealAllowed();
    if (revealAllowed !== this.lastRevealAllowed) {
      this.lastRevealAllowed = revealAllowed;
      this.collapsed.forEach((post) =>
        this.renderStub(post, post.dataset.ftLiClass),
      );
    }

    const posts = !targeted || this.scanNeeded ? this.posts() : [...this.dirtyPosts];
    this.dirtyPosts.clear();
    this.scanNeeded = false;
    let collapsedThisTick = 0;
    posts.forEach((post) => {
      if (!post.isConnected || !this.root.contains(post)) return;
      // Recycled identity must be checked before a reveal or repair exemption.
      let kind = this.classify(post);
      if (post.dataset.ftLiGiveUp === "1") {
        if (this.collapsed.has(post)) this.restore(post);
        return;
      }
      if (post.dataset.ftLiReveal === "1") {
        if (revealAllowed) {
          if (this.collapsed.has(post)) this.restore(post);
          return;
        }
        delete post.dataset.ftLiReveal;
      }
      if (kind === "pending") {
        if (this.collapsed.has(post)) this.restore(post);
        return;
      }
      // The two settings control separate categories.
      if (kind === "activity" && !CONFIG.visualHiding.liActivity) kind = "keep";
      if ((kind === "ad" || kind === "suggested") && !CONFIG.visualHiding.liSuggested) kind = "keep";
      if (kind === "keep") {
        if (this.collapsed.has(post)) this.restore(post);
        return;
      }
      if (this.collapsed.has(post)) {
        this.repairStub(post, kind);
        this.hushMedia(post);
        return;
      }
      if (collapsedThisTick >= this.MAX_COLLAPSE_PER_TICK) {
        this.dirtyPosts.add(post);
        return;
      }
      this.collapse(post, kind);
      collapsedThisTick += 1;
    });

    if (this.dirtyPosts.size) this.schedule();
  },
  identities: function (post) {
    // The people named in this post's headers, in document order, one entry
    // each.
    //
    // A single author matches IDENTITY_MARK three times: the avatar carries
    // aria-label="View X's profile" on the <svg> or <img> inside its
    // <figure>, the name block carries "X Verified Profile 2nd", and LinkedIn
    // repeats that block in an empty div below the timestamp. Treating those
    // as three people put the end of the header above the author's own Follow
    // control, so every post came out as "keep" and nothing was ever hidden.
    //
    // The avatar is dropped by shape and the repeat by label, which leaves one
    // entry per person - so a second entry really does mean a second person,
    // which is what a nested repost is.
    const found = [];
    const seen = new Set();
    post.querySelectorAll(this.IDENTITY_MARK).forEach((el) => {
      const tag = el.tagName ? el.tagName.toLowerCase() : "";
      if (tag === "svg" || tag === "img" || el.closest("figure")) return;
      const label = this.norm(el.getAttribute("aria-label"));
      if (!label || seen.has(label)) return;
      seen.add(label);
      found.push(el);
    });
    return found;
  },
  authorLink: function (post) {
    // The author link is the one carrying an identity block. Taking the first
    // profile link instead picks up the "... reshared this" line above the
    // post, which names whoever surfaced it rather than who wrote it.
    const labelled = this.identities(post)[0];
    if (labelled) return labelled.closest("a");
    return post.querySelector('a[href*="/in/"], a[href*="/company/"]');
  },
  headerBoundary: function (post) {
    // Where the outer post's own header stops. Whichever comes first of:
    //
    //   the post body      - a caption saying "promoted" is not a label, and
    //                        a reshared post sits below the commentary;
    //   a second identity  - a reshared post carries its own author header,
    //                        with its own Follow or Connect control, and that
    //                        control says nothing about the outer post.
    //
    // A reshare with no commentary has no body mark, which is exactly the
    // case the second identity covers; a reshare with commentary is caught by
    // whichever of the two comes first.
    const body = post.querySelector(this.BODY_MARK);
    const people = this.identities(post);
    const nested = people.length > 1 ? people[1] : null;
    if (!body) return nested;
    if (!nested) return body;
    return body.compareDocumentPosition(nested) &
      Node.DOCUMENT_POSITION_PRECEDING
      ? nested
      : body;
  },
  inHeader: function (boundary, node) {
    if (!boundary) return true;
    return !!(
      boundary.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING
    );
  },
  followButton: function (post) {
    const selector = this.CONNECT_ICONS.map(
      (id) => 'svg[id="' + id + '"]',
    ).join(", ");
    // Scoped to the outer post's header. Unscoped, resharing somebody you are
    // not connected to would hide the post of the person you follow who
    // reshared it, because the nested post's Connect control was read as the
    // outer post's.
    const boundary = this.headerBoundary(post);
    const identity = this.identities(post)[0];
    const name = this.author(post);
    if (!boundary || !identity || !name) return null;
    // A link, not only a button: "Connect" is rendered as an anchor.
    const controls = post.querySelectorAll("button, a");
    for (const control of controls) {
      if (!this.inHeader(boundary, control)) break;
      if (!(identity.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (control.disabled || control.getAttribute("aria-disabled") === "true") continue;
      const label = this.norm(control.getAttribute("aria-label"));
      if (control.querySelector(selector) &&
          (label === "Follow " + name || label === "Invite " + name + " to connect")) return control;
    }
    return null;
  },
  surfacedByPerson: function (post) {
    // The line above the author - "Dana Whitfield likes this", "... commented"
    // - names somebody and links to their profile. "From your activity" is the
    // feed's own guess and carries no such link, which is what separates the
    // two without reading either of them.
    const author = this.identities(post)[0];
    if (!author) return false;
    const authorLink = author.closest("a");
    // The author's own avatar is a profile link too, and it sits above their
    // name - so position alone says every post was surfaced by somebody. It
    // is a different profile that makes it somebody else's doing.
    const mine = authorLink ? this.profilePath(authorLink) : null;
    const links = post.querySelectorAll('a[href*="/in/"], a[href*="/company/"]');
    for (const link of links) {
      if (link.contains(author)) break;
      if (
        !(link.compareDocumentPosition(author) & Node.DOCUMENT_POSITION_FOLLOWING)
      ) {
        break;
      }
      const path = this.profilePath(link);
      const line = link.closest("p");
      if (!line || !this.inHeader(author, line)) continue;
      const text = this.norm(line.textContent);
      // A profile link alone may be a recommendation, not network activity.
      if (path && path !== mine && /\b(?:reacted to|likes|liked|celebrates|commented on|reposted|reshared) this[.!]?$/i.test(text)) return true;
    }
    return false;
  },
  profilePath: function (link) {
    try {
      const url = new URL(link.getAttribute("href"), window.location.href);
      if (url.hostname !== "www.linkedin.com" && url.hostname !== "linkedin.com") return null;
      const match = url.pathname.match(/^\/(in|company)\/([^/]+)/);
      return match ? match[1] + "/" + decodeURIComponent(match[2]) : null;
    } catch {
      return null;
    }
  },
  isOwnMutation: function (record) {
    const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (target && target.closest("." + this.STUB_CLASS)) return true;
    return record.type === "childList" && !record.removedNodes.length &&
      record.addedNodes.length > 0 && [...record.addedNodes].every((node) =>
        node.nodeType === 1 && node.classList.contains(this.STUB_CLASS));
  },
  hushMedia: function (post) {
    // Collapsing hides the post's children with display:none, which does not
    // stop playback: a video in a post nobody can see would otherwise keep
    // playing its audio.
    post.querySelectorAll("video, audio").forEach((media) => {
      try {
        if (!media.paused) media.pause();
      } catch (e) {
        // A media element being torn down is not worth throwing a tick over.
      }
    });
  },
  headerLabels: function (post) {
    // Short text leaves above the post body and above any nested repost.
    // Scoped that way so neither a caption that happens to say "promoted" nor
    // a reshared post's own "Promoted" label is read as this post's.
    const boundary = this.headerBoundary(post);
    const identity = this.identities(post)[0];
    if (!boundary || !identity) return [];
    const labels = [];
    const walker = document.createTreeWalker(post, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!this.inHeader(boundary, node)) break;
      if (!(identity.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (node.parentElement.closest("a, button, ." + this.STUB_CLASS)) continue;
      const text = this.norm(node.nodeValue).toLowerCase();
      if (text && text.length <= 40) labels.push(text);
    }
    return labels;
  },
  isRendered: function (post) {
    // The action bar is the last thing to paint, so its presence means the
    // header - and any Follow or Connect control in it - has already been
    // rendered.
    return (
      !!post.querySelector('a[href*="/in/"], a[href*="/company/"]') &&
      !!post.querySelector('svg[id="thumbs-up-outline-small"]')
    );
  },
  author: function (post) {
    // The header's own aria-label, e.g. "Almaz Salyakhov, Open to work
    // Verified Profile 2nd". Taking the first profile link instead picks up
    // the "Followed by ..." line above the post, which names whoever surfaced
    // it rather than who wrote it.
    const labelled = this.identities(post)[0];
    if (labelled) {
      // e.g. "Kirill Sadchikov  2nd", "ST Engineering Verified",
      // "Almaz Salyakhov, Open to work Verified Profile 2nd".
      // Trailing badge words, stripped one at a time because they stack:
      // "Harriet Vance Verified Profile 3rd+", "Dr. Sybe Rispens Premium
      // Profile 2nd". English-only, and only cosmetic - the worst case is a
      // couple of extra words in the placeholder's caption.
      let label = this.norm(labelled.getAttribute("aria-label")).split(",")[0];
      let previous = null;
      while (previous !== label) {
        previous = label;
        label = label
          .replace(/\s*•?\s*(1st|2nd|3rd\+?)\s*$/i, "")
          .replace(/\s+(verified|premium|profile)\s*$/i, "")
          .trim();
      }
      if (label) return label.slice(0, 60);
    }
    const links = post.querySelectorAll('a[href*="/in/"], a[href*="/company/"]');
    for (const link of links) {
      const name = this.norm(link.textContent);
      if (name) return name.slice(0, 60);
    }
    return null;
  },
  postKey: function (post) {
    // Which post this element is currently showing. LinkedIn recycles feed
    // nodes as you scroll, so a verdict stamped on the element has to be tied
    // to the post it was a verdict about - otherwise a recycled node carries
    // the previous post's answer onto a new one.
    //
    // Also include author/body when componentkey stays stable during recycling.
    // Only the opening is used so expanding "see more" does not revoke a reveal.
    const own = post.getAttribute("componentkey") || "";
    const link = this.authorLink(post);
    const href = link ? (link.getAttribute("href") || "?").split("?")[0] : "?";
    const body = post.querySelector(this.BODY_MARK);
    return own + "|" + href + "|" + (body ? this.norm(body.textContent).slice(0, 60) : "");
  },
  forget: function (post) {
    // Everything decided about the post this element used to hold.
    delete post.dataset.ftLiClass;
    delete post.dataset.ftLiReveal;
    delete post.dataset.ftLiGiveUp;
    delete post.dataset.ftLiStubs;
    if (this.collapsed.has(post)) this.restore(post);
  },
  classify: function (post) {
    this.touched.add(post);
    const key = this.postKey(post);
    if (post.dataset.ftLiKey && post.dataset.ftLiKey !== key) this.forget(post);
    post.dataset.ftLiKey = key;
    const previous = post.dataset.ftLiClass;
    const verdict = (kind) => {
      if (previous && previous !== kind) {
        delete post.dataset.ftLiReveal;
        delete post.dataset.ftLiGiveUp;
        delete post.dataset.ftLiStubs;
      }
      post.dataset.ftLiClass = kind;
      return kind;
    };
    const rendered = this.isRendered(post);
    const labels = this.headerLabels(post);
    if (
      labels.some((text) =>
        this.PROMOTED_LABELS.includes(text),
      )
    ) {
      return verdict("ad");
    }
    const identity = this.identities(post)[0];
    const connected = identity && /(?:^|\s|•)1st(?:\s|$)/i.test(this.norm(identity.getAttribute("aria-label")));
    const boundary = this.headerBoundary(post);
    const following = boundary && [...post.querySelectorAll("button, a")].some((control) =>
      this.inHeader(boundary, control) && /^(?:Following|Unfollow)(?:\s|$)/i.test(this.norm(control.getAttribute("aria-label"))));
    if (rendered && !connected && !following && this.followButton(post)) {
      // Told apart because the two are wanted by different people: a post
      // somebody in your network reacted to is at least connected to you,
      // while a bare suggestion is the feed guessing. Which of them is hidden
      // is decided in tick() from the setting, not here, so toggling the
      // setting cannot leave a stale verdict behind.
      const kind = this.surfacedByPerson(post) ? "activity" : "suggested";
      return verdict(kind);
    }
    // Fail open: nothing is judged until the post has actually painted.
    if (rendered) {
      return verdict("keep");
    }
    if (previous) this.forget(post);
    return "pending";
  },
  measureHeight: function (post) {
    const height = Math.round(post.getBoundingClientRect().height);
    return Math.max(height, this.MIN_COLLAPSED_HEIGHT);
  },
  collapse: function (post, kind) {
    post.dataset.ftLiHeight = String(this.measureHeight(post));
    post.classList.add(this.COLLAPSED_CLASS);
    this.collapsed.add(post);
    this.hushMedia(post);
    this.renderStub(post, kind);
  },
  restore: function (post) {
    if (!post) return;
    post.classList.remove(this.COLLAPSED_CLASS);
    delete post.dataset.ftLiHeight;
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
      delete post.dataset.ftLiClass;
      delete post.dataset.ftLiKey;
      delete post.dataset.ftLiReveal;
      delete post.dataset.ftLiGiveUp;
      delete post.dataset.ftLiStubs;
    });
    this.touched.clear();
  },
  repairStub: function (post, kind) {
    if (!post.classList.contains(this.COLLAPSED_CLASS)) post.classList.add(this.COLLAPSED_CLASS);
    if (post.querySelector(":scope > ." + this.STUB_CLASS)) return;
    const attempts = parseInt(post.dataset.ftLiStubs || "0", 10);
    if (attempts >= this.MAX_STUB_REPAIRS) {
      post.dataset.ftLiGiveUp = "1";
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
      localizeOwnedRoot(stub);
      if (CONFIG.isDarkMode) stub.classList.add("dark");
      post.appendChild(stub);
      post.dataset.ftLiStubs = String(
        parseInt(post.dataset.ftLiStubs || "0", 10) + 1,
      );
    }
    stub.classList.toggle("dark", !!CONFIG.isDarkMode);
    while (stub.firstChild) stub.removeChild(stub.firstChild);
    const height = parseInt(post.dataset.ftLiHeight || "0", 10);
    if (height > 0) {
      stub.style.setProperty("height", height + "px", "important");
    }

    stub.appendChild(Utils.createBadge("ft-li-stub-icon"));
    const title = document.createElement("h3");
    title.textContent = ftMessage("hidden");
    stub.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.textContent = ftMessage("overlayProductiveShort");
    stub.appendChild(subtitle);

    if (this.revealAllowed()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ft-li-stub-btn";
      button.textContent = ftMessage("viewAnyway");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        post.dataset.ftLiReveal = "1";
        this.restore(post);
      });
      stub.appendChild(button);
    }
  },
};
if (Site.isLI()) {
  if (window.__ftSettingsReady) LinkedIn.init();
  else document.addEventListener("ft-settings-ready", () => LinkedIn.init());
  Utils.registerLifecycle({
    onDisable: () => LinkedIn.disable(),
    onEnable: () => {
      if (!Utils.isExtensionEnabled()) return;
      if (!LinkedIn.initialized) LinkedIn.init();
      else LinkedIn.enable();
    },
  });
}
