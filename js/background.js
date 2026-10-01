/**
 * Background service worker.
 * Handles startup, alarms, and sync message routing.
 */

importScripts('modules/storage.js', 'modules/feishu-api.js', 'modules/drag-sort-core.js', 'modules/sync-service.js');

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Background] Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    await Storage.saveSyncStatus('idle', '请先配置飞书凭证');
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] Chrome startup');

  const feishuConfig = await Storage.loadFeishuConfig();
  const testMode = await Storage.getTestMode();

  if (testMode) {
    console.log('[Background] Test mode enabled, skip startup sync');
    return;
  }

  if (feishuConfig && feishuConfig.syncEnabled !== false) {
    const interval = feishuConfig.syncInterval || 30;

    await chrome.alarms.create('chromeNav_sync_alarm', {
      delayInMinutes: 1,
      periodInMinutes: interval
    });

    console.log(`[Background] Periodic sync configured, interval ${interval} minutes`);

    setTimeout(() => {
      handleBackgroundSync('startup').catch((error) => {
        console.warn('[Background] Startup sync failed:', error);
      });
    }, 2000);
  }

  flushPendingSortSync('startup').catch((error) => {
    console.warn('[Background] Startup pending sort flush failed:', error);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FLUSH_PENDING_SORT_SYNC') {
    flushPendingSortSync(message.reason || 'message').then(sendResponse).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.type === 'SYNC_NOW') {
    handleBackgroundSync(message.reason || 'message').then(sendResponse).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.type === 'GET_STATUS' || message.type === 'GET_SYNC_STATUS') {
    getBackgroundStatus().then(sendResponse).catch((error) => {
      sendResponse({ error: error.message });
    });
    return true;
  }

  return false;
});

async function handleBackgroundSync(reason = 'background-sync') {
  try {
    const result = await SyncService.syncNavigation({
      reason,
      flushPendingSortSync
    });

    if (result.success && !result.skipped) {
      notifyFrontendSyncComplete();
    }

    return result;
  } catch (error) {
    console.error('[Background] Sync failed:', error);
    return { success: false, error: error.message };
  }
}

async function getBackgroundStatus() {
  const status = await Storage.getSyncStatus();
  const syncTime = await Storage.getSyncTime();

  return {
    isSyncing: status?.status === 'syncing',
    isPeriodicEnabled: true,
    syncInterval: null,
    retryCount: 0,
    lastSyncTime: syncTime,
    status: status?.status || 'idle',
    message: status?.message || ''
  };
}

function notifyFrontendSyncComplete() {
  try {
    chrome.runtime.sendMessage({
      type: 'SYNC_COMPLETE',
      timestamp: Date.now()
    }, () => {
      // Ignore when no extension page is listening.
      void chrome.runtime.lastError;
    });
  } catch (_error) {
    // Ignore when no page is listening.
  }
}

function isSamePendingPayload(left, right) {
  if (!left || !right) {
    return false;
  }

  return String(left.category || '') === String(right.category || '')
    && Number(left.updatedAt || 0) === Number(right.updatedAt || 0);
}

async function flushPendingSortSync(reason = 'background') {
  const pending = await Storage.loadPendingSortSync();
  if (!pending) {
    return { success: true, skipped: true, cleared: false };
  }

  if (!Array.isArray(pending.updates) || pending.updates.length === 0) {
    await Storage.clearPendingSortSync();
    return { success: true, skipped: true, cleared: true };
  }

  const testMode = await Storage.getTestMode();
  if (testMode) {
    await Storage.clearPendingSortSync();
    return { success: true, skipped: true, cleared: true };
  }

  try {
    await Storage.savePendingSortSync(DragSortCore.markPendingSortSyncing(pending));

    const batchResult = await FeishuAPI.batchUpdateRecordSorts(pending.updates);
    const latestPending = await Storage.loadPendingSortSync();
    const hasNewerPending = latestPending && !isSamePendingPayload(latestPending, pending);

    if (!hasNewerPending) {
      await Storage.clearPendingSortSync();
    }

    return {
      success: true,
      cleared: !hasNewerPending,
      pending: hasNewerPending ? latestPending : null,
      reason,
      batchResult
    };
  } catch (error) {
    console.error('[Background] Pending sort flush failed:', error);

    const latestPending = await Storage.loadPendingSortSync();
    if (latestPending && !isSamePendingPayload(latestPending, pending)) {
      return {
        success: false,
        error: error.message,
        pending: latestPending
      };
    }

    const failedPending = DragSortCore.markPendingSortFailure(pending, error.message);
    await Storage.savePendingSortSync(failedPending);

    return {
      success: false,
      error: error.message,
      pending: failedPending
    };
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'chromeNav_sync_alarm') {
    console.log('[Background] Periodic sync alarm triggered');

    handleBackgroundSync('alarm').catch((error) => {
      console.warn('[Background] Alarm sync failed:', error);
    });
  }
});

console.log('[Background] Service worker loaded');
