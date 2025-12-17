let currentShortsId = null; 
let userAcceptedWarning = false;
let isFocusModeOn = true;
let shortsMode = 'strict';

initialize();

function initialize() {
    chrome.storage.local.get(['focusMode', 'shortsMode'], (result) => {
        isFocusModeOn = result.focusMode !== false;
        shortsMode = result.shortsMode || 'strict';
        
        // Wait for Body if it doesn't exist yet
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
        if (changes.focusMode) {
            isFocusModeOn = changes.focusMode.newValue;
        }
        if (changes.shortsMode) {
            shortsMode = changes.shortsMode.newValue;
        }
        applySettings();
    });
}

function applySettings() {
    // Apply Visual Settings
    if (isFocusModeOn) {
        document.body.classList.add('focus-mode-active');
        manualScan();
    } else {
        document.body.classList.remove('focus-mode-active');
        
        // Reset hidden elements
        const hiddenElements = document.querySelectorAll('[data-focus-tube-hidden]');
        hiddenElements.forEach(el => {
            el.style.display = '';
            el.removeAttribute('data-focus-tube-hidden');
        });
        
        // Reset warnings
        const overlay = document.querySelector('.focus-tube-warning');
        if (overlay) overlay.remove();

        const video = document.querySelector('video');
        if (video) {
            video.play().catch(e => { /* Ignore auto-play blocks */ });
        }
    }
    
    // Check blocking status
    const id = getShortsId(location.href);
    if (id) handleShortsAction(shortsMode);
}

function getShortsId(url) {
    if (!url.includes('/shorts/')) return null;
    try {
        return url.split('/shorts/')[1].split('?')[0].split('&')[0];
    } catch (e) { return null; }
}

function manualScan() {
    if (!isFocusModeOn) return;
    
    // Selectors for elements that might contain Shorts
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
                hideElement(item);
            }
        }
    });
}

function hideElement(element) {
    if (element.style.display !== 'none') {
        element.style.display = 'none';
        element.setAttribute('data-focus-tube-hidden', 'true');
    }
}

function startObservers() {
    const observer = new MutationObserver(() => {
        if (isFocusModeOn) manualScan();
    });
    
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Main blocking loop
    setInterval(() => {
        // Enforce visual hiding if enabled
        if (isFocusModeOn) manualScan();

        const newId = getShortsId(location.href);

        if (!newId) {
            currentShortsId = null;
            const overlay = document.querySelector('.focus-tube-warning');
            if (overlay) overlay.remove();
            return;
        }

        if (newId !== currentShortsId) {
            currentShortsId = newId;
            userAcceptedWarning = false;
            const overlay = document.querySelector('.focus-tube-warning');
            if (overlay) overlay.remove();
        }

        handleShortsAction(shortsMode);
    }, 1000);
}

function handleShortsAction(mode) {
    if (mode === 'allow') {
        // Passive mode: ensure overlay is gone and video plays
        const overlay = document.querySelector('.focus-tube-warning');
        if (overlay) overlay.remove();
        
        const video = document.querySelector('video');
        if (video && video.paused) video.play().catch(e => {});
        return;
    }

    if (mode === 'strict') {
        window.location.replace("https://www.youtube.com");
        return;
    }

    if (mode === 'warn') {
        if (userAcceptedWarning) return;
        if (document.querySelector('.focus-tube-warning')) return;

        const overlay = document.createElement('div');
        overlay.className = 'focus-tube-warning';
        overlay.innerHTML = `
            <h1>Wait! You are in Focus Mode.</h1>
            <p>Do you really need to watch this Short?</p>
            <button class="focus-tube-btn" id="allowBtn">Yes, Let me watch</button>
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