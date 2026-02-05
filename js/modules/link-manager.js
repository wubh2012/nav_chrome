/**
 * 链接管理器 - 处理链接的添加、删除等操作
 * 改造自 navsite
 */
const LinkManager = (function() {
  'use strict';

  // 当前操作的链接数据
  let currentDeleteLink = null;

  // 缓存的分类列表
  let cachedCategories = [];

  /**
   * 初始化链接管理器
   * @param {Array} categories - 分类列表
   */
  async function init(categories) {
    cachedCategories = categories;

    // 绑定模态框事件
    bindModalEvents();

    // 绑定表单事件
    bindFormEvents();

    console.log('[LinkManager] 初始化完成');
  }

  /**
   * 绑定模态框事件
   */
  function bindModalEvents() {
    // 添加链接模态框
    const addModal = document.getElementById('add-link-modal');
    if (addModal) {
      // 打开添加模态框
      const addBtn = document.getElementById('add-link-btn');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          openAddModal();
        });
      }

      // 关闭按钮
      const closeBtn = document.getElementById('close-modal-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          closeAddModal();
        });
      }

      // 取消按钮
      const cancelBtn = document.getElementById('cancel-add-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          closeAddModal();
        });
      }

      // 点击遮罩关闭
      const overlay = addModal.querySelector('.modal-overlay');
      if (overlay) {
        overlay.addEventListener('click', () => {
          closeAddModal();
        });
      }
    }

    // 删除确认模态框
    const deleteModal = document.getElementById('delete-link-modal');
    if (deleteModal) {
      // 关闭按钮
      const closeBtn = document.getElementById('close-delete-modal-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          closeDeleteModal();
        });
      }

      // 取消按钮
      const cancelBtn = document.getElementById('cancel-delete-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          closeDeleteModal();
        });
      }

      // 确认删除按钮
      const confirmBtn = document.getElementById('confirm-delete-btn');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          confirmDelete();
        });
      }

      // 点击遮罩关闭
      const overlay = deleteModal.querySelector('.modal-overlay');
      if (overlay) {
        overlay.addEventListener('click', () => {
          closeDeleteModal();
        });
      }
    }
  }

  /**
   * 绑定表单事件
   */
  function bindFormEvents() {
    const urlInput = document.getElementById('site-url');
    const nameInput = document.getElementById('site-name');
    const categorySelect = document.getElementById('site-category');
    const saveBtn = document.getElementById('save-link-btn');

    // 网址输入事件 - 自动提取名称
    if (urlInput) {
      urlInput.addEventListener('input', debounce(() => {
        extractSiteNameFromUrl();
      }, 500));
    }

    // 分类选择事件 - 自定义分类
    if (categorySelect) {
      categorySelect.addEventListener('change', () => {
        const customContainer = document.getElementById('custom-category-container');
        if (customContainer) {
          if (categorySelect.value === '__custom__') {
            customContainer.style.display = 'block';
          } else {
            customContainer.style.display = 'none';
          }
        }
      });
    }

    // 保存按钮
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        saveLink();
      });
    }
  }

  /**
   * 打开添加模态框
   */
  async function openAddModal() {
    const modal = document.getElementById('add-link-modal');
    const form = document.getElementById('add-link-form');
    const categorySelect = document.getElementById('site-category');

    if (!modal || !form) return;

    // 重置表单
    form.reset();
    document.getElementById('url-error').textContent = '';
    document.getElementById('name-error').textContent = '';
    document.getElementById('category-error').textContent = '';

    // 填充分类选项
    if (categorySelect) {
      let optionsHtml = '';
      cachedCategories.forEach(cat => {
        optionsHtml += `<option value="${cat}">${cat}</option>`;
      });
      optionsHtml += '<option value="__custom__">+ 自定义分类</option>';
      categorySelect.innerHTML = optionsHtml;
    }

    // 显示模态框
    modal.classList.add('active');
  }

  /**
   * 关闭添加模态框
   */
  function closeAddModal() {
    const modal = document.getElementById('add-link-modal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  /**
   * 打开删除确认模态框
   * @param {Object} link - 链接数据
   */
  function showDeleteModal(link) {
    const modal = document.getElementById('delete-link-modal');
    const nameEl = document.getElementById('delete-site-name');

    if (!modal) return;

    currentDeleteLink = link;
    if (nameEl) {
      nameEl.textContent = link.name || '';
    }

    modal.classList.add('active');
  }

  /**
   * 关闭删除确认模态框
   */
  function closeDeleteModal() {
    const modal = document.getElementById('delete-link-modal');
    if (modal) {
      modal.classList.remove('active');
      currentDeleteLink = null;
    }
  }

  /**
   * 确认删除
   */
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

      if (result.success) {
        // 关闭模态框
        closeDeleteModal();

        // 显示成功提示
        UIRenderer.showSyncStatus('删除成功', 'success');

        // 刷新数据
        await refreshData();
      } else {
        throw new Error(result.message || '删除失败');
      }
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

  /**
   * 保存链接
   */
  async function saveLink() {
    // 获取表单值
    const url = document.getElementById('site-url').value.trim();
    const name = document.getElementById('site-name').value.trim();
    let category = document.getElementById('site-category').value;

    // 验证
    const errors = validateForm(url, name, category);
    if (errors.hasErrors) {
      showFormErrors(errors);
      return;
    }

    // 处理自定义分类
    if (category === '__custom__') {
      category = document.getElementById('custom-category').value.trim();
      if (!category) {
        showFormErrors({ url: '', name: '', category: '请输入自定义分类名称' });
        return;
      }
    }

    // 获取排序值
    const sort = parseInt(document.getElementById('site-sort').value) || 999;

    // 禁用保存按钮
    const saveBtn = document.getElementById('save-link-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中...';
    }

    try {
      // 添加到飞书
      const result = await FeishuAPI.addRecord({
        name,
        url,
        category,
        sort,
        icon: ''
      });

      if (result.success) {
        // 关闭模态框
        closeAddModal();

        // 显示成功提示
        UIRenderer.showSyncStatus('添加成功', 'success');

        // 刷新数据
        await refreshData();
      } else {
        throw new Error(result.message || '添加失败');
      }
    } catch (error) {
      console.error('[LinkManager] 添加失败:', error);
      UIRenderer.showSyncStatus(error.message || '添加失败', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
    }
  }

  /**
   * 验证表单
   * @param {string} url - 网址
   * @param {string} name - 名称
   * @param {string} category - 分类
   */
  function validateForm(url, name, category) {
    const errors = { hasErrors: false, url: '', name: '', category: '' };

    // 验证网址
    if (!url || url === 'https://') {
      errors.hasErrors = true;
      errors.url = '请输入网址';
    } else {
      try {
        new URL(url);
      } catch (e) {
        errors.hasErrors = true;
        errors.url = '网址格式不正确';
      }
    }

    // 验证名称
    if (!name) {
      errors.hasErrors = true;
      errors.name = '请输入网站名称';
    } else if (name.length > 50) {
      errors.hasErrors = true;
      errors.name = '名称不能超过50个字符';
    }

    // 验证分类
    if (!category) {
      errors.hasErrors = true;
      errors.category = '请选择分类';
    }

    return errors;
  }

  /**
   * 显示表单错误
   * @param {Object} errors - 错误信息
   */
  function showFormErrors(errors) {
    if (errors.url) {
      document.getElementById('url-error').textContent = errors.url;
    }
    if (errors.name) {
      document.getElementById('name-error').textContent = errors.name;
    }
    if (errors.category) {
      document.getElementById('category-error').textContent = errors.category;
    }
  }

  /**
   * 从网址自动提取名称
   */
  function extractSiteNameFromUrl() {
    const urlInput = document.getElementById('site-url');
    const nameInput = document.getElementById('site-name');

    if (!urlInput || !nameInput || nameInput.value) return;

    const url = urlInput.value.trim();
    if (!url || url === 'https://') return;

    try {
      const urlObj = new URL(url);
      let domain = urlObj.hostname;

      // 移除 www. 前缀
      if (domain.startsWith('www.')) {
        domain = domain.substring(4);
      }

      // 移除扩展名（如 .com、.cn 等）
      domain = domain.replace(/\.[a-z]+$/i, '');

      // 首字母大写
      nameInput.value = domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch (e) {
      // URL 格式不正确，不处理
    }
  }

  /**
   * 刷新数据
   */
  async function refreshData() {
    try {
      // 获取最新数据
      const result = await FeishuAPI.getRecords();

      // 保存到存储
      await Storage.saveNavData(result.data, result.categories, result.dateInfo);

      // 更新缓存
      cachedCategories = result.categories;

      // 刷新 UI
      UIRenderer.init(result.data, result.categories, result.dateInfo);
    } catch (error) {
      console.error('[LinkManager] 刷新数据失败:', error);
      UIRenderer.showSyncStatus(error.message || '刷新数据失败', 'error');
    }
  }

  /**
   * 防抖函数
   * @param {Function} func - 要执行的函数
   * @param {number} wait - 等待时间
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * 更新分类列表
   * @param {Array} categories - 新的分类列表
   */
  function updateCategories(categories) {
    cachedCategories = categories;
  }

  // ==================== 公共 API ====================

  return {
    init,
    openAddModal,
    showDeleteModal,
    saveLink,
    updateCategories
  };
})();

// 导出到全局
window.LinkManager = LinkManager;
