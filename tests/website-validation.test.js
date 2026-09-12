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

function localTarget(sourceUrl, href) {
  const url = new URL(href.replace(/&amp;/g, "&"), sourceUrl);
  assert.ok(!/^(javascript|vbscript):$/i.test(url.protocol), `Executable URL: ${href}`);
  if (url.origin !== new URL(base).origin) return null;
  const projectPath = new URL(base).pathname;
  assert.ok(url.pathname.startsWith(projectPath), `URL escapes /FocusTube/: ${href} from ${sourceUrl}`);
  let resolved = path.resolve(root, decodeURIComponent(url.pathname.slice(projectPath.length)));
  const relative = path.relative(root, resolved);
  assert.ok(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `Path escapes repository: ${href}`);
  assert.ok(fs.existsSync(resolved), `Missing local target: ${href} from ${sourceUrl}`);
  if (fs.statSync(resolved).isDirectory()) resolved = path.join(resolved, "index.html");
  assert.ok(fs.existsSync(resolved), `Missing index page: ${href} from ${sourceUrl}`);
  return { file: resolved, url };
}

const tracking = /(google-analytics|googletagmanager|gtag\s*\(|hotjar|mixpanel|segment\.com)/i;
const checkedStyles = new Set();
function validateStyles(css, sourceUrl) {
  assert.equal(tracking.test(css), false, `${sourceUrl} contains tracking code`);
  const urls = [...css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi)]
    .map((match) => match[1] ?? match[2] ?? match[3]);
  const imports = [...css.matchAll(/@import\s+["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const href of [...urls, ...imports]) {
    // SVG paint/filter fragments refer to the rendered document, not a CSS file.
    if (href.startsWith("#")) continue;
    const target = localTarget(sourceUrl, href);
    if (target && path.extname(target.file) === ".css") validateStylesheet(target);
  }
}

function validateStylesheet(target) {
  if (checkedStyles.has(target.file)) return;
  checkedStyles.add(target.file);
  validateStyles(fs.readFileSync(target.file, "utf8"), target.url);
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
    localTarget(page.url, src);
    if (!src.includes("/icons/")) {
      assert.ok(/\balt=["'][^"']*[A-Za-z][^"']*["']/.test(match[0]), `${page.file} image needs descriptive alt text`);
    }
  }
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const href = match[1];
    const target = localTarget(page.url, href);
    if (target && target.url.hash && path.extname(target.file) === ".html") {
      const fragment = decodeURIComponent(target.url.hash.slice(1));
      const targetHtml = fs.readFileSync(target.file, "utf8");
      const ids = [...targetHtml.matchAll(/<[a-z][^>]*\bid=["']([^"']+)["']/gi)].map((item) => item[1]);
      const namedAnchors = [...targetHtml.matchAll(/<a\b[^>]*\bname=["']([^"']+)["']/gi)].map((item) => item[1]);
      assert.ok(ids.includes(fragment) || namedAnchors.includes(fragment), `${page.file} missing fragment destination: ${href}`);
    }
  }
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const href = match[0].match(/\bhref=["']([^"']+)["']/i)?.[1];
    const rel = match[0].match(/\brel=["']([^"']+)["']/i)?.[1];
    if (!href || !rel || !/\b(stylesheet|icon|preload)\b/i.test(rel)) continue;
    const target = localTarget(page.url, href);
    if (target && /\bstylesheet\b/i.test(rel)) validateStylesheet(target);
  }
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) validateStyles(match[1], page.url);
  for (const match of html.matchAll(/\bstyle=("([^"]*)"|'([^']*)')/gi)) validateStyles(match[2] ?? match[3], page.url);
  assert.equal(/<(script|iframe|object|embed)\b/i.test(html), false, `${page.file} must not load remote scripts or embeds`);
  assert.equal(tracking.test(html), false, `${page.file} contains tracking code`);
}

const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
assert.ok(robots.includes(`Sitemap: ${base}sitemap.xml`), "robots.txt sitemap URL is wrong");
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
for (const page of pages) assert.ok(sitemap.includes(`<loc>${page.url}</loc>`), `sitemap missing ${page.url}`);
console.log(`Website validation passed: ${pages.length} pages, metadata, assets, stylesheet URLs, fragments, project paths, stores, and privacy checks.`);
