const Facebook = {
    currentMode: 'strict',
    observer: null,

    run: function (isUpdate) {
        if (!isUpdate) {
            if (document.body) document.body.classList.add('ft-platform-fb');
            this.initObserver();
            Utils.setSafeInterval(() => this.check(), 400);
        }
        this.check();

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.platformSettings || changes.focusMode || changes.ft_timer_end || changes.ft_timer_type) {
                this.check();
            }
        });
    },

    initObserver: function () {
        if (this.observer) return;
        this.observer = new MutationObserver(() => {
            const ts = Utils.getTimerState();
            this.applyHiding(CONFIG.isFocusMode || ts.isWork);
        });
        this.observer.observe(document, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['href', 'style', 'class', 'role', 'aria-label']
        });
    },

    check: function () {
        const path = window.location.pathname;
        const ts = Utils.getTimerState();
        const isStrict = CONFIG.platformSettings.fb === 'strict';
        const isWarn = CONFIG.platformSettings.fb === 'warn';
        const isFocusActive = CONFIG.isFocusMode || ts.isWork;

        if (CONFIG.platformSettings.fb === 'strict' && this.currentMode !== 'strict') {
            CONFIG.session.allowUntil = 0;
            CONFIG.session.platform = null;
        }
        this.currentMode = CONFIG.platformSettings.fb;

        const onReelsPath = path.startsWith('/reel/') || path.startsWith('/reels/');

        if (onReelsPath) {
            if (CONFIG.session.allowUntil && CONFIG.session.allowUntil > Date.now() && CONFIG.session.platform === 'fb') {
                if (isStrict) {
                } else {
                    UI.remove();
                    this.applyHiding(isFocusActive);
                    return;
                }
            }

            if (ts.isWork || isStrict) {
                UI.create('strict', 'fb', () => { }, () => window.location.href = 'https://www.facebook.com/');
                Utils.lockVideo();
                this.applyHiding(isFocusActive);
                return;
            } else if (isWarn) {
                UI.create('warn', 'fb', () => {
                    CONFIG.session.allowUntil = Date.now() + (5 * 60 * 1000);
                    CONFIG.session.platform = 'fb';
                    UI.remove();
                    Utils.unlockVideo();
                    this.applyHiding(isFocusActive);
                }, () => window.location.href = 'https://www.facebook.com/');
                Utils.lockVideo();
                this.applyHiding(isFocusActive);
                return;
            }
        }

        if (CONFIG.session.platform === 'fb') {
            CONFIG.session.allowUntil = 0;
            CONFIG.session.platform = null;
        }
        UI.remove();
        this.applyHiding(isFocusActive);
    },

    applyHiding: function (shouldHide) {
        const selectors = [
            'a[aria-label="Reels"]',
            'a[href*="/reels/"]',
            'a[href*="/reel/"]',
            '[role="navigation"] a[aria-label="Reels"]',
            'div[aria-label="Reels"]',
            'span:has-text("Reels")'
        ];

        const fbReelsLink = document.querySelector('a[aria-label="Reels"][href="/reel/?s=tab"]');
        if (fbReelsLink) {
            const container = fbReelsLink.closest('li');
            if (container) {
                if (shouldHide) container.style.setProperty('display', 'none', 'important');
                else container.style.removeProperty('display');
            }
        }

        selectors.forEach(sel => {
            if (sel.includes('has-text')) {
                const candidates = document.querySelectorAll('span, h3, div[role="button"] span');
                candidates.forEach(el => {
                    if (el.textContent === "Reels") {
                        const btn = el.closest('div[role="button"]');
                        if (btn && shouldHide) btn.style.setProperty('display', 'none', 'important');
                        else if (btn) btn.style.removeProperty('display');

                        const shelfHeader = el.closest('div.x1n2onr6.x1ja2u2z');
                        if (shelfHeader) {
                            let parent = shelfHeader.parentElement;
                            for (let i = 0; i < 8; i++) {
                                if (!parent) break;
                                if (parent.className.includes('html-div') && parent.className.includes('xz9dl7a') === false) {
                                    if (shouldHide) parent.style.setProperty('display', 'none', 'important');
                                    else parent.style.removeProperty('display');
                                    break;
                                }
                                parent = parent.parentElement;
                            }
                        }
                    }
                });
            } else {
                document.querySelectorAll(sel).forEach(el => {
                    if (shouldHide) el.style.setProperty('display', 'none', 'important');
                    else el.style.removeProperty('display');
                });
            }
        });
    }
};

if (Site.isFB()) {
    document.addEventListener('ft-settings-ready', () => Facebook.run());
}
