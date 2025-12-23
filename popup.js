const toggle = document.getElementById('mainToggle');
const timerBtn = document.getElementById('timerBtn');
const timerDisplay = document.getElementById('timerDisplay');
const timerLabel = document.getElementById('timerLabel');
const timerNote = document.getElementById('timerNote');
const lightBtn = document.getElementById('lightBtn');
const darkBtn = document.getElementById('darkBtn');
const githubBtn = document.getElementById('githubBtn');
const statShorts = document.getElementById('statShorts');
const statTime = document.getElementById('statTime');

let settings = {
    yt: 'strict',
    ig: 'strict',
    tt: 'strict',
    fb: 'strict'
};
document.addEventListener('DOMContentLoaded', () => {
    // Remove preload class
    setTimeout(() => document.body.classList.remove('preload'), 100);

    // Load Data
    chrome.storage.local.get(['focusMode', 'platformSettings', 'darkMode', 'ft_timer', 'ft_timer_end', 'ft_timer_type', 'ft_stats_blocked'], (result) => {
        const isEnabled = result.focusMode !== false;
        toggle.checked = isEnabled;

        // Dark Mode (Default TRUE)
        const isDark = result.darkMode !== false;
        applyTheme(isDark);

        // Settings
        if (result.platformSettings) {
            settings = { ...settings, ...result.platformSettings };
        }

        // Stats
        updateStats(result.ft_stats_blocked || 0);

        // Timer
        if (result.ft_timer_end && result.ft_timer_end > Date.now()) {
            startTimerDisplay(result.ft_timer_end, result.ft_timer_type);
        }

        // Initialize Cards
        initializeCards();

        // Listeners
        setupEventListeners();
    });
});

function applyTheme(isDark) {
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


function setupEventListeners() {
    // Global Toggle
    toggle.addEventListener('change', () => {
        const isEnabled = toggle.checked;
        chrome.storage.local.set({ focusMode: isEnabled });
        // updateGlobalToggleState(isEnabled); // Removed coupling
    });

    // GitHub Button
    if (githubBtn) {
        githubBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://github.com/malekwael229/FocusTube' });
        });
    }

    // Timer
    timerBtn.addEventListener('click', () => {
        if (timerBtn.classList.contains('active')) {
            chrome.runtime.sendMessage({ action: 'stopTimer' });
            resetTimerUI();
        } else {
            chrome.runtime.sendMessage({ action: 'startTimer', duration: 25 }, (res) => {
                if (res && res.end) startTimerDisplay(res.end, 'work');
            });
        }
    });

    // Theme Control
    lightBtn.addEventListener('click', () => {
        applyTheme(false);
        chrome.storage.local.set({ darkMode: false });
    });

    darkBtn.addEventListener('click', () => {
        applyTheme(true);
        chrome.storage.local.set({ darkMode: true });
    });

    document.querySelectorAll('.card-header').forEach(header => {
        header.addEventListener('click', (e) => {
            const card = header.closest('.platform-card');
            const wasActive = card.classList.contains('active');

            document.querySelectorAll('.platform-card').forEach(c => {
                c.classList.remove('active');
                c.querySelector('.card-header').setAttribute('aria-expanded', 'false');
                c.querySelector('.card-content').style.maxHeight = null;
            });

            if (!wasActive) {
                card.classList.add('active');
                header.setAttribute('aria-expanded', 'true');
                const content = card.querySelector('.card-content');
                content.style.maxHeight = content.scrollHeight + "px";
            }
        });
    });

    // Option Buttons
    document.querySelectorAll('.mode-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            if (opt.classList.contains('disabled')) return;
            const card = opt.closest('.platform-card');
            const platform = card.dataset.platform;
            const value = opt.dataset.value;

            // Save
            settings[platform] = value;
            chrome.storage.local.set({ platformSettings: settings });

            // Update UI for this card
            updateCardUI(card, value);
        });
    });
}

function initializeCards() {
    document.querySelectorAll('.platform-card').forEach(card => {
        const platform = card.dataset.platform;
        let mode = settings[platform] || 'strict';

        updateCardUI(card, mode);
    });
}

function updateCardUI(card, mode) {
    const statusEl = card.querySelector('.card-status');

    card.classList.remove('mode-strict', 'mode-warn', 'mode-allow');
    card.classList.add('mode-' + mode);

    const modeLabels = {
        'strict': 'Mode: Strict',
        'warn': 'Mode: Soft',
        'allow': 'Mode: Passive'
    };
    statusEl.innerText = modeLabels[mode];

    card.querySelectorAll('.mode-option').forEach(opt => {
        if (opt.dataset.value === mode) {
            opt.classList.add('selected');
        } else {
            opt.classList.remove('selected');
        }
    });
}



function updateStats(count) {
    if (statShorts) statShorts.innerText = count;
    if (statTime) {
        // Estimate: 1 minute saved per blocked short
        const minutes = count;
        if (minutes < 60) {
            statTime.innerText = `${minutes}m`;
        } else {
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            statTime.innerText = `${h}h ${m}m`;
        }
    }
}

// Timer Logic
let timerInterval;
function startTimerDisplay(endTime, type) {
    clearInterval(timerInterval);

    // UI Setup
    timerDisplay.classList.remove('hidden');
    timerLabel.classList.remove('hidden');
    timerBtn.classList.add('active');

    if (type === 'break') {
        timerBtn.classList.add('break');
        timerBtn.innerText = "Stop Break";
        timerLabel.innerText = "BREAK TIME";
        unlockControls();
    } else {
        timerBtn.innerText = "End Timer";
        timerLabel.innerText = "Pomodoro Timer Active";
        lockControlsForTimer();
    }

    const update = () => {
        const left = Math.ceil((endTime - Date.now()) / 1000);
        if (left <= 0) {
            clearInterval(timerInterval);
            resetTimerUI();
            return;
        }
        const m = Math.floor(left / 60).toString().padStart(2, '0');
        const s = (left % 60).toString().padStart(2, '0');
        timerDisplay.innerText = `${m}:${s}`;
    };

    update();
    timerInterval = setInterval(update, 1000);
}

function resetTimerUI() {
    timerDisplay.classList.add('hidden');
    timerLabel.classList.add('hidden');
    timerBtn.classList.remove('active', 'break');
    timerBtn.innerText = "Start Pomodoro Timer (25m)";
    unlockControls();
}

function lockControlsForTimer() {
    // Lock Main Toggle
    toggle.disabled = true;
    toggle.parentElement.classList.add('locked');

    // Force Strict Mode on all
    const newSettings = { yt: 'strict', ig: 'strict', tt: 'strict', fb: 'strict' };
    settings = newSettings;
    chrome.storage.local.set({ platformSettings: newSettings, focusMode: true });

    // Ensure Global is ON
    toggle.checked = true;

    // Update UI
    document.querySelectorAll('.platform-card').forEach(card => {
        updateCardUI(card, 'strict');
        // Lock Options
        card.querySelectorAll('.mode-option').forEach(opt => {
            if (opt.dataset.value !== 'strict') {
                opt.classList.add('timer-locked', 'disabled');

                // Get Base Text
                const map = {
                    'warn': 'Soft: Warn me first',
                    'allow': 'Passive: Let me watch'
                };
                let txt = map[opt.dataset.value] || "";
                if (card.dataset.platform === 'ig' && opt.dataset.value === 'warn') {
                    txt = "Soft: Warn me first (Soon)";
                }

                opt.querySelector('.mode-option-text').innerText = `${txt} (Locked)`;
            }
        });
    });
}

function unlockControls() {
    toggle.disabled = false;
    toggle.parentElement.classList.remove('locked');

    // Restore UI strings
    document.querySelectorAll('.platform-card').forEach(card => {
        const platform = card.dataset.platform;
        // Refresh to clear locks
        updateCardUI(card, settings[platform]);

        // Reset text for non-selected options
        card.querySelectorAll('.mode-option').forEach(opt => {
            opt.classList.remove('timer-locked', 'disabled');

            const map = {
                'strict': 'Strict: Kick me out',
                'warn': 'Soft: Warn me first',
                'allow': 'Passive: Let me watch'
            };

            let txt = map[opt.dataset.value];
            if (card.dataset.platform === 'ig' && opt.dataset.value === 'warn') {
                txt = "Soft: Warn me first (Soon)";
                opt.classList.add('disabled'); // Keep IG disabled
            }

            opt.querySelector('.mode-option-text').innerText = txt;
        });
    });
}

// Global Smooth Scroll
const scroller = document.documentElement; // Usually html in extensions
let pos = scroller.scrollTop;
let target = scroller.scrollTop;
let isMoving = false;

window.addEventListener('wheel', (e) => {
    e.preventDefault();
    target += e.deltaY;

    // Clamp
    const max = scroller.scrollHeight - scroller.clientHeight;
    target = Math.max(0, Math.min(target, max));

    if (!isMoving) {
        isMoving = true;
        updateScroll();
    }
}, { passive: false });

function updateScroll() {
    // Re-check scroller in case it changed (rare but safe)
    const el = document.scrollingElement || document.documentElement || document.body;

    const delta = target - pos;
    if (Math.abs(delta) < 0.5) {
        pos = target;
        el.scrollTop = pos;
        isMoving = false;
        return;
    }

    pos += delta * 0.1; // Smoothness factor
    el.scrollTop = pos;
    requestAnimationFrame(updateScroll);
}

// Smooth Scroll Logic (Momentum)
// Target the wrapper specifically
const scrollContainer = document.getElementById('smooth-scroll-wrapper');

if (scrollContainer) {
    let currentScroll = scrollContainer.scrollTop;
    let targetScroll = scrollContainer.scrollTop;
    let isScrolling = false;

    scrollContainer.addEventListener('wheel', (e) => {
        // Prevent default only if content is scrollable
        if (scrollContainer.scrollHeight > scrollContainer.clientHeight) {
            e.preventDefault();

            targetScroll += e.deltaY;

            // Clamp
            const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
            targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));

            if (!isScrolling) {
                isScrolling = true;
                requestAnimationFrame(animateScroll);
            }
        }
    }, { passive: false });

    function animateScroll() {
        const diff = targetScroll - currentScroll;

        if (Math.abs(diff) < 0.5) {
            currentScroll = targetScroll;
            scrollContainer.scrollTop = currentScroll;
            isScrolling = false;
            return;
        }

        currentScroll += diff * 0.08;
        scrollContainer.scrollTop = currentScroll;

        if (isScrolling) {
            requestAnimationFrame(animateScroll);
        }
    }
}
