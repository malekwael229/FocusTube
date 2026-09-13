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
  async function open(platform, html, settings = {}, prepare = null) {
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
   await page.goto(platform === 'ig' ? 'https://www.instagram.com/' : 'https://www.linkedin.com/feed/');
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
   for (const mode of ['strict', 'warn', 'allow']) {
    await change({ platformSettings: { [platform]: mode } });
    await collapsed('target', true);
    assert.equal(await page.locator(`#target .ft-${platform}-stub button`).count(), mode === 'strict' ? 0 : 1, mode);
    checks++;
   }
   await change({ ft_timer_end: Date.now() + 60000, ft_timer_type: 'work' });
   assert.equal(await page.locator(`#target .ft-${platform}-stub button`).count(), 0);
   await change({ ft_timer_type: 'break' }); await collapsed('target', false);
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
   await settle(); await close();
  }
  console.log(`Feed browser validation passed: ${checks} assertions (Chromium fixtures; no authenticated live-site coverage).`);
 } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
