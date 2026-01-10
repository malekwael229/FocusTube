const TikTok = {
    initialized: false,
    currentMode: 'strict',
    lastPath: '',
    fallbackInterval: null,

    init: function () {
        if (this.initialized) return;
        if (!document.body) { setTimeout(() => this.init(), 100); return; }

        this.initialized = true;
        document.body.classList.add('ft-platform-tt');

        window.addEventListener('popstate', () => this.runChecks());

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.platformSettings || changes.focusMode || changes.ft_timer_end || changes.ft_timer_type) {
                this.runChecks();
            }
        });

        this.fallbackInterval = Utils.setSafeInterval(() => this.runChecks(), 1000);
        this.runChecks();
    },

    runChecks: function () {
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
            else if (CONFIG.platformSettings.tt !== 'allow') { action = this.currentMode; reason = 'platform mode'; this.block(false); }
            else { action = 'allow'; reason = 'allow mode'; UI.remove(); }
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
}
