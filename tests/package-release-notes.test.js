const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const packageSource = fs.readFileSync(path.join(root, 'scripts', 'package-extension.js'), 'utf8');

test('当前版本包含匹配的 Chrome Web Store 发布说明', () => {
  const releaseNotesPath = path.join(
    root,
    'docs',
    `chrome-web-store-release-${manifest.version}.md`
  );
  assert.equal(fs.existsSync(releaseNotesPath), true);

  const releaseNotes = fs.readFileSync(releaseNotesPath, 'utf8');
  assert.equal(releaseNotes.includes(`版本号：\`${manifest.version}\``), true);
  assert.equal(releaseNotes.includes(`shuiguo-nav-chrome-${manifest.version}.zip`), true);
});

test('商店打包脚本强制检查版本发布说明', () => {
  assert.match(packageSource, /chrome-web-store-release-\$\{version\}\.md/);
  assert.match(packageSource, /Chrome Web Store release notes are required/);
  assert.match(packageSource, /Release notes do not match manifest version/);
});
