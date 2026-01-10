

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
        ft_stats_blocked: 0,

        popup_visible_yt: true,
        popup_visible_ig: true,
        popup_visible_tt: true,
        popup_visible_fb: true,
        popup_visible_li: true,
        restrictHiddenPlatforms: true,
        visualHideHiddenPlatforms: true,

        hide_ig_stories: true,
        hide_fb_stories: true,
        hide_yt_shorts_nav: true,
        hide_ig_reels_nav: true,
        hide_fb_reels_nav: true,
        hide_li_feed: true,
        hide_li_puzzles: true,
        hide_li_addfeed: true,

        showBreakButton: true,
        accentColor: '#4facfe'
    };

    function loadSettings() {
        chrome.storage.local.get(defaultSettings, function (items) {
            if (document.getElementById('focusDuration')) document.getElementById('focusDuration').value = items.ft_timer_duration;
            if (document.getElementById('breakDuration')) document.getElementById('breakDuration').value = items.breakDuration;

            if (document.getElementById('theme')) {
                document.getElementById('theme').value = items.darkMode ? 'dark' : 'light';
            }


            setToggle('autoStartBreaks', items.autoStartBreaks);
            updateBreakButtonVisibility(items.autoStartBreaks !== false);
            setToggle('showBreakButton', items.autoStartBreaks !== false ? false : items.showBreakButton);
            setToggle('playSound', items.playSound);

            setToggle('lockSettings', items.lockSettings);
            setToggle('showNotifications', items.showNotifications);


            setToggle('popup_visible_yt', items.popup_visible_yt);
            setToggle('popup_visible_ig', items.popup_visible_ig);
            setToggle('popup_visible_tt', items.popup_visible_tt);
            setToggle('popup_visible_fb', items.popup_visible_fb);
            setToggle('popup_visible_li', items.popup_visible_li);


            setToggle('restrictHiddenPlatforms', items.restrictHiddenPlatforms);
            setToggle('visualHideHiddenPlatforms', items.visualHideHiddenPlatforms);

            setToggle('hide_ig_stories', items.hide_ig_stories);
            setToggle('hide_fb_stories', items.hide_fb_stories);
            setToggle('hide_yt_shorts_nav', items.hide_yt_shorts_nav);
            setToggle('hide_ig_reels_nav', items.hide_ig_reels_nav);
            setToggle('hide_fb_reels_nav', items.hide_fb_reels_nav);
            setToggle('hide_li_feed', items.hide_li_feed);
            setToggle('hide_li_puzzles', items.hide_li_puzzles);
            setToggle('hide_li_addfeed', items.hide_li_addfeed);

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

            const accentColor = items.accentColor || '#4facfe';
            applyAccentColor(accentColor);
            document.querySelectorAll('.color-preset').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.color === accentColor);
            });
        });
    }

    function setToggle(id, value) {
        const toggle = document.getElementById(id);
        if (toggle) {
            toggle.checked = value;
        }
    }

    function updateBreakButtonVisibility(autoStartOn, shouldSave = false) {
        const breakButtonRow = document.getElementById('showBreakButton')?.closest('.setting-row');
        if (breakButtonRow) {
            breakButtonRow.classList.toggle('hidden-row', autoStartOn);
        }
        if (autoStartOn) {
            setToggle('showBreakButton', false);
            if (shouldSave) saveSetting('showBreakButton', false);
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
            if (this.id === 'autoStartBreaks') {
                updateBreakButtonVisibility(this.checked, true);
            }
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

function applyAccentColor(color) {
    document.documentElement.style.setProperty('--accent-primary', color);
}

document.querySelectorAll('.color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return;

        document.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        applyAccentColor(color);
        chrome.storage.local.set({ accentColor: color });
    });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "TIMER_COMPLETE") {
        chrome.storage.local.get(['playSound'], (res) => {
            if (res.playSound !== false) playBeep();
            sendResponse({ received: true });
        });
        return true;
    }
});

const platforms = {
    yt: { name: 'YouTube', settings: [{ id: 'hide_shorts_nav', label: 'Hide Shorts Button', desc: 'Hide the Shorts link in sidebar' }] },
    ig: { name: 'Instagram', settings: [{ id: 'hide_stories', label: 'Hide Stories', desc: 'Hide the Stories tray at the top' }, { id: 'hide_reels_nav', label: 'Hide Reels Button', desc: 'Hide the Reels tab in navigation' }] },
    tt: { name: 'TikTok', settings: [] },
    fb: { name: 'Facebook', settings: [{ id: 'hide_stories', label: 'Hide Stories', desc: 'Hide the Stories section' }, { id: 'hide_reels_nav', label: 'Hide Reels Button', desc: 'Hide the Reels link in sidebar' }] },
    li: { name: 'LinkedIn', settings: [{ id: 'hide_feed', label: 'Hide Feed', desc: 'Hide the main feed section' }, { id: 'hide_puzzles', label: 'Hide Puzzles', desc: 'Hide Today\'s puzzles section' }, { id: 'hide_addfeed', label: 'Hide Add to Feed', desc: 'Hide suggested follows' }] }
};

const modes = [
    { id: 'S', label: 'Strict', desc: 'Block and hide distracting content', color: '#ef4444' },
    { id: 'W', label: 'Warn', desc: 'Show overlay before allowing access', color: '#f59e0b' },
    { id: 'P', label: 'Passive', desc: 'Visual hiding only, no blocking', color: '#4facfe' }
];

let platformModes = { yt: 'S', ig: 'S', tt: 'S', fb: 'S', li: 'S' };
const platformSettings = {
    yt: { hide_shorts_nav: true },
    ig: { hide_stories: true, hide_reels_nav: true },
    tt: {},
    fb: { hide_stories: true, hide_reels_nav: true },
    li: { hide_feed: true, hide_puzzles: true, hide_addfeed: true }
};

let currentPlatform = null;

function loadPlatformModes() {
    chrome.storage.local.get(['platformSettings'], (result) => {
        if (result.platformSettings) {
            const modeMap = { strict: 'S', warn: 'W', allow: 'P' };
            Object.keys(result.platformSettings).forEach(id => {
                const mode = result.platformSettings[id];
                platformModes[id] = modeMap[mode] || 'S';
            });
        }
        ['yt', 'ig', 'tt', 'fb', 'li'].forEach(id => updateBadge(id, false));
    });
}

function savePlatformMode(id, mode) {
    const modeMap = { S: 'strict', W: 'warn', P: 'allow' };
    chrome.storage.local.get(['platformSettings'], (result) => {
        const settings = result.platformSettings || {};
        settings[id] = modeMap[mode] || 'strict';
        chrome.storage.local.set({ platformSettings: settings });
    });
}

document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('on');
        });
    });

    document.querySelectorAll('.select-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = trigger.nextElementSibling;
            const isOpen = dropdown && dropdown.classList.contains('open');
            document.querySelectorAll('.select-dropdown').forEach(d => d.classList.remove('open'));
            document.querySelectorAll('.select-trigger').forEach(t => t.classList.remove('open'));
            if (!isOpen && dropdown) {
                dropdown.classList.add('open');
                trigger.classList.add('open');
            }
        });
    });

    document.querySelectorAll('.select-option').forEach(option => {
        option.addEventListener('click', () => {
            const dropdown = option.parentElement;
            const trigger = dropdown.previousElementSibling;
            dropdown.querySelectorAll('.select-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            if (trigger && trigger.querySelector('span')) {
                trigger.querySelector('span').textContent = option.textContent.trim();
                trigger.dataset.value = option.dataset.value;
            }
            dropdown.classList.remove('open');
            if (trigger) trigger.classList.remove('open');
        });
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.select-dropdown').forEach(d => d.classList.remove('open'));
        document.querySelectorAll('.select-trigger').forEach(t => t.classList.remove('open'));
    });

    const platformGrid = document.getElementById('platformGrid');
    const platformDetail = document.getElementById('platformDetail');
    const backBtn = document.getElementById('backBtn');

    document.querySelectorAll('.platform-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPlatform = btn.dataset.platform;
            showPlatformDetail(currentPlatform);
        });
    });

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (platformDetail) {
                platformDetail.classList.remove('animate-slide-in');
                platformDetail.classList.add('animate-slide-out');
                setTimeout(() => {
                    platformDetail.classList.remove('active', 'animate-slide-out');
                    if (platformGrid) platformGrid.style.display = 'block';
                    currentPlatform = null;
                }, 250);
            }
        });
    }

    function updateAllBadges() {
        chrome.storage.local.get(['ft_timer_end', 'ft_timer_type'], (res) => {
            const isWorkTimer = res.ft_timer_end && res.ft_timer_end > Date.now() && res.ft_timer_type === 'work';
            ['yt', 'ig', 'tt', 'fb', 'li'].forEach(id => updateBadge(id, isWorkTimer));
        });
    }

    loadPlatformModes();

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.ft_timer_end || changes.ft_timer_type) {
                updateAllBadges();
            }
            if (changes.platformSettings) {
                loadPlatformModes();
            }
        }
    });
});

function showPlatformDetail(id) {
    const platform = platforms[id];
    const platformGrid = document.getElementById('platformGrid');
    const platformDetail = document.getElementById('platformDetail');

    if (platformGrid) platformGrid.style.display = 'none';
    if (platformDetail) {
        platformDetail.classList.add('active');
        platformDetail.classList.add('animate-slide-in');
    }

    const detailIcon = document.getElementById('detailIcon');
    const detailName = document.getElementById('detailName');
    const sourceSvg = document.querySelector(`[data-platform="${id}"] svg`);

    if (detailIcon && sourceSvg) detailIcon.innerHTML = sourceSvg.outerHTML;
    if (detailName) detailName.textContent = platform.name;

    const modeContainer = document.getElementById('modeButtons');
    if (modeContainer) {
        modeContainer.innerHTML = modes.map(mode => `
            <button class="mode-btn ${platformModes[id] === mode.id ? 'selected' : ''}" data-mode="${mode.id}">
                <div class="mode-radio" style="border-color: ${platformModes[id] === mode.id ? mode.color : ''}">
                    <div class="mode-dot" style="background: ${mode.color}"></div>
                </div>
                <div class="mode-info">
                    <span class="label">${mode.label}</span>
                    <span class="desc">${mode.desc}</span>
                </div>
            </button>
        `).join('');

        modeContainer.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modeContainer.querySelectorAll('.mode-btn').forEach(b => {
                    b.classList.remove('selected');
                    b.querySelector('.mode-radio').style.borderColor = '';
                });
                btn.classList.add('selected');
                const selectedMode = modes.find(m => m.id === btn.dataset.mode);
                btn.querySelector('.mode-radio').style.borderColor = selectedMode ? selectedMode.color : '';
                platformModes[id] = btn.dataset.mode;
                savePlatformMode(id, btn.dataset.mode);
                updateBadge(id);
            });
        });
    }

    const settingsSection = document.getElementById('visualHidingSection');
    const settingsContainer = document.getElementById('settingsToggles');
    if (platform.settings.length > 0 && settingsSection && settingsContainer) {
        settingsSection.style.display = 'block';
        settingsContainer.innerHTML = platform.settings.map(setting => `
            <div class="setting-row">
                <div class="setting-info">
                    <div class="setting-label">${setting.label}</div>
                    <div class="setting-desc">${setting.desc}</div>
                </div>
                <div class="toggle ${platformSettings[id][setting.id] ? 'on' : ''}" data-setting-id="${setting.id}">
                    <div class="toggle-thumb"></div>
                </div>
            </div>
        `).join('');

        settingsContainer.querySelectorAll('.toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('on');
                platformSettings[id][toggle.dataset.settingId] = toggle.classList.contains('on');
            });
        });
    } else if (settingsSection) {
        settingsSection.style.display = 'none';
    }
}

function updateBadge(id, isWorkTimer = false) {
    const badge = document.getElementById(`badge-${id}`);
    const btn = document.querySelector(`.platform-btn[data-platform="${id}"]`);
    if (!badge) return;
    const mode = isWorkTimer ? 'S' : platformModes[id];
    badge.textContent = mode;
    badge.className = 'platform-badge';
    if (btn) {
        btn.classList.remove('mode-strict', 'mode-warn', 'mode-passive');
    }
    if (mode === 'S') {
        badge.classList.add('badge-red');
        if (btn) btn.classList.add('mode-strict');
    } else if (mode === 'W') {
        badge.classList.add('badge-amber');
        if (btn) btn.classList.add('mode-warn');
    } else {
        badge.classList.add('badge-blue');
        if (btn) btn.classList.add('mode-passive');
    }
}
