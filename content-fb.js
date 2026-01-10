const Facebook = {
    initialized: false,
    observer: null,
    currentMode: 'strict',
    fallbackInterval: null,
    storiesOverlayId: 'ft-fb-stories-overlay',

    init: function () {
        if (this.initialized) return;
        if (!document.body) { setTimeout(() => this.init(), 100); return; }

        this.initialized = true;
        document.body.classList.add('ft-platform-fb');

        this.observer = new MutationObserver(() => this.runChecks());
        this.observer.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('popstate', () => this.runChecks());

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.platformSettings || changes.focusMode || changes.ft_timer_end || changes.ft_timer_type || changes.hide_fb_stories || changes.hide_fb_reels_nav) {
                this.runChecks();
            }
        });

        this.fallbackInterval = Utils.setSafeInterval(() => this.runChecks(), 1000);
        this.runChecks();
    },

    runChecks: function () {
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
                this.applyReelsHiding(isFocusActive && CONFIG.visualHiding.fbReelsNav);
            } else if (FocusState.isWork || CONFIG.platformSettings.fb === 'strict') {
                action = 'block'; reason = FocusState.isWork ? 'work timer' : 'strict mode';
                UI.create('strict', 'fb', () => { }, () => window.location.href = 'https://www.facebook.com/');
                Utils.lockVideo();
                this.applyReelsHiding(isFocusActive && CONFIG.visualHiding.fbReelsNav);
            } else if (CONFIG.platformSettings.fb === 'warn') {
                action = 'warn'; reason = 'warn mode';
                UI.create('warn', 'fb', () => {
                    Utils.setAllowWindow('fb', 5);
                    UI.remove();
                    Utils.unlockVideo();
                }, () => window.location.href = 'https://www.facebook.com/');
                Utils.lockVideo();
                this.applyReelsHiding(isFocusActive && CONFIG.visualHiding.fbReelsNav);
            }
        } else {
            action = 'safe'; reason = 'non-reels path';
            if (CONFIG.session.platform === 'fb') Utils.clearSession();
            UI.remove();
            this.applyReelsHiding(isFocusActive && CONFIG.visualHiding.fbReelsNav);

            if (isFocusActive && CONFIG.visualHiding.fbStories) {
                this.showStoriesOverlay();
            } else {
                this.removeStoriesOverlay();
            }
        }

        Utils.debugLog('fb', { path, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, sessionAllowed: Utils.isSessionAllowed('fb'), action, reason });
    },

    applyReelsHiding: function (shouldHide) {
        const selectors = [
            'a[aria-label="Reels"]',
            'a[href*="/reels/"]',
            'a[href*="/reel/"]',
            '[role="navigation"] a[aria-label="Reels"]',
            'div[aria-label="Reels"]'
        ];

        const fbReelsLink = document.querySelector('a[aria-label="Reels"][href="/reel/?s=tab"]');
        if (fbReelsLink) {
            const container = fbReelsLink.closest('li');
            if (container) {
                if (shouldHide) container.style.setProperty('display', 'none', 'important');
                else container.style.removeProperty('display');
            }
        }

        selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (shouldHide) el.style.setProperty('display', 'none', 'important');
                else el.style.removeProperty('display');
            });
        });

        const candidates = document.querySelectorAll('span, h3, div[role="button"] span');
        candidates.forEach(el => {
            if (el.textContent === "Reels") {
                const btn = el.closest('div[role="button"]');
                if (btn && shouldHide) btn.style.setProperty('display', 'none', 'important');
                else if (btn) btn.style.removeProperty('display');

                const shelfHeader = el.closest('div.x1n2onr6.x1ja2u2z');
                if (shelfHeader) {
                    let parent = shelfHeader.parentElement;
                    for (let i = 0; i < 8; i++) {
                        if (!parent) break;
                        if (parent.className.includes('html-div') && parent.className.includes('xz9dl7a') === false) {
                            if (shouldHide) parent.style.setProperty('display', 'none', 'important');
                            else parent.style.removeProperty('display');
                            break;
                        }
                        parent = parent.parentElement;
                    }
                }
            }
        });
    },

    showStoriesOverlay: function () {
        if (document.getElementById(this.storiesOverlayId)) return;

        const storiesContainer = document.querySelector('[aria-label="Stories"]');
        if (!storiesContainer) return;

        const storyShelf = storiesContainer.querySelector('[scrollable="true"]') ||
            storiesContainer.querySelector('.xb57i2i') ||
            storiesContainer;

        storyShelf.style.position = 'relative';
        storyShelf.style.overflow = 'hidden';

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
        if (overlay) overlay.remove();
    }
};

if (Site.isFB()) {
    if (window.__ftSettingsReady) Facebook.init();
    else document.addEventListener('ft-settings-ready', () => Facebook.init());
}
