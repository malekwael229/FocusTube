#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const base = "https://malekwael229.github.io/FocusTube/";
const pages = [
  { file: "index.html", url: base },
  { file: "block-youtube-shorts/index.html", url: `${base}block-youtube-shorts/` },
  { file: "block-instagram-reels/index.html", url: `${base}block-instagram-reels/` },
  { file: "block-tiktok-feed/index.html", url: `${base}block-tiktok-feed/` },
  { file: "block-facebook-reels/index.html", url: `${base}block-facebook-reels/` },
  { file: "block-linkedin-feed/index.html", url: `${base}block-linkedin-feed/` },
];
const stores = [
  "https://chromewebstore.google.com/detail/focustube-distraction-blo/ppdjgkniggbikifojmkindmbhppmoell",
  "https://addons.mozilla.org/en-US/firefox/addon/focus-tube/",
  "https://microsoftedge.microsoft.com/addons/detail/focustube-distraction-bl/emffahlehkfdlknpmpndaabhigchhoog",
];

function localTarget(pageFile, href) {
  const clean = href.split("#")[0].split("?")[0];
  if (!clean || clean.startsWith("#") || clean.startsWith("http") || clean.startsWith("mailto:")) return null;
  const resolved = path.resolve(path.dirname(path.join(root, pageFile)), clean);
  return fs.existsSync(resolved) || fs.existsSync(path.join(resolved, "index.html"));
}

const titles = new Set();
const descriptions = new Set();
for (const page of pages) {
  const filePath = path.join(root, page.file);
  assert.ok(fs.existsSync(filePath), `Missing page: ${page.file}`);
  const html = fs.readFileSync(filePath, "utf8");
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  const description = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1]?.trim();
  const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1];
  const ogUrl = html.match(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i)?.[1];
  assert.ok(title && title.length > 10, `${page.file} needs a useful title`);
  assert.ok(description && description.length >= 50, `${page.file} needs a useful description`);
  assert.equal(titles.has(title), false, `Duplicate title: ${title}`);
  assert.equal(descriptions.has(description), false, `Duplicate description on ${page.file}`);
  titles.add(title); descriptions.add(description);
  assert.equal(canonical, page.url, `Wrong canonical on ${page.file}`);
  assert.equal(ogUrl, page.url, `Wrong og:url on ${page.file}`);
  assert.equal((html.match(/<h1\b/gi) || []).length, 1, `${page.file} must have one h1`);
  for (const store of stores) assert.ok(html.includes(store), `${page.file} missing store link: ${store}`);
  for (const match of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const src = match[1];
    if (!src.startsWith("http") && !src.startsWith("data:")) assert.ok(localTarget(page.file, src), `${page.file} missing image: ${src}`);
    if (!src.includes("/icons/")) {
      assert.ok(/\balt=["'][^"']*[A-Za-z][^"']*["']/.test(match[0]), `${page.file} image needs descriptive alt text`);
    }
  }
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const href = match[1];
    const result = localTarget(page.file, href);
    if (result !== null) assert.ok(result, `${page.file} broken internal link: ${href}`);
  }
  assert.equal(/<(script|iframe|object|embed)\b/i.test(html), false, `${page.file} must not load remote scripts or embeds`);
  assert.equal(/(google-analytics|googletagmanager|gtag\s*\(|hotjar|mixpanel|segment\.com)/i.test(html), false, `${page.file} contains tracking code`);
}

const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
assert.ok(robots.includes(`Sitemap: ${base}sitemap.xml`), "robots.txt sitemap URL is wrong");
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
for (const page of pages) assert.ok(sitemap.includes(`<loc>${page.url}</loc>`), `sitemap missing ${page.url}`);
console.log(`Website validation passed: ${pages.length} pages, metadata, assets, links, stores, and privacy checks.`);
