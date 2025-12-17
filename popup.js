document.addEventListener('DOMContentLoaded', () => {
    const mainToggle = document.getElementById('mainToggle');
    const modeSelect = document.getElementById('modeSelect');
    const modeDesc = document.getElementById('modeDesc');
    const passiveOption = modeSelect.querySelector('option[value="allow"]');

    const descriptions = {
        strict: "Strict: If you open a Short, you will be instantly kicked out.",
        warn: "Soft: You will see a warning screen before the video plays.",
        allow: "Passive: Focus Mode is off. YouTube works normally (No hiding)."
    };

    // Initialize state from storage
    chrome.storage.local.get(['focusMode', 'shortsMode'], (result) => {
        const isEnabled = result.focusMode !== false;
        mainToggle.checked = isEnabled;
        
        const currentMode = result.shortsMode || 'strict';
        modeSelect.value = currentMode;
        
        updateUiState(isEnabled);
    });

    // Event Listeners
    mainToggle.addEventListener('change', () => {
        const isEnabled = mainToggle.checked;
        chrome.storage.local.set({ focusMode: isEnabled });
        updateUiState(isEnabled);
    });

    modeSelect.addEventListener('change', () => {
        const mode = modeSelect.value;
        modeDesc.innerText = descriptions[mode];
        chrome.storage.local.set({ shortsMode: mode });
    });

    function updateUiState(isEnabled) {
        if (isEnabled) {
            passiveOption.disabled = true;
            passiveOption.innerText = "Passive (Turn off Focus Mode to enable)";
            
            // Force strict/warn if user enables focus mode while on passive
            if (modeSelect.value === 'allow') {
                modeSelect.value = 'warn';
                chrome.storage.local.set({ shortsMode: 'warn' });
            }
        } else {
            passiveOption.disabled = false;
            passiveOption.innerText = "Passive: Let me watch";
        }
        modeDesc.innerText = descriptions[modeSelect.value];
    }
});