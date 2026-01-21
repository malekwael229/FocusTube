const toggle = document.getElementById('mainToggle');
const enabledToggle = document.getElementById('enabledToggle');
const extensionStatusLabel = document.getElementById('extensionStatusLabel');
const timerBtn = document.getElementById('timerBtn');
const timerDisplay = document.getElementById('timerDisplay');
const breakBtn = document.getElementById('breakBtn');
const toggleLockedLabel = document.getElementById('toggleLockedLabel');
const githubBtn = document.getElementById('githubBtn');
const settingsBtn = document.getElementById('settingsBtn');
const statShorts = document.getElementById('statShorts');
const statTime = document.getElementById('statTime');
const popupControls = document.getElementById('popupControls');
const mainView = document.getElementById('main-view');
const platformDetail = document.getElementById('platform-detail');
const backBtn = document.getElementById('backBtn');
const detailTitle = document.getElementById('detailTitle');
let settings = { yt: 'strict', ig: 'strict', tt: 'strict', fb: 'strict', li: 'strict' };
let currentPlatform = null;
let timerInterval = null;
let timerEndTime = null;
const PLATFORM_NAMES = {
    yt: 'YouTube',
    ig: 'Instagram',
    tt: 'TikTok',
    fb: 'Facebook',
    li: 'LinkedIn'
};
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => document.body.classList.remove('preload'), 100);
    initReviewPrompt();
    chrome.storage.local.get([
        'ft_enabled', 'focusMode', 'platformSettings', 'darkMode', 'ft_timer_end', 'ft_timer_type',
        'ft_stats_blocked', 'popup_visible_yt', 'popup_visible_ig', 'popup_visible_tt',
        'popup_visible_fb', 'popup_visible_li', 'ft_timer_duration', 'tutorialCompleted',
        'showBreakButton', 'autoStartBreaks', 'ft_work_session_ended'
    ], (result) => {
        if (breakBtn) {
            const autoStartOn = result.autoStartBreaks !== false;
            const workSessionEnded = result.ft_work_session_ended === true;
            const showBtn = workSessionEnded && !autoStartOn && result.showBreakButton !== false;
            breakBtn.classList.toggle('hidden', !showBtn);
        }
        checkReviewPrompt(result.ft_stats_blocked || 0);
        const isEnabled = result.ft_enabled !== false;
        if (enabledToggle) enabledToggle.checked = isEnabled;
        toggle.checked = result.focusMode !== false;
        applyExtensionEnabledState(isEnabled);
        const duration = parseInt(result.ft_timer_duration) || 25;
        timerBtn.innerText = `Start Timer`;
        const isDark = resolveDarkMode(result.darkMode);
        applyTheme(isDark);
        if (result.platformSettings) {
            settings = { ...settings, ...result.platformSettings };
        }
        updateStats(result.ft_stats_blocked || 0);
        updatePlatformVisibility(result);
        if (result.ft_timer_end && result.ft_timer_end > Date.now()) {
            startTimerDisplay(result.ft_timer_end, result.ft_timer_type);
        }
        setupEventListeners();
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') {
                if (changes.platformSettings && changes.platformSettings.newValue) {
                    settings = { ...settings, ...changes.platformSettings.newValue };
                    updateAllPlatformIcons();
                }
                if (changes.ft_enabled) {
                    const isEnabled = changes.ft_enabled.newValue !== false;
                    if (enabledToggle) enabledToggle.checked = isEnabled;
                    applyExtensionEnabledState(isEnabled);
                }
                if (changes.ft_timer_end || changes.ft_timer_type) {
                    const newEnd = changes.ft_timer_end ? changes.ft_timer_end.newValue : null;
                    const newType = changes.ft_timer_type ? changes.ft_timer_type.newValue : null;
                    if (newEnd && newEnd > Date.now()) {
                        if (breakBtn) breakBtn.classList.add('hidden');
                        chrome.storage.local.get(['ft_timer_type'], (res) => {
                            startTimerDisplay(newEnd, newType || res.ft_timer_type);
                        });
                    } else if (changes.ft_timer_end) {
                        resetTimerUI();
                    }
                }
                if (changes.ft_work_session_ended && changes.ft_work_session_ended.newValue === true) {
                    chrome.storage.local.get(['autoStartBreaks', 'showBreakButton'], (res) => {
                        const autoStartOn = res.autoStartBreaks !== false;
                        const showBtn = !autoStartOn && res.showBreakButton !== false;
                        const breakWrapper = document.getElementById('breakWrapper');
                        if (breakWrapper) breakWrapper.classList.toggle('hidden', !showBtn);
                    });
                }
                if (changes.darkMode) {
                    applyTheme(resolveDarkMode(changes.darkMode.newValue));
                }
                if (changes.ft_stats_blocked) {
                    const blocked = changes.ft_stats_blocked.newValue || 0;
                    checkReviewPrompt(blocked);
                }
            }
        });
    });
});
function applyExtensionEnabledState(isEnabled) {
    document.body.classList.toggle('ft-disabled', !isEnabled);
    if (extensionStatusLabel) extensionStatusLabel.textContent = isEnabled ? 'Enabled' : 'Disabled';
}
function updateStats(blocked) {
    if (statShorts) statShorts.textContent = blocked;
    if (statTime) {
        const mins = blocked || 0;
        if (mins < 60) statTime.textContent = `${mins}m`;
        else statTime.textContent = `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
}
function applyTheme(isDark) {
    document.body.classList.toggle('dark-mode', Boolean(isDark));
}
function resolveDarkMode(value) {
    if (value === undefined) return true;
    return value === true || value === 1 || value === 'true';
}
function updateAllPlatformIcons() {
    chrome.storage.local.get(['ft_timer_end', 'ft_timer_type'], (res) => {
        const isWorkTimer = res.ft_timer_end && res.ft_timer_end > Date.now() && res.ft_timer_type === 'work';
        document.querySelectorAll('.platform-icon').forEach(icon => {
            const platform = icon.dataset.platform;
            const mode = isWorkTimer ? 'strict' : (settings[platform] || 'strict');
            updatePlatformIcon(icon, mode);
        });
    });
}
function updatePlatformVisibility(visibility) {
    const platformGrid = document.querySelector('.platform-grid');
    if (!platformGrid) return;
    const allPlatforms = ['yt', 'ig', 'tt', 'fb', 'li'];
    const visiblePlatforms = allPlatforms.filter(p => visibility[`popup_visible_${p}`] !== false);
    platformGrid.innerHTML = '';
    let currentRow = null;
    let itemsInRow = 0;
    const rows = [];
    visiblePlatforms.forEach((platform, index) => {
        const totalVisible = visiblePlatforms.length;
        const targetPerRow = 2;
        let inLastRow = false;
        if (totalVisible <= 2) {
            inLastRow = true;
        } else if (totalVisible === 3) {
            inLastRow = index === 2;
        } else if (totalVisible === 4) {
            inLastRow = index >= 2;
        } else {
            inLastRow = index === 4;
        }
        if (index === 0 || itemsInRow >= targetPerRow || (inLastRow && rows.length * targetPerRow === index)) {
            currentRow = document.createElement('div');
            currentRow.className = 'platform-grid-row';
            rows.push(currentRow);
            platformGrid.appendChild(currentRow);
            itemsInRow = 0;
        }
        const btn = createPlatformButton(platform);
        currentRow.appendChild(btn);
        itemsInRow++;
    });
    if (rows.length > 0 && rows[rows.length - 1].children.length === 1) {
        rows[rows.length - 1].classList.add('platform-grid-row-center');
    }
    updateAllPlatformIcons();
}
function createPlatformButton(platform) {
    const svgPaths = {
        yt: 'M23.5 6.2c-.3-1-1-1.8-2-2.1C19.8 3.5 12 3.5 12 3.5s-7.8 0-9.5.6c-1 .3-1.7 1.1-2 2.1C0 7.9 0 12 0 12s0 4.1.5 5.8c.3 1 1 1.8 2 2.1 1.7.6 9.5.6 9.5.6s7.8 0 9.5-.6c1-.3 1.7-1.1 2-2.1.5-1.7.5-5.8.5-5.8s0-4.1-.5-5.8zM9.5 15.5v-7l6.4 3.5-6.4 3.5z',
        ig: 'M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.3 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .3-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.3-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.3 2.2-.4 1.3-.1 1.7-.1 4.9-.1M12 0C8.7 0 8.3 0 7 .1 5.7.2 4.8.3 4 .6c-.9.3-1.6.7-2.3 1.4C1 2.7.6 3.4.3 4.3.1 5.1 0 6 0 7.3 0 8.6 0 9 0 12.3s0 3.7.1 5c.1 1.3.2 2.2.5 3 .3.9.7 1.6 1.4 2.3.7.7 1.4 1.1 2.3 1.4.8.3 1.7.4 3 .5 1.3.1 1.7.1 5 .1s3.7 0 5-.1c1.3-.1 2.2-.2 3-.5.9-.3 1.6-.7 2.3-1.4.7-.7 1.1-1.4 1.4-2.3.3-.8.4-1.7.5-3 .1-1.3.1-1.7.1-5s0-3.7-.1-5c-.1-1.3-.2-2.2-.5-3-.3-.9-.7-1.6-1.4-2.3C21.6 1 20.9.6 20 .3c-.8-.3-1.7-.4-3-.5C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 100 12.4 6.2 6.2 0 000-12.4zM12 16a4 4 0 110-8 4 4 0 010 8zm6.4-10.8a1.4 1.4 0 100 2.8 1.4 1.4 0 000-2.8z',
        tt: 'M19.3 7.3c-1.4-.1-2.7-.7-3.6-1.6-.9-.9-1.5-2.1-1.6-3.4h-3.2v13.3c0 1.7-1.4 3.1-3.1 3.1s-3.1-1.4-3.1-3.1 1.4-3.1 3.1-3.1c.3 0 .6 0 .9.1V9.2c-.3 0-.6-.1-.9-.1-3.5 0-6.4 2.9-6.4 6.4s2.9 6.4 6.4 6.4 6.4-2.9 6.4-6.4V10c1.3.9 2.9 1.4 4.5 1.4V8.1c-.5.1-1 .2-1.5.2v-1z',
        fb: 'M24 12c0-6.6-5.4-12-12-12S0 5.4 0 12c0 6 4.4 11 10.1 11.9v-8.4H7.1V12h3v-2.7c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-2 .9-2 1.9V12h3.3l-.5 3.5h-2.8v8.4C19.6 23 24 18 24 12z',
        li: 'M20.4 20.4h-3.5v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.4V9h3.4v1.6h.1c.5-.9 1.6-1.8 3.4-1.8 3.6 0 4.3 2.4 4.3 5.5v6.1zM5.3 7.4c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm1.8 13H3.5V9h3.5v11.4zM22.2 0H1.8C.8 0 0 .8 0 1.8v20.4c0 1 .8 1.8 1.8 1.8h20.4c1 0 1.8-.8 1.8-1.8V1.8c0-1-.8-1.8-1.8-1.8z'
    };
    const titles = { yt: 'YouTube', ig: 'Instagram', tt: 'TikTok', fb: 'Facebook', li: 'LinkedIn' };
    const btn = document.createElement('button');
    btn.className = 'platform-icon';
    btn.dataset.platform = platform;
    btn.title = titles[platform];
    btn.setAttribute('aria-label', `${titles[platform]} settings`);
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path fill="currentColor" d="${svgPaths[platform]}"/>
        </svg>
        <span class="platform-mode-badge" aria-hidden="true">S</span>
    `;
    return btn;
}
function updatePlatformIcon(icon, mode) {
    icon.classList.remove('mode-strict', 'mode-warn', 'mode-allow');
    icon.classList.add(`mode-${mode}`);
    const badge = icon.querySelector('.platform-mode-badge');
    if (badge) {
        badge.textContent = mode === 'strict' ? 'S' : mode === 'warn' ? 'W' : 'P';
    }
}
const PLATFORM_SETTINGS = {
    yt: [
        { key: 'hide_yt_shorts_nav', label: 'Hide Shorts Button' },
        { key: 'hide_yt_shorts_shelves', label: 'Hide Shorts Shelves' }
    ],
    ig: [
        { key: 'hide_ig_stories', label: 'Hide Stories' },
        { key: 'hide_ig_reels_nav', label: 'Hide Reels Button' },
        { key: 'hide_ig_feed_reels', label: 'Hide Reels in Feed' }
    ],
    fb: [
        { key: 'hide_fb_stories', label: 'Hide Stories' },
        { key: 'hide_fb_reels_nav', label: 'Hide Reels Button' }
    ],
    li: [
        { key: 'hide_li_feed', label: 'Hide Feed' },
        { key: 'hide_li_addfeed', label: 'Hide "Add to Your Feed"' }
    ],
    tt: []
};
function showPlatformDetail(platform) {
    currentPlatform = platform;
    detailTitle.textContent = PLATFORM_NAMES[platform] || platform;
    chrome.storage.local.get(['ft_timer_end', 'ft_timer_type'], (res) => {
        const isWorkTimer = res.ft_timer_end && res.ft_timer_end > Date.now() && res.ft_timer_type === 'work';
        let activeMode = isWorkTimer ? 'strict' : settings[platform];
        if (platform === 'ig' && activeMode === 'warn') {
            activeMode = 'strict';
        }
        document.querySelectorAll('.mode-option-detail').forEach(opt => {
            const isWarn = opt.dataset.value === 'warn';
            if (platform === 'ig') {
                if (isWarn) {
                    opt.classList.add('disabled');
                    opt.style.pointerEvents = 'none';
                    opt.style.opacity = '0.5';
                }
            } else {
                opt.classList.remove('hidden');
            }
            opt.classList.toggle('selected', opt.dataset.value === activeMode);
            if (!(platform === 'ig' && isWarn)) {
                opt.classList.remove('disabled');
                opt.style.pointerEvents = '';
                opt.style.opacity = '';
            }
            if (isWorkTimer && opt.dataset.value !== 'strict') {
                opt.classList.add('disabled');
            }
            const desc = opt.querySelector('.mode-desc');
            const modeVal = opt.dataset.value;
            if (desc) {
                if (platform === 'li') {
                    if (modeVal === 'strict') desc.textContent = 'Hides feed & distracting elements';
                    if (modeVal === 'warn') desc.textContent = 'Hides feed, allows "View Anyway"';
                    if (modeVal === 'allow') desc.textContent = 'Does not hide anything';
                } else if (platform === 'ig' && modeVal === 'warn') {
                    desc.textContent = 'Coming Soon';
                } else if (modeVal === 'allow') {
                    desc.textContent = 'Normal browsing';
                } else if (modeVal === 'warn') {
                    desc.textContent = 'Show warning overlay first';
                } else if (modeVal === 'strict') {
                    desc.textContent = 'Block access completely';
                }
            }
        });
    });
    const settingsContainer = document.getElementById('platformSettings');
    settingsContainer.innerHTML = '';
    const platformToggles = PLATFORM_SETTINGS[platform] || [];
    const performTransition = () => {
        platformDetail.classList.remove('closing');
        const popupControls = document.getElementById('popupControls');
        const startHeight = popupControls.offsetHeight;
        mainView.classList.add('view-hidden');
        platformDetail.classList.remove('hidden');
        const endHeight = popupControls.offsetHeight;
        if (startHeight !== endHeight) {
            popupControls.style.height = startHeight + 'px';
            popupControls.style.transition = 'none';
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    popupControls.style.transition = 'height 200ms cubic-bezier(0.16, 1, 0.3, 1)';
                    popupControls.style.height = endHeight + 'px';
                    const onEnd = () => {
                        popupControls.removeEventListener('transitionend', onEnd);
                        popupControls.style.height = '';
                        popupControls.style.transition = '';
                    };
                    popupControls.addEventListener('transitionend', onEnd, { once: true });
                });
            });
        }
    };
    if (platformToggles.length > 0) {
        chrome.storage.local.get(platformToggles.map(t => t.key), (result) => {
            platformToggles.forEach(toggle => {
                const isChecked = result[toggle.key] !== false;
                const row = document.createElement('div');
                row.className = 'platform-setting-row';
                row.innerHTML = `
                    <span class="platform-setting-label">${toggle.label}</span>
                    <label class="mini-switch">
                        <input type="checkbox" data-key="${toggle.key}" ${isChecked ? 'checked' : ''}>
                        <span class="mini-slider"></span>
                    </label>
                `;
                settingsContainer.appendChild(row);
            });
            performTransition();
        });
    } else {
        performTransition();
    }
}
function hidePlatformDetail() {
    if (platformDetail.classList.contains('hidden')) return;
    const popupControls = document.getElementById('popupControls');
    const startHeight = popupControls.offsetHeight;
    mainView.classList.remove('view-hidden');
    platformDetail.classList.add('hidden');
    const endHeight = popupControls.offsetHeight;
    if (startHeight !== endHeight) {
        popupControls.style.height = startHeight + 'px';
        popupControls.style.transition = 'none';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                popupControls.style.transition = 'height 200ms cubic-bezier(0.16, 1, 0.3, 1)';
                popupControls.style.height = endHeight + 'px';
                const onEnd = () => {
                    popupControls.removeEventListener('transitionend', onEnd);
                    popupControls.style.height = '';
                    popupControls.style.transition = '';
                };
                popupControls.addEventListener('transitionend', onEnd, { once: true });
            });
        });
    }
    currentPlatform = null;
}
function setupEventListeners() {
    if (enabledToggle) {
        enabledToggle.addEventListener('change', () => {
            chrome.storage.local.set({ ft_enabled: enabledToggle.checked });
        });
    }
    toggle.addEventListener('change', () => {
        chrome.storage.local.set({ focusMode: toggle.checked });
    });
    if (githubBtn) {
        githubBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://github.com/malekwael229/FocusTube' });
        });
    }
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });
    }
    if (backBtn) {
        backBtn.addEventListener('click', hidePlatformDetail);
    }
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('change', handleCheckboxChange);
    chrome.storage.onChanged.addListener((changes) => {
        for (const [key, { newValue }] of Object.entries(changes)) {
            const toggle = document.querySelector(`.mini-switch input[data-key="${key}"]`);
            if (toggle) {
                toggle.checked = newValue !== false;
            }
        }
    });
    timerBtn.addEventListener('click', () => {
        if (timerBtn.classList.contains('active')) {
            chrome.runtime.sendMessage({ action: 'stopTimer' });
            resetTimerUI();
        } else {
            chrome.storage.local.get(['ft_timer_duration'], (res) => {
                const duration = parseInt(res.ft_timer_duration) || 25;
                chrome.runtime.sendMessage({ action: 'startTimer', duration }, (response) => {
                    if (response && response.end) startTimerDisplay(response.end, 'work');
                });
            });
        }
    });
    const breakWrapper = document.getElementById('breakWrapper');
    const skipBreakBtn = document.getElementById('skipBreakBtn');
    if (breakBtn && breakWrapper) {
        breakBtn.addEventListener('click', () => {
            chrome.storage.local.get(['breakDuration'], (res) => {
                const duration = parseInt(res.breakDuration) || 5;
                chrome.storage.local.remove('ft_work_session_ended');
                breakWrapper.classList.add('hidden');
                chrome.runtime.sendMessage({ action: 'startBreak', duration }, (response) => {
                    if (response && response.end) startTimerDisplay(response.end, 'break');
                });
            });
        });
        if (skipBreakBtn) {
            skipBreakBtn.addEventListener('click', () => {
                chrome.storage.local.remove('ft_work_session_ended');
                breakWrapper.classList.add('hidden');
            });
        }
    }
    window.addEventListener('unload', cleanup);
}
function handleDocumentClick(e) {
    const platformIcon = e.target.closest('.platform-icon');
    if (platformIcon) {
        showPlatformDetail(platformIcon.dataset.platform);
        return;
    }
    const modeOption = e.target.closest('.mode-option-detail');
    if (modeOption && currentPlatform && !modeOption.classList.contains('disabled')) {
        const mode = modeOption.dataset.value;
        if (currentPlatform === 'ig' && mode === 'warn') return;
        settings[currentPlatform] = mode;
        chrome.storage.local.set({ platformSettings: settings });
        document.querySelectorAll('.mode-option-detail').forEach(o => o.classList.remove('selected'));
        modeOption.classList.add('selected');
        const icon = document.querySelector(`.platform-icon[data-platform="${currentPlatform}"]`);
        if (icon) updatePlatformIcon(icon, mode);
    }
}
function handleCheckboxChange(e) {
    if (e.target.matches('.mini-switch input')) {
        chrome.storage.local.set({ [e.target.dataset.key]: e.target.checked });
    }
}
function cleanup() {
    if (timerInterval) clearInterval(timerInterval);
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('change', handleCheckboxChange);
}
function startTimerDisplay(endTime, type) {
    timerBtn.classList.add('active');
    timerBtn.innerText = 'Stop Timer';
    timerDisplay.classList.remove('hidden', 'break');
    timerEndTime = endTime;
    if (type === 'break') {
        timerDisplay.classList.add('break');
    }
    if (type === 'work') {
        toggle.checked = true;
        toggle.disabled = true;
        if (toggleLockedLabel) toggleLockedLabel.classList.remove('hidden');
    } else if (type === 'break') {
        toggle.checked = false;
        toggle.disabled = true;
        if (toggleLockedLabel) toggleLockedLabel.classList.remove('hidden');
    } else {
        toggle.disabled = false;
        if (toggleLockedLabel) toggleLockedLabel.classList.add('hidden');
    }
    updateAllPlatformIcons();
    if (timerInterval) clearInterval(timerInterval);
    const initialRemaining = endTime - Date.now();
    if (initialRemaining > 0) {
        const initMins = Math.floor(initialRemaining / 60000);
        const initSecs = Math.floor((initialRemaining % 60000) / 1000);
        timerDisplay.textContent = `${String(initMins).padStart(2, '0')}:${String(initSecs).padStart(2, '0')}`;
    }
    timerInterval = setInterval(() => {
        if (!timerEndTime || timerEndTime <= Date.now()) {
            resetTimerUI();
            return;
        }
        const remaining = timerEndTime - Date.now();
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, 1000);
}
function resetTimerUI() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerEndTime = null;
    chrome.storage.local.get(['ft_timer_end', 'ft_timer_type'], (res) => {
        if (res.ft_timer_end && res.ft_timer_end > Date.now()) {
            startTimerDisplay(res.ft_timer_end, res.ft_timer_type);
            return;
        }
        timerBtn.classList.remove('active');
        chrome.storage.local.get(['ft_timer_duration', 'focusMode'], (res2) => {
            const duration = parseInt(res2.ft_timer_duration) || 25;
            timerBtn.innerText = `Start Timer`;
            toggle.checked = res2.focusMode !== false;
        });
        timerDisplay.classList.add('fade-out');
        setTimeout(() => {
            timerDisplay.classList.add('hidden');
            timerDisplay.classList.remove('fade-out');
            timerDisplay.textContent = '00:00';
        }, 100);
        toggle.disabled = false;
        if (toggleLockedLabel) toggleLockedLabel.classList.add('hidden');
        updateAllPlatformIcons();
    });
}
const TUTORIAL_STEPS = [
    {
        type: 'modal',
        title: 'Welcome to FocusTube!',
        description: 'Take a quick tour to learn how to stay focused and block distractions.',
        icon: 'icons/icon128.png',
        buttonText: 'Start Tour'
    },
    {
        type: 'spotlight',
        target: '.platform-grid',
        title: 'Platform Controls',
        description: 'Click any platform icon to change its blocking mode. Manage YouTube, Facebook, Instagram, TikTok, and LinkedIn.',
        position: 'bottom',
        buttonText: 'Next'
    },
    {
        type: 'spotlight',
        target: '.platform-icon',
        title: 'Blocking Modes',
        description: 'Each platform shows a badge: S (Strict) blocks always, W (Warn) asks before showing, P (Paused) allows access.',
        position: 'bottom',
        buttonText: 'Next'
    },
    {
        type: 'spotlight',
        target: '.control-row',
        title: 'Focus Toggle',
        description: 'Turn Focus Mode on or off with this switch. When enabled, your selected blocking rules take effect.',
        position: 'top',
        buttonText: 'Next'
    },
    {
        type: 'spotlight',
        target: '#timerBtn',
        title: 'Timer Button',
        description: 'Start a focus or break timer. Work sessions enforce strict blocking, while breaks allow free browsing.',
        position: 'top',
        buttonText: 'Next'
    },
    {
        type: 'spotlight',
        target: '#settingsBtn',
        title: 'Settings',
        description: 'Access advanced options, manage hidden elements, set schedules, and customize your focus experience.',
        position: 'left',
        buttonText: 'Next'
    },
    {
        type: 'modal',
        title: "You're All Set!",
        description: 'You know the basics. Stay focused and productive!',
        icon: 'checkmark',
        buttonText: 'Finish'
    }
];
const TutorialController = {
    currentStep: 0,
    overlay: null,
    spotlight: null,
    tooltip: null,
    highlightedElement: null,
    init: function() {
        this.overlay = document.getElementById('tutorial-overlay');
        this.spotlight = document.getElementById('tutorial-spotlight');
        this.tooltip = document.getElementById('tutorial-tooltip');
        const nextBtn = document.getElementById('tutorialNext');
        const skipBtn = document.getElementById('tutorialSkip');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextStep());
        }
        if (skipBtn) {
            skipBtn.addEventListener('click', () => this.complete());
        }
    },
    start: function() {
        this.currentStep = 0;
        if (this.overlay) {
            this.overlay.classList.remove('hidden');
            requestAnimationFrame(() => {
                this.overlay.classList.add('active');
                if (this.tooltip) {
                    this.tooltip.classList.add('visible');
                }
            });
        }
        this.showStep(0);
    },
    showStep: function(index) {
        const step = TUTORIAL_STEPS[index];
        if (!step) return;
        this.currentStep = index;
        if (this.highlightedElement) {
            this.highlightedElement.classList.remove('tutorial-highlight');
            this.highlightedElement = null;
        }
        const indicator = document.getElementById('tutorial-step-indicator');
        if (indicator) {
            indicator.textContent = `${index + 1} of ${TUTORIAL_STEPS.length}`;
        }
        const nextBtn = document.getElementById('tutorialNext');
        if (nextBtn) {
            nextBtn.textContent = step.buttonText || 'Next';
        }
        const title = document.getElementById('tutorial-title');
        const description = document.getElementById('tutorial-description');
        const iconContainer = document.getElementById('tutorial-icon-container');
        if (title) title.textContent = step.title;
        if (description) description.textContent = step.description;
        if (step.type === 'modal') {
            this.showModalStep(step, iconContainer);
        } else {
            this.showSpotlightStep(step, iconContainer);
        }
    },
    showModalStep: function(step, iconContainer) {
        if (this.spotlight) {
            this.spotlight.style.display = 'none';
        }
        if (this.tooltip) {
            this.tooltip.classList.add('modal-style');
            this.tooltip.classList.remove('arrow-top', 'arrow-bottom', 'arrow-left', 'arrow-right');
            this.tooltip.style.left = '';
            this.tooltip.style.top = '';
            this.tooltip.style.transform = '';
        }
        if (iconContainer) {
            iconContainer.innerHTML = '';
            if (step.icon === 'checkmark') {
                iconContainer.innerHTML = '<svg class="tutorial-checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            } else if (step.icon) {
                const img = document.createElement('img');
                img.src = chrome.runtime.getURL(step.icon);
                img.alt = 'FocusTube';
                iconContainer.appendChild(img);
            }
            iconContainer.classList.remove('hidden');
        }
    },
    showSpotlightStep: function(step, iconContainer) {
        if (iconContainer) {
            iconContainer.classList.add('hidden');
        }
        if (this.tooltip) {
            this.tooltip.classList.remove('modal-style');
        }
        const target = document.querySelector(step.target);
        if (!target) {
            this.showModalStep(step, iconContainer);
            return;
        }
        target.classList.add('tutorial-highlight');
        this.highlightedElement = target;
        const rect = target.getBoundingClientRect();
        const padding = 8;
        if (this.spotlight) {
            this.spotlight.style.display = 'block';
            this.spotlight.style.left = (rect.left - padding) + 'px';
            this.spotlight.style.top = (rect.top - padding) + 'px';
            this.spotlight.style.width = (rect.width + padding * 2) + 'px';
            this.spotlight.style.height = (rect.height + padding * 2) + 'px';
        }
        this.positionTooltip(rect, step.position);
    },
    positionTooltip: function(targetRect, preferredPosition) {
        if (!this.tooltip) return;
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 12;
        const arrowOffset = 16;
        const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
        this.tooltip.classList.remove('arrow-top', 'arrow-bottom', 'arrow-left', 'arrow-right');
        let left, top;
        let position = preferredPosition;
        const spaceAbove = targetRect.top;
        const spaceBelow = viewportHeight - targetRect.bottom;
        const spaceLeft = targetRect.left;
        const spaceRight = viewportWidth - targetRect.right;
        const tooltipWidth = Math.min(
            tooltipRect.width || this.tooltip.offsetWidth || 240,
            viewportWidth - margin * 2
        );
        const tooltipHeight = Math.min(
            tooltipRect.height || this.tooltip.offsetHeight || 160,
            viewportHeight - margin * 2
        );
        this.tooltip.style.maxWidth = `${viewportWidth - margin * 2}px`;
        if (position === 'top' && spaceAbove < tooltipHeight + margin) {
            position = spaceBelow > spaceAbove ? 'bottom' : 'top';
        } else if (position === 'bottom' && spaceBelow < tooltipHeight + margin) {
            position = spaceAbove > spaceBelow ? 'top' : 'bottom';
        } else if (position === 'left' && spaceLeft < tooltipWidth + margin) {
            position = spaceRight > spaceLeft ? 'right' : 'left';
        } else if (position === 'right' && spaceRight < tooltipWidth + margin) {
            position = spaceLeft > spaceRight ? 'left' : 'right';
        }
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const targetCenterY = targetRect.top + targetRect.height / 2;
        switch (position) {
            case 'top':
                left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
                top = targetRect.top - tooltipHeight - arrowOffset;
                this.tooltip.classList.add('arrow-bottom');
                break;
            case 'bottom':
                left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
                top = targetRect.bottom + arrowOffset;
                this.tooltip.classList.add('arrow-top');
                break;
            case 'left':
                left = targetRect.left - tooltipWidth - arrowOffset;
                top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
                this.tooltip.classList.add('arrow-right');
                break;
            case 'right':
                left = targetRect.right + arrowOffset;
                top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
                this.tooltip.classList.add('arrow-left');
                break;
        }
        left = Math.max(margin, Math.min(left, viewportWidth - tooltipWidth - margin));
        top = Math.max(margin, Math.min(top, viewportHeight - tooltipHeight - margin));
        if (position === 'top' || position === 'bottom') {
            const arrowX = clamp(targetCenterX - left, 12, tooltipWidth - 12);
            this.tooltip.style.setProperty('--arrow-x', `${arrowX}px`);
            this.tooltip.style.setProperty('--arrow-y', '');
        } else if (position === 'left' || position === 'right') {
            const arrowY = clamp(targetCenterY - top, 12, tooltipHeight - 12);
            this.tooltip.style.setProperty('--arrow-y', `${arrowY}px`);
            this.tooltip.style.setProperty('--arrow-x', '');
        }
        this.tooltip.style.left = left + 'px';
        this.tooltip.style.top = top + 'px';
        this.tooltip.style.transform = 'none';
    },
    nextStep: function() {
        if (this.currentStep < TUTORIAL_STEPS.length - 1) {
            this.showStep(this.currentStep + 1);
        } else {
            this.complete();
        }
    },
    complete: function() {
        if (this.highlightedElement) {
            this.highlightedElement.classList.remove('tutorial-highlight');
            this.highlightedElement = null;
        }
        if (this.tooltip) {
            this.tooltip.classList.remove('visible');
        }
        if (this.overlay) {
            this.overlay.classList.remove('active');
            setTimeout(() => {
                this.overlay.classList.add('hidden');
            }, 200);
        }
        chrome.storage.local.set({ tutorialCompleted: true });
    }
};
function initTutorial() {
    TutorialController.init();
}
function showTutorial() {
    TutorialController.start();
}
function completeTutorial() {
    TutorialController.complete();
}
const STORE_URLS = {
    chrome: 'https://chromewebstore.google.com/detail/focustube-distraction-blo/ppdjgkniggbikifojmkindmbhppmoell',
    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/focus-tube/',
    edge: 'https://microsoftedge.microsoft.com/addons/detail/focustube-distraction-bl/emffahlehkfdlknpmpndaabhigchhoog'
};
function detectBrowser() {
    const ua = navigator.userAgent;
    if (ua.includes('Edg/')) return 'edge';
    if (ua.includes('Firefox/')) return 'firefox';
    return 'chrome';
}
function initReviewPrompt() {
    const reviewNow = document.getElementById('reviewNow');
    const reviewLater = document.getElementById('reviewLater');
    if (reviewNow) {
        reviewNow.addEventListener('click', () => {
            chrome.tabs.create({ url: STORE_URLS[detectBrowser()] || STORE_URLS.chrome });
            chrome.storage.local.set({ reviewDismissed: true, reviewNextBlock: null });
            hideReviewPrompt();
        });
    }
    if (reviewLater) {
        reviewLater.addEventListener('click', () => {
            chrome.storage.local.get(['ft_stats_blocked'], (res) => {
                const current = parseInt(res.ft_stats_blocked, 10) || 0;
                const next = current + 20;
                chrome.storage.local.set({ reviewNextBlock: next }, () => hideReviewPrompt());
            });
        });
    }
}
function checkReviewPrompt(blockedCount) {
    chrome.storage.local.get(['reviewDismissed', 'reviewNextBlock'], (res) => {
        if (res.reviewDismissed) return;
        const threshold = (typeof res.reviewNextBlock === 'number') ? res.reviewNextBlock : 20;
        if (blockedCount >= threshold) showReviewPrompt();
    });
}
function showReviewPrompt() {
    const prompt = document.getElementById('review-prompt');
    if (prompt) {
        prompt.classList.remove('hidden');
        prompt.classList.add('show');
    }
    document.body.classList.add('review-visible');
    document.documentElement.classList.add('review-visible');
    adjustPopupHeight();
}
function hideReviewPrompt() {
    const prompt = document.getElementById('review-prompt');
    if (prompt) {
        prompt.classList.add('fade-out');
        prompt.classList.remove('show');
        setTimeout(() => {
            prompt.classList.add('hidden');
            prompt.classList.remove('fade-out');
        }, 300);
    }
    document.body.classList.remove('review-visible');
    document.documentElement.classList.remove('review-visible');
    adjustPopupHeight(true);
}
function adjustPopupHeight(reset = false) {
    const root = document.documentElement;
    const body = document.body;
    if (reset) {
        root.style.height = '';
        body.style.height = '';
        return;
    }
    const content = document.getElementById('popupControls');
    if (!content) return;
    const desired = Math.max(
        content.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.scrollHeight
    ) + 12;
    root.style.height = desired + 'px';
    body.style.height = desired + 'px';
}
