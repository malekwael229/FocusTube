document.addEventListener('DOMContentLoaded', () => {
    const mainToggle = document.getElementById('mainToggle');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const modeDesc = document.getElementById('modeDesc');
    const modeOptions = document.querySelectorAll('.mode-option');
    const passiveOption = document.getElementById('passiveOption');
    const githubBtn = document.getElementById('githubBtn');
    const statShorts = document.getElementById('statShorts');
    const statTime = document.getElementById('statTime');
    const timerBtn = document.getElementById('timerBtn');
    const timerDisplay = document.getElementById('timerDisplay');
    const timerLabel = document.getElementById('timerLabel');

    let currentModeValue = 'strict';
    let timerInterval = null;

    if (passiveOption) passiveOption.classList.remove('disabled');

    chrome.storage.local.get(['focusMode', 'shortsMode', 'darkMode', 'ft_stats_blocked', 'ft_timer_end', 'ft_timer_type'], (result) => {
        const isEnabled = result.focusMode !== false;
        mainToggle.checked = isEnabled;
        
        const isDarkMode = result.darkMode !== false;
        darkModeToggle.checked = isDarkMode;
        applyDarkMode(isDarkMode);
        
        currentModeValue = result.shortsMode || 'strict';
        updateStats(result.ft_stats_blocked || 0);

        if (result.ft_timer_end && result.ft_timer_end > Date.now()) {
            startTimerDisplay(result.ft_timer_end, result.ft_timer_type || 'work');
            lockUiForTimer(result.ft_timer_type || 'work');
        } else {
            updateSelectedOptionVisuals(currentModeValue);
        }

        setTimeout(() => {
            document.querySelectorAll('.no-anim').forEach(el => el.classList.remove('no-anim'));
            document.body.classList.remove('preload');
        }, 50);
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.ft_timer_end) {
            const newEnd = changes.ft_timer_end.newValue;
            const newType = changes.ft_timer_type ? changes.ft_timer_type.newValue : 'work';
            
            if (newEnd && newEnd > Date.now()) {
                startTimerDisplay(newEnd, newType);
                lockUiForTimer(newType);
            } else {
                stopTimer();
            }
        }
    });

    mainToggle.addEventListener('change', () => chrome.storage.local.set({ focusMode: mainToggle.checked }));
    darkModeToggle.addEventListener('change', () => {
        const isDark = darkModeToggle.checked;
        chrome.storage.local.set({ darkMode: isDark });
        applyDarkMode(isDark);
    });

    modeOptions.forEach(option => {
        option.addEventListener('click', function() {
            if (this.classList.contains('timer-locked')) return;
            const value = this.getAttribute('data-value');
            currentModeValue = value;
            chrome.storage.local.set({ shortsMode: value });
            updateSelectedOptionVisuals(value);
        });
    });

    if (githubBtn) githubBtn.addEventListener('click', () => chrome.tabs.create({ url: 'https://github.com/malekwael229/FocusTube' }));

    timerBtn.addEventListener('click', () => {
        chrome.storage.local.get(['ft_timer_end'], (res) => {
            if (res.ft_timer_end && res.ft_timer_end > Date.now()) {
                chrome.storage.local.remove(['ft_timer_end', 'ft_timer_type']);
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
        lockUiForTimer(type);
    }

    function stopTimer() {
        clearInterval(timerInterval);
        timerDisplay.classList.add('hidden');
        timerLabel.classList.add('hidden');
        timerBtn.textContent = "Start Pomodoro Timer (25m)";
        timerBtn.classList.remove('active', 'break');
        unlockUiFromTimer();
    }

    function lockUiForTimer(type) {
        const isWork = type === 'work';
        const targetValue = isWork ? 'strict' : 'allow'; 

        modeOptions.forEach(opt => {
            const val = opt.getAttribute('data-value');
            const textEl = opt.querySelector('.mode-option-text');
            
            opt.classList.remove('selected', 'timer-locked', 'disabled');
            opt.style.opacity = '';
            opt.style.cursor = '';

            if (val === 'strict') textEl.innerText = "Strict: Kick me out";
            if (val === 'warn') textEl.innerText = "Soft: Warn me first";
            if (val === 'allow') textEl.innerText = "Passive: Let me watch";

            if (val === targetValue) {
                opt.classList.add('selected');
                
                if (!isWork && val === 'allow') textEl.innerText = "Passive: Enjoy your Break";
                if (isWork && val === 'strict') textEl.innerText = "Strict: Enforced (Work Mode)";
            } else {
                opt.classList.add('timer-locked');
                opt.style.opacity = '0.5';
                opt.style.cursor = 'not-allowed';
                
                if (isWork) {
                    if (val === 'warn') textEl.innerText = "Soft: Locked (Work Mode)";
                    if (val === 'allow') textEl.innerText = "Passive: Locked (Work Mode)";
                } else {
                    if (val === 'strict') textEl.innerText = "Strict: Locked (Break Time)";
                    if (val === 'warn') textEl.innerText = "Soft: Locked (Break Time)";
                }
            }
        });
        
        if (modeDesc) {
            modeDesc.innerText = isWork 
                ? "Pomodoro Work Session: Strict Mode enforced." 
                : "Pomodoro Break Time: Shorts are unlocked.";
        }
    }

    function unlockUiFromTimer() {
        modeOptions.forEach(opt => {
            const val = opt.getAttribute('data-value');
            const textEl = opt.querySelector('.mode-option-text');
            
            opt.classList.remove('timer-locked');
            opt.style.opacity = '';
            opt.style.cursor = '';
            opt.classList.remove('disabled'); 
            
            if (val === 'warn') textEl.innerText = "Soft: Warn me first";
            if (val === 'allow') textEl.innerText = "Passive: Let me watch";
            if (val === 'strict') textEl.innerText = "Strict: Kick me out";
        });
        updateSelectedOptionVisuals(currentModeValue);
    }

    function startTimerDisplay(endTime, type) {
        timerBtn.textContent = "Stop Session";
        timerBtn.classList.add('active');
        
        if (type === 'break') {
            timerBtn.classList.add('break');
            timerLabel.innerText = "BREAK TIME";
            timerLabel.style.color = "#10b981";
        } else {
            timerBtn.classList.remove('break');
            timerLabel.innerText = "POMODORO ACTIVE";
            timerLabel.style.color = "#4facfe";
        }
        
        timerDisplay.classList.remove('hidden');
        timerLabel.classList.remove('hidden');
        
        updateTimerUI(endTime);
        clearInterval(timerInterval);
        timerInterval = setInterval(() => { updateTimerUI(endTime); }, 1000);
    }

    function updateTimerUI(endTime) {
        const remaining = endTime - Date.now();
        if (remaining <= 0) {
            clearInterval(timerInterval);
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

    function getDescription(value) {
        const d = {
            strict: "Strict: If you open a Short, you will be instantly kicked out.",
            warn: "Soft: You will see a warning screen before the video plays.",
            allow: "Passive: Focus Mode is off. YouTube works normally (No hiding)."
        };
        return d[value];
    }
});