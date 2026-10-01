const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createTheme(preference) {
  const properties = {};
  const saved = [];
  const root = { dataset: {}, style: {
    setProperty(key, value) { properties[key] = value; }
  } };
  const context = {
    window: {}, console,
    CustomEvent: class {
      constructor(type, options) { this.type = type; this.detail = options.detail; }
    },
    document: { documentElement: root, querySelectorAll: () => [], querySelector: () => null,
      dispatchEvent() {} },
    Storage: {
      loadThemePreference: async () => preference,
      saveThemePreference: async (skin, mode) => saved.push({ skin, mode })
    },
    getComputedStyle: () => ({ getPropertyValue: key => properties[key] || '' })
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/modules/theme-manager.js'), 'utf8'), context);
  return { manager: context.window.ThemeManager, root, properties, saved };
}

test('旧霓虹主题迁移到石墨，保存偏好并保留深色模式', async () => {
  const { manager, root, saved } = createTheme({ skin: 'neon', mode: 'dark' });
  await manager.init();
  assert.deepEqual(root.dataset, { skin: 'graphite', theme: 'dark' });
  assert.deepEqual(saved, [{ skin: 'graphite', mode: 'dark' }]);
  assert.equal(root.style.colorScheme, 'dark');
});

test('主题切换保留模式、更新悬停色，明暗切换同步原生控件', async () => {
  const { manager, root, properties, saved } = createTheme({ skin: 'graphite', mode: 'dark' });
  await manager.init();
  await manager.setSkin('cream');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(properties['--card-hover-bg'], properties['--hover-surface']);
  assert.equal(properties['--card-hover-border'], properties['--hover-border']);
  assert.equal(properties['--card-hover-shadow'], properties['--hover-shadow']);
  manager.toggleMode();
  assert.deepEqual(root.dataset, { skin: 'cream', theme: 'light' });
  assert.equal(root.style.colorScheme, 'light');
  assert.deepEqual(saved.at(-1), { skin: 'cream', mode: 'light' });
  assert.equal(await manager.setSkin('neon'), false);
  assert.equal(root.dataset.skin, 'cream');
});

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

for (const skin of ['graphite', 'cream']) {
  test(`${skin} 深色文字和主按钮在关键背景上达到 4.5:1 对比度`, async () => {
    const { manager, properties } = createTheme({ skin, mode: 'dark' });
    await manager.init();
    for (const foreground of ['--text-primary', '--text-secondary', '--text-muted']) {
      for (const background of ['--page-bg', '--surface-input', '--surface-3', '--surface-raised']) {
        assert.ok(contrast(properties[foreground], properties[background]) >= 4.5,
          `${skin}: ${foreground} on ${background}`);
      }
    }
    for (const background of ['--accent-primary', '--accent-soft']) {
      assert.ok(contrast(properties['--on-accent'], properties[background]) >= 4.5);
    }
  });
}
