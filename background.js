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
            const title = isWork ? "Pomodoro Complete! 🎉" : "Break Over! ⏰";
            const msg = isWork ? "Time for a 5-minute break." : "Back to work. Distractions blocked.";

            chrome.tabs.query({}, (tabs) => {
                let sent = false;
                for (const tab of tabs) {
                    if (tab.url && (tab.url.includes('youtube.com') || tab.url.includes('instagram.com') || tab.url.includes('tiktok.com'))) {
                        chrome.tabs.sendMessage(tab.id, {
                            action: "TIMER_COMPLETE",
                            type: isWork ? "work" : "break"
                        }).catch(() => { });
                        sent = true;
                    }
                }

                if (!sent) {
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