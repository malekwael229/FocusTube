const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..', 'docs');
const pages = [
  'index.html',
  'block-youtube-shorts/index.html',
  'instagram-reels-blocker/index.html',
  'tiktok-blocker/index.html',
  'facebook-reels-blocker/index.html',
  'linkedin-feed-blocker/index.html',
];
const storeUrls = [
  'https://chromewebstore.google.com/detail/focustube-distraction-blo/ppdjgkniggbikifojmkindmbhppmoell',
  'https://addons.mozilla.org/addon/focus-tube/',
  'https://microsoftedge.microsoft.com/addons/detail/focustube/emffahlehkfdlknpmpndaabhigchhoog',
];

function attrs(html, attr) {
  const values = [];
  const re = new RegExp(`\\b${attr}=["']([^"']+)["']`, 'gi');
  let m;
  while ((m = re.exec(html))) values.push(m[1]);
  return values;
}

for (const file of pages) {
  const full = path.join(root, file);
  const html = fs.readFileSync(full, 'utf8');
  assert.strictEqual((html.match(/<h1\b/gi) || []).length, 1, `${file}: expected one h1`);
  assert(/<title>[^<]+<\/title>/i.test(html), `${file}: missing title`);
  assert(/<meta\s+name=["']description["'][^>]+content=["'][^"']+["']/i.test(html), `${file}: missing description`);
  assert(/<link\s+rel=["']canonical["'][^>]+href=["']https:\/\/malekwael229\.github\.io\/FocusTube\//i.test(html), `${file}: bad canonical`);
  assert(!/<script\b/i.test(html), `${file}: scripts are not expected`);
  assert(!/(google-analytics|googletagmanager|segment|mixpanel|amplitude|plausible|posthog)/i.test(html), `${file}: tracking reference found`);
  for (const url of storeUrls) assert(html.includes(url), `${file}: missing official store URL ${url}`);

  const dir = path.dirname(full);
  for (const value of [...attrs(html, 'href'), ...attrs(html, 'src')]) {
    if (/^(https?:|mailto:|data:|#)/i.test(value)) continue;
    assert(!value.startsWith('/'), `${file}: root-relative path breaks project hosting: ${value}`);
    const clean = value.split('#')[0].split('?')[0];
    if (!clean) continue;
    const target = path.resolve(dir, clean);
    let exists = fs.existsSync(target);
    if (exists && fs.statSync(target).isDirectory()) exists = fs.existsSync(path.join(target, 'index.html'));
    assert(exists, `${file}: unresolved local reference ${value}`);
  }
}

const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
for (const file of pages) {
  const route = file === 'index.html' ? '' : file.replace(/index\.html$/, '');
  assert(sitemap.includes(`https://malekwael229.github.io/FocusTube/${route}`), `sitemap missing ${route || '/'}`);
}
const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
assert(robots.includes('https://malekwael229.github.io/FocusTube/sitemap.xml'));
console.log('pages-site.test.js: all checks passed');
