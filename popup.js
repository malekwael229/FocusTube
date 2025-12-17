document.addEventListener('DOMContentLoaded', () => {
    const mainToggle = document.getElementById('mainToggle');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const modeDesc = document.getElementById('modeDesc');
    const modeOptions = document.querySelectorAll('.mode-option');
    const passiveOption = document.getElementById('passiveOption');
    const passiveOptionText = passiveOption ? passiveOption.querySelector('.mode-option-text') : null;

    const descriptions = {
        strict: "Strict: If you open a Short, you will be instantly kicked out.",
        warn: "Soft: You will see a warning screen before the video plays.",
        allow: "Passive: Focus Mode is off. YouTube works normally (No hiding)."
    };
    
    const optionLabels = {
        allow: "Passive: Let me watch"
    };

    let currentModeValue = 'strict';

    chrome.storage.local.get(['focusMode', 'shortsMode', 'darkMode'], (result) => {
        const isEnabled = result.focusMode !== false;
        mainToggle.checked = isEnabled;
        
        const isDarkMode = result.darkMode !== false;
        darkModeToggle.checked = isDarkMode;
        applyDarkMode(isDarkMode);

        currentModeValue = result.shortsMode || 'strict';
        updateSelectedOptionVisuals(currentModeValue);
        updateUiState(isEnabled);

        setTimeout(() => {
            document.body.classList.remove('preload');
        }, 10);
    });

    mainToggle.addEventListener('change', () => {
        const isEnabled = mainToggle.checked;
        chrome.storage.local.set({ focusMode: isEnabled });
        updateUiState(isEnabled);
    });

    darkModeToggle.addEventListener('change', () => {
        const isDark = darkModeToggle.checked;
        chrome.storage.local.set({ darkMode: isDark });
        applyDarkMode(isDark);
    });

    modeOptions.forEach(option => {
        option.addEventListener('click', function() {
            if (this.classList.contains('disabled')) return;

            const value = this.getAttribute('data-value');
            currentModeValue = value;

            chrome.storage.local.set({ shortsMode: value });

            updateSelectedOptionVisuals(value);
            modeDesc.innerText = descriptions[value];
        });
    });

    function applyDarkMode(isDark) {
        if (isDark) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }

    function updateSelectedOptionVisuals(value) {
        modeOptions.forEach(opt => {
            if (opt.getAttribute('data-value') === value) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
    }

    function updateUiState(isEnabled) {
        if (!passiveOption || !passiveOptionText) return;

        if (isEnabled) {
            passiveOption.classList.add('disabled');
            passiveOptionText.innerText = "Passive (Turn off Focus Mode)";
            
            if (currentModeValue === 'allow') {
                currentModeValue = 'warn';
                chrome.storage.local.set({ shortsMode: 'warn' });
                updateSelectedOptionVisuals('warn');
            }
        } else {
            passiveOption.classList.remove('disabled');
            passiveOptionText.innerText = optionLabels['allow'];
        }
        
        modeDesc.innerText = descriptions[currentModeValue];
    }
});