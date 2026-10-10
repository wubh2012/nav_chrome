// 使用真实搜索管理器，验证浏览器默认查找与自定义搜索的键盘冲突。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page({ loadingApp = false, tabId = 1 } = {}) {
  const listeners = [];
  const commandListeners = [];
  let focusRequests = 0;
  const elements = new Map();
  const document = {
    readyState: 'complete',
    activeElement: { isConnected: true, focus() {} },
    getElementById(id) {
      if (!elements.has(id)) {
        const classes = new Set();
        elements.set(id, { value: '', style: {}, innerHTML: '',
          classList: { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key) },
          addEventListener() {}, setAttribute() {}, focus() {}, blur() {}, select() {} });
      }
      return elements.get(id);
    },
    querySelector() { return null; },
    addEventListener(type, callback) { if (type === 'keydown') listeners.push(callback); }
  };
  const HomeLayout = { init: () => new Promise(() => {}) };
  const context = vm.createContext({ document, window: { HomeLayout, focus() { focusRequests++; } }, HomeLayout,
    chrome: {
      commands: { onCommand: { addListener(callback) { commandListeners.push(callback); } } },
      tabs: { async getCurrent() { return { id: tabId, active: true }; } }
    },
    console: { log() {}, warn() {}, error() {} }, Date });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../js/modules/quick-search-manager.js'), 'utf8'), context);
  const guard = path.resolve(__dirname, '../js/modules/home-keyboard.js');
  if (fs.existsSync(guard)) vm.runInContext(fs.readFileSync(guard, 'utf8'), context);
  if (loadingApp) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8'), context);
  } else {
    context.window.QuickSearchManager.init();
  }
  let nativeFind = false;
  function key(key, options = {}) {
    // 浏览器自带查找开启时，先消费 Esc，页面收不到第一次 Esc。
    if (key === 'Escape' && nativeFind) { nativeFind = false; return; }
    const event = { key, ctrlKey: false, altKey: false, metaKey: false, repeat: false,
      defaultPrevented: false, stopped: false, ...options,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; } };
    for (const listener of listeners) { listener(event); if (event.stopped) break; }
    if (event.ctrlKey && key.toLowerCase() === 'f' && !event.defaultPrevented) nativeFind = true;
    return event;
  }
  return { key, elements, nativeFind: () => nativeFind, focusRequests: () => focusRequests,
    async command(command, targetTabId) {
      for (const listener of commandListeners) await listener(command, { id: targetTabId });
    }
  };
}

test('长按 Ctrl+F 后一次 Esc 即关闭，不打开浏览器自带查找', () => {
  const p = page();
  p.key('f', { ctrlKey: true });
  p.key('f', { ctrlKey: true, repeat: true });
  p.key('Escape');
  assert.equal(p.elements.get('quick-search-modal').classList.contains('active'), false);
  assert.equal(p.nativeFind(), false);
});

test('新标签页仍在加载布局和数据时，双击 Shift 已可打开搜索', () => {
  const p = page({ loadingApp: true });
  p.key('Shift');
  p.key('Shift');
  assert.equal(p.elements.get('quick-search-modal')?.classList.contains('active'), true);
});

test('焦点在地址栏、页面未收到 keydown 时，浏览器命令仍可打开搜索', async () => {
  const p = page({ loadingApp: true });
  await p.command('open-quick-search', 1);
  assert.equal(p.elements.get('quick-search-modal').classList.contains('active'), true);
  assert.equal(p.focusRequests(), 1);
});

test('浏览器命令只打开命令所在标签页的搜索，不唤起其他新标签页', async () => {
  const target = page({ tabId: 1 });
  const other = page({ tabId: 2 });
  await target.command('open-quick-search', 1);
  await other.command('open-quick-search', 1);
  await other.command('unrelated-command', 2);
  assert.equal(target.elements.get('quick-search-modal').classList.contains('active'), true);
  assert.equal(other.elements.get('quick-search-modal').classList.contains('active'), false);
  assert.equal(other.focusRequests(), 0);
});

test('搜索已打开时再次使用浏览器命令保留已输入的关键字', async () => {
  const p = page();
  await p.command('open-quick-search', 1);
  p.elements.get('quick-search-input').value = '小红书';
  await p.command('open-quick-search', 1);
  assert.equal(p.elements.get('quick-search-input').value, '小红书');
});

test('搜索已打开时再次 Ctrl+F 保留输入，并且一次 Esc 即关闭', () => {
  const p = page();
  p.key('f', { ctrlKey: true });
  p.elements.get('quick-search-input').value = '小红书';
  const event = p.key('F', { ctrlKey: true });
  assert.equal(event.defaultPrevented, true);
  assert.equal(p.elements.get('quick-search-input').value, '小红书');
  p.key('Escape');
  assert.equal(p.elements.get('quick-search-modal').classList.contains('active'), false);
});
