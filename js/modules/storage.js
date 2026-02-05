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
    DATE_INFO: 'chromeNav_dateInfo',
    FEISHU_CONFIG: 'chromeNav_feishuConfig',
    THEME_PREFERENCE: 'chromeNav_theme',
    SYNC_STATUS: 'chromeNav_syncStatus',
    SYNC_TIME: 'chromeNav_lastSyncTime',
    TEST_MODE: 'chromeNav_testMode'
  };

  // 缓存有效期（7天）
  const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;

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
  async function saveNavData(data, categories, dateInfo) {
    const cacheData = {
      data: data,
      categories: categories,
      dateInfo: dateInfo,
      timestamp: Date.now()
    };
    await set({
      [KEYS.NAV_DATA]: cacheData.data,
      [KEYS.NAV_CATEGORIES]: cacheData.categories,
      [KEYS.DATE_INFO]: cacheData.dateInfo,
      [KEYS.SYNC_TIME]: Date.now()
    });
    console.log('[Storage] 导航数据已保存');
  }

  /**
   * 加载导航数据
   * @returns {Promise<Object|null>} 导航数据对象，或 null（无缓存）
   */
  async function loadNavData() {
    try {
      const result = await get([KEYS.NAV_DATA, KEYS.NAV_CATEGORIES, KEYS.DATE_INFO, KEYS.SYNC_TIME]);

      if (!result[KEYS.NAV_DATA] || !result[KEYS.NAV_CATEGORIES]) {
        return null;
      }

      // 检查缓存是否过期
      const syncTime = result[KEYS.SYNC_TIME] || 0;
      if (Date.now() - syncTime > CACHE_DURATION) {
        console.log('[Storage] 缓存已过期');
        return null;
      }

      return {
        data: result[KEYS.NAV_DATA],
        categories: result[KEYS.NAV_CATEGORIES],
        dateInfo: result[KEYS.DATE_INFO],
        fromCache: true
      };
    } catch (error) {
      console.error('[Storage] 加载导航数据失败:', error);
      return null;
    }
  }

  /**
   * 获取缓存的同步时间
   * @returns {Promise<number|null>}
   */
  async function getSyncTime() {
    try {
      const result = await get(KEYS.SYNC_TIME);
      return result[KEYS.SYNC_TIME] || null;
    } catch (error) {
      return null;
    }
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

  /**
   * 检查是否已配置飞书
   * @returns {Promise<boolean>}
   */
  async function isFeishuConfigured() {
    const config = await loadFeishuConfig();
    return !!(config && config.appId && config.appSecret && config.appToken);
  }

  // ==================== 主题偏好操作 ====================

  /**
   * 保存主题偏好
   * @param {string} skin - 皮肤主题 (neon/ocean/forest/sunset/purple/classic)
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
   * @returns {Promise<Object>} { skin: 'neon', mode: 'dark' }
   */
  async function loadThemePreference() {
    try {
      const result = await get(KEYS.THEME_PREFERENCE);
      return result[KEYS.THEME_PREFERENCE] || { skin: 'neon', mode: 'dark' };
    } catch (error) {
      return { skin: 'neon', mode: 'dark' };
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
    await remove([KEYS.NAV_DATA, KEYS.NAV_CATEGORIES, KEYS.DATE_INFO, KEYS.SYNC_TIME, KEYS.SYNC_STATUS]);
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

  /**
   * 获取存储使用量
   * @returns {Promise<Object>}
   */
  async function getUsage() {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.getBytesInUse(null, (bytes) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve({
              used: bytes,
              quota: 5 * 1024 * 1024, // Chrome 扩展通常 5MB
              percentage: ((bytes / (5 * 1024 * 1024)) * 100).toFixed(2)
            });
          }
        });
      } catch (error) {
        reject(error);
      }
    });
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
    getUsage,

    // 导航数据
    saveNavData,
    loadNavData,
    getSyncTime,
    clearNavCache,

    // 飞书配置
    saveFeishuConfig,
    loadFeishuConfig,
    isFeishuConfigured,

    // 主题偏好
    saveThemePreference,
    loadThemePreference,

    // 同步状态
    saveSyncStatus,
    getSyncStatus,

    // 测试模式
    saveTestMode,
    getTestMode,

    // 缓存管理
    clearAll
  };
})();

// 导出到全局
window.Storage = Storage;
