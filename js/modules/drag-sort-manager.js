/**
 * 拖拽排序管理器
 * 整理模式下支持全局及分类内拖拽，本地立即生效，远程排序延后同步。
 */
const DragSortManager = (function() {
  'use strict';

  const SORT_STEP = (globalThis.DragSortCore && globalThis.DragSortCore.DEFAULT_SORT_STEP) || 10;
  const REMOTE_SYNC_DEBOUNCE_MS = 5 * 1000;
  const REMOTE_SYNC_RETRY_MS = 60 * 1000;

  let toolsGrid = null;
  let draggedCard = null;
  let beforeDragSnapshot = null;
  let initialCardOrder = [];
  let dropHandled = false;
  let dragCategory = null;
  let suppressClickUntil = 0;
  let isSavingOrder = false;
  let pendingSyncPayload = null;
  let syncTimer = null;
  let retryTimer = null;
  let isRemoteSyncing = false;
  let needsImmediateResync = false;

  /**
   * 初始化
   */
  function init() {
    toolsGrid = document.getElementById('tools-grid');
    if (!toolsGrid) return;

    bindGridEvents();
    bindRendererEvents();
    bindLifecycleEvents();
    restorePendingSync().catch((error) => {
      console.warn('[DragSortManager] 恢复待同步排序失败:', error);
    });
    refreshDraggableState(false);
    console.log('[DragSortManager] 初始化完成');
  }

  /**
   * 绑定 UI 渲染事件
   */
  function bindRendererEvents() {
    document.addEventListener('chromeNav:toolsRendered', () => {
      cancelActiveDrag(false);
      refreshDraggableState(false);
    });

    document.addEventListener('chromeNav:categoryChanged', () => {
      cancelActiveDrag(false);
      refreshDraggableState(true);
    });

    document.body.addEventListener('chromeNav:siteManageModeChanged', () => {
      cancelActiveDrag(true);
      refreshDraggableState(false);
    });
  }

  /**
   * 绑定页面生命周期事件
   */
  function bindLifecycleEvents() {
    window.addEventListener('pagehide', () => {
      requestBackgroundFlush('pagehide');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        requestBackgroundFlush('visibilitychange');
      }
    });
  }

  /**
   * 绑定拖拽事件
   */
  function bindGridEvents() {
    toolsGrid.addEventListener('dragstart', handleDragStart);
    toolsGrid.addEventListener('dragover', handleDragOver);
    toolsGrid.addEventListener('drop', handleDrop);
    toolsGrid.addEventListener('dragend', cleanupDragState);
    toolsGrid.addEventListener('click', suppressPostDragClick, true);
  }

  /**
   * 恢复待同步排序并续传。
   */
  async function restorePendingSync() {
    const testMode = await Storage.getTestMode();
    const config = testMode ? null : await Storage.loadFeishuConfig();
    const pending = await Storage.loadPendingSortSync(getDataScope(config, testMode));
    if (!pending) {
      return;
    }

    pendingSyncPayload = pending;
    const delay = DragSortCore.getPendingSyncDelay(
      pending.updatedAt,
      Date.now(),
      REMOTE_SYNC_DEBOUNCE_MS
    );
    scheduleRemoteSync(delay);
  }

  /**
   * 刷新可拖拽状态
   * @param {boolean} showHint
   */
  function refreshDraggableState(showHint = false) {
    if (!toolsGrid) return;

    const category = UIRenderer.getCurrentCategory();
    const cards = getCards();
    const manageMode = document.body.classList.contains('site-manage-mode');
    const canDrag = manageMode && !isSavingOrder
      && !document.body.classList.contains('link-manager-saving')
      && cards.length > 1;

    cards.forEach((card) => {
      const recordId = card.getAttribute('data-id');
      const draggable = canDrag && !!recordId;
      card.setAttribute('draggable', draggable ? 'true' : 'false');
      card.classList.toggle('drag-disabled', !draggable);
    });

    toolsGrid.classList.toggle('drag-enabled', canDrag);
    toolsGrid.classList.toggle('drag-disabled', !canDrag);

    if (showHint && category === 'all' && !manageMode) return;
  }

  /**
   * 获取当前卡片列表
   */
  function getCards() {
    if (!toolsGrid) return [];
    return Array.from(toolsGrid.querySelectorAll('.tool-item'));
  }

  /**
   * 拖拽开始
   * @param {DragEvent} event
   */
  function handleDragStart(event) {
    const card = event.target.closest('.tool-item');
    const startedFromAction = event.target.closest('button, .tool-item-edit-btn, .tool-item-delete-btn');
    if (!card || startedFromAction || !document.body.classList.contains('site-manage-mode')
      || card.getAttribute('draggable') !== 'true') {
      event.preventDefault();
      return;
    }

    draggedCard = card;
    beforeDragSnapshot = UIRenderer.getNavDataSnapshot();
    initialCardOrder = getCards();
    dragCategory = UIRenderer.getCurrentCategory();
    dropHandled = false;

    draggedCard.classList.add('dragging');
    toolsGrid.classList.add('dragging-active');

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.getAttribute('data-id') || '');
  }

  /**
   * 拖拽经过
   * @param {DragEvent} event
   */
  function handleDragOver(event) {
    if (!draggedCard) return;

    event.preventDefault();

    const target = event.target.closest('.tool-item');
    if (!target || target === draggedCard) return;

    clearDragOverStyles();

    const insertBefore = shouldInsertBefore(event, target);
    target.classList.add('drag-over');
    target.classList.toggle('drag-over-before', insertBefore);
    target.classList.toggle('drag-over-after', !insertBefore);

    if (insertBefore) {
      if (target !== draggedCard.nextSibling) {
        toolsGrid.insertBefore(draggedCard, target);
      }
    } else if (target.nextSibling !== draggedCard) {
      toolsGrid.insertBefore(draggedCard, target.nextSibling);
    }
  }

  /**
   * 计算是否插入到目标前面
   * @param {DragEvent} event
   * @param {HTMLElement} target
   */
  function shouldInsertBefore(event, target) {
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = event.clientX - centerX;
    const deltaY = event.clientY - centerY;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX < 0;
    }
    return deltaY < 0;
  }

  /**
   * 拖拽放下
   * @param {DragEvent} event
   */
  function handleDrop(event) {
    if (!draggedCard) return;

    event.preventDefault();
    const category = UIRenderer.getCurrentCategory();
    if (category !== dragCategory || !document.body.classList.contains('site-manage-mode')) {
      cancelActiveDrag(true);
      return;
    }

    const visibleIds = getCards()
      .map((card) => card.getAttribute('data-id'))
      .filter(Boolean);

    dropHandled = true;
    suppressClickUntil = Date.now() + 500;
    cleanupDragState();
    persistOrder(category, visibleIds, beforeDragSnapshot).catch((error) => {
      console.error('[DragSortManager] 保存排序失败:', error);
      UIRenderer.showSyncStatus(error.message || '排序保存失败', 'error');
    }).finally(() => {
      beforeDragSnapshot = null;
      initialCardOrder = [];
      dragCategory = null;
      dropHandled = false;
      isSavingOrder = false;
      document.body.classList.remove('drag-sort-saving');
      refreshDraggableState(false);
    });
  }

  /**
   * 本地保存排序并加入远程同步队列
   * @param {string} category
   * @param {Array<string>} orderedIds
   */
  async function persistOrder(category, visibleIds, snapshot) {
    if (!category || !snapshot) return;
    const orderedBefore = getVisibleGlobalIds(snapshot.data);
    const currentGlobalIds = orderedBefore;
    const result = category === 'all'
      ? DragSortCore.reorderNavDataByGlobalOrder(snapshot.data, visibleIds, SORT_STEP)
      : DragSortCore.reorderCategoryWithinGlobalOrder(snapshot.data, category, visibleIds, currentGlobalIds, SORT_STEP);

    if (DragSortCore.isSameOrder(orderedBefore, result.orderedIds)) return;

    isSavingOrder = true;
    document.body.classList.add('drag-sort-saving');
    refreshDraggableState(false);
    const testMode = await Storage.getTestMode();
    const config = testMode ? null : await Storage.loadFeishuConfig();
    const scope = getDataScope(config, testMode);
    const payload = !testMode && result.updates.length > 0
      ? DragSortCore.createGlobalPendingSortPayload(result.orderedIds, result.updates, scope)
      : null;

    try {
      const saved = await Storage.commitNavData(
        result.data, snapshot.categories, snapshot.dateInfo,
        { expectedRevision: snapshot.revision, pendingSortSync: payload, dataScope: scope }
      );
      if (!saved.success) {
        if (saved.conflict && saved.current) applyCommittedState(saved.current);
        throw new Error(saved.conflict ? '网站列表已在其他标签页更新，请重试排序' : '本地排序保存失败');
      }

      applyCommittedState({
        data: result.data,
        categories: snapshot.categories,
        dateInfo: snapshot.dateInfo,
        revision: saved.revision
      });

      if (payload) {
        pendingSyncPayload = payload;
        scheduleRemoteSync(REMOTE_SYNC_DEBOUNCE_MS);
        UIRenderer.showSyncStatus('排序已保存，5 秒后同步到飞书', 'info');
      } else {
        UIRenderer.showSyncStatus('排序已保存', 'success');
      }
    } catch (error) {
      if (!(error && error.committedConflict)) {
        const latest = await Storage.loadNavData(scope);
        if (latest) applyCommittedState(latest);
      }
      throw error;
    }
  }

  function getVisibleGlobalIds(data) {
    return UIRendererCore.flattenToolsByCategoryPriority(data).map((item) => item.id).filter(Boolean);
  }

  function getDataScope(config, testMode) {
    return testMode ? 'test-mode' : `${config?.appToken || 'unconfigured'}:${config?.tableId || 'default'}`;
  }

  function applyCommittedState(snapshot) {
    UIRenderer.setNavDataAndRefresh(snapshot.data, snapshot.categories, snapshot.dateInfo, snapshot.revision);
  }

  /**
   * 将待同步排序加入远程同步队列
   * @param {Object} payload
   */
  async function queueRemoteSync(payload) {
    clearTimeout(retryTimer);
    retryTimer = null;

    pendingSyncPayload = payload;
    await Storage.savePendingSortSync(payload);

    if (isRemoteSyncing) {
      needsImmediateResync = true;
      return;
    }

    scheduleRemoteSync(REMOTE_SYNC_DEBOUNCE_MS);
  }

  /**
   * 安排远程同步
   * @param {number} delay
   */
  function scheduleRemoteSync(delay) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      flushPendingRemoteSync('debounce').catch((error) => {
        console.warn('[DragSortManager] 远程排序同步失败:', error);
      });
    }, Math.max(0, delay));
  }

  /**
   * 安排失败重试
   */
  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      flushPendingRemoteSync('retry').catch((error) => {
        console.warn('[DragSortManager] 重试同步排序失败:', error);
      });
    }, REMOTE_SYNC_RETRY_MS);
  }

  /**
   * 执行待同步排序的远程同步
   * @param {string} reason
   * @returns {Promise<Object>}
   */
  async function flushPendingRemoteSync(reason = 'manual') {
    const payload = pendingSyncPayload;
    if (!payload || isRemoteSyncing) return { success: true, skipped: true };

    isRemoteSyncing = true;
    setRemoteSyncState(true);
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'FLUSH_PENDING_SORT_SYNC', reason }, (result) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(result || { success: false, error: '后台未返回同步结果' });
        });
      });
      const latest = await Storage.loadPendingSortSync(payload.dataScope);
      if (response.success && !latest) {
        clearLocalPendingMarkers();
        UIRenderer.showSyncStatus('排序已同步到飞书', 'success');
      } else if (latest && !isSamePendingPayload(latest, payload)) {
        pendingSyncPayload = latest;
        scheduleRemoteSync(0);
      } else if (!response.success) {
        UIRenderer.showSyncStatus('本地已保存，飞书同步将在后台重试', 'error');
      }
      return response;
    } catch (error) {
      UIRenderer.showSyncStatus('本地已保存，飞书同步将在后台重试', 'error');
      return { success: false, error };
    } finally {
      isRemoteSyncing = false;
      setRemoteSyncState(false);
    }
  }

  /**
   * 请求后台立即补发待同步排序
   * @param {string} reason
   */
  async function requestBackgroundFlush(reason) {
    const existingPending = pendingSyncPayload || await Storage.loadPendingSortSync();
    if (!existingPending) {
      return;
    }

    try {
      chrome.runtime.sendMessage({ type: 'FLUSH_PENDING_SORT_SYNC', reason }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          return;
        }

        if (response.cleared) {
          clearLocalPendingMarkers();
        } else if (response.pending) {
          pendingSyncPayload = response.pending;
        }
      });
    } catch (_error) {
      // 页面关闭阶段只做最佳努力补发。
    }
  }

  /**
   * 判断两个待同步负载是否为同一版本
   * @param {Object|null} left
   * @param {Object|null} right
   * @returns {boolean}
   */
  function isSamePendingPayload(left, right) {
    return DragSortCore.isSamePendingSortPayload(left, right);
  }

  /**
   * 清除本地挂起状态与持久化记录
   */
  async function clearPendingSyncState() {
    clearLocalPendingMarkers();
    await Storage.clearPendingSortSync();
  }

  /**
   * 仅清除内存中的挂起状态
   */
  function clearLocalPendingMarkers() {
    pendingSyncPayload = null;
    needsImmediateResync = false;
    clearTimeout(syncTimer);
    clearTimeout(retryTimer);
    syncTimer = null;
    retryTimer = null;
  }

  /**
   * 设置远程同步中状态
   * @param {boolean} syncing
   */
  function setRemoteSyncState(syncing) {
    document.body.classList.toggle('drag-sort-syncing', syncing);
  }

  /**
   * 清理拖拽状态
   */
  function cleanupDragState() {
    if (draggedCard) {
      draggedCard.classList.remove('dragging');
    }
    if (!dropHandled && initialCardOrder.length > 0) restoreCardOrder();
    draggedCard = null;
    clearDragOverStyles();
    if (toolsGrid) {
      toolsGrid.classList.remove('dragging-active');
    }
  }

  function restoreCardOrder() {
    if (!toolsGrid || typeof toolsGrid.appendChild !== 'function') return;
    initialCardOrder.forEach((card) => {
      if (card?.parentNode === toolsGrid || card?.parentElement === toolsGrid) toolsGrid.appendChild(card);
    });
  }

  function cancelActiveDrag(restoreOrder) {
    if (!draggedCard) return;
    if (restoreOrder) restoreCardOrder();
    dropHandled = true;
    cleanupDragState();
    dropHandled = false;
    beforeDragSnapshot = null;
    initialCardOrder = [];
    dragCategory = null;
  }

  function suppressPostDragClick(event) {
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    suppressClickUntil = 0;
  }

  /**
   * 清除目标样式
   */
  function clearDragOverStyles() {
    const cards = getCards();
    cards.forEach((card) => {
      card.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
    });
  }

  // ==================== 公共 API ====================

  return {
    init,
    refreshDraggableState
  };
})();

// 导出到全局
globalThis.DragSortManager = DragSortManager;
