const YouTube = {
    isRedirecting: false,
    observer: null,
    lastCheckTime: 0,
    currentMode: 'strict',

    init: function () {
        if (!document.body) { setTimeout(() => this.init(), 100); return; }
        document.body.classList.add('ft-platform-yt');
        this.isRedirecting = false;
        document.addEventListener('yt-navigate-finish', () => { this.isRedirecting = false; setTimeout(() => this.runChecks(), 300); });
        window.addEventListener('popstate', () => setTimeout(() => this.runChecks(), 300));
        this.observer = new MutationObserver(() => {
            if (Date.now() - this.lastCheckTime > 1000) { this.lastCheckTime = Date.now(); this.runChecks(); }
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.runChecks();
        setTimeout(() => this.checkKick(), 500);

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.platformSettings || changes.focusMode || changes.ft_timer_end || changes.ft_timer_type ||
                changes.visualHideHiddenPlatforms || changes.restrictHiddenPlatforms ||
                changes.popup_visible_yt || changes.popup_visible_ig || changes.popup_visible_tt || changes.popup_visible_fb) {
                this.runChecks();
            }
        });
    },

    runChecks: function () {
        if (this.isRedirecting || !document.body) return;
        const currentUrl = window.location.href;
        if (currentUrl.includes('/feed/history')) {
            if (CONFIG.session.allowUntil && CONFIG.session.allowUntil > Date.now() && CONFIG.session.platform === 'yt') { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
            this.removeVisualFocus(); UI.remove(); return;
        }
        this.checkActiveBlocking(currentUrl);
        const ts = Utils.getTimerState();
        if (ts.isWork || (CONFIG.isFocusMode && !ts.isBreak)) this.applyFocusMode();
        else this.removeVisualFocus();
    },

    checkActiveBlocking: function (url) {
        const ts = Utils.getTimerState();
        if (CONFIG.platformSettings.yt === 'strict' && this.currentMode !== 'strict') { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
        this.currentMode = CONFIG.platformSettings.yt;

        if (url.includes('/shorts/')) {
            if (ts.isBreak) { UI.remove(); return; }
            if (ts.isWork) this.handleShortsBlocking(url, true);
            else if (CONFIG.platformSettings.yt !== 'allow') this.handleShortsBlocking(url, false);
            else UI.remove();
        } else {
            if (CONFIG.session.allowUntil && CONFIG.session.allowUntil > Date.now() && CONFIG.session.platform === 'yt') { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
            UI.remove();
        }
    },

    handleShortsBlocking: function (url, isForced) {
        if (!isForced && CONFIG.session.allowUntil && CONFIG.session.allowUntil > Date.now() && CONFIG.session.platform === 'yt') return;

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

    applyFocusMode: function () {

        if (CONFIG.popupVisibility && CONFIG.popupVisibility.yt === false && CONFIG.visualHideHidden === false) {
            this.removeVisualFocus();
            return;
        }
        if (document.body) document.body.classList.add('focus-mode-active');
    },
    removeVisualFocus: function () { if (document.body) document.body.classList.remove('focus-mode-active'); },
    checkKick: function () {
        if (sessionStorage.getItem('ft_kicked')) { sessionStorage.removeItem('ft_kicked'); UI.showKickNotification(); }
    }
};

if (Site.isYT()) {
    document.addEventListener('ft-settings-ready', () => YouTube.init());




}
