const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const optionsHtml = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');
const optionsJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'options.js'), 'utf8');
const optionsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'options.css'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const backgroundStorageJs = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'modules', 'background-storage.js'),
  'utf8'
);

test('背景设置提供可访问的浅色和深色标签及预览', () => {
  assert.match(optionsHtml, /class="background-theme-tabs" role="tablist"/);
  assert.match(optionsHtml, /data-theme-mode="light"/);
  assert.match(optionsHtml, /data-theme-mode="dark"/);
  assert.match(optionsHtml, /id="background-profile-panel" role="tabpanel"/);
  assert.match(optionsHtml, /id="background-preview"[^>]*role="img"/);
});

test('两个明暗模式分别维护草稿、待上传文件和保存状态', () => {
  assert.match(optionsJs, /backgroundDrafts = \{ light: null, dark: null \}/);
  assert.match(optionsJs, /pendingBackgroundFiles = \{ light: null, dark: null \}/);
  assert.match(optionsJs, /savedUploadStates = \{ light: false, dark: false \}/);
  assert.match(optionsJs, /clearBackgroundSettings\(activeBackgroundThemeMode\)/);
  assert.match(optionsJs, /clearUploadedBackground\(activeBackgroundThemeMode\)/);
});

test('上传图使用明暗模式独立键并清理旧单图记录', () => {
  assert.match(backgroundStorageJs, /`\$\{normalizeThemeMode\(themeMode\)\}Background`/);
  assert.match(backgroundStorageJs, /store\.delete\(LEGACY_KEY\)/);
  assert.match(backgroundStorageJs, /clearAllUploadedBackgrounds/);
});

test('背景标签和换图淡入尊重减少动态效果设置', () => {
  assert.match(optionsCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.background-theme-tab/);
  assert.match(styleCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.background-image-layer/);
});
