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
    assert.deepEqual(entry.js, ["i18n.js", "content-common.js", platformScript]);
    assert.equal(entry.run_at, "document_start");
  });
}

const checks = [
  [
    "CodeQL workflows keep init, analyze, and SARIF upload pinned consistently",
    () => {
      function assertConsistentPins(codeql, scorecard) {
        const pins = [];
        for (const [source, expectedActions] of [
          [codeql, ["analyze", "init"]],
          [scorecard, ["upload-sarif"]],
        ]) {
          const usages = [
            ...source.matchAll(
              /^[ \t]*(?:-[ \t]*)?uses:[ \t]*["']?github\/codeql-action\/([^\s@"']+)([^\r\n]*)$/gm,
            ),
          ];
          assert.deepEqual(
            usages.map((usage) => usage[1]).sort(),
            expectedActions,
            "Each required CodeQL action must appear exactly once",
          );
          for (const [, action, reference] of usages) {
            const pin = reference.match(
              /^@([a-f\d]{40})["']?[ \t]*#[ \t]*(v\d+\.\d+\.\d+)[ \t]*$/i,
            );
            assert.ok(pin, `${action} must have a full SHA and version comment`);
            pins.push({ sha: pin[1].toLowerCase(), version: pin[2] });
          }
        }
        assert.equal(
          new Set(pins.map((pin) => pin.sha)).size, 1,
          "CodeQL action SHAs must match across workflows",
        );
        assert.equal(
          new Set(pins.map((pin) => pin.version)).size, 1,
          "CodeQL action version comments must match across workflows",
        );
      }

      const previous = "cdf488f595d80d6e07e03d4674febd5ab45fa938 # v4.37.9";
      const updated = "2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2 # v4.38.2";
      const fixture = (init, analyze, upload) => [
        `- uses: github/codeql-action/init@${init}\n  uses: github/codeql-action/analyze@${analyze}`,
        `  uses: github/codeql-action/upload-sarif@${upload}`,
      ];

      // Reproduce the independent updates in PRs #54 and #56, and a stale uploader.
      for (const pins of [
        [previous, updated, previous],
        [updated, previous, previous],
        [updated, updated, previous],
      ]) {
        assert.throws(() => assertConsistentPins(...fixture(...pins)),
          /CodeQL action SHAs must match/);
      }
      assert.throws(() => assertConsistentPins(...fixture(
        updated, updated, updated.replace("v4.38.2", "v4.37.9"),
      )), /CodeQL action version comments must match/);
      for (const invalidPin of ["v4", `${"a".repeat(39)} # v9.0.0`, "a".repeat(40)]) {
        assert.throws(() => assertConsistentPins(...fixture(
          invalidPin, invalidPin, invalidPin,
        )), /full SHA and version comment/);
      }
      const validPin = `${"a".repeat(40)} # v9.0.0`;
      const validFixture = fixture(validPin, validPin, validPin);
      assertConsistentPins(...validFixture);
      assertConsistentPins(...validFixture.map((source) => source
        .replaceAll("uses: ", 'uses:\t"')
        .replaceAll(" # ", '"\t#\t')
        .replaceAll("\n", "\r\n")));
      assert.throws(() => assertConsistentPins(validFixture[0], ""),
        /Each required CodeQL action/);
      assert.throws(() => assertConsistentPins(
        `${validFixture[0]}\n${validFixture[0]}`, validFixture[1],
      ), /Each required CodeQL action/);
      assertConsistentPins(
        read(".github/workflows/codeql.yml"),
        read(".github/workflows/scorecard.yml"),
      );
    },
  ],
  [
    "Reddit route classifier covers multireddits and custom feeds",
    () => {
      const Reddit = vm.runInNewContext(`${read("content-rd.js")}\nReddit;`, {
        Site: { isRD: () => false },
      });
      const scope = (pathname) => Reddit.classifyRoute(pathname)?.scope || null;
      assert.equal(scope("/r/pics"), "r/pics");
      assert.equal(scope("/r/pics+funny/top"), "r/pics+funny");
      assert.equal(scope("/user/some-name/m/news_feed"), "m/some-name/news_feed");
      assert.equal(scope("/u/someone/m/feed/new"), "m/someone/feed");
      assert.equal(scope("/user/someone/m/feed/comments"), null);
      assert.equal(scope("/user/someone"), null);
      assert.equal(scope("/r/pics+"), null);
      assert.equal(scope("/r/pics/comments/abc/title"), null);
    },
  ],
  [
    "Facebook Reels shelves are found by feed item, not by heading text",
    () => {
      let links = [];
      const Facebook = vm.runInNewContext(`${read("content-fb.js")}\nFacebook;`, {
        Site: { isFB: () => false },
        location: { href: "https://www.facebook.com/" },
        URL,
        document: { querySelectorAll: () => links },
        Utils: {
          pruneDetachedElements: () => {},
          setInlineStyle: (el, prop, value) => { el.style[prop] = value; },
          restoreInlineStyle: (el, prop) => { delete el.style[prop]; },
        },
      });
      const item = () => ({ style: {}, querySelectorAll: () => [] });
      const link = (href, owner) => ({ href, closest: () => owner });
      const shelf = item();
      const post = item();
      const nav = item();
      const shelfLinks = [1, 2, 3, 4].map((n) => link(`/reel/10${n}/?s=ifu`, shelf));
      links = [
        ...shelfLinks,
        link("/reel/200/", post), link("/reel/200/?s=again", post), link("https://www.facebook.com/reel/200", post),
        link("/reel/?s=tab", nav), link("/reel/?s=tab", nav), link("/reel/?s=tab", nav),
        link("/reel/300/", null), link("/reel/301/", null), link("/reel/302/", null),
      ];
      Facebook.applyReelShelfHiding(true);
      assert.equal(shelf.style.display, "none", "an item linking four Reels is hidden");
      assert.equal(post.style.display, undefined, "one Reel linked three times is a post");
      assert.equal(nav.style.display, undefined, "the Reels tab link is not a Reel");

      links = links.filter((el) => !shelfLinks.slice(1).includes(el));
      Facebook.applyReelShelfHiding(true);
      assert.equal(shelf.style.display, undefined, "an item that stops being a shelf is restored");

      links.push(...shelfLinks.slice(1));
      Facebook.applyReelShelfHiding(true);
      assert.equal(shelf.style.display, "none");
      Facebook.applyReelShelfHiding(false);
      assert.equal(shelf.style.display, undefined, "turning the setting off restores shelves");

      const facebook = read("content-fb.js");
      const disable = facebook.slice(facebook.indexOf("disable: function"), facebook.indexOf("scheduleMutationCheck: function"));
      assert.match(disable, /restoreHiddenReelShelves\(\)/);
    },
  ],
  [
    "Instagram reads the Ad label as sponsored and LinkedIn feed visits are not counted",
    () => {
      const IGFeed = vm.runInNewContext(`${read("content-ig.js")}\nIGFeed;`, {
        Site: { isIG: () => false },
      });
      assert.ok(IGFeed.SPONSORED_LABELS.includes("ad"));
      assert.ok(IGFeed.SPONSORED_LABELS.includes("sponsored"));
      const linkedin = read("content-li.js");
      const overlay = linkedin.slice(
        linkedin.indexOf("showFeedOverlay: function"),
        linkedin.indexOf("findSidebarCard: function"),
      );
      assert.doesNotMatch(overlay, /logStat/);
    },
  ],
  [
    "content script event bus works without EventTarget (Firefox sandbox)",
    () => {
      const common = read("content-common.js");
      assert.doesNotMatch(common, /new EventTarget\(/, "Firefox content scripts never call EventTarget listeners");
      const bus = common.slice(common.indexOf("const FTEvents = {"), common.indexOf("// The options page labels modes"));
      const errors = [];
      const FTEvents = vm.runInNewContext(`${bus}\nFTEvents;`, { console: { error: (...args) => errors.push(args) } });
      const calls = [];
      FTEvents.addEventListener("ft-settings-ready", () => calls.push("once"), { once: true });
      FTEvents.addEventListener("ft-settings-ready", () => { throw new Error("boom"); });
      FTEvents.addEventListener("ft-settings-ready", () => calls.push("always"));
      FTEvents.addEventListener("ft-settings-changed", () => calls.push("changed"));
      FTEvents.dispatchEvent({ type: "ft-settings-ready" });
      FTEvents.dispatchEvent({ type: "ft-settings-ready" });
      FTEvents.dispatchEvent({ type: "ft-settings-changed" });
      assert.deepEqual(calls, ["once", "always", "always", "changed"]);
      assert.equal(errors.length, 2, "a failing listener is reported and the rest still run");
    },
  ],
  [
    "hidden platforms are allowed synchronously when restriction is off",
    () => {
      const common = read("content-common.js");
      const prelude = common.slice(0, common.indexOf("function currentSitePlatform()"));
      const context = { location: { hostname: "example.test" }, globalThis: {}, EventTarget };
      vm.runInNewContext(
        `${prelude}\nCONFIG.restrictHidden = false; CONFIG.popupVisibility = { yt: false };\n` +
          "globalThis.result = withHiddenPlatformOverrides({ yt: 'strict', ig: 'warn' });\n" +
          "CONFIG.restrictHidden = true; globalThis.restricted = withHiddenPlatformOverrides({ yt: 'strict' });",
        context,
      );
      assert.equal(context.globalThis.result.yt, "allow");
      assert.equal(context.globalThis.result.ig, "warn");
      assert.equal(context.globalThis.restricted.yt, "strict");
    },
  ],
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
      assert.equal(isSite("reddit.com", "isRD"), true);
      assert.equal(isSite("www.reddit.com", "isRD"), true);
      assert.equal(isSite("old.reddit.com", "isRD"), false);
      assert.equal(isSite("redd.it", "isRD"), false);
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
      assert.match(popup, /labelKey:\s*"hideStories"/);
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
      assert.match(facebook, /if \(onReelsPath\) \{[\s\S]*this\.removeStoriesOverlay\(\)/);
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
    "LinkedIn visual hiding fails open outside scoped feed and sidebar containers",
    () => {
      const linkedin = read("content-li.js");
      const feedBlock = linkedin.slice(
        linkedin.indexOf("showFeedOverlay: function"),
        linkedin.indexOf("findSidebarCard: function"),
      );
      const sidebarBlock = linkedin.slice(
        linkedin.indexOf("findSidebarCard: function"),
        linkedin.indexOf("showSidebarOverlays: function"),
      );

      assert.match(linkedin, /closest\("div\._1f3f3b6f"\)/);
      assert.match(linkedin, /root\.querySelectorAll\("div\._1f3f3b6f"\)/);
      assert.match(linkedin, /findSidebarCard: function \(headerText\)/);
      assert.doesNotMatch(feedBlock, /querySelector\("main"\)/);
      assert.doesNotMatch(sidebarBlock, /document\.body/);
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
      assert.match(popup, /labelKey:\s*"hideMostRelevantShelfShort"/);
      assert.match(options, /hide_yt_most_relevant_shelf: true/);
      assert.match(options, /msg\("hideMostRelevantShelf"\)/);

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
        /new MutationObserver\(\(mutations\) => \{/,
      );
      const observerBlock = youtube.slice(
        youtube.indexOf("ensureObservers: function"),
        youtube.indexOf("disable: function"),
      );
      assert.doesNotMatch(observerBlock, /this\.runChecks\(\)/);
      assert.match(observerBlock, /characterData: true/);
      assert.match(observerBlock, /this\.scheduleInlineHiding\(\)/);
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
    "timer duration UI synchronizes silently and the removed active-timer pill does not affect mode locking",
    () => {
      const options = read("options.js");
      const optionsHtml = read("options.html");
      const storageSyncBlock = options.slice(
        options.indexOf('chrome.storage.onChanged.addListener((changes, area) => {'),
        options.indexOf("initPlatformGrid();"),
      );

      assert.match(options, /function syncSelect\(select, value, expectedRevision\)/);
      assert.match(options, /function hydrateSelect\(select, value, expectedRevision\)/);
      assert.match(storageSyncBlock, /changes\.ft_timer_duration[\s\S]*syncSelect\(/);
      assert.match(storageSyncBlock, /changes\.breakDuration[\s\S]*syncSelect\(/);
      assert.doesNotMatch(storageSyncBlock, /dispatchEvent\(/);
      assert.match(options, /disableModeButtons\(timerActive \|\| !isEnabled\)/);
      assert.doesNotMatch(optionsHtml, /id="timerActivePill"/);
      assert.doesNotMatch(options, /updateTimerActivePill/);
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
      assert.match(youtube, /if \(this\.isDistractingRoute\(window\.location\.pathname\)\) return;/);
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
        /if \(hasTimerEnd !== hasTimerType\)[\s\S]*errorKey: "importTimerFieldsTogether"/,
      );
      assert.match(
        importBlock,
        /raw\.ft_timer_end === null[\s\S]*delete sanitized\.ft_timer_end[\s\S]*delete sanitized\.ft_timer_type/,
      );
      assert.match(importBlock, /key !== "ft_timer_end" \|\| value > 0/);
      assert.match(importBlock, /allowedDurationValues/);
      assert.match(importBlock, /allowedDurations\.has\(value\)/);
      assert.match(importBlock, /value === "work" \|\| value === "break"/);
      assert.doesNotMatch(importBlock, /value === null\)[\s\S]*sanitized\[key\] = null/);
      assert.match(
        importBlock,
        /if \(invalidKeys\.length > 0\)[\s\S]*errorKey: "importInvalidValues"/,
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
        /CONFIG\.timer\.type\s*=\s*res\.ft_timer_type[\s\S]*FTEvents\.dispatchEvent\(/,
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
    "Instagram suggested posts use a compact presentation without fixed height state",
    () => {
      const instagram = read("content-ig.js");
      const css = read("content.css");

      assert.doesNotMatch(instagram, /MIN_COLLAPSED_HEIGHT|measureHeight|ftIgHeight/);
      assert.match(instagram, /document\.createElement\("span"\)[\s\S]*ftMessage\("hidden"\)/);
      assert.doesNotMatch(instagram, /createBadge\("ft-ig-stub-icon"\)/);
      assert.doesNotMatch(instagram, /ftMessage\("overlayProductiveShort"\)/);
      assert.match(
        css,
        /body\.ft-hide-ig-suggested\.ft-platform-ig article\.ft-ig-collapsed\s*\{[\s\S]*height:\s*auto !important;[\s\S]*min-height:\s*0 !important;[\s\S]*block-size:\s*auto !important;[\s\S]*min-block-size:\s*0 !important;/,
      );
      assert.match(css, /\.ft-ig-stub-btn:focus-visible\s*\{[\s\S]*outline:/);
    },
  ],
  [
    "settings replacement and displayed version remain release-gated at 2.5.1",
    () => {
      const options = read("options.html");
      const changelog = read("CHANGELOG.md");
      const chromeManifest = readJson("chrome-manifest.json");
      const firefoxManifest = readJson("firefox-manifest.json");

      assert.match(read("options.js"), /action:\s*["']replaceSettings["']/);
      assert.match(options, /Version\s+2\.5\.1/);
      assert.match(options, /data-i18n-args='\["2\.5\.1"\]'/);
      assert.equal(chromeManifest.version, "2.5.1");
      assert.equal(firefoxManifest.version, "2.5.1");
      assert.match(
        changelog,
        /^##[ \t]+\[Unreleased\][ \t]*\r?$/m,
      );
      assert.match(changelog, /^##\s*\[2\.5\.0\]\s*-\s*2026-10-01$/m);
      assert.doesNotMatch(changelog, /^##\s*\[2\.5\.0\]\s*-\s*Pending$/m);
      assert.doesNotMatch(changelog, /^##\s*\[2\.4\.1\]\s*-\s*Pending$/m);
      assert.match(changelog, /^##\s*\[2\.4\.1\]\s*-\s*2026-09-23$/m);
      assert.match(changelog, /^##\s*\[2\.4\.0\]\s*-\s*2026-09-23$/m);
      assert.doesNotMatch(changelog, /###\s+Pending\s+2\.4\.0/);
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
      assert.equal(chromeManifest.version, "2.5.1");
      assert.equal(firefoxManifest.version, "2.5.1");
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
        "scripting",
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
      const redditOrigins = ["*://reddit.com/*", "*://www.reddit.com/*"];
      assert.deepEqual(chromeManifest.optional_host_permissions, redditOrigins);
      assert.deepEqual(firefoxManifest.optional_permissions, redditOrigins);
      for (const manifest of [chromeManifest, firefoxManifest]) {
        assert.ok(!manifest.content_scripts.some((script) => script.js.includes("content-rd.js")));
        const required = [...(manifest.host_permissions || []), ...manifest.permissions];
        assert.ok(!required.some((entry) => /reddit/.test(entry)), "Reddit access must stay optional");
        assert.equal(manifest.web_accessible_resources, undefined, "No extension files are exposed to web pages");
        const youtube = manifest.content_scripts.find((script) => script.js.includes("content-yt.js"));
        const facebook = manifest.content_scripts.find((script) => script.js.includes("content-fb.js"));
        assert.deepEqual(youtube.exclude_matches, ["*://music.youtube.com/*", "*://studio.youtube.com/*"]);
        assert.deepEqual(facebook.exclude_matches, ["*://business.facebook.com/*", "*://developers.facebook.com/*"]);
      }
      assert.equal(chromeManifest.incognito, "not_allowed");
      assert.equal(firefoxManifest.incognito, "not_allowed");
      assert.doesNotMatch(
        read("content-common.js"),
        /sessionStorage|document\.dispatchEvent/,
        "Content scripts keep their state and events off the page",
      );
      assert.doesNotMatch(JSON.stringify(chromeManifest), /hide_ig_feed_reels/);
      assert.doesNotMatch(JSON.stringify(firefoxManifest), /hide_ig_feed_reels/);
    },
  ],
  [
    "background registers the Reddit script only while optional access is granted",
    () => {
      const source = read("background.js");
      const load = ({ granted, firefox = false }) => {
        const state = { granted, registered: [], calls: [], listeners: {} };
        const noop = () => {};
        const event = (name) => ({ addListener: (fn) => { state.listeners[name] = fn; } });
        const chrome = {
          runtime: {
            id: "ft", lastError: null, onMessage: event("message"), onStartup: event("startup"),
            getURL: (file) => "chrome-extension://ft/" + file, sendMessage: noop,
          },
          storage: {
            local: { get: (keys, cb) => cb({}), set: (values, cb) => cb && cb(), remove: (keys, cb) => cb && cb() },
            onChanged: event("storage"),
          },
          alarms: {
            onAlarm: event("alarm"), create: (name, info, cb) => cb && cb(),
            get: (name, cb) => cb(undefined), clear: (name, cb) => cb && cb(true),
          },
          tabs: { query: (query, cb) => cb([{ id: 7 }]) },
          permissions: {
            contains: (request, cb) => cb(state.granted),
            onAdded: event("added"), onRemoved: event("removed"),
          },
          scripting: {
            getRegisteredContentScripts: (filter, cb) =>
              cb(state.registered.filter((script) => filter.ids.includes(script.id))),
            registerContentScripts: (scripts, cb) => {
              state.registered.push(...scripts);
              state.calls.push(["register", scripts]);
              cb();
            },
            unregisterContentScripts: (filter, cb) => {
              state.registered = [];
              state.calls.push(["unregister", filter.ids]);
              cb();
            },
            insertCSS: (options, cb) => { state.calls.push(["css", options.target.tabId]); cb(); },
            executeScript: (options, cb) => { state.calls.push(["exec", options.files]); cb(); },
          },
        };
        const sandbox = { chrome, console: { error: noop, log: noop } };
        if (firefox) {
          sandbox.browser = {
            contentScripts: {
              register: (options) => {
                state.calls.push(["firefox-register", options]);
                return Promise.resolve({ unregister: () => state.calls.push(["firefox-unregister"]) });
              },
            },
          };
        }
        vm.runInContext(source, vm.createContext(sandbox));
        return state;
      };
      const files = ["i18n.js", "content-common.js", "content-rd.js"];

      const denied = load({ granted: false });
      assert.deepEqual(denied.calls.filter(([kind]) => kind === "register"), []);

      const chromeGranted = load({ granted: true });
      const registrations = chromeGranted.calls.filter(([kind]) => kind === "register");
      assert.equal(registrations.length, 1);
      const [script] = JSON.parse(JSON.stringify(registrations[0][1]));
      assert.equal(script.id, "focustube-reddit");
      assert.deepEqual(script.matches, ["*://reddit.com/*", "*://www.reddit.com/*"]);
      assert.deepEqual(script.js, files);
      assert.deepEqual(script.css, ["content.css"]);
      assert.equal(script.runAt, "document_start");

      chromeGranted.listeners.added({ origins: ["*://www.reddit.com/*"] });
      assert.equal(chromeGranted.calls.filter(([kind]) => kind === "register").length, 1, "no duplicate registration");
      assert.ok(chromeGranted.calls.some(([kind, value]) => kind === "exec" && JSON.stringify(value) === JSON.stringify(files)));
      chromeGranted.listeners.added({ origins: ["*://*.youtube.com/*"] });
      assert.equal(chromeGranted.calls.filter(([kind]) => kind === "exec").length, 1, "other origins are ignored");

      chromeGranted.granted = false;
      chromeGranted.listeners.removed({ origins: ["*://reddit.com/*"] });
      assert.ok(chromeGranted.calls.some(([kind]) => kind === "unregister"));

      const firefoxGranted = load({ granted: true, firefox: true });
      const firefoxRegistrations = firefoxGranted.calls.filter(([kind]) => kind === "firefox-register");
      assert.equal(firefoxRegistrations.length, 1);
      assert.deepEqual(JSON.parse(JSON.stringify(firefoxRegistrations[0][1].js)), files.map((file) => ({ file })));
      assert.ok(!firefoxGranted.calls.some(([kind]) => kind === "register"));
    },
  ],
  [
    "final-test polish: locked popup switches, break label, Strict wording, Reddit badge, spacing, opaque covers, Shorts chip",
    () => {
      const styles = read("styles.css");
      assert.match(styles, /\.switch input:disabled \+ \.slider \{\s*opacity: 0\.5;/, "locked popup switches are dimmed");
      assert.match(styles, /\.control-row \{[^}]*gap: 12px;/, "label and switch keep a gap");

      const popup = read("popup.js");
      assert.match(popup, /timerTypeLabel\.textContent = msg\(type === "break" \? "break" : "focus"\)/);
      assert.match(popup, /timerTypeLabel\.classList\.remove\("hidden"\)/);
      assert.match(popup, /if \(timerTypeLabel\) timerTypeLabel\.classList\.add\("hidden"\)/, "label hides when the timer stops");
      assert.match(popup, /\(result = \{\}\) => \{/, "popup falls back to defaults when storage can't be read");

      const options = read("options.js");
      const badge = options.slice(options.indexOf("function updateBadge"), options.indexOf("function updateBadge") + 1400);
      assert.match(badge, /id === "rd" && chrome\.permissions\?\.contains/);
      assert.match(badge, /badge\.textContent = "!"/);
      assert.doesNotMatch(read("options.html"), /\.badge-gray \{\s*background: #4facfe;/, "grey badge is grey");

      const css = read("content.css");
      for (const pattern of [/\.ft-stories-overlay \{\s*position: absolute;[^}]*\}/, /\.ft-stories-overlay\.dark \{[^}]*\}/]) {
        const block = css.match(pattern)?.[0] || "";
        assert.match(block, /background: linear-gradient/, `${pattern} sets a gradient`);
        assert.doesNotMatch(block.match(/background:[^;]*;/)?.[0] || "", /rgba\(/, `${pattern} background is opaque`);
      }

      const yt = read("content-yt.js");
      assert.match(yt, /ytd-search-header-renderer yt-chip-cloud-chip-renderer/);
      assert.match(yt, /chip\.textContent\.trim\(\) === "Shorts"/);

      assert.equal(readJson("_locales/en/messages.json").modeStrictDescription.message, "Block short-form videos completely");
      for (const locale of fs.readdirSync(path.join(root, "_locales"))) {
        const strict = readJson(`_locales/${locale}/messages.json`).modeStrictDescription.message;
        assert.doesNotMatch(strict, /access|Zugriff|acceso|accès|akses|acesso|Erişim|الوصول/i, `${locale} Strict text no longer says the site is blocked`);
      }
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
