document.addEventListener('DOMContentLoaded', () => {
    const mainToggle = document.getElementById('mainToggle');
    const modeSelect = document.getElementById('modeSelect');
    const modeDesc = document.getElementById('modeDesc');
    const shortsBlockedEl = document.getElementById('shortsBlocked');
    const timeSavedEl = document.getElementById('timeSaved');

    const descriptions = {
        strict: "Strict: Instantly redirects you to the homepage.",
        warn: "Soft: Shows a warning before playing.",
        allow: "Passive: Focus Mode is off."
    };

    // Load Data
    chrome.storage.local.get(['focusMode', 'shortsMode', 'blockedCount'], (result) => {
        const isEnabled = result.focusMode !== false;
        mainToggle.checked = isEnabled;
        
        const currentMode = result.shortsMode || 'strict';
        modeSelect.value = currentMode;
        modeDesc.innerText = descriptions[currentMode];

        // Stats Logic
        const count = result.blockedCount || 0;
        shortsBlockedEl.innerText = count;
        timeSavedEl.innerText = formatTime(count); // 1 Short = 1 Minute saved
    });

    // Toggle
    mainToggle.addEventListener('change', () => {
        const isEnabled = mainToggle.checked;
        chrome.storage.local.set({ focusMode: isEnabled });
    });

    // Select Mode
    modeSelect.addEventListener('change', () => {
        const mode = modeSelect.value;
        modeDesc.innerText = descriptions[mode];
        chrome.storage.local.set({ shortsMode: mode });
    });

    // Helper: Convert Shorts count to Time String (1 Short = 1 Min)
    function formatTime(minutes) {
        if (minutes < 60) return `${minutes}m`;
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hrs}h ${mins}m`;
    }
});
