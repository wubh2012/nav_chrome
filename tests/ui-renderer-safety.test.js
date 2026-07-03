const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const uiRendererSource = fs.readFileSync(
  path.join(projectRoot, 'js/modules/ui-renderer.js'),
  'utf8'
);

test('UIRenderer 不再把分类和站点字段拼接进 HTML 模板', () => {
  assert.equal(uiRendererSource.includes('data-category="${category}"'), false);
  assert.equal(uiRendererSource.includes('${tool.icon}'), false);
  assert.equal(uiRendererSource.includes('${escapeHtml(tool.name)}'), false);
  assert.equal(uiRendererSource.includes('menu.innerHTML'), false);
  assert.equal(uiRendererSource.includes('card.innerHTML'), false);
});
