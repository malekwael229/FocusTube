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
    const path = window.location.pathname;
    return path === "/" || path.startsWith("/feed");
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
 * LIFeed - hide feed posts from people you are not connected to.
 *
 * Same shape as the Instagram module, and deliberately so: every mark is a
 * data attribute or a class, never an inline style. LinkedIn re-renders its
 * feed nodes and blanks their style attribute; attributes survive.
 *
 * Two signals, both structural rather than textual, because the interface is
 * not always in English:
 *   - a Follow control in the post header. LinkedIn only offers it for people
 *     you do not already follow, which is the question being asked. It is
 *     found by the plus icon it contains (svg id "add-small"), not by its
 *     label.
 *   - a call-to-action leaving LinkedIn directly. Organic posts route external
 *     links through linkedin.com/safety/go/; only promoted posts link straight
 *     out. Backed up by the "Promoted" label where the language matches.
 * ------------------------------------------------------------------------ */
const LIFeed = {
  COLLAPSED_CLASS: "ft-li-collapsed",
  STUB_CLASS: "ft-li-stub",
  // The plus icon on "Follow" and the person-plus icon on "Connect". Both say
  // the same thing: this is not somebody you are already connected to. Found
  // by icon rather than by label, so the interface language does not matter.
  CONNECT_ICONS: ["add-small", "connect-small"],
  // Marks the start of the post body. Everything above it is the header,
  // which is the only place a "Promoted" label is trustworthy - the caption
  // is not.
  BODY_MARK: '[data-testid="expandable-text-box"]',
  MIN_COLLAPSED_HEIGHT: 260,
  MAX_COLLAPSE_PER_TICK: 8,
  MAX_STUB_REPAIRS: 3,
  TICK_INTERVAL_MS: 100,
  PROMOTED_LABELS: ["promoted", "sponsored"],

  observer: null,
  root: null,
  collapsed: new Set(),
  scheduled: false,
  trailingTimer: null,
  lastTick: 0,
  lastPath: null,
  lastRevealAllowed: null,
  active: false,

  norm: function (text) {
    return (text || "").replace(/\s+/g, " ").trim();
  },
  isFeedPath: function (path) {
    return path === "/" || path === "" || path.startsWith("/feed");
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
      CONFIG.visualHiding.liSuggested &&
      Utils.shouldApplyVisualHiding("li")
    );
  },
  sync: function () {
    const path = window.location.pathname;
    if (path !== this.lastPath) this.lastPath = path;
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
    return document.querySelector("main") || null;
  },
  ensureObserver: function () {
    const root = this.findFeedRoot();
    if (!root) return;
    if (!this.observer) {
      this.observer = Utils.trackObserver(
        new MutationObserver((records) => {
          for (const record of records) {
            if (!record.addedNodes.length) continue;
            const target = record.target;
            const post =
              target && target.nodeType === 1
                ? target.closest('[role="listitem"]')
                : null;
            if (post && post.dataset.ftLiClass) continue;
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
    const wait = Math.max(
      0,
      this.TICK_INTERVAL_MS - (Date.now() - this.lastTick),
    );
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
  posts: function () {
    // Top-level feed items only. A reshared post nests another listitem, and
    // judging the inner one would collapse a piece of an outer post.
    return [...this.root.querySelectorAll('[role="listitem"]')].filter(
      (el) => !el.parentElement || !el.parentElement.closest('[role="listitem"]'),
    );
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

    const revealAllowed = this.revealAllowed();
    if (revealAllowed !== this.lastRevealAllowed) {
      this.lastRevealAllowed = revealAllowed;
      this.collapsed.forEach((post) =>
        this.renderStub(post, post.dataset.ftLiClass),
      );
    }

    let collapsedThisTick = 0;
    this.posts().forEach((post) => {
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
      const kind = this.classify(post);
      if (kind === "pending") return;
      if (kind === "keep") {
        if (this.collapsed.has(post)) this.restore(post);
        return;
      }
      if (this.collapsed.has(post)) {
        this.repairStub(post, kind);
        return;
      }
      if (collapsedThisTick >= this.MAX_COLLAPSE_PER_TICK) return;
      this.collapse(post, kind);
      collapsedThisTick += 1;
    });
  },
  followButton: function (post) {
    const selector = this.CONNECT_ICONS.map(
      (id) => 'svg[id="' + id + '"]',
    ).join(", ");
    // A link, not only a button: "Connect" is rendered as an anchor.
    const controls = post.querySelectorAll("button, a");
    for (const control of controls) {
      if (control.querySelector(selector)) return control;
    }
    return null;
  },
  headerLabels: function (post) {
    // Short text leaves above the post body. Scoped that way so a caption
    // that happens to say "promoted" is not read as an ad label.
    const body = post.querySelector(this.BODY_MARK);
    const labels = [];
    const walker = document.createTreeWalker(post, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (body) {
        const pos = body.compareDocumentPosition(node);
        const inside = !!(pos & Node.DOCUMENT_POSITION_CONTAINED_BY);
        const before = !!(pos & Node.DOCUMENT_POSITION_PRECEDING);
        if (inside || !before) break;
      } else if (labels.length >= 20) {
        break;
      }
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
    const labelled = post.querySelector(
      'a[href*="/in/"] [aria-label], a[href*="/company/"] [aria-label]',
    );
    if (labelled) {
      // e.g. "Kirill Sadchikov  2nd", "ST Engineering Verified",
      // "Almaz Salyakhov, Open to work Verified Profile 2nd".
      const label = this.norm(labelled.getAttribute("aria-label"))
        .split(",")[0]
        .replace(/\s*•?\s*(1st|2nd|3rd\+?)\s*$/i, "")
        .replace(/\s+verified\s*$/i, "")
        .trim();
      if (label) return label.slice(0, 60);
    }
    const links = post.querySelectorAll('a[href*="/in/"], a[href*="/company/"]');
    for (const link of links) {
      const name = this.norm(link.textContent);
      if (name) return name.slice(0, 60);
    }
    return null;
  },
  classify: function (post) {
    const cached = post.dataset.ftLiClass;
    if (cached === "ad" || cached === "suggested" || cached === "keep") {
      return cached;
    }
    const rendered = this.isRendered(post);
    const labels = this.headerLabels(post);
    if (
      labels.some((text) =>
        this.PROMOTED_LABELS.some((label) => text.startsWith(label)),
      )
    ) {
      post.dataset.ftLiClass = "ad";
      return "ad";
    }
    if (rendered && this.followButton(post)) {
      post.dataset.ftLiClass = "suggested";
      return "suggested";
    }
    // Fail open: nothing is judged until the post has actually painted.
    if (rendered) {
      post.dataset.ftLiClass = "keep";
      return "keep";
    }
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
    document
      .querySelectorAll("." + this.COLLAPSED_CLASS)
      .forEach((post) => this.restore(post));
    document
      .querySelectorAll("." + this.STUB_CLASS)
      .forEach((el) => el.remove());
  },
  repairStub: function (post, kind) {
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
      if (CONFIG.isDarkMode) stub.classList.add("dark");
      post.appendChild(stub);
      post.dataset.ftLiStubs = String(
        parseInt(post.dataset.ftLiStubs || "0", 10) + 1,
      );
    }
    while (stub.firstChild) stub.removeChild(stub.firstChild);
    const height = parseInt(post.dataset.ftLiHeight || "0", 10);
    if (height > 0) {
      stub.style.setProperty("height", height + "px", "important");
    }

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
    icon.setAttribute("class", "ft-li-stub-icon");
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
    title.textContent = kind === "ad" ? "Promoted post" : "Not in your network";
    stub.appendChild(title);

    const subtitle = document.createElement("p");
    const author = this.author(post);
    subtitle.textContent =
      kind === "ad"
        ? "We're keeping you productive."
        : author
          ? author + " is not someone you follow."
          : "Not from someone you follow.";
    stub.appendChild(subtitle);

    if (this.revealAllowed()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ft-li-stub-btn";
      button.textContent = "View Anyway";
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
