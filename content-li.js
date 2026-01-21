const LinkedIn = {
    initialized: false,
    observer: null,
    pendingTimeout: null,
    currentMode: 'strict',
    feedOverlayId: 'ft-linkedin-feed-overlay',
    addFeedOverlayId: 'ft-linkedin-addfeed-overlay',
    init: function () {
        if (this.initialized) return;
        Utils.ensureBody(() => this._start());
    },
    _start: function () {
        if (this.initialized) return;
        if (!Utils.isExtensionEnabled()) return;
        this.initialized = true;
        document.body.classList.add('ft-platform-li');
        if (CONFIG.session.platform === 'li') {
            Utils.clearSession();
        }
        this.clearDismissalFlags();
        this.ensureObservers();
        window.addEventListener('focus', () => {
            if (CONFIG.platformSettings.li === 'warn' && CONFIG.session.platform === 'li') {
                Utils.clearSession();
                this.runChecks();
            }
        });
        window.addEventListener('popstate', () => this.runChecks());
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.platformSettings || changes.focusMode || changes.ft_timer_end || changes.ft_timer_type ||
                changes.hide_li_feed || changes.hide_li_addfeed ||
                changes.popup_visible_li || changes.restrictHiddenPlatforms || changes.visualHideHiddenPlatforms) {
                this.runChecks();
            }
        });
        document.addEventListener('ft-settings-changed', () => this.runChecks());
        this.runChecks();
    },
    ensureObservers: function () {
        if (!document.body) return;
        if (!this.observer) {
            this.observer = Utils.trackObserver(new MutationObserver(() => {
                if (this.pendingTimeout) clearTimeout(this.pendingTimeout);
                this.pendingTimeout = setTimeout(() => this.runChecks(), 50);
            }));
            this.observer.observe(document.body, { childList: true, subtree: true });
        }
    },
    disable: function () {
        if (this.pendingTimeout) {
            clearTimeout(this.pendingTimeout);
            this.pendingTimeout = null;
        }
        this.removeAllOverlays();
        this.clearDismissalFlags();
        if (this.observer) this.observer.disconnect();
        this.observer = null;
    },
    enable: function () {
        if (!document.body) return;
        document.body.classList.add('ft-platform-li');
        this.ensureObservers();
        this.runChecks();
    },
    runChecks: function () {
        if (!Utils.isExtensionEnabled()) {
            this.removeAllOverlays();
            return;
        }
        let action = 'none';
        let reason = '';
        const path = window.location.pathname;
        const nextMode = CONFIG.platformSettings.li;
        const modeChanged = nextMode !== this.currentMode;
        if (nextMode === 'strict' && this.currentMode !== 'strict') {
            Utils.clearSession();
            this.clearDismissalFlags();
        }
        if (modeChanged) {
            this.removeAllOverlays();
        }
        this.currentMode = nextMode;
        if (!FocusState.shouldBlock) {
            action = 'remove'; reason = 'focus not active';
            this.removeAllOverlays();
            Utils.debugLog('li', { path, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, action, reason });
            return;
        }
        if (this.isSafePage()) {
            action = 'remove'; reason = 'safe page';
            this.removeAllOverlays();
            Utils.debugLog('li', { path, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, action, reason });
            return;
        }
        if (this.currentMode === 'allow' && !FocusState.isWork) {
            action = 'remove'; reason = 'allow mode';
            this.removeAllOverlays();
            Utils.debugLog('li', { path, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, action, reason });
            return;
        }
        if (FocusState.isBreak) {
            action = 'remove'; reason = 'break timer';
            this.removeAllOverlays();
            Utils.debugLog('li', { path, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, action, reason });
            return;
        }
        const feedAllowed = Utils.isSessionAllowed('li') && !FocusState.isWork;
        if (!this.isFeedPage()) {
            action = 'remove'; reason = 'not feed page';
            this.removeAllOverlays();
            Utils.debugLog('li', { path, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, action, reason });
            return;
        }
        const allowVisual = Utils.shouldApplyVisualHiding('li');
        if (CONFIG.visualHiding.liFeed && allowVisual && !feedAllowed) {
            action = 'overlay'; reason = 'feed hidden';
            this.showFeedOverlay(FocusState.isWork);
        } else {
            action = 'allow'; reason = feedAllowed ? 'session allowed' : 'feed not hidden';
            this.removeFeedOverlay();
        }
        if (allowVisual && CONFIG.visualHiding.liAddFeed) {
            this.showSidebarOverlays(FocusState.isWork);
        } else {
            this.removeSidebarOverlays();
        }
        Utils.debugLog('li', { path, mode: this.currentMode, isWork: FocusState.isWork, isBreak: FocusState.isBreak, feedAllowed, action, reason });
    },
    isSafePage: function () {
        const path = window.location.pathname;
        return path.startsWith('/messaging') ||
            path.startsWith('/jobs') ||
            path.startsWith('/mynetwork') ||
            path.startsWith('/learning') ||
            path.startsWith('/in/') ||
            path.startsWith('/company/') ||
            path.startsWith('/school/') ||
            path.startsWith('/notifications') ||
            path.startsWith('/settings');
    },
    isFeedPage: function () {
        const path = window.location.pathname;
        return path === '/' || path.startsWith('/feed');
    },
    showFeedOverlay: function (isForced) {
        const mode = isForced ? 'strict' : CONFIG.platformSettings.li;
        if (mode === 'allow') return;
        const existing = document.getElementById(this.feedOverlayId);
        if (existing) {
            const existingMode = existing.dataset.ftMode || (existing.querySelector('button') ? 'warn' : 'strict');
            if (existingMode === mode) return;
            this.removeOverlayAndRestore(existing);
        }
        const feedColumn = document.querySelector('[data-testid="mainFeed"]') ||
            document.querySelector('main.scaffold-layout__main') ||
            document.querySelector('#main-content') ||
            document.querySelector('main') ||
            document.querySelector('main#workspace > div > div > div:nth-child(2)');
        if (!feedColumn) return;
        Utils.setInlineStyle(feedColumn, 'position', 'relative');
        Utils.setInlineStyle(feedColumn, 'overflow', 'hidden');
        Utils.setInlineStyle(feedColumn, 'max-height', '400px');
        feedColumn.dataset.ftHidden = 'true';
        const overlay = this.createOverlayElement(this.feedOverlayId, 'Feed Hidden', mode === 'warn');
        overlay.dataset.ftMode = mode;
        feedColumn.appendChild(overlay);
        Utils.logStat();
    },
    findSidebarCard: function (headerText) {
        const normalizeText = (str) => str
            .replace(/[\u0027\u0060\u00B4\u2018\u2019\u201B\u02BC]/g, "'")
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        const searchText = normalizeText(headerText);
        const root = document.querySelector('aside.scaffold-layout__aside') ||
            document.querySelector('aside') ||
            document.body;
        if (!root) return null;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            const text = normalizeText(node.textContent || '');
            if (!text) continue;
            if (text === searchText || text.includes(searchText)) {
                const artdecoCard = node.parentElement && node.parentElement.closest('.artdeco-card');
                if (artdecoCard && artdecoCard !== root) return artdecoCard;
                let el = node.parentElement;
                let depth = 0;
                while (el && depth < 12 && el !== root) {
                    if (el.nodeType === Node.ELEMENT_NODE) {
                        const tag = el.tagName;
                        if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE') {
                            const style = window.getComputedStyle(el);
                            const bg = style.backgroundColor;
                            const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
                            const hasRadius = parseFloat(style.borderRadius) > 0;
                            if (hasBg || hasRadius) {
                                return el;
                            }
                        }
                    }
                    el = el.parentElement;
                    depth++;
                }
            }
        }
        return null;
    },
    showSidebarOverlays: function (isForced) {
        const mode = isForced ? 'strict' : CONFIG.platformSettings.li;
        if (mode === 'allow') return;
        const allowDismiss = mode === 'warn';
        if (CONFIG.visualHiding.liAddFeed) {
            const existing = document.getElementById(this.addFeedOverlayId);
            if (existing && (existing.dataset.ftDismiss === 'true') !== allowDismiss) {
                this.removeOverlayAndRestore(existing);
            }
            if (!document.getElementById(this.addFeedOverlayId)) {
                const addFeedCard = this.findSidebarCard('Add to your feed');
                if (addFeedCard && !addFeedCard.dataset.ftDismissed) {
                    Utils.setInlineStyle(addFeedCard, 'position', 'relative');
                    Utils.setInlineStyle(addFeedCard, 'overflow', 'hidden');
                    const overlay = this.createSmallOverlay(this.addFeedOverlayId, 'Hidden', allowDismiss, addFeedCard);
                    addFeedCard.appendChild(overlay);
                }
            }
        } else {
            const existing = document.getElementById(this.addFeedOverlayId);
            if (existing) this.removeOverlayAndRestore(existing);
        }
    },
    removeSidebarOverlays: function () {
        const addFeed = document.getElementById(this.addFeedOverlayId);
        if (addFeed) this.removeOverlayAndRestore(addFeed);
    },
    clearDismissalFlags: function () {
        document.querySelectorAll('[data-ft-dismissed]').forEach(el => {
            delete el.dataset.ftDismissed;
        });
    },
    createSmallOverlay: function (id, title, showDismiss, parentCard) {
        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'ft-stories-overlay';
        overlay.dataset.ftDismiss = showDismiss ? 'true' : 'false';
        if (CONFIG.isDarkMode) overlay.classList.add('dark');
        const icon = document.createElement('img');
        icon.src = chrome.runtime.getURL('icons/icon48.png');
        icon.className = 'ft-stories-overlay-icon';
        const text = document.createElement('span');
        text.textContent = title;
        overlay.appendChild(icon);
        overlay.appendChild(text);
        if (showDismiss) {
            const btn = document.createElement('button');
            btn.className = 'ft-linkedin-overlay-btn';
            btn.textContent = 'View';
            btn.style.cssText = 'margin-top: 8px; padding: 6px 16px; font-size: 12px; position: relative; z-index: 10; cursor: pointer;';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (parentCard) parentCard.dataset.ftDismissed = 'true';
                overlay.remove();
            });
            overlay.appendChild(btn);
        }
        return overlay;
    },
    createOverlayElement: function (id, title, showDismiss) {
        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'ft-linkedin-overlay';
        if (CONFIG.isDarkMode) overlay.classList.add('dark');
        const icon = document.createElement('img');
        icon.src = chrome.runtime.getURL('icons/icon128.png');
        icon.className = 'ft-linkedin-overlay-icon';
        const h3 = document.createElement('h3');
        h3.textContent = title;
        const subtitle = document.createElement('p');
        subtitle.textContent = "We're keeping you productive.";
        overlay.appendChild(icon);
        overlay.appendChild(h3);
        overlay.appendChild(subtitle);
        if (showDismiss) {
            const btn = document.createElement('button');
            btn.className = 'ft-linkedin-overlay-btn';
            btn.textContent = 'View Anyway';
            btn.onclick = () => {
                Utils.setAllowWindow('li', 5);
                this.removeFeedOverlay();
            };
            overlay.appendChild(btn);
        }
        return overlay;
    },
    removeFeedOverlay: function () {
        const overlay = document.getElementById(this.feedOverlayId);
        if (overlay) {
            const parent = overlay.parentElement;
            if (parent && parent.dataset.ftHidden) {
                Utils.restoreInlineStyles(parent);
                delete parent.dataset.ftHidden;
            }
            overlay.remove();
        }
    },
    removeOverlayAndRestore: function (overlay) {
        if (!overlay) return;
        const parent = overlay.parentElement;
        overlay.remove();
        if (parent) Utils.restoreInlineStyles(parent);
    },
    removeAllOverlays: function () {
        this.removeFeedOverlay();
        this.removeSidebarOverlays();
        UI.remove();
    }
};
if (Site.isLI()) {
    if (window.__ftSettingsReady) LinkedIn.init();
    else document.addEventListener('ft-settings-ready', () => LinkedIn.init());
    Utils.registerLifecycle({
        onDisable: () => LinkedIn.disable(),
        onEnable: () => {
            if (!Utils.isExtensionEnabled()) return;
            if (!LinkedIn.initialized) LinkedIn.init();
            else LinkedIn.enable();
        }
    });
}
