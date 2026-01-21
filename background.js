const TIMER_ALARM_NAME = 'focusTubeTimer';
let statIncrementPending = 0;
let statIncrementActive = false;
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.ft_timer_end) {
        handleTimerUpdate(changes.ft_timer_end.newValue);
    }
    if (changes.ft_enabled && changes.ft_enabled.newValue === false) {
        chrome.alarms.clear(TIMER_ALARM_NAME);
        chrome.storage.local.remove(['ft_timer_end', 'ft_timer_type', 'ft_work_session_ended']);
    }
});
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (request.action === 'incrementStat') {
            const amount = Math.max(1, Number(request.amount) || 1);
            statIncrementPending += amount;
            flushStatIncrements();
            return false;
        }
        if (request.action === 'startTimer') {
            const duration = parseInt(request.duration) || 25;
            const type = request.type || 'work';
            const endTime = Date.now() + (duration * 60 * 1000);
            chrome.storage.local.remove('ft_work_session_ended');
            chrome.storage.local.set({
                ft_timer_end: endTime,
                ft_timer_type: type
            }, () => {
                if (chrome.runtime.lastError) return;
                sendResponse({ end: endTime });
            });
            return true;
        }
        if (request.action === 'stopTimer') {
            chrome.alarms.clear(TIMER_ALARM_NAME);
            chrome.storage.local.remove(['ft_timer_end', 'ft_timer_type'], () => {
                sendResponse({ stopped: true });
            });
            return true;
        }
        if (request.action === 'startBreak') {
            const duration = parseInt(request.duration) || 5;
            const endTime = Date.now() + (duration * 60 * 1000);
            chrome.storage.local.set({
                ft_timer_end: endTime,
                ft_timer_type: 'break'
            }, () => {
                if (chrome.runtime.lastError) return;
                sendResponse({ end: endTime });
            });
            return true;
        }
    } catch (e) { }
});
function flushStatIncrements() {
    if (statIncrementActive) return;
    if (statIncrementPending <= 0) return;
    statIncrementActive = true;
    chrome.storage.local.get(['ft_stats_blocked'], (res) => {
        const current = res.ft_stats_blocked || 0;
        const delta = statIncrementPending;
        statIncrementPending = 0;
        chrome.storage.local.set({ ft_stats_blocked: current + delta }, () => {
            statIncrementActive = false;
            if (statIncrementPending > 0) flushStatIncrements();
        });
    });
}
function handleTimerUpdate(endTime) {
    chrome.alarms.clear(TIMER_ALARM_NAME);
    if (endTime && endTime > Date.now()) {
        chrome.alarms.create(TIMER_ALARM_NAME, { when: endTime });
    }
}
const onAlarmHandler = (alarm) => {
    if (alarm.name === TIMER_ALARM_NAME) {
        chrome.storage.local.get(['ft_timer_type', 'breakDuration'], (res) => {
            const isWork = res.ft_timer_type === 'work';
            const breakTime = parseInt(res.breakDuration) || 5;
            chrome.storage.local.get(['autoStartBreaks'], (res2) => {
                const autoStart = res2.autoStartBreaks !== false;
                let title = isWork ? "Focus Timer Complete! 🎉" : "Break Over! ⏰";
                let msg = isWork ? `Time for a ${breakTime}-minute break.` : "Back to work. Distractions blocked.";
                if (isWork && !autoStart) {
                    msg = "Focus session complete.";
                    chrome.storage.local.set({ ft_work_session_ended: true });
                }
                showSystemNotification(title, msg);
            });
            chrome.runtime.sendMessage({
                action: "TIMER_COMPLETE",
                target: "extension",
                type: isWork ? "work" : "break",
                breakDuration: breakTime
            }, () => { if (chrome.runtime.lastError) { } });
            chrome.tabs.query({ url: ["*://*.youtube.com/*", "*://*.instagram.com/*", "*://*.tiktok.com/*", "*://*.facebook.com/*", "*://*.linkedin.com/*"] }, (tabs) => {
                for (const tab of tabs) {
                    chrome.tabs.sendMessage(tab.id, {
                        action: "TIMER_COMPLETE",
                        target: "content",
                        type: isWork ? "work" : "break",
                        breakDuration: breakTime
                    }, () => { if (chrome.runtime.lastError) { } });
                }
                if (isWork) {
                    chrome.storage.local.get(['breakDuration', 'autoStartBreaks'], (res) => {
                        if (res.autoStartBreaks === false) {
                            chrome.storage.local.remove(['ft_timer_end', 'ft_timer_type']);
                            return;
                        }
                        const duration = parseInt(res.breakDuration) || 5;
                        chrome.storage.local.set({
                            ft_timer_end: Date.now() + (duration * 60 * 1000),
                            ft_timer_type: 'break'
                        });
                    });
                } else {
                    chrome.storage.local.remove(['ft_timer_end', 'ft_timer_type']);
                }
            });
        });
    }
};
chrome.alarms.onAlarm.addListener(onAlarmHandler);
function showSystemNotification(title, msg) {
    chrome.storage.local.get(['showNotifications'], (res) => {
        if (res.showNotifications === false) return;
        try {
            if (!chrome.notifications || !chrome.notifications.create) {
                return;
            }
            const iconUrl = chrome.runtime.getURL('icons/icon128.png');
            const notificationId = 'focustube-' + Date.now();
            chrome.notifications.create(notificationId, {
                type: 'basic',
                iconUrl: iconUrl,
                title: title,
                message: msg,
                priority: 2
            }, (id) => {
                if (chrome.runtime && chrome.runtime.lastError) {
                }
            });
        } catch (e) {
        }
    });
}
