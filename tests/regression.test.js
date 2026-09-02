const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));
const expectedPlatformScripts = [
  ["*://*.youtube.com/*", "content-yt.js"],
  ["*://*.instagram.com/*", "content-ig.js"],
  ["*://*.tiktok.com/*", "content-tt.js"],
  ["*://*.facebook.com/*", "content-fb.js"],
  ["*://*.linkedin.com/*", "content-li.js"],
];

function assertPerPlatformContentScripts(manifest) {
  assert.equal(manifest.content_scripts.length, expectedPlatformScripts.length);

  expectedPlatformScripts.forEach(([match, platformScript]) => {
    const entry = manifest.content_scripts.find((script) =>
      script.matches.includes(match),
    );

    assert.ok(entry, `Missing content script entry for ${match}`);
    assert.deepEqual(entry.matches, [match]);
    assert.deepEqual(entry.css, ["content.css"]);
    assert.deepEqual(entry.js, ["content-common.js", platformScript]);
    assert.equal(entry.run_at, "document_start");
  });
}

const checks = [
  [
    "site detection accepts only supported domains and subdomains",
    () => {
      const common = read("content-common.js");
      const siteDeclaration = common.slice(0, common.indexOf("const CONFIG"));
      const isSite = (hostname, method) =>
        vm.runInNewContext(`${siteDeclaration}\nSite.${method}();`, {
          location: { hostname },
        });
      const sites = [
        ["youtube.com", "isYT"],
        ["instagram.com", "isIG"],
        ["tiktok.com", "isTT"],
        ["facebook.com", "isFB"],
        ["linkedin.com", "isLI"],
      ];

      sites.forEach(([domain, method]) => {
        assert.equal(isSite(domain, method), true);
        assert.equal(isSite(`www.${domain}`, method), true);
        assert.equal(isSite(`${domain}.example.com`, method), false);
        assert.equal(isSite(`not${domain}`, method), false);
      });
    },
  ],
  [
    "Instagram feed Reels hiding option and code are removed",
    () => {
      const files = [
        "content-common.js",
        "content-ig.js",
        "content.css",
        "popup.js",
        "options.js",
        "options.html",
        "styles.css",
        "README.md",
        "CHANGELOG.md",
        "CONTRIBUTING.md",
      ];
      const removedPatterns = [
        /hide_ig_feed_reels/,
        /igFeedReels/,
        /ft-hide-ig-reels-feed/,
        /ft-ig-feed-reel-hidden/,
        /applyReelsFeedHiding/,
        /hiddenReel/,
        /findFeedReel/,
        /isLikelyReelMediaLink/,
        /Hide Reels in Feed/,
        /Only Reel media is hidden/,
        /feed Reels/i,
      ];

      files.forEach((file) => {
        const source = read(file);
        removedPatterns.forEach((pattern) => {
          assert.doesNotMatch(source, pattern, `${file} still matches ${pattern}`);
        });
      });
    },
  ],
  [
    "Instagram Reels nav hiding stays scoped to navigation",
    () => {
      const contentCss = read("content.css");
      const appCss = read("styles.css");

      [contentCss, appCss].forEach((css) => {
        assert.doesNotMatch(
          css,
          /ft-hide-ig-reels-nav\.ft-platform-ig\s+a\[href\^="\/reels\/"\]/,
        );
        assert.doesNotMatch(
          css,
          /ft-hide-ig-reels-nav\.ft-platform-ig\s+div:has\(> a\[href\^="\/reels\/"\]\)/,
        );
      });
      assert.match(contentCss, /ft-hide-ig-reels-nav\.ft-platform-ig nav a/);
    },
  ],
  [
    "Instagram Reels nav hiding does not hide Search",
    () => {
      const instagram = read("content-ig.js");
      const contentCss = read("content.css");

      assert.doesNotMatch(instagram, /this\.applyHidden\(exploreLinks\)/);
      assert.doesNotMatch(instagram, /\[\.\.\.reelsLinks, \.\.\.exploreLinks\]/);
      assert.doesNotMatch(contentCss, /ft-hide-ig-reels-nav[^}]*explore/);
    },
  ],
  [
    "Instagram Reels and Explore path blocking remains",
    () => {
      const instagram = read("content-ig.js");
      const popup = read("popup.js");

      assert.match(instagram, /path\.startsWith\("\/reels\/"\)/);
      assert.match(instagram, /path\.startsWith\("\/reel\/"\)/);
      assert.match(instagram, /path\.startsWith\("\/explore\/"\)/);
      assert.match(popup, /hide_ig_reels_nav/);
    },
  ],
  [
    "Instagram warn mode is available for Reels and Explore paths",
    () => {
      const instagram = read("content-ig.js");
      const popup = read("popup.js");
      const options = read("options.js");

      assert.doesNotMatch(popup, /platform === "ig" && activeMode === "warn"/);
      assert.doesNotMatch(popup, /currentPlatform === "ig" && mode === "warn"/);
      assert.doesNotMatch(popup, /Coming Soon/);
      assert.doesNotMatch(options, /id === "ig"[^;]+warn/);
      assert.match(instagram, /mode === "warn"/);
      assert.match(instagram, /UI\.create\(\s*"warn",\s*"ig"/);
    },
  ],
  [
    "warn allow windows stay local to the approved surface",
    () => {
      const common = read("content-common.js");

      assert.doesNotMatch(common, /chrome\.storage\.local\.set\(\{\s*session/);
      assert.doesNotMatch(common, /"session",/);
      assert.doesNotMatch(common, /if \(res\.session\)/);
      assert.doesNotMatch(common, /setAllowWindow\(platform, 5\)/);
      assert.doesNotMatch(common, /minutes = 5/);
      assert.doesNotMatch(common, /visibilitychange/);
      assert.match(common, /Number\.MAX_SAFE_INTEGER/);
      assert.match(common, /scope: null/);
      assert.match(common, /isSessionAllowed: function \(platform, scope\)/);
      assert.match(common, /CONFIG\.session\.scope === scope/);
      assert.match(
        common,
        /setAllowWindow: function \(platform, scope\)/,
      );
    },
  ],
  [
    "warn mode sets page-local allow before removing the overlay and resumes media",
    () => {
      const common = read("content-common.js");
      const tiktok = read("content-tt.js");
      const instagram = read("content-ig.js");
      const facebook = read("content-fb.js");
      const youtube = read("content-yt.js");
      const watchHandler = common.match(
        /watchBtn\.onclick = \(\) => \{([\s\S]*?)\n      \};/,
      );

      assert.ok(watchHandler, "Missing Watch Anyway handler");
      assert.match(
        watchHandler[1],
        /Utils\.setAllowWindow\(platform, options\.scope\)/,
      );
      assert.ok(
        watchHandler[1].indexOf(
          "Utils.setAllowWindow(platform, options.scope)",
        ) <
          watchHandler[1].indexOf("this.remove("),
        "Watch Anyway should set the allow window before removing the overlay",
      );
      assert.match(
        watchHandler[1],
        /this\.remove\(\{\s*unmuteMedia: shouldUnmute/,
      );
      assert.match(watchHandler[1], /forcePlayMedia: true/);
      assert.match(common, /unlockVideo: function \(options = \{\}\)/);
      assert.match(common, /options\.unmute/);
      assert.match(common, /options\.forcePlay/);
      assert.match(common, /resumeMedia: function \(options = \{\}\)/);
      assert.match(common, /setTimeout\([\s\S]*?this\.resumeMedia\(\{/);
      assert.match(common, /singleVideo: true/);
      assert.match(tiktok, /Utils\.unlockVideo\(\{\s*unmute: true\s*\}\)/);
      assert.doesNotMatch(instagram, /Utils\.unlockVideo\(\{\s*unmute: true\s*\}\)/);
      assert.doesNotMatch(facebook, /Utils\.unlockVideo\(\{\s*unmute: true\s*\}\)/);
      assert.doesNotMatch(instagram, /Utils\.unlockVideo\(\{\s*forcePlay: true\s*\}\)/);
      assert.match(facebook, /Utils\.unlockVideo\(\{\s*forcePlay: true\s*\}\)/);
      assert.doesNotMatch(
        facebook,
        /applyAllowedAudio|handleAudioClick|audioUserMuted|audioClickPending|audioVideoSources|syncAllowedAudioControl|syncAudioControl/,
        "Facebook should not contain extension-controlled audio handling",
      );
      assert.doesNotMatch(
        common,
        /nativeUnmute|findAudioButton|unmuteActiveVideo|scheduleNativeUnmute/,
        "Native audio automation should be removed from the shared path",
      );
      assert.doesNotMatch(youtube, /querySelectorAll\("video"\)[\s\S]*?\.play\(\)/);
    },
  ],
  [
    "warn sessions are scoped per Instagram, TikTok, and Facebook route surface",
    () => {
      const instagram = read("content-ig.js");
      const tiktok = read("content-tt.js");
      const facebook = read("content-fb.js");

      assert.match(instagram, /getWarnScope: function \(path\)/);
      assert.match(instagram, /const warnScope = this\.getWarnScope\(path\)/);
      assert.match(instagram, /Utils\.isSessionAllowed\("ig", warnScope\)/);
      assert.match(instagram, /UI\.create\([\s\S]*\{\s*scope: warnScope\s*\}/);
      assert.match(instagram, /if \(CONFIG\.session\.platform === "ig"\) Utils\.clearSession\(\)/);

      assert.match(tiktok, /getWarnScope: function \(path\)/);
      assert.match(tiktok, /const routePath = this\.normalizePath\(path\)/);
      assert.match(tiktok, /const warnScope = this\.getWarnScope\(routePath\)/);
      assert.match(tiktok, /Utils\.isSessionAllowed\("tt", warnScope\)/);
      assert.match(tiktok, /this\.block\(false, warnScope\)/);
      assert.match(tiktok, /UI\.create\([\s\S]*\{\s*scope: warnScope\s*\}/);

      assert.match(facebook, /getWarnScope: function \(path\)/);
      assert.match(facebook, /const warnScope = this\.getWarnScope\(path\)/);
      assert.match(facebook, /Utils\.isSessionAllowed\("fb", warnScope\)/);
      assert.match(facebook, /UI\.create\([\s\S]*\{\s*scope: warnScope\s*\}/);
      assert.match(facebook, /this\.isReelsPath\(path\)/);
    },
  ],
  [
    "blocking overlay rebuilds when mode or warn scope changes",
    () => {
      const common = read("content-common.js");

      assert.match(common, /const existingOverlay = document\.getElementById\(this\.overlayId\)/);
      assert.match(common, /dataset\.ftType/);
      assert.match(common, /dataset\.ftPlatform/);
      assert.match(common, /dataset\.ftScope/);
      assert.match(common, /existingOverlay\.dataset\.ftType === type/);
      assert.match(common, /existingOverlay\.dataset\.ftPlatform === platform/);
      assert.match(common, /existingOverlay\.dataset\.ftScope \|\| ""/);
      assert.match(common, /this\.remove\(\)/);
      assert.match(common, /overlay\.dataset\.ftType = type/);
      assert.match(common, /overlay\.dataset\.ftPlatform = platform/);
      assert.match(common, /overlay\.dataset\.ftScope = nextScope/);
    },
  ],
  [
    "content timer completion toasts do not depend on sender.tab",
    () => {
      const common = read("content-common.js");
      const timerListener = common.match(
        /if \(msg\.action === "TIMER_COMPLETE"\) \{([\s\S]*?)sendResponse\(\{ status: "received" \}\);/,
      );

      assert.ok(timerListener, "Missing TIMER_COMPLETE listener");
      assert.match(timerListener[1], /const isContentTimerMessage = msg\.target === "content"/);
      assert.match(timerListener[1], /const isTabTimerMessage = Boolean\(sender\.tab\)/);
      assert.doesNotMatch(timerListener[1], /if \(sender\.tab\) \{/);
      assert.match(timerListener[1], /if \(!isContentTimerMessage && !isTabTimerMessage\) return/);
      assert.match(timerListener[1], /UI\.showToast/);
    },
  ],
  [
    "content overlays render inline badges without extension image URLs",
    () => {
      const common = read("content-common.js");
      const instagram = read("content-ig.js");
      const facebook = read("content-fb.js");
      const linkedin = read("content-li.js");

      assert.match(common, /createBadge: function/);
      assert.match(common, /document\.createElementNS/);
      [common, instagram, facebook, linkedin].forEach((source) => {
        assert.doesNotMatch(source, /getExtensionUrl/);
        assert.doesNotMatch(source, /chrome\.runtime\.getURL/);
        assert.doesNotMatch(source, /icons\/icon(?:48|128)\.png/);
      });
      [instagram, facebook, linkedin].forEach((source) => {
        assert.match(source, /Utils\.createBadge/);
      });
    },
  ],
  [
    "extension scripts avoid innerHTML assignment warnings",
    () => {
      ["content-common.js", "popup.js", "options.js"].forEach((file) => {
        assert.doesNotMatch(
          read(file),
          /\.innerHTML\s*=/,
          `${file} still assigns to innerHTML`,
        );
      });
    },
  ],
  [
    "Facebook visual hiding stays narrow and Facebook stories are wired",
    () => {
      const common = read("content-common.js");
      const facebook = read("content-fb.js");
      const popup = read("popup.js");
      const options = read("options.js");

      assert.match(common, /fbPeopleYouMightKnow/);
      assert.match(common, /hide_fb_stories/);
      assert.match(common, /hide_fb_people_you_might_know/);
      assert.match(popup, /hide_fb_stories/);
      assert.match(popup, /Hide Stories/);
      assert.match(popup, /hide_fb_people_you_might_know/);
      assert.match(options, /hide_fb_stories/);
      assert.match(options, /hide_fb_people_you_might_know/);
      assert.match(facebook, /applyPeopleYouMightKnowHiding/);
      assert.match(facebook, /findPeopleYouMightKnowContainer/);
      assert.match(facebook, /isUnsafePeopleContainer/);
      assert.doesNotMatch(common, /fbReelsShelves|hide_fb_reels_shelves/);
      assert.doesNotMatch(facebook, /applyReelsShelfHiding|findReelsShelfContainer/);
    },
  ],
  [
    "Facebook People You May Know hiding handles unmarked Friends sections",
    () => {
      const facebook = read("content-fb.js");

      assert.match(facebook, /div\.x1xnnf8n > div:nth-child\(3\)/);
      assert.match(facebook, /a\[href\*="\/friends\/suggestions"\]/);
      assert.match(facebook, /\[aria-label\^="Add Friend"\]/);
      assert.match(facebook, /candidate\.querySelector/);
      assert.match(facebook, /node === document\.body/);
    },
  ],
  [
    "Facebook Reels button hiding only targets the supplied Reels list items",
    () => {
      const facebook = read("content-fb.js");
      const common = read("content-common.js");
      const css = read("content.css");
      const navBlock = facebook.slice(
        facebook.indexOf("applyReelsHiding: function"),
        facebook.indexOf("applyPeopleYouMightKnowHiding: function"),
      );

      assert.match(facebook, /findReelsNavContainer/);
      assert.match(
        facebook,
        /if \(!shouldHide\) \{\s*this\.restoreHiddenNavContainers\(\);\s*return;\s*\}/,
      );
      assert.match(navBlock, /https:\/\/www\.facebook\.com\/reel\/\?s=tab/);
      assert.match(navBlock, /\/reel\/\?s=tab/);
      assert.match(navBlock, /closest\("li"\)/);
      assert.doesNotMatch(navBlock, /\[data-pagelet="LeftRail"\]/);
      assert.doesNotMatch(navBlock, /aria-label\*="Reel"/);
      assert.doesNotMatch(navBlock, /textContent\.trim\(\) === "Reels"/);
      assert.doesNotMatch(navBlock, /Utils\.setInlineStyle\(navRoot/);
      assert.doesNotMatch(common, /ft-hide-fb-reels-nav/);
      assert.doesNotMatch(css, /ft-hide-fb-reels-nav/);
      assert.doesNotMatch(css, /a\[aria-label="Reels"\]\[href\^="\/reel"\]/);
    },
  ],
  [
    "Facebook strict blocking is limited to exact Reels path boundaries",
    () => {
      const facebook = read("content-fb.js");
      assert.match(facebook, /const onReelsPath = this\.isReelsPath\(path\)/);
      assert.match(facebook, /isReelsPath: function \(path\)/);
      assert.match(facebook, /normalizedPath === "\/reel"/);
      assert.match(facebook, /normalizedPath\.startsWith\("\/reel\/"\)/);
      assert.match(facebook, /normalizedPath === "\/reels"/);
      assert.match(facebook, /normalizedPath\.startsWith\("\/reels\/"\)/);
      assert.doesNotMatch(facebook, /path\.includes\("reel"\)/);
      assert.doesNotMatch(facebook, /path\.startsWith\("\/reel"\)/);
    },
  ],
  [
    "Warn overlay pauses media and resumes one visible video without duplicate recovery",
    () => {
      const common = read("content-common.js");
      const instagram = read("content-ig.js");
      const facebook = read("content-fb.js");

      assert.match(common, /isVisibleVideo: function \(video\)/);
      assert.match(common, /chooseVisibleVideo: function \(preferredVideo\)/);
      assert.match(common, /rect\.bottom > 0/);
      assert.match(common, /rect\.top < viewportHeight/);
      assert.match(common, /singleVideo: true/);
      assert.match(common, /if \(el !== activeVideo\) el\.pause\(\)/);
      assert.match(common, /\["tt", "ig"\]\.includes\(platform\)/);
      assert.match(common, /target\.appendChild\(overlay\);\s*this\.startPersistence/);
      assert.doesNotMatch(instagram, /unmuteMedia/);
      assert.doesNotMatch(
        facebook,
        /applyAllowedAudio|handleAudioClick|audioUserMuted|audioClickPending|audioVideoSources|applyAllowedMediaAudio|syncAllowedAudioControl|syncAudioControl/,
      );
    },
  ],
  [
    "TikTok blocking normalizes locale-prefixed routes",
    () => {
      const tiktok = read("content-tt.js");

      assert.match(tiktok, /normalizePath: function \(path\)/);
      assert.match(tiktok, /const locale = normalized\.match/);
      assert.match(tiktok, /[a-z]{2}/);
      assert.match(tiktok, /const routePath = this\.normalizePath\(path\)/);
      assert.match(tiktok, /this\.isBlockablePath\(routePath\)/);
    },
  ],
  [
    "YouTube Shorts redirect prefers in-app Home navigation",
    () => {
      const youtube = read("content-yt.js");

      assert.match(youtube, /navigateHome: function \(\)/);
      assert.match(youtube, /a\[href="\/"\], a\[title="Home"\]/);
      assert.match(youtube, /homeLink\.click\(\)/);
      assert.match(youtube, /new URL\("\/", window\.location\.origin\)/);
    },
  ],
  [
    "LinkedIn Add to your feed hiding supports the current card wrapper",
    () => {
      const linkedin = read("content-li.js");

      assert.match(linkedin, /closest\("div\._1f3f3b6f"\)/);
      assert.match(linkedin, /querySelectorAll\("div\._1f3f3b6f"\)/);
      assert.match(linkedin, /findSidebarCard: function \(headerText\)/);
    },
  ],
  [
    "YouTube Most Relevant shelf hiding is separately wired and subscription scoped",
    () => {
      const common = read("content-common.js");
      const youtube = read("content-yt.js");
      const popup = read("popup.js");
      const options = read("options.js");

      assert.match(common, /ytMostRelevantShelf: true/);
      assert.match(common, /hide_yt_most_relevant_shelf/);
      assert.match(popup, /hide_yt_most_relevant_shelf/);
      assert.match(popup, /Hide "Most Relevant"/);
      assert.match(options, /hide_yt_most_relevant_shelf: true/);
      assert.match(options, /Hide "Most Relevant" Shelf/);

      const mostRelevantBlock = youtube.slice(
        youtube.indexOf("applyMostRelevantShelfHiding: function"),
        youtube.indexOf("setLogoFix: function"),
      );

      assert.match(youtube, /hiddenMostRelevantElements: new Set\(\)/);
      assert.match(youtube, /isSubscriptionsFeed: function/);
      assert.match(
        youtube,
        /window\.location\.pathname\.replace\(\/\\\/\+\$\/,\s*""\)/,
      );
      assert.match(youtube, /return path === "\/feed\/subscriptions"/);
      assert.match(mostRelevantBlock, /!CONFIG\.visualHiding\.ytMostRelevantShelf/);
      assert.match(mostRelevantBlock, /!this\.isSubscriptionsFeed\(\)/);
      assert.match(
        mostRelevantBlock,
        /this\.restoreHidden\(this\.hiddenMostRelevantElements\)/,
      );
      assert.match(
        mostRelevantBlock,
        /querySelectorAll\("ytd-rich-section-renderer, ytd-reel-shelf-renderer"\)/,
      );
      assert.match(youtube, /getShelfHeadingText: function/);
      assert.match(youtube, /isEnglishMostRelevantShelf: function/);
      assert.match(youtube, /toLowerCase\(\) === "most relevant"/);
    },
  ],
  [
    "YouTube inline hiding runs for late DOM mutations without changing Shorts behavior",
    () => {
      const youtube = read("content-yt.js");

      assert.match(youtube, /scheduleInlineHiding: function/);
      assert.match(
        youtube,
        /new MutationObserver\(\(\) => \{\s*this\.scheduleInlineHiding\(\);\s*this\.runChecks\(\);/,
      );
      assert.match(youtube, /requestAnimationFrame\(run\)/);
      assert.match(youtube, /this\.applyMostRelevantShelfHiding\(\)/);
      assert.match(youtube, /this\.restoreHidden\(this\.hiddenNavElements\)/);
      assert.match(youtube, /this\.restoreHidden\(this\.hiddenFocusElements\)/);
      assert.match(youtube, /this\.restoreHidden\(this\.hiddenMostRelevantElements\)/);
      assert.match(youtube, /CONFIG\.visualHiding\.ytShortsNav/);
      assert.match(youtube, /CONFIG\.visualHiding\.ytShortsShelves/);
      assert.match(youtube, /a\[href\^="\/shorts"\]/);
      assert.match(
        youtube,
        /ytd-rich-shelf-renderer\[is-shorts\], ytd-rich-shelf-renderer\[is-shorts=""\]/,
      );
    },
  ],
  [
    "release timer duration options do not include temporary one-minute entries",
    () => {
      const options = read("options.html");

      assert.doesNotMatch(
        options,
        /id="focusDuration"[\s\S]*<option value="1">1 minute \(testing only\)<\/option>/,
      );
      assert.doesNotMatch(
        options,
        /id="breakDuration"[\s\S]*<option value="1">1 minute \(testing only\)<\/option>/,
      );
    },
  ],
  [
    "popup updates the visible break prompt wrapper consistently",
    () => {
      const popup = read("popup.js");

      assert.match(popup, /function\s+setBreakPromptVisible/);
      assert.match(popup, /setBreakPromptVisible\(showBtn\)/);
    },
  ],
  [
    "sound playback setting is removed while notifications remain",
    () => {
      const popup = read("popup.js");
      const options = read("options.js");
      const optionsHtml = read("options.html");
      const background = read("background.js");
      const common = read("content-common.js");

      assert.doesNotMatch(popup, /function\s+playBeep/);
      assert.doesNotMatch(popup, /playSound/);
      assert.doesNotMatch(options, /function\s+playBeep/);
      assert.doesNotMatch(options, /playSound/);
      assert.doesNotMatch(optionsHtml, /id="playSound"/);
      assert.doesNotMatch(common, /playSound/);
      assert.doesNotMatch(common, /playBeep/);
      assert.match(background, /showNotifications/);
    },
  ],
  [
    "popup menu mini-switch knobs are vertically centered",
    () => {
      const css = read("styles.css");

      assert.match(css, /\.mini-slider\s*\{[\s\S]*box-sizing: border-box;/);
      assert.match(css, /\.mini-slider::before\s*\{[\s\S]*top: 50%;/);
      assert.match(
        css,
        /\.mini-switch input:checked \+ \.mini-slider::before\s*\{[\s\S]*translate\(16px, -50%\)/,
      );
    },
  ],
  [
    "extension-page controls inherit the FocusTube font stack",
    () => {
      const popupCss = read("styles.css");
      const optionsHtml = read("options.html");

      assert.match(
        popupCss,
        /\.focustube-popup-body button,[\s\S]*\.focustube-popup-body textarea\s*\{\s*font-family: inherit;/,
      );
      assert.match(
        optionsHtml,
        /button,\s*input,\s*select,\s*textarea\s*\{\s*font-family: inherit;/,
      );
      assert.match(
        read("content.css"),
        /\.ft-linkedin-overlay,[\s\S]*\.ft-stories-overlay\s*\{[\s\S]*font-family:[\s\S]*sans-serif !important;[\s\S]*\.ft-linkedin-overlay-btn\s*\{[\s\S]*font-family: inherit;/,
      );
    },
  ],
  [
    "active break timer uses the normal popup text color",
    () => {
      const css = read("styles.css");

      assert.match(css, /\.timer-type-label\.break\s*\{\s*color: var\(--text\);/);
      assert.match(
        css,
        /\.timer-display-compact\.break\s*\{\s*color: var\(--text\);/,
      );
    },
  ],
  [
    "strict redirect notices survive page navigation",
    () => {
      const common = read("content-common.js");
      const youtube = read("content-yt.js");
      const instagram = read("content-ig.js");

      assert.match(common, /markKick: function \(platform, done\)/);
      assert.match(common, /consumeKick: function \(platform, callback\)/);
      assert.match(common, /n\.id = "ft-kick-notification"/);
      assert.match(youtube, /Utils\.markKick\("yt"/);
      assert.match(youtube, /if \(window\.location\.href\.includes\("\/shorts\/"\)\) return;/);
      assert.match(youtube, /Utils\.consumeKick\("yt"/);
      assert.match(instagram, /Utils\.markKick\("ig"/);
      assert.match(instagram, /Utils\.consumeKick\("ig"/);
    },
  ],
  [
    "background runtime callbacks consume expected lastError noise explicitly",
    () => {
      const background = read("background.js");

      assert.match(background, /function consumeRuntimeError\(\)/);
      assert.match(background, /chrome\.runtime\.sendMessage\([\s\S]*consumeRuntimeError/);
      assert.match(background, /chrome\.tabs\.sendMessage\([\s\S]*consumeRuntimeError/);
      assert.match(background, /chrome\.notifications\.create\([\s\S]*consumeRuntimeError/);
      assert.doesNotMatch(background, /if \(chrome\.runtime(?: && chrome\.runtime)?\.lastError\) \{\s*\}/);
      assert.doesNotMatch(background, /catch \(e\) \{\s*\}/);
    },
  ],
  [
    "runtime cleanup and import validation stay defensive",
    () => {
      const background = read("background.js");
      const common = read("content-common.js");
      const options = read("options.js");
      const popup = read("popup.js");

      assert.match(background, /const delta = statIncrementPending/);
      assert.match(background, /statIncrementPending \+= delta/);
      assert.match(background, /Array\.isArray\(tabs\)/);
      assert.match(common, /pruneDetachedElements: function \(set\)/);
      assert.match(common, /this\._mediaElements\.delete\(el\)/);
      assert.doesNotMatch(common, /if \(chrome\.runtime\.lastError\) \{\s*\}/);
      assert.doesNotMatch(common, /\.catch\(\(\) => \{\}\)/);
      assert.match(common, /reportError\("resuming visible media", error\)/);
      assert.match(common, /reportError\("restoring media playback", error\)/);
      assert.match(options, /Object\.prototype\.hasOwnProperty\.call/);
      assert.match(popup, /window\.addEventListener\("pagehide", cleanup/);
      assert.match(popup, /timerInterval = null/);
    },
  ],
  [
    "G014 keeps timer mutation authority in the serialized background",
    () => {
      const background = read("background.js");
      const popup = read("popup.js");
      const options = read("options.js");
      const common = read("content-common.js");

      assert.match(background, /function enqueueTimerOperation\(operation\)/);
      assert.match(background, /request\.action === "startTimer"[\s\S]*enqueueTimerOperation/);
      assert.match(background, /request\.action === "stopTimer"[\s\S]*enqueueTimerOperation/);
      assert.match(background, /request\.action === "startBreak"[\s\S]*enqueueTimerOperation/);
      const startBreak = background.slice(background.indexOf('request.action === "startBreak"'));
      assert.match(startBreak, /enqueueTimerOperation[\s\S]*storage\.local\.remove\("ft_work_session_ended"/);

      assert.doesNotMatch(popup, /storage\.local\.(?:set|remove|clear)\([\s\S]{0,120}ft_(?:timer_end|timer_type|work_session_ended)/);
      assert.doesNotMatch(options, /storage\.local\.(?:set|remove|clear)\([\s\S]{0,180}ft_(?:timer_end|timer_type|work_session_ended)/);
      assert.doesNotMatch(common, /storage\.local\.(?:set|remove|clear)\([\s\S]{0,180}ft_(?:timer_end|timer_type|work_session_ended)/);
      assert.doesNotMatch(options, /chrome\.storage\.local\.clear/);
      assert.match(popup, /action: "dismissEndedPrompt"/);
      assert.match(options, /action: "replaceSettings"/);
    },
  ],
  [
    "G014 validates the background-owned settings replacement boundary",
    () => {
      const background = read("background.js");

      assert.match(background, /request\.action === "replaceSettings"/);
      assert.match(background, /sender\.id === chrome\.runtime\.id/);
      assert.match(background, /sender\.url/);
      assert.match(background, /request\.settings && typeof request\.settings === "object"/);
      assert.match(background, /chrome\.alarms\.clear\(TIMER_ALARM_NAME/);
      assert.match(background, /enqueueTimerOperation/);
      assert.match(background, /retry/i);
    },
  ],
  [
    "timerWriteExpected never reconstructs imported state from a partial change event",
    () => {
      const background = read("background.js");

      assert.doesNotMatch(
        background,
        /const nextSnapshot = \{\s*end: changes\.ft_timer_end \? changes\.ft_timer_end\.newValue : undefined,\s*type: changes\.ft_timer_type \? changes\.ft_timer_type\.newValue : undefined,\s*\};/,
        "timerWriteExpected must not compare a partial onChanged snapshot",
      );
    },
  ],
  [
    "import validation requires a complete, recognized timer pair",
    () => {
      const options = read("options.js");
      const importBlock = options.slice(
        options.indexOf("function sanitizeImportData"),
        options.indexOf("function loadSettings"),
      );

      assert.match(importBlock, /const hasTimerEnd = hasOwn\(raw, "ft_timer_end"\)/);
      assert.match(importBlock, /const hasTimerType = hasOwn\(raw, "ft_timer_type"\)/);
      assert.match(
        importBlock,
        /if \(hasTimerEnd !== hasTimerType\)[\s\S]*ft_timer_end and ft_timer_type must be imported together/,
      );
      assert.match(
        importBlock,
        /raw\.ft_timer_end === null[\s\S]*delete sanitized\.ft_timer_end[\s\S]*delete sanitized\.ft_timer_type/,
      );
      assert.match(importBlock, /key !== "ft_timer_end" \|\| value > 0/);
      assert.match(importBlock, /value === "work" \|\| value === "break"/);
      assert.doesNotMatch(importBlock, /value === null\)[\s\S]*sanitized\[key\] = null/);
      assert.match(
        importBlock,
        /if \(invalidKeys\.length > 0\)[\s\S]*return \{ error:/,
      );
      assert.match(
        importBlock,
        /if \(hasTimerEnd !== hasTimerType\)[\s\S]*if \(invalidKeys\.length > 0\)/,
        "A complete timer pair must proceed to normal validation",
      );
      assert.match(
        options,
        /chrome\.runtime\.sendMessage\(\s*\{ action: "replaceSettings", settings: sanitized \}/,
      );
    },
  ],
  [
    "syntax validation includes nested test and script files",
    () => {
      const runner = read("scripts/run-test-all.js");

      assert.match(runner, /function collectJavaScriptFiles\(directory\)/);
      assert.match(runner, /collectJavaScriptFiles\(path\.join\(root, "scripts"\)\)/);
      assert.match(runner, /collectJavaScriptFiles\(path\.join\(root, "tests"\)\)/);
    },
  ],
  [
    "break prompt waits for start success and reconciles failure",
    () => {
      const popup = read("popup.js");
      const breakHandler = popup.slice(
        popup.indexOf('breakBtn.addEventListener("click"'),
        popup.indexOf('if (skipBreakBtn)', popup.indexOf('breakBtn.addEventListener("click"')),
      );

      assert.match(
        popup,
        /function reconcileBreakState\(\)[\s\S]*ft_timer_end[\s\S]*ft_timer_type[\s\S]*ft_work_session_ended/,
      );
      assert.doesNotMatch(
        breakHandler.slice(0, breakHandler.indexOf('chrome.runtime.sendMessage(')),
        /setBreakPromptVisible\(false\)/,
      );
      assert.match(
        breakHandler,
        /response && Number\.isFinite\(response\.end\) && response\.end > Date\.now\(\)[\s\S]*setBreakPromptVisible\(false\)[\s\S]*startTimerDisplay\(response\.end, "break"\)/,
      );
      assert.match(breakHandler, /reconcileBreakState\(\)/);
    },
  ],
  [
    "dismissed break prompt requires success and recovers from durable marker",
    () => {
      const popup = read("popup.js");
      const dismissHandler = popup.slice(
        popup.indexOf('skipBreakBtn.addEventListener("click"'),
      );

      assert.match(
        dismissHandler,
        /response && response\.dismissed === true[\s\S]*setBreakPromptVisible\(false\)/,
      );
      assert.match(
        dismissHandler,
        /chrome\.storage\.local\.get\(\["ft_work_session_ended"\][\s\S]*res\.ft_work_session_ended === true[\s\S]*setBreakPromptVisible\(true\)/,
      );
      assert.doesNotMatch(
        dismissHandler,
        /sendMessage\(\{ action: "dismissEndedPrompt" \}\);\s*setBreakPromptVisible\(false\)/,
      );
    },
  ],
  [
    "popup stop UI waits for a successful background response and reconciles failures",
    () => {
      const popup = read("popup.js");
      const stopHandler = popup.match(
        /timerBtn\.addEventListener\("click", \(\) => \{([\s\S]*?)\n  \}\);/,
      );

      assert.ok(stopHandler, "Missing timer button click handler");
      const stopBranch = stopHandler[1].slice(
        stopHandler[1].indexOf("if (timerBtn.classList.contains(\"active\"))"),
        stopHandler[1].indexOf("} else {"),
      );
      const stopCall = stopHandler[1].slice(
        stopHandler[1].indexOf('chrome.runtime.sendMessage({ action: "stopTimer"'),
        stopHandler[1].indexOf("} else {"),
      );
      assert.match(
        stopCall,
        /chrome\.runtime\.sendMessage\(\{ action: "stopTimer" \},\s*\(response\) =>/,
        "Stopping must wait for the background response",
      );
      assert.match(
        stopCall,
        /response\.(?:stopped|stopped\?) === true|response && response\.stopped === true/,
        "The popup must only treat an explicit stopped:true response as success",
      );
      assert.doesNotMatch(
        stopBranch.slice(0, stopBranch.indexOf("chrome.runtime.sendMessage")),
        /resetTimerUI\(\)/,
        "Stop UI must not reset before the background responds",
      );
      assert.match(
        stopCall,
        /chrome\.storage\.local\.get\([\s\S]*?ft_timer_end[\s\S]*?ft_timer_type/,
        "A failed stop must re-read both durable timer fields",
      );
      assert.match(
        stopCall,
        /startTimerDisplay\(/,
        "A durable active timer must be repainted after stop failure",
      );
      assert.doesNotMatch(
        stopCall,
        /(?:else|if \(!.*stopped)[\s\S]*?innerText\s*=\s*["'`]Start Timer["'`]/,
        "A failed stop must not show a false stopped state",
      );
    },
  ],
  [
    "popup preserves the active timer when stop recovery storage is unavailable",
    () => {
      const popup = read("popup.js");
      const stopHandler = popup.match(
        /timerBtn\.addEventListener\("click", \(\) => \{([\s\S]*?)\n  \}\);/,
      );

      assert.ok(stopHandler, "Missing timer button click handler");
      const stopCall = stopHandler[1].slice(
        stopHandler[1].indexOf('chrome.runtime.sendMessage({ action: "stopTimer"'),
        stopHandler[1].indexOf("} else {"),
      );
      const storageErrorBranch = stopCall.match(
        /if \(chrome\.runtime\.lastError\) \{([\s\S]*?)\n\s*\}/,
      );

      assert.ok(storageErrorBranch, "Missing stop recovery storage error branch");
      assert.doesNotMatch(
        storageErrorBranch[1],
        /resetTimerUI\(\)/,
        "A failed recovery read must preserve the current active timer display",
      );
      assert.match(
        storageErrorBranch[1],
        /return;/,
        "A failed recovery read must leave the active display untouched",
      );
    },
  ],
  [
    "content timer changes reconcile an atomic durable end/type pair",
    () => {
      const common = read("content-common.js");
      const listener = common.match(
        /chrome\.storage\.onChanged\.addListener\(\(changes, area\) => \{([\s\S]*?)\r?\n\s*\}\);\s*chrome\.runtime\.onMessage/,
      );

      assert.ok(listener, "Missing content storage change listener");
      const timerChange = listener[1].slice(
        listener[1].indexOf("if (changes.ft_timer_end || changes.ft_timer_type)"),
      );
      assert.match(
        timerChange,
        /chrome\.storage\.local\.get\(\[[\s\S]*?["']ft_timer_end["'][\s\S]*?["']ft_timer_type["'][\s\S]*?\],/,
        "Either timer field change must re-read both durable fields",
      );
      assert.match(
        timerChange,
        /CONFIG\.timer\.end\s*=\s*res\.ft_timer_end[\s\S]*CONFIG\.timer\.type\s*=\s*res\.ft_timer_type/,
        "CONFIG.timer must be updated from one durable snapshot",
      );
      assert.match(
        timerChange,
        /CONFIG\.timer\.type\s*=\s*res\.ft_timer_type[\s\S]*document\.dispatchEvent\(/,
        "Timer state must dispatch only after both fields are reconciled",
      );
      assert.doesNotMatch(
        timerChange,
        /CONFIG\.timer\.end\s*=\s*changes\.ft_timer_end\.newValue|CONFIG\.timer\.type\s*=\s*changes\.ft_timer_type\.newValue/,
        "Partial change events must not create a transient mixed pair",
      );
    },
  ],
  [
    "extension enablement is serialized through the background",
    () => {
      const popup = read("popup.js");
      const options = read("options.js");
      const background = read("background.js");

      [popup, options].forEach((source, index) => {
        const file = index === 0 ? "popup.js" : "options.js";
        assert.doesNotMatch(
          source,
          /chrome\.storage\.local\.set\(\{\s*ft_enabled\s*:/,
          `${file} must not write ft_enabled directly`,
        );
        assert.doesNotMatch(
          source,
          /chrome\.runtime\.sendMessage\(\s*JSON\.stringify\(\s*\{[\s\S]*?action:\s*["']setExtensionEnabled["']/,
          `${file} must not serialize the setExtensionEnabled message`,
        );
        assert.match(
          source,
          /chrome\.runtime\.sendMessage\(\s*\{[\s\S]*?action:\s*["']setExtensionEnabled["'][\s\S]*?\benabled\b/,
          `${file} must send a plain setExtensionEnabled message object`,
        );
      });
      const optionsToggleHandler = options.match(
        /toggle\.addEventListener\(\s*["']change["']\s*,\s*function\s*\(\)\s*\{([\s\S]*?)\r?\n\s*\}\s*\);/,
      );
      assert.ok(optionsToggleHandler, "Missing options toggle handler");
      const enabledBranch = optionsToggleHandler[1].match(
        /if\s*\(\s*this\.id\s*===\s*["']ft_enabled["']\s*\)\s*\{([\s\S]*?)\r?\n\s*\}/,
      );
      assert.ok(enabledBranch, "Missing ft_enabled options branch");
      assert.doesNotMatch(
        enabledBranch[1],
        /saveSetting\(this\.id, this\.checked\)/,
        "The ft_enabled options branch must not fall through to direct storage writes",
      );
      assert.match(
        background,
        /JSON\.parse\(request\)[\s\S]*?action\s*===\s*["']setExtensionEnabled["']/,
        "Background must parse and handle setExtensionEnabled",
      );
      assert.match(
        background,
        /setExtensionEnabled[\s\S]*?chrome\.storage\.local\.set\(\{\s*ft_enabled:/,
        "Background must own the ft_enabled write",
      );
    },
  ],
  [
    "settings replacement and displayed version remain release-gated at 2.3.2",
    () => {
      const options = read("options.html");
      const changelog = read("CHANGELOG.md");
      const chromeManifest = readJson("chrome-manifest.json");
      const firefoxManifest = readJson("firefox-manifest.json");

      assert.match(read("options.js"), /action:\s*["']replaceSettings["']/);
      assert.match(options, /Version\s+2\.3\.2/);
      assert.equal(chromeManifest.version, "2.3.2");
      assert.equal(firefoxManifest.version, "2.3.2");
      assert.match(
        changelog,
        /^##\s*\[Unreleased\]\s*\r?\n\s*No unreleased changes yet\./m,
      );
      assert.match(changelog, /^##\s*\[2\.3\.2\]\s*-\s*2026-09-01$/m);
    },
  ],
  [
    "Chrome and Firefox manifests keep supported extension shape",
    () => {
      const chromeManifest = readJson("chrome-manifest.json");
      const firefoxManifest = readJson("firefox-manifest.json");

      assert.equal(chromeManifest.manifest_version, 3);
      assert.equal(firefoxManifest.manifest_version, 2);
      assert.equal(chromeManifest.version, "2.3.2");
      assert.equal(firefoxManifest.version, "2.3.2");
      assert.deepEqual(chromeManifest.content_security_policy, {
        extension_pages: "script-src 'self'; object-src 'self';",
      });
      assert.equal(
        firefoxManifest.content_security_policy,
        "script-src 'self'; object-src 'self';",
      );
      assert.equal(firefoxManifest.incognito, "not_allowed");
      assert.deepEqual(chromeManifest.permissions, [
        "storage",
        "alarms",
        "notifications",
      ]);
      const geckoSettings = firefoxManifest.browser_specific_settings.gecko;
      if (geckoSettings.data_collection_permissions) {
        assert.ok(
          parseFloat(geckoSettings.strict_min_version) >= 142,
          "Firefox data_collection_permissions requires strict_min_version >= 142",
        );
      }
      assertPerPlatformContentScripts(chromeManifest);
      assertPerPlatformContentScripts(firefoxManifest);
      assert.doesNotMatch(JSON.stringify(chromeManifest), /hide_ig_feed_reels/);
      assert.doesNotMatch(JSON.stringify(firefoxManifest), /hide_ig_feed_reels/);
    },
  ],
];

for (const [name, check] of checks) {
  try {
    check();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
