/**
 * 拖拽排序纯逻辑模块
 *
 * 职责与边界：负责根据拖拽后的 ID 顺序重排分类数据、重算排序字段，并在有待同步排序时将其覆盖到导航数据；
 * 不负责 DOM、Chrome API、网络同步、定时器或存储。
 * 关键副作用：无；所有函数均返回新的数据结构。
 */
(function(root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.DragSortCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : null, function() {
  'use strict';

  const DEFAULT_SORT_STEP = 10;
  const DEFAULT_SYNC_DEBOUNCE_MS = 5 * 1000;

  function normalizeId(value) {
    return String(value || '').trim();
  }

  /**
   * 提取站点顺序 ID 列表。
   * @param {Array<Object>} items
   * @returns {Array<string>}
   */
  function extractOrderedIds(items) {
    const safeItems = Array.isArray(items) ? items : [];
    return safeItems
      .map((item) => normalizeId(item?.id))
      .filter(Boolean);
  }

  /**
   * 比较两组顺序是否一致。
   * @param {Array<string>} previousIds
   * @param {Array<string>} orderedIds
   * @returns {boolean}
   */
  function isSameOrder(previousIds, orderedIds) {
    const before = Array.isArray(previousIds) ? previousIds : [];
    const after = Array.isArray(orderedIds) ? orderedIds : [];

    if (before.length !== after.length) {
      return false;
    }

    for (let i = 0; i < before.length; i += 1) {
      if (normalizeId(before[i]) !== normalizeId(after[i])) {
        return false;
      }
    }

    return true;
  }

  /**
   * 按拖拽结果重排当前分类，并返回最小远程更新集。
   * @param {Array<Object>} categoryItems
   * @param {Array<string>} orderedIds
   * @param {number} sortStep
   * @returns {{ reorderedItems: Array<Object>, changedItems: Array<Object>, updates: Array<{recordId: string, sort: number}>, orderedIds: Array<string> }}
   */
  function reorderCategoryItems(categoryItems, orderedIds, sortStep = DEFAULT_SORT_STEP) {
    const safeItems = Array.isArray(categoryItems) ? categoryItems : [];
    const normalizedOrder = Array.isArray(orderedIds)
      ? orderedIds.map((id) => normalizeId(id)).filter(Boolean)
      : [];

    const itemMap = new Map();
    const itemsWithoutId = [];

    safeItems.forEach((item) => {
      if (!item) {
        return;
      }

      const clonedItem = { ...item };
      const itemId = normalizeId(clonedItem.id);

      if (itemId) {
        itemMap.set(itemId, clonedItem);
      } else {
        itemsWithoutId.push(clonedItem);
      }
    });

    const reorderedItems = [];
    normalizedOrder.forEach((id) => {
      if (!itemMap.has(id)) {
        return;
      }

      reorderedItems.push(itemMap.get(id));
      itemMap.delete(id);
    });

    itemMap.forEach((item) => reorderedItems.push(item));
    itemsWithoutId.forEach((item) => reorderedItems.push(item));

    const changedItems = [];
    const updates = [];

    reorderedItems.forEach((item, index) => {
      const nextSort = (index + 1) * sortStep;
      if (item.sort === nextSort) {
        return;
      }

      item.sort = nextSort;
      changedItems.push(item);

      const itemId = normalizeId(item.id);
      if (itemId && !itemId.startsWith('mock-')) {
        updates.push({
          recordId: itemId,
          sort: nextSort
        });
      }
    });

    return {
      reorderedItems,
      changedItems,
      updates,
      orderedIds: extractOrderedIds(reorderedItems)
    };
  }

  /**
   * 将本地待同步排序覆盖到导航数据。
   * @param {Object<string, Array<Object>>} navData
   * @param {{category?: string, orderedIds?: Array<string>}|null} pendingSort
   * @param {number} sortStep
   * @returns {Object<string, Array<Object>>}
   */
  function applyPendingSortToNavData(navData, pendingSort, sortStep = DEFAULT_SORT_STEP) {
    if (!navData || typeof navData !== 'object') {
      return {};
    }

    const category = String(pendingSort?.category || '').trim();
    if (!category) {
      return { ...navData };
    }

    const categoryItems = Array.isArray(navData[category]) ? navData[category] : [];
    const nextData = { ...navData };

    if (categoryItems.length === 0) {
      nextData[category] = [];
      return nextData;
    }

    const result = reorderCategoryItems(categoryItems, pendingSort?.orderedIds || [], sortStep);
    nextData[category] = result.reorderedItems;
    return nextData;
  }

  /**
   * 创建待同步排序负载。
   * @param {string} category
   * @param {Array<string>} orderedIds
   * @param {Array<{recordId: string, sort: number}>} updates
   * @param {number} now
   * @returns {Object}
   */
  function createPendingSortPayload(category, orderedIds, updates, now = Date.now()) {
    return {
      category: String(category || '').trim(),
      orderedIds: Array.isArray(orderedIds) ? orderedIds.map((id) => normalizeId(id)).filter(Boolean) : [],
      updates: Array.isArray(updates) ? updates.map((item) => ({ ...item })) : [],
      updatedAt: now,
      retryCount: 0,
      status: 'queued'
    };
  }

  /**
   * 计算恢复待同步排序时还需等待多久。
   * @param {number} updatedAt
   * @param {number} now
   * @param {number} debounceMs
   * @returns {number}
   */
  function getPendingSyncDelay(updatedAt, now = Date.now(), debounceMs = DEFAULT_SYNC_DEBOUNCE_MS) {
    const age = Math.max(0, now - Number(updatedAt || 0));
    return Math.max(0, debounceMs - age);
  }

  /**
   * 标记待同步排序进入同步中。
   * @param {Object} payload
   * @returns {Object}
   */
  function markPendingSortSyncing(payload) {
    return {
      ...payload,
      status: 'syncing'
    };
  }

  /**
   * 标记待同步排序同步失败并累加重试次数。
   * @param {Object} payload
   * @param {string} message
   * @returns {Object}
   */
  function markPendingSortFailure(payload, message) {
    return {
      ...payload,
      retryCount: Number(payload?.retryCount || 0) + 1,
      status: 'error',
      lastError: message || '同步失败'
    };
  }

  return {
    DEFAULT_SORT_STEP,
    DEFAULT_SYNC_DEBOUNCE_MS,
    extractOrderedIds,
    isSameOrder,
    reorderCategoryItems,
    applyPendingSortToNavData,
    createPendingSortPayload,
    getPendingSyncDelay,
    markPendingSortSyncing,
    markPendingSortFailure
  };
});
