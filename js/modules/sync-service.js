/**
 * Shared navigation sync service.
 *
 * Keeps the data-sync workflow independent from popup, newtab, and service-worker UI code.
 */
(function(root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.SyncService = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : null, function() {
  'use strict';

  function resolveDeps(overrides = {}) {
    const root = typeof globalThis !== 'undefined' ? globalThis : {};
    return {
      Storage: overrides.Storage || root.Storage,
      FeishuAPI: overrides.FeishuAPI || root.FeishuAPI,
      flushPendingSortSync: overrides.flushPendingSortSync || null
    };
  }

  function isFeishuConfigured(config) {
    return Boolean(
      config
      && config.appId
      && config.appSecret
      && config.appToken
      && config.tableId
    );
  }

  function createResult(extra) {
    return {
      success: false,
      skipped: false,
      message: '',
      error: '',
      ...extra
    };
  }

  async function saveStatus(Storage, status, message) {
    if (Storage && typeof Storage.saveSyncStatus === 'function') {
      await Storage.saveSyncStatus(status, message);
    }
  }

  /**
   * Execute one complete navigation data sync.
   *
   * @param {Object} options
   * @param {string} options.reason
   * @param {Function|null} options.flushPendingSortSync
   * @param {Object} options.deps
   * @returns {Promise<Object>}
   */
  async function syncNavigation(options = {}) {
    const deps = resolveDeps(options.deps || {});
    const { Storage, FeishuAPI } = deps;
    const flushPendingSortSync = options.flushPendingSortSync || deps.flushPendingSortSync;
    const reason = options.reason || 'manual';

    if (!Storage || !FeishuAPI) {
      return createResult({
        error: '同步依赖未初始化',
        message: '同步依赖未初始化',
        reason
      });
    }

    try {
      const testMode = await Storage.getTestMode();
      if (testMode) {
        await saveStatus(Storage, 'idle', '测试模式，跳过飞书同步');
        return createResult({
          success: true,
          skipped: true,
          message: '测试模式，跳过飞书同步',
          reason
        });
      }

      const feishuConfig = await Storage.loadFeishuConfig();
      if (!isFeishuConfigured(feishuConfig)) {
        await saveStatus(Storage, 'error', '未配置完整飞书凭证');
        return createResult({
          skipped: true,
          error: '未配置完整飞书凭证',
          message: '未配置完整飞书凭证',
          reason
        });
      }

      await saveStatus(Storage, 'syncing', '同步中...');

      let pendingSortResult = null;
      if (typeof flushPendingSortSync === 'function') {
        pendingSortResult = await flushPendingSortSync(reason);
      }

      const result = await FeishuAPI.getRecords();
      if (!result || !result.success || !result.data) {
        throw new Error(result?.error || result?.message || '获取数据失败');
      }

      await Storage.saveNavData(result.data, result.categories || [], result.dateInfo || null);
      await saveStatus(Storage, 'success', '同步成功');

      return createResult({
        success: true,
        message: '同步成功',
        reason,
        data: result.data,
        categories: result.categories || [],
        dateInfo: result.dateInfo || null,
        pendingSortResult
      });
    } catch (error) {
      const message = error?.message || '同步失败';
      await saveStatus(Storage, 'error', message);
      return createResult({
        error: message,
        message,
        reason
      });
    }
  }

  return {
    isFeishuConfigured,
    syncNavigation
  };
});
