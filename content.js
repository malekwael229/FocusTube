let isFocusModeOn = true;
let shortsMode = 'strict';
let isDarkMode = true;
let currentAllowedUrl = null;

let isVideoLocked = false;
let videoLockInterval = null;


(function initialize() {
    
    chrome.storage.local.get(['focusMode', 'shortsMode', 'darkMode'], (result) => {
        isFocusModeOn = result.focusMode !== false;
        shortsMode = result.shortsMode || 'strict';
        isDarkMode = result.darkMode !== false; 
        
       
        if (document.body) {
            startApp();
        } else {
            document.addEventListener('DOMContentLoaded', startApp);
        }
    });

    
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.focusMode) isFocusModeOn = changes.focusMode.newValue;
        if (changes.shortsMode) shortsMode = changes.shortsMode.newValue;
        
        if (changes.darkMode) {
            isDarkMode = changes.darkMode.newValue;
            if (document.body) updateWarningTheme(); 
        }
        
        if (document.body) runChecks();
    });
    
    
    checkForUpdates();
})();

function startApp() {
    
    if (!document.body) {
        setTimeout(startApp, 50); // 
        return;
    }

   
    runChecks();
    setInterval(runChecks, 500);

    window.addEventListener('yt-navigate-finish', runChecks);
    window.addEventListener('popstate', runChecks);
    
    const mainObserver = new MutationObserver(() => {
        if (isFocusModeOn) applyFocusMode();
    });
    mainObserver.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('play', (e) => {
        if (isVideoLocked) {
            e.preventDefault();
            e.stopPropagation();
            e.target.pause();
            e.target.muted = true;
        }
    }, true);
    
    window.addEventListener('timeupdate', (e) => {
        if (isVideoLocked && !e.target.paused) {
            e.target.pause();
        }
    }, true);
}

function runChecks() {
    
    if (!document.body) return;

    const currentUrl = window.location.href;

    if (currentUrl.includes('/feed/history')) {
        resetAll();
        return; 
    }

    // --- PART 1: VISUALS (Controlled by Toggle) ---
    if (isFocusModeOn) {
        applyFocusMode();
    } else {
        removeVisualFocus();
    }

    
    if (currentUrl.includes('/shorts/')) {
        if (shortsMode !== 'allow') {
            handleShortsBlocking(currentUrl);
        } else {
            unlockVideo();
            removeWarning();
        }
    } else {
        unlockVideo();
        removeWarning();
    }
}

function applyFocusMode() {
    if (!document.body) return;
    if (!document.body.classList.contains('focus-mode-active')) {
        document.body.classList.add('focus-mode-active');
    }
    
    const selectors = [
        "ytd-guide-entry-renderer[title='Shorts']",
        "ytd-mini-guide-entry-renderer[aria-label='Shorts']",
        "ytd-reel-shelf-renderer",
        "ytd-rich-shelf-renderer[is-shorts]",
        "yt-chip-cloud-chip-renderer a[href*='/shorts/']"
    ];
    
    document.querySelectorAll(selectors.join(',')).forEach(hideElement);

    document.querySelectorAll('yt-chip-cloud-chip-renderer').forEach(chip => {
        if (chip.innerText && chip.innerText.trim() === "Shorts") {
            hideElement(chip);
        }
    });
}

function removeVisualFocus() {
    if (!document.body) return;
    document.body.classList.remove('focus-mode-active');
    
    document.querySelectorAll('[data-focus-tube-hidden]').forEach(el => {
        el.style.display = '';
        el.removeAttribute('data-focus-tube-hidden');
    });
}

function resetAll() {
    removeVisualFocus();
    unlockVideo();
    removeWarning();
}

function handleShortsBlocking(url) {
    if (url === currentAllowedUrl) return;

    if (shortsMode === 'strict') {
        window.location.replace("https://www.youtube.com");
    } else if (shortsMode === 'warn') {
        showWarning();
    }
}

function updateWarningTheme() {
    const overlay = document.getElementById('focus-tube-warning-overlay');
    if (overlay) {
        if (isDarkMode) {
            overlay.classList.add('dark');
        } else {
            overlay.classList.remove('dark');
        }
    }
}

function showWarning() {
    lockVideo();

    if (document.getElementById('focus-tube-warning-overlay')) {
        updateWarningTheme();
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'focus-tube-warning-overlay';
    overlay.className = 'focus-tube-warning';
    
    if (isDarkMode) {
        overlay.classList.add('dark');
    }
    
    overlay.innerHTML = `
        <div class="focus-tube-card">
            <div class="focus-tube-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
            </div>
            <h1>Shorts & Distractions Blocked</h1>
            <p>FocusTube is keeping you productive</p>
            
            <div class="focus-tube-btn-group">
                <button id="ft-go-back" class="focus-tube-btn focus-tube-btn-primary">Go Back</button>
                <button id="ft-watch" class="focus-tube-btn focus-tube-btn-secondary">Watch Anyway</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('ft-go-back').addEventListener('click', () => {
        window.location.href = "https://www.youtube.com";
    });

    document.getElementById('ft-watch').addEventListener('click', () => {
        currentAllowedUrl = window.location.href;
        removeWarning();
        unlockVideo();
        
        const videos = document.querySelectorAll('video');
        videos.forEach(vid => {
            vid.muted = false;
            vid.play().catch(() => {});
        });
    });
}

function removeWarning() {
    const overlay = document.getElementById('focus-tube-warning-overlay');
    if (overlay) overlay.remove();
}

function lockVideo() {
    if (isVideoLocked) return;
    isVideoLocked = true;

    document.querySelectorAll('video').forEach(vid => {
        vid.pause();
        vid.muted = true;
    });

    videoLockInterval = setInterval(() => {
        document.querySelectorAll('video').forEach(vid => {
            if (!vid.paused || !vid.muted) {
                vid.pause();
                vid.muted = true;
            }
        });
    }, 10);
}

function unlockVideo() {
    isVideoLocked = false;
    if (videoLockInterval) {
        clearInterval(videoLockInterval);
        videoLockInterval = null;
    }
}

function hideElement(element) {
    if (element && element.style.display !== 'none') {
        element.style.display = 'none';
        element.setAttribute('data-focus-tube-hidden', 'true');
    }
}

// Update Checker
function checkForUpdates() {
    const GITHUB_MANIFEST_URL = 'https://raw.githubusercontent.com/malekwael229/FocusTube/main/manifest.json';
    const localVersion = chrome.runtime.getManifest().version;

    fetch(GITHUB_MANIFEST_URL)
        .then(response => response.json())
        .then(remoteManifest => {
            if (compareVersions(localVersion, remoteManifest.version)) {
                // Ensure body exists before showing UI
                if (document.body) {
                    showUpdateNotification(remoteManifest.version);
                } else {
                    document.addEventListener('DOMContentLoaded', () => {
                        showUpdateNotification(remoteManifest.version);
                    });
                }
            }
        })
        .catch(err => console.log('FocusTube update check failed', err));
}

function compareVersions(local, remote) {
    const v1 = local.split('.').map(Number);
    const v2 = remote.split('.').map(Number);
    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
        const n1 = v1[i] || 0;
        const n2 = v2[i] || 0;
        if (n2 > n1) return true;
        if (n1 > n2) return false;
    }
    return false;
}

function showUpdateNotification(newVersion) {
    if (sessionStorage.getItem('ft_update_shown')) return;
    
    // Safety check again
    if (!document.body) return;

    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #2b2b2b;
        color: white;
        padding: 15px 20px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        z-index: 2147483647;
        font-family: -apple-system, sans-serif;
        display: flex;
        align-items: center;
        gap: 15px;
        animation: slideIn 0.5s ease;
        border: 1px solid #444;
    `;
    
    notification.innerHTML = `
        <div>
            <div style="font-weight:bold; font-size:14px; margin-bottom:4px">FocusTube Update</div>
            <div style="font-size:12px; color:#aaa">Version ${newVersion} is available.</div>
        </div>
        <a href="https://github.com/malekwael229/FocusTube" target="_blank" 
           style="background:#007aff; color:white; padding:8px 16px; border-radius:20px; text-decoration:none; font-size:12px; font-weight:600;">
           Get it
        </a>
        <button id="ft-close-update" style="background:none; border:none; color:#666; cursor:pointer; font-size:16px;">×</button>
    `;

    document.body.appendChild(notification);
    sessionStorage.setItem('ft_update_shown', 'true');

    document.getElementById('ft-close-update').addEventListener('click', () => {
        notification.remove();
    });
}

const style = document.createElement('style');
style.innerHTML = `
    @keyframes slideIn {
        from { transform: translateY(100px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
`;
document.head.appendChild(style);