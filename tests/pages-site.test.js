const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const page = read("index.html");

assert.match(page, /<title>FocusTube \| Block Shorts, Reels and distracting feeds<\/title>/);
assert.match(page, /href="docs\/styles\.css"/);
assert.match(page, /href="https:\/\/chromewebstore\.google\.com\/detail\/focustube-distraction-blo\/ppdjgkniggbikifojmkindmbhppmoell"/);
assert.match(page, /href="https:\/\/addons\.mozilla\.org\/addon\/focus-tube\/"/);
assert.match(page, /href="https:\/\/microsoftedge\.microsoft\.com\/addons\/detail\/focustube\/emffahlehkfdlknpmpndaabhigchhoog"/);
assert.match(page, /src="icons\/icon128\.png"/);
assert.doesNotMatch(page, /<script\b/i);
assert.equal(fs.existsSync(path.join(root, "docs", "index.html")), false);

console.log("Pages entry checks passed.");
