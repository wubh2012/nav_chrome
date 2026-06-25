/**
 * UI 渲染纯逻辑测试
 *
 * 职责与边界：验证分类优先级排序与“全部分类”视图的扁平化顺序；
 * 不测试浏览器 DOM、动画、事件绑定或 Chrome Extension API。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCategoryPriority,
  sortCategoriesByPriority,
  flattenToolsByCategoryPriority
} = require('../js/modules/ui-renderer-core.js');

test('固定分类命中预设优先级，未指定分类落到其他档', () => {
  assert.equal(getCategoryPriority('主页'), 1);
  assert.equal(getCategoryPriority('AI'), 2);
  assert.equal(getCategoryPriority('Code'), 3);
  assert.equal(getCategoryPriority('工具'), 4);
  assert.equal(getCategoryPriority('影视'), 5);
});

test('分类列表按 主页 → AI → Code → 其他 → 影视 排序', () => {
  const result = sortCategoriesByPriority(['影视', '工具', 'AI', '主页', 'Code', '设计']);

  assert.deepEqual(result, ['主页', 'AI', 'Code', '工具', '设计', '影视']);
});

test('全部分类视图按分类优先级展开，分类内保持原有顺序', () => {
  const result = flattenToolsByCategoryPriority({
    工具: [
      { id: 'tool-2', name: 'Tool B', sort: 2 },
      { id: 'tool-8', name: 'Tool A', sort: 8 }
    ],
    影视: [
      { id: 'movie-1', name: 'Movie', sort: 1 }
    ],
    Code: [
      { id: 'code-3', name: 'Code', sort: 3 }
    ],
    主页: [
      { id: 'home-5', name: 'Home', sort: 5 }
    ],
    AI: [
      { id: 'ai-4', name: 'AI', sort: 4 }
    ]
  });

  assert.deepEqual(
    result.map((item) => `${item.category}:${item.id}`),
    ['主页:home-5', 'AI:ai-4', 'Code:code-3', '工具:tool-2', '工具:tool-8', '影视:movie-1']
  );
});
