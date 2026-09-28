const YouTube = {
  isRedirecting: false,
  initialized: false,
  observer: null,
  inlineHidingFrame: null,
  lastUrl: "",
  lastBlockState: null,
  currentMode: "strict",
  isActive: false,
  hiddenNavElements: new Set(),
  hiddenFocusElements: new Set(),
  hiddenMostRelevantElements: new Set(),
  hiddenPlayablesElements: new Set(),
  init: function () {
    if (this.initialized) return;
    Utils.ensureBody(() => this._start());
  },
  _start: function () {
    if (this.initialized) return;
    if (!Utils.isExtensionEnabled()) return;
    this.initialized = true;
    this.isActive = true;
    document.body.classList.add("ft-platform-yt");
    this.isRedirecting = false;
    document.addEventListener("yt-navigate-finish", () => {
      this.isRedirecting = false;
      this.runChecks();
    });
    window.addEventListener("popstate", () => this.runChecks());
    this.ensureObservers();
    chrome.storage.onChanged.addListener((changes) => {
      if (
        changes.platformSettings ||
        changes.focusMode ||
        changes.ft_timer_end ||
        changes.ft_timer_type ||
        changes.visualHideHiddenPlatforms ||
        changes.restrictHiddenPlatforms ||
        changes.popup_visible_yt ||
        changes.popup_visible_ig ||
        changes.popup_visible_tt ||
        changes.popup_visible_fb
      ) {
        this.runChecks();
      }
      if (
        changes.hide_yt_shorts_nav ||
        changes.hide_yt_shorts_shelves ||
        changes.hide_yt_most_relevant_shelf ||
        changes.hide_yt_playables
      ) {
        if (changes.hide_yt_shorts_nav) {
          CONFIG.visualHiding.ytShortsNav =
            changes.hide_yt_shorts_nav.newValue !== false;
        }
        if (changes.hide_yt_shorts_shelves) {
          CONFIG.visualHiding.ytShortsShelves =
            changes.hide_yt_shorts_shelves.newValue !== false;
        }
        if (changes.hide_yt_most_relevant_shelf) {
          CONFIG.visualHiding.ytMostRelevantShelf =
            changes.hide_yt_most_relevant_shelf.newValue !== false;
        }
        if (changes.hide_yt_playables) {
          CONFIG.visualHiding.ytPlayables =
            changes.hide_yt_playables.newValue !== false;
        }
        this.applyInlineHiding();
      }
    });
    document.addEventListener("ft-settings-changed", () => {
      this.lastUrl = "";
      this.lastBlockState = null;
      this.runChecks();
    });
    this.runChecks();
    setTimeout(() => this.checkKick(), 500);
  },
  ensureObservers: function () {
    if (!document.body) return;
    if (!this.observer) {
      this.observer = Utils.trackObserver(
        new MutationObserver((mutations) => {
          if (mutations.some((mutation) =>
            mutation.type !== "characterData" ||
            mutation.target.parentElement?.closest("ytd-rich-shelf-renderer")
          )) {
            this.scheduleInlineHiding();
          }
        }),
      );
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["href", "title"],
      });
    }
  },
  disable: function () {
    this.isActive = false;
    this.isRedirecting = false;
    UI.remove();
    this.removeVisualFocus();
    this.clearInlineHiding();
    this.setLogoFix(false);
    if (this.observer) this.observer.disconnect();
    this.observer = null;
  },
  enable: function () {
    if (!document.body) return;
    this.isActive = true;
    document.body.classList.add("ft-platform-yt");
    this.ensureObservers();
    this.runChecks();
    this.checkKick();
  },
  runChecks: function () {
    if (!Utils.isExtensionEnabled()) {
      this.removeVisualFocus();
      UI.remove();
      this.clearInlineHiding();
      this.setLogoFix(false);
      return;
    }
    if (this.isRedirecting || !document.body) return;
    const currentUrl = window.location.href;
    const shouldBlock = FocusState.shouldBlock;
    if (
      currentUrl === this.lastUrl &&
      !this.isDistractingRoute(window.location.pathname) &&
      this.lastBlockState === shouldBlock
    )
      return;
    this.lastUrl = currentUrl;
    this.lastBlockState = shouldBlock;
    if (window.location.pathname.replace(/\/+$/, "") === "/feed/history") {
      this.clearSession();
      this.removeVisualFocus();
      UI.remove();
      return;
    }
    this.checkActiveBlocking(currentUrl);
    if (shouldBlock) this.applyFocusMode();
    else this.removeVisualFocus();
    this.applyInlineHiding();
    this.updateLogoFix();
  },
  getDistractionScope: function (pathname) {
    if (pathname.startsWith("/shorts/")) return "shorts";
    if (/^\/playables(?:\/|$)/.test(pathname)) return "playables";
    return null;
  },
  isDistractingRoute: function (pathname) {
    return Boolean(this.getDistractionScope(pathname));
  },
  checkActiveBlocking: function (url) {
    if (!Utils.isExtensionEnabled()) {
      UI.remove();
      return;
    }
    if (
      CONFIG.platformSettings.yt === "strict" &&
      this.currentMode !== "strict"
    ) {
      this.clearSession();
    }
    this.currentMode = CONFIG.platformSettings.yt;
    let action = "none";
    let reason = "";
    const scope = this.getDistractionScope(new URL(url).pathname);
    if (scope) {
      if (FocusState.isBreak) {
        action = "remove";
        reason = "break timer";
        UI.remove();
        Utils.unlockVideo();
      } else if (FocusState.isWork) {
        action = "block";
        reason = "work timer";
        this.handleRouteBlocking(true, scope);
      } else if (
        CONFIG.platformSettings.yt === "S" ||
        CONFIG.platformSettings.yt === "strict"
      ) {
        action = "strict";
        reason = "strict mode";
        this.handleRouteBlocking(true, scope);
      } else if (
        CONFIG.platformSettings.yt === "W" ||
        CONFIG.platformSettings.yt === "warn"
      ) {
        action = "warn";
        reason = "warn mode";
        this.handleRouteBlocking(false, scope);
      } else {
        action = "allow";
        reason = "allow/passive mode";
        UI.remove();
        Utils.unlockVideo();
      }
    } else {
      action = "remove";
      reason = "safe page";
      this.clearSession();
      UI.remove();
      this.checkKick();
    }
    Utils.debugLog("yt", {
      url,
      mode: this.currentMode,
      isWork: FocusState.isWork,
      isBreak: FocusState.isBreak,
      sessionAllowed: this.isSessionAllowed(scope),
      action,
      reason,
    });
  },
  handleRouteBlocking: function (isForced, scope) {
    if (!Utils.isExtensionEnabled()) return;
    if (!isForced && this.isSessionAllowed(scope)) return;
    const mode = isForced ? "strict" : CONFIG.platformSettings.yt;
    if (mode === "strict") {
      this.isRedirecting = true;
      Utils.logStat();
      Utils.markKick("yt", () => {
        this.navigateHome();
        setTimeout(() => {
          this.isRedirecting = false;
          this.checkKick();
          this.runChecks();
        }, 1000);
      });
    } else if (mode === "warn" || mode === "W") {
      UI.create(
        "warn",
        "yt",
        () => {
          this.runChecks();
        },
        () => this.navigateHome(),
        { scope },
      );
      Utils.lockVideo();
    }
  },
  navigateHome: function () {
    const homeLink = document.querySelector(
      'a[href="/"], a[title="Home"], ytd-guide-entry-renderer a[href="/"]',
    );
    if (homeLink && typeof homeLink.click === "function") {
      homeLink.click();
      return;
    }
    window.location.replace(new URL("/", window.location.origin).href);
  },
  isSessionAllowed: function (scope) {
    return (
      CONFIG.session.allowUntil &&
      CONFIG.session.allowUntil > Date.now() &&
      CONFIG.session.platform === "yt" &&
      CONFIG.session.scope === scope
    );
  },
  clearSession: function () {
    CONFIG.session.allowUntil = 0;
    CONFIG.session.platform = null;
    CONFIG.session.scope = null;
  },
  applyFocusMode: function () {
    if (!Utils.shouldApplyVisualHiding("yt")) {
      this.removeVisualFocus();
      return;
    }
    if (document.body) document.body.classList.add("focus-mode-active");
  },
  removeVisualFocus: function () {
    if (document.body) document.body.classList.remove("focus-mode-active");
  },
  hideElement: function (el, targetSet) {
    if (!el) return;
    const set = targetSet || this.hiddenFocusElements;
    if (set.has(el)) return;
    Utils.setInlineStyle(el, "display", "none", "important");
    set.add(el);
  },
  hiddenElementSets: function () {
    return [
      this.hiddenNavElements,
      this.hiddenFocusElements,
      this.hiddenMostRelevantElements,
      this.hiddenPlayablesElements,
    ];
  },
  releaseHiddenElement: function (el, set) {
    if (!set.delete(el)) return;
    if (!this.hiddenElementSets().some((other) => other.has(el))) {
      Utils.restoreInlineStyle(el, "display");
    }
  },
  restoreHidden: function (targetSet) {
    const set = targetSet || this.hiddenFocusElements;
    set.forEach((el) => this.releaseHiddenElement(el, set));
  },
  reconcileHidden: function (set, matches) {
    set.forEach((el) => {
      if (!matches.has(el)) this.releaseHiddenElement(el, set);
    });
    matches.forEach((el) => this.hideElement(el, set));
  },
  clearInlineHiding: function () {
    this.restoreHidden(this.hiddenNavElements);
    this.restoreHidden(this.hiddenFocusElements);
    this.restoreHidden(this.hiddenMostRelevantElements);
    this.restoreHidden(this.hiddenPlayablesElements);
  },
  scheduleInlineHiding: function () {
    if (this.inlineHidingFrame || !this.isActive) return;
    const run = () => {
      this.inlineHidingFrame = null;
      if (this.isActive) this.applyInlineHiding();
    };
    if (typeof requestAnimationFrame === "function") {
      this.inlineHidingFrame = requestAnimationFrame(run);
    } else {
      this.inlineHidingFrame = setTimeout(run, 50);
    }
  },
  applyInlineHiding: function () {
    this.hiddenElementSets().forEach((set) => {
      set.forEach((el) => {
        if (!el.isConnected) this.releaseHiddenElement(el, set);
      });
    });
    const shouldHide =
      FocusState.shouldBlock && Utils.shouldApplyVisualHiding("yt");
    if (!shouldHide) {
      this.clearInlineHiding();
      return;
    }
    if (!CONFIG.visualHiding.ytShortsNav) {
      this.restoreHidden(this.hiddenNavElements);
    } else {
      const matches = new Set();
      const navSelectors = [
        'a[title="Shorts"]',
        'a[href="/shorts"]',
        'a[href^="/shorts"]',
        'ytd-guide-entry-renderer a[title="Shorts"]',
        'ytd-mini-guide-entry-renderer a[title="Shorts"]',
      ];
      const navLinks = document.querySelectorAll(navSelectors.join(", "));
      navLinks.forEach((link) => {
        const entry = link.closest(
          "ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer",
        );
        if (entry) matches.add(entry);
      });
      this.reconcileHidden(this.hiddenNavElements, matches);
    }
    if (!CONFIG.visualHiding.ytShortsShelves) {
      this.restoreHidden(this.hiddenFocusElements);
    } else {
      const matches = new Set();
      document
        .querySelectorAll(
          'ytd-rich-shelf-renderer[is-shorts], ytd-rich-shelf-renderer[is-shorts=""]',
        )
        .forEach((shelf) => {
          const section = shelf.closest("ytd-rich-section-renderer");
          matches.add(section || shelf);
        });
      document.querySelectorAll('a[href^="/shorts"]').forEach((link) => {
        const richItem = link.closest("ytd-rich-item-renderer");
        if (richItem) matches.add(richItem);
      });
      document
        .querySelectorAll(
          'yt-chip-cloud-chip-renderer a[href="/shorts"], yt-chip-cloud-chip-renderer a[href^="/shorts"]',
        )
        .forEach((link) => {
          const chip = link.closest("yt-chip-cloud-chip-renderer");
          if (chip) matches.add(chip);
        });
      document
        .querySelectorAll(
          'yt-tab-shape a[href="/shorts"], yt-tab-shape a[href^="/shorts"]',
        )
        .forEach((link) => {
          const tab = link.closest("yt-tab-shape");
          if (tab) matches.add(tab);
        });
      this.reconcileHidden(this.hiddenFocusElements, matches);
    }
    this.applyMostRelevantShelfHiding();
    this.applyPlayablesHiding();
  },
  isSubscriptionsFeed: function () {
    const path = window.location.pathname.replace(/\/+$/, "");
    return path === "/feed/subscriptions";
  },
  getShelfHeadingText: function (shelf) {
    const headingSelectors = [
      "#title",
      "h2",
      "h3",
      "yt-formatted-string#title",
      '[role="heading"]',
    ];
    for (const selector of headingSelectors) {
      const heading = shelf.querySelector(selector);
      const text = heading?.textContent?.trim();
      if (text) return text;
    }
    return "";
  },
  getPlayablesShelfHeadingText: function (shelf) {
    const header = shelf.querySelector(
      ":scope > #rich-shelf-header, :scope > #header, :scope > #title-container",
    );
    const heading = header?.querySelector('#title, h2, h3, [role="heading"]') ||
      shelf.querySelector(':scope > #title, :scope > h2, :scope > h3, :scope > [role="heading"]');
    return heading?.textContent?.trim() || "";
  },
  hasPlayablesHeadingLink: function (container) {
    const links = 'a[href="/playables"], a[href="/playables/"]';
    const header = container.querySelector(
      ':scope > #rich-shelf-header, :scope > #header, :scope > #title-container, ' +
      ':scope > #title, :scope > h2, :scope > h3, :scope > [role="heading"]',
    );
    const directLink = container.querySelector(
      ':scope > a[href="/playables"], :scope > a[href="/playables/"]',
    );
    return Boolean(
      header?.querySelector(links) ||
      (directLink && !header)
    );
  },
  isEnglishMostRelevantShelf: function (shelf) {
    return this.getShelfHeadingText(shelf).toLowerCase() === "most relevant";
  },
  applyMostRelevantShelfHiding: function () {
    if (
      !CONFIG.visualHiding.ytMostRelevantShelf ||
      !this.isSubscriptionsFeed()
    ) {
      this.restoreHidden(this.hiddenMostRelevantElements);
      return;
    }
    const matches = new Set();
    document
      .querySelectorAll("ytd-rich-section-renderer, ytd-reel-shelf-renderer")
      .forEach((shelf) => {
        if (this.isEnglishMostRelevantShelf(shelf)) {
          matches.add(shelf);
        }
      });
    this.reconcileHidden(this.hiddenMostRelevantElements, matches);
  },
  applyPlayablesHiding: function () {
    if (!CONFIG.visualHiding.ytPlayables) {
      this.restoreHidden(this.hiddenPlayablesElements);
      return;
    }

    const matches = new Set();
    document
      .querySelectorAll(
        'ytd-guide-entry-renderer a[href="/playables"], ' +
        'ytd-guide-entry-renderer a[href="/playables/"], ' +
        'ytd-mini-guide-entry-renderer a[href="/playables"], ' +
        'ytd-mini-guide-entry-renderer a[href="/playables/"]',
      )
      .forEach((link) => {
        const entry = link.closest(
          "ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer",
        );
        if (entry) matches.add(entry);
      });

    document.querySelectorAll("ytd-rich-shelf-renderer").forEach((shelf) => {
      const heading = this.getPlayablesShelfHeadingText(shelf).toLowerCase();
      const isPlayables = heading === "playables" ||
        heading === "youtube playables" ||
        this.hasPlayablesHeadingLink(shelf);
      if (!isPlayables) return;
      const section = shelf.closest("ytd-rich-section-renderer");
      matches.add(section || shelf);
    });
    document.querySelectorAll("ytd-rich-section-renderer").forEach((section) => {
      if (section.querySelector(
        'ytd-rich-item-renderer[is-mini-game-card-shelf]',
      ) || this.hasPlayablesHeadingLink(section)) {
        matches.add(section);
      }
    });
    this.reconcileHidden(this.hiddenPlayablesElements, matches);
  },
  setLogoFix: function (isEnabled) {
    if (!document.body) return;
    document.body.classList.toggle("ft-yt-logo-fix", Boolean(isEnabled));
  },
  updateLogoFix: function () {
    if (!document.body) return;
    const logoIcon = document.querySelector("ytd-masthead #logo-icon");
    const logoWrapper = document.querySelector(
      "ytd-masthead #logo, ytd-masthead ytd-topbar-logo-renderer",
    );
    if (!logoIcon && !logoWrapper) {
      this.setLogoFix(false);
      return;
    }
    const target = logoIcon || logoWrapper;
    const style = window.getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    const color = style.color;
    const isHidden =
      style.display === "none" ||
      style.visibility === "hidden" ||
      parseFloat(style.opacity || "1") === 0 ||
      rect.width === 0 ||
      rect.height === 0 ||
      color === "transparent" ||
      color === "rgba(0, 0, 0, 0)";
    this.setLogoFix(isHidden);
  },
  checkKick: function () {
    if (this.isDistractingRoute(window.location.pathname)) return;
    Utils.consumeKick("yt", () => UI.showKickNotification());
  },
};
if (Site.isYT()) {
  if (window.__ftSettingsReady) YouTube.init();
  else document.addEventListener("ft-settings-ready", () => YouTube.init());
  Utils.registerLifecycle({
    onDisable: () => YouTube.disable(),
    onEnable: () => {
      if (!Utils.isExtensionEnabled()) return;
      if (!YouTube.initialized) YouTube.init();
      else YouTube.enable();
    },
  });
}
