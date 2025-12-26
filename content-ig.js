const Instagram = {
    igSelectors: {
        nav: {
            explore: "a[href*='/explore/']",
            reels: "a[href*='/reels/']",
        }
    },

    observer: null,
    isRedirecting: false,

    run: function (isUpdate) {
        if (!isUpdate) {
            if (document.body) document.body.classList.add('ft-platform-ig');
            this.initObserver();
            Utils.setSafeInterval(() => this.handleMutation(), 800);
        }
        this.rapidKick();
        this.handleMutation();

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.platformSettings || changes.focusMode || changes.ft_timer_end || changes.ft_timer_type) {
                this.handleMutation();
            }
        });
    },

    initObserver: function () {
        if (this.observer) return;
        this.isRedirecting = false;
        this.observer = new MutationObserver(() => this.handleMutation());
        this.observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'style', 'class', 'role'] });

        Utils.setSafeInterval(() => this.rapidKick(), 200);
    },

    rapidKick: function () {
        if (this.isRedirecting) return;

        const path = window.location.pathname;
        if (path.startsWith('/reels/') || path.startsWith('/reel/') || path.startsWith('/explore/')) {
            const ts = Utils.getTimerState();
            const shouldBlock = CONFIG.isFocusMode || ts.isWork || CONFIG.platformSettings.ig === 'strict';

            if (shouldBlock) {
                if (sessionStorage.getItem('ft_kicked') === 'true' && path === '/') return;

                this.isRedirecting = true;
                sessionStorage.setItem('ft_kicked', 'true');
                Utils.logStat();
                window.location.replace('/');

                setTimeout(() => { this.isRedirecting = false; }, 2000);
            }
        }
    },

    applyHidden: function (elements) {
        if (!elements) return;
        if (elements instanceof NodeList) elements.forEach(el => el.style.setProperty('display', 'none', 'important'));
        else elements.style.setProperty('display', 'none', 'important');
    },

    applyVisible: function (elements) {
        if (!elements) return;
        if (elements instanceof NodeList) elements.forEach(el => el.style.removeProperty('display'));
        else elements.style.removeProperty('display');
    },

    handleMutation: function () {
        if (!document.body) return;

        const path = window.location.pathname;
        const ts = Utils.getTimerState();

        const isFocusActive = CONFIG.isFocusMode || ts.isWork;

        if (isFocusActive) {
            this.applyHidden(document.body.querySelectorAll(this.igSelectors.nav.reels));
            this.applyHidden(document.body.querySelectorAll(this.igSelectors.nav.explore));
        } else {
            this.applyVisible(document.body.querySelectorAll(this.igSelectors.nav.reels));
            this.applyVisible(document.body.querySelectorAll(this.igSelectors.nav.explore));
        }

        if (!path.startsWith('/reels/') && !path.startsWith('/reel/') && !path.startsWith('/explore/')) {
            if (sessionStorage.getItem('ft_kicked')) {
                sessionStorage.removeItem('ft_kicked');
                UI.showKickNotification();
            }
        } else {
            const shouldBlock = isFocusActive || CONFIG.platformSettings.ig === 'strict';
            if (shouldBlock && !this.isRedirecting) {
                this.rapidKick();
            }
        }
    }
};

if (Site.isIG()) {
    document.addEventListener('ft-settings-ready', () => Instagram.run());
}
