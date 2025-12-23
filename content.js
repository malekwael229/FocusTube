const Site = {
    isYT: () => location.hostname.includes('youtube.com'),
    isIG: () => location.hostname.includes('instagram.com'),
    isTT: () => location.hostname.includes('tiktok.com'),
    isFB: () => location.hostname.includes('facebook.com')
};

const CONFIG = {
    isFocusMode: true,
    platformSettings: { yt: 'strict', ig: 'strict', tt: 'strict', fb: 'strict' },
    isDarkMode: true,
    timer: { end: null, type: 'work' },
    session: {
        allowedCount: 0,

        allowUntil: 0,
        platform: null
    }
};

const Utils = {
    intervals: [],
    videoLockInterval: null,

    setSafeInterval: function (callback, ms) {
        const id = setInterval(() => {
            if (!chrome.runtime?.id) {
                clearInterval(id);
                return;
            }
            callback();
        }, ms);
        this.intervals.push(id);
        return id;
    },

    getTimerState: function () {
        const now = Date.now();
        const isActive = CONFIG.timer.end && CONFIG.timer.end > now;
        return {
            isWork: isActive && CONFIG.timer.type === 'work',
            isBreak: isActive && CONFIG.timer.type === 'break'
        };
    },

    logStat: function () {
        if (window !== window.top) return;

        const now = Date.now();
        if (this._lastLog && (now - this._lastLog < 2000)) return;
        this._lastLog = now;

        chrome.storage.local.get(['ft_stats_blocked'], (res) => {
            const newCount = (res.ft_stats_blocked || 0) + 1;
            chrome.storage.local.set({ ft_stats_blocked: newCount });
        });
    },

    lockVideo: function () {
        if (this.videoLockInterval) clearInterval(this.videoLockInterval);
        const performLock = () => {
            if (!document.getElementById(UI.overlayId)) {
                Utils.unlockVideo();
                return;
            }
            let found = false;
            document.querySelectorAll('video, audio').forEach(el => {
                found = true;
                if (!el.paused || el.volume > 0 || !el.muted) {
                    el.pause(); el.muted = true; el.volume = 0; el.currentTime = 0;
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
            document.querySelectorAll('video, audio').forEach(el => {
                el.volume = 1;
                if (Site.isIG()) el.play().catch(() => { });
            });
        }
    },

    checkForUpdates: function () {
        const localVersion = chrome.runtime.getManifest().version;
        if (this._updateChecked) return;

        chrome.storage.local.get(['ft_latest_version'], (res) => {
            if (res.ft_latest_version && res.ft_latest_version !== localVersion && !document.getElementById('ft-update-notification')) {
                this._updateChecked = true;
                this.showUpdateNotification(res.ft_latest_version);
            }
        });
    },

    showUpdateNotification: function (newVersion) {
        if (!document.body) return;
        const n = document.createElement('div');
        n.id = 'ft-update-notification';
        n.style.cssText = `position: fixed; bottom: 20px; right: 20px; background: linear-gradient(135deg, #2b86c5, #0d9488); color: white; padding: 16px 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); z-index: 2147483647; font-family: sans-serif; display: flex; align-items: center; gap: 15px; animation: ftFadeIn 0.5s ease; border: 1px solid rgba(255,255,255,0.2); max-width: 320px;`;

        const contentDiv = document.createElement('div');
        const titleDiv = document.createElement('div');
        titleDiv.style.cssText = "font-weight:bold; font-size:14px; margin-bottom:4px";
        titleDiv.textContent = "FocusTube Update Available";
        const msgDiv = document.createElement('div');
        msgDiv.style.cssText = "font-size:12px; opacity:0.9";
        msgDiv.textContent = `Version ${newVersion} is ready.`;
        contentDiv.appendChild(titleDiv);
        contentDiv.appendChild(msgDiv);

        const link = document.createElement('a');
        link.href = "https://github.com/malekwael229/FocusTube";
        link.target = "_blank";
        link.style.cssText = "background:white; color:#2b86c5; padding:6px 14px; border-radius:20px; text-decoration:none; font-size:12px; font-weight:600; white-space:nowrap;";
        link.textContent = "View";

        const closeBtn = document.createElement('button');
        closeBtn.onclick = () => n.remove();
        closeBtn.style.cssText = "background:none; border:none; color:white; cursor:pointer; font-size:20px;";
        closeBtn.textContent = "×";

        n.appendChild(contentDiv);
        n.appendChild(link);
        n.appendChild(closeBtn);

        if (document.body) document.body.appendChild(n);
        else document.documentElement.appendChild(n);
        setTimeout(() => { if (n.parentElement) n.remove(); }, 15000);
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
            osc.start(); osc.stop(ctx.currentTime + 0.6);
        } catch (e) { }
    }
};

const UI = {
    overlayId: 'focus-tube-warning-overlay',
    persistenceInterval: null,
    isOverlayNeeded: false,

    create: function (type, platform, onAllow, onBack) {
        if (document.getElementById(this.overlayId)) {
            this.updateTheme();
            if (!this.persistenceInterval) this.startPersistence(type, platform, onAllow, onBack);
            return;
        }

        this.isOverlayNeeded = true;
        this.startPersistence(type, platform, onAllow, onBack);

        // Log stat only when creating a new overlay
        Utils.logStat();

        const overlay = document.createElement('div');
        overlay.id = this.overlayId;
        overlay.className = 'focus-tube-warning';
        if (CONFIG.isDarkMode) overlay.classList.add('dark');
        overlay.style.cssText = "position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(0,0,0,0.96) !important; display: flex !important; justify-content: center !important; align-items: center !important; z-index: 2147483647 !important; isolation: isolate !important;";

        if (!document.body && !document.documentElement) return;
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
            watchBtn.onclick = () => {
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
        if (this.persistenceInterval) clearInterval(this.persistenceInterval);
        this.persistenceInterval = setInterval(() => {
            if (!this.isOverlayNeeded) { clearInterval(this.persistenceInterval); return; }
            if (!document.getElementById(this.overlayId)) this.create(type, platform, onAllow, onBack);
            if (Site.isTT() || Site.isFB() || type === 'warn') Utils.lockVideo();
        }, 500);
    },

    remove: function () {
        if (this.persistenceInterval) clearInterval(this.persistenceInterval);
        this.isOverlayNeeded = false;
        const overlay = document.getElementById(this.overlayId);
        if (overlay) overlay.remove();
        document.body.classList.remove('ft-scroll-lock');
        document.documentElement.classList.remove('ft-scroll-lock');
        document.body.style.overflow = '';
        Utils.unlockVideo();
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
            position: fixed; 
            bottom: 32px; 
            left: 50%; 
            transform: translateX(-50%) translateY(20px); 
            background: rgba(20, 20, 20, 0.85); 
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            color: #fff; 
            padding: 14px 24px; 
            border-radius: 50px; 
            z-index: 2147483647; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            font-size: 15px; 
            font-weight: 600; 
            display: flex; 
            align-items: center; 
            gap: 12px; 
            box-shadow: 0 10px 40px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1); 
            opacity: 0;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        `;
        n.innerHTML = `<img src="${chrome.runtime.getURL("icons/icon128.png")}" style="width:24px;height:24px;border-radius:6px;">Strict Mode prevented access.`;
        document.documentElement.appendChild(n);

        requestAnimationFrame(() => {
            n.style.opacity = '1';
            n.style.transform = 'translateX(-50%) translateY(0)';
        });

        setTimeout(() => {
            n.style.opacity = '0';
            n.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => n.remove(), 400);
        }, 4000);
    }
};

const YouTube = {
    isRedirecting: false,
    observer: null,
    lastCheckTime: 0,
    currentMode: 'strict',

    init: function () {
        if (!document.body) { setTimeout(() => this.init(), 100); return; }
        this.isRedirecting = false;
        document.addEventListener('yt-navigate-finish', () => { this.isRedirecting = false; setTimeout(() => this.runChecks(), 300); });
        window.addEventListener('popstate', () => setTimeout(() => this.runChecks(), 300));
        this.observer = new MutationObserver(() => {
            if (Date.now() - this.lastCheckTime > 1000) { this.lastCheckTime = Date.now(); this.runChecks(); }
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.runChecks();
        setTimeout(() => this.checkKick(), 500);
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

    applyFocusMode: function () { if (document.body) document.body.classList.add('focus-mode-active'); },
    removeVisualFocus: function () { if (document.body) document.body.classList.remove('focus-mode-active'); },
    checkKick: function () {
        if (sessionStorage.getItem('ft_kicked')) { sessionStorage.removeItem('ft_kicked'); UI.showKickNotification(); }
    }
};

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
            this.initObserver();
            Utils.setSafeInterval(() => this.handleMutation(), 800);
        }
        this.rapidKick();
        this.handleMutation();
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

const TikTok = {
    currentMode: 'strict',
    run: function (isUpdate) {
        if (!isUpdate) { Utils.setSafeInterval(() => this.check(), 250); }
        this.check();
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

const Facebook = {
    currentMode: 'strict',
    observer: null,

    run: function (isUpdate) {
        if (!isUpdate) {
            this.initObserver();
            Utils.setSafeInterval(() => this.check(), 400);
        }
        this.check();
    },

    initObserver: function () {
        if (this.observer) return;
        this.observer = new MutationObserver(() => this.applyHiding());
        this.observer.observe(document, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['href', 'style', 'class', 'role', 'aria-label']
        });
    },

    check: function () {
        const path = window.location.pathname;
        const ts = Utils.getTimerState();
        const isStrict = CONFIG.platformSettings.fb === 'strict';
        const isWarn = CONFIG.platformSettings.fb === 'warn';

        if (CONFIG.platformSettings.fb === 'strict' && this.currentMode !== 'strict') {
            CONFIG.session.allowUntil = 0;
            CONFIG.session.platform = null;
        }
        this.currentMode = CONFIG.platformSettings.fb;

        const onReelsPath = path.startsWith('/reel/') || path.startsWith('/reels/');

        if (!CONFIG.isFocusMode && !ts.isWork) {
            this.applyHiding();
        }

        if (onReelsPath) {
            if (CONFIG.session.allowUntil && CONFIG.session.allowUntil > Date.now() && CONFIG.session.platform === 'fb') {
                if (isStrict) {
                    // If strict mode is now active but we had a session, we might want to kill it? 
                    // YT logic kills it. Let's stick to simple first.
                    // Actually, strict should override unless allows? No, strict is strict.
                    // But if 'warn' gave a pass, strict shouldn't just respect it? 
                    // Current YT logic: if strict, session is killed.
                } else {
                    UI.remove(); return;
                }
            }

            if (ts.isWork || isStrict) {
                // Strict
                UI.create('strict', 'fb', () => { }, () => window.location.href = 'https://www.facebook.com/');
                Utils.lockVideo();
                return;
            } else if (isWarn) {
                // Warn
                UI.create('warn', 'fb', () => {
                    CONFIG.session.allowUntil = Date.now() + (5 * 60 * 1000);
                    CONFIG.session.platform = 'fb';
                    UI.remove();
                    Utils.unlockVideo();
                }, () => window.location.href = 'https://www.facebook.com/');
                Utils.lockVideo();
                return;
            }
        }

        // No overlay if not on a reel page or allowed
        // If we are leaving the Reels page, clear the session so the warning appears again next time.
        if (CONFIG.session.platform === 'fb') {
            CONFIG.session.allowUntil = 0;
            CONFIG.session.platform = null;
        }
        UI.remove();
        this.applyHiding();
    },

    applyHiding: function () {
        const ts = Utils.getTimerState();
        const isFocusActive = (CONFIG.isFocusMode || ts.isWork);


        const selectors = [
            // top bar / nav reels buttons
            'a[aria-label="Reels"]',
            'a[href*="/reels/"]',
            'a[href*="/reel/"]',

            // sidebar/left nav reels
            '[role="navigation"] a[aria-label="Reels"]',

            // feed shelves / sections with "Reels"
            'div[aria-label="Reels"]',
            'span:has-text("Reels")' // Note: has-text is not valid CSS selector, handled manually below
        ];

        // Specific handling for Facebook Top Bar container avoidance (prevent blank space)
        // User provided container: <li class="...">...</li>
        const fbReelsLink = document.querySelector('a[aria-label="Reels"][href="/reel/?s=tab"]');
        if (fbReelsLink) {
            // Traverse up to the List Item to hide the whole tab slot
            const container = fbReelsLink.closest('li');
            if (container) {
                if (isFocusActive) container.style.setProperty('display', 'none', 'important');
                else container.style.removeProperty('display');
            }
        }

        selectors.forEach(sel => {
            if (sel.includes('has-text')) {
                // Manual check for "Reels" text (handles navigation buttons and feed shelves)
                const candidates = document.querySelectorAll('span, h3, div[role="button"] span');
                candidates.forEach(el => {
                    if (el.textContent === "Reels") {
                        // 1. Navigation Buttons (Sidebar/Top)
                        const btn = el.closest('div[role="button"]');
                        if (btn && isFocusActive) btn.style.setProperty('display', 'none', 'important');

                        // 2. Feed Reels Shelf
                        // Look for the header text "Reels" and traverse up to the main shelf container.
                        // The shelf usually has a specific structure. We can look for a common container class or role.
                        // User snippet shows "Reels" is in an h3 or span inside the shelf.
                        const shelfHeader = el.closest('div.x1n2onr6.x1ja2u2z'); // Common wrapper in shelf header
                        if (shelfHeader) {
                            // Traverse up to find the main card wrapper
                            // The user highlighted: <div class="html-div xdj266r ...">
                            // We'll traverse up a few levels to find the feed item container
                            let parent = shelfHeader.parentElement;
                            for (let i = 0; i < 8; i++) {
                                if (!parent) break;
                                // Check if this is the shelf wrapper (often has these hashed classes and shadows)
                                // Simple heuristic: It's a direct child of the feed list, or we just hide the card element.
                                // In user snippet, top div is "html-div xdj266r...".
                                if (parent.className.includes('html-div') && parent.className.includes('xz9dl7a') === false) { // avoiding false positives if possible
                                    if (isFocusActive) parent.style.setProperty('display', 'none', 'important');
                                    else parent.style.removeProperty('display');
                                    break;
                                }
                                parent = parent.parentElement;
                            }
                        }
                    }
                });
            } else {
                document.querySelectorAll(sel).forEach(el => {
                    if (isFocusActive) el.style.setProperty('display', 'none', 'important');
                    else el.style.removeProperty('display');
                });
            }
        });
    }
};

(function () {
    chrome.storage.local.get(['focusMode', 'platformSettings', 'darkMode', 'ft_timer_end', 'ft_timer_type'], (res) => {
        if (chrome.runtime.lastError) return;
        CONFIG.isFocusMode = res.focusMode !== false;
        if (res.platformSettings) CONFIG.platformSettings = res.platformSettings;
        CONFIG.isDarkMode = res.darkMode !== false;
        CONFIG.timer.end = res.ft_timer_end;
        CONFIG.timer.type = res.ft_timer_type;

        try {
            if (Site.isYT()) YouTube.init();
            else if (Site.isIG()) Instagram.run();
            else if (Site.isTT()) TikTok.run();
            else if (Site.isFB()) Facebook.run();
        } catch (e) {
            console.log("FocusTube Init Error:", e);
        }

        setTimeout(() => Utils.checkForUpdates(), 1000);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && CONFIG.session.allowUntil && CONFIG.session.allowUntil > Date.now()) { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.focusMode) CONFIG.isFocusMode = changes.focusMode.newValue;
        if (changes.platformSettings) {
            CONFIG.platformSettings = changes.platformSettings.newValue;
            if (Site.isYT() && changes.platformSettings.newValue.yt === 'strict') { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
            if (Site.isIG() && changes.platformSettings.newValue.ig === 'strict') { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
            if (Site.isTT() && changes.platformSettings.newValue.tt === 'strict') { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
            if (Site.isFB() && changes.platformSettings.newValue.fb === 'strict') { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
        }
        if (changes.darkMode) { CONFIG.isDarkMode = changes.darkMode.newValue; UI.updateTheme(); }
        if (changes.ft_timer_end) CONFIG.timer.end = changes.ft_timer_end.newValue;
        if (changes.ft_timer_type) CONFIG.timer.type = changes.ft_timer_type.newValue;

        if (Site.isYT()) YouTube.runChecks();
        else if (Site.isIG()) Instagram.handleMutation();
        else if (Site.isTT()) TikTok.check();
        else if (Site.isFB()) Facebook.check();
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === "TIMER_COMPLETE") {
            sendResponse({ status: 'received' });
            Utils.playBeep();
            if (msg.type === "work") UI.showToast("Focus Session Complete! 🎉", "Great job! Take a 5-minute break.");
            else UI.showToast("Break Over! ⏰", "Time to get back to work.");
        }

    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.ft_latest_version) {
            Utils.checkForUpdates();
        }
    });
})();
