const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

function extractFunction(name) {
  const start = appSource.indexOf(`  async function ${name}()`);
  const end = appSource.indexOf('\n  /**', start);
  assert.ok(start >= 0 && end > start, `${name} should remain a named app function`);
  return appSource.slice(start, end);
}

test('测试模式优先恢复隔离缓存，避免每次打开都覆盖本地排序', async () => {
  const cached = { data: { Code: [{ id: 'local-order', sort: 10 }] }, categories: ['Code'], dateInfo: null, revision: 4 };
  let saved = false;
  let rendered = null;
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Storage: {
      async loadNavData(scope) { assert.equal(scope, 'test-mode'); return cached; },
      async loadPendingSortSync() { return null; },
      async saveNavData() { saved = true; }
    },
    FeishuAPI: {
      getMockData() { throw new Error('should use isolated cache'); },
      getMockDateInfo() { return null; }
    },
    UIRenderer: { showSyncStatus() {} },
    window: {},
    getCurrentDateInfo: (value) => value,
    renderResolvedNavigation: async (...args) => { rendered = args; }
  });
  vm.runInContext(`${extractFunction('loadTestData')}\nloadTestData();`, context);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(saved, false);
  assert.equal(rendered[0], cached.data);
  assert.equal(rendered[4], 4);
  assert.equal(rendered[5], 'test-mode');
});

test('首次飞书读取用修订号提交，冲突时显示另一个标签页的最新缓存', async () => {
  const current = { data: { AI: [{ id: 'latest', sort: 10 }] }, categories: ['AI'], dateInfo: null, revision: 2 };
  let committedData;
  let rendered = null;
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Storage: {
      async loadFeishuConfig() { return { appToken: 'app', tableId: 'table' }; },
      async getNavDataRevision(scope) { assert.equal(scope, 'app:table'); return 1; },
      async loadPendingSortSync() { return null; },
      async commitNavData(data, _categories, _dateInfo, options) {
        committedData = data;
        assert.equal(options.expectedRevision, 1);
        return { success: false, conflict: true, current };
      },
      async loadNavData() { throw new Error('commit should carry the current cache'); }
    },
    FeishuAPI: {
      async getRecords() {
        return { data: { Code: [{ id: 'stale-remote', sort: 10 }] }, categories: ['Code'], dateInfo: null };
      }
    },
    UIRenderer: { showSyncStatus() {} },
    window: {},
    globalThis: null,
    getCurrentDateInfo: (value) => value,
    renderResolvedNavigation: async (...args) => { rendered = args; }
  });
  context.globalThis = context;
  vm.runInContext(`${extractFunction('loadFeishuData')}\nloadFeishuData();`, context);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(committedData.Code[0].id, 'stale-remote');
  assert.equal(rendered[0], current.data);
  assert.equal(rendered[4], 2);
  assert.equal(rendered[5], 'app:table');
});
