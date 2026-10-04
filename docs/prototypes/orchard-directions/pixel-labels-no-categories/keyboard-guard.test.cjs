// 使用真实搜索管理器，验证浏览器默认查找与自定义搜索的键盘冲突。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page() {
  const listeners = [];
  const elements = new Map();
  const document = {
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
  const context = vm.createContext({ document, window: {}, console: { log() {}, warn() {} }, Date });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../../../js/modules/quick-search-manager.js'), 'utf8'), context);
  const guard = path.join(__dirname, 'keyboard-guard.js');
  if (fs.existsSync(guard)) vm.runInContext(fs.readFileSync(guard, 'utf8'), context);
  context.window.QuickSearchManager.init();
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
  return { key, elements, nativeFind: () => nativeFind };
}

test('长按 Ctrl+F 后一次 Esc 即关闭，不打开浏览器自带查找', () => {
  const p = page();
  p.key('f', { ctrlKey: true });
  p.key('f', { ctrlKey: true, repeat: true });
  p.key('Escape');
  assert.equal(p.elements.get('quick-search-modal').classList.contains('active'), false);
  assert.equal(p.nativeFind(), false);
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
