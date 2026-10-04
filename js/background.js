/**
 * Background service worker.
 * Handles startup, alarms, and sync message routing.
 */

importScripts('modules/storage.js', 'modules/feishu-api.js', 'modules/drag-sort-core.js', 'modules/sync-service.js');

const PENDING_SORT_ALARM = 'chromeNav_pending_sort_retry';
let navigationCommitQueue = Promise.resolve();
let pendingSortFlushQueue = Promise.resolve();

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

  // Recover persisted sort retries before the test-mode early return. Test mode
  // still prevents remote writes in flushLatestPendingSortSync, but a pending
  // production queue must keep its wake-up after Chrome restarts.
  const pendingSorts = await Storage.loadAllPendingSortSyncs();
  if (Object.keys(pendingSorts).length > 0) {
    await chrome.alarms.create(PENDING_SORT_ALARM, { delayInMinutes: 1 });
  }

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
  if (message.type === 'COMMIT_NAV_DATA') {
    commitNavigationState(message).then(sendResponse).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.type === 'SCHEDULE_PENDING_SORT_SYNC') {
    chrome.alarms.create(PENDING_SORT_ALARM, { delayInMinutes: 1 }).then(() => sendResponse({ success: true }));
    return true;
  }

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
      flushPendingSortSync,
      commitNavigationData: commitSyncedNavigationData
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
  return DragSortCore.isSamePendingSortPayload(left, right);
}

function commitSyncedNavigationData(data, categories, dateInfo, options = {}) {
  return runNavigationCommitOperation(async () => {
    const currentRevision = await Storage.getNavDataRevision(options.dataScope);
    if (currentRevision !== Number(options.expectedRevision || 0)) {
      return { success: false, conflict: true, current: await Storage.loadNavData(options.dataScope) };
    }
    return Storage.saveNavData(data, categories, dateInfo, {
      nextRevision: currentRevision + 1,
      dataScope: options.dataScope
    });
  });
}

function commitNavigationState(message) {
  return runNavigationCommitOperation(async () => {
    const currentRevision = await Storage.getNavDataRevision(message.dataScope);
    if (currentRevision !== Number(message.expectedRevision || 0)) {
      return {
        success: false,
        conflict: true,
        current: await Storage.loadNavData(message.dataScope)
      };
    }

    const saved = await Storage.saveNavData(message.data, message.categories, message.dateInfo, {
      preserveSyncTime: message.preserveSyncTime !== false,
      nextRevision: currentRevision + 1,
      pendingSortSync: message.pendingSortSync,
      dataScope: message.dataScope
    });
    return { success: true, revision: saved.revision };
  });
}

function runNavigationCommitOperation(callback) {
  const operation = navigationCommitQueue.then(callback);
  navigationCommitQueue = operation.catch(() => {});
  return operation;
}

function flushPendingSortSync(reason = 'background') {
  const operation = pendingSortFlushQueue.then(() => flushLatestPendingSortSync(reason));
  pendingSortFlushQueue = operation.catch(() => {});
  return operation;
}

function getConfiguredSortScope(config, testMode = false) {
  return testMode ? 'test-mode' : `${config?.appToken || 'unconfigured'}:${config?.tableId || 'default'}`;
}

async function flushLatestPendingSortSync(reason = 'background') {
  const [testMode, config] = await Promise.all([Storage.getTestMode(), Storage.loadFeishuConfig()]);
  if (testMode) return { success: true, skipped: true, cleared: false };

  const scope = getConfiguredSortScope(config, false);
  const prepared = await runNavigationCommitOperation(async () => {
    const pending = await Storage.loadPendingSortSync(scope);
    if (!pending) return { state: 'missing' };
    if (!Array.isArray(pending.updates) || pending.updates.length === 0) {
      await Storage.clearPendingSortSync(scope);
      return { state: 'cleared' };
    }
    await Storage.savePendingSortSync(DragSortCore.markPendingSortSyncing(pending), scope);
    return { state: 'ready', pending };
  });

  if (prepared.state === 'missing') {
    return { success: true, skipped: true, cleared: false };
  }
  if (prepared.state === 'cleared') {
    return { success: true, skipped: true, cleared: true };
  }

  const pending = prepared.pending;

  try {
    const batchResult = await FeishuAPI.batchUpdateRecordSorts(pending.updates);
    const completion = await runNavigationCommitOperation(async () => {
      const latestPending = await Storage.loadPendingSortSync(scope);
      if (latestPending && !isSamePendingPayload(latestPending, pending)) {
        return { cleared: false, pending: latestPending };
      }
      if (latestPending) await Storage.clearPendingSortSync(scope);
      return { cleared: true, pending: null };
    });

    if (completion.cleared) {
      const remaining = await Storage.loadAllPendingSortSyncs();
      if (Object.keys(remaining).length === 0) await chrome.alarms.clear(PENDING_SORT_ALARM);
    } else {
      flushPendingSortSync('newer-sort').catch((error) => {
        console.warn('[Background] Newer sort flush failed:', error);
      });
    }

    return {
      success: true,
      cleared: completion.cleared,
      pending: completion.pending,
      reason,
      batchResult
    };
  } catch (error) {
    console.error('[Background] Pending sort flush failed:', error);
    const failure = await runNavigationCommitOperation(async () => {
      const latestPending = await Storage.loadPendingSortSync(scope);
      if (latestPending && !isSamePendingPayload(latestPending, pending)) {
        return { pending: latestPending };
      }
      if (!latestPending) return { pending: null };
      const failedPending = DragSortCore.markPendingSortFailure(latestPending, error.message);
      await Storage.savePendingSortSync(failedPending, scope);
      return { pending: failedPending };
    });
    if (failure.pending) {
      await chrome.alarms.create(PENDING_SORT_ALARM, { delayInMinutes: 1 });
    }

    return {
      success: false,
      error: error.message,
      pending: failure.pending
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

  if (alarm.name === PENDING_SORT_ALARM) {
    flushPendingSortSync('alarm').catch((error) => {
      console.warn('[Background] Pending sort retry failed:', error);
    });
  }
});

console.log('[Background] Service worker loaded');
