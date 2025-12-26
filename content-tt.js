const TikTok = {
    currentMode: 'strict',
    run: function (isUpdate) {
        if (!isUpdate) {
            if (document.body) document.body.classList.add('ft-platform-tt');
            Utils.setSafeInterval(() => this.check(), 250);
        }
        this.check();

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.platformSettings || changes.focusMode || changes.ft_timer_end || changes.ft_timer_type) {
                this.check();
            }
        });
    },
    check: function () {
        const path = window.location.pathname;
        const ts = Utils.getTimerState();
        if (CONFIG.platformSettings.tt === 'strict' && this.currentMode !== 'strict') { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
        this.currentMode = CONFIG.platformSettings.tt;

        const isSafePage =
            path.startsWith('/messages') ||
            path.startsWith('/upload') ||
            path.startsWith('/settings') ||
            path.startsWith('/feedback') ||
            path.startsWith('/coin');
        if (isSafePage) {
            if (CONFIG.session.allowUntil && CONFIG.session.allowUntil > Date.now() && CONFIG.session.platform === 'tt') { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
            UI.remove(); return;
        }

        if (CONFIG.session.allowUntil && CONFIG.session.allowUntil > Date.now() && CONFIG.session.platform === 'tt' && !ts.isWork) { UI.remove(); return; }

        let shouldBlock = false;
        if (path === '/' || path.startsWith('/foryou') || path.startsWith('/following') || path.startsWith('/friends') ||
            path.startsWith('/explore') || path.includes('/live') || path.startsWith('/search') ||
            path.includes('/video/') || path.includes('/photo/')) { shouldBlock = true; }

        if (shouldBlock) {
            if (ts.isBreak) UI.remove();
            else if (ts.isWork) this.block(true);
            else if (CONFIG.platformSettings.tt !== 'allow') this.block(false);
            else UI.remove();
        } else UI.remove();
    },
    block: function (isForced) {
        if (!isForced && CONFIG.session.allowUntil && CONFIG.session.allowUntil > Date.now() && CONFIG.session.platform === 'tt') return;
        const mode = isForced ? 'strict' : CONFIG.platformSettings.tt;
        UI.create(mode, 'tt', () => {
            CONFIG.session.allowUntil = Date.now() + (5 * 60 * 1000); CONFIG.session.platform = 'tt'; Utils.unlockVideo();
        }, () => window.location.href = "https://www.tiktok.com/messages");
    }
};

if (Site.isTT()) {
    document.addEventListener('ft-settings-ready', () => TikTok.run());
}
