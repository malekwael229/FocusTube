const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const baseUrl = "https://malekwael229.github.io/FocusTube/";
const storeUrls = [
  "https://chromewebstore.google.com/detail/focustube-distraction-blo/ppdjgkniggbikifojmkindmbhppmoell",
  "https://addons.mozilla.org/addon/focus-tube/",
  "https://microsoftedge.microsoft.com/addons/detail/focustube/emffahlehkfdlknpmpndaabhigchhoog",
];
const pages = [
  {
    file: "index.html",
    route: "",
    h1: "FocusTube: Distraction Blocker",
  },
  {
    file: "block-youtube-shorts/index.html",
    route: "block-youtube-shorts/",
    h1: "Block YouTube Shorts without blocking YouTube.",
  },
  {
    file: "instagram-reels-blocker/index.html",
    route: "instagram-reels-blocker/",
    h1: "Block Reels and Explore, not all of Instagram.",
  },
  {
    file: "tiktok-blocker/index.html",
    route: "tiktok-blocker/",
    h1: "Put a boundary around TikTok's scrolling routes.",
  },
  {
    file: "facebook-reels-blocker/index.html",
    route: "facebook-reels-blocker/",
    h1: "Block Facebook Reels paths, not Facebook itself.",
  },
  {
    file: "linkedin-feed-blocker/index.html",
    route: "linkedin-feed-blocker/",
    h1: "Use LinkedIn without opening the main feed.",
  },
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function extractOne(html, pattern, label) {
  const match = html.match(pattern);
  assert(match, `Missing ${label}`);
  return match[1].trim();
}

function targetForHref(pageFile, href) {
  const [pathname] = href.split("#");
  const pageDir = path.dirname(pageFile);
  const candidate = path.normalize(
    path.join(pageDir, pathname || path.basename(pageFile)),
  );
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  assert(
    !relative.startsWith("..") && !path.isAbsolute(relative),
    `Internal link escapes the repository: ${href}`,
  );
  if (
    pathname === "" ||
    pathname.endsWith("/") ||
    (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory())
  ) {
    return path.join(absolute, "index.html");
  }
  return absolute;
}

function contentType(filePath) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".png": "image/png",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
  };
  return types[path.extname(filePath)] || "application/octet-stream";
}

function startServer() {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    let pathname = decodeURIComponent(requestUrl.pathname);
    if (!pathname.startsWith("/FocusTube/")) {
      response.writeHead(404).end("Not found");
      return;
    }

    pathname = pathname.slice("/FocusTube/".length);
    if (!pathname || pathname.endsWith("/")) pathname += "index.html";
    const filePath = path.resolve(root, pathname);
    const relativePath = path.relative(root, filePath);
    if (
      relativePath.startsWith("..") ||
      path.isAbsolute(relativePath) ||
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()
    ) {
      response.writeHead(404).end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": contentType(filePath) });
    fs.createReadStream(filePath).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const titles = new Set();
const descriptions = new Set();
const sitemap = read("sitemap.xml");

for (const page of pages) {
  const html = read(page.file);
  const title = extractOne(
    html,
    /<title>([^<]+)<\/title>/i,
    `title in ${page.file}`,
  );
  const description = extractOne(
    html,
    /<meta\s+name="description"\s+content="([^"]+)"/i,
    `description in ${page.file}`,
  );
  const canonical = extractOne(
    html,
    /<link\s+rel="canonical"\s+href="([^"]+)"/i,
    `canonical in ${page.file}`,
  );
  const ogUrl = extractOne(
    html,
    /<meta\s+property="og:url"\s+content="([^"]+)"/i,
    `Open Graph URL in ${page.file}`,
  );
  const h1s = [...html.matchAll(/<h1(?:\s[^>]*)?>([^<]+)<\/h1>/gi)];

  assert.equal(h1s.length, 1, `${page.file} must contain exactly one h1`);
  assert.equal(h1s[0][1], page.h1, `${page.file} has the wrong h1`);
  assert(!titles.has(title), `Duplicate title: ${title}`);
  assert(
    !descriptions.has(description),
    `Duplicate meta description: ${description}`,
  );
  titles.add(title);
  descriptions.add(description);

  const expectedUrl = `${baseUrl}${page.route}`;
  assert.equal(canonical, expectedUrl, `${page.file} has the wrong canonical`);
  assert.equal(ogUrl, expectedUrl, `${page.file} has the wrong Open Graph URL`);
  assert(
    sitemap.includes(`<loc>${expectedUrl}</loc>`),
    `${page.file} is missing from sitemap.xml`,
  );

  assert(
    /<meta\s+name="robots"\s+content="index, follow"\s*\/?>/i.test(html),
    `${page.file} must be indexable`,
  );
  assert(
    /<meta\s+property="og:title"\s+content=/i.test(html),
    `${page.file} is missing an Open Graph title`,
  );
  assert(
    /<meta\s+property="og:description"\s+content=/i.test(html),
    `${page.file} is missing an Open Graph description`,
  );
  assert(
    /<meta\s+property="og:image"\s+content=/i.test(html),
    `${page.file} is missing an Open Graph image`,
  );
  assert(
    html.includes('<a class="skip-link" href="#main-content">'),
    `${page.file} is missing its skip link`,
  );
  assert(
    html.includes('id="main-content"'),
    `${page.file} is missing its main-content target`,
  );

  for (const storeUrl of storeUrls) {
    assert(
      html.includes(`href="${storeUrl}"`),
      `${page.file} is missing ${storeUrl}`,
    );
  }

  assert(!/<script\b/i.test(html), `${page.file} must not include scripts`);
  assert(
    !/<(?:img|script)[^>]+src="https?:\/\//i.test(html),
    `${page.file} loads a remote image or script`,
  );
  assert(
    !/<link[^>]+rel="stylesheet"[^>]+href="https?:\/\//i.test(html),
    `${page.file} loads a remote stylesheet`,
  );
  assert(
    !/(google-analytics|googletagmanager|gtag\s*\(|plausible|mixpanel|hotjar|document\.cookie|localStorage|XMLHttpRequest|fetch\s*\()/i.test(
      html,
    ),
    `${page.file} contains tracking or client storage code`,
  );
  assert(
    !/(?:href|src)="\/(?!\/)/i.test(html),
    `${page.file} contains a project-path-unsafe root URL`,
  );

  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/gi)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|tel:)/i.test(href) || href.startsWith("#"))
      continue;
    const target = targetForHref(page.file, href);
    assert(
      fs.existsSync(target),
      `${page.file} points to missing target ${href}`,
    );

    const hash = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
    if (hash) {
      const targetHtml = fs.readFileSync(target, "utf8");
      assert(
        targetHtml.includes(`id="${hash}"`),
        `${page.file} points to missing fragment ${href}`,
      );
    }
  }
}

const homepage = read("index.html");
for (const requiredText of [
  "Block Shorts, Reels and distracting feeds without blocking the websites you still need.",
  "Strict",
  "Warn",
  "Passive",
  "No analytics",
  "No tracking",
  "No accounts",
  "No project backend",
  "OpenSSF Best Practices Passing",
  "OpenSSF Baseline Level 1",
]) {
  assert(
    homepage.includes(requiredText),
    `Homepage is missing: ${requiredText}`,
  );
}

const instagram = read("instagram-reels-blocker/index.html");
assert(
  !instagram.includes("Hide Reels in Feed"),
  "Instagram page must not advertise the removed in-feed Reels option",
);

const css = read("site/styles.css");
assert(
  css.includes(":focus-visible"),
  "Site CSS must preserve visible keyboard focus",
);
assert(
  css.includes("prefers-reduced-motion: reduce"),
  "Site CSS must respect reduced motion",
);
assert(
  !/@import|url\(["']?https?:\/\//i.test(css),
  "Site CSS must not load remote resources",
);

for (const asset of [
  "site/assets/focustube-icon.png",
  "site/assets/focustube-interface.png",
  "site/assets/focustube-social-preview.png",
  "site/assets/youtube-before-after.png",
]) {
  assert(fs.existsSync(path.join(root, asset)), `Missing site asset: ${asset}`);
}

const robots = read("robots.txt");
assert(
  robots.includes("Allow: /FocusTube/"),
  "robots.txt must allow the project path",
);
assert(
  robots.includes(`${baseUrl}sitemap.xml`),
  "robots.txt must reference the sitemap",
);
assert.equal(
  (sitemap.match(/<url>/g) || []).length,
  pages.length,
  "sitemap.xml has an unexpected URL count",
);

console.log(
  "PASS GitHub Pages metadata, links, assets, privacy, and project-path checks",
);

async function runBrowserChecks() {
  const server = await startServer();
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}/FocusTube/`;
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 800 });
      for (const sitePage of pages) {
        const response = await page.goto(`${origin}${sitePage.route}`, {
          waitUntil: "networkidle",
        });
        assert(
          response && response.ok(),
          `${sitePage.route || "home"} failed at ${width}px`,
        );
        const result = await page.evaluate(() => ({
          overflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          unloadedImages: [...document.images]
            .filter((image) => !image.complete || image.naturalWidth === 0)
            .map((image) => image.getAttribute("src")),
        }));
        assert(
          result.overflow <= 1,
          `${sitePage.route || "home"} overflows by ${result.overflow}px at ${width}px`,
        );
        assert.deepEqual(
          result.unloadedImages,
          [],
          `${sitePage.route || "home"} has unloaded images at ${width}px`,
        );
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      const style = getComputedStyle(active);
      return {
        className: active.className,
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
      };
    });
    assert.equal(
      focus.className,
      "skip-link",
      "The skip link must receive the first keyboard focus",
    );
    assert.notEqual(
      focus.outlineStyle,
      "none",
      "Focused controls must have a visible outline",
    );
    assert(focus.outlineWidth >= 2, "The focus outline must be at least 2px");
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(() => location.hash),
      "#main-content",
      "The skip link must target main content",
    );

    console.log(
      "PASS GitHub Pages responsive, image, overflow, and keyboard checks",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

runBrowserChecks().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
