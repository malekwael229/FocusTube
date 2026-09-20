#!/usr/bin/env node
// Real browser DOM/lifecycle coverage. Only extension APIs and the network are isolated.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/feeds', name + '.html'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
const igPost = (id, label = '', body = 'Ordinary caption') => `<article id="${id}"><a href="/fixture_author/">Fixture author</a><a href="/p/${id}/"><time datetime="2026-01-01">Today</time></a><span class="label">${label}</span><section>Like Comment</section><p>${body}</p><video muted></video></article>`;
const liPost = (id, label = '', control = '') => `<div role="listitem" componentkey="${id}" id="${id}"><a href="/in/fixture-author/"><span aria-label="Fixture Author 1st">Fixture Author</span></a><span class="label">${label}</span>${control}<div data-testid="expandable-text-box">Ordinary caption</div><svg id="thumbs-up-outline-small"></svg><video muted></video></div>`;
let checks = 0;
async function main() {
 const browser = await chromium.launch({ headless: true });
 try {
  async function open(platform, html, settings = {}, prepare = null, pathname = null) {
   const context = await browser.newContext();
   const page = await context.newPage();
   const requests = [], errors = [];
   page.on('pageerror', error => errors.push(error.message));
   await page.route('**/*', route => {
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: `<!doctype html><main>${html}</main>` });
    requests.push(route.request().url());
    return route.abort();
   });
   await page.addInitScript(({ settings, catalog }) => {
    const listeners = [], data = { ...settings };
    window.chrome = {
     runtime: { id: 'fixture-extension', getURL: value => 'chrome-extension://fixture-extension/' + value,
      sendMessage: (_message, callback) => callback?.({}), onMessage: { addListener() {} } },
     i18n: { getMessage: key => catalog[key]?.message || '' },
     storage: { onChanged: { addListener: listener => listeners.push(listener) }, local: {
      get: (keys, callback) => queueMicrotask(() => callback(Object.fromEntries(keys.filter(key => key in data).map(key => [key, data[key]])))),
      set: (values, callback) => { Object.assign(data, values); callback?.(); },
      remove: key => { delete data[key]; },
     } },
    };
    window.changeSettings = values => {
     const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: data[key], newValue: value }]));
     Object.assign(data, values);
     listeners.forEach(listener => listener(changes, 'local'));
    };
   }, { settings, catalog });
   await page.goto(platform === 'ig' ? `https://www.instagram.com${pathname || '/'}` : 'https://www.linkedin.com/feed/');
   if (prepare) await page.evaluate(prepare);
   await page.addStyleTag({ content: 'article, [role="listitem"] { min-height: 340px; width: 500px; }' + fs.readFileSync(path.join(root, 'content.css'), 'utf8') });
   for (const name of ['i18n.js', 'content-common.js', `content-${platform}.js`]) await page.addScriptTag({ content: fs.readFileSync(path.join(root, name), 'utf8') });
   await page.waitForFunction(() => window.__ftSettingsReady);
   const settle = () => page.waitForTimeout(250);
   const change = async values => { await page.evaluate(values => window.changeSettings(values), values); await settle(); };
   const collapsed = async (id, expected) => {
    await page.waitForFunction(({id, expected, platform}) => document.getElementById(id).classList.contains(`ft-${platform}-collapsed`) === expected, { id, expected, platform }, { timeout: 2500 }).catch(error => { throw new Error(`${platform} ${id}: expected collapsed=${expected}: ${error.message}`); });
    checks++;
   };
   const close = async () => { assert.deepEqual(errors, [], 'no runtime errors'); assert.deepEqual(requests, [], 'no runtime network requests'); checks += 2; await context.close(); };
   return { page, change, collapsed, settle, close };
  }
  async function testReelPermalinkHandling() {
   const modal = fixture('ig-permalink-modal');
   const env = await open('ig', modal, { platformSettings: { ig: 'allow' } }, null, '/p/code/');
   const { page, change, close } = env;
   const article = () => page.evaluate(() => Instagram.getReelPermalinkArticle(location.pathname) !== null);
   const reset = async () => {
    await page.evaluate(markup => { history.replaceState({}, '', '/p/code/'); document.body.innerHTML = `<main>${markup}</main>`; }, modal);
    await page.waitForTimeout(250);
   };
   const reject = async (mutate, label) => { await reset(); await page.evaluate(mutate); assert.equal(await article(), false, label); checks++; };
   assert.equal(await article(), true, 'visible modal primary Reel timestamp resolves to its article'); checks++;
   await reject(() => { document.querySelector('#primary-time').closest('a').href = '/author/p/code/'; }, 'photo permalink is not treated as a Reel');
   await reject(() => { document.querySelector('#primary-time').closest('a').href = '/author/p/code/'; document.querySelector('nav').innerHTML = '<a href="/author/reel/code/"><time datetime="2026-01-01">nav</time></a>'; }, 'navigation timestamp links do not identify the modal post');
   await reject(() => { document.querySelector('#modal').remove(); document.querySelector('main').insertAdjacentHTML('beforeend', '<article><a href="/author/reel/code/"><time datetime="2026-01-01">background</time></a></article>'); }, 'background articles are ignored');
   await reject(() => { document.querySelector('#primary-time').closest('a').href = 'https://example.org/author/reel/code/'; }, 'off-origin timestamp permalink is ignored');
   await reject(() => { document.querySelector('#primary-time').closest('a').href = '/author/reel/other/'; }, 'different Reel identity is ignored');
   await reject(() => { document.querySelector('#primary-time').remove(); }, 'anchor without timestamp is ignored');
   await reject(() => { document.querySelector('#modal').style.display = 'none'; }, 'hidden modal is ignored');
   await reject(() => { document.body.insertAdjacentHTML('beforeend', document.querySelector('#modal').outerHTML); }, 'multiple visible modals are ambiguous');
   await reject(() => { document.querySelector('#modal').insertAdjacentHTML('beforeend', '<article><a href="/author/reel/code/"><time datetime="2026-01-02">second modal article</time></a></article>'); }, 'multiple visible owned modal articles are ambiguous');
   await reject(() => { document.querySelector('article').insertAdjacentHTML('beforeend', '<a href="/author/p/code/"><time datetime="2026-01-02">photo identity</time></a>'); }, 'conflicting photo and Reel identities fail open');
   await reject(() => { document.querySelector('article').insertAdjacentHTML('beforeend', '<a href="/author/reel/code/"><time datetime="2026-01-02">duplicate Reel timestamp</time></a>'); }, 'duplicate primary timestamps are ambiguous');
   await reject(() => { document.querySelector('article').insertAdjacentHTML('beforeend', '<a href="/author/reel/other/"><time datetime="2026-01-02">different Reel timestamp</time></a>'); }, 'a second timestamp identity fails open even when it does not match the route');
   await reset();
   await page.evaluate(() => document.querySelector('article').insertAdjacentHTML('beforeend', '<article><a href="/author/p/code/"><time datetime="2026-01-02">nested article timestamp</time></a></article>'));
   assert.equal(await article(), true, 'nested article timestamps are excluded from the primary identity'); checks++;
   await reset();
   await page.evaluate(() => document.querySelector('#modal').insertAdjacentHTML('beforeend', '<div role="dialog" aria-modal="true"><article><a href="/author/p/code/"><time datetime="2026-01-03">nested dialog timestamp</time></a></article></div>'));
   assert.equal(await article(), false, 'multiple visible modal dialogs are ambiguous'); checks++;
   await close();

   // A same-path hydration transition is discovered by the existing route timer.
   const hydration = await open('ig', modal, { platformSettings: { ig: 'allow' } }, null, '/p/code/');
   const hydrationPage = hydration.page;
   await hydrationPage.evaluate(() => { window.kicks = 0; Instagram.rapidKick = function () { window.kicks++; this.isRedirecting = true; }; document.querySelector('#primary-time').closest('a').href = '/author/p/code/'; });
   await hydration.change({ platformSettings: { ig: 'strict' } });
   assert.equal(await hydrationPage.evaluate(() => window.kicks), 0, 'photo hydration remains allowed in strict mode'); checks++;
   await hydrationPage.evaluate(() => {
    window.routeCheckRuns = 0;
    const runChecks = Instagram.runChecks;
    Instagram.runChecks = function (...args) { window.routeCheckRuns++; return runChecks.apply(this, args); };
   });
   await hydrationPage.waitForTimeout(700);
   assert.equal(await hydrationPage.evaluate(() => window.routeCheckRuns), 0, 'unchanged photo permalink does not poll through runChecks'); checks++;
   await hydrationPage.evaluate(() => { document.querySelector('#primary-time').closest('a').href = '/author/reel/code/'; });
   assert.equal(await hydrationPage.evaluate(() => Instagram.getReelPermalinkArticle(location.pathname) !== null), true, 'late Reel permalink is detectable before the watcher tick'); checks++;
   await hydrationPage.waitForFunction(() => window.routeCheckRuns > 0, null, { timeout: 2000 });
   assert.equal(await hydrationPage.evaluate(() => window.kicks), 1, 'same-path late Reel href is rechecked'); checks++;

   await hydration.close();

   // SPA route entry and return use the live route watcher while keeping state isolated by mode.
   for (const mode of ['strict', 'work']) {
    const settings = mode === 'strict'
     ? { platformSettings: { ig: 'strict' } }
     : { platformSettings: { ig: 'allow' }, ft_timer_end: Date.now() + 60000, ft_timer_type: 'work' };
    const spa = await open('ig', modal, settings);
    const spaPage = spa.page;
    await spaPage.evaluate(() => {
     if (FocusState.isWork) Utils.setAllowWindow('ig', 'reels');
     window.kicks = 0;
     Instagram.rapidKick = function () { window.kicks++; this.isRedirecting = true; };
     history.pushState({}, '', '/p/photo/');
    });
    await spaPage.waitForTimeout(350);
    assert.equal(await spaPage.evaluate(() => location.pathname), '/p/photo/', `${mode} keeps SPA photo entry in place`);
    assert.equal(await spaPage.evaluate(() => window.kicks), 0, `${mode} ignores stale Reel DOM identity on photo route`); checks += 2;
    await spaPage.evaluate(() => { document.querySelector('#primary-time').closest('a').href = '/author/p/photo/'; });
    await spaPage.waitForTimeout(350);
    assert.equal(await spaPage.evaluate(() => window.kicks), 0, `${mode} leaves photo permalink allowed after hydration`); checks++;
    await spaPage.evaluate(() => history.pushState({}, '', '/p/reel/'));
    await spaPage.waitForTimeout(350);
    assert.equal(await spaPage.evaluate(() => window.kicks), 0, `${mode} ignores mismatched prior DOM identity on Reel route`); checks++;
    await spaPage.evaluate(() => { document.querySelector('#primary-time').closest('a').href = '/author/reel/reel/'; });
    await spaPage.waitForFunction(() => window.kicks === 1, null, { timeout: 2000 });
    await spaPage.evaluate(() => { Instagram.isRedirecting = false; history.pushState({}, '', '/'); });
    await spaPage.waitForTimeout(350);
    assert.equal(await spaPage.evaluate(() => location.pathname), '/', `${mode} returns from SPA Reel route`);
    await spaPage.evaluate(() => history.pushState({}, '', '/p/photo/'));
    await spaPage.waitForTimeout(350);
    assert.equal(await spaPage.evaluate(() => location.pathname), '/p/photo/', `${mode} back navigation preserves photo route`);
    assert.equal(await spaPage.evaluate(() => window.kicks), 1, `${mode} does not block the photo on SPA return`); checks += 3;
    await spa.close();
   }

   // Work media checks use a clean work-mode context, without resetting live settings.
   const media = await open('ig', modal, { platformSettings: { ig: 'allow' } }, null, '/p/code/');
   const mediaPage = media.page;
   await mediaPage.evaluate(() => {
    const inside = document.querySelector('#inside-video');
    const outside = document.querySelector('#outside-video');
    for (const media of [inside, outside]) {
     let paused = false;
     Object.defineProperty(media, 'paused', { get: () => paused, configurable: true });
     media.pause = () => { media.pauseCalls = (media.pauseCalls || 0) + 1; paused = true; };
    }
    Utils.setAllowWindow('ig', 'reels');
    window.kicks = 0; Instagram.rapidKick = function () { window.kicks++; this.isRedirecting = true; };
   });
   assert.equal(await mediaPage.evaluate(() => Instagram.getReelPermalinkArticle(location.pathname) !== null), true, 'work case starts with a verified Reel permalink'); checks++;
   await media.change({ platformSettings: { ig: 'allow' }, ft_timer_end: Date.now() + 60000, ft_timer_type: 'work' });
   await mediaPage.waitForFunction(() => window.kicks > 0, null, { timeout: 2000 });
   const mediaState = await mediaPage.evaluate(() => ({ inside: document.querySelector('#inside-video').pauseCalls || 0, outside: document.querySelector('#outside-video').pauseCalls || 0, kicks: window.kicks }));
   assert.equal(mediaState.inside, 1, 'work pauses only modal media');
   assert.equal(mediaState.outside, 0, 'work leaves unrelated media playing');
   assert.ok(mediaState.kicks > 0, 'work blocks the verified Reel despite an allowed session');
   checks += 3;
   await media.close();

   for (const [label, settings] of [
    ['break timer', { platformSettings: { ig: 'allow' }, ft_timer_end: Date.now() + 60000, ft_timer_type: 'break' }],
    ['Warn without work', { platformSettings: { ig: 'warn' } }],
   ]) {
    const allowed = await open('ig', modal, settings, null, '/p/code/');
    await allowed.page.waitForTimeout(500);
    assert.equal(await allowed.page.evaluate(() => location.pathname), '/p/code/', `${label} preserves the Reel permalink route`); checks++;
    await allowed.close();
   }
   const disabled = await open('ig', modal, { platformSettings: { ig: 'allow' } }, null, '/p/code/');
   await disabled.change({ ft_enabled: false });
   await disabled.page.waitForTimeout(350);
   assert.equal(await disabled.page.evaluate(() => location.pathname), '/p/code/', 'disabled extension preserves the Reel permalink route'); checks++;
   await disabled.close();

   // Keep one proof through the actual redirect path, not just a rapidKick spy.
   const redirect = await open('ig', modal, { platformSettings: { ig: 'allow' } });
   await redirect.page.evaluate(() => history.pushState({}, '', '/p/code/'));
   await redirect.change({ platformSettings: { ig: 'strict' } });
   await redirect.page.waitForURL(url => url.pathname === '/', { timeout: 3000 });
   assert.equal(await redirect.page.evaluate(() => location.pathname), '/', 'strict mode redirects a verified Reel reached through SPA navigation'); checks++;
   await redirect.close();
   const workRedirect = await open('ig', modal, { platformSettings: { ig: 'allow' } });
   await workRedirect.page.evaluate(() => Utils.setAllowWindow('ig', 'reels'));
   await workRedirect.change({ ft_timer_end: Date.now() + 60000, ft_timer_type: 'work' });
   await workRedirect.page.evaluate(() => history.pushState({}, '', '/p/code/'));
   await workRedirect.page.waitForURL(url => url.pathname === '/', { timeout: 3000 });
   assert.equal(await workRedirect.page.evaluate(() => location.pathname), '/', 'work redirects a verified Reel reached through SPA navigation'); checks++;
   await workRedirect.close();

   const photo = modal.replace('href="/author/reel/code/"', 'href="/author/p/code/"').replace('<video id="inside-video" muted></video>', '');
   const carousel = modal.replace('href="/author/reel/code/"', 'href="/author/p/code/"');
   for (const [content, markup] of [['photo', photo], ['carousel with video', carousel]]) {
    for (const mode of ['strict', 'work']) {
     const settings = mode === 'strict'
      ? { platformSettings: { ig: 'strict' } }
      : { platformSettings: { ig: 'allow' }, ft_timer_end: Date.now() + 60000, ft_timer_type: 'work' };
     const allowed = await open('ig', markup, settings, null, '/p/code/');
     await allowed.page.waitForTimeout(350);
     assert.equal(await allowed.page.evaluate(() => location.pathname), '/p/code/', `${mode} mode allows a ${content} identified by a photo permalink`); checks++;
     await allowed.close();
    }
   }
  }
  await testReelPermalinkHandling();
  // Captured markup plus explicit adversarial derivatives; no authenticated-site claim.
  const cases = [
   ['ig-followed', 'ig-followed-post', false], ['ig-control-only', 'ig-suggested-post', false],
   ['ig-label', 'ig-suggested-post', true], ['ig-sponsored', 'ig-followed-post', true],
   ['ig-unknown', 'ig-followed-post', false], ['ig-caption', 'ig-followed-post', false],
   ['ig-buttons', 'ig-followed-post', false], ['ig-linkshim', 'ig-followed-post', false],
   ['ig-ambiguous', 'ig-suggested-post', false],
   ['li-connected', 'li-connection-post', false], ['li-firstdegree', 'li-outside-network-post', false],
   ['li-following', 'li-outside-network-post', false], ['li-outside', 'li-outside-network-post', true],
   ['li-follow', 'li-follow-post', true], ['li-ad', 'li-promoted-post', true],
   ['li-safelink', 'li-promoted-safelink-post', true], ['li-connect', 'li-connect-post', false],
   ['li-ambiguous', 'li-outside-network-post', false], ['li-caption', 'li-connection-post', false],
   ['li-nested', 'li-connection-post', false], ['li-unknown', 'li-promoted-post', false],
   ['li-safelink-unlabelled', 'li-promoted-safelink-post', false], ['li-buttons', 'li-connection-post', false],
  ];
  for (const platform of ['ig', 'li']) {
   const selected = cases.filter(([id]) => id.startsWith(platform));
   const html = (platform === 'ig' ? fixture('ig-divider') : '') + selected.map(([id, name]) => `<div data-case="${id}">${fixture(name)}</div>`).join('');
   const env = await open(platform, html, { hide_li_feed: false, hide_li_addfeed: false, hide_ig_stories: false }, () => {
    document.querySelectorAll('[data-case]').forEach(wrapper => {
     const id = wrapper.dataset.case;
     const post = wrapper.querySelector('article, [role="listitem"]'); post.id = id;
     const insertLabel = text => { const span = document.createElement('span'); span.textContent = text; const section = post.querySelector('section'); section.before(span); };
     if (id === 'ig-label') insertLabel('Suggested for you');
     if (id === 'ig-sponsored') insertLabel('Sponsored');
     if (id === 'ig-unknown') insertLabel('Unrecognized translated label');
     if (id === 'ig-caption') post.insertAdjacentHTML('beforeend', '<p>Suggested for you Sponsored</p>');
     if (id === 'ig-buttons') post.querySelector('section').insertAdjacentHTML('beforebegin', '<button>Sponsored</button><div role="button">Suggested for you</div>');
     if (id === 'ig-linkshim') post.querySelector('section').insertAdjacentHTML('beforebegin', '<a href="https://l.instagram.com/?u=example">Sponsored</a>');
     if (id === 'ig-ambiguous') { insertLabel('Suggested for you'); post.querySelector('section').remove(); }
     if (id === 'li-firstdegree') post.querySelector('[aria-label*="Open to work"]').setAttribute('aria-label', 'Marcus Elliott 1st');
     if (id === 'li-following') post.querySelector('[aria-label="Follow Marcus Elliott"]').setAttribute('aria-label', 'Following Marcus Elliott');
     if (id === 'li-ambiguous') post.querySelector('[aria-label="Follow Marcus Elliott"]').setAttribute('aria-label', 'Follow unrelated person');
     if (id === 'li-caption') post.querySelector('[data-testid="expandable-text-box"]').textContent = 'Promoted';
     if (id === 'li-buttons') post.querySelector('[data-testid="expandable-text-box"]').insertAdjacentHTML('beforebegin', '<button>Promoted</button>');
     if (id === 'li-unknown' || id === 'li-safelink-unlabelled') { const walker = document.createTreeWalker(post, NodeFilter.SHOW_TEXT); let n; while (n = walker.nextNode()) if (n.nodeValue.trim() === 'Promoted') n.nodeValue = 'Unrecognized translated label'; }
     if (id === 'li-nested') post.querySelector('[data-testid="expandable-text-box"]').insertAdjacentHTML('beforeend', '<div role="listitem" componentkey="nested"><a href="/in/other/"><span aria-label="Other Author 2nd">Other Author</span></a><span>Promoted</span><button aria-label="Follow Other Author"><svg id="add-small"></svg></button><div data-testid="expandable-text-box">Nested caption</div></div>');
    });
   });
   await env.settle();
   for (const [id] of selected) await env.collapsed(id, false);
   await env.change({ [`hide_${platform}_suggested`]: true });
   for (const [id, , expected] of selected) await env.collapsed(id, expected);
   if (platform === 'ig') { assert.equal(await env.page.locator('h3 .ft-ig-stub').count(), 0); checks++; }
   else {
    await env.change({ hide_li_suggested: false, hide_li_activity: true });
    await env.collapsed('li-connect', true); await env.collapsed('li-outside', false); await env.collapsed('li-ad', false);
    await env.change({ hide_li_suggested: true }); await env.collapsed('li-outside', true); await env.collapsed('li-connect', true);
    await env.page.evaluate(() => document.querySelector('main').dataset.testid = 'mainFeed');
    await env.change({ hide_li_feed: true });
    assert.equal(await env.page.locator('#ft-linkedin-feed-overlay').count(), 1); checks++;
    await env.collapsed('li-outside', false); await env.collapsed('li-connect', false);
    await env.change({ hide_li_feed: false }); await env.collapsed('li-connect', true);
   }
   await env.close();
  }
  for (const platform of ['ig', 'li']) {
   const make = platform === 'ig' ? igPost : liPost;
   const label = platform === 'ig' ? 'Suggested for you' : 'Promoted';
   const options = { hide_li_feed: false, hide_li_addfeed: false, hide_ig_stories: false };
   const env = await open(platform, make('target', label) + make('normal') + make('caption', '', '') + make('unknown', 'Unknown localized label'), options);
   const { page, change, collapsed, settle, close } = env;
   await settle();
   await collapsed('target', false); // actual CONFIG defaults opt out
   if (platform === 'ig') {
    await page.evaluate(() => {
     const post = document.querySelector('#target');
     post.style.minHeight = '340px';
     post.style.padding = '17px';
     window.igOriginalChildren = [...post.children];
     window.igOriginalStyle = post.getAttribute('style');
    });
   }
   await change({ [`hide_${platform}_suggested`]: true, platformSettings: { [platform]: 'warn' } });
   await collapsed('target', true);
   if (platform === 'ig') {
    const compact = await page.evaluate(() => {
     const post = document.querySelector('#target');
     return {
      height: post.getBoundingClientRect().height,
      childCount: [...post.children].filter(child => !child.classList.contains('ft-ig-stub')).length,
      childIdentity: [...post.children].filter(child => !child.classList.contains('ft-ig-stub')).every((child, index) => child === window.igOriginalChildren[index]),
      style: post.getAttribute('style'),
      hiddenText: post.querySelector('.ft-ig-stub span')?.textContent,
      hasIcon: !!post.querySelector('.ft-ig-stub-icon'),
      hasParagraph: !!post.querySelector('.ft-ig-stub p'),
     };
    });
    assert.ok(compact.height > 0 && compact.height <= 64, `IG collapsed post should be compact, got ${compact.height}px`);
    assert.equal(compact.childCount, await page.evaluate(() => window.igOriginalChildren.length), 'IG collapse preserves child count');
    assert.equal(compact.childIdentity, true, 'IG collapse preserves original child nodes');
    assert.equal(compact.style, await page.evaluate(() => window.igOriginalStyle), 'IG collapse preserves inline site styles');
    assert.equal(compact.hiddenText, 'Hidden', 'IG stub uses localized hidden text');
    assert.equal(compact.hasIcon, false, 'IG stub has no large icon');
    assert.equal(compact.hasParagraph, false, 'IG stub has no productivity paragraph');
    checks += 7;
    await change({ darkMode: false });
    assert.equal(await page.locator('#target .ft-ig-stub.dark').count(), 0, 'IG stub follows light theme');
    assert.equal(await page.locator('#target .ft-ig-stub span').textContent(), 'Hidden');
    assert.ok(await page.locator('#target').evaluate(post => post.getBoundingClientRect().height > 0 && post.getBoundingClientRect().height <= 64));
    await change({ darkMode: true });
    assert.equal(await page.locator('#target .ft-ig-stub.dark').count(), 1, 'IG stub follows dark theme');
    assert.equal(await page.evaluate(() => {
     const children = [...document.querySelector('#target').children].filter(child => !child.classList.contains('ft-ig-stub'));
     return children.length === window.igOriginalChildren.length && children.every((child, index) => child === window.igOriginalChildren[index]);
    }), true, 'IG theme update preserves child identity');
    checks += 5;
   }
   await collapsed('normal', false);
   await collapsed('unknown', false);
   assert.equal(await page.locator(`#target .ft-${platform}-stub`).count(), 1);
   assert.equal(await page.locator('#target video').isVisible(), false);
   await page.locator(`#target .ft-${platform}-stub button`).click();
   await collapsed('target', false);
   if (platform === 'ig') {
    await page.evaluate(() => {
     const post = document.querySelector('#target');
     const children = [...post.children];
     if (children.length !== window.igOriginalChildren.length || children.some((child, index) => child !== window.igOriginalChildren[index])) throw new Error('unexpected child replacement after IG restore');
     if (post.getAttribute('style') !== window.igOriginalStyle) throw new Error('inline site style changed after IG restore');
     if (post.querySelector('.ft-ig-stub')) throw new Error('IG stub remained after restore');
     if (getComputedStyle(post).minHeight !== '340px' || getComputedStyle(post).paddingTop !== '17px' || post.getBoundingClientRect().height < 340) throw new Error('IG site layout did not restore');
    });
    checks++;
   }
   await page.evaluate(() => document.querySelector('#target').className = 'site-updated');
   await settle(); await collapsed('target', false);
   await page.evaluate(platform => { const p = document.querySelector('#target'); if (platform === 'ig') p.querySelector('a[href^="/p/"]').setAttribute('href', '/p/recycled/'); else p.setAttribute('componentkey', 'recycled'); }, platform);
   await collapsed('target', true);
   await page.evaluate(() => { document.querySelector('#target .label').firstChild.nodeValue = 'ordinary'; });
   await collapsed('target', false);
   await page.evaluate(label => { document.querySelector('#target .label').firstChild.nodeValue = label; }, label);
   await collapsed('target', true);
   await page.evaluate(() => document.querySelector('#target').className = 'site-reset');
   await collapsed('target', true);
   await page.evaluate(() => { window.detachedPost = document.querySelector('#target'); window.detachedPost.remove(); });
   await settle();
   await page.evaluate(() => document.querySelector('main').appendChild(window.detachedPost));
   await collapsed('target', true);
   await page.evaluate(() => document.querySelector('#target .label').remove());
   await collapsed('target', false);
   await page.evaluate(label => { const p = document.querySelector('#target'); const e = document.createElement('span'); e.className = 'label'; e.textContent = label; p.insertBefore(e, p.querySelector('section, [data-testid="expandable-text-box"]')); }, label); await settle();
   await settle();
   await collapsed('target', true);
   if (platform === 'ig') await page.evaluate(() => { window.igOriginalChildren = [...document.querySelector('#target').children].filter(child => !child.classList.contains('ft-ig-stub')); window.igOriginalStyle = document.querySelector('#target').getAttribute('style'); });
   for (const mode of ['strict', 'warn', 'allow']) {
    await change({ platformSettings: { [platform]: mode } });
    await collapsed('target', true);
    if (platform === 'ig') {
     const stubState = await page.evaluate(() => {
      const post = document.querySelector('#target');
      const stub = post.querySelector('.ft-ig-stub');
      return {
       hidden: stub.hidden,
       display: getComputedStyle(stub).display,
       height: post.getBoundingClientRect().height,
       stubHeight: stub.getBoundingClientRect().height,
       children: stub.children.length,
       text: stub.querySelector('span')?.textContent,
       button: !!stub.querySelector('button'),
       style: post.getAttribute('style'),
       childIdentity: window.igOriginalChildren.length === post.children.length - 1 && [...post.children].filter(child => !child.classList.contains('ft-ig-stub')).every((child, index) => child === window.igOriginalChildren[index]),
      };
     });
     if (mode === 'strict') {
      assert.equal(stubState.hidden, true, 'IG strict keeps the owned stub hidden');
      assert.equal(stubState.display, 'none', 'IG strict sentinel is display:none');
      assert.equal(stubState.children, 0, 'IG strict sentinel has no visible content');
      assert.ok(stubState.height <= 8, `IG strict collapse should be <=8px, got ${stubState.height}px`);
      assert.equal(stubState.stubHeight, 0, 'IG strict sentinel has no geometry');
      assert.equal(stubState.childIdentity, true, 'IG strict preserves original child nodes');
      assert.equal(stubState.style, await page.evaluate(() => window.igOriginalStyle), 'IG strict preserves inline site styles');
      await change({ darkMode: true });
      const darkStrict = await page.evaluate(() => { const stub = document.querySelector('#target .ft-ig-stub'); return { hidden: stub.hidden, display: getComputedStyle(stub).display, children: stub.children.length }; });
      assert.deepEqual(darkStrict, { hidden: true, display: 'none', children: 0 }, 'IG dark mode stays silent in strict mode');
      await change({ darkMode: false });
      checks += 8;
     } else {
      assert.equal(stubState.hidden, false, `IG ${mode} keeps the view row visible`);
      assert.ok(stubState.height > 0 && stubState.height <= 64, `IG ${mode} row should be compact, got ${stubState.height}px`);
      assert.ok(stubState.stubHeight > 0 && stubState.stubHeight <= 64, `IG ${mode} stub should be compact, got ${stubState.stubHeight}px`);
      assert.equal(stubState.children, 2, `IG ${mode} stub has localized label and button`);
      assert.equal(stubState.text, 'Hidden', `IG ${mode} stub uses localized hidden text`);
      assert.equal(stubState.button, true, `IG ${mode} exposes View anyway`);
      checks += 6;
     }
    } else {
     assert.equal(await page.locator(`#target .ft-${platform}-stub button`).count(), mode === 'strict' ? 0 : 1, mode);
     checks++;
    }
   }
   await change({ ft_timer_end: Date.now() + 60000, ft_timer_type: 'work' });
   if (platform === 'ig') {
    for (const mode of ['strict', 'warn', 'allow']) {
     await change({ platformSettings: { [platform]: mode } });
     const workState = await page.evaluate(() => { const post = document.querySelector('#target'); const stub = post.querySelector('.ft-ig-stub'); return { hidden: stub.hidden, display: getComputedStyle(stub).display, children: stub.children.length, height: post.getBoundingClientRect().height }; });
     assert.deepEqual(workState, { hidden: true, display: 'none', children: 0, height: 0 }, `IG work overrides ${mode}`);
    }
    await change({ platformSettings: { ig: 'allow' }, ft_timer_end: Date.now() - 1, ft_timer_type: 'work' });
    await collapsed('target', true);
    assert.equal(await page.locator('#target .ft-ig-stub').evaluate(stub => stub.hidden), false, 'IG work completion restores the current mode row');
    assert.ok(await page.locator('#target').evaluate(post => post.getBoundingClientRect().height > 0 && post.getBoundingClientRect().height <= 64));
    checks += 5;
   } else assert.equal(await page.locator(`#target .ft-${platform}-stub button`).count(), 0);
   await change({ ft_timer_type: 'break', ft_timer_end: Date.now() + 60000 }); await collapsed('target', false);
   await change({ ft_timer_end: null }); await collapsed('target', true);
   await change({ focusMode: false }); await collapsed('target', false);
   await change({ focusMode: true }); await collapsed('target', true);
   await change({ [`hide_${platform}_suggested`]: false }); await collapsed('target', false);
   await change({ [`hide_${platform}_suggested`]: true }); await collapsed('target', true);
   await change({ ft_enabled: false }); await collapsed('target', false);
   await change({ ft_enabled: true }); await collapsed('target', true);
   await page.evaluate(platform => { history.pushState({}, '', platform === 'ig' ? '/direct/inbox/' : '/messaging/'); dispatchEvent(new PopStateEvent('popstate')); }, platform);
   await collapsed('target', false);
   await page.evaluate(platform => { history.pushState({}, '', platform === 'ig' ? '/' : '/feed/'); dispatchEvent(new PopStateEvent('popstate')); }, platform);
   await collapsed('target', true);
   // Exercise real media state with a local synthetic stream, never an external video.
   await change({ [`hide_${platform}_suggested`]: false });
   await page.evaluate(async () => {
    const video = document.querySelector('#target video'); const canvas = document.createElement('canvas');
    canvas.getContext('2d').fillRect(0, 0, 100, 100);
    video.srcObject = canvas.captureStream(10);
    await Promise.race([video.play(), new Promise((_, reject) => setTimeout(() => reject(new Error('Media never started')), 2000))]);
    if (video.paused) throw new Error('Media test requires actual playback');
    const normal = document.querySelector('#normal video'); normal.srcObject = video.srcObject;
    await Promise.race([normal.play(), new Promise((_, reject) => setTimeout(() => reject(new Error('Visible media never started')), 2000))]);
    if (normal.paused) throw new Error('Visible media test requires actual playback');
    window.playCalls = 0; const original = video.play.bind(video); video.play = (...args) => { window.playCalls++; return original(...args); };
   });
   assert.equal(await page.locator('#target video').evaluate(video => video.paused), false); checks++;
   await change({ [`hide_${platform}_suggested`]: true });
   assert.equal(await page.locator('#target video').evaluate(video => video.paused), true);
   assert.equal(await page.locator('#normal video').evaluate(video => video.paused), false, 'visible media stays playing'); checks++;
   await page.evaluate(async () => {
    const video = document.querySelector('#target video');
    await Promise.race([video.play(), new Promise((_, reject) => setTimeout(() => reject(new Error('Restart timeout')), 2000))]);
   });
   await page.waitForFunction(() => document.querySelector('#target video').paused);
   await page.evaluate(() => { window.playCalls = 0; });
   await change({ [`hide_${platform}_suggested`]: false });
   assert.equal(await page.evaluate(() => window.playCalls), 0, 'restoration never starts playback'); checks += 2;
   await change({ [`hide_${platform}_suggested`]: true });
   await page.evaluate(() => { window.mutations = 0; window.auditObserver = new MutationObserver(records => { window.mutations += records.length; }); window.auditObserver.observe(document.querySelector('main'), {subtree:true, childList:true, attributes:true, characterData:true}); });
   await page.evaluate(platform => {
    const feed = platform === 'ig' ? IGFeed : LIFeed;
    window.tickCalls = 0; const tick = feed.tick;
    feed.tick = function (...args) { window.tickCalls++; return tick.apply(this, args); };
   }, platform);
   await page.waitForTimeout(650);
   assert.ok(await page.evaluate(() => window.mutations) < 20, 'idle observers settle without self-induced churn'); checks++;
   assert.ok(await page.evaluate(() => window.tickCalls) < 5, 'idle feed processing settles'); checks++;
   if (platform === 'ig') {
    await change({ platformSettings: { ig: 'allow' }, ft_timer_end: null });
    await page.evaluate(() => history.pushState({}, '', '/reels/passive-without-timer'));
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => location.pathname), '/reels/passive-without-timer', 'IG route watcher leaves a passive route in place without a timer');
    await page.evaluate(() => history.replaceState({}, '', '/'));

    await change({ platformSettings: { ig: 'allow' }, ft_timer_end: Date.now() + 60000, ft_timer_type: 'break' });
    await page.evaluate(() => history.pushState({}, '', '/reels/break-without-popstate'));
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => location.pathname), '/reels/break-without-popstate', 'IG route watcher leaves a break route in place');
    await page.evaluate(() => history.replaceState({}, '', '/'));

    await change({ ft_enabled: false, ft_timer_type: 'work' });
    await page.evaluate(() => history.pushState({}, '', '/reels/disabled-without-popstate'));
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => location.pathname), '/reels/disabled-without-popstate', 'IG route watcher leaves a route in place when disabled');
    await page.evaluate(() => history.replaceState({}, '', '/'));

    await change({ ft_enabled: true, ft_timer_end: Date.now() + 60000, ft_timer_type: 'work' });
    await page.evaluate(() => history.replaceState({}, '', '/reels/work-without-popstate'));
    await page.waitForURL(url => url.pathname === '/', { timeout: 3000 });
    assert.equal(await page.evaluate(() => location.pathname), '/', 'IG redirects a naturally reached reels route during work');
    checks += 4;
   }
   await settle(); await close();
  }
  console.log(`Feed browser validation passed: ${checks} assertions (Chromium fixtures; no authenticated live-site coverage).`);
 } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
