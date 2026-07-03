const test = require('node:test');
const assert = require('node:assert/strict');

const SyncService = require('../js/modules/sync-service.js');

function createStorageMock(overrides = {}) {
  const calls = {
    statuses: [],
    savedNavData: []
  };

  return {
    calls,
    getTestMode: async () => overrides.testMode || false,
    loadFeishuConfig: async () => overrides.feishuConfig || null,
    saveSyncStatus: async (status, message) => {
      calls.statuses.push({ status, message });
    },
    saveNavData: async (data, categories, dateInfo) => {
      calls.savedNavData.push({ data, categories, dateInfo });
    }
  };
}

test('同步核心在测试模式下跳过飞书请求并写入空闲状态', async () => {
  const Storage = createStorageMock({ testMode: true });
  let requested = false;
  const FeishuAPI = {
    getRecords: async () => {
      requested = true;
      return { success: true };
    }
  };

  const result = await SyncService.syncNavigation({
    deps: { Storage, FeishuAPI },
    reason: 'test'
  });

  assert.equal(result.success, true);
  assert.equal(result.skipped, true);
  assert.equal(requested, false);
  assert.deepEqual(Storage.calls.statuses.at(-1), {
    status: 'idle',
    message: '测试模式，跳过飞书同步'
  });
});

test('同步核心在飞书未完整配置时跳过并写入错误状态', async () => {
  const Storage = createStorageMock({
    feishuConfig: { appId: 'cli_xxx', appSecret: 'secret' }
  });
  const FeishuAPI = {
    getRecords: async () => {
      throw new Error('should not request');
    }
  };

  const result = await SyncService.syncNavigation({
    deps: { Storage, FeishuAPI },
    reason: 'manual'
  });

  assert.equal(result.success, false);
  assert.equal(result.skipped, true);
  assert.equal(result.error, '未配置完整飞书凭证');
  assert.deepEqual(Storage.calls.statuses.at(-1), {
    status: 'error',
    message: '未配置完整飞书凭证'
  });
});

test('同步核心成功拉取飞书数据、保存缓存并记录成功状态', async () => {
  const navData = { 工具: [{ id: '1', name: 'Docs', url: 'https://example.com' }] };
  const categories = ['工具'];
  const dateInfo = { date: '6月30日' };
  const Storage = createStorageMock({
    feishuConfig: {
      appId: 'cli_xxx',
      appSecret: 'secret',
      appToken: 'app_token',
      tableId: 'tbl_xxx'
    }
  });
  const flushCalls = [];
  const FeishuAPI = {
    getRecords: async () => ({
      success: true,
      data: navData,
      categories,
      dateInfo
    })
  };

  const result = await SyncService.syncNavigation({
    deps: { Storage, FeishuAPI },
    flushPendingSortSync: async (reason) => {
      flushCalls.push(reason);
      return { success: true, cleared: true };
    },
    reason: 'background-sync'
  });

  assert.equal(result.success, true);
  assert.equal(result.skipped, false);
  assert.deepEqual(flushCalls, ['background-sync']);
  assert.deepEqual(Storage.calls.savedNavData, [{ data: navData, categories, dateInfo }]);
  assert.deepEqual(Storage.calls.statuses, [
    { status: 'syncing', message: '同步中...' },
    { status: 'success', message: '同步成功' }
  ]);
});

test('同步核心在飞书失败时保存错误状态并返回失败结果', async () => {
  const Storage = createStorageMock({
    feishuConfig: {
      appId: 'cli_xxx',
      appSecret: 'secret',
      appToken: 'app_token',
      tableId: 'tbl_xxx'
    }
  });
  const FeishuAPI = {
    getRecords: async () => {
      throw new Error('飞书超时');
    }
  };

  const result = await SyncService.syncNavigation({
    deps: { Storage, FeishuAPI },
    reason: 'periodic'
  });

  assert.equal(result.success, false);
  assert.equal(result.error, '飞书超时');
  assert.deepEqual(Storage.calls.savedNavData, []);
  assert.deepEqual(Storage.calls.statuses.at(-1), {
    status: 'error',
    message: '飞书超时'
  });
});
