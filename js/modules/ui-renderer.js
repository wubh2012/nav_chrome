/**
 * UI 渲染器 - 处理页面元素的动态渲染
 * 改造自 navsite
 */
const UIRenderer = (function() {
  'use strict';

  // 当前选中的分类
  let currentCategory = 'all';

  // 缓存的导航数据
  let cachedNavData = null;
  let cachedCategories = [];
  let cachedDateInfo = null;

  /**
   * 初始化 UI
   * @param {Object} data - 导航数据
   * @param {Array} categories - 分类列表
   * @param {Object} dateInfo - 日期信息
   */
  async function init(data, categories, dateInfo) {
    cachedNavData = data;
    cachedCategories = categories;
    cachedDateInfo = dateInfo;

    // 渲染分类菜单
    renderCategoryMenu(categories);

    // 渲染工具卡片
    renderTools(data);

    // 渲染日期时间
    renderDateTime(dateInfo);
  }

  /**
   * 渲染分类菜单
   * @param {Array} categories - 分类列表
   */
  function renderCategoryMenu(categories) {
    const menu = document.getElementById('category-menu');
    if (!menu) return;

    // 保留"全部"选项
    let html = `<li class="active" data-category="all"><i class="bi bi-house-door"></i> 全部</li>`;

    // 添加分类选项
    categories.forEach(category => {
      const icon = getCategoryIcon(category);
      html += `<li data-category="${category}"><i class="bi ${icon}"></i> ${category}</li>`;
    });

    menu.innerHTML = html;

    // 绑定点击事件
    menu.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        const category = li.getAttribute('data-category');
        switchCategory(category);
      });
    });
  }

  /**
   * 获取分类图标
   * @param {string} category - 分类名称
   */
  function getCategoryIcon(category) {
    const iconMap = {
      'Code': 'bi-code-slash',
      '设计': 'bi-palette',
      '工具': 'bi-tools',
      '学习': 'bi-book',
      '娱乐': 'bi-controller',
      '生活': 'bi-cup-hot',
      '未分类': 'bi-folder'
    };
    return iconMap[category] || 'bi-folder2';
  }

  /**
   * 切换分类
   * @param {string} category - 分类名称
   */
  function switchCategory(category) {
    currentCategory = category;

    // 更新菜单激活状态
    document.querySelectorAll('#category-menu li').forEach(li => {
      if (li.getAttribute('data-category') === category) {
        li.classList.add('active');
      } else {
        li.classList.remove('active');
      }
    });

    // 渲染工具
    if (category === 'all') {
      renderTools(cachedNavData);
    } else {
      const filteredData = { [category]: cachedNavData[category] || [] };
      renderTools(filteredData);
    }
  }

  /**
   * 渲染工具卡片
   * @param {Object} data - 导航数据
   */
  function renderTools(data) {
    const grid = document.getElementById('tools-grid');
    if (!grid) return;

    grid.innerHTML = '';

    const tools = [];

    // 收集所有工具
    Object.keys(data).forEach(category => {
      const categoryTools = data[category] || [];
      categoryTools.forEach(tool => {
        tools.push({ ...tool, category });
      });
    });

    if (tools.length === 0) {
      grid.innerHTML = '<div class="empty-state">暂无数据，请添加链接</div>';
      return;
    }

    // 添加工具卡片
    tools.forEach((tool, index) => {
      const card = createToolCard(tool, index);
      grid.appendChild(card);
    });
  }

  /**
   * 创建工具卡片
   * @param {Object} tool - 工具数据
   * @param {number} index - 索引（用于动画延迟）
   */
  function createToolCard(tool, index) {
    const card = document.createElement('div');
    card.className = 'tool-item';
    card.style.animationDelay = `${index * 0.1}s`;
    card.setAttribute('data-id', tool.id || '');
    card.setAttribute('data-category', tool.category || '');

    // 解析图标
    let iconHtml = '';
    if (tool.icon) {
      
      if (tool.icon.startsWith('http') || tool.icon.startsWith('data:')) {
        // 图片图标
        iconHtml = `<img src="${tool.icon}" alt="${tool.name}" class="tool-icon" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=\\'text-icon\\'>${getInitial(tool.name)}</span>'">`;
      } else if (tool.icon.startsWith('bi-') || tool.icon.startsWith('fa-')) {
        // Bootstrap Icons 或 Font Awesome
        iconHtml = `<i class="bi ${tool.icon} tool-icon"></i>`;
      } else if (/^[\u4e00-\u9fa5]$/.test(tool.icon)) {
        // 中文单个字
        iconHtml = createTextIcon(tool.icon);
      } else {
        // Emoji 或其他
        iconHtml = `<span class="text-icon">${tool.icon}</span>`;
      }
    } else {
      // 默认使用首字母
      iconHtml = createTextIcon(getInitial(tool.name));
    }

    card.innerHTML = `
      ${iconHtml}
      <span class="tool-name">${escapeHtml(tool.name)}</span>
      <button class="tool-item-delete-btn" title="删除">
        <i class="bi bi-x"></i>
      </button>
    `;

    // 点击打开链接
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.tool-item-delete-btn')) {
        openLink(tool.url);
      }
    });

    // 删除按钮事件
    const deleteBtn = card.querySelector('.tool-item-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.LinkManager) {
          LinkManager.showDeleteModal(tool);
        }
      });
    }

    return card;
  }

  /**
   * 创建文字图标
   * @param {string} text - 文字
   */
  function createTextIcon(text) {
    const colors = [
      'linear-gradient(135deg, #ff6b6b, #ee5a24)',
      'linear-gradient(135deg, #feca57, #ff9f43)',
      'linear-gradient(135deg, #26de81, #20bf6b)',
      'linear-gradient(135deg, #45aaf2, #2d98da)',
      'linear-gradient(135deg, #a55eea, #8854d0)',
      'linear-gradient(135deg, #fc5c65, #eb3b5a)'
    ];
    const color = colors[Math.abs(hashCode(text)) % colors.length];
    return `<span class="text-icon" style="background: ${color}">${text}</span>`;
  }

  /**
   * 获取首字母
   * @param {string} name - 名称
   */
  function getInitial(name) {
    if (!name) return '?';
    // 中文取第一个字
    if (/[\u4e00-\u9fa5]/.test(name[0])) {
      return name[0];
    }
    // 英文取首字母
    const words = name.split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name[0].toUpperCase();
  }

  /**
   * 渲染日期时间
   * @param {Object} dateInfo - 日期信息
   */
  function renderDateTime(dateInfo) {
    const dateEl = document.getElementById('date-info');
    if (dateEl && dateInfo) {
      let dateText = dateInfo.date || '';
      if (dateInfo.weekday) {
        dateText += ` · ${dateInfo.weekday}`;
      }
      if (dateInfo.lunarDate) {
        dateText += ` · ${dateInfo.lunarDate}`;
      }
      dateEl.textContent = dateText || new Date().toLocaleDateString('zh-CN');
    }
  }

  /**
   * 更新时间显示
   */
  function updateTime() {
    const timeEl = document.getElementById('current-time');
    if (timeEl) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      timeEl.textContent = `${hours}:${minutes}`;
    }
  }

  /**
   * 打开链接
   * @param {string} url - 网址
   */
  function openLink(url) {
    if (!url) return;

    // 确保 URL 有协议
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // 在新标签页打开
    chrome.tabs.create({ url });
  }

  /**
   * 显示同步状态
   * @param {string} message - 状态消息
   * @param {string} type - 类型 (success/error/info)
   */
  function showSyncStatus(message, type = 'info') {
    const statusEl = document.getElementById('sync-status');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.style.color = type === 'error' ? '#ff4d4f' : type === 'success' ? '#52c41a' : 'var(--text-mid)';
    statusEl.classList.add('show');

    setTimeout(() => {
      statusEl.classList.remove('show');
    }, 3000);
  }

  /**
   * HTML 转义
   * @param {string} text - 原始文本
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 字符串哈希码
   * @param {string} str - 字符串
   */
  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * 开始时间更新定时器
   */
  function startTimeUpdate() {
    updateTime();
    setInterval(updateTime, 1000);
  }

  /**
   * 获取当前选中的分类
   */
  function getCurrentCategory() {
    return currentCategory;
  }

  /**
   * 刷新当前分类的工具显示
   */
  function refreshCurrentCategory() {
    if (cachedNavData) {
      switchCategory(currentCategory);
    }
  }

  // ==================== 公共 API ====================

  return {
    init,
    switchCategory,
    renderTools,
    renderDateTime,
    updateTime,
    showSyncStatus,
    startTimeUpdate,
    getCurrentCategory,
    refreshCurrentCategory
  };
})();

// 导出到全局
window.UIRenderer = UIRenderer;
