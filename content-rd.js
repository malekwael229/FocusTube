/* Current Reddit feed controls. Unknown routes and markup are left alone. */
const Reddit = {
  sorts: new Set(["hot", "new", "top", "rising", "controversial"]),
  homeSorts: new Set(["best", "hot", "new", "top", "rising", "controversial"]),
  feed: null,
  notice: null,
  savedAttributes: null,
  shadowObservers: new Map(),
  shadowMedia: new Set(),
  transientFeeds: new Set(),
  route: null,
  revealedScope: null,
  observer: null,
  checkTimer: null,
  checkPending: false,
  initialized: false,
  currentMode: null,
  lastShouldHide: false,
  pendingFeedTransition: false,
  transitionStartedAt: 0,

  onFeedPlay(event) {
    if (event.target instanceof HTMLMediaElement && this.feed && this.notice) {
      try { event.target.pause(); } catch (error) { Utils.reportError("pausing Reddit feed media", error); }
    }
  },

  classifyRoute(pathname = location.pathname) {
    const parts = String(pathname).split("/").filter(Boolean);
    if (parts.length === 0) return { scope: "home", path: "/" };
    const lower = parts.map((part) => part.toLowerCase());
    if (parts.length === 1 && this.homeSorts.has(lower[0])) {
      return { scope: "home", path: `/${lower[0]}` };
    }
    if (parts.length === 1 && lower[0] === "news") {
      return { scope: "news", path: "/news" };
    }
    if (lower[0] !== "r" || parts.length < 2 || parts.length > 3) return null;
    if (!/^[A-Za-z0-9_]+$/.test(parts[1])) return null;
    if (parts.length === 3 && !this.sorts.has(lower[2])) return null;
    return {
      scope: `r/${lower[1]}`,
      path: `/r/${lower[1]}${parts.length === 3 ? `/${lower[2]}` : ""}`,
    };
  },

  effectiveMode() {
    return FocusState.isWork ? "strict" : CONFIG.platformSettings.rd || "strict";
  },

  shouldHide(route) {
    return Boolean(
      route && Utils.isExtensionEnabled() && FocusState.shouldBlock &&
      !FocusState.isBreak &&
      Utils.shouldApplyVisualHiding("rd") &&
      this.effectiveMode() !== "allow" &&
      (this.effectiveMode() !== "warn" || this.revealedScope !== route.scope),
    );
  },

  findFeed() {
    const feeds = document.querySelectorAll("shreddit-feed");
    return feeds.length === 1 ? feeds[0] : null;
  },

  restore() {
    for (const observer of this.shadowObservers.values()) observer.disconnect();
    this.shadowObservers.clear();
    for (const media of this.shadowMedia) media.removeEventListener("play", this.onFeedPlayBound, true);
    this.shadowMedia.clear();
    for (const feed of this.transientFeeds) feed.removeEventListener("play", this.onFeedPlayBound, true);
    this.transientFeeds.clear();
    if (this.feed) {
      this.feed.removeEventListener("play", this.onFeedPlayBound, true);
      Utils.restoreInlineStyle(this.feed, "display");
      for (const name of ["inert", "aria-hidden"]) {
        const prior = this.savedAttributes?.[name];
        if (prior === null || prior === undefined) this.feed.removeAttribute(name);
        else this.feed.setAttribute(name, prior);
      }
    }
    this.notice?.remove();
    this.feed = null;
    this.notice = null;
    this.savedAttributes = null;
    this.pendingFeedTransition = false;
    this.transitionStartedAt = 0;
    document.documentElement.classList.remove("ft-reddit-feed-transition");
  },

  hide(feed, route) {
    if (!feed.parentElement) return;
    this.savedAttributes = {
      inert: feed.getAttribute("inert"),
      "aria-hidden": feed.getAttribute("aria-hidden"),
    };
    this.feed = feed;
    if (!this.onFeedPlayBound) this.onFeedPlayBound = (event) => this.onFeedPlay(event);
    feed.addEventListener("play", this.onFeedPlayBound, true);
    Utils.setInlineStyle(feed, "display", "none", "important");
    feed.setAttribute("inert", "");
    feed.setAttribute("aria-hidden", "true");
    this.pauseMedia(feed);

    this.addNotice(feed, route);
  },

  addNotice(feed, route) {
    this.notice?.remove();
    const notice = document.createElement("div");
    notice.className = "ft-reddit-feed-notice";
    notice.setAttribute("role", "status");
    localizeOwnedRoot(notice);
    const label = document.createElement("span");
    label.textContent = ftMessage("redditFeedHidden");
    notice.appendChild(label);
    if (this.effectiveMode() === "warn") {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = ftMessage("viewAnyway");
      button.addEventListener("click", () => {
        if (this.route?.scope !== route.scope || FocusState.isWork) return;
        this.revealedScope = route.scope;
        this.restore();
      });
      notice.appendChild(button);
    }
    feed.parentElement.insertBefore(notice, feed);
    this.notice = notice;
    Utils.logStat(`reddit-feed:${route.path}`);
  },

  pauseMedia(feed, extraFeeds = []) {
    const feeds = [feed, ...extraFeeds].filter(Boolean);
    for (const prior of this.transientFeeds) {
      if (extraFeeds.includes(prior)) continue;
      prior.removeEventListener("play", this.onFeedPlayBound, true);
      this.transientFeeds.delete(prior);
    }
    for (const extra of extraFeeds) {
      if (this.transientFeeds.has(extra)) continue;
      extra.addEventListener("play", this.onFeedPlayBound, true);
      this.transientFeeds.add(extra);
    }
    for (const [shadow, observer] of this.shadowObservers) {
      if (feeds.some((candidate) => candidate.contains(shadow.host))) continue;
      observer.disconnect();
      this.shadowObservers.delete(shadow);
    }
    for (const media of this.shadowMedia) {
      const host = media.getRootNode().host;
      if (media.isConnected && host && feeds.some((candidate) => candidate.contains(host))) continue;
      media.removeEventListener("play", this.onFeedPlayBound, true);
      this.shadowMedia.delete(media);
    }
    const mediaElements = feeds.flatMap((candidate) => [...candidate.querySelectorAll("video, audio")]);
    for (const player of feeds.flatMap((candidate) => [...candidate.querySelectorAll("shreddit-player, shreddit-embed")])) {
      const shadow = player.shadowRoot;
      if (!shadow) continue;
      if (!this.shadowObservers.has(shadow)) {
        const observer = new MutationObserver(() => {
          if (this.notice?.isConnected && (this.feed === feed || this.transientFeeds.has(feed))) {
            this.pauseMedia(this.feed, [...this.transientFeeds]);
          }
        });
        observer.observe(shadow, { childList: true, subtree: true });
        this.shadowObservers.set(shadow, observer);
      }
      for (const media of shadow.querySelectorAll("video, audio")) {
        if (!this.shadowMedia.has(media)) {
          media.addEventListener("play", this.onFeedPlayBound, true);
          this.shadowMedia.add(media);
        }
        mediaElements.push(media);
      }
    }
    mediaElements.forEach((media) => {
      if (media.paused) return;
      try { media.pause(); } catch (error) { Utils.reportError("pausing Reddit feed media", error); }
    });
  },

  isFeedHidden() {
    return Boolean(
      this.feed && this.feed.style.getPropertyValue("display") === "none" &&
      this.feed.style.getPropertyPriority("display") === "important" &&
      this.feed.hasAttribute("inert") && this.feed.getAttribute("aria-hidden") === "true",
    );
  },

  apply() {
    const route = this.classifyRoute();
    const mode = this.effectiveMode();
    const routeChanged = route?.path !== this.route?.path;
    if (routeChanged && this.feed) this.transitionStartedAt = Date.now();
    if (mode !== this.currentMode) {
      this.revealedScope = null;
      this.currentMode = mode;
    }
    if (routeChanged) this.revealedScope = null;
    this.route = route;
    this.lastShouldHide = this.shouldHide(route);
    if (routeChanged && this.lastShouldHide && this.feed) {
      this.pendingFeedTransition = true;
      document.documentElement.classList.add("ft-reddit-feed-transition");
    }
    if (!this.lastShouldHide) {
      document.documentElement.classList.remove("ft-reddit-feed-transition");
      if (
        !route && this.feed?.isConnected && this.findFeed() === this.feed &&
        Utils.isExtensionEnabled() && FocusState.shouldBlock &&
        !FocusState.isBreak && Utils.shouldApplyVisualHiding("rd") &&
        mode !== "allow" && Date.now() - this.transitionStartedAt < 3000
      ) {
        this.pauseMedia(this.feed);
        return;
      }
      this.restore();
      return;
    }
    const feed = this.findFeed();
    if (!feed) {
      if (this.pendingFeedTransition && document.querySelectorAll("shreddit-feed").length > 0) {
        this.pauseMedia(this.feed, [...document.querySelectorAll("shreddit-feed")].filter((candidate) => candidate !== this.feed));
        return;
      }
      this.restore();
      return;
    }
    if (feed === this.feed && this.notice?.isConnected) {
      if (routeChanged || Boolean(this.notice.querySelector("button")) !== (mode === "warn")) {
        this.addNotice(feed, route);
      }
      if (!this.isFeedHidden()) {
        Utils.setInlineStyle(feed, "display", "none", "important");
        feed.setAttribute("inert", "");
        feed.setAttribute("aria-hidden", "true");
      }
      this.pauseMedia(feed);
      return;
    }
    this.pendingFeedTransition = false;
    this.restore();
    this.hide(feed, route);
  },

  scheduleCheck() {
    if (this.checkPending) return;
    this.checkPending = true;
    requestAnimationFrame(() => {
      this.checkPending = false;
      if (this.initialized) this.apply();
    });
  },

  start() {
    if (!Utils.isExtensionEnabled()) return;
    this.initialized = true;
    this.apply();
    if (!this.observer) {
      this.observer = Utils.trackObserver(new MutationObserver(() => this.scheduleCheck()));
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
    if (!this.checkTimer) {
      this.checkTimer = setInterval(() => {
        if (!Utils.isRuntimeAlive()) return this.stop();
        const route = this.classifyRoute();
        if (
          route?.path !== this.route?.path ||
          (this.feed && !this.feed.isConnected) ||
          (this.feed && !this.isFeedHidden()) ||
          this.effectiveMode() !== this.currentMode ||
          this.shouldHide(route) !== this.lastShouldHide ||
          (this.feed && !route && this.transitionStartedAt && Date.now() - this.transitionStartedAt >= 3000) ||
          (this.pendingFeedTransition && !this.findFeed())
        ) this.apply();
        else if (this.feed) this.pauseMedia(this.feed);
      }, 250);
    }
  },

  stop() {
    this.initialized = false;
    this.observer?.disconnect();
    if (this.observer) Utils.untrackObserver(this.observer);
    this.observer = null;
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.checkTimer = null;
    this.restore();
    this.route = null;
    this.revealedScope = null;
    this.currentMode = null;
    this.lastShouldHide = false;
    this.pendingFeedTransition = false;
  },
};

if (Site.isRD()) {
  Utils.registerLifecycle({
    onDisable: () => Reddit.stop(),
    onEnable: () => Utils.ensureBody(() => Reddit.start()),
  });
  document.addEventListener("ft-settings-changed", () => Reddit.apply());
  window.addEventListener("popstate", () => Reddit.apply());
  if (window.__ftSettingsReady) Utils.ensureBody(() => Reddit.start());
  else document.addEventListener("ft-settings-ready", () => Utils.ensureBody(() => Reddit.start()), { once: true });
}
