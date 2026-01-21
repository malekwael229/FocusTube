const Site = {
    isYT: () => location.hostname.includes('youtube.com'),
    isIG: () => location.hostname.includes('instagram.com'),
    isTT: () => location.hostname.includes('tiktok.com'),
    isFB: () => location.hostname.includes('facebook.com'),
    isLI: () => location.hostname.includes('linkedin.com')
};
const CONFIG = {
    extensionEnabled: true,
    isFocusMode: true,
    platformSettings: { yt: 'strict', ig: 'strict', tt: 'strict', fb: 'strict', li: 'strict' },
    isDarkMode: true,
    playSound: true,
    timer: { end: null, type: 'work' },
    session: { allowedCount: 0, allowUntil: 0, platform: null },
    popupVisibility: { yt: true, ig: true, tt: true, fb: true, li: true },
    visualHideHidden: true,
    restrictHidden: true,
    visualHiding: {
        igStories: true,
        igFeedReels: true,
        fbStories: true,
        ytShortsNav: true,
        ytShortsShelves: true,
        igReelsNav: true,
        fbReelsNav: true,
        liFeed: true,
        liAddFeed: true
    }
};
const FocusState = {
    get isWork() {
        return CONFIG.extensionEnabled !== false && CONFIG.timer.end && CONFIG.timer.end > Date.now() && CONFIG.timer.type === 'work';
    },
    get isBreak() {
        return CONFIG.extensionEnabled !== false && CONFIG.timer.end && CONFIG.timer.end > Date.now() && CONFIG.timer.type === 'break';
    },
    get isTimerActive() {
        return CONFIG.extensionEnabled !== false && CONFIG.timer.end && CONFIG.timer.end > Date.now();
    },
    get shouldBlock() {
        if (CONFIG.extensionEnabled === false) return false;
        return this.isWork || (CONFIG.isFocusMode && !this.isBreak);
    }
};
const Utils = {
    intervals: [],
    observers: [],
    videoLockInterval: null,
    _mediaState: new WeakMap(),
    _mediaElements: new Set(),
    _debugEnabled: false,
    _lastDebugState: {},
    _disableHandlers: [],
    _enableHandlers: [],
    _statKeys: null,
    _inlineStyleCache: new WeakMap(),
    _inlineStyleElements: new Set(),
    isDebugEnabled: function () {
        return this._debugEnabled;
    },
    isExtensionEnabled: function () {
        return CONFIG.extensionEnabled !== false;
    },
    shouldApplyVisualHiding: function (platform) {
        if (!platform) return true;
        if (CONFIG.visualHideHidden) return true;
        if (!CONFIG.popupVisibility) return true;
        return CONFIG.popupVisibility[platform] !== false;
    },
    registerLifecycle: function ({ onDisable, onEnable }) {
        if (typeof onDisable === 'function') this._disableHandlers.push(onDisable);
        if (typeof onEnable === 'function') this._enableHandlers.push(onEnable);
    },
    trackObserver: function (observer) {
        if (observer) this.observers.push(observer);
        return observer;
    },
    disconnectObservers: function () {
        this.observers.forEach((observer) => {
            try { observer.disconnect(); } catch (e) { }
        });
        this.observers = [];
    },
    clearIntervals: function () {
        this.intervals.forEach((id) => clearInterval(id));
        this.intervals = [];
        if (this.videoLockInterval) {
            clearInterval(this.videoLockInterval);
            this.videoLockInterval = null;
        }
    },
    clearInjectedStyles: function () {
        document.querySelectorAll('style[data-ft-style], style[id^="ft-style"], style#ft-style').forEach(el => el.remove());
    },
    clearInjectedElements: function () {
        const ids = [
            'focus-tube-warning-overlay',
            'ft-toast',
            'ft-ig-stories-overlay',
            'ft-fb-stories-overlay',
            'ft-linkedin-feed-overlay',
            'ft-linkedin-puzzles-overlay',
            'ft-linkedin-addfeed-overlay'
        ];
        ids.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        document.querySelectorAll('.focus-tube-warning, .ft-stories-overlay, .ft-linkedin-overlay').forEach(el => el.remove());
    },
    setInlineStyle: function (el, prop, value, priority) {
        if (!el || !prop) return;
        let cache = this._inlineStyleCache.get(el);
        if (!cache) {
            cache = {};
            this._inlineStyleCache.set(el, cache);
        }
        if (!cache[prop]) {
            cache[prop] = {
                value: el.style.getPropertyValue(prop),
                priority: el.style.getPropertyPriority(prop)
            };
        }
        if (value === null) {
            el.style.removeProperty(prop);
        } else {
            el.style.setProperty(prop, value, priority || '');
        }
        this._inlineStyleElements.add(el);
    },
    restoreInlineStyle: function (el, prop) {
        if (!el || !prop) return;
        const cache = this._inlineStyleCache.get(el);
        if (!cache || !cache[prop]) return;
        const prior = cache[prop];
        if (prior.value === '') el.style.removeProperty(prop);
        else el.style.setProperty(prop, prior.value, prior.priority || '');
        delete cache[prop];
        if (Object.keys(cache).length === 0) {
            this._inlineStyleCache.delete(el);
            this._inlineStyleElements.delete(el);
        }
    },
    restoreInlineStyles: function (el) {
        const restoreAll = (target) => {
            const cache = this._inlineStyleCache.get(target);
            if (!cache) return;
            Object.keys(cache).forEach((prop) => {
                const prior = cache[prop];
                if (prior.value === '') target.style.removeProperty(prop);
                else target.style.setProperty(prop, prior.value, prior.priority || '');
            });
            this._inlineStyleCache.delete(target);
            this._inlineStyleElements.delete(target);
        };
        if (el) restoreAll(el);
        else {
            this._inlineStyleElements.forEach((target) => restoreAll(target));
            this._inlineStyleElements.clear();
        }
    },
    hideElement: function (el) {
        if (!el) return;
        el.classList.add('ft-hidden');
    },
    showElement: function (el) {
        if (!el) return;
        el.classList.remove('ft-hidden');
    },
    clearHiddenElements: function () {
        document.querySelectorAll('.ft-hidden').forEach((el) => {
            el.classList.remove('ft-hidden');
        });
    },
    clearBodyClasses: function () {
        if (document.body) {
            [...document.body.classList].forEach((cls) => {
                if (cls === 'focus-mode-active' || cls.startsWith('ft-')) {
                    document.body.classList.remove(cls);
                }
            });
        }
        if (document.documentElement) {
            [...document.documentElement.classList].forEach((cls) => {
                if (cls.startsWith('ft-')) {
                    document.documentElement.classList.remove(cls);
                }
            });
        }
    },
    disableExtension: function () {
        this.unlockVideo();
        this.clearIntervals();
        this.disconnectObservers();
        this.clearInjectedStyles();
        this.clearInjectedElements();
        this.restoreInlineStyles();
        this.clearHiddenElements();
        this.clearBodyClasses();
        this.clearSession();
        sessionStorage.removeItem('ft_kicked');
        if (typeof UI !== 'undefined') UI.remove();
        this._disableHandlers.forEach((handler) => {
            try { handler(); } catch (e) { }
        });
        chrome.storage.local.remove(['ft_timer_end', 'ft_timer_type'], () => {
            if (chrome.runtime.lastError) { }
        });
    },
    enableExtension: function () {
        this._enableHandlers.forEach((handler) => {
            try { handler(); } catch (e) { }
        });
        this.ensureBody(() => {
            if (!this.isExtensionEnabled()) return;
            this.toggleFocusClass(CONFIG.isFocusMode);
            this.applyVisualHidingClasses();
        });
    },
    debugLog: function (platform, payload) {
        if (!this._debugEnabled) return;
        const key = platform + JSON.stringify(payload);
        if (this._lastDebugState[platform] === key) return;
        this._lastDebugState[platform] = key;
    },
    ensureBody: function (callback) {
        if (document.body) {
            callback();
            return;
        }
        const observer = new MutationObserver((mutations, obs) => {
            if (document.body) {
                obs.disconnect();
                callback();
            }
        });
        observer.observe(document.documentElement, { childList: true });
    },
    setSafeInterval: function (callback, ms) {
        const id = setInterval(() => {
            if (!chrome.runtime?.id) { clearInterval(id); return; }
            callback();
        }, ms);
        this.intervals.push(id);
        return id;
    },
    isSessionAllowed: function (platform) {
        return CONFIG.session.allowUntil && CONFIG.session.allowUntil > Date.now() && CONFIG.session.platform === platform;
    },
    clearSession: function () {
        CONFIG.session.allowUntil = 0;
        CONFIG.session.platform = null;
        chrome.storage.local.set({ session: CONFIG.session });
    },
    setAllowWindow: function (platform, minutes = 5) {
        CONFIG.session.allowUntil = Date.now() + (minutes * 60 * 1000);
        CONFIG.session.platform = platform;
        chrome.storage.local.set({ session: CONFIG.session });
    },
    logStat: function (key) {
        if (window !== window.top) return;
        if (key) {
            if (!this._statKeys) this._statKeys = {};
            if (this._statKeys[key]) return;
            this._statKeys[key] = true;
        } else {
            const now = Date.now();
            if (this._lastLog && (now - this._lastLog < 2000)) return;
            this._lastLog = now;
        }
        try {
            chrome.runtime.sendMessage({ action: 'incrementStat', amount: 1 }, () => {
                if (chrome.runtime.lastError) { }
            });
        } catch (e) { }
    },
    clearStatKeys: function () {
        this._statKeys = null;
    },
    applyVisualHidingClasses: function () {
        if (!document.body) return;
        if (!this.isExtensionEnabled()) {
            this.clearBodyClasses();
            return;
        }
        const active = FocusState.shouldBlock;
        const allowYt = this.shouldApplyVisualHiding('yt');
        const allowIg = this.shouldApplyVisualHiding('ig');
        const allowFb = this.shouldApplyVisualHiding('fb');
        const allowLi = this.shouldApplyVisualHiding('li');
        document.body.classList.toggle('ft-hide-ig-stories', active && allowIg && CONFIG.visualHiding.igStories);
        document.body.classList.toggle('ft-hide-ig-reels-feed', active && allowIg && CONFIG.visualHiding.igFeedReels);
        document.body.classList.toggle('ft-hide-fb-stories', active && allowFb && CONFIG.visualHiding.fbStories);
        document.body.classList.toggle('ft-hide-yt-shorts-nav', active && allowYt && CONFIG.visualHiding.ytShortsNav);
        document.body.classList.toggle('ft-hide-yt-shorts-shelves', active && allowYt && CONFIG.visualHiding.ytShortsShelves);
        document.body.classList.toggle('ft-hide-ig-reels-nav', active && allowIg && CONFIG.visualHiding.igReelsNav);
        document.body.classList.toggle('ft-hide-fb-reels-nav', active && allowFb && CONFIG.visualHiding.fbReelsNav);
        document.body.classList.toggle('ft-hide-li-feed', active && allowLi && CONFIG.visualHiding.liFeed);
        document.body.classList.toggle('ft-hide-li-addfeed', active && allowLi && CONFIG.visualHiding.liAddFeed);
    },
    lockVideo: function () {
        if (this.videoLockInterval) clearInterval(this.videoLockInterval);
        const performLock = () => {
            if (!document.getElementById(UI.overlayId)) { Utils.unlockVideo(); return; }
            document.querySelectorAll('video, audio').forEach(el => {
                if (!this._mediaState.has(el)) {
                    this._mediaState.set(el, {
                        volume: el.volume,
                        muted: el.muted,
                        paused: el.paused,
                        currentTime: el.currentTime
                    });
                    this._mediaElements.add(el);
                }
                if (!el.paused || el.volume > 0 || !el.muted) {
                    el.pause();
                    el.muted = true;
                    el.volume = 0;
                    el.currentTime = 0;
                }
            });
        };
        performLock();
        this.videoLockInterval = setInterval(performLock, 350);
    },
    unlockVideo: function () {
        if (this.videoLockInterval) {
            clearInterval(this.videoLockInterval);
            this.videoLockInterval = null;
        }
        if (!this._mediaElements.size) return;
        this._mediaElements.forEach((el) => {
            const state = this._mediaState.get(el);
            if (!state) return;
            el.muted = state.muted;
            if (typeof state.volume === 'number') el.volume = state.volume;
            if (typeof state.currentTime === 'number') {
                try { el.currentTime = state.currentTime; } catch (e) { }
            }
            if (!state.paused) {
                const playPromise = el.play();
                if (playPromise && playPromise.catch) playPromise.catch(() => { });
            }
            this._mediaState.delete(el);
        });
        this._mediaElements.clear();
    },
    playBeep: function () {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine'; osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.6);
            osc.onended = () => {
                try { if (ctx && ctx.close) ctx.close(); } catch (e) { }
            };
            osc.start(); osc.stop(ctx.currentTime + 0.6);
        } catch (e) { }
    },
    toggleFocusClass: function (isActive) {
        if (!document.body) return;
        if (!this.isExtensionEnabled()) {
            document.body.classList.remove('focus-mode-active');
            return;
        }
        if (isActive) document.body.classList.add('focus-mode-active');
        else document.body.classList.remove('focus-mode-active');
    }
};
const UI = {
    overlayId: 'focus-tube-warning-overlay',
    persistenceObserver: null,
    videoLockInterval: null,
    isOverlayNeeded: false,
    create: function (type, platform, onAllow, onBack) {
        if (!Utils.isExtensionEnabled()) return;
        if (document.getElementById(this.overlayId)) {
            this.updateTheme();
            if (!this.persistenceObserver) this.startPersistence(type, platform, onAllow, onBack);
            return;
        }
        this.isOverlayNeeded = true;
        this.startPersistence(type, platform, onAllow, onBack);
        Utils.logStat('overlay:' + platform);
        const overlay = document.createElement('div');
        overlay.id = this.overlayId;
        overlay.className = 'focus-tube-warning';
        if (CONFIG.isDarkMode) overlay.classList.add('dark');
        overlay.style.cssText = "position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(0,0,0,0.96) !important; display: flex !important; justify-content: center !important; align-items: center !important; z-index: 2147483647 !important; isolation: isolate !important;";
        const target = document.body || document.documentElement;
        const card = document.createElement('div'); card.className = 'focus-tube-card';
        const img = document.createElement('img'); img.src = chrome.runtime.getURL('icons/icon128.png'); img.className = 'focus-tube-icon-img';
        let headerText = type === 'strict' ? 'Strict Mode Active' : 'Distraction Blocked';
        let bodyText = 'FocusTube is keeping you productive.';
        const h1 = document.createElement('h1'); h1.textContent = headerText;
        const p = document.createElement('p'); p.textContent = bodyText;
        const btnGroup = document.createElement('div'); btnGroup.className = 'focus-tube-btn-group';
        const backBtn = document.createElement('button');
        backBtn.className = 'focus-tube-btn focus-tube-btn-primary';
        backBtn.textContent = 'Go Back';
        backBtn.onclick = onBack;
        btnGroup.appendChild(backBtn);
        if (type === 'warn') {
            const watchBtn = document.createElement('button');
            watchBtn.className = 'focus-tube-btn focus-tube-btn-secondary';
            watchBtn.textContent = 'Watch Anyway';
            watchBtn.style.opacity = '0.5';
            watchBtn.style.cursor = 'not-allowed';
            watchBtn.disabled = true;
            setTimeout(() => {
                if (watchBtn) {
                    watchBtn.style.opacity = '1';
                    watchBtn.style.cursor = 'pointer';
                    watchBtn.disabled = false;
                }
            }, 3000);
            watchBtn.onclick = () => {
                if (watchBtn.disabled) return;
                this.remove();
                CONFIG.session.allowUntil = Date.now() + (5 * 60 * 1000);
                CONFIG.session.platform = platform;
                onAllow();
            };
            btnGroup.appendChild(watchBtn);
        }
        if (Site.isTT()) {
            const msgBtn = document.createElement('button');
            msgBtn.className = 'focus-tube-btn focus-tube-btn-secondary';
            msgBtn.textContent = 'Go to Messages';
            msgBtn.onclick = () => { if (Site.isTT()) window.location.href = "https://www.tiktok.com/messages"; };
            btnGroup.appendChild(msgBtn);
        }
        card.append(img, h1, p, btnGroup);
        overlay.appendChild(card);
        target.appendChild(overlay);
        if (!Site.isIG() && document.body) {
            document.body.classList.add('ft-scroll-lock');
            document.documentElement.classList.add('ft-scroll-lock');
        }
    },
    startPersistence: function (type, platform, onAllow, onBack) {
        if (this.persistenceObserver) this.persistenceObserver.disconnect();
        const target = document.body || document.documentElement;
        this.persistenceObserver = new MutationObserver((mutations) => {
            if (!this.isOverlayNeeded) {
                this.persistenceObserver.disconnect();
                this.persistenceObserver = null;
                return;
            }
            let removed = false;
            for (const mutation of mutations) {
                if (mutation.removedNodes.length) {
                    for (const node of mutation.removedNodes) {
                        if (node.id === this.overlayId || (node.querySelector && node.querySelector(`#${this.overlayId}`))) {
                            removed = true;
                            break;
                        }
                    }
                }
            }
            if (removed || !document.getElementById(this.overlayId)) {
                if (Utils.isExtensionEnabled()) {
                    this.create(type, platform, onAllow, onBack);
                }
            }
        });
        this.persistenceObserver.observe(target, { childList: true });
        if (this.videoLockInterval) clearInterval(this.videoLockInterval);
        if (Site.isTT() || Site.isFB() || type === 'warn') {
            Utils.lockVideo();
            this.videoLockInterval = setInterval(() => {
                if (!this.isOverlayNeeded) { clearInterval(this.videoLockInterval); return; }
                Utils.lockVideo();
            }, 500);
        }
    },
    remove: function () {
        if (this.persistenceObserver) {
            this.persistenceObserver.disconnect();
            this.persistenceObserver = null;
        }
        if (this.videoLockInterval) {
            clearInterval(this.videoLockInterval);
            this.videoLockInterval = null;
        }
        this.isOverlayNeeded = false;
        const overlay = document.getElementById(this.overlayId);
        if (overlay) overlay.remove();
        if (document.body) {
            document.body.classList.remove('ft-scroll-lock');
        }
        if (document.documentElement) document.documentElement.classList.remove('ft-scroll-lock');
        Utils.unlockVideo();
        Utils.clearStatKeys();
    },
    updateTheme: function () {
        const el = document.getElementById(this.overlayId);
        if (el) {
            if (CONFIG.isDarkMode) el.classList.add('dark');
            else el.classList.remove('dark');
        }
    },
    showToast: function (title, msg) {
        if (!document.body) return;
        const exist = document.getElementById('ft-toast'); if (exist) exist.remove();
        const toast = document.createElement('div'); toast.id = 'ft-toast';
        toast.style.cssText = `position: fixed; top: 24px; right: 24px; background: #1f1f1f; color: #fff; padding: 16px 24px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.4); z-index: 2147483647; font-family: sans-serif; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 15px; opacity: 0; transform: translateY(-20px); transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); min-width: 300px;`;
        toast.innerHTML = `<img src="${chrome.runtime.getURL("icons/icon128.png")}" style="width:32px;height:32px;border-radius:8px;"><div><div style="font-weight:700;font-size:15px;margin-bottom:4px;color:#fff;">${title}</div><div style="font-size:13px;color:#aaa;line-height:1.4;">${msg}</div></div>`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-20px)'; setTimeout(() => toast.remove(), 400); }, 5000);
    },
    showKickNotification: function () {
        const n = document.createElement('div');
        n.style.cssText = `
            position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%) translateY(20px); 
            background: rgba(20, 20, 20, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            color: #fff; padding: 14px 24px; border-radius: 50px; z-index: 2147483647; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 12px; 
            box-shadow: 0 10px 40px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1); 
            opacity: 0; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        `;
        n.innerHTML = `<img src="${chrome.runtime.getURL("icons/icon128.png")}" style="width:24px;height:24px;border-radius:6px;">Strict Mode prevented access.`;
        document.documentElement.appendChild(n);
        requestAnimationFrame(() => { n.style.opacity = '1'; n.style.transform = 'translateX(-50%) translateY(0)'; });
        setTimeout(() => {
            n.style.opacity = '0'; n.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => n.remove(), 400);
        }, 4000);
    }
};
(function () {
    chrome.storage.local.get(['ft_enabled', 'focusMode', 'platformSettings', 'darkMode', 'ft_timer_end', 'ft_timer_type', 'playSound', 'popup_visible_yt', 'popup_visible_ig', 'popup_visible_tt', 'popup_visible_fb', 'popup_visible_li', 'restrictHiddenPlatforms', 'visualHideHiddenPlatforms', 'hide_ig_stories', 'hide_ig_feed_reels', 'hide_fb_stories', 'hide_yt_shorts_nav', 'hide_yt_shorts_shelves', 'hide_ig_reels_nav', 'hide_fb_reels_nav', 'hide_li_feed', 'hide_li_addfeed', 'ft_debug', 'session'], (res) => {
        if (chrome.runtime.lastError) return;
        CONFIG.extensionEnabled = res.ft_enabled !== false;
        CONFIG.isFocusMode = res.focusMode !== false;
        if (res.platformSettings) {
            CONFIG.platformSettings = res.platformSettings;
            if (res.restrictHiddenPlatforms === false) {
                if (res.popup_visible_yt === false) CONFIG.platformSettings.yt = 'allow';
                if (res.popup_visible_ig === false) CONFIG.platformSettings.ig = 'allow';
                if (res.popup_visible_tt === false) CONFIG.platformSettings.tt = 'allow';
                if (res.popup_visible_fb === false) CONFIG.platformSettings.fb = 'allow';
                if (res.popup_visible_li === false) CONFIG.platformSettings.li = 'allow';
            }
        }
        CONFIG.isDarkMode = res.darkMode !== false;
        CONFIG.playSound = res.playSound !== false;
        CONFIG.timer.end = res.ft_timer_end;
        CONFIG.timer.type = res.ft_timer_type;
        CONFIG.restrictHidden = res.restrictHiddenPlatforms !== false;
        CONFIG.visualHideHidden = res.visualHideHiddenPlatforms !== false;
        CONFIG.popupVisibility = {
            yt: res.popup_visible_yt !== false,
            ig: res.popup_visible_ig !== false,
            tt: res.popup_visible_tt !== false,
            fb: res.popup_visible_fb !== false,
            li: res.popup_visible_li !== false
        };
        CONFIG.visualHiding = {
            igStories: res.hide_ig_stories !== false,
            igFeedReels: res.hide_ig_feed_reels !== false,
            fbStories: res.hide_fb_stories !== false,
            ytShortsNav: res.hide_yt_shorts_nav !== false,
            ytShortsShelves: res.hide_yt_shorts_shelves !== false,
            igReelsNav: res.hide_ig_reels_nav !== false,
            fbReelsNav: res.hide_fb_reels_nav !== false,
            liFeed: res.hide_li_feed !== false,
            liAddFeed: res.hide_li_addfeed !== false
        };
        if (res.session) {
            CONFIG.session = res.session;
        }
        Utils._debugEnabled = res.ft_debug === true;
        Utils.ensureBody(() => {
            if (!Utils.isExtensionEnabled()) {
                Utils.disableExtension();
                return;
            }
            Utils.toggleFocusClass(CONFIG.isFocusMode);
            Utils.applyVisualHidingClasses();
        });
        window.__ftSettingsReady = true;
        document.dispatchEvent(new CustomEvent('ft-settings-ready'));
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && CONFIG.session.allowUntil && CONFIG.session.allowUntil > Date.now()) { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.ft_enabled) {
            CONFIG.extensionEnabled = changes.ft_enabled.newValue !== false;
            if (!CONFIG.extensionEnabled) Utils.disableExtension();
            else Utils.enableExtension();
        }
        if (changes.focusMode) { CONFIG.isFocusMode = changes.focusMode.newValue; Utils.toggleFocusClass(CONFIG.isFocusMode); Utils.applyVisualHidingClasses(); }
        if (changes.platformSettings) {
            CONFIG.platformSettings = changes.platformSettings.newValue;
            chrome.storage.local.get(['popup_visible_yt', 'popup_visible_ig', 'popup_visible_tt', 'popup_visible_fb', 'popup_visible_li', 'restrictHiddenPlatforms'], (res) => {
                if (res.restrictHiddenPlatforms === false) {
                    if (res.popup_visible_yt === false) CONFIG.platformSettings.yt = 'allow';
                    if (res.popup_visible_ig === false) CONFIG.platformSettings.ig = 'allow';
                    if (res.popup_visible_tt === false) CONFIG.platformSettings.tt = 'allow';
                    if (res.popup_visible_fb === false) CONFIG.platformSettings.fb = 'allow';
                    if (res.popup_visible_li === false) CONFIG.platformSettings.li = 'allow';
                }
                if (Site.isYT() && CONFIG.platformSettings.yt === 'strict') { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
                if (Site.isIG() && CONFIG.platformSettings.ig === 'strict') { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
                if (Site.isTT() && CONFIG.platformSettings.tt === 'strict') { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
                if (Site.isFB() && CONFIG.platformSettings.fb === 'strict') { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
            });
        }
        if (changes.restrictHiddenPlatforms) CONFIG.restrictHidden = changes.restrictHiddenPlatforms.newValue !== false;
        if (changes.visualHideHiddenPlatforms) CONFIG.visualHideHidden = changes.visualHideHiddenPlatforms.newValue !== false;
        if (changes.popup_visible_yt) CONFIG.popupVisibility.yt = changes.popup_visible_yt.newValue !== false;
        if (changes.popup_visible_ig) CONFIG.popupVisibility.ig = changes.popup_visible_ig.newValue !== false;
        if (changes.popup_visible_tt) CONFIG.popupVisibility.tt = changes.popup_visible_tt.newValue !== false;
        if (changes.popup_visible_fb) CONFIG.popupVisibility.fb = changes.popup_visible_fb.newValue !== false;
        if (changes.popup_visible_li) CONFIG.popupVisibility.li = changes.popup_visible_li.newValue !== false;
        if (changes.restrictHiddenPlatforms || changes.visualHideHiddenPlatforms || changes.popup_visible_yt || changes.popup_visible_ig || changes.popup_visible_tt || changes.popup_visible_fb || changes.popup_visible_li) {
            if (CONFIG.restrictHidden === false) {
                if (CONFIG.popupVisibility.yt === false && CONFIG.platformSettings) CONFIG.platformSettings.yt = 'allow';
                if (CONFIG.popupVisibility.ig === false && CONFIG.platformSettings) CONFIG.platformSettings.ig = 'allow';
                if (CONFIG.popupVisibility.tt === false && CONFIG.platformSettings) CONFIG.platformSettings.tt = 'allow';
                if (CONFIG.popupVisibility.fb === false && CONFIG.platformSettings) CONFIG.platformSettings.fb = 'allow';
                if (CONFIG.popupVisibility.li === false && CONFIG.platformSettings) CONFIG.platformSettings.li = 'allow';
            }
            chrome.storage.local.get(['platformSettings', 'popup_visible_yt', 'popup_visible_ig', 'popup_visible_tt', 'popup_visible_fb', 'popup_visible_li', 'restrictHiddenPlatforms', 'visualHideHiddenPlatforms'], (res) => {
                if (res.platformSettings) {
                    CONFIG.platformSettings = res.platformSettings;
                    if (res.restrictHiddenPlatforms === false) {
                        if (res.popup_visible_yt === false) CONFIG.platformSettings.yt = 'allow';
                        if (res.popup_visible_ig === false) CONFIG.platformSettings.ig = 'allow';
                        if (res.popup_visible_tt === false) CONFIG.platformSettings.tt = 'allow';
                        if (res.popup_visible_fb === false) CONFIG.platformSettings.fb = 'allow';
                        if (res.popup_visible_li === false) CONFIG.platformSettings.li = 'allow';
                    }
                }
            });
            Utils.applyVisualHidingClasses();
        }
        if (changes.hide_ig_stories) { CONFIG.visualHiding.igStories = changes.hide_ig_stories.newValue !== false; Utils.applyVisualHidingClasses(); }
        if (changes.hide_ig_feed_reels) { CONFIG.visualHiding.igFeedReels = changes.hide_ig_feed_reels.newValue !== false; Utils.applyVisualHidingClasses(); }
        if (changes.hide_fb_stories) { CONFIG.visualHiding.fbStories = changes.hide_fb_stories.newValue !== false; Utils.applyVisualHidingClasses(); }
        if (changes.hide_yt_shorts_nav) { CONFIG.visualHiding.ytShortsNav = changes.hide_yt_shorts_nav.newValue !== false; Utils.applyVisualHidingClasses(); }
        if (changes.hide_yt_shorts_shelves) { CONFIG.visualHiding.ytShortsShelves = changes.hide_yt_shorts_shelves.newValue !== false; Utils.applyVisualHidingClasses(); }
        if (changes.hide_ig_reels_nav) { CONFIG.visualHiding.igReelsNav = changes.hide_ig_reels_nav.newValue !== false; Utils.applyVisualHidingClasses(); }
        if (changes.hide_fb_reels_nav) { CONFIG.visualHiding.fbReelsNav = changes.hide_fb_reels_nav.newValue !== false; Utils.applyVisualHidingClasses(); }
        if (changes.hide_li_feed) { CONFIG.visualHiding.liFeed = changes.hide_li_feed.newValue !== false; Utils.applyVisualHidingClasses(); }
        if (changes.hide_li_addfeed) { CONFIG.visualHiding.liAddFeed = changes.hide_li_addfeed.newValue !== false; Utils.applyVisualHidingClasses(); }
        if (changes.darkMode) { CONFIG.isDarkMode = changes.darkMode.newValue; UI.updateTheme(); }
        if (changes.playSound) CONFIG.playSound = changes.playSound.newValue;
        if (changes.ft_timer_end) CONFIG.timer.end = changes.ft_timer_end.newValue;
        if (changes.ft_timer_type) CONFIG.timer.type = changes.ft_timer_type.newValue;
        if (changes.ft_timer_end || changes.ft_timer_type) Utils.applyVisualHidingClasses();
        if (changes.ft_debug) {
            Utils._debugEnabled = changes.ft_debug.newValue === true;
        }
        if (changes.session) { CONFIG.session = changes.session.newValue || { allowedCount: 0, allowUntil: 0, platform: null }; }
        document.dispatchEvent(new CustomEvent('ft-settings-changed', { detail: Object.keys(changes) }));
    });
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === "TIMER_COMPLETE") {
            if (!sender.tab && msg.target !== 'content') return;
            try {
                if (!sender.tab) {
                    if (CONFIG.playSound) Utils.playBeep();
                } else {
                    if (CONFIG.playSound) Utils.playBeep();
                    if (msg.type === "work") {
                        const duration = msg.breakDuration || 5;
                        UI.showToast("Focus Session Complete! 🎉", `Great job! Take a ${duration}-minute break.`);
                    }
                    else UI.showToast("Break Over! ⏰", "Time to get back to work.");
                }
            } catch (e) { }
            sendResponse({ status: 'received' });
        }
    });
})();
