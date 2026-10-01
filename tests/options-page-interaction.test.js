const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function createPage() {
  const nodes = new Map();
  const groups = new Map();
  let focused;
  function node(id, attrs = {}) {
    const listeners = {};
    const classes = new Set();
    const result = {
      id, value: '', checked: false, disabled: false, hidden: false, type: 'text',
      textContent: '', dataset: {}, style: { setProperty(key, value) { this[key] = value; } },
      classList: {
        toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
        add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, contains: name => classes.has(name)
      },
      getAttribute: key => attrs[key],
      setAttribute(key, value) { attrs[key] = value; },
      removeAttribute(key) { delete attrs[key]; },
      addEventListener(key, fn) { (listeners[key] ||= []).push(fn); },
      async fire(key, event = {}) {
        for (const fn of listeners[key] || []) await fn({ target: result, currentTarget: result, preventDefault() {}, ...event });
      },
      focus() { focused = id; },
      querySelector() { return node(id + '-child'); },
      querySelectorAll() { return [...nodes.values()].filter(n => n.id.startsWith('background-')); }
    };
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('data-')) result.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
    nodes.set(id, result);
    return result;
  }
  const html = fs.readFileSync(path.join(__dirname, '../options.html'), 'utf8');
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) node(match[1]);
  for (const [selector, attribute, count] of [
    ['[data-wizard-panel]', 'data-wizard-panel', 3],
    ['[data-step-indicator]', 'data-step-indicator', 3],
    ['[data-next-step]', 'data-next-step', 2],
    ['[data-prev-step]', 'data-prev-step', 2]
  ]) {
    groups.set(selector, Array.from({ length: count }, (_, i) => node(selector + i, {
      [attribute]: String(attribute === 'data-next-step' ? i + 2 : i + 1)
    })));
  }
  groups.set('[data-check]', []);
  groups.set('.background-theme-tab', ['light', 'dark'].map(mode => node('background-tab-' + mode, { 'data-theme-mode': mode })));
  groups.set('input[name="background-mode"]', ['default', 'upload', 'url'].map(mode => {
    const radio = node('background-radio-' + mode); radio.value = mode; radio.checked = mode === 'default'; return radio;
  }));
  groups.set('.mode-option', ['default', 'upload', 'url'].map(mode => node('mode-' + mode, { 'data-mode': mode })));
  node('setup-wizard');
  nodes.get('app-secret').type = 'password';
  const defaults = { mode: 'default', url: '', size: 'cover', overlayOpacity: 0.38, blurPx: 0 };
  const calls = { tests: 0, saves: [], backgrounds: [] };
  const api = {
    testConnection: async () => { calls.tests++; return { success: true }; },
    clearTokenCache: async () => {}
  };
  const storage = {
    loadFeishuConfig: async () => null, getTestMode: async () => false,
    loadAllBackgroundSettings: async () => ({ profiles: { light: defaults, dark: defaults } }),
    normalizeBackgroundSettings: value => ({ ...defaults, ...value }),
    saveFeishuConfig: async config => calls.saves.push(config), clearNavCache: async () => {},
    saveTestMode: async () => {},
    saveBackgroundSettings: async (mode, settings) => { calls.backgrounds.push(mode); return settings; }
  };
  const document = {
    readyState: 'complete', getElementById: id => nodes.get(id) || null,
    querySelectorAll: selector => groups.get(selector) || [],
    querySelector(selector) {
      if (selector === '.setup-wizard') return nodes.get('setup-wizard');
      const mode = selector.match(/data-theme-mode="(light|dark)"/);
      return mode ? nodes.get('background-tab-' + mode[1]) : null;
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/options.js'), 'utf8'), {
    window: { BackgroundStorage: {} }, document, console: { log() {}, warn() {}, error() {} },
    Storage: storage, FeishuAPI: api, Blob,
    BackgroundStorage: { getUploadedBackground: async () => null },
    setTimeout: () => 1, clearTimeout() {}, confirm: () => true,
    URL: { createObjectURL() {}, revokeObjectURL() {} }
  });
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, groups, api, storage, calls, focused: () => focused };
}

function fill(page) {
  for (const id of ['app-id', 'app-secret', 'app-token', 'table-id']) page.nodes.get(id).value = 'synthetic-' + id;
}

test('顶部步骤可直接切换、保留已填内容并支持方向键', async () => {
  const page = await createPage();
  const tabs = page.groups.get('[data-step-indicator]');
  await tabs[1].fire('click');
  page.nodes.get('app-id').value = 'synthetic-id';
  await tabs[2].fire('click');
  assert.equal(page.groups.get('[data-wizard-panel]')[2].hidden, false);
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true');
  await tabs[2].fire('keydown', { key: 'ArrowLeft' });
  assert.equal(page.focused(), tabs[1].id);
  assert.equal(page.nodes.get('app-id').value, 'synthetic-id');
});

test('从检测步骤校验空表单会回到凭证步骤并聚焦首个缺失项', async () => {
  const page = await createPage();
  await page.groups.get('[data-step-indicator]')[2].fire('click');
  await page.nodes.get('save-btn').fire('click');
  assert.equal(page.focused(), 'app-id');
  assert.equal(page.nodes.get('app-id').getAttribute('aria-invalid'), 'true');
  assert.equal(page.nodes.get('app-id-error').hidden, false);
  assert.equal(page.groups.get('[data-wizard-panel]')[1].hidden, false);
  assert.equal(page.calls.tests, 0);
});

test('连接检测进行中阻止重复保存和编辑，完成后恢复操作', async () => {
  const page = await createPage(); fill(page);
  let complete;
  page.api.testConnection = () => { page.calls.tests++; return new Promise(resolve => { complete = resolve; }); };
  const pending = page.nodes.get('test-connection-btn').fire('click');
  assert.equal(page.nodes.get('save-btn').disabled, true);
  assert.equal(page.nodes.get('app-id').disabled, true);
  await page.nodes.get('save-btn').fire('click');
  assert.equal(page.calls.tests, 1);
  complete({ success: true }); await pending;
  assert.equal(page.nodes.get('save-btn').disabled, false);
  assert.equal(page.nodes.get('app-id').disabled, false);
});

test('保存背景期间锁定模式切换，保存结果仍属于原来的模式', async () => {
  const page = await createPage();
  let complete;
  page.storage.saveBackgroundSettings = (mode, settings) => {
    page.calls.backgrounds.push(mode);
    return new Promise(resolve => { complete = () => resolve(settings); });
  };
  const pending = page.nodes.get('background-save-btn').fire('click');
  await page.groups.get('.background-theme-tab')[1].fire('click');
  assert.equal(page.groups.get('.background-theme-tab')[1].disabled, true);
  assert.deepEqual(page.calls.backgrounds, ['light']);
  complete(); await pending;
  assert.equal(page.nodes.get('background-preview-badge').textContent, '浅色模式');
  assert.equal(page.groups.get('.background-theme-tab')[1].disabled, false);
});

test('清除缓存与测试模式反馈显示在各自卡片', async () => {
  const page = await createPage();
  await page.nodes.get('clear-cache-btn').fire('click');
  assert.match(page.nodes.get('data-status-message').textContent, /缓存已清除/);
  page.nodes.get('test-mode-toggle').checked = true;
  await page.nodes.get('test-mode-toggle').fire('change');
  assert.match(page.nodes.get('test-mode-status').textContent, /已启用/);
  assert.equal(page.nodes.get('save-btn').disabled, true);
  assert.equal(page.nodes.get('status-message').textContent, '');
});

test('背景草稿切换后保留图片链接和模糊值，预览同步更新', async () => {
  const page = await createPage();
  const radios = page.groups.get('input[name="background-mode"]');
  radios.forEach(radio => { radio.checked = radio.value === 'url'; });
  await radios[2].fire('change');
  page.nodes.get('background-url').value = 'https://example.com/synthetic.png';
  await page.nodes.get('background-url').fire('input');
  page.nodes.get('background-blur').value = '8';
  await page.nodes.get('background-blur').fire('input');
  assert.equal(page.nodes.get('background-preview-image').style.filter, 'blur(8px)');
  await page.groups.get('.background-theme-tab')[1].fire('click');
  await page.groups.get('.background-theme-tab')[0].fire('click');
  assert.equal(page.nodes.get('background-url').value, 'https://example.com/synthetic.png');
  assert.equal(page.nodes.get('background-blur').value, '8');
  assert.match(page.nodes.get('background-draft-status').textContent, /未保存/);
});

test('连接请求失败后恢复按钮和输入控件，保留错误反馈', async () => {
  const page = await createPage(); fill(page);
  page.api.testConnection = async () => { throw new Error('synthetic failure'); };
  await page.nodes.get('test-connection-btn').fire('click');
  assert.equal(page.nodes.get('app-id').disabled, false);
  assert.equal(page.nodes.get('save-btn').disabled, false);
  assert.match(page.nodes.get('status-message').textContent, /测试失败/);
});

test('测试模式已保存但清缓存失败时，控件仍反映已保存的模式', async () => {
  const page = await createPage();
  page.storage.clearNavCache = async () => { throw new Error('synthetic failure'); };
  page.nodes.get('test-mode-toggle').checked = true;
  await page.nodes.get('test-mode-toggle').fire('change');
  assert.equal(page.nodes.get('test-mode-toggle').checked, true);
  assert.equal(page.nodes.get('test-mode-toggle').disabled, false);
  assert.match(page.nodes.get('test-mode-status').textContent, /模式已切换/);
});
