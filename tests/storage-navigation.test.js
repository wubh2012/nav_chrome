const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createStorage() {
  const state = {};
  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(keys, callback) {
          const result = keys == null ? { ...state } : Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys]).filter((key) => key in state).map((key) => [key, state[key]])
          );
          callback(result);
        },
        set(values, callback) { Object.assign(state, values); callback(); },
        remove(keys, callback) { (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete state[key]); callback(); },
        clear(callback) { Object.keys(state).forEach((key) => delete state[key]); callback(); }
      }
    }
  };
  const context = vm.createContext({ chrome, console: { log() {}, warn() {}, error() {} }, Date });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/modules/storage.js'), 'utf8'), context);
  return { storage: context.Storage, state };
}

test('导航缓存按数据表隔离，并拒绝覆盖新修订', async () => {
  const { storage } = createStorage();
  const first = await storage.commitNavData({ 工具: [{ id: 'a', sort: 10 }] }, ['工具'], null, {
    expectedRevision: 0, dataScope: 'table-a', localOnly: true
  });
  assert.equal(first.success, true);
  assert.equal(first.revision, 1);

  const second = await storage.commitNavData({ Code: [{ id: 'b', sort: 10 }] }, ['Code'], null, {
    expectedRevision: 0, dataScope: 'table-b', localOnly: true
  });
  assert.equal(second.success, true);
  assert.equal((await storage.loadNavData('table-a')).data.工具[0].id, 'a');
  assert.equal((await storage.loadNavData('table-b')).data.Code[0].id, 'b');

  const stale = await storage.commitNavData({ 工具: [] }, ['工具'], null, {
    expectedRevision: 0, dataScope: 'table-a', localOnly: true
  });
  assert.equal(stale.conflict, true);
  assert.equal((await storage.loadNavData('table-a')).data.工具[0].id, 'a');
});

test('清除导航缓存保留待同步排序任务', async () => {
  const { storage } = createStorage();
  await storage.savePendingSortSync({
    version: 2, scope: 'global', dataScope: 'table-a', revision: 'rev-1',
    orderedIds: ['a'], updates: [{ recordId: 'a', sort: 10 }]
  }, 'table-a');
  await storage.commitNavData({ 工具: [{ id: 'a', sort: 10 }] }, ['工具'], null, {
    expectedRevision: 0, dataScope: 'table-a', localOnly: true
  });

  await storage.clearNavCache();

  assert.equal(await storage.loadNavData('table-a'), null);
  assert.equal((await storage.loadPendingSortSync('table-a')).revision, 'rev-1');
});

test('不传范围读取同步时间时使用当前飞书数据表的缓存', async () => {
  const { storage } = createStorage();
  await storage.saveNavData({}, [], null, { dataScope: 'app-a:table-a', syncTime: 111 });
  await storage.saveNavData({}, [], null, { dataScope: 'app-b:table-b', syncTime: 222 });
  await storage.saveFeishuConfig({ appToken: 'app-b', tableId: 'table-b' });

  assert.equal(await storage.getSyncTime(), 222);
});
