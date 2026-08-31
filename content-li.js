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
        new MutationObserver(() => {
          if (this.pendingTimeout) clearTimeout(this.pendingTimeout);
          this.pendingTimeout = setTimeout(() => this.runChecks(), 50);
        }),
      );
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
  },
  disable: function () {
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
    this.removeAllOverlays();
    this.clearDismissalFlags();
    LIFeed.disable();
    if (this.observer) this.observer.disconnect();
    this.observer = null;
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
      document.querySelector("#main-content") ||
      document.querySelector("main") ||
      document.querySelector("main#workspace > div > div > div:nth-child(2)");
    if (!feedColumn) return;
    Utils.setInlineStyle(feedColumn, "position", "relative");
    Utils.setInlineStyle(feedColumn, "overflow", "hidden");
    Utils.setInlineStyle(feedColumn, "max-height", "400px");
    feedColumn.dataset.ftHidden = "true";
    const overlay = this.createOverlayElement(
      this.feedOverlayId,
      "Feed Hidden",
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
    const currentCard = Array.from(
      document.querySelectorAll("div._1f3f3b6f"),
    ).find(matchesHeader);
    if (currentCard) return currentCard;

    const roots = [
      document.querySelector("aside.scaffold-layout__aside"),
      ...Array.from(document.querySelectorAll("aside")),
      document.body,
    ].filter(Boolean);
    const visitedRoots = new Set();
    for (const root of roots) {
      if (visitedRoots.has(root)) continue;
      visitedRoots.add(root);
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
        if (card && card !== root) return card;
        const artdecoCard =
          node.parentElement && node.parentElement.closest(".artdeco-card");
        if (artdecoCard && artdecoCard !== root) return artdecoCard;
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
            "Hidden",
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
    overlay.dataset.ftDismiss = showDismiss ? "true" : "false";
    if (CONFIG.isDarkMode) overlay.classList.add("dark");
    const icon = document.createElement("img");
    icon.src = chrome.runtime.getURL("icons/icon48.png");
    icon.className = "ft-stories-overlay-icon";
    const text = document.createElement("span");
    text.textContent = title;
    overlay.appendChild(icon);
    overlay.appendChild(text);
    if (showDismiss) {
      const btn = document.createElement("button");
      btn.className = "ft-linkedin-overlay-btn";
      btn.textContent = "View";
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
    if (CONFIG.isDarkMode) overlay.classList.add("dark");
    const icon = document.createElement("img");
    icon.src = chrome.runtime.getURL("icons/icon128.png");
    icon.className = "ft-linkedin-overlay-icon";
    const h3 = document.createElement("h3");
    h3.textContent = title;
    const subtitle = document.createElement("p");
    subtitle.textContent = "We're keeping you productive.";
    overlay.appendChild(icon);
    overlay.appendChild(h3);
    overlay.appendChild(subtitle);
    if (showDismiss) {
      const btn = document.createElement("button");
      btn.className = "ft-linkedin-overlay-btn";
      btn.textContent = "View Anyway";
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
 * Two signals:
 *   - a Follow or Connect control in the outer post's own header. LinkedIn
 *     only offers it for people you are not already connected to, which is
 *     the question being asked. It is found by the icon it contains (svg id
 *     "add-small" or "connect-small") rather than by its label, so the
 *     interface language does not matter. Scoped to the outer header, because
 *     a reshared post nested in the body carries a header of its own.
 *   - the "Promoted" label in that same header. This one is textual, so it
 *     only catches an English interface; a promoted post that is not caught
 *     is simply left alone.
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
  UNBOUNDED_SCAN: 20,

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
            // Our own stub going in is not news.
            if (this.isOwnMutation(record)) continue;
            const post =
              target && target.nodeType === 1
                ? target.closest('[role="listitem"]')
                : null;
            if (post && post.dataset.ftLiClass) {
              // Churn in the body or the action bar tells us nothing new.
              // Churn in the header does: that is where a Follow or Connect
              // control, or a "Promoted" label, appears when it paints late,
              // so a verdict already stamped on this post is taken again.
              if (!this.headerChurn(post, record)) continue;
              delete post.dataset.ftLiClass;
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
      let kind = this.classify(post);
      if (kind === "pending") return;
      // "Show my network's activity too" lets the reacted-to posts through
      // while suggestions and promoted posts stay hidden.
      if (kind === "activity" && !CONFIG.visualHiding.liActivity) kind = "keep";
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

    // LinkedIn restarts playback when it re-renders a post, so this is done
    // every pass rather than only at collapse time.
    this.collapsed.forEach((post) => this.hushMedia(post));
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
    // A link, not only a button: "Connect" is rendered as an anchor.
    const controls = post.querySelectorAll("button, a");
    for (const control of controls) {
      if (!this.inHeader(boundary, control)) break;
      if (control.querySelector(selector)) return control;
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
      if (path && path !== mine) return true;
    }
    return false;
  },
  profilePath: function (link) {
    const match = (link.getAttribute("href") || "").match(
      /\/(in|company)\/([^/?#]+)/,
    );
    return match ? match[1] + "/" + decodeURIComponent(match[2]) : null;
  },
  isOwnMutation: function (record) {
    for (const node of record.addedNodes) {
      if (node.nodeType === 1 && node.classList.contains(this.STUB_CLASS)) {
        return true;
      }
    }
    return false;
  },
  headerChurn: function (post, record) {
    const boundary = this.headerBoundary(post);
    if (!boundary) return true;
    for (const node of record.addedNodes) {
      if (this.inHeader(boundary, node)) return true;
    }
    return false;
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
    const labels = [];
    const walker = document.createTreeWalker(post, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!this.inHeader(boundary, node)) break;
      if (!boundary && labels.length >= this.UNBOUNDED_SCAN) break;
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
    // componentkey is LinkedIn's own per-post identity and is all we need
    // when it is there; the author and the opening of the body stand in when
    // it is not. The opening only, because it does not change when "see more"
    // expands the rest.
    const own = post.getAttribute("componentkey");
    if (own) return own;
    const link = this.authorLink(post);
    const href = link ? (link.getAttribute("href") || "?").split("?")[0] : "?";
    const body = post.querySelector(this.BODY_MARK);
    return href + "|" + (body ? this.norm(body.textContent).slice(0, 60) : "");
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
    const key = this.postKey(post);
    if (post.dataset.ftLiKey && post.dataset.ftLiKey !== key) this.forget(post);
    post.dataset.ftLiKey = key;
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
      // Told apart because the two are wanted by different people: a post
      // somebody in your network reacted to is at least connected to you,
      // while a bare suggestion is the feed guessing. Which of them is hidden
      // is decided in tick() from the setting, not here, so toggling the
      // setting cannot leave a stale verdict behind.
      const kind = this.surfacedByPerson(post) ? "activity" : "suggested";
      post.dataset.ftLiClass = kind;
      return kind;
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
    // Switching the setting off retires every verdict, so switching it back
    // on judges the feed as it is now rather than as it was.
    // The verdicts go, so switching the setting back on judges the feed as it
    // is now rather than as it was. ftLiReveal stays: "View Anyway" is the
    // reader's decision about one post, and toggling the feature is not a
    // retraction of it.
    document.querySelectorAll("[data-ft-li-class]").forEach((post) => {
      delete post.dataset.ftLiClass;
      delete post.dataset.ftLiKey;
      delete post.dataset.ftLiGiveUp;
      delete post.dataset.ftLiStubs;
    });
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
    title.textContent =
      kind === "ad"
        ? "Promoted post"
        : kind === "activity"
          ? "Someone in your network reacted to this"
          : "Not in your network";
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
