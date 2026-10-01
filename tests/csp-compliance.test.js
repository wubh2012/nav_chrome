const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const extensionPages = ['newtab.html', 'options.html', 'popup.html'];
const sourceScriptsDir = path.join(projectRoot, 'js');

function collectJavaScriptFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectJavaScriptFiles(fullPath);
    }
    return entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

test('扩展页面不包含内联 script 标签', () => {
  const inlineScriptPattern = /<script(?![^>]*\bsrc=)[^>]*>/i;

  extensionPages.forEach((relativePath) => {
    const content = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    assert.equal(
      inlineScriptPattern.test(content),
      false,
      `${relativePath} contains an inline <script> block`
    );
  });
});

test('设置页样式放在外部 CSS 文件中', () => {
  const optionsContent = fs.readFileSync(path.join(projectRoot, 'options.html'), 'utf8');
  const optionsCssPath = path.join(projectRoot, 'css/options.css');

  assert.equal(/<style\b/i.test(optionsContent), false, 'options.html contains an inline <style> block');
  assert.equal(
    /<link rel="stylesheet" href="css\/options\.css">/i.test(optionsContent),
    true,
    'options.html does not reference css/options.css'
  );
  assert.equal(fs.existsSync(optionsCssPath), true, 'css/options.css is missing');
});

test('源码里不出现内联事件处理属性', () => {
  const inlineHandlerPattern = /<[^>]+\son[a-z]+\s*=/i;
  const filesToCheck = [
    ...extensionPages.map((relativePath) => path.join(projectRoot, relativePath)),
    ...collectJavaScriptFiles(sourceScriptsDir)
  ];

  filesToCheck.forEach((fullPath) => {
    const content = fs.readFileSync(fullPath, 'utf8');
    assert.equal(
      inlineHandlerPattern.test(content),
      false,
      `${path.relative(projectRoot, fullPath)} contains an inline event handler`
    );
  });
});
