chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.ft_timer_end) {
        handleTimerUpdate(changes.ft_timer_end.newValue);
    }
});

function handleTimerUpdate(endTime) {
    chrome.alarms.clearAll();
    if (endTime && endTime > Date.now()) {
        chrome.alarms.create('focusTubeTimer', { when: endTime });
    }
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'focusTubeTimer') {
        chrome.storage.local.get(['ft_timer_type'], (res) => {
            const isWork = res.ft_timer_type === 'work';
            const title = isWork ? "Focus Session Complete! 🎉" : "Break Over! ⏰";
            const msg = isWork ? "Time for a 5-minute break." : "Back to work. Shorts are blocked.";

            chrome.tabs.query({ url: "*://*.youtube.com/*", active: true, lastFocusedWindow: true }, (tabs) => {
                
                if (tabs && tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "TIMER_COMPLETE",
                        type: isWork ? "work" : "break"
                    }, (response) => {
                        if (chrome.runtime.lastError || !response || response.status !== 'received') {
                            showSystemNotification(title, msg);
                        }
                    });
                } else {
                    showSystemNotification(title, msg);
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
});

function showSystemNotification(title, msg) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: title,
        message: msg,
        priority: 2,
        requireInteraction: true
    });
}