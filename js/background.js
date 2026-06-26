/**
 * Background service worker.
 * Handles startup, alarms, and sync message routing.
 */

importScripts('modules/storage.js', 'modules/feishu-api.js', 'modules/drag-sort-core.js');

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
      chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
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
    chrome.runtime.sendMessage({ type: 'TRIGGER_SYNC' }, (response) => {
      if (chrome.runtime.lastError) {
        handleBackgroundSync().then(sendResponse).catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      } else {
        sendResponse(response);
      }
    });
    return true;
  }

  if (message.type === 'GET_STATUS') {
    chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' }, (response) => {
      sendResponse(response || { error: '无法获取状态' });
    });
    return true;
  }

  return false;
});

async function handleBackgroundSync() {
  try {
    const testMode = await Storage.getTestMode();
    if (testMode) {
      return { success: true, message: '测试模式，跳过同步' };
    }

    const feishuConfig = await Storage.loadFeishuConfig();
    if (!feishuConfig || !feishuConfig.appId) {
      return { success: false, error: '未配置飞书' };
    }

    const flushResult = await flushPendingSortSync('background-sync');
    return {
      success: true,
      message: flushResult.cleared ? '待同步排序已补发' : '同步请求已发起',
      pending: flushResult.pending || null
    };
  } catch (error) {
    console.error('[Background] Sync failed:', error);
    return { success: false, error: error.message };
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

    flushPendingSortSync('alarm').catch((error) => {
      console.warn('[Background] Alarm pending sort flush failed:', error);
    });

    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, () => {
      if (chrome.runtime.lastError) {
        console.log('[Background] No active frontend context, service worker remains responsible');
      }
    });
  }
});

console.log('[Background] Service worker loaded');
