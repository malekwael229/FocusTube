let isFocusModeOn = true;
let platformSettings = { yt: 'strict', ig: 'strict', tt: 'strict' };
let currentMode = 'strict';
let isDarkMode = true;
let currentAllowedId = null;
let timerEndTime = null;
let timerType = 'work';
let isVideoLocked = false;
let videoLockInterval = null;

let isTikTokSessionAllowed = false;

const SITE = {
    YT: window.location.hostname.includes('youtube.com'),
    IG: window.location.hostname.includes('instagram.com'),
    TT: window.location.hostname.includes('tiktok.com')
};

(function initialize() {
    chrome.storage.local.get(['focusMode', 'platformSettings', 'darkMode', 'ft_timer_end', 'ft_timer_type'], (result) => {
        isFocusModeOn = result.focusMode !== false;
        if (result.platformSettings) platformSettings = result.platformSettings;
        updateCurrentMode();
        isDarkMode = result.darkMode !== false; 
        timerEndTime = result.ft_timer_end || null;
        timerType = result.ft_timer_type || 'work';
        
        if (document.body) startApp();
        else document.addEventListener('DOMContentLoaded', startApp);
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.focusMode) isFocusModeOn = changes.focusMode.newValue;
        if (changes.platformSettings) {
            platformSettings = changes.platformSettings.newValue;
            updateCurrentMode();
        }
        if (changes.ft_timer_end) timerEndTime = changes.ft_timer_end.newValue;
        if (changes.ft_timer_type) timerType = changes.ft_timer_type.newValue;
        if (changes.darkMode) {
            isDarkMode = changes.darkMode.newValue;
            if (document.body) updateWarningTheme(); 
        }
        if (document.body) runChecks();
    });
    
    checkForUpdates();
})();

function updateCurrentMode() {
    if (SITE.YT) currentMode = platformSettings.yt || 'strict';
    else if (SITE.IG) currentMode = platformSettings.ig || 'strict';
    else if (SITE.TT) currentMode = platformSettings.tt || 'strict';
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function startApp() {
    if (!document.body) return;
    setTimeout(checkKickFlag, 200);
    runChecks();
    
    setInterval(runChecks, 800); 
    
    if (SITE.YT) {
        window.addEventListener('yt-navigate-finish', runChecks);
    }
    window.addEventListener('popstate', runChecks);
    
    const debouncedApply = debounce(() => {
        if (SITE.YT && window.location.href.includes('/feed/history')) return;
        const isTimerActive = timerEndTime && timerEndTime > Date.now() && timerType === 'work';
        if (isFocusModeOn || isTimerActive) applyFocusMode();
    }, 50);

    const mainObserver = new MutationObserver(debouncedApply);
    mainObserver.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('play', (e) => {
        if (isVideoLocked) { e.preventDefault(); e.stopPropagation(); e.target.pause(); e.target.muted = true; }
    }, true);
    window.addEventListener('timeupdate', (e) => {
        if (isVideoLocked && !e.target.paused) e.target.pause();
    }, true);
}

function runChecks() {
    if (!document.body) return;
    
    const currentUrl = window.location.href;
    const path = window.location.pathname;

    if (SITE.TT) {
        if (isTikTokSessionAllowed) {
            unlockVideo();
            removeWarning();
            if (isFocusModeOn) applyFocusMode(); 
            else removeVisualFocus();
            return;
        }

        if (path.startsWith('/upload') || 
            path.startsWith('/coin') || 
            path.startsWith('/setting') || 
            path.startsWith('/legal') || 
            path.startsWith('/business') ||
            path.startsWith('/messages')) {
            
            unlockVideo(); 
            removeWarning(); 
            return;
        }

        if (path.startsWith('/@') && 
            !path.includes('/video/') && 
            !path.includes('/photo/') && 
            !path.endsWith('/live')) { 
            
            unlockVideo(); 
            removeWarning(); 
            return;
        }

        let shouldBlockTT = false;

        if (path === '/' || 
            path.startsWith('/foryou') || 
            path.startsWith('/following') || 
            path.startsWith('/friends') || 
            path.startsWith('/explore') || 
            path.startsWith('/live') || 
            path.endsWith('/live') ||
            path.startsWith('/search') ||
            path.includes('/video/') || 
            path.includes('/photo/')) {
            
            shouldBlockTT = true;
        }

        if (shouldBlockTT) {
            const isTimerActive = timerEndTime && timerEndTime > Date.now() && timerType === 'work';
            const isBreakActive = timerEndTime && timerEndTime > Date.now() && timerType === 'break';

            if (isBreakActive) {
                unlockVideo(); removeWarning();
            } else if (isTimerActive) {
                handleBlocking(currentUrl, true);
            } else if (currentMode !== 'allow') {
                handleBlocking(currentUrl, false);
            } else {
                unlockVideo(); removeWarning();
            }
        } else {
            unlockVideo(); removeWarning();
        }
        return; 
    }

    if (SITE.YT && currentUrl.includes('/feed/history')) {
        removeVisualFocus(); unlockVideo(); removeWarning(); return; 
    }

    const isTimerActive = timerEndTime && timerEndTime > Date.now() && timerType === 'work';
    const isBreakActive = timerEndTime && timerEndTime > Date.now() && timerType === 'break';
    
    if (isTimerActive || (isFocusModeOn && !isBreakActive)) applyFocusMode();
    else removeVisualFocus();

    let shouldBlock = false;
    let contentId = currentUrl; 

    if (SITE.YT && currentUrl.includes('/shorts/')) {
        shouldBlock = true;
        contentId = currentUrl.split('/shorts/')[1]?.split('?')[0] || currentUrl;
    }
    
    if (SITE.IG && (currentUrl.includes('/reels/') || currentUrl.includes('/reel/') || currentUrl.includes('/explore/'))) {
        shouldBlock = true;
        const match = currentUrl.match(/\/reel\/([a-zA-Z0-9_-]+)/);
        if (match) contentId = match[1];
    }

    if (shouldBlock) {
        if (isBreakActive) { unlockVideo(); removeWarning(); }
        else if (isTimerActive) handleBlocking(contentId, true);
        else if (currentMode !== 'allow') handleBlocking(contentId, false);
        else { unlockVideo(); removeWarning(); }
    } else { 
        unlockVideo(); removeWarning(); 
    }
}

function handleBlocking(id, isForced) {
    if (!SITE.TT && id === currentAllowedId && !isForced) return;
    
    if (!SITE.TT && id !== currentAllowedId) {
        chrome.storage.local.get(['ft_stats_blocked'], (res) => {
            const newCount = (res.ft_stats_blocked || 0) + 1;
            chrome.storage.local.set({ ft_stats_blocked: newCount });
        });
        currentAllowedId = id;
    }

    const mode = isForced ? 'strict' : currentMode;

    if (mode === 'strict') {
        if (SITE.TT || SITE.IG) {
            showStrictOverlay();
        } else {
            sessionStorage.setItem('ft_kicked', 'true');
            window.location.replace("https://www.youtube.com");
        }
    } else if (mode === 'warn') {
        showWarning(id);
    }
}

function showStrictOverlay() {
    lockVideo();
    if (document.getElementById('focus-tube-warning-overlay')) { updateWarningTheme(); return; }
    
    const overlay = document.createElement('div');
    overlay.id = 'focus-tube-warning-overlay';
    overlay.className = 'focus-tube-warning';
    if (isDarkMode) overlay.classList.add('dark');
    
    let msgButtonHtml = '';
    if (SITE.IG || SITE.TT) {
        msgButtonHtml = `<button id="ft-messages-strict" class="focus-tube-btn focus-tube-btn-secondary">Go to Messages</button>`;
    }
    
    overlay.innerHTML = `
        <div class="focus-tube-card">
            <img src="${chrome.runtime.getURL('icons/icon128.png')}" class="focus-tube-icon-img">
            <h1>Strict Mode Active</h1>
            <p>FocusTube has blocked this content.</p>
            <div class="focus-tube-btn-group">
                <button id="ft-go-back" class="focus-tube-btn focus-tube-btn-primary">Go Back</button>
                ${msgButtonHtml}
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    document.getElementById('ft-go-back').addEventListener('click', () => { 
        if (window.history.length > 1) window.history.back();
        else window.location.href = "https://www.google.com";
    });

    if (document.getElementById('ft-messages-strict')) {
        document.getElementById('ft-messages-strict').addEventListener('click', () => {
            if (SITE.IG) window.location.href = "https://www.instagram.com/direct/inbox/";
            if (SITE.TT) window.location.href = "https://www.tiktok.com/messages";
        });
    }
}

function applyFocusMode() {
    if (!document.body) return;
    if (!document.body.classList.contains('focus-mode-active')) document.body.classList.add('focus-mode-active');
    
    let selectors = [];
    if (SITE.YT) {
        selectors = [ 
            "ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])", 
            "ytd-reel-shelf-renderer", 
            "ytd-guide-entry-renderer[title='Shorts']", 
            "ytd-mini-guide-entry-renderer[aria-label='Shorts']", 
            "yt-chip-cloud-chip-renderer a[href*='/shorts/']" 
        ];
    } else if (SITE.IG) {
        selectors = [ 
            "a[href*='/reels/']", 
            "a[href*='/reel/']", 
            "a[href='/explore/']", 
            "a[href*='reels_tab']", 
            "div[role='button']:has(svg[aria-label='Reels'])", 
            "div[role='button']:has(svg[aria-label='Explore'])"
        ];
    } 
    
    if (selectors.length > 0) document.querySelectorAll(selectors.join(',')).forEach(hideElement);
}

function removeVisualFocus() {
    if (!document.body) return;
    document.body.classList.remove('focus-mode-active');
    document.querySelectorAll('[data-focus-tube-hidden]').forEach(el => {
        el.style.display = '';
        el.removeAttribute('data-focus-tube-hidden');
    });
}

function checkKickFlag() {
    const kickMsg = sessionStorage.getItem('ft_kicked');
    if (kickMsg) {
        sessionStorage.removeItem('ft_kicked');
        showKickNotification();
    }
}

function showKickNotification() {
    if (!document.body) return;
    const notification = document.createElement('div');
    notification.style.cssText = `position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(20px); background: #222; color: #fff; padding: 12px 24px; border-radius: 50px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 2147483647; font-family: Roboto, Arial, sans-serif; font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 12px; opacity: 0; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.1);`;
    const img = document.createElement('img');
    img.src = chrome.runtime.getURL("icons/icon128.png");
    img.style.width = "20px";
    img.style.height = "20px";
    notification.appendChild(img);
    const text = document.createElement('span');
    text.innerText = 'Strict Mode prevented access.';
    notification.appendChild(text);
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(-50%) translateY(0)';
    }, 20);
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => notification.remove(), 400);
    }, 4000);
}

function updateWarningTheme() {
    const overlay = document.getElementById('focus-tube-warning-overlay');
    if (overlay) {
        if (isDarkMode) overlay.classList.add('dark');
        else overlay.classList.remove('dark');
    }
}

function showWarning(id) {
    lockVideo();
    if (document.getElementById('focus-tube-warning-overlay')) { updateWarningTheme(); return; }
    const overlay = document.createElement('div');
    overlay.id = 'focus-tube-warning-overlay';
    overlay.className = 'focus-tube-warning';
    if (isDarkMode) overlay.classList.add('dark');
    
    let msgButtonHtml = '';
    if (SITE.IG || SITE.TT) {
        msgButtonHtml = `<button id="ft-messages" class="focus-tube-btn focus-tube-btn-secondary">Go to Messages</button>`;
    }
    
    overlay.innerHTML = `
        <div class="focus-tube-card">
            <img src="${chrome.runtime.getURL('icons/icon128.png')}" class="focus-tube-icon-img">
            <h1>Distraction Blocked</h1>
            <p>FocusTube is keeping you productive</p>
            <div class="focus-tube-btn-group">
                <button id="ft-go-back" class="focus-tube-btn focus-tube-btn-primary">Go Back</button>
                <button id="ft-watch" class="focus-tube-btn focus-tube-btn-secondary">Watch Anyway</button>
                ${msgButtonHtml}
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    let backUrl = "https://www.youtube.com";
    if (SITE.IG) backUrl = "https://www.google.com";
    if (SITE.TT) backUrl = "https://www.tiktok.com"; 

    document.getElementById('ft-go-back').addEventListener('click', () => { window.location.href = backUrl; });
    document.getElementById('ft-watch').addEventListener('click', () => { 
        if (SITE.TT) isTikTokSessionAllowed = true;
        else currentAllowedId = id;
        
        removeWarning(); 
        unlockVideo(); 
        document.querySelectorAll('video').forEach(vid => { vid.muted = false; vid.play().catch(() => {}); }); 
    });

    if (document.getElementById('ft-messages')) {
        document.getElementById('ft-messages').addEventListener('click', () => {
            if (SITE.IG) window.location.href = "https://www.instagram.com/direct/inbox/";
            if (SITE.TT) window.location.href = "https://www.tiktok.com/messages";
        });
    }
}

function removeWarning() { const overlay = document.getElementById('focus-tube-warning-overlay'); if (overlay) overlay.remove(); }
function lockVideo() { if (isVideoLocked) return; isVideoLocked = true; document.querySelectorAll('video').forEach(vid => { vid.pause(); vid.muted = true; }); videoLockInterval = setInterval(() => { document.querySelectorAll('video').forEach(vid => { if (!vid.paused || !vid.muted) { vid.pause(); vid.muted = true; } }); }, 200); }
function unlockVideo() { isVideoLocked = false; if (videoLockInterval) { clearInterval(videoLockInterval); videoLockInterval = null; } }
function hideElement(element) { if (element && element.style.display !== 'none') { element.style.display = 'none'; element.setAttribute('data-focus-tube-hidden', 'true'); } }

function checkForUpdates() {
    const GITHUB_MANIFEST_URL = 'https://raw.githubusercontent.com/malekwael229/FocusTube/main/manifest.json';
    const localVersion = chrome.runtime.getManifest().version;
    fetch(GITHUB_MANIFEST_URL).then(r => r.json()).then(remote => { if (compareVersions(localVersion, remote.version)) { if (document.body) showUpdateNotification(remote.version); else document.addEventListener('DOMContentLoaded', () => showUpdateNotification(remote.version)); } }).catch(err => {});
}
function compareVersions(local, remote) { const v1 = local.split('.').map(Number); const v2 = remote.split('.').map(Number); for (let i = 0; i < Math.max(v1.length, v2.length); i++) { const n1 = v1[i] || 0; const n2 = v2[i] || 0; if (n2 > n1) return true; if (n1 > n2) return false; } return false; }
function showUpdateNotification(newVersion) { if (sessionStorage.getItem('ft_update_shown') || !document.body) return; const n = document.createElement('div'); n.style.cssText = `position: fixed; bottom: 20px; right: 20px; background: #2b2b2b; color: white; padding: 15px 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 2147483647; font-family: -apple-system, sans-serif; display: flex; align-items: center; gap: 15px; animation: ftFadeIn 0.5s ease; border: 1px solid #444;`; n.innerHTML = `<div><div style="font-weight:bold; font-size:14px; margin-bottom:4px">FocusTube Update</div><div style="font-size:12px; color:#aaa">Version ${newVersion} is available.</div></div><a href="https://github.com/malekwael229/FocusTube" target="_blank" style="background:#007aff; color:white; padding:8px 16px; border-radius:20px; text-decoration:none; font-size:12px; font-weight:600;">Get it</a><button id="ft-close-update" style="background:none; border:none; color:#666; cursor:pointer; font-size:16px;">×</button>`; document.body.appendChild(n); sessionStorage.setItem('ft_update_shown', 'true'); document.getElementById('ft-close-update').addEventListener('click', () => n.remove()); }
const style = document.createElement('style'); style.innerHTML = `@keyframes ftFadeIn { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`; if (document.head) document.head.appendChild(style); else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));