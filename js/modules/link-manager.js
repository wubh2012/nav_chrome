/**
 * 链接管理器
 *
 * 职责与边界：管理新标签页链接的新增、编辑、删除、表单校验、重复 URL 检测和图标预览交互；
 * 不负责导航卡片主渲染、飞书底层请求封装、浏览器存储封装或同步调度策略。
 * 关键副作用：读写当前页面 DOM、调用 FeishuAPI 增删改记录、调用 Storage 刷新本地缓存、
 * 触发 UIRenderer 重新渲染并加载 favicon 图片预览；不直接新增扩展权限或读取浏览器书签。
 * 关键依赖与约束：依赖 newtab.html 的固定表单 ID、LinkManagerCore 纯逻辑模块、
 * FeishuAPI、Storage、UIRenderer 和 Chrome Extension 页面环境。
 */
const LinkManager = (function() {
  'use strict';

  const core = window.LinkManagerCore || {};
  const REMOTE_DELETE_RETRY_MS = 60 * 1000;

  let currentDeleteLink = null;
  let currentEditingLink = null;
  let defaultSiteSort = 10;
  let cachedCategories = [];
  let lastSuggestedIconUrl = '';
  let deletedLocalRecordIds = new Set();
  let pendingRemoteDeleteIds = new Set();
  let remoteDeleteRetryTimer = null;

  /**
   * 初始化链接管理器并绑定弹窗、表单和卡片编辑入口。
   *
   * @param {Array<string>} categories - 当前导航分类列表；非数组会按空数组处理。
   * @returns {Promise<void>} 初始化完成后解析；当前实现不抛业务错误。
   * @throws {Error} 不主动抛错；DOM API 异常会向上冒泡。
   * @sideeffects 绑定 DOM 事件、初始化图标预览状态并缓存分类列表。
   */
  async function init(categories) {
    cachedCategories = Array.isArray(categories) ? categories : [];
    bindModalEvents();
    bindFormEvents();
    bindToolEditActions();
    resetIconPreview();
    console.log('[LinkManager] 初始化完成');
  }

  /**
   * 绑定添加/编辑弹窗和删除确认弹窗的打开、关闭、确认事件。
   *
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错；事件监听注册失败会由 DOM API 抛出。
   * @sideeffects 给弹窗按钮和遮罩注册一次性事件监听。
   */
  function bindModalEvents() {
    const addModal = document.getElementById('add-link-modal');
    if (addModal) {
      bindOnce(document.getElementById('add-link-btn'), 'click', openAddModal);
      bindOnce(document.getElementById('close-modal-btn'), 'click', closeAddModal);
      bindOnce(document.getElementById('cancel-add-btn'), 'click', closeAddModal);
      bindOnce(addModal.querySelector('.modal-overlay'), 'click', closeAddModal);
    }

    const deleteModal = document.getElementById('delete-link-modal');
    if (deleteModal) {
      bindOnce(document.getElementById('close-delete-modal-btn'), 'click', closeDeleteModal);
      bindOnce(document.getElementById('cancel-delete-btn'), 'click', closeDeleteModal);
      bindOnce(document.getElementById('confirm-delete-btn'), 'click', confirmDelete);
      bindOnce(deleteModal.querySelector('.modal-overlay'), 'click', closeDeleteModal);
    }
  }

  /**
   * 绑定链接表单字段变化和保存按钮事件。
   *
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错；事件监听注册失败会由 DOM API 抛出。
   * @sideeffects 给 URL、图标、分类和保存控件注册事件监听。
   */
  function bindFormEvents() {
    const urlInput = document.getElementById('site-url');
    const iconInput = document.getElementById('site-icon');
    const faviconBtn = document.getElementById('use-favicon-btn');
    const categorySelect = document.getElementById('site-category');
    const saveBtn = document.getElementById('save-link-btn');

    if (urlInput && !urlInput.dataset.linkManagerBound) {
      urlInput.dataset.linkManagerBound = 'true';
      urlInput.addEventListener('input', debounce(() => {
        refreshSuggestedFields({ suggestName: true, autoFillIcon: true });
      }, 400));
    }

    if (iconInput && !iconInput.dataset.linkManagerBound) {
      iconInput.dataset.linkManagerBound = 'true';
      iconInput.addEventListener('input', () => {
        updateIconPreview(iconInput.value.trim(), iconInput.value.trim() ? '正在预览手动图标' : '图标为空时会使用文字图标');
      });
    }

    if (faviconBtn && !faviconBtn.dataset.linkManagerBound) {
      faviconBtn.dataset.linkManagerBound = 'true';
      faviconBtn.addEventListener('click', applySuggestedFavicon);
    }

    if (categorySelect && !categorySelect.dataset.linkManagerBound) {
      categorySelect.dataset.linkManagerBound = 'true';
      categorySelect.addEventListener('change', handleCategoryChange);
    }

    if (saveBtn && !saveBtn.dataset.linkManagerBound) {
      saveBtn.dataset.linkManagerBound = 'true';
      saveBtn.addEventListener('click', saveLink);
    }
  }

  /**
   * 给元素绑定一次事件，避免重复初始化造成多次触发。
   *
   * @param {HTMLElement|null} element - 要绑定的 DOM 元素；为空时直接忽略。
   * @param {string} eventName - DOM 事件名。
   * @param {Function} handler - 事件处理函数。
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错；addEventListener 失败会向上冒泡。
   * @sideeffects 写入 element.dataset.linkManagerBound 并注册事件监听。
   */
  function bindOnce(element, eventName, handler) {
    if (!element || element.dataset.linkManagerBound) return;
    element.dataset.linkManagerBound = 'true';
    element.addEventListener(eventName, handler);
  }

  /**
   * 绑定工具卡片渲染完成后的编辑按钮注入流程。
   *
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错；DOM 事件注册异常会向上冒泡。
   * @sideeffects 注册 chromeNav:toolsRendered 监听，并立即尝试注入编辑按钮。
   */
  function bindToolEditActions() {
    if (!document.body.dataset.linkManagerToolActionsBound) {
      document.body.dataset.linkManagerToolActionsBound = 'true';
      document.addEventListener('chromeNav:toolsRendered', injectEditButtons);
    }
    injectEditButtons();
  }

  /**
   * 给当前工具卡片补充编辑按钮。
   *
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错；DOM 插入异常会向上冒泡。
   * @sideeffects 创建按钮、绑定点击事件并写入卡片 DOM。
   */
  function injectEditButtons() {
    const cards = document.querySelectorAll('.tool-item');
    cards.forEach(card => {
      if (card.querySelector('.tool-item-edit-btn')) return;

      const editBtn = document.createElement('button');
      editBtn.className = 'tool-item-edit-btn';
      editBtn.title = '编辑';
      editBtn.setAttribute('aria-label', `编辑 ${card.title || '网站'}`);
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
      editBtn.addEventListener('click', event => {
        event.stopPropagation();
        const tool = resolveToolFromCard(card);
        if (tool) {
          openEditModal(tool);
        }
      });

      const deleteBtn = card.querySelector('.tool-item-delete-btn');
      if (deleteBtn) {
        card.insertBefore(editBtn, deleteBtn);
      } else {
        card.appendChild(editBtn);
      }
    });
  }

  /**
   * 根据工具卡片上的数据属性解析对应链接数据。
   *
   * @param {HTMLElement|null} card - 工具卡片元素；需要包含 data-id 和 data-category。
   * @returns {Object|null} 命中时返回带 category 的链接副本；未命中返回 null。
   * @throws {Error} 不主动抛错；快照读取异常会向上冒泡。
   * @sideeffects 读取 UIRenderer 导航数据快照，不修改状态。
   */
  function resolveToolFromCard(card) {
    const recordId = card?.getAttribute('data-id');
    const category = card?.getAttribute('data-category');
    const snapshot = window.UIRenderer?.getNavDataSnapshot?.();
    const items = snapshot?.data?.[category] || [];
    const match = items.find(item => item?.id === recordId);
    return match ? { ...match, category } : null;
  }

  /**
   * 打开新增链接弹窗。
   *
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错；DOM 操作异常会向上冒泡。
   * @sideeffects 清空当前编辑状态并显示添加弹窗。
   */
  function openAddModal() {
    currentEditingLink = null;
    prepareModal('add');
  }

  /**
   * 打开编辑链接弹窗。
   *
   * @param {Object} link - 要编辑的链接数据；必须包含 id。
   * @returns {void} 无返回值；无效链接会被忽略。
   * @throws {Error} 不主动抛错；DOM 操作异常会向上冒泡。
   * @sideeffects 设置当前编辑状态并显示编辑弹窗。
   */
  function openEditModal(link) {
    if (!link || !link.id) return;
    currentEditingLink = link;
    prepareModal('edit', link);
  }

  /**
   * 按新增或编辑模式准备链接弹窗。
   *
   * @param {'add'|'edit'} mode - 弹窗模式；edit 需要传入 link。
   * @param {Object|null} link - 编辑模式下的链接数据；新增模式可为空。
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错；DOM 操作异常会向上冒泡。
   * @sideeffects 重置表单、填充分类、更新按钮文案、刷新图标预览并显示弹窗。
   */
  function prepareModal(mode, link = null) {
    const modal = document.getElementById('add-link-modal');
    const form = document.getElementById('add-link-form');
    const titleEl = getModalTitleElement(modal);
    const saveBtn = document.getElementById('save-link-btn');

    if (!modal || !form) return;

    form.reset();
    clearFormErrors();
    populateCategoryOptions(link?.category || '');

    if (mode === 'edit' && link) {
      if (titleEl) titleEl.textContent = '修改网站';
      if (saveBtn) saveBtn.textContent = '更新';
      setFormValues(link);
      refreshSuggestedFields({ suggestName: false, autoFillIcon: false });
    } else {
      if (titleEl) titleEl.textContent = '添加网站';
      if (saveBtn) saveBtn.textContent = '保存';
      setDefaultFormValues();
      resetIconPreview();
    }

    modal.classList.add('active');
  }

  /**
   * 获取链接弹窗标题元素，兼容显式 ID 和旧结构选择器。
   *
   * @param {HTMLElement|null} modal - 链接弹窗元素；可为空。
   * @returns {HTMLElement|null} 标题元素；找不到返回 null。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无副作用。
   */
  function getModalTitleElement(modal) {
    return document.getElementById('link-modal-title') || modal?.querySelector('.modal-header h2') || null;
  }

  /**
   * 设置新增模式的默认表单值。
   *
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错；DOM 写入异常会向上冒泡。
   * @sideeffects 写入表单字段并刷新自定义分类输入框显示状态。
   */
  function setDefaultFormValues() {
    setInputValue('site-url', 'https://');
    setInputValue('site-name', '');
    setInputValue('site-icon', '');
    defaultSiteSort = getNextGlobalSort();
    setInputValue('site-sort', String(defaultSiteSort));
    setInputValue('custom-category', '');
    handleCategoryChange();
  }

  /**
   * 将已有链接数据写入编辑表单。
   *
   * @param {Object} link - 链接数据；url/name/customIcon/sort/category 均可缺省。
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错；DOM 写入异常会向上冒泡。
   * @sideeffects 写入表单字段、选择分类并刷新自定义分类输入框显示状态。
   */
  function setFormValues(link) {
    const icon = link.customIcon || link.icon || '';

    setInputValue('site-url', link.url || 'https://');
    setInputValue('site-name', link.name || '');
    setInputValue('site-icon', icon);
    defaultSiteSort = Number.isFinite(Number(link.sort)) ? Number(link.sort) : getNextGlobalSort();
    setInputValue('site-sort', String(defaultSiteSort));
    setInputValue('custom-category', '');

    const categorySelect = document.getElementById('site-category');
    if (categorySelect) {
      categorySelect.value = link.category || cachedCategories[0] || '__custom__';
    }
    handleCategoryChange();
    updateIconPreview(icon, icon ? '正在预览当前图标' : '当前链接未设置图标');
  }

  /**
   * 设置指定输入框的值。
   *
   * @param {string} id - 输入元素 ID。
   * @param {string} value - 要写入的字符串值。
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 找到元素时写入 value。
   */
  function setInputValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.value = value;
    }
  }

  /**
   * 根据缓存分类和当前链接分类填充分类下拉框。
   *
   * @param {string} selectedCategory - 期望选中的分类；为空时选第一个缓存分类或自定义。
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错；DOM 写入异常会向上冒泡。
   * @sideeffects 重写分类 select 的 options 并设置选中项。
   */
  function populateCategoryOptions(selectedCategory) {
    const categorySelect = document.getElementById('site-category');
    if (!categorySelect) return;

    const categories = Array.from(new Set([
      ...cachedCategories,
      ...(selectedCategory && selectedCategory !== '__custom__' ? [selectedCategory] : [])
    ].filter(Boolean)));

    let optionsHtml = '';
    categories.forEach(cat => {
      optionsHtml += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`;
    });
    optionsHtml += '<option value="__custom__">+ 自定义分类</option>';
    categorySelect.innerHTML = optionsHtml;

    if (selectedCategory && categories.includes(selectedCategory)) {
      categorySelect.value = selectedCategory;
    } else if (categories.length > 0) {
      categorySelect.value = categories[0];
    } else {
      categorySelect.value = '__custom__';
    }
  }

  /**
   * 根据分类选择状态展示或隐藏自定义分类输入框。
   *
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 修改 custom-category-container 的 display 样式。
   */
  function handleCategoryChange() {
    const categorySelect = document.getElementById('site-category');
    const customContainer = document.getElementById('custom-category-container');
    if (!categorySelect || !customContainer) return;
    customContainer.style.display = categorySelect.value === '__custom__' ? 'block' : 'none';
  }

  /**
   * 关闭添加/编辑弹窗并恢复基础状态。
   *
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 清空编辑状态、错误提示、图标预览并隐藏弹窗。
   */
  function closeAddModal() {
    const modal = document.getElementById('add-link-modal');
    const saveBtn = document.getElementById('save-link-btn');
    const titleEl = getModalTitleElement(modal);

    currentEditingLink = null;
    clearFormErrors();
    resetIconPreview();

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
    }
    if (titleEl) {
      titleEl.textContent = '添加网站';
    }
    if (modal) {
      modal.classList.remove('active');
    }
  }

  /**
   * 显示删除确认弹窗。
   *
   * @param {Object} link - 待删除链接；name 用于确认文案，id 用于删除请求。
   * @returns {void} 无返回值；缺少弹窗 DOM 时直接忽略。
   * @throws {Error} 不主动抛错。
   * @sideeffects 设置 currentDeleteLink、写入站点名并显示弹窗。
   */
  function showDeleteModal(link) {
    const modal = document.getElementById('delete-link-modal');
    const nameEl = document.getElementById('delete-site-name');
    if (!modal) return;

    currentDeleteLink = link;
    if (nameEl) {
      nameEl.textContent = link?.name || '';
    }
    modal.classList.add('active');
  }

  /**
   * 关闭删除确认弹窗。
   *
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 隐藏弹窗并清空 currentDeleteLink。
   */
  function closeDeleteModal() {
    const modal = document.getElementById('delete-link-modal');
    if (modal) {
      modal.classList.remove('active');
    }
    currentDeleteLink = null;
  }

  /**
   * 确认删除当前选中的链接记录。
   *
   * @returns {Promise<void>} 删除和刷新流程完成后解析。
   * @throws {Error} 内部捕获飞书删除和刷新异常，不向调用方抛业务错误。
   * @sideeffects 调用 FeishuAPI.deleteRecord、刷新导航数据、更新同步状态并修改按钮状态。
   */
  async function confirmDelete() {
    if (!currentDeleteLink || !currentDeleteLink.id) {
      console.error('[LinkManager] 无效的删除请求');
      return;
    }

    const deleteLink = { ...currentDeleteLink };
    const beforeSnapshot = UIRenderer.getNavDataSnapshot();
    const saveBtn = document.getElementById('confirm-delete-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '删除中...';
    }

    try {
      setLinkMutationBusy(true);
      await applyOptimisticDelete(beforeSnapshot, deleteLink);
      closeDeleteModal();

      if (isLocalRecordId(deleteLink.id)) {
        deletedLocalRecordIds.add(deleteLink.id);
        UIRenderer.showSyncStatus('已从本地删除', 'info');
        return;
      }

      UIRenderer.showSyncStatus('已删除，正在同步到飞书', 'info');
      const result = await FeishuAPI.deleteRecord(deleteLink.id);
      if (!result.success) {
        throw new Error(result.message || '删除失败');
      }

      UIRenderer.showSyncStatus(result.skipped ? '记录不存在，已从本地移除' : '删除已同步到飞书', result.skipped ? 'info' : 'success');
    } catch (error) {
      console.error('[LinkManager] 删除失败:', error);
      await rollbackOptimisticDelete(deleteLink);
      UIRenderer.showSyncStatus(error.message || '删除失败', 'error');
    } finally {
      setLinkMutationBusy(false);
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '确认删除';
      }
    }
  }

  /**
   * 保存新增或编辑后的链接数据。
   *
   * @returns {Promise<void>} 保存和刷新流程完成后解析；校验失败时提前返回。
   * @throws {Error} 内部捕获飞书保存异常，不向调用方抛业务错误。
   * @sideeffects 读取表单、显示校验错误、调用 FeishuAPI.addRecord/updateRecord、刷新导航数据并更新按钮状态。
   */
  async function saveLink() {
    const formData = getFormData();
    const errors = validateForm(formData);
    clearFormErrors();

    if (errors.hasErrors) {
      showFormErrors(errors);
      return;
    }

    if (!Number.isSafeInteger(formData.sort) || formData.sort < 0) {
      setError('sort-error', '排序请输入不小于 0 的整数');
      return;
    }

    const saveBtn = document.getElementById('save-link-btn');
    const isEditing = Boolean(currentEditingLink?.id);
    const editingLink = currentEditingLink ? { ...currentEditingLink } : null;
    const beforeSnapshot = UIRenderer.getNavDataSnapshot();
    const manualSort = Number(formData.sort) !== Number(defaultSiteSort);
    if (isEditing && !manualSort) {
      const currentLink = findCurrentLink(editingLink.id);
      if (currentLink && Number.isFinite(Number(currentLink.sort))) formData.sort = Number(currentLink.sort);
    }
    const optimisticRecordId = isEditing ? editingLink.id : createLocalRecordId();
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = isEditing ? '更新中...' : '保存中...';
    }

    try {
      setLinkMutationBusy(true);
      await applyOptimisticLinkChange(beforeSnapshot, formData, {
        isEditing,
        recordId: optimisticRecordId,
        previousLink: editingLink,
        manualSort
      });
      closeAddModal();
      UIRenderer.showSyncStatus(isEditing ? '已本地更新，正在同步到飞书' : '已添加，正在同步到飞书', 'info');

      const result = isEditing
        ? await FeishuAPI.updateRecord(editingLink.id, formData)
        : await FeishuAPI.addRecord(formData);

      if (!result.success) {
        throw new Error(result.message || (isEditing ? '更新失败' : '添加失败'));
      }

      if (!isEditing) {
        if (deletedLocalRecordIds.has(optimisticRecordId)) {
          deletedLocalRecordIds.delete(optimisticRecordId);
          if (result.recordId) {
            await queueRemoteDelete(result.recordId, { immediate: true });
          }
          return;
        }

        if (result.recordId) {
          await replaceOptimisticRecordId(optimisticRecordId, result.recordId);
        } else {
          await refreshData();
        }
      }

      UIRenderer.showSyncStatus(isEditing ? '修改已同步到飞书' : '添加已同步到飞书', 'success');
    } catch (error) {
      console.error('[LinkManager] 保存失败:', error);
      if (!isEditing) {
        deletedLocalRecordIds.delete(optimisticRecordId);
      }
      await rollbackOptimisticSave({
        isEditing,
        recordId: optimisticRecordId,
        formData,
        previousLink: editingLink
      });
      UIRenderer.showSyncStatus(error.message || (isEditing ? '更新失败' : '添加失败'), 'error');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = isEditing ? '更新' : '保存';
      }
    } finally {
      setLinkMutationBusy(false);
    }
  }

  /**
   * 从链接表单读取待保存数据。
   *
   * @returns {{url: string, name: string, icon: string, category: string, sort: number}} 规整后的表单数据。
   * @throws {Error} 不主动抛错。
   * @sideeffects 读取 DOM 输入值，不修改页面。
   */
  function getFormData() {
    const url = document.getElementById('site-url')?.value.trim() || '';
    const name = document.getElementById('site-name')?.value.trim() || '';
    const icon = document.getElementById('site-icon')?.value.trim() || '';
    const categorySelect = document.getElementById('site-category');
    const customCategoryInput = document.getElementById('custom-category');
    const sortValue = document.getElementById('site-sort')?.value?.trim();
    let category = categorySelect?.value || '';

    if (category === '__custom__') {
      category = customCategoryInput?.value.trim() || '';
    }

    return {
      url,
      name,
      icon,
      category,
      sort: sortValue ? Number(sortValue) : getNextGlobalSort()
    };
  }

  function getNextGlobalSort() {
    const data = UIRenderer?.getNavDataSnapshot?.()?.data || {};
    const tools = globalThis.UIRendererCore?.flattenToolsByCategoryPriority(data) || [];
    const values = tools.map((item) => Number(item.sort)).filter(Number.isFinite);
    return (values.length ? Math.max(0, ...values) : 0) + 10;
  }

  function findCurrentLink(recordId) {
    const data = UIRenderer.getNavDataSnapshot().data;
    for (const [category, items] of Object.entries(data)) {
      const item = (items || []).find((candidate) => candidate?.id === recordId);
      if (item) return { ...item, category };
    }
    return null;
  }

  function setLinkMutationBusy(busy) {
    document.body.classList.toggle('link-manager-saving', busy);
    globalThis.DragSortManager?.refreshDraggableState(false);
  }

  /**
   * 创建临时本地记录 ID，等待飞书新增成功后替换为真实记录 ID。
   *
   * @returns {string} 本地临时记录 ID。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无副作用。
   */
  function createLocalRecordId() {
    const randomPart = Math.random().toString(36).slice(2, 8);
    return `local-${Date.now()}-${randomPart}`;
  }

  /**
   * 判断记录是否为尚未同步到飞书的本地临时记录。
   *
   * @param {string} recordId - 记录 ID。
   * @returns {boolean} 本地临时记录返回 true。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无副作用。
   */
  function isLocalRecordId(recordId) {
    return String(recordId || '').startsWith('local-');
  }

  /**
   * 乐观应用新增或编辑结果到本地缓存和界面。
   *
   * @param {Object} snapshot - 保存前的导航快照。
   * @param {Object} formData - 待保存的表单数据。
   * @param {Object} options - 乐观更新选项。
   * @param {boolean} options.isEditing - 是否为编辑模式。
   * @param {string} options.recordId - 本地记录 ID 或飞书记录 ID。
   * @param {Object|null} options.previousLink - 编辑前的链接数据。
   * @returns {Promise<void>} 本地缓存保存完成后解析。
   * @throws {Error} Storage 或 UI 更新异常会向上抛出。
   * @sideeffects 更新 UIRenderer 缓存、重渲染当前页面并写入 chrome.storage.local。
   */
  async function applyOptimisticLinkChange(snapshot, formData, options) {
    const nextSnapshot = core.applyOptimisticLinkChangeToSnapshot(snapshot, formData, options);
    await persistSnapshotData(nextSnapshot.data, nextSnapshot.categories, nextSnapshot.dateInfo, {
      expectedRevision: snapshot.revision,
      manualSort: options.manualSort
    });
  }

  /**
   * 乐观删除链接并立即刷新本地缓存和界面。
   *
   * @param {Object} snapshot - 删除前的导航快照。
   * @param {Object} link - 待删除链接，需包含 id 和 category。
   * @returns {Promise<void>} 本地缓存保存完成后解析。
   * @throws {Error} Storage 或 UI 更新异常会向上抛出。
   * @sideeffects 更新 UIRenderer 缓存、重渲染当前页面并写入 chrome.storage.local。
   */
  async function applyOptimisticDelete(snapshot, link) {
    const nextSnapshot = core.applyOptimisticDeleteToSnapshot(snapshot, link);
    await persistSnapshotData(nextSnapshot.data, nextSnapshot.categories, nextSnapshot.dateInfo, {
      expectedRevision: snapshot.revision
    });
  }

  /**
   * 将新增时的临时 ID 替换为飞书返回的真实记录 ID。
   *
   * @param {string} localRecordId - 本地临时 ID。
   * @param {string} remoteRecordId - 飞书真实记录 ID。
   * @returns {Promise<void>} 替换并保存完成后解析。
   * @throws {Error} Storage 或 UI 更新异常会向上抛出。
   * @sideeffects 更新 UIRenderer 缓存和 chrome.storage.local。
   */
  async function replaceOptimisticRecordId(localRecordId, remoteRecordId) {
    if (!localRecordId || !remoteRecordId || localRecordId === remoteRecordId) {
      return;
    }

    const beforeSnapshot = UIRenderer.getNavDataSnapshot();
    const nextSnapshot = core.replaceRecordIdInSnapshot(
      beforeSnapshot,
      localRecordId,
      remoteRecordId
    );

    if (!nextSnapshot.changed) {
      return;
    }

    await persistSnapshotData(nextSnapshot.data, nextSnapshot.categories, nextSnapshot.dateInfo, {
      expectedRevision: beforeSnapshot.revision
    });
  }

  /**
   * 将待删除的远端记录加入重试队列。
   *
   * @param {string} recordId - 飞书记录 ID。
   * @param {Object} options - 队列选项。
   * @param {boolean} options.immediate - 是否立即尝试删除。
   * @returns {Promise<void>} 入队和本次尝试完成后解析。
   * @throws {Error} 内部捕获远端删除异常，不向调用方抛业务错误。
   * @sideeffects 调用 FeishuAPI.deleteRecord，并可能安排失败重试。
   */
  async function queueRemoteDelete(recordId, options = {}) {
    if (!recordId) {
      return;
    }

    pendingRemoteDeleteIds.add(recordId);

    if (options.immediate) {
      await flushPendingRemoteDeletes('immediate');
      return;
    }

    scheduleRemoteDeleteRetry();
  }

  /**
   * 重试清理新增后已本地删除的远端记录。
   *
   * @param {string} reason - 触发原因。
   * @returns {Promise<void>} 本轮远端删除完成后解析。
   * @throws {Error} 内部捕获远端删除异常，不向调用方抛业务错误。
   * @sideeffects 调用 FeishuAPI.deleteRecord，更新重试队列和状态提示。
   */
  async function flushPendingRemoteDeletes(reason = 'retry') {
    clearTimeout(remoteDeleteRetryTimer);
    remoteDeleteRetryTimer = null;

    const recordIds = Array.from(pendingRemoteDeleteIds);
    if (recordIds.length === 0) {
      return;
    }

    for (const recordId of recordIds) {
      try {
        const result = await FeishuAPI.deleteRecord(recordId);
        if (!result.success) {
          throw new Error(result.message || '远端删除失败');
        }
        pendingRemoteDeleteIds.delete(recordId);
      } catch (error) {
        console.error('[LinkManager] 远端补删失败:', error);
      }
    }

    if (pendingRemoteDeleteIds.size > 0) {
      scheduleRemoteDeleteRetry();
      UIRenderer.showSyncStatus('本地已删除，远端清理失败，将重试', 'error');
    } else if (reason === 'immediate') {
      UIRenderer.showSyncStatus('已清理刚删除的新增记录', 'info');
    }
  }

  /**
   * 安排远端补删重试。
   *
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 创建定时器。
   */
  function scheduleRemoteDeleteRetry() {
    clearTimeout(remoteDeleteRetryTimer);
    remoteDeleteRetryTimer = setTimeout(() => {
      flushPendingRemoteDeletes('retry').catch((error) => {
        console.warn('[LinkManager] 远端补删重试异常:', error);
      });
    }, REMOTE_DELETE_RETRY_MS);
  }

  /**
   * 保存失败时只回滚当前乐观保存影响的记录。
   *
   * @param {Object} operation - 保存操作信息。
   * @param {boolean} operation.isEditing - 是否为编辑操作。
   * @param {string} operation.recordId - 乐观记录 ID。
   * @param {Object} operation.formData - 本次保存表单数据。
   * @param {Object|null} operation.previousLink - 编辑前的链接数据。
   * @returns {Promise<void>} 回滚保存完成后解析。
   * @throws {Error} 内部捕获本地回滚异常，不向调用方抛业务错误。
   * @sideeffects 更新 UIRenderer 缓存和 chrome.storage.local。
   */
  async function rollbackOptimisticSave(operation) {
    try {
      const beforeSnapshot = UIRenderer.getNavDataSnapshot();
      const nextSnapshot = core.rollbackOptimisticSaveInSnapshot(
        beforeSnapshot,
        operation
      );
      if (!nextSnapshot.changed) {
        return;
      }

      await persistSnapshotData(nextSnapshot.data, nextSnapshot.categories, nextSnapshot.dateInfo, {
        expectedRevision: beforeSnapshot.revision
      });
    } catch (rollbackError) {
      console.error('[LinkManager] 回滚本地保存失败:', rollbackError);
    }
  }

  /**
   * 删除失败时只恢复当前删除的记录。
   *
   * @param {Object} link - 删除前的链接数据。
   * @returns {Promise<void>} 回滚保存完成后解析。
   * @throws {Error} 内部捕获本地回滚异常，不向调用方抛业务错误。
   * @sideeffects 更新 UIRenderer 缓存和 chrome.storage.local。
   */
  async function rollbackOptimisticDelete(link) {
    try {
      const beforeSnapshot = UIRenderer.getNavDataSnapshot();
      const nextSnapshot = core.rollbackOptimisticDeleteInSnapshot(
        beforeSnapshot,
        link
      );
      if (!nextSnapshot.changed) {
        return;
      }

      await persistSnapshotData(nextSnapshot.data, nextSnapshot.categories, nextSnapshot.dateInfo, {
        expectedRevision: beforeSnapshot.revision
      });
    } catch (rollbackError) {
      console.error('[LinkManager] 回滚本地删除失败:', rollbackError);
    }
  }

  /**
   * 保存并刷新当前导航快照数据。
   *
   * @param {Object<string, Array<Object>>} data - 导航数据。
   * @param {Array<string>} categories - 分类列表。
   * @param {Object|null} dateInfo - 日期信息。
   * @returns {Promise<void>} 本地缓存保存完成后解析。
   * @throws {Error} Storage 或 UI 更新异常会向上抛出。
   * @sideeffects 更新 UIRenderer 缓存和 chrome.storage.local。
   */
  async function persistSnapshotData(data, categories, dateInfo, options = {}) {
    const nextCategories = new Set(categories || []);
    pruneEmptyCategories(data, nextCategories);
    const categoryList = Array.from(nextCategories);
    const testMode = await Storage.getTestMode();
    const config = testMode ? null : await Storage.loadFeishuConfig();
    const scope = testMode ? 'test-mode'
      : `${config?.appToken || 'unconfigured'}:${config?.tableId || 'default'}`;
    let nextData = data;
    let nextPending = await Storage.loadPendingSortSync(scope);

    if (nextPending?.version >= 2 && nextPending.scope === 'global') {
      const visibleItems = globalThis.UIRendererCore.flattenToolsByCategoryPriority(nextData);
      const availableIds = new Set(visibleItems.map((item) => item.id).filter(Boolean));
      let orderedIds;
      if (options.manualSort) {
        orderedIds = visibleItems.map((item) => item.id).filter(Boolean);
      } else {
        orderedIds = nextPending.orderedIds.filter((id) => availableIds.has(id));
        const included = new Set(orderedIds);
        visibleItems.forEach((item) => {
          if (item.id && !included.has(item.id)) {
            included.add(item.id);
            orderedIds.push(item.id);
          }
        });
      }
      const reordered = DragSortCore.reorderNavDataByGlobalOrder(nextData, orderedIds);
      nextData = reordered.data;
      nextPending = DragSortCore.createGlobalPendingSortPayload(
        reordered.orderedIds, reordered.updates, scope
      );
    } else if (nextPending && globalThis.DragSortCore) {
      nextData = DragSortCore.applyPendingSortToNavData(nextData, nextPending);
    }

    const committed = await Storage.commitNavData(nextData, categoryList, dateInfo, {
      expectedRevision: options.expectedRevision ?? UIRenderer.getNavDataSnapshot().revision,
      pendingSortSync: nextPending || undefined,
      dataScope: scope,
      preserveSyncTime: true
    });
    if (!committed.success) {
      if (committed.current) {
        UIRenderer.setNavDataAndRefresh(committed.current.data, committed.current.categories,
          committed.current.dateInfo, committed.current.revision);
      }
      throw new Error(committed.conflict
        ? '网站列表已在其他标签页更新，请重新操作'
        : committed.error || '本地保存失败');
    }

    UIRenderer.setNavDataAndRefresh(nextData, categoryList, dateInfo, committed.revision);
    cachedCategories = categoryList;
  }

  /**
   * 清理已经没有记录的分类。
   *
   * @param {Object<string, Array<Object>>} data - 导航数据。
   * @param {Set<string>} categories - 分类集合。
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 修改 data 和 categories。
   */
  function pruneEmptyCategories(data, categories) {
    Array.from(categories).forEach(category => {
      if (!Array.isArray(data[category]) || data[category].length === 0) {
        delete data[category];
        categories.delete(category);
      }
    });
  }

  /**
   * 校验链接表单数据，包含重复 URL 检测。
   *
   * @param {Object} formData - getFormData 返回的链接表单数据。
   * @returns {{hasErrors: boolean, url: string, name: string, icon: string, category: string}} 字段错误集合。
   * @throws {Error} 不主动抛错；导航快照读取异常会向上冒泡。
   * @sideeffects 读取 UIRenderer 导航数据快照，不写入页面。
   */
  function validateForm(formData) {
    return core.validateLinkForm(formData, {
      navData: getCurrentNavData(),
      excludeRecordId: currentEditingLink?.id || null
    });
  }

  /**
   * 获取当前导航数据快照中的 data 部分。
   *
   * @returns {Object<string, Array<Object>>} 当前导航数据；无法读取时返回空对象。
   * @throws {Error} 不主动抛错。
   * @sideeffects 读取 UIRenderer 快照，不修改状态。
   */
  function getCurrentNavData() {
    return window.UIRenderer?.getNavDataSnapshot?.()?.data || {};
  }

  /**
   * 清空链接表单字段错误。
   *
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 清空错误提示元素文本。
   */
  function clearFormErrors() {
    ['url-error', 'name-error', 'icon-error', 'category-error', 'sort-error'].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = '';
      }
    });
  }

  /**
   * 将字段错误显示到表单。
   *
   * @param {Object} errors - validateForm 返回的错误集合。
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 写入各字段错误提示 DOM 文本。
   */
  function showFormErrors(errors) {
    setError('url-error', errors.url);
    setError('name-error', errors.name);
    setError('icon-error', errors.icon);
    setError('category-error', errors.category);
  }

  /**
   * 设置单个字段错误文案。
   *
   * @param {string} id - 错误提示元素 ID。
   * @param {string} message - 要显示的错误文案；为空时清空。
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 写入指定错误提示元素文本。
   */
  function setError(id, message) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = message || '';
    }
  }

  /**
   * 根据 URL 输入刷新网站名称和 favicon 建议。
   *
   * @param {Object} options - 刷新选项。
   * @param {boolean} options.suggestName - 是否在名称为空且非编辑状态时建议名称。
   * @param {boolean} options.autoFillIcon - 是否在图标为空时自动写入 favicon 建议。
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 可能写入名称、图标输入框、图标预览和建议按钮状态。
   */
  function refreshSuggestedFields({ suggestName, autoFillIcon }) {
    const urlInput = document.getElementById('site-url');
    const iconInput = document.getElementById('site-icon');
    const url = urlInput?.value.trim() || '';

    if (!core.isValidHttpUrl(url)) {
      lastSuggestedIconUrl = '';
      setFaviconButtonState(false);
      if (!iconInput?.value.trim()) {
        updateIconPreview('', '输入有效网址后自动建议 favicon');
      }
      return;
    }

    if (suggestName) {
      suggestSiteNameFromUrl(url);
    }

    lastSuggestedIconUrl = core.resolveFaviconUrl(url);
    setFaviconButtonState(Boolean(lastSuggestedIconUrl));

    if (autoFillIcon && iconInput && !iconInput.value.trim() && lastSuggestedIconUrl) {
      iconInput.value = lastSuggestedIconUrl;
      updateIconPreview(lastSuggestedIconUrl, '已根据网址生成图标建议');
    } else {
      updateIconPreview(iconInput?.value.trim() || lastSuggestedIconUrl, iconInput?.value.trim() ? '正在预览图标' : '可使用网址生成图标建议');
    }
  }

  /**
   * 基于 URL 域名建议网站名称。
   *
   * @param {string} url - 已校验为合法 http/https 的站点 URL。
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错；URL 解析异常会被捕获。
   * @sideeffects 当名称输入框为空且不是编辑状态时写入建议名称。
   */
  function suggestSiteNameFromUrl(url) {
    const nameInput = document.getElementById('site-name');
    if (!nameInput || nameInput.value.trim() || currentEditingLink) {
      return;
    }

    try {
      const urlObj = new URL(url);
      let domain = urlObj.hostname;
      if (domain.startsWith('www.')) {
        domain = domain.substring(4);
      }
      domain = domain.replace(/\.[a-z]+$/i, '');
      nameInput.value = domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch (error) {
      console.warn('[LinkManager] 自动提取名称失败:', error);
    }
  }

  /**
   * 将当前 URL 对应的 favicon 建议写入图标字段。
   *
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 读取 URL 输入框，写入图标输入框并刷新图标预览。
   */
  function applySuggestedFavicon() {
    const url = document.getElementById('site-url')?.value.trim() || '';
    const iconInput = document.getElementById('site-icon');
    const suggestedIcon = lastSuggestedIconUrl || core.resolveFaviconUrl(url);

    if (!iconInput || !suggestedIcon) {
      updateIconPreview('', '请先输入有效网址');
      return;
    }

    lastSuggestedIconUrl = suggestedIcon;
    iconInput.value = suggestedIcon;
    updateIconPreview(suggestedIcon, '已使用网址生成图标建议');
    setFaviconButtonState(true);
  }

  /**
   * 更新 favicon 建议按钮可用状态。
   *
   * @param {boolean} enabled - true 表示允许点击使用建议图标。
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 修改按钮 disabled 状态。
   */
  function setFaviconButtonState(enabled) {
    const faviconBtn = document.getElementById('use-favicon-btn');
    if (faviconBtn) {
      faviconBtn.disabled = !enabled;
    }
  }

  /**
   * 重置图标预览区域。
   *
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 清空建议图标 URL、禁用建议按钮并更新预览 DOM。
   */
  function resetIconPreview() {
    lastSuggestedIconUrl = '';
    setFaviconButtonState(false);
    updateIconPreview('', '输入网址后自动建议 favicon');
  }

  /**
   * 渲染图标预览和加载状态。
   *
   * @param {string} iconUrl - 要预览的图标 URL；为空或非法时显示占位状态。
   * @param {string} message - 加载前或占位状态文案。
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 写入 img src、状态文本和预览容器 CSS 状态类；浏览器会尝试加载图片。
   */
  function updateIconPreview(iconUrl, message) {
    const previewImg = document.getElementById('site-icon-preview');
    const previewBox = document.getElementById('site-icon-preview-box');
    const statusEl = document.getElementById('icon-preview-status');
    const url = String(iconUrl || '').trim();

    if (!previewImg || !previewBox || !statusEl) return;

    previewBox.classList.remove('is-empty', 'has-error');
    statusEl.classList.remove('has-error');

    if (!url) {
      previewImg.removeAttribute('src');
      previewBox.classList.add('is-empty');
      statusEl.textContent = message || '未设置图标，将使用文字图标';
      return;
    }

    if (!core.isValidHttpUrl(url)) {
      previewImg.removeAttribute('src');
      previewBox.classList.add('has-error');
      statusEl.classList.add('has-error');
      statusEl.textContent = '图标 URL 格式不正确';
      return;
    }

    previewImg.onload = () => {
      previewBox.classList.remove('is-empty', 'has-error');
      statusEl.classList.remove('has-error');
      statusEl.textContent = '图标预览已加载';
    };
    previewImg.onerror = () => {
      previewBox.classList.add('has-error');
      statusEl.classList.add('has-error');
      statusEl.textContent = '图标加载失败，可继续保存或手动更换';
    };
    statusEl.textContent = message || '正在预览图标';
    previewImg.src = url;
  }

  /**
   * 重新从飞书拉取导航数据并刷新本地缓存与 UI。
   *
   * @returns {Promise<void>} 刷新完成后解析。
   * @throws {Error} 内部捕获刷新异常，不向调用方抛业务错误。
   * @sideeffects 调用 FeishuAPI.getRecords、Storage.saveNavData、UIRenderer.init，并更新分类缓存。
   */
  async function refreshData() {
    try {
      const beforeSnapshot = UIRenderer.getNavDataSnapshot();
      const result = await FeishuAPI.getRecords();
      const testMode = await Storage.getTestMode();
      const config = testMode ? null : await Storage.loadFeishuConfig();
      const scope = testMode ? 'test-mode'
        : `${config?.appToken || 'unconfigured'}:${config?.tableId || 'default'}`;
      const pendingSortSync = await Storage.loadPendingSortSync(scope);
      const resolvedData = pendingSortSync && globalThis.DragSortCore
        ? DragSortCore.applyPendingSortToNavData(result.data, pendingSortSync)
        : result.data;
      const committed = await Storage.commitNavData(resolvedData, result.categories, result.dateInfo, {
        expectedRevision: beforeSnapshot.revision,
        dataScope: scope,
        preserveSyncTime: false
      });
      if (!committed.success) {
        if (committed.current) {
          UIRenderer.setNavDataAndRefresh(committed.current.data, committed.current.categories,
            committed.current.dateInfo, committed.current.revision);
        }
        return;
      }
      cachedCategories = result.categories;
      UIRenderer.init(resolvedData, result.categories, result.dateInfo, committed.revision);
    } catch (error) {
      console.error('[LinkManager] 刷新数据失败:', error);
      UIRenderer.showSyncStatus(error.message || '刷新数据失败', 'error');
    }
  }

  /**
   * 更新链接管理器缓存的分类列表。
   *
   * @param {Array<string>} categories - 最新分类列表；非数组会按空数组处理。
   * @returns {void} 无返回值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 替换模块内 cachedCategories。
   */
  function updateCategories(categories) {
    cachedCategories = Array.isArray(categories) ? categories : [];
  }

  /**
   * 对 HTML 文本进行转义，避免分类名注入到 option HTML。
   *
   * @param {string} text - 原始文本；会被转为字符串处理。
   * @returns {string} 转义后的 HTML 文本。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无副作用。
   */
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 创建防抖函数，限制高频输入触发的处理次数。
   *
   * @param {Function} func - 延迟执行的函数。
   * @param {number} wait - 延迟毫秒数；用于 URL 输入建议。
   * @returns {Function} 包装后的防抖函数。
   * @throws {Error} 不主动抛错；func 执行异常会在定时器回调中抛出。
   * @sideeffects 创建并清理定时器。
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  return {
    init,
    openAddModal,
    openEditModal,
    showDeleteModal,
    saveLink,
    updateCategories
  };
})();

window.LinkManager = LinkManager;
