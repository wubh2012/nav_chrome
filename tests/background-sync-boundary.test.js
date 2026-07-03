const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const backgroundSource = fs.readFileSync(path.join(projectRoot, 'js/background.js'), 'utf8');

test('后台同步不再依赖前台页面处理 TRIGGER_SYNC', () => {
  assert.equal(backgroundSource.includes("type: 'TRIGGER_SYNC'"), false);
  assert.equal(backgroundSource.includes('SyncService.syncNavigation'), true);
  assert.match(
    backgroundSource,
    /if \(message\.type === 'SYNC_NOW'\) \{[\s\S]*handleBackgroundSync/,
    'SYNC_NOW should be handled by the background sync path'
  );
});
