/**
 * 拖拽排序管理器
 * 仅支持同分类内拖拽，拖拽后自动保存排序
 */
const DragSortManager = (function() {
  'use strict';

  const SORT_STEP = 10;

  let toolsGrid = null;
  let draggedCard = null;
  let beforeDragSnapshot = null;
  let isSaving = false;

  /**
   * 初始化
   */
  function init() {
    toolsGrid = document.getElementById('tools-grid');
    if (!toolsGrid) return;

    bindGridEvents();
    bindRendererEvents();
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
   * 绑定拖拽事件
   */
  function bindGridEvents() {
    toolsGrid.addEventListener('dragstart', handleDragStart);
    toolsGrid.addEventListener('dragover', handleDragOver);
    toolsGrid.addEventListener('drop', handleDrop);
    toolsGrid.addEventListener('dragend', cleanupDragState);
  }

  /**
   * 刷新可拖拽状态
   * @param {boolean} showHint
   */
  function refreshDraggableState(showHint = false) {
    if (!toolsGrid) return;

    const category = UIRenderer.getCurrentCategory();
    const cards = getCards();
    const canDrag = category !== 'all' && cards.length > 1 && !isSaving;

    cards.forEach(card => {
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
    if (isSaving) {
      event.preventDefault();
      return;
    }

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
    if (!draggedCard || isSaving) return;

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
    if (!draggedCard || isSaving) return;

    event.preventDefault();

    const category = UIRenderer.getCurrentCategory();
    const orderedIds = getCards()
      .map(card => card.getAttribute('data-id'))
      .filter(Boolean);

    cleanupDragState();
    persistOrder(category, orderedIds);
  }

  /**
   * 保存排序
   * @param {string} category
   * @param {Array<string>} orderedIds
   */
  async function persistOrder(category, orderedIds) {
    if (!category || category === 'all' || isSaving) {
      return;
    }

    const safeSnapshot = beforeDragSnapshot || UIRenderer.getNavDataSnapshot();
    const previousIds = (safeSnapshot.data[category] || [])
      .map(item => item.id)
      .filter(Boolean);

    if (isSameOrder(previousIds, orderedIds)) {
      beforeDragSnapshot = null;
      return;
    }

    const currentSnapshot = UIRenderer.getNavDataSnapshot();
    const categoryItems = currentSnapshot.data[category] || [];
    const itemMap = new Map();
    const itemsWithoutId = [];

    categoryItems.forEach(item => {
      if (item && item.id) {
        itemMap.set(String(item.id), item);
      } else if (item) {
        itemsWithoutId.push(item);
      }
    });

    const reordered = [];
    orderedIds.forEach(id => {
      const key = String(id);
      if (itemMap.has(key)) {
        reordered.push(itemMap.get(key));
        itemMap.delete(key);
      }
    });

    // 兜底：防止异常情况下数据丢失
    itemMap.forEach(item => reordered.push(item));
    itemsWithoutId.forEach(item => reordered.push(item));

    const changedItems = [];
    reordered.forEach((item, index) => {
      const nextSort = (index + 1) * SORT_STEP;
      if (item.sort !== nextSort) {
        item.sort = nextSort;
        changedItems.push(item);
      }
    });

    currentSnapshot.data[category] = reordered;

    isSaving = true;
    setSavingState(true);
    UIRenderer.showSyncStatus('正在保存排序...', 'info');

    try {
      const testMode = await Storage.getTestMode();
      let batchResult = null;

      if (!testMode) {
        const updates = changedItems
          .filter(item => item.id && !String(item.id).startsWith('mock-'))
          .map(item => ({
            recordId: item.id,
            sort: item.sort
          }));

        if (updates.length > 0) {
          batchResult = await FeishuAPI.batchUpdateRecordSorts(updates);
        }
      }

      UIRenderer.setNavDataAndRefresh(
        currentSnapshot.data,
        currentSnapshot.categories,
        currentSnapshot.dateInfo
      );
      await Storage.saveNavData(
        currentSnapshot.data,
        currentSnapshot.categories,
        currentSnapshot.dateInfo
      );

      if (testMode) {
        UIRenderer.showSyncStatus('测试模式：排序已本地保存', 'info');
      } else if (batchResult?.skippedCount > 0) {
        UIRenderer.showSyncStatus(`排序已保存（跳过 ${batchResult.skippedCount} 条无效记录）`, 'info');
      } else {
        UIRenderer.showSyncStatus('排序已保存', 'success');
      }
    } catch (error) {
      console.error('[DragSortManager] 保存排序失败:', error);

      if (safeSnapshot) {
        UIRenderer.setNavDataAndRefresh(
          safeSnapshot.data,
          safeSnapshot.categories,
          safeSnapshot.dateInfo
        );
        await Storage.saveNavData(
          safeSnapshot.data,
          safeSnapshot.categories,
          safeSnapshot.dateInfo
        );
      }

      UIRenderer.showSyncStatus(`排序保存失败: ${error.message}`, 'error');
    } finally {
      beforeDragSnapshot = null;
      isSaving = false;
      setSavingState(false);
      refreshDraggableState(false);
    }
  }

  /**
   * 比较顺序是否一致
   * @param {Array<string>} previousIds
   * @param {Array<string>} orderedIds
   */
  function isSameOrder(previousIds, orderedIds) {
    if (previousIds.length !== orderedIds.length) return false;
    for (let i = 0; i < previousIds.length; i++) {
      if (String(previousIds[i]) !== String(orderedIds[i])) {
        return false;
      }
    }
    return true;
  }

  /**
   * 设置保存中状态
   * @param {boolean} saving
   */
  function setSavingState(saving) {
    document.body.classList.toggle('drag-sort-saving', saving);
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
    cards.forEach(card => {
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
window.DragSortManager = DragSortManager;
