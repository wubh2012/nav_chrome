/**
 * Sync manager
 * Handles periodic sync, manual sync, and retry behavior.
 */
const SyncManager = (function() {
  'use strict';

  const MAX_RETRIES = 3;
  const RETRY_INTERVAL = 1 * 60 * 1000;
  const DEFAULT_SYNC_INTERVAL = 30;

  let syncInterval = DEFAULT_SYNC_INTERVAL;
  let isSyncing = false;
  let retryCount = 0;
  let retryTimer = null;
  let syncAlarmName = 'chromeNav_sync_alarm';
  let isPeriodicEnabled = false;

  async function startPeriodicSync(intervalMinutes = DEFAULT_SYNC_INTERVAL) {
    syncInterval = intervalMinutes;

    await stopPeriodicSync();

    await chrome.alarms.create(syncAlarmName, {
      delayInMinutes: syncInterval,
      periodInMinutes: syncInterval
    });

    isPeriodicEnabled = true;
    console.log(`[SyncManager] Periodic sync started, interval ${syncInterval} minutes`);

    syncNow().catch((error) => {
      console.warn('[SyncManager] Initial background sync failed:', error);
    });
  }

  async function stopPeriodicSync() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    await chrome.alarms.clear(syncAlarmName);
    isPeriodicEnabled = false;
    retryCount = 0;
    console.log('[SyncManager] Periodic sync stopped');
  }

  async function syncNow() {
    if (isSyncing) {
      console.log('[SyncManager] Sync already in progress, skipping');
      return;
    }

    await handleSync();
  }

  async function handleSync() {
    const testMode = await Storage.getTestMode();
    if (testMode) {
      console.log('[SyncManager] Test mode enabled, skipping sync');
      return;
    }

    const feishuConfig = await Storage.loadFeishuConfig();
    if (!feishuConfig || !feishuConfig.appId || !feishuConfig.appToken) {
      console.log('[SyncManager] Feishu is not configured, skipping sync');
      return;
    }

    isSyncing = true;
    await Storage.saveSyncStatus('syncing', '同步中...');

    try {
      const result = await FeishuAPI.getRecords(feishuConfig.appToken, feishuConfig.tableId);

      if (!result.success || !result.data) {
        throw new Error(result.error || '获取数据失败');
      }

      const { data: navData, categories, dateInfo } = result;

      await Storage.saveNavData(navData, categories, dateInfo);
      await Storage.saveSyncStatus('success', '同步成功');
      retryCount = 0;

      console.log(`[SyncManager] Sync completed, ${categories.length} categories`);
      notifyFrontend();
    } catch (error) {
      console.error('[SyncManager] Sync failed:', error);
      await Storage.saveSyncStatus('error', error.message);
      handleRetry();
    } finally {
      isSyncing = false;
    }
  }

  async function handleRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    if (retryCount < MAX_RETRIES) {
      retryCount++;
      await Storage.saveSyncStatus(
        'error',
        `同步失败，${RETRY_INTERVAL / 1000} 秒后重试 (${retryCount}/${MAX_RETRIES})`
      );

      console.log(`[SyncManager] Retry scheduled (${retryCount}/${MAX_RETRIES})`);

      retryTimer = setTimeout(async () => {
        await handleSync();
      }, RETRY_INTERVAL);
      return;
    }

    await Storage.saveSyncStatus('error', `同步失败，已重试 ${MAX_RETRIES} 次`);
    console.error(`[SyncManager] Sync failed after ${MAX_RETRIES} retries`);
  }

  function notifyFrontend() {
    try {
      chrome.runtime.sendMessage({
        type: 'SYNC_COMPLETE',
        timestamp: Date.now()
      });
    } catch (error) {
      // Ignore when no page is listening.
    }
  }

  async function getStatus() {
    const status = await Storage.getSyncStatus();
    const syncTime = await Storage.getSyncTime();

    return {
      isSyncing,
      isPeriodicEnabled,
      syncInterval,
      retryCount,
      lastSyncTime: syncTime,
      status: status?.status || 'idle',
      message: status?.message || ''
    };
  }

  async function init() {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === syncAlarmName) {
        console.log('[SyncManager] Alarm triggered');
        handleSync();
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SYNC_NOW') {
        syncNow().then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
        return true;
      }

      if (message.type === 'GET_SYNC_STATUS') {
        getStatus().then((status) => {
          sendResponse(status);
        }).catch((error) => {
          sendResponse({ error: error.message });
        });
        return true;
      }

      if (message.type === 'START_PERIODIC_SYNC') {
        startPeriodicSync(message.interval || DEFAULT_SYNC_INTERVAL).then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
        return true;
      }

      if (message.type === 'STOP_PERIODIC_SYNC') {
        stopPeriodicSync().then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
        return true;
      }

      return false;
    });

    console.log('[SyncManager] Initialized');
  }

  return {
    init,
    startPeriodicSync,
    stopPeriodicSync,
    syncNow,
    handleSync,
    getStatus
  };
})();

window.SyncManager = SyncManager;
