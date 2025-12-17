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
        
        runChecks();
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.focusMode) isFocusModeOn = changes.focusMode.newValue;
        if (changes.shortsMode) shortsMode = changes.shortsMode.newValue;
        
        if (changes.darkMode) {
            isDarkMode = changes.darkMode.newValue;
            updateWarningTheme(); 
        }
        
        runChecks();
    });

    setInterval(runChecks, 500);

    window.addEventListener('yt-navigate-finish', runChecks);
    window.addEventListener('popstate', runChecks);
    
    const mainObserver = new MutationObserver(() => {
        if (isFocusModeOn) applyFocusMode();
    });
    mainObserver.observe(document.body, { childList: true, subtree: true });

    // Intercept video play events in capture phase to prevent autoplay.
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
})();

function runChecks() {
    const currentUrl = window.location.href;

    if (currentUrl.includes('/feed/history')) {
        deactivateFocusMode();
        return; 
    }

    if (isFocusModeOn) {
        applyFocusMode();
        
        if (currentUrl.includes('/shorts/')) {
            handleShortsBlocking(currentUrl);
        } else {
            unlockVideo();
            removeWarning();
        }
    } else {
        deactivateFocusMode();
    }
}

function applyFocusMode() {
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

function deactivateFocusMode() {
    document.body.classList.remove('focus-mode-active');
    unlockVideo();
    removeWarning();
    
    document.querySelectorAll('[data-focus-tube-hidden]').forEach(el => {
        el.style.display = '';
        el.removeAttribute('data-focus-tube-hidden');
    });
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