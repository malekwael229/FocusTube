const toggle = document.getElementById('mainToggle');
const timerBtn = document.getElementById('timerBtn');
const timerDisplay = document.getElementById('timerDisplay');
const breakBtn = document.getElementById('breakBtn');
const toggleLockedLabel = document.getElementById('toggleLockedLabel');
const githubBtn = document.getElementById('githubBtn');
const settingsBtn = document.getElementById('settingsBtn');
const statShorts = document.getElementById('statShorts');
const statTime = document.getElementById('statTime');
const mainView = document.getElementById('main-view');
const platformDetail = document.getElementById('platform-detail');
const backBtn = document.getElementById('backBtn');
const detailTitle = document.getElementById('detailTitle');

let settings = { yt: 'strict', ig: 'strict', tt: 'strict', fb: 'strict', li: 'strict' };
let currentPlatform = null;
let timerInterval = null;

const PLATFORM_NAMES = {
    yt: 'YouTube',
    ig: 'Instagram',
    tt: 'TikTok',
    fb: 'Facebook',
    li: 'LinkedIn'
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => document.body.classList.remove('preload'), 100);

    initTutorial();
    initReviewPrompt();

    chrome.storage.local.get([
        'focusMode', 'platformSettings', 'darkMode', 'ft_timer_end', 'ft_timer_type',
        'ft_stats_blocked', 'popup_visible_yt', 'popup_visible_ig', 'popup_visible_tt',
        'popup_visible_fb', 'popup_visible_li', 'ft_timer_duration', 'tutorialCompleted',
        'showBreakButton', 'autoStartBreaks', 'ft_work_session_ended'
    ], (result) => {
        if (!result.tutorialCompleted) showTutorial();

        if (breakBtn) {
            const autoStartOn = result.autoStartBreaks !== false;
            const workSessionEnded = result.ft_work_session_ended === true;
            const showBtn = workSessionEnded && !autoStartOn && result.showBreakButton !== false;
            breakBtn.classList.toggle('hidden', !showBtn);
        }

        checkReviewPrompt(result.ft_stats_blocked || 0);

        toggle.checked = result.focusMode !== false;

        const duration = parseInt(result.ft_timer_duration) || 25;
        timerBtn.innerText = `Start Timer`;

        applyTheme(result.darkMode !== false);

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
                if (changes.ft_timer_end || changes.ft_timer_type) {
                    const newEnd = changes.ft_timer_end ? changes.ft_timer_end.newValue : null;
                    const newType = changes.ft_timer_type ? changes.ft_timer_type.newValue : null;

                    if (newEnd && newEnd > Date.now()) {
                        if (breakBtn) breakBtn.classList.add('hidden');
                        chrome.storage.local.get(['ft_timer_type'], (res) => {
                            startTimerDisplay(newEnd, newType || res.ft_timer_type);
                        });
                    }
                }
                if (changes.ft_work_session_ended && changes.ft_work_session_ended.newValue === true) {
                    chrome.storage.local.get(['autoStartBreaks', 'showBreakButton'], (res) => {
                        const autoStartOn = res.autoStartBreaks !== false;
                        const showBtn = !autoStartOn && res.showBreakButton !== false;
                        if (breakBtn) breakBtn.classList.toggle('hidden', !showBtn);
                    });
                }
            }
        });
    });
});

function updateStats(blocked) {
    if (statShorts) statShorts.textContent = blocked;
    if (statTime) {
        const mins = blocked || 0;
        if (mins < 60) statTime.textContent = `${mins}m`;
        else statTime.textContent = `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
}

function applyTheme() {
    document.body.classList.add('dark-mode');
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
    setupPlatformIconListeners();
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
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="28" height="28">
            <path fill="currentColor" d="${svgPaths[platform]}"/>
        </svg>
        <span class="platform-mode-badge">S</span>
    `;
    return btn;
}

function setupPlatformIconListeners() {
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
    yt: [{ key: 'hide_yt_shorts_nav', label: 'Hide Shorts Button' }],
    ig: [
        { key: 'hide_ig_stories', label: 'Hide Stories' },
        { key: 'hide_ig_reels_nav', label: 'Hide Reels Button' }
    ],
    fb: [
        { key: 'hide_fb_stories', label: 'Hide Stories' },
        { key: 'hide_fb_reels_nav', label: 'Hide Reels Button' }
    ],
    li: [
        { key: 'hide_li_feed', label: 'Hide Feed' },
        { key: 'hide_li_puzzles', label: 'Hide Puzzles' },
        { key: 'hide_li_addfeed', label: 'Hide "Add to Your Feed"' }
    ],
    tt: []
};

function showPlatformDetail(platform) {
    currentPlatform = platform;
    detailTitle.textContent = PLATFORM_NAMES[platform] || platform;

    chrome.storage.local.get(['ft_timer_end', 'ft_timer_type'], (res) => {
        const isWorkTimer = res.ft_timer_end && res.ft_timer_end > Date.now() && res.ft_timer_type === 'work';
        const activeMode = isWorkTimer ? 'strict' : settings[platform];

        document.querySelectorAll('.mode-option-detail').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.value === activeMode);
            opt.classList.remove('disabled');

            if (isWorkTimer && opt.dataset.value !== 'strict') {
                opt.classList.add('disabled');
            }

            const desc = opt.querySelector('.mode-desc');
            if (opt.dataset.value === 'warn') {
                if (platform === 'ig') {
                    opt.classList.add('disabled');
                    if (desc) desc.textContent = 'Coming Soon';
                } else {
                    if (desc) desc.textContent = 'Show warning overlay first';
                }
            }
        });
    });

    const settingsContainer = document.getElementById('platformSettings');
    settingsContainer.innerHTML = '';

    const platformToggles = PLATFORM_SETTINGS[platform] || [];
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
        });
    }

    mainView.style.display = 'none';
    platformDetail.classList.remove('hidden');
}

function hidePlatformDetail() {
    platformDetail.classList.add('closing');

    setTimeout(() => {
        platformDetail.classList.add('hidden');
        platformDetail.classList.remove('closing');
        mainView.style.display = 'block';
        currentPlatform = null;
    }, 200);
}

function setupEventListeners() {
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

    if (breakBtn) {
        breakBtn.addEventListener('click', () => {
            chrome.storage.local.get(['breakDuration'], (res) => {
                const duration = parseInt(res.breakDuration) || 5;
                chrome.storage.local.remove('ft_work_session_ended');
                breakBtn.classList.add('hidden');
                chrome.runtime.sendMessage({ action: 'startBreak', duration }, (response) => {
                    if (response && response.end) startTimerDisplay(response.end, 'break');
                });
            });
        });
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

    timerInterval = setInterval(() => {
        chrome.storage.local.get(['ft_timer_end'], (res) => {
            const currentEndTime = res.ft_timer_end;
            if (!currentEndTime || currentEndTime <= Date.now()) {
                resetTimerUI();
                return;
            }
            const remaining = currentEndTime - Date.now();
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        });
    }, 200);
}

function resetTimerUI() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;

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

function initTutorial() {
    const nextBtn = document.getElementById('tutorialNext');
    const skipBtn = document.getElementById('tutorialSkip');
    let currentSlide = 0;

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const prevSlide = currentSlide;
            currentSlide++;
            if (currentSlide >= 4) {
                completeTutorial();
            } else {
                goToSlide(currentSlide, currentSlide > prevSlide ? 'next' : 'prev');
            }
        });
    }

    if (skipBtn) {
        skipBtn.addEventListener('click', completeTutorial);
    }

    document.querySelectorAll('.tutorial-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const prevSlide = currentSlide;
            currentSlide = parseInt(dot.dataset.dot);
            goToSlide(currentSlide, currentSlide > prevSlide ? 'next' : 'prev');
        });
    });
}

function goToSlide(index, direction) {
    const slides = document.querySelectorAll('.tutorial-slide');

    slides.forEach((slide, i) => {
        slide.classList.remove('active', 'prev');
        if (i === index) {
            slide.classList.add('active');
        } else if (direction === 'prev' && i > index) {
            slide.classList.add('prev');
        }
    });

    document.querySelectorAll('.tutorial-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });

    const nextBtn = document.getElementById('tutorialNext');
    if (nextBtn) {
        nextBtn.textContent = index === 3 ? 'Get Started' : 'Next';
    }
}

function showTutorial() {
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function completeTutorial() {
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) overlay.classList.add('hidden');
    chrome.storage.local.set({ tutorialCompleted: true });
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
            chrome.storage.local.set({ reviewDismissed: true });
            hideReviewPrompt();
        });
    }

    if (reviewLater) {
        reviewLater.addEventListener('click', () => {
            chrome.storage.local.set({ reviewLaterTime: Date.now() + (7 * 24 * 60 * 60 * 1000) });
            hideReviewPrompt();
        });
    }
}

function checkReviewPrompt(blockedCount) {
    if (blockedCount < 20) return;
    chrome.storage.local.get(['reviewDismissed', 'reviewLaterTime'], (res) => {
        if (res.reviewDismissed) return;
        if (res.reviewLaterTime && Date.now() < res.reviewLaterTime) return;
        showReviewPrompt();
    });
}

function showReviewPrompt() {
    const prompt = document.getElementById('review-prompt');
    if (prompt) prompt.classList.remove('hidden');
}

function hideReviewPrompt() {
    const prompt = document.getElementById('review-prompt');
    if (prompt) {
        prompt.classList.add('fade-out');
        setTimeout(() => {
            prompt.classList.add('hidden');
            prompt.classList.remove('fade-out');
        }, 300);
    }
}
