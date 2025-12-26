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
        if (document.body) document.body.classList.remove('ft-scroll-lock');
        document.documentElement.classList.remove('ft-scroll-lock');
        if (document.body) document.body.style.overflow = '';
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

(function () {
    chrome.storage.local.get(['focusMode', 'platformSettings', 'darkMode', 'ft_timer_end', 'ft_timer_type'], (res) => {
        if (chrome.runtime.lastError) return;
        CONFIG.isFocusMode = res.focusMode !== false;
        if (res.platformSettings) CONFIG.platformSettings = res.platformSettings;
        CONFIG.isDarkMode = res.darkMode !== false;
        CONFIG.timer.end = res.ft_timer_end;
        CONFIG.timer.type = res.ft_timer_type;

        // Broadcast that settings are ready
        document.dispatchEvent(new CustomEvent('ft-settings-ready'));
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


    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === "TIMER_COMPLETE") {
            sendResponse({ status: 'received' });
            Utils.playBeep();
            if (msg.type === "work") UI.showToast("Focus Session Complete! 🎉", "Great job! Take a 5-minute break.");
            else UI.showToast("Break Over! ⏰", "Time to get back to work.");
        }
    });
})();
