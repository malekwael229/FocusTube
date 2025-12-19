let isFocusModeOn = true;
let shortsMode = 'strict';
let isDarkMode = true;
let currentAllowedUrl = null; 

let timerEndTime = null;
let timerType = 'work';

let isVideoLocked = false;
let videoLockInterval = null;
let isRedirecting = false;

(function initialize() {
    chrome.storage.local.get(['focusMode', 'shortsMode', 'darkMode', 'ft_timer_end', 'ft_timer_type'], (result) => {
        isFocusModeOn = result.focusMode !== false;
        shortsMode = result.shortsMode || 'strict';
        isDarkMode = result.darkMode !== false; 
        
        timerEndTime = result.ft_timer_end || null;
        timerType = result.ft_timer_type || 'work';
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startApp);
        } else {
            startApp();
        }
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === "TIMER_COMPLETE") {
            sendResponse({ status: 'received' });
            
            playNotificationSound();
            if (msg.type === "work") {
                showToast("Focus Session Complete! 🎉", "Great job! Take a 5-minute break.");
            } else {
                showToast("Break Over! ⏰", "Time to get back to work.");
            }
        }
        return true;
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.focusMode) isFocusModeOn = changes.focusMode.newValue;
        if (changes.shortsMode) shortsMode = changes.shortsMode.newValue;
        if (changes.darkMode) {
            isDarkMode = changes.darkMode.newValue;
            if (document.body) updateWarningTheme(); 
        }
        
        if (changes.ft_timer_end || changes.ft_timer_type) {
            timerEndTime = changes.ft_timer_end ? changes.ft_timer_end.newValue : timerEndTime;
            timerType = changes.ft_timer_type ? changes.ft_timer_type.newValue : timerType;
        }
        
        if (document.body) runChecks();
    });
    
    checkForUpdates();
})();

function startApp() {
    setTimeout(checkKickFlag, 500);
    runChecks();
    setInterval(runChecks, 500);
    
    window.addEventListener('yt-navigate-finish', () => {
        isRedirecting = false;
        runChecks();
    });
    window.addEventListener('popstate', runChecks);
    
    const mainObserver = new MutationObserver(() => {
        const currentUrl = window.location.href;
        
        if (currentUrl.includes('/shorts/')) {
            checkActiveBlocking(currentUrl);
        }

        if (!currentUrl.includes('/feed/history')) {
            const isTimerActive = timerEndTime && timerEndTime > Date.now() && timerType === 'work';
            const isBreakActive = timerEndTime && timerEndTime > Date.now() && timerType === 'break';
            
            if (isTimerActive || (isFocusModeOn && !isBreakActive)) {
                applyFocusMode();
            } else {
                removeVisualFocus();
            }
        }
    });
    
    mainObserver.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('play', (e) => {
        if (isVideoLocked) {
            e.preventDefault(); e.stopPropagation(); e.target.pause(); e.target.muted = true;
        }
    }, true);
    
    window.addEventListener('timeupdate', (e) => {
        if (isVideoLocked && !e.target.paused) e.target.pause();
    }, true);
}

function runChecks() {
    if (!document.body || isRedirecting) return;
    const currentUrl = window.location.href;
    
    if (currentUrl.includes('/feed/history')) {
        removeVisualFocus(); unlockVideo(); removeWarning(); return; 
    }

    checkActiveBlocking(currentUrl);

    const isTimerActive = timerEndTime && timerEndTime > Date.now() && timerType === 'work';
    const isBreakActive = timerEndTime && timerEndTime > Date.now() && timerType === 'break';
    
    if (isTimerActive || (isFocusModeOn && !isBreakActive)) {
        applyFocusMode();
    } else {
        removeVisualFocus();
    }
}

function checkActiveBlocking(currentUrl) {
    if (isRedirecting) return;

    const isTimerActive = timerEndTime && timerEndTime > Date.now() && timerType === 'work';
    const isBreakActive = timerEndTime && timerEndTime > Date.now() && timerType === 'break';

    if (currentUrl.includes('/shorts/')) {
        if (isBreakActive) {
            unlockVideo(); removeWarning();
        } else if (isTimerActive) {
            handleShortsBlocking(currentUrl, true);
        } else if (shortsMode !== 'allow') {
            handleShortsBlocking(currentUrl, false);
        } else {
            unlockVideo(); removeWarning();
        }
    } else {
        unlockVideo(); removeWarning();
    }
}

function handleShortsBlocking(url, isForced) {
    if (url === currentAllowedUrl && !isForced) return;
    
    const mode = isForced ? 'strict' : shortsMode;
    
    if (mode === 'strict') {
        isRedirecting = true; 
        chrome.storage.local.get(['ft_stats_blocked'], (res) => {
            const newCount = (res.ft_stats_blocked || 0) + 1;
            chrome.storage.local.set({ ft_stats_blocked: newCount });
        });
        sessionStorage.setItem('ft_kicked', 'true');
        window.location.replace("https://www.youtube.com");
    } else if (mode === 'warn') {
        showWarning(url);
    }
}

function applyFocusMode() {
    if (!document.body) return;
    if (!document.body.classList.contains('focus-mode-active')) document.body.classList.add('focus-mode-active');
    document.querySelectorAll('ytd-rich-shelf-renderer').forEach(shelf => {
        const title = shelf.querySelector('#title');
        if (shelf.hasAttribute('is-shorts') || (title && title.textContent.trim() === 'Shorts')) hideElement(shelf);
    });
    const simpleSelectors = ["ytd-reel-shelf-renderer", "ytd-guide-entry-renderer[title='Shorts']", "ytd-mini-guide-entry-renderer[aria-label='Shorts']", "yt-chip-cloud-chip-renderer a[href*='/shorts/']"];
    document.querySelectorAll(simpleSelectors.join(',')).forEach(hideElement);
    document.querySelectorAll('yt-chip-cloud-chip-renderer').forEach(chip => { if (chip.textContent && chip.textContent.trim() === "Shorts") hideElement(chip); });
}
function removeVisualFocus() {
    if (!document.body) return;
    document.body.classList.remove('focus-mode-active');
    document.querySelectorAll('[data-focus-tube-hidden]').forEach(el => { el.style.display = ''; el.removeAttribute('data-focus-tube-hidden'); });
}
function hideElement(element) { if (element && element.style.display !== 'none') { element.style.display = 'none'; element.setAttribute('data-focus-tube-hidden', 'true'); } }

function updateWarningTheme() {
    const overlay = document.getElementById('focus-tube-warning-overlay');
    if (overlay) { if (isDarkMode) overlay.classList.add('dark'); else overlay.classList.remove('dark'); }
}
function showWarning(url) {
    lockVideo();
    if (document.getElementById('focus-tube-warning-overlay')) { updateWarningTheme(); return; }
    const overlay = document.createElement('div');
    overlay.id = 'focus-tube-warning-overlay';
    overlay.className = 'focus-tube-warning';
    if (isDarkMode) overlay.classList.add('dark');
    overlay.innerHTML = `<div class="focus-tube-card"><img src="${chrome.runtime.getURL('icons/icon128.png')}" class="focus-tube-icon-img"><h1>Shorts & Distractions Blocked</h1><p>FocusTube is keeping you productive</p><div class="focus-tube-btn-group"><button id="ft-go-back" class="focus-tube-btn focus-tube-btn-primary">Go Back</button><button id="ft-watch" class="focus-tube-btn focus-tube-btn-secondary">Watch Anyway</button></div></div>`;
    document.body.appendChild(overlay);
    document.getElementById('ft-go-back').addEventListener('click', () => { window.location.href = "https://www.youtube.com"; });
    document.getElementById('ft-watch').addEventListener('click', () => { currentAllowedUrl = window.location.href; chrome.storage.local.get(['ft_stats_blocked'], (res) => { const newCount = (res.ft_stats_blocked || 0) + 1; chrome.storage.local.set({ ft_stats_blocked: newCount }); }); removeWarning(); unlockVideo(); document.querySelectorAll('video').forEach(vid => { vid.muted = false; vid.play().catch(() => {}); }); });
}
function removeWarning() { const overlay = document.getElementById('focus-tube-warning-overlay'); if (overlay) overlay.remove(); }
function lockVideo() {
    if (isVideoLocked) return;
    isVideoLocked = true;
    document.querySelectorAll('video').forEach(vid => { vid.pause(); vid.muted = true; });
    if (videoLockInterval) clearInterval(videoLockInterval);
    videoLockInterval = setInterval(() => { document.querySelectorAll('video').forEach(vid => { if (!vid.paused || !vid.muted) { vid.pause(); vid.muted = true; } }); }, 200);
}
function unlockVideo() { isVideoLocked = false; if (videoLockInterval) { clearInterval(videoLockInterval); videoLockInterval = null; } }

function showToast(title, message) {
    if (!document.body) return;
    const existing = document.getElementById('ft-toast'); if (existing) existing.remove();
    const toast = document.createElement('div'); toast.id = 'ft-toast';
    toast.style.cssText = `position: fixed; top: 24px; right: 24px; background: #1f1f1f; color: #fff; padding: 16px 24px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.4); z-index: 2147483647; font-family: -apple-system, sans-serif; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 15px; opacity: 0; transform: translateY(-20px); transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); min-width: 300px;`;
    const icon = document.createElement('img'); icon.src = chrome.runtime.getURL("icons/icon128.png"); icon.style.cssText = "width: 32px; height: 32px; border-radius: 8px;";
    const content = document.createElement('div'); content.innerHTML = `<div style="font-weight: 700; font-size: 15px; margin-bottom: 4px; color: #fff;">${title}</div><div style="font-size: 13px; color: #aaa; line-height: 1.4;">${message}</div>`;
    toast.appendChild(icon); toast.appendChild(content); document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-20px)'; setTimeout(() => toast.remove(), 400); }, 5000);
}

function playNotificationSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') {
            ctx.resume().then(() => { triggerBeep(ctx); }).catch(() => {});
        } else {
            triggerBeep(ctx);
        }
    } catch(e) {}
}

function triggerBeep(ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 880; 
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.6);
    osc.start(); osc.stop(ctx.currentTime + 0.6);
}

function checkKickFlag() { const kickMsg = sessionStorage.getItem('ft_kicked'); if (kickMsg) { sessionStorage.removeItem('ft_kicked'); showKickNotification(); } }
function showKickNotification() {
    if (!document.body) return;
    const notification = document.createElement('div'); notification.style.cssText = `position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(20px); background: #222; color: #fff; padding: 12px 24px; border-radius: 50px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 9999; font-family: Roboto, Arial, sans-serif; font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 12px; opacity: 0; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.1); pointer-events: none;`;
    const img = document.createElement('img'); img.src = chrome.runtime.getURL("icons/icon128.png"); img.style.width = "20px"; img.style.height = "20px"; notification.appendChild(img);
    const text = document.createElement('span'); text.innerText = 'Strict Mode prevented access to Shorts.'; notification.appendChild(text); document.body.appendChild(notification);
    requestAnimationFrame(() => { notification.style.opacity = '1'; notification.style.transform = 'translateX(-50%) translateY(0)'; });
    setTimeout(() => { notification.style.opacity = '0'; notification.style.transform = 'translateX(-50%) translateY(10px)'; setTimeout(() => notification.remove(), 400); }, 4000);
}
function checkForUpdates() { const GITHUB_MANIFEST_URL = 'https://raw.githubusercontent.com/malekwael229/FocusTube/main/manifest.json'; const localVersion = chrome.runtime.getManifest().version; fetch(GITHUB_MANIFEST_URL).then(r => r.json()).then(remote => { if (compareVersions(localVersion, remote.version)) { if (document.body) showUpdateNotification(remote.version); else document.addEventListener('DOMContentLoaded', () => showUpdateNotification(remote.version)); } }).catch(err => {}); }
function compareVersions(local, remote) { const v1 = local.split('.').map(Number); const v2 = remote.split('.').map(Number); const maxLen = Math.max(v1.length, v2.length); for (let i = 0; i < maxLen; i++) { const n1 = v1[i] || 0; const n2 = v2[i] || 0; if (n2 > n1) return true; if (n1 > n2) return false; } return false; }
function showUpdateNotification(newVersion) { if (sessionStorage.getItem('ft_update_shown') || !document.body) return; const n = document.createElement('div'); n.style.cssText = `position: fixed; bottom: 20px; right: 20px; background: #2b2b2b; color: white; padding: 15px 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 9999; font-family: -apple-system, sans-serif; display: flex; align-items: center; gap: 15px; animation: ftFadeIn 0.5s ease; border: 1px solid #444;`; n.innerHTML = `<div><div style="font-weight:bold; font-size:14px; margin-bottom:4px">FocusTube Update</div><div style="font-size:12px; color:#aaa">Version ${newVersion} is available.</div></div><a href="https://github.com/malekwael229/FocusTube" target="_blank" style="background:#007aff; color:white; padding:8px 16px; border-radius:20px; text-decoration:none; font-size:12px; font-weight:600;">Get it</a><button id="ft-close-update" style="background:none; border:none; color:#666; cursor:pointer; font-size:16px;">×</button>`; document.body.appendChild(n); sessionStorage.setItem('ft_update_shown', 'true'); document.getElementById('ft-close-update').addEventListener('click', () => n.remove()); }
const style = document.createElement('style'); style.innerHTML = `@keyframes ftFadeIn { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`; if (document.head) document.head.appendChild(style); else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));