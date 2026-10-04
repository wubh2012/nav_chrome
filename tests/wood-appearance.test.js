const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, createStore } = require('../js/modules/wood-appearance-core.js');

test('新标签页重建后从同一本地存储恢复外观，不污染导航配置', async () => {
  const saved = { chromeNav_navData: { existing: true } };
  const storage = { async get(key) { return { [key]: structuredClone(saved[key]) }; }, async set(items) { Object.assign(saved, structuredClone(items)); } };
  await createStore(storage).set('light', { wood: '#FFF0D5', fontWeight: 500, fontSize: 18, grain: 12 });
  const nextTab = await createStore(storage).get('light');
  assert.equal(nextTab.wood, '#fff0d5');
  assert.equal(nextTab.fontWeight, 500);
  assert.equal(nextTab.fontSize, 18);
  assert.equal(nextTab.grain, 12);
  assert.deepEqual(saved.chromeNav_navData, { existing: true });
  assert.equal((await createStore(storage).get('dark')).wood, '#46513d');
});

test('无效颜色、未知字段和越界字号不能写入外观参数', () => {
  const result = normalize({ wood: 'url(javascript:bad)', fontWeight: 9999, fontSize: -10, grain: 200, extra: 'bad' }, 'light');
  assert.equal(result.wood, '#f9e9cf');
  assert.equal(result.fontWeight, 800);
  assert.equal(result.fontSize, 14);
  assert.equal(result.grain, 100);
  assert.equal(Object.hasOwn(result, 'extra'), false);
});

test('存储写入失败会向调用方报告，不能假装已保存', async () => {
  const store = createStore({ async set() { throw new Error('quota'); } });
  await assert.rejects(store.set('light', {}), /quota/);
});
