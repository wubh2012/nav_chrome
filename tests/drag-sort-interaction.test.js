const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeClassList() {
  const values = new Set();
  return {
    add: (...items) => items.forEach((item) => values.add(item)),
    remove: (...items) => items.forEach((item) => values.delete(item)),
    contains: (item) => values.has(item),
    toggle(item, force) {
      const enabled = force === undefined ? !values.has(item) : Boolean(force);
      enabled ? values.add(item) : values.delete(item);
      return enabled;
    }
  };
}

test('整理按钮在全部列表开启和关闭拖动', async () => {
  const cards = ['a', 'b'].map((id) => ({
    attributes: { 'data-id': id },
    classList: makeClassList(),
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name] || null; }
  }));
  const grid = {
    classList: makeClassList(),
    addEventListener() {},
    querySelectorAll: () => cards
  };
  const bodyListeners = new Map();
  const body = {
    classList: makeClassList(),
    addEventListener(type, handler) { bodyListeners.set(type, handler); },
    dispatchEvent(event) { bodyListeners.get(event.type)?.(event); }
  };
  const documentListeners = new Map();
  let clickHandler;
  const button = {
    setAttribute() {},
    addEventListener(type, handler) { if (type === 'click') clickHandler = handler; },
    querySelector: () => ({ className: '' })
  };
  const context = vm.createContext({
    console: { log() {}, warn() {} },
    document: {
      body,
      getElementById: (id) => ({ 'tools-grid': grid, 'manage-sites-btn': button }[id] || null),
      addEventListener(type, handler) { documentListeners.set(type, handler); }
    },
    window: { addEventListener() {} },
    Storage: { loadPendingSortSync: async () => null },
    UIRenderer: { getCurrentCategory: () => 'all' },
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } }
  });
  const root = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'js/modules/drag-sort-core.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/modules/drag-sort-manager.js'), 'utf8'), context);
  vm.runInContext('DragSortManager.init();', context);

  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const start = app.indexOf('  function bindPageActions()');
  const end = app.indexOf('\n  /**', start);
  assert.ok(start >= 0 && end > start, 'app should expose the page-action binding function');
  vm.runInContext(`${app.slice(start, end)}\nbindPageActions();`, context);

  assert.deepEqual(cards.map((card) => card.getAttribute('draggable')), ['false', 'false']);
  clickHandler();
  assert.equal(body.classList.contains('site-manage-mode'), true);
  assert.deepEqual(cards.map((card) => card.getAttribute('draggable')), ['true', 'true']);

  clickHandler();
  assert.equal(body.classList.contains('site-manage-mode'), false);
  assert.deepEqual(cards.map((card) => card.getAttribute('draggable')), ['false', 'false']);
});
