/**
 * 拖拽排序纯逻辑测试
 *
 * 职责与边界：验证分类内重排、待同步排序负载和本地脏顺序覆盖逻辑；
 * 不测试 DOM 拖拽事件、Chrome API、定时器调度或网络请求。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  reorderCategoryItems,
  applyPendingSortToNavData,
  createPendingSortPayload,
  getPendingSyncDelay,
  markPendingSortFailure
} = require('../js/modules/drag-sort-core.js');

test('按拖拽结果重排分类并只生成最小远程更新集', () => {
  const result = reorderCategoryItems(
    [
      { id: 'a', name: 'A', sort: 10 },
      { id: 'b', name: 'B', sort: 20 },
      { id: 'c', name: 'C', sort: 30 }
    ],
    ['b', 'a', 'c']
  );

  assert.deepEqual(
    result.reorderedItems.map((item) => `${item.id}:${item.sort}`),
    ['b:10', 'a:20', 'c:30']
  );
  assert.deepEqual(result.updates, [
    { recordId: 'b', sort: 10 },
    { recordId: 'a', sort: 20 }
  ]);
});

test('待同步排序负载保留分类和顺序，恢复延时按 5 秒防抖计算', () => {
  const payload = createPendingSortPayload(
    '工具',
    ['b', 'a', 'c'],
    [{ recordId: 'b', sort: 10 }],
    10_000
  );

  assert.equal(payload.category, '工具');
  assert.deepEqual(payload.orderedIds, ['b', 'a', 'c']);
  assert.equal(payload.status, 'queued');
  assert.equal(getPendingSyncDelay(payload.updatedAt, 13_000, 5_000), 2_000);
  assert.equal(getPendingSyncDelay(payload.updatedAt, 16_000, 5_000), 0);
});

test('同步失败时保留待同步记录并累加重试次数', () => {
  const failed = markPendingSortFailure({
    category: '工具',
    orderedIds: ['b', 'a'],
    updates: [{ recordId: 'b', sort: 10 }],
    updatedAt: 20_000,
    retryCount: 1,
    status: 'syncing'
  }, 'network timeout');

  assert.equal(failed.retryCount, 2);
  assert.equal(failed.status, 'error');
  assert.equal(failed.lastError, 'network timeout');
  assert.deepEqual(failed.orderedIds, ['b', 'a']);
});

test('存在待同步排序时，用本地顺序覆盖远端刷新结果', () => {
  const data = {
    工具: [
      { id: 'c', name: 'C', sort: 10 },
      { id: 'b', name: 'B', sort: 20 },
      { id: 'a', name: 'A', sort: 30 },
      { id: 'd', name: 'D', sort: 40 }
    ],
    Code: [
      { id: 'gh', name: 'GitHub', sort: 10 }
    ]
  };

  const merged = applyPendingSortToNavData(data, {
    category: '工具',
    orderedIds: ['b', 'a', 'c']
  });

  assert.deepEqual(
    merged.工具.map((item) => `${item.id}:${item.sort}`),
    ['b:10', 'a:20', 'c:30', 'd:40']
  );
  assert.deepEqual(
    merged.Code.map((item) => item.id),
    ['gh']
  );
});
