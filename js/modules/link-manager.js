/**
 * 链接管理器 - 处理链接的新增、编辑、删除等操作
 */
const LinkManager = (function() {
  'use strict';

  let currentDeleteLink = null;
  let currentEditingLink = null;
  let cachedCategories = [];

  async function init(categories) {
    cachedCategories = Array.isArray(categories) ? categories : [];
    ensureFormFields();
    bindModalEvents();
    bindFormEvents();
    bindToolEditActions();
    console.log('[LinkManager] 初始化完成');
  }

  function ensureFormFields() {
    const form = document.getElementById('add-link-form');
    const nameError = document.getElementById('name-error');
    if (!form || !nameError || document.getElementById('site-icon')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'form-group';
    wrapper.innerHTML = `
      <label for="site-icon">Icon URL</label>
      <input type="url" id="site-icon" name="site-icon" placeholder="https://example.com/icon.png">
      <div class="error-message" id="icon-error"></div>
    `;

    const nameGroup = nameError.closest('.form-group');
    if (nameGroup?.nextSibling) {
      form.insertBefore(wrapper, nameGroup.nextSibling);
    } else {
      form.appendChild(wrapper);
    }
  }

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

  function bindFormEvents() {
    const urlInput = document.getElementById('site-url');
    const categorySelect = document.getElementById('site-category');
    const saveBtn = document.getElementById('save-link-btn');

    if (urlInput && !urlInput.dataset.linkManagerBound) {
      urlInput.dataset.linkManagerBound = 'true';
      urlInput.addEventListener('input', debounce(() => {
        extractSiteNameFromUrl();
      }, 500));
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

  function bindOnce(element, eventName, handler) {
    if (!element || element.dataset.linkManagerBound) return;
    element.dataset.linkManagerBound = 'true';
    element.addEventListener(eventName, handler);
  }

  function bindToolEditActions() {
    if (!document.body.dataset.linkManagerToolActionsBound) {
      document.body.dataset.linkManagerToolActionsBound = 'true';
      document.addEventListener('chromeNav:toolsRendered', injectEditButtons);
    }
    injectEditButtons();
  }

  function injectEditButtons() {
    const cards = document.querySelectorAll('.tool-item');
    cards.forEach(card => {
      if (card.querySelector('.tool-item-edit-btn')) return;

      const editBtn = document.createElement('button');
      editBtn.className = 'tool-item-edit-btn';
      editBtn.title = '编辑';
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

  function resolveToolFromCard(card) {
    const recordId = card?.getAttribute('data-id');
    const category = card?.getAttribute('data-category');
    const snapshot = window.UIRenderer?.getNavDataSnapshot?.();
    const items = snapshot?.data?.[category] || [];
    const match = items.find(item => item?.id === recordId);
    return match ? { ...match, category } : null;
  }

  function openAddModal() {
    currentEditingLink = null;
    prepareModal('add');
  }

  function openEditModal(link) {
    if (!link || !link.id) return;
    currentEditingLink = link;
    prepareModal('edit', link);
  }

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
    } else {
      if (titleEl) titleEl.textContent = '添加网站';
      if (saveBtn) saveBtn.textContent = '保存';
      setDefaultFormValues();
    }

    modal.classList.add('active');
  }

  function getModalTitleElement(modal) {
    return document.getElementById('link-modal-title') || modal?.querySelector('.modal-header h2') || null;
  }

  function setDefaultFormValues() {
    setInputValue('site-url', 'https://');
    setInputValue('site-name', '');
    setInputValue('site-icon', '');
    setInputValue('site-sort', '200');
    setInputValue('custom-category', '');
    handleCategoryChange();
  }

  function setFormValues(link) {
    setInputValue('site-url', link.url || 'https://');
    setInputValue('site-name', link.name || '');
    setInputValue('site-icon', link.customIcon || '');
    setInputValue('site-sort', Number.isFinite(Number(link.sort)) ? String(link.sort) : '999');
    setInputValue('custom-category', '');

    const categorySelect = document.getElementById('site-category');
    if (categorySelect) {
      categorySelect.value = link.category || cachedCategories[0] || '__custom__';
    }
    handleCategoryChange();
  }

  function setInputValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.value = value;
    }
  }

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

  function handleCategoryChange() {
    const categorySelect = document.getElementById('site-category');
    const customContainer = document.getElementById('custom-category-container');
    if (!categorySelect || !customContainer) return;
    customContainer.style.display = categorySelect.value === '__custom__' ? 'block' : 'none';
  }

  function closeAddModal() {
    const modal = document.getElementById('add-link-modal');
    const saveBtn = document.getElementById('save-link-btn');
    const titleEl = getModalTitleElement(modal);

    currentEditingLink = null;
    clearFormErrors();

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

  function closeDeleteModal() {
    const modal = document.getElementById('delete-link-modal');
    if (modal) {
      modal.classList.remove('active');
    }
    currentDeleteLink = null;
  }

  async function confirmDelete() {
    if (!currentDeleteLink || !currentDeleteLink.id) {
      console.error('[LinkManager] 无效的删除请求');
      return;
    }

    const saveBtn = document.getElementById('confirm-delete-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '删除中...';
    }

    try {
      const result = await FeishuAPI.deleteRecord(currentDeleteLink.id);
      if (!result.success) {
        throw new Error(result.message || '删除失败');
      }

      closeDeleteModal();
      UIRenderer.showSyncStatus(result.skipped ? '记录不存在，已刷新本地数据' : '删除成功', result.skipped ? 'info' : 'success');
      await refreshData();
    } catch (error) {
      console.error('[LinkManager] 删除失败:', error);
      UIRenderer.showSyncStatus(error.message || '删除失败', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '确认删除';
      }
    }
  }

  async function saveLink() {
    const formData = getFormData();
    const errors = validateForm(formData);
    clearFormErrors();

    if (errors.hasErrors) {
      showFormErrors(errors);
      return;
    }

    const saveBtn = document.getElementById('save-link-btn');
    const isEditing = Boolean(currentEditingLink?.id);
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = isEditing ? '更新中...' : '保存中...';
    }

    try {
      const result = isEditing
        ? await FeishuAPI.updateRecord(currentEditingLink.id, formData)
        : await FeishuAPI.addRecord(formData);

      if (!result.success) {
        throw new Error(result.message || (isEditing ? '更新失败' : '添加失败'));
      }

      closeAddModal();
      UIRenderer.showSyncStatus(isEditing ? '修改成功' : '添加成功', 'success');
      await refreshData();
    } catch (error) {
      console.error('[LinkManager] 保存失败:', error);
      UIRenderer.showSyncStatus(error.message || (isEditing ? '更新失败' : '添加失败'), 'error');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = isEditing ? '更新' : '保存';
      }
    }
  }

  function getFormData() {
    const url = document.getElementById('site-url')?.value.trim() || '';
    const name = document.getElementById('site-name')?.value.trim() || '';
    const icon = document.getElementById('site-icon')?.value.trim() || '';
    const categorySelect = document.getElementById('site-category');
    const customCategoryInput = document.getElementById('custom-category');
    const sortValue = document.getElementById('site-sort')?.value;
    let category = categorySelect?.value || '';

    if (category === '__custom__') {
      category = customCategoryInput?.value.trim() || '';
    }

    return {
      url,
      name,
      icon,
      category,
      sort: parseInt(sortValue, 10) || 999
    };
  }

  function validateForm(formData) {
    const { url, name, icon, category } = formData;
    const errors = { hasErrors: false, url: '', name: '', icon: '', category: '' };

    if (!url || url === 'https://') {
      errors.hasErrors = true;
      errors.url = '请输入网址';
    } else if (!isValidUrl(url)) {
      errors.hasErrors = true;
      errors.url = '网址格式不正确';
    }

    if (!name) {
      errors.hasErrors = true;
      errors.name = '请输入网站名称';
    } else if (name.length > 50) {
      errors.hasErrors = true;
      errors.name = '名称不能超过50个字符';
    }

    if (icon && !isValidUrl(icon)) {
      errors.hasErrors = true;
      errors.icon = '图标网址格式不正确';
    }

    if (!category) {
      errors.hasErrors = true;
      errors.category = '请选择分类';
    }

    return errors;
  }

  function clearFormErrors() {
    ['url-error', 'name-error', 'icon-error', 'category-error'].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = '';
      }
    });
  }

  function showFormErrors(errors) {
    setError('url-error', errors.url);
    setError('name-error', errors.name);
    setError('icon-error', errors.icon);
    setError('category-error', errors.category);
  }

  function setError(id, message) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = message || '';
    }
  }

  function extractSiteNameFromUrl() {
    const urlInput = document.getElementById('site-url');
    const nameInput = document.getElementById('site-name');

    if (!urlInput || !nameInput || nameInput.value.trim() || currentEditingLink) {
      return;
    }

    const url = urlInput.value.trim();
    if (!isValidUrl(url)) {
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

  async function refreshData() {
    try {
      const result = await FeishuAPI.getRecords();
      await Storage.saveNavData(result.data, result.categories, result.dateInfo);
      cachedCategories = result.categories;
      UIRenderer.init(result.data, result.categories, result.dateInfo);
    } catch (error) {
      console.error('[LinkManager] 刷新数据失败:', error);
      UIRenderer.showSyncStatus(error.message || '刷新数据失败', 'error');
    }
  }

  function updateCategories(categories) {
    cachedCategories = Array.isArray(categories) ? categories : [];
  }

  function isValidUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

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
