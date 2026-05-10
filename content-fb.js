const Facebook = {
  initialized: false,
  observer: null,
  currentMode: "strict",
  storiesOverlayId: "ft-fb-stories-overlay",
  hiddenNavContainers: new Set(),
  hiddenShelfContainers: new Set(),
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
        changes.hide_fb_reels_shelves ||
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
        new MutationObserver(() => this.runChecks()),
      );
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
  },
  disable: function () {
    UI.remove();
    this.removeStoriesOverlay();
    this.applyReelsHiding(false);
    this.applyReelsShelfHiding(false);
    this.restoreHiddenNavContainers();
    if (this.observer) this.observer.disconnect();
    this.observer = null;
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
      this.applyReelsShelfHiding(false);
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
      this.applyReelsShelfHiding(false);
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
    const shouldHideReelsShelves =
      isFocusActive &&
      CONFIG.visualHiding.fbReelsShelves &&
      Utils.shouldApplyVisualHiding("fb");
    const onReelsPath = path.startsWith("/reel/") || path.startsWith("/reels/");
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
        this.applyReelsShelfHiding(shouldHideReelsShelves);
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
        this.applyReelsShelfHiding(shouldHideReelsShelves);
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
        this.applyReelsShelfHiding(shouldHideReelsShelves);
      } else {
        action = "allow";
        UI.remove();
        Utils.unlockVideo();
        this.applyReelsHiding(shouldHideReelsNav);
        this.applyReelsShelfHiding(shouldHideReelsShelves);
      }
    } else {
      action = "safe";
      reason = "non-reels path";
      if (CONFIG.session.platform === "fb") Utils.clearSession();
      UI.remove();
      this.applyReelsHiding(shouldHideReelsNav);
      this.applyReelsShelfHiding(shouldHideReelsShelves);
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
  getWarnScope: function (path) {
    if (path.startsWith("/reels/")) return "reels";
    if (path.startsWith("/reel/")) return "reel";
    return path.split("/").filter(Boolean)[0] || "home";
  },
  applyReelsHiding: function (shouldHide) {
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
  applyReelsShelfHiding: function (shouldHide) {
    if (!shouldHide) {
      this.restoreHiddenShelfContainers();
      return;
    }
    const targets = document.querySelectorAll(
      '[role="region"][aria-label="Reels"], [aria-label="Reels and short videos"], h3',
    );
    targets.forEach((target) => {
      const container = this.findReelsShelfContainer(target);
      if (!container) return;
      Utils.setInlineStyle(container, "display", "none", "important");
      this.hiddenShelfContainers.add(container);
    });
  },
  findReelsShelfContainer: function (target) {
    if (/^H[1-4]$/.test(target?.tagName || "")) {
      const headingText = (target.textContent || "").trim();
      if (headingText !== "Reels") return null;
    }
    if (
      !target ||
      target.closest?.(
        '[role="navigation"], [data-pagelet="LeftRail"], [role="banner"]',
      )
    ) {
      return null;
    }
    const exactShelf =
      target.matches?.(
        '[role="region"][aria-label="Reels"], [aria-label="Reels and short videos"]',
      )
        ? target
        : target.closest?.(
            '[role="region"][aria-label="Reels"], [aria-label="Reels and short videos"]',
          );
    let fallback = null;
    let node = exactShelf || target;
    let depth = 0;
    while (node && node !== document.body && depth < 8) {
      if (
        node.matches?.(
          '[role="navigation"], [data-pagelet="LeftRail"], [role="banner"], [role="main"], main',
        )
      ) {
        return null;
      }
      if (this.isReelsShelfCandidate(node)) {
        if (this.hasExactReelsHeading(node)) return node;
        if (!fallback) fallback = node;
      }
      node = node.parentElement;
      depth += 1;
    }
    return fallback;
  },
  isReelsShelfCandidate: function (node) {
    if (!node || typeof node.getBoundingClientRect !== "function") return false;
    if (node.matches?.("body, [role='main'], main")) return false;
    const rect = node.getBoundingClientRect();
    const maxShelfHeight = Math.min(
      720,
      Math.max(window.innerHeight * 0.75, 360),
    );
    const hasExactRegion = Boolean(
      node.matches?.(
        '[role="region"][aria-label="Reels"], [aria-label="Reels and short videos"]',
      ) ||
        node.querySelector?.(
          '[role="region"][aria-label="Reels"], [aria-label="Reels and short videos"]',
        ),
    );
    const reelsLinks = node.querySelectorAll?.(
      'a[href*="/reel/"], a[href*="/reels/"]',
    );
    return (
      rect.width >= 240 &&
      rect.height >= 80 &&
      rect.height <= maxShelfHeight &&
      (hasExactRegion || (reelsLinks && reelsLinks.length >= 2))
    );
  },
  hasExactReelsHeading: function (node) {
    const headings = node?.querySelectorAll?.("h1, h2, h3, h4") || [];
    return [...headings].some((el) => {
      const text = (el.textContent || "").trim();
      return text === "Reels";
    });
  },
  showStoriesOverlay: function () {
    const iconUrl = Utils.getExtensionUrl("icons/icon48.png");
    if (!iconUrl) return;
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
    const icon = document.createElement("img");
    icon.src = iconUrl;
    icon.className = "ft-stories-overlay-icon";
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
  restoreHiddenShelfContainers: function () {
    this.hiddenShelfContainers.forEach((el) =>
      Utils.restoreInlineStyle(el, "display"),
    );
    this.hiddenShelfContainers.clear();
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
