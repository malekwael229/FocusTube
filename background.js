const TIMER_ALARM_NAME = 'focusTubeTimer';

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.ft_timer_end) {
        handleTimerUpdate(changes.ft_timer_end.newValue);
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startTimer') {
        const duration = request.duration || 25;
        const endTime = Date.now() + (duration * 60 * 1000);
        chrome.storage.local.set({
            ft_timer_end: endTime,
            ft_timer_type: 'work'
        }, () => {
            sendResponse({ end: endTime });
        });
        return true;
    }

    if (request.action === 'stopTimer') {
        chrome.alarms.clear(TIMER_ALARM_NAME);
        chrome.storage.local.remove(['ft_timer_end', 'ft_timer_type']);
        sendResponse({ stopped: true });
        return true;
    }
});

function handleTimerUpdate(endTime) {
    chrome.alarms.clear(TIMER_ALARM_NAME);
    if (endTime && endTime > Date.now()) {
        chrome.alarms.create(TIMER_ALARM_NAME, { when: endTime });
    }
}

const onAlarmHandler = (alarm) => {
    if (alarm.name === TIMER_ALARM_NAME) {
        chrome.storage.local.get(['ft_timer_type'], (res) => {
            const isWork = res.ft_timer_type === 'work';
            const title = isWork ? "Pomodoro Complete! 🎉" : "Break Over! ⏰";
            const msg = isWork ? "Time for a 5-minute break." : "Back to work. Distractions blocked.";


            showSystemNotification(title, msg);


            chrome.tabs.query({ url: ["*://*.youtube.com/*", "*://*.instagram.com/*", "*://*.tiktok.com/*", "*://*.facebook.com/*"] }, (tabs) => {
                for (const tab of tabs) {
                    chrome.tabs.sendMessage(tab.id, {
                        action: "TIMER_COMPLETE",
                        type: isWork ? "work" : "break"
                    }, () => { void chrome.runtime?.lastError; });
                }


                if (isWork) {
                    chrome.storage.local.set({
                        ft_timer_end: Date.now() + (5 * 60 * 1000),
                        ft_timer_type: 'break'
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
    try {
        if (!chrome.notifications || !chrome.notifications.create) {
            console.log('[FocusTube]', title + ':', msg);
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
                console.error('[FocusTube Notification Error]', chrome.runtime.lastError.message);
            }
        });
    } catch (e) {
        console.error('[FocusTube Notification Exception]', e);
    }
}