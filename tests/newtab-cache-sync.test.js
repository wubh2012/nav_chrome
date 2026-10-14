const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const readSource = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve));
};

function createPage({ layout = 'classic-home', cached = true, testMode = false, syncEnabled = true, alarm = null } = {}) {
  const state = {
    cached: cached ? { data: { Code: [{ id: 'cached', sort: 10 }] }, categories: ['Code'], dateInfo: {}, revision: 1 } : null,
    config: { appId: 'fixture', appSecret: 'fixture', appToken: 'app', tableId: 'table', syncEnabled, syncInterval: 30 },
    alarm, revision: 0, requests: 0, renders: [], statuses: [], events: []
  };
  const handlers = { messages: [], changes: [], alarms: [] };
  const Storage = {
    async getTestMode() { return testMode; },
    async loadFeishuConfig() { return state.config; },
    async loadNavData() { return state.cached; },
    async loadPendingSortSync() { return null; },
    async getNavDataRevision() { return state.cached?.revision || 0; },
    getNavDataRevisionKey() { return 'revision'; },
    async commitNavData(data, categories, dateInfo) {
      state.cached = { data, categories, dateInfo, revision: 1 };
      return { success: true, revision: 1 };
    }
  };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    window: {}, Storage, setInterval() {}, setTimeout() {}, clearTimeout() {},
    document: {
      readyState: 'loading',
      addEventListener(type, callback) { if (type === 'DOMContentLoaded') handlers.start = callback; },
      getElementById() { return null; }, querySelector() { return null; },
      body: { classList: { contains: name => name === layout, add: name => state.events.push(name) } }
    },
    HomeLayout: { async init() {} },
    ThemeManager: { async init() {}, bindEvents() {} },
    LinkManager: { init() {}, updateCategories() {} },
    FeishuAPI: {
      async getRecords() {
        state.requests++;
        return { success: true, data: { Code: [{ id: 'remote', sort: 10 }] }, categories: ['Code'], dateInfo: {} };
      }
    },
    UIRenderer: {
      startTimeUpdate() {}, renderDateTime() {},
      showSyncStatus(message) { state.statuses.push(message); },
      getNavDataSnapshot() { return { revision: state.revision }; },
      async init(data, _categories, _dateInfo, revision) {
        state.revision = revision;
        state.renders.push({ id: data.Code[0].id, revision });
        state.events.push('render');
      }
    },
    chrome: {
      runtime: {
        onMessage: { addListener: callback => handlers.messages.push(callback) },
        sendMessage(message, callback) {
          if (message.type === 'SYNC_NOW') state.requests++;
          callback?.({ success: true, categories: ['Code'] });
        }
      },
      storage: { onChanged: { addListener: callback => handlers.changes.push(callback) } },
      alarms: {
        async get() { return state.alarm; },
        async clear() { state.alarm = null; state.events.push('clear-alarm'); },
        async create(name, options) { state.alarm = { name, ...options }; state.events.push('create-alarm'); },
        onAlarm: { addListener: callback => handlers.alarms.push(callback) }
      }
    }
  });
  context.window.HomeLayout = context.HomeLayout;
  context.window.LinkManager = context.LinkManager;
  vm.runInContext(readSource('js/modules/sync-manager.js') + '\n' + readSource('js/app.js'), context);
  return {
    state, handlers,
    async start() { await handlers.start(); await settle(); },
    async message() {
      await Promise.all(handlers.messages.map(listener => new Promise(resolve => {
        if (listener({ type: 'SYNC_COMPLETE' }, {}, resolve) !== true) resolve();
      })));
    }
  };
}

test('两种布局先显示缓存，首次自动同步延后一分钟', async () => {
  for (const layout of ['classic-home', 'wooden-home']) {
    const page = createPage({ layout });
    await page.start();
    assert.equal(page.state.requests, 0);
    assert.deepEqual(page.state.renders, [{ id: 'cached', revision: 1 }]);
    assert.equal(page.state.alarm.delayInMinutes, 1);
    assert.equal(page.state.alarm.periodInMinutes, 30);
    assert.ok(page.state.events.indexOf('loaded') < page.state.events.indexOf('create-alarm'));
  }
});

test('连续打开标签页保留已有同步计划，不推迟同步时间', async () => {
  const alarm = { name: 'chromeNav_sync_alarm', periodInMinutes: 30, scheduledTime: 123456 };
  const page = createPage({ alarm });
  await page.start();
  assert.equal(page.state.alarm, alarm);
  assert.equal(page.state.requests, 0);
  assert.equal(page.state.events.includes('clear-alarm'), false);
});

test('同一修订的存储通知与完成消息，无论顺序或并发，都只更新一次', async () => {
  for (const order of ['storage-first', 'message-first', 'concurrent']) {
    const page = createPage();
    await page.start();
    page.state.cached = { data: { Code: [{ id: 'updated' }] }, categories: ['Code'], dateInfo: {}, revision: 2 };
    const storage = () => page.handlers.changes[0]({ revision: { oldValue: 1, newValue: 2 } }, 'local');
    if (order === 'storage-first') { await storage(); await page.message(); }
    if (order === 'message-first') { await page.message(); await storage(); }
    if (order === 'concurrent') await Promise.all([storage(), page.message(), page.message()]);
    assert.deepEqual(page.state.renders, [{ id: 'cached', revision: 1 }, { id: 'updated', revision: 2 }], order);
    assert.equal(page.state.requests, 0);
  }
});

test('切换到修订号较小的另一张表仍然更新，随后忽略该表重复通知', async () => {
  const page = createPage();
  await page.start();
  page.state.config.tableId = 'another';
  page.state.cached = { data: { Code: [{ id: 'other-table' }] }, categories: ['Code'], dateInfo: {}, revision: 0 };
  await page.message();
  await page.message();
  assert.deepEqual(page.state.renders, [{ id: 'cached', revision: 1 }, { id: 'other-table', revision: 0 }]);
});

test('关闭自动同步及测试模式均只加载缓存；没有缓存时直接拉取飞书', async () => {
  for (const options of [{ syncEnabled: false }, { testMode: true }]) {
    const page = createPage(options);
    await page.start();
    assert.equal(page.state.requests, 0);
    assert.equal(page.state.alarm, null);
    assert.equal(page.state.renders.length, 1);
  }
  const page = createPage({ cached: false });
  await page.start();
  assert.equal(page.state.requests, 1);
  assert.equal(page.state.renders[0].id, 'remote');
});

test('前台不响应同步闹钟，定时请求由后台统一执行', async () => {
  const page = createPage();
  await page.start();
  for (const callback of page.handlers.alarms) callback({ name: 'chromeNav_sync_alarm' });
  await settle();
  assert.equal(page.state.requests, 0);
});

test('浏览器重启先安排延迟同步，闹钟触发后才发起请求', async () => {
  const handlers = {}, alarms = [], timers = [];
  let requests = 0;
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, importScripts() {},
    setTimeout(callback, delay) { timers.push({ callback, delay }); },
    Storage: {
      async loadFeishuConfig() { return { appToken: 'app', tableId: 'table', syncEnabled: true, syncInterval: 30 }; },
      async getTestMode() { return false; }, async loadAllPendingSortSyncs() { return {}; },
      async loadPendingSortSync() { return null; }
    },
    SyncService: { async syncNavigation() { requests++; return { success: true, skipped: true }; } },
    chrome: {
      runtime: {
        onInstalled: { addListener() {} }, onMessage: { addListener() {} },
        onStartup: { addListener: callback => { handlers.start = callback; } }
      },
      alarms: {
        async create(name, options) { alarms.push({ name, ...options }); },
        onAlarm: { addListener: callback => { handlers.alarm = callback; } }
      }
    }
  });
  vm.runInContext(readSource('js/background.js'), context);
  await handlers.start();
  await settle();
  assert.equal(requests, 0);
  assert.equal(timers.length, 0);
  assert.equal(alarms[0].delayInMinutes, 1);
  handlers.alarm({ name: 'chromeNav_sync_alarm' });
  await settle();
  assert.equal(requests, 1);
});
