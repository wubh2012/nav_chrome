const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'modules', 'background-manager.js'),
  'utf8'
);

function createClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name)
  };
}

function createStyle() {
  return {
    setProperty(name, value) {
      this[name] = value;
    }
  };
}

function createEnvironment() {
  const listeners = {};
  const images = [];
  const loadCalls = [];
  const saveCalls = [];
  const imageLayer = { style: createStyle(), classList: createClassList() };
  const overlayLayer = { style: createStyle() };
  const body = { classList: createClassList() };
  let currentMode = 'light';

  class TestImage {
    constructor() {
      images.push(this);
    }
    set src(value) {
      this.source = value;
    }
  }

  class TestCustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }

  const document = {
    body,
    documentElement: { dataset: { theme: 'light' } },
    querySelector(selector) {
      return selector === '.background-image-layer' ? imageLayer : overlayLayer;
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    dispatchEvent(event) {
      listeners[event.type]?.(event);
    }
  };
  const Storage = {
    async loadBackgroundSettings(mode) {
      loadCalls.push(mode);
      return {
        mode: 'url',
        url: `https://example.com/${mode}-${loadCalls.length}.jpg`,
        overlayOpacity: 0.4,
        blurPx: 0,
        size: 'cover',
        position: 'center center'
      };
    },
    async saveBackgroundSettings(mode, settings) {
      saveCalls.push({ mode, settings });
      return settings;
    }
  };
  const ThemeManager = { getCurrentMode: () => currentMode };
  const context = {
    window: { Storage, ThemeManager },
    document,
    Storage,
    ThemeManager,
    BackgroundStorage: {},
    Image: TestImage,
    CustomEvent: TestCustomEvent,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    requestAnimationFrame: (callback) => callback(),
    Blob,
    console
  };
  vm.runInNewContext(source, context);

  return {
    manager: context.window.BackgroundManager,
    document,
    images,
    loadCalls,
    saveCalls,
    imageLayer,
    setCurrentMode(mode) {
      currentMode = mode;
    }
  };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('切换皮肤不重载背景，切换明暗模式加载对应档案', async () => {
  const env = createEnvironment();
  const initPromise = env.manager.init();
  await flush();
  env.images[0].onload();
  await initPromise;

  env.document.dispatchEvent({
    type: 'chromeNav:themeChanged',
    detail: { skin: 'neon', mode: 'light' }
  });
  await flush();
  assert.deepEqual(env.loadCalls, ['light']);

  env.document.dispatchEvent({
    type: 'chromeNav:themeChanged',
    detail: { skin: 'neon', mode: 'dark' }
  });
  await flush();
  assert.deepEqual(env.loadCalls, ['light', 'dark']);
});

test('快速连续切换时过期图片不会覆盖当前背景', async () => {
  const env = createEnvironment();
  const initPromise = env.manager.init();
  await flush();
  env.images[0].onload();
  await initPromise;

  env.document.dispatchEvent({ type: 'chromeNav:themeChanged', detail: { mode: 'dark' } });
  await flush();
  env.document.dispatchEvent({ type: 'chromeNav:themeChanged', detail: { mode: 'light' } });
  await flush();

  env.images[1].onload();
  env.images[2].onload();

  assert.match(env.imageLayer.style.backgroundImage, /light-3\.jpg/);
  assert.equal(env.imageLayer.classList.contains('is-visible'), true);
});

test('目标模式图片加载失败时只重置该模式', async () => {
  const env = createEnvironment();
  const initPromise = env.manager.init();
  await flush();
  env.images[0].onload();
  await initPromise;

  env.document.dispatchEvent({ type: 'chromeNav:themeChanged', detail: { mode: 'dark' } });
  await flush();
  await env.images[1].onerror();

  assert.equal(env.saveCalls.length, 1);
  assert.equal(env.saveCalls[0].mode, 'dark');
  assert.equal(env.saveCalls[0].settings.mode, 'default');
});
