const TikTok = {
    initialized: false,
    observer: null,
    currentMode: 'strict',
    lastPath: '',
    init: function () {
        if (this.initialized) return;
        Utils.ensureBody(() => this._start());
    },
    _start: function () {
        if (this.initialized) return;
        if (!Utils.isExtensionEnabled()) return;
        this.initialized = true;
        document.body.classList.add('ft-platform-tt');
        this.ensureObservers();
        window.addEventListener('popstate', () => this.runChecks());
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.platformSettings || changes.focusMode || changes.ft_timer_end || changes.ft_timer_type ||
                changes.popup_visible_tt || changes.restrictHiddenPlatforms || changes.visualHideHiddenPlatforms) {
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
        if (this.observer) this.observer.disconnect();
        this.observer = null;
    },
    enable: function () {
        if (!document.body) return;
        document.body.classList.add('ft-platform-tt');
        this.ensureObservers();
        this.runChecks();
    },
    runChecks: function () {
        if (!Utils.isExtensionEnabled()) {
            UI.remove();
            return;
        }
        const path = window.location.pathname;
        let action = 'none';
        let reason = '';
        if (CONFIG.platformSettings.tt === 'strict' && this.currentMode !== 'strict') {
            Utils.clearSession();
        }
        this.currentMode = CONFIG.platformSettings.tt;
        if (this.isSafePage(path)) {
            if (Utils.isSessionAllowed('tt')) Utils.clearSession();
            action = 'remove'; reason = 'safe page';
            UI.remove();
        } else if (Utils.isSessionAllowed('tt') && !FocusState.isWork) {
            action = 'allow'; reason = 'session allowed';
            UI.remove();
        } else if (this.isBlockablePath(path)) {
            if (FocusState.isBreak) { action = 'remove'; reason = 'break timer'; UI.remove(); }
            else if (FocusState.isWork) { action = 'block'; reason = 'work timer'; this.block(true); }
            else if (CONFIG.platformSettings.tt === 'S' || CONFIG.platformSettings.tt === 'strict') { action = 'strict'; reason = 'strict mode'; this.block(true); }
            else if (CONFIG.platformSettings.tt === 'W' || CONFIG.platformSettings.tt === 'warn') { action = 'warn'; reason = 'warn mode'; this.block(false); }
            else { action = 'allow'; reason = 'allow/passive mode'; UI.remove(); }
        } else {
            action = 'remove'; reason = 'non-blockable path';
            UI.remove();
        }
        Utils.debugLog('tt', { path, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, sessionAllowed: Utils.isSessionAllowed('tt'), action, reason });
    },
    isSafePage: function (path) {
        return path.startsWith('/messages') ||
            path.startsWith('/upload') ||
            path.startsWith('/settings') ||
            path.startsWith('/feedback') ||
            path.startsWith('/coin');
    },
    isBlockablePath: function (path) {
        return path === '/' ||
            path.startsWith('/foryou') ||
            path.startsWith('/following') ||
            path.startsWith('/friends') ||
            path.startsWith('/explore') ||
            path.includes('/live') ||
            path.startsWith('/search') ||
            path.includes('/video/') ||
            path.includes('/photo/');
    },
    block: function (isForced) {
        if (!isForced && Utils.isSessionAllowed('tt')) return;
        const mode = isForced ? 'strict' : CONFIG.platformSettings.tt;
        UI.create(mode, 'tt', () => {
            Utils.setAllowWindow('tt', 5);
            Utils.unlockVideo();
        }, () => window.location.href = "https://www.tiktok.com/messages");
    }
};
if (Site.isTT()) {
    if (window.__ftSettingsReady) TikTok.init();
    else document.addEventListener('ft-settings-ready', () => TikTok.init());
    Utils.registerLifecycle({
        onDisable: () => TikTok.disable(),
        onEnable: () => {
            if (!Utils.isExtensionEnabled()) return;
            if (!TikTok.initialized) TikTok.init();
            else TikTok.enable();
        }
    });
}
