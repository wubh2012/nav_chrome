/**
 * Popup 同步状态面板
 *
 * 职责与边界：读取本地同步状态、渲染 popup 状态面板，并在用户点击时触发一次飞书同步；
 * 不负责新标签页 UI、飞书配置表单、定时同步调度或主题变量定义。
 * 关键副作用：读取/写入 chrome.storage.local、调用飞书网络 API、打开选项页、修改 popup DOM。
 * 关键依赖与约束：依赖 Storage、FeishuAPI、ThemeManager、PopupStatusCore 全局模块；
 * 手动同步需要完整飞书配置，测试模式和未配置状态下不会发起网络请求。
 */
document.addEventListener('DOMContentLoaded', () => {
  initPopup().catch((error) => {
    console.error('[Popup] 初始化失败:', error);
    renderMessage('状态面板初始化失败', 'error');
  });
});

/**
 * 初始化 popup 页面。
 *
 * @returns {Promise<void>} 初始化完成后 resolve。
 * @throws {Error} 依赖模块或浏览器 API 异常时向上抛出。
 * @sideeffects 初始化主题、绑定按钮事件并渲染同步状态。
 */
async function initPopup() {
  if (window.ThemeManager) {
    await ThemeManager.init();
  }

  bindEvents();
  await renderSyncStatus();
}

/**
 * 绑定 popup 按钮事件。
 *
 * @returns {void}
 * @throws {Error} 不主动抛错；缺少 DOM 节点时跳过绑定。
 * @sideeffects 绑定设置、刷新和立即同步按钮事件。
 */
function bindEvents() {
  document.getElementById('openOptions')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('refresh-status-btn')?.addEventListener('click', () => {
    renderSyncStatus();
  });

  document.getElementById('sync-now-btn')?.addEventListener('click', () => {
    syncNow();
  });
}

/**
 * 渲染当前同步状态。
 *
 * @returns {Promise<void>} 状态读取和渲染完成后 resolve。
 * @throws {Error} Storage 读取异常时向上抛出。
 * @sideeffects 读取 chrome.storage.local 并更新 popup DOM。
 */
async function renderSyncStatus() {
  const state = await loadPopupState();
  const viewModel = PopupStatusCore.createSyncStatusViewModel(state);

  setText('sync-status-title', viewModel.statusLabel);
  setText('sync-source', viewModel.sourceLabel);
  setText('sync-last-time', viewModel.lastSyncLabel);
  setText('sync-auto', viewModel.autoSyncLabel);
  renderMessage(viewModel.messageLabel, viewModel.statusTone);
  setStatusTone(viewModel.statusTone);
  setSyncButtonState(viewModel.syncButtonEnabled, false);
}

/**
 * 从存储中加载 popup 状态所需数据。
 *
 * @returns {Promise<Object>} 包含测试模式、飞书配置、同步状态和同步时间的状态对象。
 * @throws {Error} Storage API 异常时向上抛出。
 * @sideeffects 读取 chrome.storage.local，不写入任何状态。
 */
async function loadPopupState() {
  const [testMode, feishuConfig, syncStatus, syncTime] = await Promise.all([
    Storage.getTestMode(),
    Storage.loadFeishuConfig(),
    Storage.getSyncStatus(),
    Storage.getSyncTime()
  ]);

  return {
    testMode,
    feishuConfig,
    syncStatus,
    syncTime,
    now: Date.now()
  };
}

/**
 * 执行一次手动同步。
 *
 * @returns {Promise<void>} 同步流程完成后 resolve。
 * @throws {Error} 内部捕获错误并渲染，不向调用方抛出。
 * @sideeffects 可能请求飞书 API、写入导航缓存和同步状态，并更新 popup DOM。
 */
async function syncNow() {
  const button = document.getElementById('sync-now-btn');
  setSyncButtonState(false, true);
  renderMessage('正在同步飞书数据...', 'info');
  setStatusTone('info');

  try {
    const testMode = await Storage.getTestMode();
    if (testMode) {
      renderMessage('测试模式下无需同步飞书数据', 'info');
      await renderSyncStatus();
      return;
    }

    const config = await Storage.loadFeishuConfig();
    if (!PopupStatusCore.isFeishuConfigured(config)) {
      renderMessage('请先配置完整飞书凭证', 'error');
      await renderSyncStatus();
      return;
    }

    await Storage.saveSyncStatus('syncing', '同步中...');
    const result = await FeishuAPI.getRecords(config.appToken, config.tableId);
    if (!result.success || !result.data) {
      throw new Error(result.error || result.message || '获取数据失败');
    }

    await Storage.saveNavData(result.data, result.categories, result.dateInfo);
    await Storage.saveSyncStatus('success', '同步成功');
    renderMessage('同步成功', 'success');
    await notifyOpenPages();
  } catch (error) {
    console.error('[Popup] 手动同步失败:', error);
    await Storage.saveSyncStatus('error', error.message || '同步失败');
    renderMessage(error.message || '同步失败', 'error');
  } finally {
    await renderSyncStatus();
    if (button) {
      button.classList.remove('syncing');
    }
  }
}

/**
 * 通知已打开的新标签页刷新数据。
 *
 * @returns {Promise<void>} 消息发送完成或被忽略后 resolve。
 * @throws {Error} 不主动抛错；无监听页面时忽略 runtime.lastError。
 * @sideeffects 向扩展运行时广播 SYNC_COMPLETE 消息。
 */
function notifyOpenPages() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'SYNC_COMPLETE', timestamp: Date.now() }, () => {
        resolve();
      });
    } catch (_error) {
      resolve();
    }
  });
}

/**
 * 设置元素文本。
 *
 * @param {string} id - DOM 元素 ID。
 * @param {string} text - 要写入的文本。
 * @returns {void}
 * @throws {Error} 不主动抛错。
 * @sideeffects 修改对应 DOM 元素的 textContent。
 */
function setText(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text || '--';
  }
}

/**
 * 渲染状态消息。
 *
 * @param {string} message - 消息内容。
 * @param {string} tone - success、error、warning 或 info。
 * @returns {void}
 * @throws {Error} 不主动抛错。
 * @sideeffects 修改消息 DOM 的文本和样式类。
 */
function renderMessage(message, tone = 'info') {
  const element = document.getElementById('sync-message');
  if (!element) return;

  element.textContent = message || '暂无状态消息';
  element.className = `sync-message ${tone}`;
}

/**
 * 设置顶部状态色点。
 *
 * @param {string} tone - success、error、warning 或 info。
 * @returns {void}
 * @throws {Error} 不主动抛错。
 * @sideeffects 修改状态点 DOM 的样式类。
 */
function setStatusTone(tone) {
  const dot = document.getElementById('sync-status-dot');
  if (!dot) return;

  dot.className = `status-dot ${tone || 'info'}`;
}

/**
 * 设置立即同步按钮状态。
 *
 * @param {boolean} enabled - 是否允许点击。
 * @param {boolean} syncing - 是否显示同步中状态。
 * @returns {void}
 * @throws {Error} 不主动抛错。
 * @sideeffects 修改按钮 disabled、class 和文本。
 */
function setSyncButtonState(enabled, syncing) {
  const button = document.getElementById('sync-now-btn');
  if (!button) return;

  button.disabled = !enabled;
  button.classList.toggle('syncing', Boolean(syncing));
  const label = button.querySelector('span');
  if (label) {
    label.textContent = syncing ? '同步中' : '立即同步';
  }
}
