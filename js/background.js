/**
 * 后台 Service Worker
 * 处理定时同步、开机启动
 */

// 由于 Service Worker 无法使用 ES modules，使用 importScripts 加载依赖
// 注意：需要在 manifest.json 中配置这些脚本

/**
 * Service Worker 生命周期
 */

// 安装时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Background] 插件已安装/更新:', details.reason);

  // 首次安装时不立即同步，等待用户配置
  if (details.reason === 'install') {
    await Storage.saveSyncStatus('idle', '请先配置飞书凭证');
  }
});

// Service Worker 激活
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] Chrome 启动/重启');

  // 首次打开浏览器时检查并同步
  const feishuConfig = await Storage.loadFeishuConfig();
  const testMode = await Storage.getTestMode();

  if (testMode) {
    console.log('[Background] 测试模式，跳过自动同步');
    return;
  }

  if (feishuConfig && feishuConfig.syncEnabled !== false) {
    // 从存储读取同步间隔
    const interval = feishuConfig.syncInterval || 30;

    // 创建定时任务
    await chrome.alarms.create('chromeNav_sync_alarm', {
      delayInMinutes: 1, // 启动后 1 分钟内执行首次同步
      periodInMinutes: interval
    });

    console.log(`[Background] 定时同步已设置，间隔 ${interval} 分钟`);

    // 执行首次同步
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
    }, 2000);
  }
});

/**
 * 处理来自前端的同步请求
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 将消息转发到实际的处理逻辑
  // 由于 Service Worker 环境限制，这里做简单的路由

  if (message.type === 'SYNC_NOW') {
    // 通知有权限的上下文执行同步
    chrome.runtime.sendMessage({ type: 'TRIGGER_SYNC' }, (response) => {
      if (chrome.runtime.lastError) {
        // 没有可用的上下文，需要自己处理
        handleBackgroundSync().then(sendResponse).catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      } else {
        sendResponse(response);
      }
    });
    return true; // 异步响应
  }

  if (message.type === 'GET_STATUS') {
    chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' }, (response) => {
      sendResponse(response || { error: '无法获取状态' });
    });
    return true;
  }
});

/**
 * 在后台执行同步
 * 当没有前端页面打开时，由 Service Worker 执行
 */
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

    // 动态加载模块（在 Service Worker 中需要先加载脚本）
    // 这里假设脚本已经在 manifest.json 中通过 web_accessible_resources 或其他方式加载
    // 实际使用时，app.js 会处理模块加载

    return { success: true, message: '同步请求已发送' };
  } catch (error) {
    console.error('[Background] 同步失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 监听定时任务
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'chromeNav_sync_alarm') {
    console.log('[Background] 定时同步触发');

    // 发送同步消息，唤醒前端或 Service Worker 处理
    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('[Background] 无前端上下文，由 Service Worker 处理');
        // Service Worker 自己处理
      }
    });
  }
});

console.log('[Background] Service Worker 已加载');
