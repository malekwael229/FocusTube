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
    playSound: true,
    timer: { end: null, type: 'work' },
    session: { allowedCount: 0, allowUntil: 0, platform: null },
    popupVisibility: { yt: true, ig: true, tt: true, fb: true },
    visualHideHidden: true,
    restrictHidden: true
};

const Utils = {
    intervals: [],
    videoLockInterval: null,

    ensureBody: function (callback) {
        if (document.body) {
            callback();
        } else {
            const observer = new MutationObserver(() => {
                if (document.body) {
                    observer.disconnect();
                    callback();
                }
            });
            observer.observe(document.documentElement, { childList: true });
        }
    },

    setSafeInterval: function (callback, ms) {
        const id = setInterval(() => {
            if (!chrome.runtime?.id) { clearInterval(id); return; }
            callback();
        }, ms);
        this.intervals.push(id);
        return id;
    },

    getTimerState: function () {
        const now = Date.now();
        const isActive = CONFIG.timer.end && CONFIG.timer.end > now;
        return { isWork: isActive && CONFIG.timer.type === 'work', isBreak: isActive && CONFIG.timer.type === 'break' };
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
            if (!document.getElementById(UI.overlayId)) { Utils.unlockVideo(); return; }
            document.querySelectorAll('video, audio').forEach(el => {
                if (!el.paused || el.volume > 0 || !el.muted) { el.pause(); el.muted = true; el.volume = 0; el.currentTime = 0; }
            });
        };
        performLock();
        this.videoLockInterval = setInterval(performLock, 350);
    },

    unlockVideo: function () {
        if (this.videoLockInterval) {
            clearInterval(this.videoLockInterval);
            this.videoLockInterval = null;
            document.querySelectorAll('video, audio').forEach(el => { el.volume = 1; if (Site.isIG()) el.play().catch(() => { }); });
        }
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
    },

    toggleFocusClass: function (isActive) {
        if (!document.body) return;
        if (isActive) document.body.classList.add('focus-mode-active');
        else document.body.classList.remove('focus-mode-active');
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
        Utils.logStat();

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
        if (document.body) {
            document.body.classList.remove('ft-scroll-lock');
            document.body.style.overflow = '';
        }
        if (document.documentElement) document.documentElement.classList.remove('ft-scroll-lock');
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
    chrome.storage.local.get(['focusMode', 'platformSettings', 'darkMode', 'ft_timer_end', 'ft_timer_type', 'playSound', 'popup_visible_yt', 'popup_visible_ig', 'popup_visible_tt', 'popup_visible_fb', 'restrictHiddenPlatforms', 'visualHideHiddenPlatforms'], (res) => {
        if (chrome.runtime.lastError) return;
        CONFIG.isFocusMode = res.focusMode !== false;
        if (res.platformSettings) {
            CONFIG.platformSettings = res.platformSettings;

            if (res.restrictHiddenPlatforms === false) {
                if (res.popup_visible_yt === false) CONFIG.platformSettings.yt = 'allow';
                if (res.popup_visible_ig === false) CONFIG.platformSettings.ig = 'allow';
                if (res.popup_visible_tt === false) CONFIG.platformSettings.tt = 'allow';
                if (res.popup_visible_fb === false) CONFIG.platformSettings.fb = 'allow';
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
            fb: res.popup_visible_fb !== false
        };

        document.dispatchEvent(new CustomEvent('ft-settings-ready'));
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && CONFIG.session.allowUntil && CONFIG.session.allowUntil > Date.now()) { CONFIG.session.allowUntil = 0; CONFIG.session.platform = null; }
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.focusMode) CONFIG.isFocusMode = changes.focusMode.newValue;
        if (changes.platformSettings) {
            CONFIG.platformSettings = changes.platformSettings.newValue;

            chrome.storage.local.get(['popup_visible_yt', 'popup_visible_ig', 'popup_visible_tt', 'popup_visible_fb', 'restrictHiddenPlatforms'], (res) => {
                if (res.restrictHiddenPlatforms === false) {
                    if (res.popup_visible_yt === false) CONFIG.platformSettings.yt = 'allow';
                    if (res.popup_visible_ig === false) CONFIG.platformSettings.ig = 'allow';
                    if (res.popup_visible_tt === false) CONFIG.platformSettings.tt = 'allow';
                    if (res.popup_visible_fb === false) CONFIG.platformSettings.fb = 'allow';
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

        if (changes.restrictHiddenPlatforms || changes.visualHideHiddenPlatforms || changes.popup_visible_yt || changes.popup_visible_ig || changes.popup_visible_tt || changes.popup_visible_fb) {

            if (CONFIG.restrictHidden === false) {
                if (CONFIG.popupVisibility.yt === false && CONFIG.platformSettings) CONFIG.platformSettings.yt = 'allow';
                if (CONFIG.popupVisibility.ig === false && CONFIG.platformSettings) CONFIG.platformSettings.ig = 'allow';
                if (CONFIG.popupVisibility.tt === false && CONFIG.platformSettings) CONFIG.platformSettings.tt = 'allow';
                if (CONFIG.popupVisibility.fb === false && CONFIG.platformSettings) CONFIG.platformSettings.fb = 'allow';
            }

            chrome.storage.local.get(['platformSettings', 'popup_visible_yt', 'popup_visible_ig', 'popup_visible_tt', 'popup_visible_fb', 'restrictHiddenPlatforms', 'visualHideHiddenPlatforms'], (res) => {
                if (res.platformSettings) {
                    CONFIG.platformSettings = res.platformSettings;
                    if (res.restrictHiddenPlatforms === false) {
                        if (res.popup_visible_yt === false) CONFIG.platformSettings.yt = 'allow';
                        if (res.popup_visible_ig === false) CONFIG.platformSettings.ig = 'allow';
                        if (res.popup_visible_tt === false) CONFIG.platformSettings.tt = 'allow';
                        if (res.popup_visible_fb === false) CONFIG.platformSettings.fb = 'allow';
                    }
                }
            });
        }
        if (changes.darkMode) { CONFIG.isDarkMode = changes.darkMode.newValue; UI.updateTheme(); }
        if (changes.playSound) CONFIG.playSound = changes.playSound.newValue;
        if (changes.ft_timer_end) CONFIG.timer.end = changes.ft_timer_end.newValue;
        if (changes.ft_timer_type) CONFIG.timer.type = changes.ft_timer_type.newValue;
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === "TIMER_COMPLETE") {
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
