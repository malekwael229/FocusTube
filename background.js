const UPDATE_ALARM_NAME = 'ft_update_check';
const TIMER_ALARM_NAME = 'focusTubeTimer';

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(UPDATE_ALARM_NAME, { periodInMinutes: 360 });
    checkForUpdates();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.ft_timer_end) {
        handleTimerUpdate(changes.ft_timer_end.newValue);
    }
});

function handleTimerUpdate(endTime) {
    chrome.alarms.clear(TIMER_ALARM_NAME);
    if (endTime && endTime > Date.now()) {
        chrome.alarms.create(TIMER_ALARM_NAME, { when: endTime });
    }
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === UPDATE_ALARM_NAME) {
        checkForUpdates();
    } else if (alarm.name === TIMER_ALARM_NAME) {
        chrome.storage.local.get(['ft_timer_type'], (res) => {
            const isWork = res.ft_timer_type === 'work';
            const title = isWork ? "Pomodoro Complete! 🎉" : "Break Over! ⏰";
            const msg = isWork ? "Time for a 5-minute break." : "Back to work. Distractions blocked.";

            chrome.tabs.query({ url: ["*://*.youtube.com/*", "*://*.instagram.com/*", "*://*.tiktok.com/*"] }, (tabs) => {
                let sent = false;
                for (const tab of tabs) {
                    chrome.tabs.sendMessage(tab.id, {
                        action: "TIMER_COMPLETE",
                        type: isWork ? "work" : "break"
                    }).catch(() => { });
                    sent = true;
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

function checkForUpdates() {
    const GITHUB_MANIFEST_URL = 'https://raw.githubusercontent.com/malekwael229/FocusTube/main/chrome-manifest.json';
    fetch(GITHUB_MANIFEST_URL, { cache: 'no-cache' })
        .then(r => r.json())
        .then(remote => {
            if (remote && remote.version) {
                chrome.storage.local.set({ ft_latest_version: remote.version });
            }
        })
        .catch(() => { });
}

function showSystemNotification(title, msg) {
    try {
        if (!chrome.notifications || !chrome.notifications.create) {
            console.log('[FocusTube]', title + ':', msg);
            return;
        }
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: title,
            message: msg,
            priority: 2,
            requireInteraction: true
        }, () => {
            // If the permission is missing, browsers may set lastError.
            if (chrome.runtime && chrome.runtime.lastError) {
                console.log('[FocusTube]', title + ':', msg);
            }
        });
    } catch (e) {
        console.log('[FocusTube]', title + ':', msg);
    }
}
