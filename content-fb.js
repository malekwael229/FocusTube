const Facebook = {
  initialized: false,
  observer: null,
  pendingMutationTask: null,
  currentMode: "strict",
  storiesOverlayId: "ft-fb-stories-overlay",
  hiddenNavContainers: new Set(),
  hiddenPeopleContainers: new Set(),
  init: function () {
    if (this.initialized) return;
    Utils.ensureBody(() => this._start());
  },
  _start: function () {
    if (this.initialized) return;
    if (!Utils.isExtensionEnabled()) return;
    this.initialized = true;
    document.body.classList.add("ft-platform-fb");
    this.ensureObservers();
    window.addEventListener("popstate", () => this.runChecks());
    chrome.storage.onChanged.addListener((changes) => {
      if (
        changes.platformSettings ||
        changes.focusMode ||
        changes.ft_timer_end ||
        changes.ft_timer_type ||
        changes.hide_fb_stories ||
        changes.hide_fb_reels_nav ||
        changes.hide_fb_people_you_might_know ||
        changes.popup_visible_fb ||
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
          this.scheduleMutationCheck();
        }),
      );
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
  },
  disable: function () {
    if (this.pendingMutationTask !== null) {
      clearTimeout(this.pendingMutationTask);
      this.pendingMutationTask = null;
    }
    UI.remove();
    this.removeStoriesOverlay();
    this.applyReelsHiding(false);
    this.applyPeopleYouMightKnowHiding(false);
    this.restoreHiddenNavContainers();
    if (this.observer) this.observer.disconnect();
    this.observer = null;
  },
  scheduleMutationCheck: function () {
    if (this.pendingMutationTask !== null) return;
    this.pendingMutationTask = setTimeout(() => {
      this.pendingMutationTask = null;
      this.runChecks();
    }, 0);
  },
  enable: function () {
    if (!document.body) return;
    document.body.classList.add("ft-platform-fb");
    this.ensureObservers();
    this.runChecks();
  },
  runChecks: function () {
    if (!Utils.isExtensionEnabled()) {
      UI.remove();
      this.removeStoriesOverlay();
      this.applyReelsHiding(false);
      this.applyPeopleYouMightKnowHiding(false);
      this.restoreHiddenNavContainers();
      return;
    }
    if (!document.body) return;
    const path = window.location.pathname;
    const warnScope = this.getWarnScope(path);
    const isFocusActive = FocusState.shouldBlock;
    let action = "none";
    let reason = "";
    if (
      CONFIG.platformSettings.fb === "strict" &&
      this.currentMode !== "strict"
    ) {
      Utils.clearSession();
      UI.remove();
      this.removeStoriesOverlay();
    }
    this.currentMode = CONFIG.platformSettings.fb;
    if (FocusState.isBreak) {
      action = "remove";
      reason = "break timer";
      UI.remove();
      this.removeStoriesOverlay();
      this.applyReelsHiding(false);
      this.applyPeopleYouMightKnowHiding(false);
      Utils.debugLog("fb", {
        path,
        mode: this.currentMode,
        isWork: FocusState.isWork,
        isBreak: FocusState.isBreak,
        sessionAllowed: Utils.isSessionAllowed("fb", warnScope),
        action,
        reason,
      });
      return;
    }
    const shouldHideReelsNav =
      isFocusActive &&
      CONFIG.visualHiding.fbReelsNav &&
      Utils.shouldApplyVisualHiding("fb");
    const shouldHidePeopleYouMightKnow =
      isFocusActive &&
      CONFIG.visualHiding.fbPeopleYouMightKnow &&
      Utils.shouldApplyVisualHiding("fb");
    const onReelsPath = this.isReelsPath(path);
    if (onReelsPath) {
      if (
        Utils.isSessionAllowed("fb", warnScope) &&
        CONFIG.platformSettings.fb !== "strict"
      ) {
        action = "allow";
        reason = "session allowed";
        UI.remove();
        Utils.unlockVideo();
        this.applyReelsHiding(shouldHideReelsNav);
        this.applyPeopleYouMightKnowHiding(shouldHidePeopleYouMightKnow);
      } else if (FocusState.isWork || CONFIG.platformSettings.fb === "strict") {
        action = "block";
        reason = FocusState.isWork ? "work timer" : "strict mode";
        UI.create(
          "strict",
          "fb",
          () => {},
          () => {
            window.location.href = "https://www.facebook.com/";
          },
        );
        Utils.lockVideo();
        this.applyReelsHiding(shouldHideReelsNav);
        this.applyPeopleYouMightKnowHiding(shouldHidePeopleYouMightKnow);
      } else if (CONFIG.platformSettings.fb === "warn") {
        action = "warn";
        reason = "warn mode";
        UI.create(
          "warn",
          "fb",
          () => {
            Utils.unlockVideo({ forcePlay: true });
            this.runChecks();
          },
          () => {
            window.location.href = "https://www.facebook.com/";
          },
          { scope: warnScope },
        );
        Utils.lockVideo();
        this.applyReelsHiding(shouldHideReelsNav);
        this.applyPeopleYouMightKnowHiding(shouldHidePeopleYouMightKnow);
      } else {
        action = "allow";
        UI.remove();
        Utils.unlockVideo();
        this.applyReelsHiding(shouldHideReelsNav);
        this.applyPeopleYouMightKnowHiding(shouldHidePeopleYouMightKnow);
      }
    } else {
      action = "safe";
      reason = "non-reels path";
      if (CONFIG.session.platform === "fb") Utils.clearSession();
      UI.remove();
      this.applyReelsHiding(shouldHideReelsNav);
      this.applyPeopleYouMightKnowHiding(shouldHidePeopleYouMightKnow);
      const isHomepage = path === "/" || path === "";
      const shouldHideStories =
        isHomepage &&
        isFocusActive &&
        CONFIG.visualHiding.fbStories &&
        Utils.shouldApplyVisualHiding("fb");
      if (shouldHideStories) {
        this.showStoriesOverlay();
      } else {
        this.removeStoriesOverlay();
      }
    }
    Utils.debugLog("fb", {
      path,
      mode: this.currentMode,
      isWork: FocusState.isWork,
      isBreak: FocusState.isBreak,
      sessionAllowed: Utils.isSessionAllowed("fb", warnScope),
      action,
      reason,
    });
  },
  isReelsPath: function (path) {
    const normalizedPath = (path || "/").replace(/\/+$/, "") || "/";
    return (
      normalizedPath === "/reel" ||
      normalizedPath.startsWith("/reel/") ||
      normalizedPath === "/reels" ||
      normalizedPath.startsWith("/reels/")
    );
  },
  getWarnScope: function (path) {
    if (this.isReelsPath(path)) {
      return path.startsWith("/reels") ? "reels" : "reel";
    }
    return path.split("/").filter(Boolean)[0] || "home";
  },
  applyReelsHiding: function (shouldHide) {
    Utils.pruneDetachedElements(this.hiddenNavContainers);
    if (!shouldHide) {
      this.restoreHiddenNavContainers();
      return;
    }
    const selectors = [
      'a[href="https://www.facebook.com/reel/?s=tab"]',
      'a[href="/reel/?s=tab"]',
    ];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        const container = this.findReelsNavContainer(el);
        if (!container) return;
        Utils.setInlineStyle(container, "display", "none", "important");
        this.hiddenNavContainers.add(container);
      });
    });
  },
  findReelsNavContainer: function (target) {
    if (!target) return null;
    const reelsLink = target.matches?.(
      'a[href="https://www.facebook.com/reel/?s=tab"], a[href="/reel/?s=tab"]',
    )
      ? target
      : target.closest?.(
          'a[href="https://www.facebook.com/reel/?s=tab"], a[href="/reel/?s=tab"]',
        );
    if (!reelsLink) return null;
    return reelsLink.closest("li");
  },
  applyPeopleYouMightKnowHiding: function (shouldHide) {
    Utils.pruneDetachedElements(this.hiddenPeopleContainers);
    if (!shouldHide) {
      this.restoreHiddenPeopleContainers();
      return;
    }
    const targets = document.querySelectorAll(
      [
        '[data-pagelet*="PeopleYouMayKnow"]',
        '[data-pagelet*="PeopleYouMightKnow"]',
        '[aria-label="People You May Know"]',
        '[aria-label="People You Might Know"]',
        'div.x1xnnf8n > div:nth-child(3)',
        '[role="heading"]',
        "h1",
        "h2",
        "h3",
        "h4",
      ].join(", "),
    );
    targets.forEach((target) => {
      const container = this.findPeopleYouMightKnowContainer(target);
      if (!container) return;
      Utils.setInlineStyle(container, "display", "none", "important");
      this.hiddenPeopleContainers.add(container);
    });
  },
  findPeopleYouMightKnowContainer: function (target) {
    if (!target) return null;
    const structuralTarget = target.matches?.(
      'div.x1xnnf8n > div:nth-child(3)',
    );
    if (structuralTarget) {
      const structuralParent = target.parentElement;
      const structuralText = `${target.textContent || ""} ${
        structuralParent?.textContent || ""
      }`;
      const hasSuggestionLink = Boolean(
        target.querySelector?.('a[href*="/friends/suggestions"]') ||
          structuralParent?.querySelector?.('a[href*="/friends/suggestions"]'),
      );
      const hasSuggestionAction = Boolean(
        target.querySelector?.(
          '[aria-label^="Add Friend"], [aria-label^="Remove"]',
        ) ||
          structuralParent?.querySelector?.(
            '[aria-label^="Add Friend"], [aria-label^="Remove"]',
          ),
      );
      if (
        /people you (may|might) know/i.test(structuralText) ||
        (hasSuggestionLink && hasSuggestionAction)
      ) {
        return target;
      }
    }
    const label = (target.getAttribute?.("aria-label") || "").trim();
    const heading = (target.textContent || "").trim().toLowerCase();
    const isPeopleTarget =
      /people you (may|might) know/i.test(label) ||
      heading === "people you may know" ||
      heading === "people you might know";
    const pagelet = target.closest?.(
      '[data-pagelet*="PeopleYouMayKnow"], [data-pagelet*="PeopleYouMightKnow"]',
    );
    if (pagelet && !this.isUnsafePeopleContainer(pagelet)) return pagelet;
    if (!isPeopleTarget) return null;
    const headingElement = target.matches?.(
      'h1, h2, h3, h4, [role="heading"]',
    )
      ? target
      : target.closest?.('h1, h2, h3, h4, [role="heading"]');
    let candidate = headingElement || target;
    for (let depth = 0; candidate && depth < 14; depth += 1) {
      if (!this.isUnsafePeopleContainer(candidate)) {
        const hasSuggestionLink = candidate.querySelector?.(
          'a[href*="/friends/suggestions"]',
        );
        const hasSuggestionAction = candidate.querySelector?.(
          '[aria-label^="Add Friend"], [aria-label^="Remove"]',
        );
        if (hasSuggestionLink && hasSuggestionAction) return candidate;
      }
      candidate = candidate.parentElement;
    }
    const container = target.closest?.(
      '[role="region"], [role="complementary"], [role="article"]',
    );
    if (!container || this.isUnsafePeopleContainer(container)) return null;
    return container;
  },
  isUnsafePeopleContainer: function (node) {
    return Boolean(
      node === document.body ||
        node === document.documentElement ||
      node?.matches?.(
        'body, [role="main"], main, [role="navigation"], [data-pagelet="LeftRail"], [role="banner"]',
      ),
    );
  },
  showStoriesOverlay: function () {
    if (document.getElementById(this.storiesOverlayId)) return;
    const storiesContainer = document.querySelector('[aria-label="Stories"]');
    if (!storiesContainer) return;
    const storyShelf =
      storiesContainer.querySelector('[scrollable="true"]') ||
      storiesContainer.querySelector(".xb57i2i") ||
      storiesContainer;
    Utils.setInlineStyle(storyShelf, "position", "relative");
    Utils.setInlineStyle(storyShelf, "overflow", "hidden");
    const overlay = document.createElement("div");
    overlay.id = this.storiesOverlayId;
    overlay.className = "ft-stories-overlay";
    if (CONFIG.isDarkMode) overlay.classList.add("dark");
    const icon = Utils.createBadge("ft-stories-overlay-icon");
    const text = document.createElement("span");
    text.textContent = "Stories Hidden";
    overlay.appendChild(icon);
    overlay.appendChild(text);
    storyShelf.appendChild(overlay);
  },
  removeStoriesOverlay: function () {
    const overlay = document.getElementById(this.storiesOverlayId);
    if (overlay) {
      const parent = overlay.parentElement;
      overlay.remove();
      if (parent) Utils.restoreInlineStyles(parent);
    }
  },
  restoreHiddenNavContainers: function () {
    this.hiddenNavContainers.forEach((el) =>
      Utils.restoreInlineStyle(el, "display"),
    );
    this.hiddenNavContainers.clear();
  },
  restoreHiddenPeopleContainers: function () {
    this.hiddenPeopleContainers.forEach((el) =>
      Utils.restoreInlineStyle(el, "display"),
    );
    this.hiddenPeopleContainers.clear();
  },
};
if (Site.isFB()) {
  if (window.__ftSettingsReady) Facebook.init();
  else document.addEventListener("ft-settings-ready", () => Facebook.init());
  Utils.registerLifecycle({
    onDisable: () => Facebook.disable(),
    onEnable: () => {
      if (!Utils.isExtensionEnabled()) return;
      if (!Facebook.initialized) Facebook.init();
      else Facebook.enable();
    },
  });
}
