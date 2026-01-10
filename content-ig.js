const Instagram = {
    initialized: false,
    observer: null,
    isRedirecting: false,
    currentMode: 'strict',
    lastPath: '',
    fallbackInterval: null,
    storiesOverlayId: 'ft-ig-stories-overlay',

    igSelectors: {
        nav: {
            explore: "a[href*='/explore/']",
            reels: "a[href*='/reels/']",
        }
    },

    init: function () {
        if (this.initialized) return;
        if (!document.body) { setTimeout(() => this.init(), 100); return; }

        this.initialized = true;
        document.body.classList.add('ft-platform-ig');
        this.isRedirecting = false;

        this.observer = new MutationObserver(() => this.runChecks());
        this.observer.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('popstate', () => this.runChecks());

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.platformSettings || changes.focusMode || changes.ft_timer_end || changes.ft_timer_type) {
                this.runChecks();
            }
        });

        this.fallbackInterval = Utils.setSafeInterval(() => this.runChecks(), 1000);
        this.runChecks();
        this.checkKick();
    },

    runChecks: function () {
        if (this.isRedirecting || !document.body) return;

        const path = window.location.pathname;
        const isFocusActive = FocusState.shouldBlock;
        let action = 'none';
        let reason = '';

        if (CONFIG.platformSettings.ig === 'strict' && this.currentMode !== 'strict') {
            Utils.clearSession();
            this.removeStoriesOverlay();
        }
        this.currentMode = CONFIG.platformSettings.ig;

        if (FocusState.isBreak) {
            action = 'remove'; reason = 'break timer';
            this.applyVisible(document.body.querySelectorAll(this.igSelectors.nav.reels));
            this.applyVisible(document.body.querySelectorAll(this.igSelectors.nav.explore));
            this.removeStoriesOverlay();
            Utils.debugLog('ig', { path, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, isFocusActive, action, reason });
            return;
        }

        if (isFocusActive && CONFIG.visualHiding.igReelsNav) {
            this.applyHidden(document.body.querySelectorAll(this.igSelectors.nav.reels));
            this.applyHidden(document.body.querySelectorAll(this.igSelectors.nav.explore));
        } else {
            this.applyVisible(document.body.querySelectorAll(this.igSelectors.nav.reels));
            this.applyVisible(document.body.querySelectorAll(this.igSelectors.nav.explore));
        }

        if (this.isBlockablePath(path)) {
            const shouldBlock = isFocusActive || CONFIG.platformSettings.ig === 'strict';
            if (shouldBlock && !this.isRedirecting) {
                action = 'redirect'; reason = 'blockable path';
                this.rapidKick(path);
            } else {
                action = 'allow'; reason = 'no block condition';
            }
        } else {
            action = 'safe'; reason = 'non-blockable path';
            if (sessionStorage.getItem('ft_kicked')) {
                sessionStorage.removeItem('ft_kicked');
                UI.showKickNotification();
            }
        }

        if (isFocusActive && CONFIG.visualHiding.igStories) {
            this.showStoriesOverlay();
        } else {
            this.removeStoriesOverlay();
        }

        Utils.debugLog('ig', { path, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, isFocusActive, action, reason });
    },

    isBlockablePath: function (path) {
        return path.startsWith('/reels/') || path.startsWith('/reel/') || path.startsWith('/explore/');
    },

    rapidKick: function (path) {
        if (this.isRedirecting) return;
        if (sessionStorage.getItem('ft_kicked') === 'true' && path === '/') return;

        this.isRedirecting = true;
        sessionStorage.setItem('ft_kicked', 'true');
        Utils.logStat();
        window.location.replace('/');

        setTimeout(() => { this.isRedirecting = false; }, 2000);
    },

    checkKick: function () {
        if (sessionStorage.getItem('ft_kicked') && !this.isBlockablePath(window.location.pathname)) {
            sessionStorage.removeItem('ft_kicked');
            UI.showKickNotification();
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

    showStoriesOverlay: function () {
        if (document.getElementById(this.storiesOverlayId)) return;
        const storyTray = document.querySelector('[data-pagelet="story_tray"]');
        if (!storyTray) return;

        storyTray.style.position = 'relative';

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
        storyTray.appendChild(overlay);
    },

    removeStoriesOverlay: function () {
        const overlay = document.getElementById(this.storiesOverlayId);
        if (overlay) overlay.remove();
    }
};

if (Site.isIG()) {
    if (window.__ftSettingsReady) Instagram.init();
    else document.addEventListener('ft-settings-ready', () => Instagram.init());
}
