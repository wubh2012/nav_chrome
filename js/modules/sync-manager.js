/**
 * 同步管理器 - 处理飞书数据同步
 * 定时同步 + 手动同步 + 失败重试
 */
const SyncManager = (function() {
  'use strict';

  // 重试配置
  const MAX_RETRIES = 3;
  const RETRY_INTERVAL = 1 * 60 * 1000; // 1 分钟
  const DEFAULT_SYNC_INTERVAL = 30; // 默认 30 分钟

  // 当前状态
  let syncInterval = DEFAULT_SYNC_INTERVAL;
  let isSyncing = false;
  let retryCount = 0;
  let retryTimer = null;
  let syncAlarmName = 'chromeNav_sync_alarm';
  let isPeriodicEnabled = false;

  /**
   * 启动定时同步
   * @param {number} intervalMinutes - 同步间隔（分钟）
   */
  async function startPeriodicSync(intervalMinutes = DEFAULT_SYNC_INTERVAL) {
    syncInterval = intervalMinutes;

    // 取消现有的定时任务
    await stopPeriodicSync();

    // 创建新的定时任务
    await chrome.alarms.create(syncAlarmName, {
      delayInMinutes: syncInterval,
      periodInMinutes: syncInterval
    });

    isPeriodicEnabled = true;
    console.log(`[SyncManager] 定时同步已启动，间隔 ${syncInterval} 分钟`);

    // 立即执行一次同步
    await syncNow();
  }

  /**
   * 停止定时同步
   */
  async function stopPeriodicSync() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    await chrome.alarms.clear(syncAlarmName);
    isPeriodicEnabled = false;
    retryCount = 0;
    console.log('[SyncManager] 定时同步已停止');
  }

  /**
   * 立即同步
   */
  async function syncNow() {
    if (isSyncing) {
      console.log('[SyncManager] 同步已在进行中，跳过');
      return;
    }

    await handleSync();
  }

  /**
   * 处理同步逻辑
   */
  async function handleSync() {
    // 检查是否启用测试模式
    const testMode = await Storage.getTestMode();
    if (testMode) {
      console.log('[SyncManager] 测试模式，跳过同步');
      return;
    }

    // 检查飞书配置
    const feishuConfig = await Storage.loadFeishuConfig();
    if (!feishuConfig || !feishuConfig.appId || !feishuConfig.appToken) {
      console.log('[SyncManager] 未配置飞书，跳过同步');
      return;
    }

    isSyncing = true;
    await Storage.saveSyncStatus('syncing', '同步中...');

    try {
      // 获取飞书数据
      const result = await FeishuAPI.getRecords(feishuConfig.appToken, feishuConfig.tableId);

      if (result.success && result.data) {
        // 处理数据
        const { categories, navData, dateInfo } = processFeishuData(result.data);

        // 保存到存储
        await Storage.saveNavData(navData, categories, dateInfo);

        // 更新同步时间
        await Storage.saveSyncStatus('success', '同步成功');
        retryCount = 0; // 重置重试计数

        console.log(`[SyncManager] 同步成功，共 ${categories.length} 个分类`);

        // 通知前端更新（如果有页面打开着）
        notifyFrontend();
      } else {
        throw new Error(result.error || '获取数据失败');
      }
    } catch (error) {
      console.error('[SyncManager] 同步失败:', error);
      await Storage.saveSyncStatus('error', error.message);

      // 处理重试
      handleRetry();
    } finally {
      isSyncing = false;
    }
  }

  /**
   * 处理重试逻辑
   */
  async function handleRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    if (retryCount < MAX_RETRIES) {
      retryCount++;
      await Storage.saveSyncStatus('error', `同步失败，${RETRY_INTERVAL / 1000}秒后重试 (${retryCount}/${MAX_RETRIES})`);

      console.log(`[SyncManager] 准备第 ${retryCount} 次重试...`);

      retryTimer = setTimeout(async () => {
        await handleSync();
      }, RETRY_INTERVAL);
    } else {
      await Storage.saveSyncStatus('error', `同步失败，已重试 ${MAX_RETRIES} 次`);
      console.error(`[SyncManager] 同步失败，已重试 ${MAX_RETRIES} 次`);
    }
  }

  /**
   * 获取网站图标 URL
   * 优先使用备用图标，否则使用 Google Favicon 服务
   * @param {string} fallbackIcon - 飞书配置的备用图标
   * @param {string} url - 网站 URL
   * @returns {string} 图标 URL 或图标内容
   */
  function getIconUrl(fallbackIcon, url) {
    // 如果有备用图标，直接返回
    if (fallbackIcon && fallbackIcon.trim()) {
      return fallbackIcon;
    }

    // 没有备用图标时，使用 Google Favicon 服务
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
    } catch (e) {
      return '';
    }
  }

  /**
   * 处理飞书返回的数据
   * @param {Array} records - 飞书记录数组
   * @returns {Object} { categories, navData, dateInfo }
   */
  function processFeishuData(records) {
    const categoryMap = {};
    const categories = [];

    records.forEach(record => {
      const fields = record.fields || {};
      const category = fields['分类'] || '未分类';

      if (!categoryMap[category]) {
        categoryMap[category] = [];
        categories.push(category);
      }

      // 解析网址字段
      let url = fields['网址'];
      if (url && typeof url === 'object' && url.link) {
        url = url.link;
      }

      const fallbackIcon = fields['图标'] || '';

      categoryMap[category].push({
        name: fields['站点名称'] || '未命名',
        url: url || '',
        icon: getIconUrl(fallbackIcon, url),
        sort: fields['排序'] || 0
      });
    });

    // 按 sort 排序
    categories.sort();
    for (const cat of categories) {
      categoryMap[cat].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    }

    // 日期信息（农历）
    let dateInfo = null;
    try {
      if (typeof Lunar !== 'undefined') {
        const lunar = Lunar.fromSolar(Date.now());
        dateInfo = {
          lunar: lunar.toString(),
          festivals: lunar.getFestivals(),
          week: new Date().getDay()
        };
      }
    } catch (e) {
      console.warn('[SyncManager] 农历计算失败:', e);
    }

    return {
      categories,
      navData: categoryMap,
      dateInfo
    };
  }

  /**
   * 通知前端页面更新
   */
  function notifyFrontend() {
    try {
      chrome.runtime.sendMessage({
        type: 'SYNC_COMPLETE',
        timestamp: Date.now()
      });
    } catch (e) {
      // 没有打开的前端页面，忽略
    }
  }

  /**
   * 获取同步状态
   * @returns {Promise<Object>}
   */
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

  /**
   * 初始化同步管理器
   */
  async function init() {
    // 监听定时任务触发
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === syncAlarmName) {
        console.log('[SyncManager] 定时任务触发');
        handleSync();
      }
    });

    // 监听来自前端的同步请求
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SYNC_NOW') {
        syncNow().then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
        return true; // 异步响应
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
        });
        return true;
      }

      if (message.type === 'STOP_PERIODIC_SYNC') {
        stopPeriodicSync().then(() => {
          sendResponse({ success: true });
        });
        return true;
      }
    });

    console.log('[SyncManager] 初始化完成');
  }

  // ==================== 公共 API ====================

  return {
    init,
    startPeriodicSync,
    stopPeriodicSync,
    syncNow,
    handleSync,
    getStatus
  };
})();

// 导出到全局
window.SyncManager = SyncManager;
