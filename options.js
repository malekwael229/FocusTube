document.addEventListener('DOMContentLoaded', function () {
    const defaultSettings = {
        ft_enabled: true,
        ft_timer_duration: 25,
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
        hide_yt_shorts_shelves: true,
        hide_ig_reels_nav: true,
        hide_fb_reels_nav: true,
        hide_li_feed: true,
        hide_li_addfeed: true,
        showBreakButton: true,
        accentColor: '#4facfe'
    };
    const importBooleanKeys = new Set([
        ...Object.keys(defaultSettings).filter((key) => typeof defaultSettings[key] === 'boolean'),
        'tutorialCompleted',
        'reviewDismissed',
        'ft_work_session_ended',
        'ft_debug'
    ]);
    const importNumberKeys = new Set([
        ...Object.keys(defaultSettings).filter((key) => typeof defaultSettings[key] === 'number'),
        'ft_timer_end',
        'reviewLaterTime'
    ]);
    const importNullableNumberKeys = new Set(['ft_timer_end', 'reviewLaterTime']);
    const importStringKeys = new Set([
        ...Object.keys(defaultSettings).filter((key) => typeof defaultSettings[key] === 'string'),
        'ft_timer_type'
    ]);
    const importAllowedKeys = new Set([
        ...importBooleanKeys,
        ...importNumberKeys,
        ...importStringKeys,
        'platformSettings'
    ]);
    const importPlatformKeys = ['yt', 'ig', 'tt', 'fb', 'li'];
    const importPlatformModes = new Set(['strict', 'warn', 'allow']);
    function sanitizeImportData(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { error: 'Import file must contain a JSON object.' };
        }
        const sanitized = {};
        const invalidKeys = [];
        importBooleanKeys.forEach((key) => {
            if (!(key in raw)) return;
            if (typeof raw[key] === 'boolean') sanitized[key] = raw[key];
            else invalidKeys.push(key);
        });
        importNumberKeys.forEach((key) => {
            if (!(key in raw)) return;
            if (raw[key] === null) {
                if (importNullableNumberKeys.has(key)) {
                    sanitized[key] = null;
                } else {
                    invalidKeys.push(key);
                }
                return;
            }
            const value = Number(raw[key]);
            if (Number.isFinite(value) && value >= 0) {
                sanitized[key] = key === 'ft_stats_blocked' ? Math.floor(value) : value;
            } else {
                invalidKeys.push(key);
            }
        });
        importStringKeys.forEach((key) => {
            if (!(key in raw)) return;
            const value = raw[key];
            if (key === 'accentColor') {
                if (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)) {
                    sanitized[key] = value;
                } else {
                    invalidKeys.push(key);
                }
                return;
            }
            if (key === 'ft_timer_type') {
                if (value === null) {
                    sanitized[key] = null;
                } else if (value === 'work' || value === 'break') {
                    sanitized[key] = value;
                } else {
                    invalidKeys.push(key);
                }
                return;
            }
            if (typeof value === 'string') sanitized[key] = value;
            else invalidKeys.push(key);
        });
        if ('platformSettings' in raw) {
            if (!raw.platformSettings || typeof raw.platformSettings !== 'object' || Array.isArray(raw.platformSettings)) {
                invalidKeys.push('platformSettings');
            } else {
                const platformSettings = {};
                importPlatformKeys.forEach((platform) => {
                    if (!(platform in raw.platformSettings)) return;
                    const mode = raw.platformSettings[platform];
                    if (importPlatformModes.has(mode)) {
                        platformSettings[platform] = (platform === 'ig' && mode === 'warn') ? 'strict' : mode;
                    } else {
                        invalidKeys.push(`platformSettings.${platform}`);
                    }
                });
                if (Object.keys(platformSettings).length > 0) {
                    sanitized.platformSettings = platformSettings;
                }
            }
        }
        if (invalidKeys.length > 0) {
            return { error: `Invalid values for: ${invalidKeys.join(', ')}` };
        }
        return { sanitized };
    }
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
            const accentColor = items.accentColor || '#4facfe';
            applyAccentColor(accentColor);
            document.querySelectorAll('.color-preset').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.color === accentColor);
            });
            applyExtensionEnabledState(items.ft_enabled !== false);
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
            if (this.id === 'ft_enabled') {
                applyExtensionEnabledState(this.checked);
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
                    const { sanitized, error } = sanitizeImportData(data);
                    if (error) {
                        alert(`Error importing data: ${error}`);
                        return;
                    }
                    if (!sanitized || Object.keys(sanitized).length === 0) {
                        alert('Error importing data: No supported settings found.');
                        return;
                    }
                    if (confirm('Importing data will overwrite your current settings and stats. Are you sure you want to continue?')) {
                        chrome.storage.local.clear(() => {
                            chrome.storage.local.set(sanitized, () => {
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
            if (darkBtn) darkBtn.classList.add('active');
            if (lightBtn) lightBtn.classList.remove('active');
        } else {
            document.body.classList.remove('dark-mode');
            if (lightBtn) lightBtn.classList.add('active');
            if (darkBtn) darkBtn.classList.remove('active');
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
    const headerBackBtn = document.getElementById('headerBackBtn');
    if (headerBackBtn) {
        headerBackBtn.addEventListener('click', function () {
            window.close();
        });
    }
    const headerGithubBtn = document.getElementById('headerGithubBtn');
    if (headerGithubBtn) {
        headerGithubBtn.addEventListener('click', function () {
            chrome.tabs.create({ url: 'https://github.com/malekwael229/FocusTube' });
        });
    }
    const starBtn = document.getElementById('starRepo');
    if (starBtn) {
        starBtn.addEventListener('click', function () {
            chrome.tabs.create({ url: 'https://github.com/malekwael229/FocusTube' });
        });
    }
    const rateUsBtn = document.getElementById('rateUs');
    if (rateUsBtn) {
        rateUsBtn.addEventListener('click', function () {
            const ua = navigator.userAgent;
            let storeUrl = 'https://chromewebstore.google.com/detail/focustube-distraction-blo/ppdjgkniggbikifojmkindmbhppmoell';
            if (ua.includes('Edg/')) {
                storeUrl = 'https://microsoftedge.microsoft.com/addons/detail/focustube-distraction-bl/emffahlehkfdlknpmpndaabhigchhoog';
            } else if (ua.includes('Firefox/')) {
                storeUrl = 'https://addons.mozilla.org/en-US/firefox/addon/focus-tube/';
            }
            chrome.tabs.create({ url: storeUrl });
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
    function disableToggles(disabled) {
        const alwaysEnabled = new Set([
            'backBtn', 'supportProject', 'ft_enabled',
            'headerBackBtn', 'headerGithubBtn',
            'starRepo', 'rateUs', 'reportIssue',
            'importData', 'exportData', 'resetSettings', 'clearData',
            'importFile'
        ]);
        document.querySelectorAll('input, select, button:not(.mode-btn):not(.platform-btn)').forEach(el => {
            if (alwaysEnabled.has(el.id)) return;
            el.disabled = disabled;
            if (el.parentElement) {
                if (disabled) el.parentElement.classList.add('disabled-look');
                else el.parentElement.classList.remove('disabled-look');
            }
        });
    }
    function disableModeButtons(disabled) {
        document.querySelectorAll('.mode-btn, .platform-btn').forEach(el => {
            el.disabled = disabled;
            if (disabled) el.classList.add('disabled-look');
            else el.classList.remove('disabled-look');
        });
    }
    function updateDisabledState() {
        chrome.storage.local.get(['ft_timer_end', 'ft_timer_type', 'ft_enabled', 'lockSettings'], (res) => {
            const wasTimerActive = timerActive;
            timerActive = Boolean(res.ft_timer_end && res.ft_timer_end > Date.now());
            const settingsLocked = timerActive && res.lockSettings;
            const isEnabled = res.ft_enabled !== false;
            const enabledToggle = document.getElementById('ft_enabled');
            if (enabledToggle) enabledToggle.checked = isEnabled;
            applyExtensionEnabledState(isEnabled);
            disableModeButtons(timerActive || !isEnabled);
            disableToggles(settingsLocked || !isEnabled);
            document.body.classList.toggle('timer-active-locked', timerActive);
            updateTimerActivePill(timerActive, wasTimerActive);
        });
    }
    function updateTimerActivePill(isActive, wasActive) {
        const pill = document.getElementById('timerActivePill');
        if (!pill) return;
        if (isActive && !wasActive) {
            pill.classList.remove('fade-out');
            pill.classList.add('visible');
        } else if (!isActive && wasActive) {
            pill.classList.add('fade-out');
            pill.addEventListener('animationend', function handler() {
                pill.classList.remove('visible', 'fade-out');
                pill.removeEventListener('animationend', handler);
            }, { once: true });
        } else if (isActive) {
            pill.classList.add('visible');
            pill.classList.remove('fade-out');
        }
    }
    updateDisabledState();
    setInterval(updateDisabledState, 1000);
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.focusMode) {
            setToggle('focusMode', changes.focusMode.newValue !== false);
        }
        if (changes.ft_enabled) {
            const isEnabled = changes.ft_enabled.newValue !== false;
            setToggle('ft_enabled', isEnabled);
            applyExtensionEnabledState(isEnabled);
            updateDisabledState();
        }
        if (changes.ft_stats_blocked) {
            const blocked = changes.ft_stats_blocked.newValue || 0;
            if (document.getElementById('totalBlocked')) {
                document.getElementById('totalBlocked').textContent = blocked;
            }
            if (document.getElementById('timeSaved')) {
                let timeSavedText = "0m";
                if (blocked < 60) timeSavedText = `${blocked} min`;
                else {
                    const h = Math.floor(blocked / 60);
                    const m = blocked % 60;
                    timeSavedText = `${h}h ${m}m`;
                }
                document.getElementById('timeSaved').textContent = timeSavedText;
            }
        }
        for (const [key, { newValue }] of Object.entries(changes)) {
            if (key.startsWith('hide_')) {
                setToggle(key, newValue);
            }
        }
        if (changes.ft_timer_duration) {
            const el = document.getElementById('focusDuration');
            if (el) {
                el.value = changes.ft_timer_duration.newValue;
                el.dispatchEvent(new Event('change'));
            }
        }
        if (changes.breakDuration) {
            const el = document.getElementById('breakDuration');
            if (el) {
                el.value = changes.breakDuration.newValue;
                el.dispatchEvent(new Event('change'));
            }
        }
    });
    initPlatformGrid();
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
        osc.onended = () => {
            try { if (ctx && ctx.close) ctx.close(); } catch (e) { }
        };
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
function applyExtensionEnabledState(isEnabled) {
    document.body.classList.toggle('ft-disabled', !isEnabled);
}
const platforms = {
    yt: {
        name: 'YouTube',
        settings: [
            { id: 'hide_yt_shorts_nav', label: 'Hide Shorts Button', desc: 'Hide the Shorts link in sidebar' },
            { id: 'hide_yt_shorts_shelves', label: 'Hide Shorts Shelves', desc: 'Hide Shorts shelves in feed' }
        ]
    },
    ig: {
        name: 'Instagram',
        settings: [
            { id: 'hide_ig_stories', label: 'Hide Stories', desc: 'Hide the Stories tray at the top' },
            { id: 'hide_ig_reels_nav', label: 'Hide Reels Button', desc: 'Hide the Reels tab in navigation' }
        ]
    },
    tt: { name: 'TikTok', settings: [] },
    fb: {
        name: 'Facebook',
        settings: [
            { id: 'hide_fb_stories', label: 'Hide Stories', desc: 'Hide the Stories section' },
            { id: 'hide_fb_reels_nav', label: 'Hide Reels Button', desc: 'Hide the Reels link in sidebar' }
        ]
    },
    li: {
        name: 'LinkedIn',
        settings: [
            { id: 'hide_li_feed', label: 'Hide Feed', desc: 'Hide the main feed section' },
            { id: 'hide_li_addfeed', label: 'Hide Add to Feed', desc: 'Hide suggested follows' }
        ]
    }
};
const modes = [
    { id: 'S', label: 'Strict', desc: 'Block access completely', color: '#ef4444' },
    { id: 'W', label: 'Warn', desc: 'Show a warning before entering', color: '#f59e0b' },
    { id: 'P', label: 'Passive', desc: 'Normal browsing', color: '#4facfe' }
];
const modesByPlatform = {
    default: modes,
    ig: modes.map(m => m.id === 'W' ? { ...m, disabled: true, desc: 'Coming Soon' } : m),
    li: [
        { id: 'S', label: 'Strict', desc: 'Hides feed & distracting elements', color: '#ef4444' },
        { id: 'W', label: 'Warn', desc: 'Hides feed, allows "View Anyway"', color: '#f59e0b' },
        { id: 'P', label: 'Passive', desc: 'Does not hide anything', color: '#4facfe' }
    ]
};
function getModesForPlatform(id) {
    if (id === 'li') return modesByPlatform.li;
    if (id === 'ig') return modesByPlatform.ig;
    return modesByPlatform.default;
}
let platformModes = { yt: 'S', ig: 'S', tt: 'S', fb: 'S', li: 'S' };
let currentPlatform = null;
let timerActive = false;
function loadPlatformModes() {
    chrome.storage.local.get(['platformSettings', 'ft_timer_end', 'ft_timer_type'], (result) => {
        if (result.platformSettings) {
            const modeMap = { strict: 'S', warn: 'W', allow: 'P' };
            Object.keys(result.platformSettings).forEach(id => {
                const mode = result.platformSettings[id];
                const nextMode = modeMap[mode] || 'S';
                platformModes[id] = (id === 'ig' && nextMode === 'W') ? 'S' : nextMode;
            });
        }
        const isWorkTimer = result.ft_timer_end && result.ft_timer_end > Date.now() && result.ft_timer_type === 'work';
        ['yt', 'ig', 'tt', 'fb', 'li'].forEach(id => updateBadge(id, isWorkTimer));
    });
}
function savePlatformMode(id, mode) {
    const modeMap = { S: 'strict', W: 'warn', P: 'allow' };
    if (id === 'ig' && mode === 'W') mode = 'S';
    chrome.storage.local.get(['platformSettings'], (result) => {
        const settings = result.platformSettings || {};
        settings[id] = modeMap[mode] || 'strict';
        chrome.storage.local.set({ platformSettings: settings });
    });
}
function initPlatformGrid() {
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
    updateAllBadges();
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
}
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
        if (id === 'ig' && platformModes[id] === 'W') platformModes[id] = 'S';
        const availableModes = getModesForPlatform(id);
        modeContainer.innerHTML = availableModes.map(mode => `
            <button class="mode-btn ${platformModes[id] === mode.id ? 'selected' : ''} ${mode.disabled ? 'disabled' : ''}" 
                    data-mode="${mode.id}" ${mode.disabled ? 'disabled' : ''}>
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
                if (timerActive) return;
                modeContainer.querySelectorAll('.mode-btn').forEach(b => {
                    b.classList.remove('selected');
                    b.querySelector('.mode-radio').style.borderColor = '';
                });
                btn.classList.add('selected');
                const selectedMode = availableModes.find(m => m.id === btn.dataset.mode);
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
        const settingKeys = platform.settings.map(setting => setting.id);
        chrome.storage.local.get(settingKeys, (res) => {
            settingsContainer.innerHTML = platform.settings.map(setting => {
                const isOn = res[setting.id] !== false;
                return `
                    <div class="setting-row">
                        <div class="setting-info">
                            <div class="setting-label">${setting.label}</div>
                            <div class="setting-desc">${setting.desc}</div>
                        </div>
                        <div class="toggle ${isOn ? 'on' : ''}" data-setting-key="${setting.id}">
                            <div class="toggle-thumb"></div>
                        </div>
                    </div>
                `;
            }).join('');
            settingsContainer.querySelectorAll('.toggle').forEach(toggle => {
                toggle.addEventListener('click', () => {
                    const key = toggle.dataset.settingKey;
                    const nextValue = !toggle.classList.contains('on');
                    toggle.classList.toggle('on', nextValue);
                    chrome.storage.local.set({ [key]: nextValue });
                });
            });
        });
    } else if (settingsSection) {
        settingsSection.style.display = 'none';
    }
    function checkTimerState() {
        chrome.storage.local.get(['ft_timer_end'], (res) => {
            timerActive = Boolean(res.ft_timer_end && res.ft_timer_end > Date.now());
            const inputs = document.querySelectorAll('input, select, button.mode-btn');
            inputs.forEach(input => {
                if (input.closest('.about-section') || input.id === 'exportBtn' || input.id === 'importBtn' || input.id === 'importFile') return;
                input.disabled = timerActive;
                input.classList.toggle('disabled-by-timer', timerActive);
            });
            document.body.classList.toggle('timer-active-locked', timerActive);
        });
    }
    checkTimerState();
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.ft_timer_end || changes.ft_timer_type) {
            checkTimerState();
        }
    });
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
