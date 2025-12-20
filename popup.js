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

    let activePlatform = 'yt';
    let settings = { yt: 'strict', ig: 'strict', tt: 'strict' };
    let timerInterval = null;

    chrome.storage.local.get(['focusMode', 'platformSettings', 'darkMode', 'ft_stats_blocked', 'ft_timer_end', 'ft_timer_type', 'lastActiveTab'], (result) => {
        const isEnabled = result.focusMode !== false;
        mainToggle.checked = isEnabled;
        
        const isDarkMode = result.darkMode !== false;
        darkModeToggle.checked = isDarkMode;
        applyDarkMode(isDarkMode);
        
        if (result.platformSettings) settings = result.platformSettings;

        if (result.lastActiveTab && ['yt', 'ig', 'tt'].includes(result.lastActiveTab)) {
            activePlatform = result.lastActiveTab;
        } else {
             chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs && tabs[0] && tabs[0].url) {
                    if (tabs[0].url.includes('instagram.com')) activePlatform = 'ig';
                    else if (tabs[0].url.includes('tiktok.com')) activePlatform = 'tt';
                }
                updateTabUI();
            });
        }

        updateTabUI();
        updateStats(result.ft_stats_blocked || 0);

        if (result.ft_timer_end && result.ft_timer_end > Date.now()) {
            startTimerDisplay(result.ft_timer_end, result.ft_timer_type || 'work');
            if (result.ft_timer_type === 'work') lockUiForTimer();
        } else {
            updateUiState(isEnabled);
        }

        setTimeout(() => {
            document.querySelectorAll('.no-anim').forEach(el => el.classList.remove('no-anim'));
            document.body.classList.remove('preload');
        }, 50);
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
            chrome.storage.local.set({ lastActiveTab: activePlatform });
            updateTabUI();
            
            // Only update toggle state if timer isn't locking it
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
        option.addEventListener('click', function() {
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
                if (val === 'warn') textEl.innerText = "Soft: Locked (Timer Active)";
                if (val === 'allow') textEl.innerText = "Passive: Locked (Timer Active)";
            }
        });
        if (modeDesc) modeDesc.innerText = "Pomodoro Timer is active: Strict Mode locked on all apps.";
    }

    function unlockUiFromTimer() {
        modeOptions.forEach(opt => {
            opt.classList.remove('disabled', 'timer-locked');
            const textEl = opt.querySelector('.mode-option-text');
            if (opt.getAttribute('data-value') === 'warn') textEl.innerText = "Soft: Warn me first";
            if (opt.getAttribute('data-value') === 'allow') textEl.innerText = "Passive: Let me watch";
        });
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
            clearInterval(timerInterval);
            if (type === 'work') {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon128.png',
                    title: 'Pomodoro Complete!',
                    message: 'Time for a 5 minute break. Shorts are unlocked.'
                });
                startTimer(5, 'break');
            } else {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon128.png',
                    title: 'Break Over',
                    message: 'Ready to start focusing again?'
                });
                stopTimer();
            }
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

    function updateUiState(isEnabled) {
        if (!passiveOption) return;
        const text = passiveOption.querySelector('.mode-option-text');
        
        if (isEnabled) {
            if (activePlatform === 'yt') {
                passiveOption.classList.add('disabled');
                if (text) text.innerText = "Passive (Turn off Focus Mode)";
                
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