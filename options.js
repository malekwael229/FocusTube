

document.addEventListener('DOMContentLoaded', function () {
    const defaultSettings = {
        ft_timer_duration: 25,
        breakDuration: 5,
        autoStartBreaks: true,
        playSound: true,
        breakDuration: 5,
        autoStartBreaks: true,
        playSound: true,
        focusMode: true,
        lockSettings: false,
        showNotifications: true,
        darkMode: true,
        showStatsInPopup: true,
        ft_stats_blocked: 0,

        popup_visible_yt: true,
        popup_visible_ig: true,
        popup_visible_tt: true,
        popup_visible_tt: true,
        popup_visible_fb: true,
        restrictHiddenPlatforms: true,
        visualHideHiddenPlatforms: true
    };

    function loadSettings() {
        chrome.storage.local.get(defaultSettings, function (items) {
            if (document.getElementById('focusDuration')) document.getElementById('focusDuration').value = items.ft_timer_duration;
            if (document.getElementById('breakDuration')) document.getElementById('breakDuration').value = items.breakDuration;

            if (document.getElementById('theme')) {
                document.getElementById('theme').value = items.darkMode ? 'dark' : 'light';
            }


            setToggle('autoStartBreaks', items.autoStartBreaks);
            setToggle('playSound', items.playSound);

            setToggle('lockSettings', items.lockSettings);
            setToggle('showNotifications', items.showNotifications);
            setToggle('showStatsInPopup', items.showStatsInPopup);


            setToggle('popup_visible_yt', items.popup_visible_yt);
            setToggle('popup_visible_ig', items.popup_visible_ig);
            setToggle('popup_visible_tt', items.popup_visible_tt);
            setToggle('popup_visible_fb', items.popup_visible_fb);


            setToggle('restrictHiddenPlatforms', items.restrictHiddenPlatforms);
            setToggle('visualHideHiddenPlatforms', items.visualHideHiddenPlatforms);


            if (document.getElementById('totalBlocked')) document.getElementById('totalBlocked').textContent = items.ft_stats_blocked;

            if (document.getElementById('timeSaved')) {
                const minutes = items.ft_stats_blocked || 0;
                let timeSavedText = "0m";
                if (minutes < 60) timeSavedText = `${minutes} min`;
                else {
                    const h = Math.floor(minutes / 60);
                    const m = minutes % 60;
                    timeSavedText = `${h}h ${m}m`;
                }
                document.getElementById('timeSaved').textContent = timeSavedText;
            }
        });
    }

    function setToggle(id, value) {
        const toggle = document.getElementById(id);
        if (toggle) {
            toggle.checked = value;
        }
    }

    function saveSetting(key, value) {
        const setting = {};

        if (key === 'focusDuration') key = 'ft_timer_duration';
        if (key === 'strictMode') key = 'focusMode';
        if (key === 'theme') {
            key = 'darkMode';
            value = (value === 'dark');
        }

        setting[key] = value;
        chrome.storage.local.set(setting);
    }

    document.querySelectorAll('.toggle-input').forEach(toggle => {
        toggle.addEventListener('change', function () {
            saveSetting(this.id, this.checked);
        });
    });

    document.querySelectorAll('.select-dropdown').forEach(select => {
        initCustomSelect(select);
    });

    function initCustomSelect(select) {
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';

        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        const arrowSvg = `<svg class="custom-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

        const selectedOption = select.options[select.selectedIndex];
        trigger.innerHTML = `<span>${selectedOption ? selectedOption.text : 'Select'}</span>${arrowSvg}`;

        const optionsList = document.createElement('div');
        optionsList.className = 'custom-options';

        Array.from(select.options).forEach(option => {
            const optDiv = document.createElement('div');
            optDiv.className = `custom-option ${option.selected ? 'selected' : ''}`;
            optDiv.dataset.value = option.value;
            optDiv.textContent = option.text;

            optDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                select.value = option.value;
                select.dispatchEvent(new Event('change'));

                trigger.querySelector('span').textContent = option.text;
                optionsList.querySelectorAll('.custom-option').forEach(el => el.classList.remove('selected'));
                optDiv.classList.add('selected');
                wrapper.classList.remove('open');
            });

            optionsList.appendChild(optDiv);
        });

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select-wrapper').forEach(w => {
                if (w !== wrapper) w.classList.remove('open');
            });
            wrapper.classList.toggle('open');
        });

        wrapper.appendChild(trigger);
        wrapper.appendChild(optionsList);

        select.parentNode.insertBefore(wrapper, select.nextSibling);

        select.addEventListener('change', () => {
            const newOpt = select.options[select.selectedIndex];
            if (newOpt) {
                trigger.querySelector('span').textContent = newOpt.text;
                optionsList.querySelectorAll('.custom-option').forEach(el => el.classList.remove('selected'));
                const matchingOpt = optionsList.querySelector(`[data-value="${newOpt.value}"]`);
                if (matchingOpt) matchingOpt.classList.add('selected');
            }
        });
    }

    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
    });

    document.querySelectorAll('.custom-select').forEach(select => {
        select.addEventListener('change', function () {
            saveSetting(this.id, this.value);
        });
    });

    const exportBtn = document.getElementById('exportData');
    if (exportBtn) {
        exportBtn.addEventListener('click', function () {
            chrome.storage.local.get(null, function (items) {
                const dataStr = JSON.stringify(items, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'focustube-settings-backup.json';
                a.click();
                URL.revokeObjectURL(url);
            });
        });
    }

    const importBtn = document.getElementById('importData');
    const importFile = document.getElementById('importFile');

    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => importFile.click());

        importFile.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const data = JSON.parse(e.target.result);
                    if (confirm('Importing data will overwrite your current settings and stats. Are you sure you want to continue?')) {
                        chrome.storage.local.clear(() => {
                            chrome.storage.local.set(data, () => {
                                alert('Data imported successfully!');
                                location.reload();
                            });
                        });
                    }
                } catch (err) {
                    alert('Error importing data: Invalid JSON file.');
                }
            };
            reader.readAsText(file);
            importFile.value = '';
        });
    }

    const resetBtn = document.getElementById('resetSettings');
    if (resetBtn) {
        resetBtn.addEventListener('click', function () {
            if (confirm('Are you sure you want to reset all settings to defaults?')) {
                chrome.storage.local.set(defaultSettings, function () {
                    loadSettings();
                    location.reload();
                });
            }
        });
    }

    const clearBtn = document.getElementById('clearData');
    if (clearBtn) {
        clearBtn.addEventListener('click', function () {
            if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
                chrome.storage.local.clear(function () {
                    chrome.storage.local.set(defaultSettings, function () {
                        loadSettings();
                        location.reload();
                    });
                });
            }
        });
    }

    const lightBtn = document.getElementById('lightThemeBtn');
    const darkBtn = document.getElementById('darkThemeBtn');

    function updateThemeUI(isDark) {
        if (isDark) {
            document.body.classList.add('dark-mode');
            darkBtn.classList.add('active');
            lightBtn.classList.remove('active');
        } else {
            document.body.classList.remove('dark-mode');
            lightBtn.classList.add('active');
            darkBtn.classList.remove('active');
        }
    }

    chrome.storage.local.get(['darkMode'], (res) => {
        updateThemeUI(res.darkMode !== false);
    });

    if (lightBtn) {
        lightBtn.addEventListener('click', () => {
            chrome.storage.local.set({ darkMode: false });
            updateThemeUI(false);
        });
    }

    if (darkBtn) {
        darkBtn.addEventListener('click', () => {
            chrome.storage.local.set({ darkMode: true });
            updateThemeUI(true);
        });
    }

    const starBtn = document.getElementById('starRepo');
    if (starBtn) {
        starBtn.addEventListener('click', function () {
            chrome.tabs.create({ url: 'https://github.com/malekwael229/FocusTube' });
        });
    }

    const issueBtn = document.getElementById('reportIssue');
    if (issueBtn) {
        issueBtn.addEventListener('click', function () {
            chrome.tabs.create({ url: 'https://github.com/malekwael229/FocusTube/issues/1' });
        });
    }

    const supportBtn = document.getElementById('supportProject');
    if (supportBtn) {
        supportBtn.addEventListener('click', function () {
            chrome.tabs.create({ url: 'https://github.com/malekwael229/FocusTube' });
        });
    }

    function checkLockSettings() {
        chrome.storage.local.get(['ft_timer_end', 'ft_timer_type', 'lockSettings'], (res) => {
            if (res.ft_timer_end && res.ft_timer_end > Date.now() && res.lockSettings) {
                disableInputs(true);
            } else {
                disableInputs(false);
            }
        });
    }

    function disableInputs(disabled) {
        document.querySelectorAll('input, select, button:not(#backBtn)').forEach(el => {
            if (el.id !== 'backBtn' && el.id !== 'supportProject') {
                el.disabled = disabled;
                if (disabled) el.parentElement.classList.add('disabled-look');
                else el.parentElement.classList.remove('disabled-look');
            }
        });
    }

    checkLockSettings();
    setInterval(checkLockSettings, 1000);

    loadSettings();
});

function playBeep() {
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "TIMER_COMPLETE") {
        chrome.storage.local.get(['playSound'], (res) => {
            if (res.playSound !== false) playBeep();
        });
    }
});
