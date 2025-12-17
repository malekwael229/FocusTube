let currentShortsId = null; 
let userAcceptedWarning = false;
let isFocusModeOn = true;
let shortsMode = 'strict';

initialize();

function initialize() {
    chrome.storage.local.get(['focusMode', 'shortsMode'], (result) => {
        isFocusModeOn = result.focusMode !== false;
        shortsMode = result.shortsMode || 'strict';
        
        if (document.body) {
            applySettings();
            startObservers();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                applySettings();
                startObservers();
            });
        }
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.focusMode) isFocusModeOn = changes.focusMode.newValue;
        if (changes.shortsMode) shortsMode = changes.shortsMode.newValue;
        applySettings();
    });
}

function applySettings() {
    if (isFocusModeOn) {
        document.body.classList.add('focus-mode-active');
        manualScan();
    } else {
        document.body.classList.remove('focus-mode-active');
        const hiddenElements = document.querySelectorAll('[data-focus-tube-hidden]');
        hiddenElements.forEach(el => {
            el.style.display = '';
            el.removeAttribute('data-focus-tube-hidden');
        });
        const overlay = document.querySelector('.focus-tube-warning');
        if (overlay) overlay.remove();
    }
}

function getShortsId(url) {
    if (!url.includes('/shorts/')) return null;
    try {
        return url.split('/shorts/')[1].split('?')[0].split('&')[0];
    } catch (e) { return null; }
}

// Counts the block in storage
function incrementCounter(callback) {
    chrome.storage.local.get(['blockedCount'], (result) => {
        const current = result.blockedCount || 0;
        chrome.storage.local.set({ blockedCount: current + 1 }, () => {
            if (callback) callback();
        });
    });
}

function startObservers() {
    const observer = new MutationObserver(() => {
        if (isFocusModeOn) manualScan();
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });

    setInterval(() => {
        if (isFocusModeOn) manualScan();
        const newId = getShortsId(location.href);

        if (!newId) {
            currentShortsId = null;
            const overlay = document.querySelector('.focus-tube-warning');
            if (overlay) overlay.remove();
            return;
        }

        // If we found a NEW Short ID that we haven't handled yet
        if (newId !== currentShortsId) {
            currentShortsId = newId;
            userAcceptedWarning = false;
            
            // Only block/count if Focus Mode is ON
            if (isFocusModeOn) {
                if (shortsMode === 'strict') {
                    incrementCounter(() => {
                        window.location.replace("https://www.youtube.com");
                    });
                } else if (shortsMode === 'warn') {
                    // Only increment count if we haven't warned for this specific one yet
                    incrementCounter(); 
                }
            }
        }

        if (isFocusModeOn) handleShortsAction(shortsMode);
    }, 500); // Check every 500ms
}

function handleShortsAction(mode) {
    if (mode === 'allow') return;

    if (mode === 'strict') {
        // Redundant check, but ensures safety
        if (location.href.includes('/shorts/')) {
             window.location.replace("https://www.youtube.com");
        }
        return;
    }

    if (mode === 'warn') {
        if (userAcceptedWarning) return;
        if (document.querySelector('.focus-tube-warning')) return;

        const overlay = document.createElement('div');
        overlay.className = 'focus-tube-warning';
        overlay.innerHTML = `
            <h1>FOCUS MODE ACTIVE</h1>
            <p>This Short counts as +1 minute of wasted time.</p>
            <button class="focus-tube-btn" id="allowBtn">Watch Anyway</button>
        `;

        const player = document.querySelector('ytd-shorts') || document.body;
        player.appendChild(overlay);

        const video = document.querySelector('video');
        if (video) video.pause();

        document.getElementById('allowBtn').addEventListener('click', () => {
            userAcceptedWarning = true;
            overlay.remove();
            const video = document.querySelector('video');
            if (video) video.play().catch(e => {});
        });
    }
}

function manualScan() {
    // (Keep your existing hiding logic here from the previous content.js)
    // Same as before...
    const targets = document.querySelectorAll(`
        ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, 
        yt-chip-cloud-chip-renderer, .ytChipShapeChip,
        ytd-reel-shelf-renderer, ytd-rich-shelf-renderer, 
        grid-shelf-view-model, ytd-rich-section-renderer,
        ytd-grid-video-renderer, ytd-notification-renderer, #endpoint
    `);

    targets.forEach(item => {
        const text = (item.innerText || "").trim().toLowerCase();
        const link = item.querySelector('a');
        const title = (link ? link.title : "").toLowerCase();
        const href = (link ? link.href : "").toLowerCase();
        const isShortsAttr = item.getAttribute('is-shorts') !== null;

        if (text === "shorts" || title === "shorts" || href.includes('/shorts') || isShortsAttr) {
            if (item.tagName.toLowerCase() !== 'ytd-shorts') {
                if (item.style.display !== 'none') {
                    item.style.display = 'none';
                    item.setAttribute('data-focus-tube-hidden', 'true');
                }
            }
        }
    });
}
