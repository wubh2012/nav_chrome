/**
 * 拖拽排序管理器
 * 仅支持同分类内拖拽，本地立即生效，远程排序延后同步。
 */
const DragSortManager = (function() {
  'use strict';

  const SORT_STEP = (globalThis.DragSortCore && globalThis.DragSortCore.DEFAULT_SORT_STEP) || 10;
  const REMOTE_SYNC_DEBOUNCE_MS = 5 * 1000;
  const REMOTE_SYNC_RETRY_MS = 60 * 1000;

  let toolsGrid = null;
  let draggedCard = null;
  let beforeDragSnapshot = null;
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
      refreshDraggableState(false);
    });

    document.addEventListener('chromeNav:categoryChanged', () => {
      refreshDraggableState(true);
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
  }

  /**
   * 恢复待同步排序并续传。
   */
  async function restorePendingSync() {
    const pending = await Storage.loadPendingSortSync();
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
    const canDrag = category !== 'all' && cards.length > 1;

    cards.forEach((card) => {
      const recordId = card.getAttribute('data-id');
      const draggable = canDrag && !!recordId;
      card.setAttribute('draggable', draggable ? 'true' : 'false');
      card.classList.toggle('drag-disabled', !draggable);
    });

    toolsGrid.classList.toggle('drag-enabled', canDrag);
    toolsGrid.classList.toggle('drag-disabled', !canDrag);

    if (showHint && category === 'all') {
      UIRenderer.showSyncStatus('请进入具体分类后拖拽排序', 'info');
    }
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
    if (!card || card.getAttribute('draggable') !== 'true') {
      event.preventDefault();
      return;
    }

    draggedCard = card;
    beforeDragSnapshot = UIRenderer.getNavDataSnapshot();

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
    const orderedIds = getCards()
      .map((card) => card.getAttribute('data-id'))
      .filter(Boolean);

    cleanupDragState();
    persistOrder(category, orderedIds).catch((error) => {
      console.error('[DragSortManager] 保存排序失败:', error);
      UIRenderer.showSyncStatus(error.message || '排序保存失败', 'error');
    });
  }

  /**
   * 本地保存排序并加入远程同步队列
   * @param {string} category
   * @param {Array<string>} orderedIds
   */
  async function persistOrder(category, orderedIds) {
    if (!category || category === 'all') {
      beforeDragSnapshot = null;
      return;
    }

    const safeSnapshot = beforeDragSnapshot || UIRenderer.getNavDataSnapshot();
    const previousIds = DragSortCore.extractOrderedIds(safeSnapshot.data[category] || []);

    if (DragSortCore.isSameOrder(previousIds, orderedIds)) {
      beforeDragSnapshot = null;
      return;
    }

    const currentSnapshot = UIRenderer.getNavDataSnapshot();
    const reorderResult = DragSortCore.reorderCategoryItems(
      currentSnapshot.data[category] || [],
      orderedIds,
      SORT_STEP
    );

    currentSnapshot.data[category] = reorderResult.reorderedItems;
    UIRenderer.updateCategoryOrder(category, reorderResult.reorderedItems);
    beforeDragSnapshot = null;

    try {
      const testMode = await Storage.getTestMode();

      await Storage.saveNavData(
        currentSnapshot.data,
        currentSnapshot.categories,
        currentSnapshot.dateInfo,
        { preserveSyncTime: true }
      );

      if (testMode || reorderResult.updates.length === 0) {
        await clearPendingSyncState();
        UIRenderer.showSyncStatus('排序已本地保存', 'info');
        return;
      }

      const payload = DragSortCore.createPendingSortPayload(
        category,
        reorderResult.orderedIds,
        reorderResult.updates
      );
      await queueRemoteSync(payload);
      UIRenderer.showSyncStatus('排序已本地保存，5 秒后同步到飞书', 'info');
    } catch (error) {
      console.error('[DragSortManager] 本地排序保存失败:', error);

      if (safeSnapshot) {
        UIRenderer.setNavDataAndRefresh(
          safeSnapshot.data,
          safeSnapshot.categories,
          safeSnapshot.dateInfo
        );
        await Storage.saveNavData(
          safeSnapshot.data,
          safeSnapshot.categories,
          safeSnapshot.dateInfo,
          { preserveSyncTime: true }
        );
      }

      throw error;
    }
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
    if (isRemoteSyncing) {
      return { success: false, queued: true };
    }

    const payload = pendingSyncPayload || await Storage.loadPendingSortSync();
    if (!payload) {
      pendingSyncPayload = null;
      return { success: true, skipped: true };
    }

    if (!Array.isArray(payload.updates) || payload.updates.length === 0) {
      await clearPendingSyncState();
      return { success: true, skipped: true };
    }

    const testMode = await Storage.getTestMode();
    if (testMode) {
      await clearPendingSyncState();
      return { success: true, skipped: true };
    }

    isRemoteSyncing = true;
    setRemoteSyncState(true);

    try {
      pendingSyncPayload = payload;
      await Storage.savePendingSortSync(DragSortCore.markPendingSortSyncing(payload));

      if (reason !== 'pagehide' && reason !== 'visibilitychange') {
        UIRenderer.showSyncStatus('正在后台同步排序...', 'info');
      }

      const batchResult = await FeishuAPI.batchUpdateRecordSorts(payload.updates);
      const storedPending = await Storage.loadPendingSortSync();
      const hasNewerPending = storedPending && !isSamePendingPayload(storedPending, payload);

      if (!hasNewerPending) {
        await clearPendingSyncState();
      } else {
        pendingSyncPayload = storedPending;
      }

      if (reason !== 'pagehide' && reason !== 'visibilitychange') {
        if (batchResult?.skippedCount > 0) {
          UIRenderer.showSyncStatus(`排序已同步（跳过 ${batchResult.skippedCount} 条无效记录）`, 'info');
        } else {
          UIRenderer.showSyncStatus('排序已同步到飞书', 'success');
        }
      }

      if (hasNewerPending || needsImmediateResync) {
        needsImmediateResync = false;
        scheduleRemoteSync(0);
      }

      return { success: true, batchResult };
    } catch (error) {
      console.error('[DragSortManager] 远程排序同步失败:', error);

      const storedPending = await Storage.loadPendingSortSync();
      const hasNewerPending = storedPending && !isSamePendingPayload(storedPending, payload);

      if (!hasNewerPending) {
        const failedPayload = DragSortCore.markPendingSortFailure(payload, error.message);
        pendingSyncPayload = failedPayload;
        await Storage.savePendingSortSync(failedPayload);
        scheduleRetry();
      } else {
        pendingSyncPayload = storedPending;
        scheduleRemoteSync(0);
      }

      UIRenderer.showSyncStatus('本地已保存，远程同步失败，将重试', 'error');
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
    if (!left || !right) {
      return false;
    }

    return String(left.category || '') === String(right.category || '')
      && Number(left.updatedAt || 0) === Number(right.updatedAt || 0);
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
    draggedCard = null;
    clearDragOverStyles();
    if (toolsGrid) {
      toolsGrid.classList.remove('dragging-active');
    }
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
