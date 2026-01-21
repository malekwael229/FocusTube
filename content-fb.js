const Facebook = {
    initialized: false,
    observer: null,
    currentMode: 'strict',
    storiesOverlayId: 'ft-fb-stories-overlay',
    hiddenNavContainers: new Set(),
    init: function () {
        if (this.initialized) return;
        Utils.ensureBody(() => this._start());
    },
    _start: function () {
        if (this.initialized) return;
        if (!Utils.isExtensionEnabled()) return;
        this.initialized = true;
        document.body.classList.add('ft-platform-fb');
        this.ensureObservers();
        window.addEventListener('popstate', () => this.runChecks());
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.platformSettings || changes.focusMode || changes.ft_timer_end || changes.ft_timer_type ||
                changes.hide_fb_stories || changes.hide_fb_reels_nav ||
                changes.popup_visible_fb || changes.restrictHiddenPlatforms || changes.visualHideHiddenPlatforms) {
                this.runChecks();
            }
        });
        document.addEventListener('ft-settings-changed', () => this.runChecks());
        this.runChecks();
    },
    ensureObservers: function () {
        if (!document.body) return;
        if (!this.observer) {
            this.observer = Utils.trackObserver(new MutationObserver(() => this.runChecks()));
            this.observer.observe(document.body, { childList: true, subtree: true });
        }
    },
    disable: function () {
        UI.remove();
        this.removeStoriesOverlay();
        this.applyReelsHiding(false);
        this.restoreHiddenNavContainers();
        if (this.observer) this.observer.disconnect();
        this.observer = null;
    },
    enable: function () {
        if (!document.body) return;
        document.body.classList.add('ft-platform-fb');
        this.ensureObservers();
        this.runChecks();
    },
    runChecks: function () {
        if (!Utils.isExtensionEnabled()) {
            UI.remove();
            this.removeStoriesOverlay();
            this.applyReelsHiding(false);
            this.restoreHiddenNavContainers();
            return;
        }
        if (!document.body) return;
        const path = window.location.pathname;
        const isFocusActive = FocusState.shouldBlock;
        let action = 'none';
        let reason = '';
        if (CONFIG.platformSettings.fb === 'strict' && this.currentMode !== 'strict') {
            Utils.clearSession();
            UI.remove();
            this.removeStoriesOverlay();
        }
        this.currentMode = CONFIG.platformSettings.fb;
        if (FocusState.isBreak) {
            action = 'remove'; reason = 'break timer';
            UI.remove();
            this.removeStoriesOverlay();
            this.applyReelsHiding(false);
            Utils.debugLog('fb', { path, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, sessionAllowed: Utils.isSessionAllowed('fb'), action, reason });
            return;
        }
        const onReelsPath = path.startsWith('/reel/') || path.startsWith('/reels/');
        if (onReelsPath) {
            if (Utils.isSessionAllowed('fb') && CONFIG.platformSettings.fb !== 'strict') {
                action = 'allow'; reason = 'session allowed';
                UI.remove();
                Utils.unlockVideo();
                this.applyReelsHiding(isFocusActive && CONFIG.visualHiding.fbReelsNav && Utils.shouldApplyVisualHiding('fb'));
            } else if (FocusState.isWork || CONFIG.platformSettings.fb === 'strict') {
                action = 'block'; reason = FocusState.isWork ? 'work timer' : 'strict mode';
                UI.create('strict', 'fb', () => { }, () => {
                    window.location.href = 'https://www.facebook.com/';
                });
                Utils.lockVideo();
                this.applyReelsHiding(isFocusActive && CONFIG.visualHiding.fbReelsNav && Utils.shouldApplyVisualHiding('fb'));
            } else if (CONFIG.platformSettings.fb === 'warn') {
                action = 'warn'; reason = 'warn mode';
                UI.create('warn', 'fb', () => {
                    Utils.setAllowWindow('fb', 5);
                    UI.remove();
                    Utils.unlockVideo();
                }, () => {
                    window.location.href = 'https://www.facebook.com/';
                });
                Utils.lockVideo();
                this.applyReelsHiding(isFocusActive && CONFIG.visualHiding.fbReelsNav && Utils.shouldApplyVisualHiding('fb'));
            } else {
                action = 'allow';
                UI.remove();
                Utils.unlockVideo();
                this.applyReelsHiding(isFocusActive && CONFIG.visualHiding.fbReelsNav && Utils.shouldApplyVisualHiding('fb'));
            }
        } else {
            action = 'safe'; reason = 'non-reels path';
            if (CONFIG.session.platform === 'fb') Utils.clearSession();
            UI.remove();
            this.applyReelsHiding(isFocusActive && CONFIG.visualHiding.fbReelsNav && Utils.shouldApplyVisualHiding('fb'));
            const isHomepage = path === '/' || path === '';
            const shouldHideStories = isHomepage && isFocusActive && CONFIG.visualHiding.fbStories && Utils.shouldApplyVisualHiding('fb');
            if (shouldHideStories) {
                this.showStoriesOverlay();
            } else {
                this.removeStoriesOverlay();
            }
        }
        Utils.debugLog('fb', { path, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, sessionAllowed: Utils.isSessionAllowed('fb'), action, reason });
    },
    applyReelsHiding: function (shouldHide) {
        if (!shouldHide) {
            this.restoreHiddenNavContainers();
        }
        const selectors = [
            '[role="navigation"] a[aria-label="Reels"]',
            '[role="navigation"] a[href*="/reels/"]',
            '[role="navigation"] a[href*="/reel/"]',
            '[data-pagelet="LeftRail"] a[aria-label="Reels"]',
            '[data-pagelet="LeftRail"] a[href*="/reels/"]',
            '[data-pagelet="LeftRail"] a[href*="/reel/"]'
        ];
        const fbReelsLink = document.querySelector('a[aria-label="Reels"][href="/reel/?s=tab"]');
        if (fbReelsLink) {
            const container = fbReelsLink.closest('li');
            if (container) {
                if (shouldHide) Utils.setInlineStyle(container, 'display', 'none', 'important');
                else Utils.restoreInlineStyle(container, 'display');
            }
        }
        selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (shouldHide) Utils.setInlineStyle(el, 'display', 'none', 'important');
                else Utils.restoreInlineStyle(el, 'display');
            });
        });
        if (shouldHide) {
            const navTargets = document.querySelectorAll(
                '[role="navigation"] a[href*="/reel/"], [role="navigation"] a[href*="/reels/"], [role="navigation"] a[aria-label*="Reel"],' +
                '[data-pagelet="LeftRail"] a[href*="/reel/"], [data-pagelet="LeftRail"] a[href*="/reels/"], [data-pagelet="LeftRail"] a[aria-label*="Reel"],' +
                '[role="navigation"] [aria-label="Reels"], [data-pagelet="LeftRail"] [aria-label="Reels"]'
            );
            navTargets.forEach((el) => {
                const navRoot = el.closest('[role="navigation"], [data-pagelet="LeftRail"]');
                if (!navRoot) return;
                const container = el.closest('li, div');
                if (container) {
                    Utils.setInlineStyle(container, 'display', 'none', 'important');
                    this.hiddenNavContainers.add(container);
                }
            });
        }
    },
    showStoriesOverlay: function () {
        if (document.getElementById(this.storiesOverlayId)) return;
        const storiesContainer = document.querySelector('[aria-label="Stories"]');
        if (!storiesContainer) return;
        const storyShelf = storiesContainer.querySelector('[scrollable="true"]') ||
            storiesContainer.querySelector('.xb57i2i') ||
            storiesContainer;
        Utils.setInlineStyle(storyShelf, 'position', 'relative');
        Utils.setInlineStyle(storyShelf, 'overflow', 'hidden');
        const overlay = document.createElement('div');
        overlay.id = this.storiesOverlayId;
        overlay.className = 'ft-stories-overlay';
        if (CONFIG.isDarkMode) overlay.classList.add('dark');
        const icon = document.createElement('img');
        icon.src = chrome.runtime.getURL('icons/icon48.png');
        icon.className = 'ft-stories-overlay-icon';
        const text = document.createElement('span');
        text.textContent = 'Stories Hidden';
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
        this.hiddenNavContainers.forEach((el) => Utils.restoreInlineStyle(el, 'display'));
        this.hiddenNavContainers.clear();
    }
};
if (Site.isFB()) {
    if (window.__ftSettingsReady) Facebook.init();
    else document.addEventListener('ft-settings-ready', () => Facebook.init());
    Utils.registerLifecycle({
        onDisable: () => Facebook.disable(),
        onEnable: () => {
            if (!Utils.isExtensionEnabled()) return;
            if (!Facebook.initialized) Facebook.init();
            else Facebook.enable();
        }
    });
}
