const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/modules/home-layout.js'), 'utf8');
function createManager(state, overrides = {}) {
  const context = {
    window: {},
    Storage: {
      async get(key) { return { [key]: state[key] }; },
      async set(items) { Object.assign(state, items); },
      ...overrides
    }
  };
  vm.runInNewContext(source, context);
  return context.window.HomeLayout;
}

test('没有偏好或偏好损坏时保留当前木牌布局', async () => {
  for (const value of [undefined, null, '', 'unknown', { layout: 'classic' }]) {
    assert.equal(await createManager({ chromeNav_homeLayout_v1: value }).load(), 'wooden');
  }
});

test('重建页面后恢复两种布局，切换仅写布局键，不修改网站及果园存档', async () => {
  const state = {
    chromeNav_navData: { Code: [{ id: 'github', name: 'GitHub', sort: 10 }] },
    chromeNav_pixelGarden_v1: { basket: 8 },
    chromeNav_theme: { skin: 'graphite', mode: 'dark' },
    chromeNav_pendingSortSync: { orderedIds: ['github'] }
  };
  const original = structuredClone(state);
  const manager = createManager(state);
  for (const layout of ['classic', 'wooden', 'classic']) {
    assert.equal(await manager.save(layout), layout);
    assert.equal(await createManager(state).load(), layout);
  }
  delete state.chromeNav_homeLayout_v1;
  assert.deepEqual(state, original);
});

test('保存失败会抛出错误，已有布局仍可恢复', async () => {
  const state = { chromeNav_homeLayout_v1: 'classic' };
  const manager = createManager(state, { async set() { throw new Error('storage unavailable'); } });
  await assert.rejects(manager.save('wooden'), /storage unavailable/);
  assert.equal(await createManager(state).load(), 'classic');
});

function createRenderer(layout) {
  const events = [];
  const context = {
    window: {},
    document: {
      body: { classList: { contains: name => name === layout } },
      getElementById: () => null,
      querySelectorAll: () => [],
      dispatchEvent: event => events.push(event)
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/modules/ui-renderer.js'), 'utf8') + '\nwindow.UIRenderer = UIRenderer;', context);
  return { renderer: context.window.UIRenderer, events };
}

test('经典布局的分类和相邻分类切换正常，导航快照保持全量数据', async () => {
  const { renderer, events } = createRenderer('classic-home');
  const data = { Code: [{ id: 'code' }], 学习: [{ id: 'study' }] };
  await renderer.init(data, ['Code', '学习'], {});
  renderer.switchCategory('Code');
  assert.equal(renderer.getCurrentCategory(), 'Code');
  assert.equal(renderer.switchAdjacentCategory(1), '学习');
  assert.equal(events.at(-1).detail.category, '学习');
  assert.deepEqual(JSON.parse(JSON.stringify(renderer.getNavDataSnapshot().data)), data);
});

test('木牌布局保持全量展示，内部分类切换和滚轮不能进入分类视图', async () => {
  const { renderer } = createRenderer('wooden-home');
  await renderer.init({ Code: [{ id: 'code' }], 学习: [{ id: 'study' }] }, ['Code', '学习'], {});
  renderer.switchCategory('Code');
  assert.equal(renderer.getCurrentCategory(), 'all');
  assert.equal(renderer.switchAdjacentCategory(1), null);
});
