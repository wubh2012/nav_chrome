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

    const tools = [];

    Object.keys(data).forEach((category) => {
      const categoryTools = Array.isArray(data[category]) ? data[category] : [];
      categoryTools.forEach((tool) => {
        tools.push({ ...tool, category });
      });
    });

    return tools.sort(compareNavigationOrder);
  }

  /**
   * 比较两个网站的共享导航顺序。
   * 缺失的排序值置后；旧数据并列时沿用分类优先级，再按分类名和 ID 稳定排序。
   */
  function compareNavigationOrder(left, right) {
    const leftSort = Number(left?.sort);
    const rightSort = Number(right?.sort);
    const leftHasSort = left?.sort !== null && left?.sort !== '' && Number.isFinite(leftSort);
    const rightHasSort = right?.sort !== null && right?.sort !== '' && Number.isFinite(rightSort);
    if (leftHasSort !== rightHasSort) return leftHasSort ? -1 : 1;
    if (leftHasSort && leftSort !== rightSort) return leftSort - rightSort;

    const categoryDiff = getCategoryPriority(left?.category) - getCategoryPriority(right?.category);
    if (categoryDiff !== 0) return categoryDiff;

    const categoryNameDiff = String(left?.category || '').localeCompare(String(right?.category || ''), CATEGORY_LOCALE);
    if (categoryNameDiff !== 0) return categoryNameDiff;

    const idDiff = String(left?.id || '').localeCompare(String(right?.id || ''), CATEGORY_LOCALE);
    if (idDiff !== 0) return idDiff;

    return String(left?.name || '').localeCompare(String(right?.name || ''), CATEGORY_LOCALE);
  }

  return {
    getCategoryPriority,
    sortCategoriesByPriority,
    flattenToolsByCategoryPriority,
    compareNavigationOrder
  };
});
