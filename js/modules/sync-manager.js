/**
 * Sync manager
 * Handles periodic sync, manual sync, and retry behavior.
 */
const SyncManager = (function() {
  'use strict';

  const MAX_RETRIES = 3;
  const RETRY_INTERVAL = 1 * 60 * 1000;
  const DEFAULT_SYNC_INTERVAL = 30;
  const INITIAL_SYNC_DELAY = 1;

  let syncInterval = DEFAULT_SYNC_INTERVAL;
  let isSyncing = false;
  let retryCount = 0;
  let retryTimer = null;
  let syncAlarmName = 'chromeNav_sync_alarm';
  let isPeriodicEnabled = false;

  async function startPeriodicSync(intervalMinutes = DEFAULT_SYNC_INTERVAL) {
    syncInterval = intervalMinutes;

    // 闹钟属于整个扩展，打开新标签页时保留已有计划。
    const existingAlarm = await chrome.alarms.get(syncAlarmName);
    if (!existingAlarm || existingAlarm.periodInMinutes !== syncInterval) {
      await chrome.alarms.create(syncAlarmName, {
        delayInMinutes: INITIAL_SYNC_DELAY,
        periodInMinutes: syncInterval
      });
    }

    isPeriodicEnabled = true;
    console.log(`[SyncManager] Periodic sync started, interval ${syncInterval} minutes`);

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
    isSyncing = true;

    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'SYNC_NOW', reason: 'periodic' }, (response) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(response || { success: false, error: '后台未返回同步结果' });
        });
      });

      if (result.skipped) {
        console.log('[SyncManager] Sync skipped:', result.message);
        retryCount = 0;
        return;
      }

      if (!result.success) {
        throw new Error(result.error || result.message || '同步失败');
      }

      retryCount = 0;

      console.log('[SyncManager] Sync completed');
    } catch (error) {
      console.error('[SyncManager] Sync failed:', error);
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
    // 定时同步、SYNC_NOW 请求和完成广播统一由后台处理。
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
