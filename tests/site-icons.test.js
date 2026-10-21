/** 图标获取、真实 IndexedDB 事务、并发、失败和 UI 请求竞态的隔离回归测试。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory } = require('fake-indexeddb');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../js/modules/site-icon-core.js');
const { create: createCache } = require('../js/modules/site-icon-cache.js');
const { create: createService } = require('../js/modules/site-icon-service.js');
const { parseManifest } = require('../js/site-icon-offscreen.js');

const icon = new Blob([new Uint8Array(64)], { type: 'image/png' });
const fresh = (key, time = 1000) => ({ key, blob: icon, mimeType: 'image/png', width: 64,
  height: 64, cachedAt: time, expiresAt: time + core.CACHE_TTL });
const tick = () => new Promise(resolve => setImmediate(resolve));
function memoryCache() {
  const entries = new Map();
  return { entries, async get(key) { return entries.get(key) || null; },
    async set(entry) { entries.set(entry.key, entry); }, async clear() { entries.clear(); } };
}
function imageResponse({ mimeType = 'image/png', length = 64, status = 200 } = {}) {
  return new Response(new Uint8Array(length), { status, headers: { 'content-type': mimeType } });
}
function service(overrides = {}) {
  return createService({ cache: memoryCache(), now: () => 1000,
    faviconBase: 'chrome-extension://test/_favicon/',
    fetch: async () => imageResponse(), offscreen: async () => ({ width: 64, height: 64 }), ...overrides });
}

test('缓存键隔离页面路径、端口及手动图标，去掉 hash 并拒绝不支持的 URL', () => {
  assert.equal(core.cacheKey('https://EXAMPLE.com/a#x'), core.cacheKey('https://example.com/a#y'));
  assert.notEqual(core.cacheKey('https://example.com/a'), core.cacheKey('https://example.com/b'));
  assert.notEqual(core.cacheKey('https://example.com:8443/a'), core.cacheKey('https://example.com/a'));
  assert.notEqual(core.cacheKey('https://example.com', 'https://cdn.test/one.png'), core.cacheKey('https://example.com', 'https://cdn.test/two.png'));
  for (const url of ['javascript:alert(1)', 'file:///test', 'data:image/png,x', 'https://user:secret@example.com']) {
    assert.equal(core.httpUrl(url), '');
  }
});

test('自动生成的旧 S2 地址不当成自定义，但显式手动图标优先保留', () => {
  const url = 'https://example.com/path';
  const legacy = 'https://www.google.com/s2/favicons?domain=example.com&sz=64';
  assert.equal(core.getCustomIcon({ url, icon: legacy }), '');
  assert.equal(core.getCustomIcon({ url, icon: legacy, customIcon: legacy }), legacy);
  assert.equal(core.getCustomIcon({ url, icon: 'https://cdn.test/a.png', customIcon: '' }), '');
  assert.equal(core.getCustomIcon({ url, icon: 'https://cdn.test/a.png' }), 'https://cdn.test/a.png');
});

test('Manifest 补全相对路径并排除非法协议和 monochrome 图标', () => {
  const result = parseManifest(JSON.stringify({ icons: [
    { src: '../large.png', sizes: '192x192' },
    { src: '/mono.png', purpose: 'monochrome' }, { src: 'javascript:bad' }
  ] }), 'https://site.test/app/manifest.json');
  assert.deepEqual(result, [{ url: 'https://site.test/large.png', kind: 'manifest', size: 192 }]);
  assert.deepEqual(parseManifest('broken', 'https://site.test'), []);
});

test('本机和内网地址不发送到公共图标服务', () => {
  for (const host of ['localhost', '127.0.0.1', '192.168.1.2', '172.16.0.2', '10.0.0.1', 'nas.local', '[::1]']) {
    assert.deepEqual(core.providerCandidates(`http://${host}/app`), []);
  }
  assert.equal(core.providerCandidates('https://example.com')[0].kind, 'google');
});

test('重建缓存实例后仍可恢复 Blob、来源和持久失败记录', async () => {
  const idb = new IDBFactory();
  const first = createCache({ indexedDB: idb, now: () => 1000 });
  await first.set({ ...fresh('ok'), sourceUrl: 'https://site.test/icon.png' });
  await first.set({ key: 'failed', retryAfter: 5000 });
  const reopened = createCache({ indexedDB: idb, now: () => 2000 });
  const hit = await reopened.get('ok');
  assert.equal(hit.blob.size, icon.size);
  assert.equal(hit.sourceUrl, 'https://site.test/icon.png');
  assert.equal((await reopened.get('failed')).retryAfter, 5000);
  await reopened.clear();
  assert.equal(await first.get('ok'), null);
});

test('并发写入在同一事务内按最近访问淘汰，并拒绝超大单图', async () => {
  let time = 1;
  const cache = createCache({ indexedDB: new IDBFactory(), now: () => time++, maxEntries: 2, maxBytes: 128 });
  await cache.set(fresh('a'));
  await cache.set(fresh('b'));
  await cache.get('a');
  await cache.set(fresh('c'));
  assert.equal(await cache.get('b'), null);
  assert.ok((await cache.get('a')).blob);
  assert.ok((await cache.get('c')).blob);
  assert.equal(await cache.set({ key: 'huge', blob: new Blob([new Uint8Array(core.MAX_ICON_BYTES + 1)]) }), false);
  await Promise.all([cache.set(fresh('d')), cache.set(fresh('e'))]);
  assert.equal(await cache.get('a'), null);
  assert.equal(await cache.get('c'), null);
});

test('相同图标跨调用合并，缓存命中和后台重建后不重复请求网络', async () => {
  let calls = 0;
  const cache = memoryCache();
  const fetch = async () => { calls++; await tick(); return imageResponse(); };
  const first = service({ cache, fetch });
  const results = await Promise.all([first.handle({ url: 'https://site.test' }), first.handle({ url: 'https://site.test' })]);
  assert.equal(calls, 1);
  assert.ok(results.every(result => result.success));
  assert.equal((await service({ cache, fetch }).handle({ url: 'https://site.test' })).fromCache, true);
  assert.equal(calls, 1);
});

test('自定义图标优先且用独立缓存键，坏地址不会污染自动图标', async () => {
  const requested = [];
  const cache = memoryCache();
  const app = service({ cache, fetch: async url => { requested.push(url); return imageResponse(); } });
  await app.handle({ url: 'https://site.test', customIcon: 'https://cdn.test/custom.png' });
  assert.deepEqual(requested, ['https://cdn.test/custom.png']);
  await app.handle({ url: 'https://site.test' });
  assert.equal(cache.entries.size, 2);
  assert.match(requested[1], /^chrome-extension:/);
});

test('实际网页和 Manifest 候选优于低分辨率浏览器图标，且不会请求第三方', async () => {
  const requested = [];
  const app = service({ fetch: async url => {
    requested.push(url);
    if (url === 'https://site.test/') return new Response('<link rel="manifest">', { headers: { 'content-type': 'text/html' } });
    if (url.endsWith('/manifest.json')) return new Response('{}', { headers: { 'content-type': 'application/json' } });
    return imageResponse({ length: url.endsWith('declared.png') ? 128 : 64 });
  }, offscreen: async message => {
    if (message.action === 'page') return { candidates: [{ url: 'https://site.test/declared.png', kind: 'html', size: 128 }], manifests: ['https://site.test/manifest.json'] };
    if (message.action === 'manifest') return [{ url: 'https://site.test/manifest.png', kind: 'manifest', size: 64 }];
    return message.bytes.length === 128 ? { width: 128, height: 128 } : { width: 32, height: 32 };
  } });
  const result = await app.handle({ url: 'https://site.test' });
  assert.equal(result.sourceKind, 'html');
  assert.equal(result.width, 128);
  assert.ok(requested.includes('https://site.test/favicon.ico'));
  assert.ok(requested.includes('https://site.test/manifest.png'));
  assert.equal(requested.some(url => url.includes('google.com')), false);
});

test('总下载并发受限，且请求不带 Cookie 和 Referer', async () => {
  let active = 0, peak = 0;
  const app = service({ fetchConcurrency: 2, siteConcurrency: 5, fetch: async (_url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    peak = Math.max(peak, ++active);
    await tick(); active--;
    return imageResponse();
  } });
  await Promise.all(Array.from({ length: 8 }, (_, i) => app.handle({ url: `https://site${i}.test` })));
  assert.equal(peak, 2);
});

test('失败记录跨后台实例生效，手动刷新绕过失败冷却', async () => {
  let calls = 0;
  const cache = memoryCache();
  const fetch = async () => { calls++; return imageResponse({ status: 404 }); };
  assert.equal((await service({ cache, fetch }).handle({ url: 'https://site.test' })).success, false);
  const failedCalls = calls;
  assert.equal((await service({ cache, fetch }).handle({ url: 'https://site.test' })).success, false);
  assert.equal(calls, failedCalls);
  const result = await service({ cache }).handle({ url: 'https://site.test', force: true });
  assert.equal(result.success, true);
});

test('刷新失败保留旧图，过期图先显示且更新不阻塞读取', async () => {
  const cache = memoryCache();
  const key = core.cacheKey('https://site.test');
  const previous = { ...fresh(key), expiresAt: 1 };
  await cache.set(previous);
  const app = service({ cache, fetch: async () => imageResponse({ status: 404 }) });
  const stale = await app.handle({ url: 'https://site.test' });
  assert.equal(stale.success, true);
  assert.equal(stale.stale, true);
  const refresh = await app.handle({ url: 'https://site.test', force: true });
  assert.equal(refresh.refreshFailed, true);
  assert.equal(cache.entries.get(key).blob, previous.blob);
  assert.equal(cache.entries.get(key).retryAfter, 1000 + core.FAILURE_TTL);
});

test('拒绝伪图片 MIME、解码失败和流式超限图片，最终显示文字', async () => {
  let inspections = 0;
  const app = service({ fetch: async () => imageResponse({ mimeType: 'text/html' }),
    offscreen: async message => { if (message.action === 'inspect') inspections++; return null; } });
  assert.equal((await app.handle({ url: 'https://site.test' })).success, false);
  assert.equal(inspections, 0);
  const huge = service({ fetch: async () => imageResponse({ length: core.MAX_ICON_BYTES + 1 }) });
  assert.equal((await huge.handle({ url: 'https://site.test' })).success, false);
  const corrupt = service({ offscreen: async () => null });
  assert.equal((await corrupt.handle({ url: 'https://site.test' })).success, false);
});

test('清除缓存时正在下载的旧任务不会重新写入缓存', async () => {
  let finish;
  const cache = memoryCache();
  const app = service({ cache, fetch: () => new Promise(resolve => { finish = () => resolve(imageResponse()); }) });
  const pending = app.handle({ url: 'https://site.test' });
  while (!finish) await tick();
  await app.clear();
  finish();
  await pending;
  assert.equal(cache.entries.size, 0);
});

test('IndexedDB 不可用时仍能显示本次获取的图标', async () => {
  const app = service({ cache: { get: async () => { throw new Error('database down'); },
    set: async () => { throw new Error('database down'); } } });
  assert.equal((await app.handle({ url: 'https://site.test' })).success, true);
});

function createLoader() {
  const pending = [], revoked = [];
  let serial = 0;
  const makeImage = () => {
    let source = '';
    return { parentElement: { dataset: {}, appendChild() {} }, naturalWidth: 64, hidden: false,
      removeAttribute() { source = ''; },
      set src(value) { source = value; queueMicrotask(() => this.onload?.()); },
      get src() { return source; } };
  };
  const context = { SiteIconCore: core, Blob, Uint8Array, setTimeout, clearTimeout,
    URL: { createObjectURL: () => `blob:local-${serial++}`, revokeObjectURL: url => revoked.push(url) },
    document: { createElement: () => ({ setAttribute() {}, remove() {} }) },
    chrome: { runtime: { sendMessage: message => new Promise(resolve => pending.push({ message, resolve })) } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/modules/site-logo-manager.js'), 'utf8'), context);
  return { manager: context.SiteLogoManager, pending, revoked, makeImage };
}
const reply = { success: true, bytes: [1, 2, 3], mimeType: 'image/png' };

test('快速切换图标时旧请求不能覆盖新图，重绘释放 Blob URL', async () => {
  const { manager, pending, revoked, makeImage } = createLoader();
  const image = makeImage();
  const first = manager.load(image, { url: 'https://old.test', name: '旧' });
  await tick();
  const second = manager.load(image, { url: 'https://new.test', name: '新' });
  await tick();
  pending[1].resolve(reply); await second;
  const newSource = image.src;
  pending[0].resolve(reply); await first;
  assert.equal(image.src, newSource);
  assert.equal(image.hidden, false);
  manager.releaseWithin({ querySelectorAll: () => [image] });
  assert.deepEqual(revoked, [newSource]);
});

test('首页与搜索同站共享请求，加载失败保留首字且不显示破图', async () => {
  const { manager, pending, makeImage } = createLoader();
  const first = makeImage(), second = makeImage();
  const operations = [manager.load(first, { url: 'https://site.test', name: '站' }),
    manager.load(second, { url: 'https://site.test', name: '站' })];
  await tick();
  assert.equal(pending.length, 1);
  pending[0].resolve({ success: false });
  await Promise.all(operations);
  assert.equal(first.hidden, true);
  assert.equal(first.parentElement.dataset.logoStatus, 'fallback');
  assert.equal(second.parentElement.dataset.logoStatus, 'fallback');
});

test('后台图标代理拒绝普通网页和其他扩展，只接受本扩展页面', async () => {
  let listener, created = 0;
  const event = { addListener() {} };
  const context = { importScripts() {}, console: { log() {} },
    chrome: { runtime: { id: 'own', getURL: value => 'chrome-extension://own/' + value,
      onInstalled: event, onStartup: event, onMessage: { addListener(fn) { listener = fn; } } },
    alarms: { onAlarm: event } },
    SiteIconService: { create() { created++; return { handle: async () => ({ success: true }) }; } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/background.js'), 'utf8'), context);
  for (const sender of [{ id: 'own', url: 'https://site.test' }, { id: 'other', url: 'chrome-extension://other/newtab.html' }]) {
    let response;
    assert.equal(listener({ type: 'GET_SITE_ICON' }, sender, result => { response = result; }), false);
    assert.equal(response.success, false);
  }
  assert.equal(created, 0);
  let response;
  assert.equal(listener({ type: 'GET_SITE_ICON' }, { id: 'own', url: 'chrome-extension://own/newtab.html' }, result => { response = result; }), true);
  await tick();
  assert.equal(response.success, true);
  assert.equal(created, 1);
});
