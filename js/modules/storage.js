/**
 * 存储模块 - 封装 chrome.storage.local API
 * 用于存储导航数据、飞书配置、主题偏好等
 */
const Storage = (function() {
  'use strict';

  // 存储键名常量
  const KEYS = {
    NAV_DATA: 'chromeNav_navData',
    NAV_CATEGORIES: 'chromeNav_categories',
    NAV_REVISION: 'chromeNav_navRevision',
    DATE_INFO: 'chromeNav_dateInfo',
    FEISHU_CONFIG: 'chromeNav_feishuConfig',
    THEME_PREFERENCE: 'chromeNav_theme',
    SYNC_STATUS: 'chromeNav_syncStatus',
    SYNC_TIME: 'chromeNav_lastSyncTime',
    TEST_MODE: 'chromeNav_testMode',
    PENDING_SORT_SYNC: 'chromeNav_pendingSortSync'
  };

  // 缓存有效期（7天）
  const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;
  const SCOPED_NAV_PREFIX = 'chromeNav_scopedNav_';

  function getNavKeys(dataScope) {
    if (!dataScope) return {
      data: KEYS.NAV_DATA,
      categories: KEYS.NAV_CATEGORIES,
      dateInfo: KEYS.DATE_INFO,
      syncTime: KEYS.SYNC_TIME,
      revision: KEYS.NAV_REVISION
    };
    let hash = 2166136261;
    for (const character of String(dataScope)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    const prefix = `${SCOPED_NAV_PREFIX}${(hash >>> 0).toString(36)}`;
    return {
      data: `${prefix}_data`,
      categories: `${prefix}_categories`,
      dateInfo: `${prefix}_dateInfo`,
      syncTime: `${prefix}_syncTime`,
      revision: `${prefix}_revision`
    };
  }

  /**
   * 异步获取存储数据
   * @param {string|string[]} keys - 要获取的键名
   * @returns {Promise<Object>} 存储的数据
   */
  function get(keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 异步存储数据
   * @param {Object} items - 要存储的键值对
   * @returns {Promise<void>}
   */
  function set(items) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(items, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 异步删除存储数据
   * @param {string|string[]} keys - 要删除的键名
   * @returns {Promise<void>}
   */
  function remove(keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.remove(keys, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 异步清空所有存储数据
   * @returns {Promise<void>}
   */
  function clear() {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.clear(() => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // ==================== 导航数据操作 ====================

  /**
   * 保存导航数据
   * @param {Object} data - 导航数据对象 { category: [ {name, url, icon}, ... ] }
   * @param {string[]} categories - 分类列表
   * @param {Object} dateInfo - 日期信息
   * @returns {Promise<void>}
   */
  async function saveNavData(data, categories, dateInfo, options = {}) {
    const keys = getNavKeys(options.dataScope);
    const preservedSyncTime = options.preserveSyncTime ? await getSyncTime(options.dataScope) : null;
    const nextSyncTime = typeof options.syncTime === 'number'
      ? options.syncTime
      : (preservedSyncTime || Date.now());
    const cacheData = {
      data: data,
      categories: categories,
      dateInfo: dateInfo,
      timestamp: Date.now()
    };
    const revisionResult = options.nextRevision === undefined
      ? await get(keys.revision)
      : null;
    const nextRevision = options.nextRevision === undefined
      ? Number(revisionResult?.[keys.revision] || 0) + 1
      : Number(options.nextRevision);
    const storedValues = {
      [keys.data]: cacheData.data,
      [keys.categories]: cacheData.categories,
      [keys.dateInfo]: cacheData.dateInfo,
      [keys.syncTime]: nextSyncTime,
      [keys.revision]: nextRevision
    };

    if (options.pendingSortSync !== undefined) {
      storedValues[KEYS.PENDING_SORT_SYNC] = await updatePendingSortScopes(
        options.pendingSortSync,
        options.dataScope
      );
    }
    await set(storedValues);
    console.log('[Storage] 导航数据已保存');
    return { revision: nextRevision };
  }

  /**
   * 加载导航数据
   * @returns {Promise<Object|null>} 导航数据对象，或 null（无缓存）
   */
  async function loadNavData(dataScope = null) {
    try {
      const keys = getNavKeys(dataScope);
      const fallbackKeys = dataScope && dataScope !== 'test-mode'
        ? [KEYS.NAV_DATA, KEYS.NAV_CATEGORIES, KEYS.DATE_INFO, KEYS.SYNC_TIME, KEYS.NAV_REVISION]
        : [];
      const result = await get([...Object.values(keys), ...fallbackKeys]);
      const sourceKeys = result[keys.data] && result[keys.categories]
        ? keys
        : fallbackKeys.length && result[KEYS.NAV_DATA] && result[KEYS.NAV_CATEGORIES]
          ? getNavKeys(null)
          : keys;

      if (!result[sourceKeys.data] || !result[sourceKeys.categories]) {
        return null;
      }

      // 检查缓存是否过期
      const syncTime = result[sourceKeys.syncTime] || 0;
      if (Date.now() - syncTime > CACHE_DURATION) {
        console.log('[Storage] 缓存已过期');
        return null;
      }

      return {
        data: result[sourceKeys.data],
        categories: result[sourceKeys.categories],
        dateInfo: result[sourceKeys.dateInfo],
        revision: Number(result[sourceKeys.revision] || 0),
        fromCache: true
      };
    } catch (error) {
      console.error('[Storage] 加载导航数据失败:', error);
      return null;
    }
  }

  async function getNavDataRevision(dataScope = null) {
    try {
      const revisionKey = getNavKeys(dataScope).revision;
      const result = await get(revisionKey);
      if (result[revisionKey] !== undefined) return Number(result[revisionKey] || 0);
      if (dataScope && dataScope !== 'test-mode') {
        const legacy = await get(KEYS.NAV_REVISION);
        return Number(legacy[KEYS.NAV_REVISION] || 0);
      }
      return 0;
    } catch (_error) {
      return 0;
    }
  }

  function getNavDataRevisionKey(dataScope = null) {
    return getNavKeys(dataScope).revision;
  }

  async function commitNavData(data, categories, dateInfo, options = {}) {
    const request = {
      type: 'COMMIT_NAV_DATA',
      data,
      categories: Array.isArray(categories) ? categories : [],
      dateInfo: dateInfo || null,
      expectedRevision: Number(options.expectedRevision || 0),
      preserveSyncTime: options.preserveSyncTime !== false,
      pendingSortSync: options.pendingSortSync,
      dataScope: options.dataScope
    };

    if (options.localOnly || typeof chrome.runtime?.sendMessage !== 'function') {
      const actualRevision = await getNavDataRevision(options.dataScope);
      if (actualRevision !== request.expectedRevision) {
        return { success: false, conflict: true, current: await loadNavData(options.dataScope) };
      }
      const saved = await saveNavData(data, categories, dateInfo, {
        preserveSyncTime: request.preserveSyncTime,
        pendingSortSync: options.pendingSortSync,
        dataScope: options.dataScope,
        nextRevision: actualRevision + 1
      });
      return { success: true, revision: saved.revision };
    }

    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(request, (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message || '无法提交导航数据'));
          } else if (!response) {
            reject(new Error('后台未返回导航数据提交结果'));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 获取缓存的同步时间
   * @returns {Promise<number|null>}
   */
  async function getSyncTime(dataScope = null) {
    try {
      const scope = dataScope === null ? await getCurrentNavDataScope() : dataScope;
      const syncTimeKey = getNavKeys(scope).syncTime;
      const result = await get(syncTimeKey);
      if (result[syncTimeKey]) return result[syncTimeKey];
      if (scope && scope !== 'test-mode') {
        const legacy = await get(KEYS.SYNC_TIME);
        return legacy[KEYS.SYNC_TIME] || null;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async function getCurrentNavDataScope() {
    if (await getTestMode()) return 'test-mode';
    const config = await loadFeishuConfig();
    return `${config?.appToken || 'unconfigured'}:${config?.tableId || 'default'}`;
  }

  // ==================== 飞书配置操作 ====================

  /**
   * 保存飞书配置
   * @param {Object} config - 飞书配置对象
   * @param {string} config.appId - APP_ID
   * @param {string} config.appSecret - APP_SECRET
   * @param {string} config.appToken - 多维表格 Token
   * @param {string} config.tableId - 表格 ID
   * @param {number} config.syncInterval - 同步间隔（分钟）
   * @param {boolean} config.syncEnabled - 是否启用定时同步
   * @returns {Promise<void>}
   */
  async function saveFeishuConfig(config) {
    await set({
      [KEYS.FEISHU_CONFIG]: {
        ...config,
        updatedAt: Date.now()
      }
    });
    console.log('[Storage] 飞书配置已保存');
  }

  /**
   * 加载飞书配置
   * @returns {Promise<Object|null>}
   */
  async function loadFeishuConfig() {
    try {
      const result = await get(KEYS.FEISHU_CONFIG);
      return result[KEYS.FEISHU_CONFIG] || null;
    } catch (error) {
      console.error('[Storage] 加载飞书配置失败:', error);
      return null;
    }
  }
  // ==================== 主题偏好操作 ====================

  /**
   * 保存主题偏好
   * @param {string} skin - 皮肤主题 (graphite/cream)
   * @param {string} mode - 模式 (dark/light)
   * @returns {Promise<void>}
   */
  async function saveThemePreference(skin, mode) {
    await set({
      [KEYS.THEME_PREFERENCE]: { skin, mode }
    });
  }

  /**
   * 加载主题偏好
   * @returns {Promise<Object>} { skin: 'cream', mode: 'light' }
   */
  async function loadThemePreference() {
    try {
      const result = await get(KEYS.THEME_PREFERENCE);
      return result[KEYS.THEME_PREFERENCE] || { skin: 'cream', mode: 'light' };
    } catch (error) {
      return { skin: 'cream', mode: 'light' };
    }
  }

  // ==================== 同步状态操作 ====================

  /**
   * 保存同步状态
   * @param {string} status - 状态 (syncing/success/error/offline)
   * @param {string} message - 状态消息
   * @returns {Promise<void>}
   */
  async function saveSyncStatus(status, message = '') {
    await set({
      [KEYS.SYNC_STATUS]: { status, message, updatedAt: Date.now() }
    });
  }

  /**
   * 获取同步状态
   * @returns {Promise<Object|null>}
   */
  async function getSyncStatus() {
    try {
      const result = await get(KEYS.SYNC_STATUS);
      return result[KEYS.SYNC_STATUS] || null;
    } catch (error) {
      return null;
    }
  }

  // ==================== 待同步排序操作 ====================

  /**
   * 保存待同步拖拽排序。
   * @param {Object|null} pendingSort
   * @returns {Promise<void>}
   */
  async function savePendingSortSync(pendingSort, dataScope = pendingSort?.dataScope) {
    if (!pendingSort) {
      await clearPendingSortSync(dataScope || null);
      return;
    }
    const updated = await updatePendingSortScopes(pendingSort, dataScope);
    await set({ [KEYS.PENDING_SORT_SYNC]: updated });
  }

  /**
   * 获取待同步拖拽排序。
   * @returns {Promise<Object|null>}
   */
  async function loadPendingSortSync(dataScope = null) {
    try {
      const result = await get(KEYS.PENDING_SORT_SYNC);
      const stored = result[KEYS.PENDING_SORT_SYNC] || null;
      const scopes = normalizePendingSortScopes(stored);
      if (dataScope && scopes[dataScope]) return scopes[dataScope];
      if (dataScope && scopes.__legacy__) {
        scopes[dataScope] = { ...scopes.__legacy__, dataScope };
        delete scopes.__legacy__;
        await set({ [KEYS.PENDING_SORT_SYNC]: { version: 2, scopes } });
        return scopes[dataScope];
      }
      return Object.values(scopes)[0] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 清除待同步拖拽排序。
   * @returns {Promise<void>}
   */
  async function clearPendingSortSync(dataScope = null) {
    if (!dataScope) {
      await remove(KEYS.PENDING_SORT_SYNC);
      return;
    }
    const result = await get(KEYS.PENDING_SORT_SYNC);
    const scopes = normalizePendingSortScopes(result[KEYS.PENDING_SORT_SYNC]);
    delete scopes[dataScope];
    if (Object.keys(scopes).length === 0) await remove(KEYS.PENDING_SORT_SYNC);
    else await set({ [KEYS.PENDING_SORT_SYNC]: { version: 2, scopes } });
  }

  async function loadAllPendingSortSyncs() {
    try {
      const result = await get(KEYS.PENDING_SORT_SYNC);
      return normalizePendingSortScopes(result[KEYS.PENDING_SORT_SYNC]);
    } catch (_error) {
      return {};
    }
  }

  function normalizePendingSortScopes(value) {
    if (!value || typeof value !== 'object') return {};
    if (value.version === 2 && value.scopes && typeof value.scopes === 'object') return { ...value.scopes };
    if (Array.isArray(value.updates)) return { [value.dataScope || '__legacy__']: value };
    return {};
  }

  async function updatePendingSortScopes(payload, dataScope) {
    const result = await get(KEYS.PENDING_SORT_SYNC);
    const scopes = normalizePendingSortScopes(result[KEYS.PENDING_SORT_SYNC]);
    const scope = String(dataScope || payload?.dataScope || '__legacy__');
    if (!payload) delete scopes[scope];
    else scopes[scope] = { ...payload, dataScope: scope, updatedAt: payload.updatedAt || Date.now() };
    return Object.keys(scopes).length > 0 ? { version: 2, scopes } : null;
  }

  // ==================== 测试模式操作 ====================

  /**
   * 保存测试模式状态
   * @param {boolean} enabled - 是否启用测试模式
   * @returns {Promise<void>}
   */
  async function saveTestMode(enabled) {
    await set({ [KEYS.TEST_MODE]: enabled });
  }

  /**
   * 获取测试模式状态
   * @returns {Promise<boolean>}
   */
  async function getTestMode() {
    try {
      const result = await get(KEYS.TEST_MODE);
      return result[KEYS.TEST_MODE] || false;
    } catch (error) {
      return false;
    }
  }

  // ==================== 缓存管理 ====================

  /**
   * 清除所有缓存（导航数据）
   * @returns {Promise<void>}
   */
  async function clearNavCache() {
    const all = await get(null);
    const scopedKeys = Object.keys(all).filter((key) => key.startsWith(SCOPED_NAV_PREFIX));
    await remove([
      KEYS.NAV_DATA,
      KEYS.NAV_CATEGORIES,
      KEYS.DATE_INFO,
      KEYS.SYNC_TIME,
      KEYS.SYNC_STATUS,
      KEYS.NAV_REVISION
    ].concat(scopedKeys));
    console.log('[Storage] 导航缓存已清除');
  }

  /**
   * 清除所有数据
   * @returns {Promise<void>}
   */
  async function clearAll() {
    await clear();
    console.log('[Storage] 所有存储数据已清除');
  }

  // ==================== 公共 API ====================

  return {
    // 键名常量
    KEYS,

    // 基础操作
    get,
    set,
    remove,
    clear,

    // 导航数据
    saveNavData,
    commitNavData,
    loadNavData,
    getNavDataRevision,
    getSyncTime,
    getNavDataRevisionKey,
    clearNavCache,

    // 飞书配置
    saveFeishuConfig,
    loadFeishuConfig,

    // 主题偏好
    saveThemePreference,
    loadThemePreference,

    // 同步状态
    saveSyncStatus,
    getSyncStatus,

    // 待同步排序
    savePendingSortSync,
    loadPendingSortSync,
    loadAllPendingSortSyncs,
    clearPendingSortSync,

    // 测试模式
    saveTestMode,
    getTestMode,

    // 缓存管理
    clearAll
  };
})();

// 导出到全局
globalThis.Storage = Storage;
