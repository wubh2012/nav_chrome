/**
 * Background service worker.
 * Handles startup, alarms, and sync message routing.
 */

importScripts('modules/storage.js');

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
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

    return { success: true, message: '同步请求已发起' };
  } catch (error) {
    console.error('[Background] Sync failed:', error);
    return { success: false, error: error.message };
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'chromeNav_sync_alarm') {
    console.log('[Background] Periodic sync alarm triggered');

    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, () => {
      if (chrome.runtime.lastError) {
        console.log('[Background] No active frontend context, service worker remains responsible');
      }
    });
  }
});

console.log('[Background] Service worker loaded');
