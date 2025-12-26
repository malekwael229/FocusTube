const toggle = document.getElementById('mainToggle');
const timerBtn = document.getElementById('timerBtn');
const timerDisplay = document.getElementById('timerDisplay');
const timerLabel = document.getElementById('timerLabel');
const timerNote = document.getElementById('timerNote');
const toggleLockedLabel = document.getElementById('toggleLockedLabel');
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

    setTimeout(() => document.body.classList.remove('preload'), 100);



    chrome.storage.local.get(['focusMode', 'platformSettings', 'darkMode', 'ft_timer', 'ft_timer_end', 'ft_timer_type', 'ft_stats_blocked', 'popup_visible_yt', 'popup_visible_ig', 'popup_visible_tt', 'popup_visible_fb', 'ft_timer_duration', 'showStatsInPopup'], (result) => {
        const isEnabled = result.focusMode !== false;
        toggle.checked = isEnabled;

        const duration = parseInt(result.ft_timer_duration) || 25;
        if (!result.ft_timer_end) {
            timerBtn.innerText = `Start Timer (${duration}m)`;
        }

        if (result.popup_visible_yt === false) document.querySelector('.platform-card[data-platform="yt"]')?.classList.add('hidden');
        if (result.popup_visible_ig === false) document.querySelector('.platform-card[data-platform="ig"]')?.classList.add('hidden');
        if (result.popup_visible_tt === false) document.querySelector('.platform-card[data-platform="tt"]')?.classList.add('hidden');
        if (result.popup_visible_fb === false) document.querySelector('.platform-card[data-platform="fb"]')?.classList.add('hidden');

        if (result.autoStartBreaks === false && !result.ft_timer_end) {
            const breakBtn = document.getElementById('breakBtn');
            if (breakBtn) breakBtn.classList.remove('hidden');
        }


        const isDark = result.darkMode !== false;
        applyTheme(isDark);


        if (result.platformSettings) {
            settings = { ...settings, ...result.platformSettings };
        }


        if (result.showStatsInPopup === false) {
            document.querySelector('.stats-container').classList.add('hidden');
        }

        updateStats(result.ft_stats_blocked || 0);


        if (result.ft_timer_end && result.ft_timer_end > Date.now()) {
            startTimerDisplay(result.ft_timer_end, result.ft_timer_type);
        }


        initializeCards();


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

    toggle.addEventListener('change', () => {
        const isEnabled = toggle.checked;
        chrome.storage.local.set({ focusMode: isEnabled });

    });


    if (githubBtn) {
        githubBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://github.com/malekwael229/FocusTube' });
        });
    }


    timerBtn.addEventListener('click', () => {
        if (timerBtn.classList.contains('active')) {
            chrome.runtime.sendMessage({ action: 'stopTimer' }, (response) => {
                if (chrome.runtime.lastError) void chrome.runtime.lastError;
            });
            resetTimerUI();
        } else {
            chrome.storage.local.get(['ft_timer_duration'], (res) => {
                const duration = parseInt(res.ft_timer_duration) || 25;
                chrome.runtime.sendMessage({ action: 'startTimer', duration: duration }, (res) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error starting timer:', chrome.runtime.lastError);
                        return;
                    }
                    if (res && res.end) startTimerDisplay(res.end, 'work');
                });
            });
        }
    });

    const breakBtn = document.getElementById('breakBtn');
    if (breakBtn) {
        breakBtn.addEventListener('click', () => {
            chrome.storage.local.get(['breakDuration'], (res) => {
                const duration = parseInt(res.breakDuration) || 5;
                chrome.runtime.sendMessage({ action: 'startTimer', duration: duration, type: 'break' }, (res) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error starting break:', chrome.runtime.lastError);
                        return;
                    }
                    if (res && res.end) startTimerDisplay(res.end, 'break');
                });
            });
        });
    }




    lightBtn.addEventListener('click', () => {
        applyTheme(false);
        chrome.storage.local.set({ darkMode: false });
    });

    darkBtn.addEventListener('click', () => {
        applyTheme(true);
        chrome.storage.local.set({ darkMode: true });
    });

    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                window.open(chrome.runtime.getURL('options.html'));
            }
        });
    }

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


    document.querySelectorAll('.mode-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            if (opt.classList.contains('disabled')) return;
            if (timerBtn.classList.contains('active')) return; // Prevent changes while timer is active
            const card = opt.closest('.platform-card');
            const platform = card.dataset.platform;
            const value = opt.dataset.value;


            settings[platform] = value;
            chrome.storage.local.set({ platformSettings: settings });


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


let timerInterval;
function startTimerDisplay(endTime, type) {
    clearInterval(timerInterval);


    timerDisplay.classList.remove('hidden');
    timerLabel.classList.remove('hidden');
    timerBtn.classList.add('active');

    const breakBtn = document.getElementById('breakBtn');
    if (breakBtn) breakBtn.classList.add('hidden');



    if (type === 'break') {
        timerBtn.classList.add('break');
        timerBtn.innerText = "Stop Break";
        timerLabel.innerText = "BREAK TIME";
        lockControlsForBreak();
    } else {
        timerBtn.innerText = "End Timer";
        timerLabel.innerText = "Focus Timer Active";
        lockControlsForTimer();
    }

    const update = () => {
        const left = Math.ceil((endTime - Date.now()) / 1000);
        if (left <= 0) {
            clearInterval(timerInterval);
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



    chrome.storage.local.get(['ft_timer_duration', 'autoStartBreaks'], (res) => {
        const duration = res.ft_timer_duration || 25;
        timerBtn.innerText = `Start Timer (${duration}m)`;

        if (res.autoStartBreaks === false) {
            const breakBtn = document.getElementById('breakBtn');
            if (breakBtn) breakBtn.classList.remove('hidden');
        }
    });

    unlockControls();
}

function lockControlsForTimer() {

    toggle.disabled = true;
    toggle.parentElement.classList.add('locked');
    if (toggleLockedLabel) {
        toggleLockedLabel.innerText = "LOCKED";
        toggleLockedLabel.classList.remove('hidden', 'break');
    }


    const newSettings = { yt: 'strict', ig: 'strict', tt: 'strict', fb: 'strict' };
    settings = newSettings;
    chrome.storage.local.set({ platformSettings: newSettings, focusMode: true });


    toggle.checked = true;


    document.querySelectorAll('.platform-card').forEach(card => {
        updateCardUI(card, 'strict');
        card.querySelector('.card-status').innerText = "Strict (Locked by Timer)";

        card.querySelectorAll('.mode-option').forEach(opt => {
            if (opt.dataset.value !== 'strict') {
                opt.classList.add('timer-locked', 'disabled');


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

function lockControlsForBreak() {

    toggle.disabled = true;
    toggle.parentElement.classList.add('locked');
    if (toggleLockedLabel) {
        toggleLockedLabel.innerText = "LOCKED";
        toggleLockedLabel.classList.remove('hidden');
        toggleLockedLabel.classList.add('break');
    }


    const newSettings = { yt: 'allow', ig: 'allow', tt: 'allow', fb: 'allow' };
    settings = newSettings;
    chrome.storage.local.set({ platformSettings: newSettings, focusMode: false });


    toggle.checked = false;

    document.querySelectorAll('.platform-card').forEach(card => {
        updateCardUI(card, 'allow');

        card.querySelector('.card-status').innerText = "Passive (Locked by Break)";


        card.querySelectorAll('.mode-option').forEach(opt => {
            if (opt.dataset.value !== 'allow') {
                opt.classList.add('timer-locked', 'disabled');
                const map = {
                    'strict': 'Strict: Kick me out',
                    'warn': 'Soft: Warn me first'
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
    if (toggleLockedLabel) toggleLockedLabel.classList.add('hidden');


    document.querySelectorAll('.platform-card').forEach(card => {
        const platform = card.dataset.platform;

        updateCardUI(card, settings[platform]);


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
                opt.classList.add('disabled');
            }

            opt.querySelector('.mode-option-text').innerText = txt;
        });
    });
}

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
            sendResponse({ received: true });
        });
        return true; // Keep channel open for async response
    }
});

const scroller = document.documentElement;
let pos = scroller.scrollTop;
let target = scroller.scrollTop;
let isMoving = false;

window.addEventListener('wheel', (e) => {
    e.preventDefault();
    target += e.deltaY;


    const max = scroller.scrollHeight - scroller.clientHeight;
    target = Math.max(0, Math.min(target, max));

    if (!isMoving) {
        isMoving = true;
        updateScroll();
    }
}, { passive: false });

function updateScroll() {

    const el = document.scrollingElement || document.documentElement || document.body;

    const delta = target - pos;
    if (Math.abs(delta) < 0.5) {
        pos = target;
        el.scrollTop = pos;
        isMoving = false;
        return;
    }

    pos += delta * 0.1;
    el.scrollTop = pos;
    requestAnimationFrame(updateScroll);
}



const scrollContainer = document.getElementById('smooth-scroll-wrapper');

if (scrollContainer) {
    let currentScroll = scrollContainer.scrollTop;
    let targetScroll = scrollContainer.scrollTop;
    let isScrolling = false;

    scrollContainer.addEventListener('wheel', (e) => {

        if (scrollContainer.scrollHeight > scrollContainer.clientHeight) {
            e.preventDefault();

            targetScroll += e.deltaY;


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


chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.ft_timer_end || changes.ft_timer_type) {
            chrome.storage.local.get(['ft_timer_end', 'ft_timer_type'], (res) => {
                if (res.ft_timer_end && res.ft_timer_end > Date.now()) {
                    startTimerDisplay(res.ft_timer_end, res.ft_timer_type);
                } else if (!res.ft_timer_end) {
                    resetTimerUI();
                }
            });
        }
        if (changes.ft_stats_blocked) {
            updateStats(changes.ft_stats_blocked.newValue || 0);
        }
    }
});
