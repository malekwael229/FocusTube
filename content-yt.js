const YouTube = {
    isRedirecting: false,
    _scheduledHiding: null,
    initialized: false,
    observer: null,
    lastUrl: '',
    lastBlockState: null,
    currentMode: 'strict',
    isActive: false,
    hiddenNavElements: new Set(),
    hiddenFocusElements: new Set(),
    init: function () {
        if (this.initialized) return;
        Utils.ensureBody(() => this._start());
    },
    _start: function () {
        if (this.initialized) return;
        if (!Utils.isExtensionEnabled()) return;
        this.initialized = true;
        this.isActive = true;
        document.body.classList.add('ft-platform-yt');
        this.isRedirecting = false;
        document.addEventListener('yt-navigate-finish', () => {
            this.isRedirecting = false;
            this.runChecks();
        });
        window.addEventListener('popstate', () => this.runChecks());
        this.ensureObservers();
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.platformSettings || changes.focusMode || changes.ft_timer_end || changes.ft_timer_type ||
                changes.visualHideHiddenPlatforms || changes.restrictHiddenPlatforms ||
                changes.popup_visible_yt || changes.popup_visible_ig || changes.popup_visible_tt || changes.popup_visible_fb) {
                this.runChecks();
            }
            if (changes.hide_yt_shorts_nav || changes.hide_yt_shorts_shelves) {
                if (changes.hide_yt_shorts_nav) {
                    CONFIG.visualHiding.ytShortsNav = changes.hide_yt_shorts_nav.newValue !== false;
                }
                if (changes.hide_yt_shorts_shelves) {
                    CONFIG.visualHiding.ytShortsShelves = changes.hide_yt_shorts_shelves.newValue !== false;
                }
                this.applyInlineHiding();
            }
        });
        document.addEventListener('ft-settings-changed', () => {
            this.lastUrl = '';
            this.lastBlockState = null;
            this.runChecks();
        });
        this.runChecks();
        setTimeout(() => this.checkKick(), 500);
    },
    ensureObservers: function () {
        if (!document.body) return;
        if (!this.observer) {
            this.observer = Utils.trackObserver(new MutationObserver(() => this.runChecks()));
            this.observer.observe(document.body, { childList: true, subtree: true, attributes: false });
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
        document.body.classList.add('ft-platform-yt');
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
        if (currentUrl === this.lastUrl && !currentUrl.includes('/shorts/') && this.lastBlockState === shouldBlock) return;
        this.lastUrl = currentUrl;
        this.lastBlockState = shouldBlock;
        if (currentUrl.includes('/feed/history')) {
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
    checkActiveBlocking: function (url) {
        if (!Utils.isExtensionEnabled()) {
            UI.remove();
            return;
        }
        if (CONFIG.platformSettings.yt === 'strict' && this.currentMode !== 'strict') {
            this.clearSession();
        }
        this.currentMode = CONFIG.platformSettings.yt;
        let action = 'none';
        let reason = '';
        if (url.includes('/shorts/')) {
            if (FocusState.isBreak) { action = 'remove'; reason = 'break timer'; UI.remove(); Utils.unlockVideo(); }
            else if (FocusState.isWork) { action = 'block'; reason = 'work timer'; this.handleShortsBlocking(url, true); }
            else if (CONFIG.platformSettings.yt === 'S' || CONFIG.platformSettings.yt === 'strict') { action = 'strict'; reason = 'strict mode'; this.handleShortsBlocking(url, true); }
            else if (CONFIG.platformSettings.yt === 'W' || CONFIG.platformSettings.yt === 'warn') { action = 'warn'; reason = 'warn mode'; this.handleShortsBlocking(url, false); }
            else { action = 'allow'; reason = 'allow/passive mode'; UI.remove(); Utils.unlockVideo(); }
        } else {
            action = 'remove'; reason = 'safe page';
            this.clearSession();
            UI.remove();
        }
        Utils.debugLog('yt', { url, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, sessionAllowed: this.isSessionAllowed(), action, reason });
    },
    handleShortsBlocking: function (url, isForced) {
        if (!Utils.isExtensionEnabled()) return;
        if (!isForced && this.isSessionAllowed()) return;
        const mode = isForced ? 'strict' : CONFIG.platformSettings.yt;
        if (mode === 'strict') {
            this.isRedirecting = true;
            sessionStorage.setItem('ft_kicked', 'true');
            Utils.logStat();
            window.location.replace("https://www.youtube.com");
        } else if (mode === 'warn') {
            UI.create('warn', 'yt', () => {
                Utils.unlockVideo();
                setTimeout(() => {
                    document.querySelectorAll('video').forEach(v => v.play());
                }, 50);
            }, () => window.location.href = "https://www.youtube.com");
            Utils.lockVideo();
        }
    },
    isSessionAllowed: function () {
        return CONFIG.session.allowUntil && CONFIG.session.allowUntil > Date.now() && CONFIG.session.platform === 'yt';
    },
    clearSession: function () {
        CONFIG.session.allowUntil = 0;
        CONFIG.session.platform = null;
    },
    applyFocusMode: function () {
        if (!Utils.shouldApplyVisualHiding('yt')) {
            this.removeVisualFocus();
            return;
        }
        if (document.body) document.body.classList.add('focus-mode-active');
    },
    removeVisualFocus: function () {
        if (document.body) document.body.classList.remove('focus-mode-active');
    },
    hideElement: function (el, targetSet) {
        if (!el) return;
        const set = targetSet || this.hiddenFocusElements;
        if (set.has(el)) return;
        Utils.setInlineStyle(el, 'display', 'none', 'important');
        set.add(el);
    },
    restoreHidden: function (targetSet) {
        const set = targetSet || this.hiddenFocusElements;
        set.forEach((el) => Utils.restoreInlineStyle(el, 'display'));
        set.clear();
    },
    clearInlineHiding: function () {
        this.restoreHidden(this.hiddenNavElements);
        this.restoreHidden(this.hiddenFocusElements);
    },
    applyInlineHiding: function () {
        if (this._scheduledHiding) return;
        this._scheduledHiding = requestAnimationFrame(() => {
            this._scheduledHiding = null;
            this._performInlineHiding();
        });
    },
    _performInlineHiding: function () {
        const shouldHide = FocusState.shouldBlock && Utils.shouldApplyVisualHiding('yt');
        if (!shouldHide) {
            this.clearInlineHiding();
            return;
        }
        if (!CONFIG.visualHiding.ytShortsNav) {
            this.restoreHidden(this.hiddenNavElements);
        } else {
            const navSelectors = [
                'a[title="Shorts"]',
                'a[href="/shorts"]',
                'a[href^="/shorts"]',
                'ytd-guide-entry-renderer a[title="Shorts"]',
                'ytd-mini-guide-entry-renderer a[title="Shorts"]'
            ];
            const navLinks = document.querySelectorAll(navSelectors.join(', '));
            navLinks.forEach((link) => {
                const entry = link.closest('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer');
                if (entry) this.hideElement(entry, this.hiddenNavElements);
            });
        }
        if (!CONFIG.visualHiding.ytShortsShelves) {
            this.restoreHidden(this.hiddenFocusElements);
        } else {
            document.querySelectorAll('ytd-rich-shelf-renderer[is-shorts], ytd-rich-shelf-renderer[is-shorts=""]').forEach((shelf) => {
                const section = shelf.closest('ytd-rich-section-renderer');
                if (section) this.hideElement(section, this.hiddenFocusElements);
                else this.hideElement(shelf, this.hiddenFocusElements);
            });
            document.querySelectorAll('a[href^="/shorts"]').forEach((link) => {
                const richItem = link.closest('ytd-rich-item-renderer');
                if (richItem) this.hideElement(richItem, this.hiddenFocusElements);
            });
            document.querySelectorAll('yt-chip-cloud-chip-renderer a[href="/shorts"], yt-chip-cloud-chip-renderer a[href^="/shorts"]').forEach((link) => {
                const chip = link.closest('yt-chip-cloud-chip-renderer');
                if (chip) this.hideElement(chip, this.hiddenFocusElements);
            });
            document.querySelectorAll('yt-tab-shape a[href="/shorts"], yt-tab-shape a[href^="/shorts"]').forEach((link) => {
                const tab = link.closest('yt-tab-shape');
                if (tab) this.hideElement(tab, this.hiddenFocusElements);
            });
        }
    },
    setLogoFix: function (isEnabled) {
        if (!document.body) return;
        document.body.classList.toggle('ft-yt-logo-fix', Boolean(isEnabled));
    },
    updateLogoFix: function () {
        if (!document.body) return;
        const logoIcon = document.querySelector('ytd-masthead #logo-icon');
        const logoWrapper = document.querySelector('ytd-masthead #logo, ytd-masthead ytd-topbar-logo-renderer');
        if (!logoIcon && !logoWrapper) {
            this.setLogoFix(false);
            return;
        }
        const target = logoIcon || logoWrapper;
        const style = window.getComputedStyle(target);
        const rect = target.getBoundingClientRect();
        const color = style.color;
        const isHidden = style.display === 'none' ||
            style.visibility === 'hidden' ||
            parseFloat(style.opacity || '1') === 0 ||
            rect.width === 0 ||
            rect.height === 0 ||
            color === 'transparent' ||
            color === 'rgba(0, 0, 0, 0)';
        this.setLogoFix(isHidden);
    },
    checkKick: function () {
        if (sessionStorage.getItem('ft_kicked')) {
            sessionStorage.removeItem('ft_kicked');
            UI.showKickNotification();
        }
    }
};
if (Site.isYT()) {
    if (window.__ftSettingsReady) YouTube.init();
    else document.addEventListener('ft-settings-ready', () => YouTube.init());
    Utils.registerLifecycle({
        onDisable: () => YouTube.disable(),
        onEnable: () => {
            if (!Utils.isExtensionEnabled()) return;
            if (!YouTube.initialized) YouTube.init();
            else YouTube.enable();
        }
    });
}
