const Instagram = {
  initialized: false,
  observer: null,
  isRedirecting: false,
  currentMode: "strict",
  lastPath: "",
  storiesOverlayId: "ft-ig-stories-overlay",
  hiddenNavContainers: new Set(),
  igSelectors: {
    nav: {
      explore: 'a[href="/explore/"]',
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
        new MutationObserver(() => this.runChecks()),
      );
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
  },
  disable: function () {
    this.isRedirecting = false;
    UI.remove();
    this.removeStoriesOverlay();
    this.applyVisible(
      document.body.querySelectorAll(this.igSelectors.nav.reels),
    );
    this.applyVisible(
      document.body.querySelectorAll(this.igSelectors.nav.explore),
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
      this.removeStoriesOverlay();
      this.applyVisible(
        document.body.querySelectorAll(this.igSelectors.nav.reels),
      );
      this.applyVisible(
        document.body.querySelectorAll(this.igSelectors.nav.explore),
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
            Utils.unlockVideo({ forcePlay: true });
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
      if (sessionStorage.getItem("ft_kicked")) {
        sessionStorage.removeItem("ft_kicked");
        UI.showKickNotification();
      }
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
    sessionStorage.setItem("ft_kicked", "true");
    sessionStorage.setItem("ft_kicked_time", Date.now().toString());
    Utils.logStat();
    window.location.replace("/");
    setTimeout(() => {
      this.isRedirecting = false;
    }, 2000);
  },
  checkKick: function () {
    if (
      sessionStorage.getItem("ft_kicked") &&
      !this.isBlockablePath(window.location.pathname)
    ) {
      sessionStorage.removeItem("ft_kicked");
      UI.showKickNotification();
    }
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
    const reelsLinks = document.body.querySelectorAll(
      this.igSelectors.nav.reels,
    );
    const exploreLinks = document.body.querySelectorAll(
      this.igSelectors.nav.explore,
    );
    this.applyHidden(reelsLinks);
    this.applyHidden(exploreLinks);
    [...reelsLinks, ...exploreLinks].forEach((link) => {
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
    this.applyVisible(
      document.body.querySelectorAll(this.igSelectors.nav.explore),
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
