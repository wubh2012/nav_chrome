const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'modules', 'background-config.js'),
  'utf8'
);

function createEnvironment(initialValue, themeMode = 'light') {
  const data = initialValue ? { chromeNav_backgroundSettings: initialValue } : {};
  const migrationCalls = [];
  const Storage = {
    KEYS: {},
    async get(key) {
      return { [key]: data[key] };
    },
    async set(values) {
      Object.assign(data, values);
    },
    async remove(key) {
      delete data[key];
    },
    async loadThemePreference() {
      return { skin: 'cream', mode: themeMode };
    }
  };
  const BackgroundStorage = {
    async migrateLegacyUploadedBackground(mode) {
      migrationCalls.push(mode);
    }
  };
  const context = {
    window: { Storage, BackgroundStorage },
    Storage,
    BackgroundStorage,
    console
  };

  vm.runInNewContext(source, context);
  return { Storage, data, migrationCalls };
}

test('旧单背景配置迁移到升级时的当前明暗模式', async () => {
  const legacy = {
    mode: 'url',
    url: ' https://example.com/dark.jpg ',
    overlayOpacity: 0.6,
    blurPx: 7,
    size: 'contain',
    position: 'center center'
  };
  const { Storage, data } = createEnvironment(legacy, 'dark');

  const settings = await Storage.loadAllBackgroundSettings();

  assert.equal(settings.version, 2);
  assert.equal(settings.profiles.light.mode, 'default');
  assert.equal(settings.profiles.dark.mode, 'url');
  assert.equal(settings.profiles.dark.url, 'https://example.com/dark.jpg');
  assert.equal(data.chromeNav_backgroundSettings.version, 2);
});

test('旧上传图只请求迁移到当前模式', async () => {
  const { Storage, migrationCalls } = createEnvironment({ mode: 'upload' }, 'dark');

  await Storage.loadBackgroundSettings('light');

  assert.deepEqual(migrationCalls, ['dark']);
});

test('浅色和深色配置可独立保存与重置并规范化非法值', async () => {
  const { Storage } = createEnvironment(null, 'light');

  await Storage.saveBackgroundSettings('dark', {
    mode: 'url',
    url: ' https://example.com/night.jpg ',
    overlayOpacity: 3,
    blurPx: -4,
    size: 'invalid'
  });
  await Storage.saveBackgroundSettings('light', {
    mode: 'upload',
    overlayOpacity: 0.2,
    blurPx: 4
  });

  const dark = await Storage.loadBackgroundSettings('dark');
  const light = await Storage.loadBackgroundSettings('light');
  assert.equal(dark.url, 'https://example.com/night.jpg');
  assert.equal(dark.overlayOpacity, 0.85);
  assert.equal(dark.blurPx, 0);
  assert.equal(dark.size, 'cover');
  assert.equal(light.mode, 'upload');

  await Storage.clearBackgroundSettings('dark');
  assert.equal((await Storage.loadBackgroundSettings('dark')).mode, 'default');
  assert.equal((await Storage.loadBackgroundSettings('light')).mode, 'upload');
});

test('非法明暗模式按浅色模式处理', async () => {
  const { Storage } = createEnvironment(null, 'light');
  await Storage.saveBackgroundSettings('sepia', { mode: 'url', url: 'https://example.com/light.jpg' });

  assert.equal((await Storage.loadBackgroundSettings('light')).url, 'https://example.com/light.jpg');
  assert.equal((await Storage.loadBackgroundSettings('dark')).mode, 'default');
});
