const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function createBackground({ testMode = false, initialPending = {}, batchUpdateRecordSorts = async () => ({ updated: true }) } = {}) {
  const handlers = {};
  const alarms = [];
  const pending = new Map(Object.entries(initialPending));
  const state = { revision: 0 };
  const config = { appToken: 'app', tableId: 'table', syncEnabled: false };
  const storage = {
    async loadFeishuConfig() { return config; },
    async getTestMode() { return testMode; },
    async loadAllPendingSortSyncs() { return Object.fromEntries(pending); },
    async loadPendingSortSync(scope) { return pending.get(scope) || null; },
    async savePendingSortSync(payload, scope = payload?.dataScope) {
      if (payload) pending.set(scope, { ...payload, dataScope: scope });
      else pending.delete(scope);
    },
    async clearPendingSortSync(scope) {
      if (scope) pending.delete(scope);
      else pending.clear();
    },
    async getNavDataRevision() { return state.revision; },
    async loadNavData() { return null; },
    async saveNavData(_data, _categories, _dateInfo, options = {}) {
      state.revision = options.nextRevision;
      if (options.pendingSortSync !== undefined) {
        if (options.pendingSortSync) pending.set(options.dataScope, options.pendingSortSync);
        else pending.delete(options.dataScope);
      }
      return { revision: state.revision };
    },
    async saveSyncStatus() {},
    async getSyncStatus() { return null; },
    async getSyncTime() { return null; }
  };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    setTimeout() { return 1; },
    importScripts() {},
    Storage: storage,
    DragSortCore: {
      markPendingSortSyncing: (value) => ({ ...value, status: 'syncing' }),
      markPendingSortFailure: (value, error) => ({ ...value, status: 'error', error, retryCount: (value.retryCount || 0) + 1 }),
      isSamePendingSortPayload: (left, right) => left?.revision === right?.revision
    },
    FeishuAPI: { batchUpdateRecordSorts },
    SyncService: { async syncNavigation() { return { success: true }; } },
    chrome: {
      runtime: {
        lastError: null,
        onInstalled: { addListener(handler) { handlers.onInstalled = handler; } },
        onStartup: { addListener(handler) { handlers.onStartup = handler; } },
        onMessage: { addListener(handler) { handlers.onMessage = handler; } },
        sendMessage() {}
      },
      alarms: {
        create(name, options) { alarms.push({ name, options }); return Promise.resolve(); },
        clear() { return Promise.resolve(); },
        onAlarm: { addListener(handler) { handlers.onAlarm = handler; } }
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/background.js'), 'utf8'), context);
  return { handlers, alarms, pending, state };
}

function sendMessage(handlers, message) {
  return new Promise((resolve, reject) => {
    const keepAlive = handlers.onMessage(message, {}, resolve);
    if (!keepAlive) reject(new Error(`Unhandled message: ${message.type}`));
  });
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for background operation');
}

test('浏览器重启时即使在测试模式也恢复持久化排序闹钟', async () => {
  const { handlers, alarms } = createBackground({
    testMode: true,
    initialPending: { 'app:table': { revision: 'queued', updates: [{ recordId: 'a', sort: 10 }] } }
  });

  await handlers.onStartup();

  assert.ok(alarms.some((alarm) => alarm.name === 'chromeNav_pending_sort_retry'));
  assert.equal(alarms.some((alarm) => alarm.name === 'chromeNav_sync_alarm'), false);
});

test('同步旧排序期间提交的新排序保留在队列并接着同步', async () => {
  const firstBatch = deferred();
  const secondBatch = deferred();
  const batchCalls = [];
  const { handlers, pending } = createBackground({
    initialPending: {
      'app:table': { revision: 'rev-1', dataScope: 'app:table', updates: [{ recordId: 'a', sort: 10 }] },
      'old:table': { revision: 'other', dataScope: 'old:table', updates: [{ recordId: 'x', sort: 10 }] }
    },
    batchUpdateRecordSorts(updates) {
      batchCalls.push(updates);
      return batchCalls.length === 1 ? firstBatch.promise : secondBatch.promise;
    }
  });

  const oldFlush = sendMessage(handlers, { type: 'FLUSH_PENDING_SORT_SYNC', reason: 'test' });
  await waitFor(() => batchCalls.length === 1);

  const newPending = { revision: 'rev-2', dataScope: 'app:table', updates: [{ recordId: 'b', sort: 20 }] };
  const commit = await sendMessage(handlers, {
    type: 'COMMIT_NAV_DATA', data: { Code: [{ id: 'b', sort: 20 }] }, categories: ['Code'],
    dataScope: 'app:table', expectedRevision: 0, pendingSortSync: newPending
  });
  assert.equal(commit.success, true);

  firstBatch.resolve({ updated: true });
  const oldResult = await oldFlush;
  assert.equal(oldResult.cleared, false);
  assert.equal(oldResult.pending.revision, 'rev-2');
  await waitFor(() => batchCalls.length === 2);
  assert.equal(batchCalls[1][0].recordId, 'b');
  assert.equal(pending.get('app:table').revision, 'rev-2');

  secondBatch.resolve({ updated: true });
  await waitFor(() => !pending.has('app:table'));
  assert.equal(pending.get('old:table').revision, 'other');
});
