document.addEventListener('DOMContentLoaded', () => {
    const mainToggle = document.getElementById('mainToggle');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const modeDesc = document.getElementById('modeDesc');
    const modeOptions = document.querySelectorAll('.mode-option');
    const passiveOption = document.getElementById('passiveOption');
    const passiveOptionText = passiveOption.querySelector('.mode-option-text');
    const githubBtn = document.getElementById('githubBtn');
    const statShorts = document.getElementById('statShorts');
    const statTime = document.getElementById('statTime');
    const timerBtn = document.getElementById('timerBtn');
    const timerDisplay = document.getElementById('timerDisplay');
    const timerLabel = document.getElementById('timerLabel');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const behaviorLabel = document.getElementById('behaviorLabel');

    let activePlatform = localStorage.getItem('ft_last_tab') || 'yt';
    let settings = { yt: 'strict', ig: 'strict', tt: 'strict' };
    let timerInterval = null;

    updateTabUI();

    chrome.storage.local.get(['focusMode', 'platformSettings', 'darkMode', 'ft_stats_blocked', 'ft_timer_end', 'ft_timer_type', 'lastActiveTab'], (result) => {
        const isEnabled = result.focusMode !== false;
        mainToggle.checked = isEnabled;

        if (result.lastActiveTab && ['yt', 'ig', 'tt'].includes(result.lastActiveTab)) {
            if (!localStorage.getItem('ft_last_tab')) {
                activePlatform = result.lastActiveTab;
                updateTabUI();
            }
        } else {

            activePlatform = (localStorage.getItem('ft_last_tab') || 'yt');
            updateTabUI();
        }

        const isDarkMode = result.darkMode !== false;
        darkModeToggle.checked = isDarkMode;
        applyDarkMode(isDarkMode);

        if (result.platformSettings) settings = result.platformSettings;

        updateTabUI();
        updateStats(result.ft_stats_blocked || 0);

        if (result.ft_timer_end && result.ft_timer_end > Date.now()) {
            startTimerDisplay(result.ft_timer_end, result.ft_timer_type || 'work');
            if (result.ft_timer_type === 'work') lockUiForTimer();
        } else {
            updateUiState(isEnabled);
        }
    });


    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        if (changes.ft_timer_end || changes.ft_timer_type) {
            chrome.storage.local.get(['ft_timer_end', 'ft_timer_type'], (res) => {
                const endTime = res.ft_timer_end;
                const type = res.ft_timer_type;
                if (endTime && endTime > Date.now()) {
                    startTimerDisplay(endTime, type || 'work');
                    if (type === 'work') lockUiForTimer();
                    else unlockUiFromTimer();
                } else {
                    stopTimer();
                }
            });
        }

        if (changes.focusMode) {
            mainToggle.checked = changes.focusMode.newValue;
            updateUiState(changes.focusMode.newValue);
        }

        if (changes.platformSettings) {
            settings = changes.platformSettings.newValue;
            updateSelectedOptionVisuals(settings[activePlatform]);
        }
    });

    function updateTabUI() {
        tabBtns.forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.tab-btn[data-target="${activePlatform}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        updateUIForPlatform(activePlatform);
    }

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            activePlatform = btn.getAttribute('data-target');
            localStorage.setItem('ft_last_tab', activePlatform);
            chrome.storage.local.set({ lastActiveTab: activePlatform });
            updateTabUI();

            if (!timerBtn.classList.contains('active') || timerBtn.classList.contains('break')) {
                updateUiState(mainToggle.checked);
            }
        });
    });

    function updateUIForPlatform(platform) {
        const mode = settings[platform];
        if (platform === 'yt') behaviorLabel.innerText = "When I open a Short...";
        if (platform === 'ig') behaviorLabel.innerText = "When I open a Reel...";
        if (platform === 'tt') behaviorLabel.innerText = "When I open TikTok...";

        const warnOption = document.getElementById('warnOption');
        const warnText = warnOption.querySelector('.mode-option-text');

        if (!warnOption.classList.contains('timer-locked')) {
            if (platform === 'ig') {
                warnOption.classList.add('disabled');
                warnText.innerText = "Soft: Coming Soon";
            } else {
                warnOption.classList.remove('disabled');
                warnText.innerText = "Soft: Warn me first";
            }
        }

        if (timerBtn.classList.contains('active') && !timerBtn.classList.contains('break')) {
            lockUiForTimer();
        } else {
            updateSelectedOptionVisuals(mode);
        }
    }

    mainToggle.addEventListener('change', () => {
        const isEnabled = mainToggle.checked;
        chrome.storage.local.set({ focusMode: isEnabled });
        chrome.storage.local.get(['ft_timer_type', 'ft_timer_end'], (res) => {
            const isWorkTimer = res.ft_timer_type === 'work' && res.ft_timer_end > Date.now();
            if (!isWorkTimer) updateUiState(isEnabled);
        });
    });

    darkModeToggle.addEventListener('change', () => {
        const isDark = darkModeToggle.checked;
        chrome.storage.local.set({ darkMode: isDark });
        applyDarkMode(isDark);
    });

    modeOptions.forEach(option => {
        option.addEventListener('click', function () {
            if (this.classList.contains('disabled') || this.classList.contains('timer-locked')) return;
            const value = this.getAttribute('data-value');
            settings[activePlatform] = value;
            chrome.storage.local.set({ platformSettings: settings });
            updateSelectedOptionVisuals(value);
        });
    });

    if (githubBtn) {
        githubBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://github.com/malekwael229/FocusTube' });
        });
    }

    timerBtn.addEventListener('click', () => {
        chrome.storage.local.get(['ft_timer_end'], (res) => {
            if (res.ft_timer_end && res.ft_timer_end > Date.now()) {
                stopTimer();
            } else {
                startTimer(25, 'work');
            }
        });
    });

    function startTimer(minutes, type) {
        const endTime = Date.now() + (minutes * 60 * 1000);
        chrome.storage.local.set({ ft_timer_end: endTime, ft_timer_type: type });
        startTimerDisplay(endTime, type);

        if (type === 'work') lockUiForTimer();
        else unlockUiFromTimer();
    }

    function stopTimer() {
        chrome.storage.local.remove(['ft_timer_end', 'ft_timer_type']);
        clearInterval(timerInterval);
        timerDisplay.classList.add('hidden');
        timerLabel.classList.add('hidden');
        timerBtn.textContent = "Start Pomodoro Timer (25m)";
        timerBtn.classList.remove('active', 'break');
        unlockUiFromTimer();
    }

    function lockUiForTimer() {
        modeOptions.forEach(opt => {
            const val = opt.getAttribute('data-value');
            const textEl = opt.querySelector('.mode-option-text');
            if (val === 'strict') {
                opt.classList.add('selected');
                opt.classList.remove('disabled', 'timer-locked');
            } else {
                opt.classList.remove('selected');
                opt.classList.add('disabled', 'timer-locked');
                if (val === 'warn') {
                    textEl.innerText = "Soft: Locked (Timer Active)";
                }
                if (val === 'allow') textEl.innerText = "Passive: Locked (Timer Active)";
            }
        });
        if (modeDesc) modeDesc.innerText = "Pomodoro Timer is active: Strict Mode locked on all apps.";

        if (mainToggle) {
            mainToggle.checked = true;
            mainToggle.disabled = true;
            mainToggle.parentElement.classList.add('disabled-wrapper');
        }
        chrome.storage.local.set({ focusMode: true });
        updateUiState(true); // Ensure UI reflects ON state
    }

    function unlockUiFromTimer() {
        modeOptions.forEach(opt => {
            const val = opt.getAttribute('data-value');
            const textEl = opt.querySelector('.mode-option-text');

            opt.classList.remove('disabled', 'timer-locked');

            if (val === 'warn') {
                if (activePlatform === 'ig') {
                    opt.classList.add('disabled');
                    textEl.innerText = "Soft: Coming Soon";
                } else {
                    textEl.innerText = "Soft: Warn me first";
                }
            }
            if (val === 'allow') textEl.innerText = "Passive: Let me watch";
        });

        if (mainToggle) {
            mainToggle.disabled = false;
        }

        updateSelectedOptionVisuals(settings[activePlatform]);
        updateUiState(mainToggle.checked);
    }

    function startTimerDisplay(endTime, type) {
        timerBtn.textContent = "Stop Session";
        timerBtn.classList.add('active');
        if (type === 'break') timerBtn.classList.add('break');
        timerDisplay.classList.remove('hidden');
        timerLabel.classList.remove('hidden');
        timerLabel.innerText = type === 'work' ? "POMODORO ACTIVE" : "BREAK TIME";
        timerLabel.style.color = type === 'work' ? "#4facfe" : "#10b981";
        updateTimerUI(endTime, type);
        clearInterval(timerInterval);
        timerInterval = setInterval(() => { updateTimerUI(endTime, type); }, 1000);
    }

    function updateTimerUI(endTime, type) {
        const remaining = endTime - Date.now();
        if (remaining <= 0) {
            return;
        }
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        timerDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function updateStats(count) {
        if (statShorts) statShorts.innerText = count;
        if (statTime) statTime.innerText = count + "m";
    }

    function applyDarkMode(isDark) {
        if (isDark) document.body.classList.add('dark-mode');
        else document.body.classList.remove('dark-mode');
    }

    function updateSelectedOptionVisuals(value) {
        modeOptions.forEach(opt => {
            if (opt.getAttribute('data-value') === value) opt.classList.add('selected');
            else opt.classList.remove('selected');
        });
        if (modeDesc) modeDesc.innerText = getDescription(value);
    }

    function checkForUpdates() {
        chrome.storage.local.get(['ft_latest_version'], (res) => {
            const latest = res.ft_latest_version;
            const current = chrome.runtime.getManifest().version;

            if (latest && latest !== current) {
                const banner = document.getElementById('updateBanner');

                if (banner) {
                    banner.classList.remove('hidden');
                    banner.textContent = "";
                    const span = document.createElement('span');
                    span.textContent = "🚀 Update Available! ";

                    const versionBold = document.createElement('b');
                    versionBold.textContent = latest + " ";
                    span.appendChild(versionBold);

                    const link = document.createElement('a');
                    link.href = "#";
                    link.id = "updateLink";
                    link.textContent = "Get it here";

                    banner.appendChild(span);
                    banner.appendChild(link);

                    setTimeout(() => {
                        const newLink = document.getElementById('updateLink');
                        if (newLink) {
                            newLink.addEventListener('click', (e) => {
                                e.preventDefault();
                                chrome.tabs.create({ url: 'https://github.com/malekwael229/FocusTube' });
                            });
                        }
                    }, 0);
                }
            }
        });
    }

    checkForUpdates();

    function updateUiState(isEnabled) {
        if (!passiveOption) return;
        const text = passiveOption.querySelector('.mode-option-text');

        const isTimerWork = timerBtn.classList.contains('active') && !timerBtn.classList.contains('break');

        if (isEnabled) {
            if (activePlatform === 'yt' || isTimerWork) {
                passiveOption.classList.add('disabled');
                if (text) text.innerText = isTimerWork ? "Passive: Locked (Timer Active)" : "Passive (Turn off Focus Mode)";

                if (settings[activePlatform] === 'allow') {
                    settings[activePlatform] = 'warn';
                    chrome.storage.local.set({ platformSettings: settings });
                    updateSelectedOptionVisuals('warn');
                }
            } else {
                passiveOption.classList.remove('disabled');
                if (text) text.innerText = "Passive: Let me watch";
            }
        } else {
            passiveOption.classList.remove('disabled');
            if (text) text.innerText = "Passive: Let me watch";
        }
    }

    function getDescription(value) {
        const d = {
            strict: "Strict: Instant Redirect / Blocking.",
            warn: "Soft: Full-screen warning overlay.",
            allow: "Passive: Focus Mode is off. Site works normally."
        };
        return d[value];
    }
});
