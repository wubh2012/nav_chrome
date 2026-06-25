/**
 * UI 渲染纯逻辑模块
 *
 * 职责与边界：提供分类优先级排序与“全部分类”视图的扁平化顺序计算；
 * 不负责 DOM 渲染、事件绑定、Chrome Extension API 或存储读写。
 * 关键副作用：无外部副作用；仅根据入参返回排序结果。
 */
(function(root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.UIRendererCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : null, function() {
  'use strict';

  const CATEGORY_PRIORITY = Object.freeze({
    '主页': 1,
    'AI': 2,
    'Code': 3,
    '影视': 5
  });

  const DEFAULT_PRIORITY = 4;
  const CATEGORY_LOCALE = 'zh-Hans-CN';

  /**
   * 获取分类优先级。
   * @param {string} category - 分类名称。
   * @returns {number} 数字越小优先级越高。
   */
  function getCategoryPriority(category) {
    const normalized = String(category || '').trim();
    return CATEGORY_PRIORITY[normalized] || DEFAULT_PRIORITY;
  }

  /**
   * 按统一优先级排序分类。
   * @param {Array<string>} categories - 待排序分类列表。
   * @returns {Array<string>} 排序后的新数组。
   */
  function sortCategoriesByPriority(categories) {
    const safeCategories = Array.isArray(categories) ? categories : [];

    return [...safeCategories].sort((a, b) => {
      const priorityDiff = getCategoryPriority(a) - getCategoryPriority(b);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return String(a || '').localeCompare(String(b || ''), CATEGORY_LOCALE);
    });
  }

  /**
   * 将导航数据按统一分类顺序展开为扁平工具列表。
   * @param {Object<string, Array<Object>>} data - 分类到工具数组的映射。
   * @returns {Array<Object>} 带 category 字段的扁平工具列表。
   */
  function flattenToolsByCategoryPriority(data) {
    if (!data || typeof data !== 'object') {
      return [];
    }

    const sortedCategories = sortCategoriesByPriority(Object.keys(data));
    const tools = [];

    sortedCategories.forEach((category) => {
      const categoryTools = Array.isArray(data[category]) ? data[category] : [];
      categoryTools.forEach((tool) => {
        tools.push({ ...tool, category });
      });
    });

    return tools;
  }

  return {
    getCategoryPriority,
    sortCategoriesByPriority,
    flattenToolsByCategoryPriority
  };
});
