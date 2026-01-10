const YouTube = {
    isRedirecting: false,
    initialized: false,
    observer: null,
    fallbackInterval: null,
    lastUrl: '',
    lastBlockState: null,
    currentMode: 'strict',

    init: function () {
        if (this.initialized) return;
        if (!document.body) { setTimeout(() => this.init(), 100); return; }

        this.initialized = true;
        document.body.classList.add('ft-platform-yt');
        this.isRedirecting = false;

        if (Utils.isDebugEnabled()) {
            window.__ftDebug = window.__ftDebug || {
                initCount: 0,
                runCount: 0,
                observerCount: 0,
                intervalCount: 0,
                runTimestamps: []
            };
            window.__ftDebug.initCount++;
            this.syncDebug();
        }

        document.addEventListener('yt-navigate-finish', () => {
            this.isRedirecting = false;
            this.runChecks();
        });

        window.addEventListener('popstate', () => this.runChecks());

        this.observer = new MutationObserver(() => this.runChecks());
        this.observer.observe(document.body, { childList: true, subtree: true, attributes: false });
        if (Utils.isDebugEnabled() && window.__ftDebug) window.__ftDebug.observerCount++;

        this.fallbackInterval = Utils.setSafeInterval(() => this.runChecks(), 1000);
        if (Utils.isDebugEnabled() && window.__ftDebug) window.__ftDebug.intervalCount++;

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.ft_debug) {
                if (changes.ft_debug.newValue !== true) this.cleanupDebug();
                else {
                    window.__ftDebug = window.__ftDebug || {
                        initCount: 1,
                        runCount: 0,
                        observerCount: 1,
                        intervalCount: 1,
                        runTimestamps: []
                    };
                    this.syncDebug();
                }
            }
            if (changes.platformSettings || changes.focusMode || changes.ft_timer_end || changes.ft_timer_type ||
                changes.visualHideHiddenPlatforms || changes.restrictHiddenPlatforms ||
                changes.popup_visible_yt || changes.popup_visible_ig || changes.popup_visible_tt || changes.popup_visible_fb) {
                this.runChecks();
            }
        });

        this.runChecks();
        setTimeout(() => this.checkKick(), 500);
    },

    runChecks: function () {
        if (this.isRedirecting || !document.body) return;

        if (Utils.isDebugEnabled() && window.__ftDebug) {
            window.__ftDebug.runCount++;
            window.__ftDebug.runTimestamps = window.__ftDebug.runTimestamps || [];
            window.__ftDebug.runTimestamps.push(Date.now());
            if (window.__ftDebug.runTimestamps.length > 50) window.__ftDebug.runTimestamps.shift();
            this.syncDebug();
        }

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
    },

    checkActiveBlocking: function (url) {
        if (CONFIG.platformSettings.yt === 'strict' && this.currentMode !== 'strict') {
            this.clearSession();
        }
        this.currentMode = CONFIG.platformSettings.yt;

        let action = 'none';
        let reason = '';

        if (url.includes('/shorts/')) {
            if (FocusState.isBreak) { action = 'remove'; reason = 'break timer'; UI.remove(); }
            else if (FocusState.isWork) { action = 'block'; reason = 'work timer'; this.handleShortsBlocking(url, true); }
            else if (CONFIG.platformSettings.yt !== 'allow') { action = CONFIG.platformSettings.yt; reason = 'platform mode'; this.handleShortsBlocking(url, false); }
            else { action = 'allow'; reason = 'allow mode'; UI.remove(); }
        } else {
            action = 'remove'; reason = 'safe page';
            this.clearSession();
            UI.remove();
        }

        Utils.debugLog('yt', { url, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, sessionAllowed: this.isSessionAllowed(), action, reason });
    },

    handleShortsBlocking: function (url, isForced) {
        if (!isForced && this.isSessionAllowed()) return;

        const mode = isForced ? 'strict' : CONFIG.platformSettings.yt;
        if (mode === 'strict') {
            this.isRedirecting = true;
            sessionStorage.setItem('ft_kicked', 'true');
            Utils.logStat();
            window.location.replace("https://www.youtube.com");
        } else if (mode === 'warn') {
            UI.create('warn', 'yt', () => Utils.unlockVideo(), () => window.location.href = "https://www.youtube.com");
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
        if (CONFIG.popupVisibility?.yt === false && CONFIG.visualHideHidden === false) {
            this.removeVisualFocus();
            return;
        }
        if (document.body) document.body.classList.add('focus-mode-active');
    },

    removeVisualFocus: function () {
        if (document.body) document.body.classList.remove('focus-mode-active');
    },

    checkKick: function () {
        if (sessionStorage.getItem('ft_kicked')) {
            sessionStorage.removeItem('ft_kicked');
            UI.showKickNotification();
        }
    },

    syncDebug: function () {
        if (!Utils.isDebugEnabled()) {
            this.cleanupDebug();
            return;
        }
        try {
            document.documentElement.setAttribute('data-ft-debug', JSON.stringify(window.__ftDebug));
        } catch (e) { }
    },

    cleanupDebug: function () {
        delete window.__ftDebug;
        document.documentElement.removeAttribute('data-ft-debug');
    }
};

if (Site.isYT()) {
    if (window.__ftSettingsReady) YouTube.init();
    else document.addEventListener('ft-settings-ready', () => YouTube.init());
}
