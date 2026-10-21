/** 首屏同步恢复、快照失效、交接与异步缩略图竞态的行为测试。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { create, normalize, signature, KEY, TTL, PREVIEW_LIMIT } = require('../js/first-paint.js');
const wood = require('../js/modules/wood-appearance-core.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const preview = 'data:image/webp;base64,AAAA';
const settings = { mode: 'upload', size: 'cover', position: 'center center', overlayOpacity: 0.4, blurPx: 2, updatedAt: 1 };
function snapshot() {
  return { version: 1, updatedAt: 100000, color: '#14171c', layout: 'classic',
    theme: { skin: 'graphite', mode: 'dark', vars: { '--page-bg': '#14171c', '--text-primary': '#edf1f7' } },
    wood: { dark: { ...wood.defaults.dark, wood: '#345678' } },
    backgrounds: { dark: { signature: 'old', preview, createdAt: 100000, ...settings } } };
}

function environment(initial = snapshot(), options = {}) {
  let time = 100000, serial = 0;
  const storage = new Map(initial ? [[KEY, JSON.stringify(initial)]] : []);
  const timers = new Map(), frames = [], listeners = {}, changes = [], drawings = [];
  let closed = 0, fetches = 0;
  const style = () => ({ setProperty(key, value) { this[key] = String(value); }, removeProperty(key) { delete this[key]; } });
  const classes = () => {
    const values = new Set();
    return { add: (...keys) => keys.forEach(key => values.add(key)), remove: (...keys) => keys.forEach(key => values.delete(key)), contains: key => values.has(key) };
  };
  const root = { dataset: {}, style: style(), hasAttribute: () => options.isPage !== false };
  const body = { style: style(), classList: classes() };
  const realImage = { classList: classes() };
  const document = { documentElement: root, body, querySelector: () => realImage,
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: (...args) => drawings.push(args) }),
      toDataURL: () => options.encodedImage || preview }) };
  const env = { document, Blob, AbortController, Date: { now: () => time },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: (callback, delay) => { const id = ++serial; timers.set(id, { callback, at: time + delay }); return id; },
    clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => frames.push(fn),
    matchMedia: () => ({ matches: Boolean(options.reducedMotion) }),
    getComputedStyle: () => ({ getPropertyValue: () => '#14171c' }),
    addEventListener: (type, callback) => { listeners[type] = callback; },
    chrome: { storage: { onChanged: { addListener: fn => changes.push(fn) } } },
    fetch: options.fetch || (async () => { fetches++; return new Response(new Uint8Array(64), { headers: { 'content-type': 'image/png' } }); }),
    createImageBitmap: async () => ({ width: 1920, height: 1080, close() { closed++; } }) };
  if (options.unavailable) env.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('blocked'); } };
  const api = create(env);
  function advance(ms) {
    time += ms;
    for (const [id, task] of [...timers]) {
      if (task.at <= time && timers.has(id)) { timers.delete(id); task.callback(); }
    }
  }
  function frame() { frames.splice(0).forEach(fn => fn()); }
  return { api, root, body, realImage, env, storage, changes, listeners, drawings, timers,
    read: () => JSON.parse(storage.get(KEY) || 'null'), advance, frame, closed: () => closed, fetches: () => fetches };
}

test('读取快照同步恢复深色、主题变量和布局，body 阶段恢复木牌配色', () => {
  const view = environment();
  assert.equal(view.root.dataset.theme, 'dark');
  assert.equal(view.root.dataset.skin, 'graphite');
  assert.equal(view.root.dataset.homeLayout, 'classic');
  assert.equal(view.root.style['--page-bg'], '#14171c');
  assert.equal(view.root.style.colorScheme, 'dark');
  assert.equal(view.root.dataset.firstPaint, 'armed');
  assert.match(view.root.style['--first-paint-image'], /^url\("data:image\/webp/);
  view.api.applyBody();
  assert.equal(view.body.style['--wood'], '#345678');
  assert.equal(view.body.classList.contains('has-custom-background'), true);
  assert.equal(view.fetches(), 0);
});

test('损坏、过期、未来版本、超大图片和危险样式均不能进入首屏', () => {
  assert.equal(normalize({ ...snapshot(), updatedAt: 100000 - TTL - 1 }, 100000), null);
  assert.equal(normalize({ ...snapshot(), version: 2 }, 100000), null);
  assert.equal(normalize({ ...snapshot(), updatedAt: 200000 }, 100000), null);
  const bad = snapshot();
  bad.theme.vars['--danger'] = 'url(https://tracker.test)';
  bad.backgrounds.dark.preview = 'data:image/svg+xml,<svg></svg>';
  const clean = normalize(bad, 100000);
  assert.equal(clean.theme.vars['--danger'], undefined);
  assert.deepEqual(clean.backgrounds, {});
  bad.backgrounds.dark.preview = 'data:image/png;base64,' + 'A'.repeat(PREVIEW_LIMIT);
  assert.deepEqual(normalize(bad, 100000).backgrounds, {});
  const view = environment(null);
  view.storage.set(KEY, '{broken json');
  assert.doesNotThrow(() => view.api.rememberLayout('wooden'));
});

test('正式背景先就绪，双帧后淡出预览；不清掉已经显示的正式背景', () => {
  const view = environment();
  view.api.applyBody();
  view.realImage.classList.add('is-visible');
  view.api.finish();
  assert.equal(view.root.dataset.firstPaint, 'armed');
  view.frame(); assert.equal(view.root.dataset.firstPaint, 'armed');
  view.frame(); assert.equal(view.root.dataset.firstPaint, 'fading');
  view.advance(220);
  assert.equal(view.root.dataset.firstPaint, undefined);
  assert.equal(view.root.style['--first-paint-image'], undefined);
  assert.equal(view.body.classList.contains('has-custom-background'), true);
});

test('未收到背景就绪信号或动画帧暂停时，3 秒兜底移除旧预览', () => {
  for (const requestFinish of [false, true]) {
    const view = environment();
    view.api.applyBody();
    if (requestFinish) view.api.finish();
    view.advance(3000);
    assert.equal(view.root.dataset.firstPaint, undefined);
    assert.equal(view.root.dataset.firstPaintImage, undefined);
    assert.equal(view.body.classList.contains('has-custom-background'), false);
  }
});

test('减少动态效果时不等待淡出，主题模式变化时立即撤下旧模式壁纸', () => {
  const view = environment(snapshot(), { reducedMotion: true });
  view.api.finish(); view.frame(); view.frame();
  assert.equal(view.root.dataset.firstPaint, undefined);
  const changed = environment();
  changed.api.rememberTheme('cream', 'light', { '--page-bg': '#f7f2e8' });
  assert.equal(changed.root.dataset.firstPaintImage, undefined);
  assert.equal(changed.read().theme.mode, 'light');
});

test('上传背景生成有界缩略图，同一背景不重复编码，浅色和深色分开存储', async () => {
  const view = environment();
  view.api.backgroundReady({ mode: 'dark', settings, image: { naturalWidth: 1920, naturalHeight: 1080 }, readable: true });
  view.advance(0); await tick();
  const saved = view.read();
  assert.equal(saved.backgrounds.dark.signature, signature(settings));
  assert.equal(saved.backgrounds.dark.preview, preview);
  assert.deepEqual(view.drawings[0].slice(3), [640, 360]);
  view.api.backgroundReady({ mode: 'dark', settings, image: { naturalWidth: 1920, naturalHeight: 1080 }, readable: true });
  view.advance(0); await tick();
  assert.equal(view.drawings.length, 1);
  view.api.backgroundReady({ mode: 'light', settings, image: { naturalWidth: 100, naturalHeight: 200 }, readable: true });
  view.advance(0); await tick();
  assert.ok(view.read().backgrounds.light.preview);
  assert.ok(view.read().backgrounds.dark.preview);
});

test('远程图片缩略图通过不带 Cookie 的有界读取生成，完成后释放 bitmap', async () => {
  const view = environment();
  const calls = [];
  view.env.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(new Uint8Array(64), { headers: { 'content-type': 'image/png' } });
  };
  const remote = { ...settings, mode: 'url', url: 'https://wallpaper.test/a.png' };
  view.api.backgroundReady({ mode: 'dark', settings: remote, readable: false });
  view.advance(0); await tick();
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.equal(calls[0].options.cache, 'force-cache');
  assert.equal(view.read().backgrounds.dark.signature, signature(remote));
  assert.equal(view.closed(), 1);
});

test('切换设置或清除缓存后，迟到的缩略图不会写回旧图片', async () => {
  for (const clear of [false, true]) {
    let complete;
    const view = environment(snapshot(), { fetch: () => new Promise(resolve => { complete = resolve; }) });
    view.api.backgroundReady({ mode: 'dark', settings: { ...settings, mode: 'url', url: 'https://wallpaper.test/a.png' }, readable: false });
    view.advance(0); await tick();
    if (clear) view.api.clear(); else view.api.clearBackground('dark');
    complete(new Response(new Uint8Array(64), { headers: { 'content-type': 'image/png' } }));
    await tick();
    if (clear) assert.equal(view.storage.has(KEY), false);
    else assert.equal(view.read().backgrounds.dark, undefined);
  }
});

test('设置页修改某一模式背景只使该模式失效，恢复默认也删除该模式快照', () => {
  const initial = snapshot();
  initial.backgrounds.light = { ...initial.backgrounds.dark };
  const view = environment(initial, { isPage: false });
  assert.equal(view.root.dataset.theme, undefined);
  view.changes[0]({ chromeNav_backgroundSettings: { oldValue: { profiles: { dark: settings, light: settings } },
    newValue: { profiles: { dark: { ...settings, url: 'new' }, light: settings } } } }, 'local');
  assert.equal(view.read().backgrounds.dark, undefined);
  assert.ok(view.read().backgrounds.light);
  view.api.backgroundReady({ mode: 'light', settings: { mode: 'default' } });
  assert.deepEqual(view.read().backgrounds, {});
});

test('离开页面会取消正在获取的缩略图请求', async () => {
  let aborted = false;
  const view = environment(snapshot(), { fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
  }) });
  view.api.backgroundReady({ mode: 'dark', settings: { ...settings, mode: 'url', url: 'https://wallpaper.test/a.png' }, readable: false });
  view.advance(0); await tick();
  view.listeners.pagehide();
  await tick();
  assert.equal(aborted, true);
  assert.equal(view.read().backgrounds.dark.signature, 'old');
});

test('存储配额或 canvas 失败不影响背景显示，pagehide 不留下等待中的预览', async () => {
  const blocked = environment(null, { unavailable: true });
  assert.doesNotThrow(() => blocked.api.rememberTheme('cream', 'light', { '--page-bg': '#f7f2e8' }));
  const view = environment(snapshot(), { encodedImage: 'data:image/png;base64,' + 'A'.repeat(PREVIEW_LIMIT) });
  view.api.backgroundReady({ mode: 'dark', settings, image: { naturalWidth: 100, naturalHeight: 100 }, readable: true });
  view.advance(0); await tick();
  assert.equal(view.read().backgrounds.dark.signature, 'old');
  view.listeners.pagehide();
  assert.equal(view.root.dataset.firstPaint, undefined);
  assert.equal(view.timers.size, 0);
});

test('首屏脚本在所有样式表之前执行，设置页只加载镜像 API', () => {
  const html = fs.readFileSync(path.join(__dirname, '../newtab.html'), 'utf8');
  assert.ok(html.indexOf('src="js/first-paint.js"') < html.indexOf('rel="stylesheet"'));
  assert.ok(html.indexOf('src="js/first-paint-body.js"') < html.indexOf('class="artdeco-bg"'));
  const options = fs.readFileSync(path.join(__dirname, '../options.html'), 'utf8');
  assert.equal(options.includes('data-first-paint-page'), false);
  assert.equal(options.includes('js/first-paint.js'), true);
});
