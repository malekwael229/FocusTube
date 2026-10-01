# FocusTube development build

These are unreleased test packages from a pull request, not an update from a browser store. The package version can still match the last published release while containing changes being developed for the next release. Do not upload these files to a store or use them to replace a published GitHub release.

## Download

Sign into GitHub, open the linked Actions run, and download the **FocusTube-development-pr-...** artifact under **Artifacts**. Downloads expire after 30 days. Use a newer successful run if the link has expired.

The packaging workflow compares two independent builds before uploading these files. Check that **CI / Test and validate**, **Release verification / Reproduce release packages**, and **CodeQL / Analyze JavaScript** have also passed for the linked PR head before testing.

Extract the downloaded artifact ZIP. Inside are the Chromium ZIP, the Firefox ZIP, `SHA256SUMS.txt`, and `BUILD.json`. The build record distinguishes the checked-out merge commit from the PR head and base commits. GitHub normally builds the proposed merge with main rather than the branch head alone.

If you want to verify the inner ZIPs, compare their SHA-256 hashes with `SHA256SUMS.txt`. On Linux, run `sha256sum -c SHA256SUMS.txt` from the extracted folder. On Windows PowerShell, run `Get-FileHash .\FocusTube-release-*.zip -Algorithm SHA256` and compare the values.

## Chrome, Brave, or Edge

1. Extract the inner `FocusTube-release-chromium-v...zip` into its own folder. That folder must contain `manifest.json`.
2. Open `chrome://extensions`, `brave://extensions`, or `edge://extensions` in the browser you want to test.
3. Enable **Developer mode**, choose **Load unpacked**, and select the extracted Chromium folder.
4. Disable the store-installed FocusTube while testing so two copies do not act on the same page. Keep it installed, and re-enable it when finished. The development copy has separate settings.
5. Refresh any supported site tabs that were already open.

## Firefox

1. Extract the inner `FocusTube-release-firefox-v...zip` into its own folder.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on...** and select `manifest.json` from the extracted Firefox folder. This is an unsigned test package; do not try to install it as a normal signed store update.
4. If you already use the store version, a separate Firefox test profile is recommended to keep existing settings separate. Otherwise disable the store copy while testing, then refresh the site tabs. Re-enable the store copy after finishing and restarting Firefox.

Firefox removes a temporary add-on when the browser restarts. Load it again to continue testing. This installation cannot establish persistent restart behavior.

## Reddit checks

For builds containing Reddit support, test the current `reddit.com` interface:

- **Strict:** Home, News, Popular, All, and community feed listings should be hidden. Individual posts, comments, and search results should remain accessible.
- **Warn:** A detected feed should be hidden with **View Anyway** available for that page.
- **Passive:** Feeds should remain visible.
- **Work timer:** Feeds should stay hidden even if Reddit is set to Passive.
- **Break timer:** Feeds should remain available.
- Navigate between listings, posts, community highlights, and search. Check for brief feed flashes, missing content, and correct restoration after changing modes or disabling FocusTube.

`old.reddit.com` is not covered. Short `redd.it` post links should remain useful when they lead to a normal post.

Report your browser/version, URL, mode, timer state, expected result, and what happened. Avoid sharing private messages, account tokens, or personal browsing data.
