/**
 * Popup 同步状态核心逻辑
 *
 * 职责与边界：把存储层读取到的测试模式、飞书配置、同步状态和同步时间转换为 popup 可渲染文案；
 * 不负责 DOM 操作、Chrome API 调用、飞书网络请求或数据持久化。
 * 关键副作用：无持久化副作用；仅在浏览器环境把 PopupStatusCore 暴露到全局对象。
 * 关键依赖与约束：输入对象中的时间戳使用毫秒；调用方负责脱敏或避免传入敏感配置内容。
 */
(function(root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.PopupStatusCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : null, function() {
  'use strict';

  const DEFAULT_SYNC_INTERVAL = 30;

  /**
   * 创建 popup 同步状态视图模型。
   *
   * @param {Object} state - 原始状态。
   * @param {boolean} state.testMode - 是否处于测试模式。
   * @param {Object|null} state.feishuConfig - 飞书配置；仅检查是否具备必要字段。
   * @param {Object|null} state.syncStatus - Storage.getSyncStatus() 返回的状态对象。
   * @param {number|null} state.syncTime - 最近保存导航数据的毫秒时间戳。
   * @param {number} state.now - 当前毫秒时间戳；省略时使用 Date.now()。
   * @returns {Object} 面板渲染所需的状态、文案、按钮可用性。
   * @throws {Error} 不主动抛错；缺失字段按未配置或未知处理。
   * @sideeffects 无外部副作用。
   */
  function createSyncStatusViewModel(state = {}) {
    const testMode = Boolean(state.testMode);
    const feishuConfig = state.feishuConfig || null;
    const syncStatus = state.syncStatus || null;
    const configured = isFeishuConfigured(feishuConfig);
    const now = Number.isFinite(Number(state.now)) ? Number(state.now) : Date.now();

    if (testMode) {
      return {
        statusLabel: '测试模式',
        statusTone: 'info',
        sourceLabel: '模拟数据',
        lastSyncLabel: formatRelativeTime(state.syncTime, now),
        autoSyncLabel: '已暂停',
        messageLabel: '当前使用本地模拟数据',
        syncButtonEnabled: false
      };
    }

    if (!configured) {
      return {
        statusLabel: '未配置',
        statusTone: 'warning',
        sourceLabel: '未配置飞书',
        lastSyncLabel: formatRelativeTime(state.syncTime, now),
        autoSyncLabel: '未启用',
        messageLabel: '请先配置飞书凭证',
        syncButtonEnabled: false
      };
    }

    const status = normalizeStatus(syncStatus?.status);
    const statusMeta = getStatusMeta(status);

    return {
      statusLabel: statusMeta.label,
      statusTone: statusMeta.tone,
      sourceLabel: '飞书多维表格',
      lastSyncLabel: formatRelativeTime(state.syncTime, now),
      autoSyncLabel: formatAutoSync(feishuConfig),
      messageLabel: syncStatus?.message || statusMeta.message,
      syncButtonEnabled: status !== 'syncing'
    };
  }

  /**
   * 判断飞书配置是否具备同步所需的最小字段。
   *
   * @param {Object|null} config - 飞书配置对象。
   * @returns {boolean} appId、appSecret、appToken、tableId 均存在时返回 true。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function isFeishuConfigured(config) {
    return !!(config && config.appId && config.appSecret && config.appToken && config.tableId);
  }

  /**
   * 标准化同步状态值。
   *
   * @param {string} status - 原始状态。
   * @returns {string} idle、syncing、success、error、offline 之一。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function normalizeStatus(status) {
    const value = String(status || 'idle');
    return ['idle', 'syncing', 'success', 'error', 'offline'].includes(value) ? value : 'idle';
  }

  /**
   * 获取状态对应的显示元信息。
   *
   * @param {string} status - 标准化后的同步状态。
   * @returns {Object} 标签、色调和默认消息。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function getStatusMeta(status) {
    const statusMap = {
      idle: { label: '待同步', tone: 'info', message: '可以手动同步数据' },
      syncing: { label: '同步中', tone: 'info', message: '正在同步飞书数据' },
      success: { label: '同步正常', tone: 'success', message: '同步成功' },
      error: { label: '同步失败', tone: 'error', message: '同步失败，请重试' },
      offline: { label: '离线缓存', tone: 'warning', message: '当前使用缓存数据' }
    };
    return statusMap[status] || statusMap.idle;
  }

  /**
   * 格式化自动同步设置。
   *
   * @param {Object|null} config - 飞书配置。
   * @returns {string} 自动同步显示文案。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function formatAutoSync(config) {
    if (!config || config.syncEnabled === false) {
      return '未启用';
    }

    const interval = Number.isFinite(Number(config.syncInterval))
      ? Number(config.syncInterval)
      : DEFAULT_SYNC_INTERVAL;
    return `每 ${interval} 分钟`;
  }

  /**
   * 格式化相对时间。
   *
   * @param {number|null} timestamp - 毫秒时间戳。
   * @param {number} now - 当前毫秒时间戳。
   * @returns {string} 相对时间文案。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function formatRelativeTime(timestamp, now) {
    const time = Number(timestamp);
    if (!Number.isFinite(time) || time <= 0) {
      return '暂无记录';
    }

    const diffMs = Math.max(0, now - time);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs < minute) {
      return '刚刚';
    }
    if (diffMs < hour) {
      return `${Math.floor(diffMs / minute)} 分钟前`;
    }
    if (diffMs < day) {
      return `${Math.floor(diffMs / hour)} 小时前`;
    }
    if (diffMs < 7 * day) {
      return `${Math.floor(diffMs / day)} 天前`;
    }

    return new Date(time).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  return {
    createSyncStatusViewModel,
    formatRelativeTime,
    isFeishuConfigured
  };
});
