/**
 * UI 渲染器
 *
 * 职责与边界：根据已加载的导航数据渲染分类菜单、工具卡片、时间信息与同步提示；
 * 不负责数据拉取、持久化、飞书 API 通信或链接表单校验。
 * 关键副作用：会读写当前页面 DOM、绑定点击事件、触发 window.open，并启动/清理时间刷新定时器；
 * 不直接读写网络、文件、数据库或浏览器存储。
 * 关键依赖与约束：依赖 newtab.html 中的固定容器 ID、Bootstrap Icons 样式、
 * 全局 Lunar 工具以及调用方传入的导航数据结构。
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

    // 保持当前分类上下文
    if (currentCategory !== 'all' && cachedCategories.includes(currentCategory)) {
      switchCategory(currentCategory);
    }
  }

  /**
   * 渲染分类菜单
   * @param {Array} categories - 分类列表
   */
  function renderCategoryMenu(categories) {
    const menu = document.getElementById('category-menu');
    if (!menu) return;

    // 分类排序：全部 → 主页 → AI → Code → 其他（按原顺序）
    const categoryOrder = ['主页', 'AI', 'Code'];
    const sortedCategories = [...categories].sort((a, b) => {
      const indexA = categoryOrder.indexOf(a);
      const indexB = categoryOrder.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    // 保留"全部"选项
    let html = `<li class="active" data-category="all"><i class="bi bi-house-door"></i> 全部</li>`;

    // 添加分类选项
    sortedCategories.forEach(category => {
      const icon = resolveCategoryIcon(category);
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

    document.dispatchEvent(new CustomEvent('chromeNav:categoryChanged', {
      detail: { category }
    }));
  }

  /**
   * 渲染工具卡片
   * @param {Object} data - 导航数据
   */
  function renderTools(data) {
    const grid = document.getElementById('tools-grid');
    if (!grid) return;

    // 先隐藏容器，避免中间状态
    grid.style.visibility = 'hidden';
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
      grid.style.visibility = 'visible';
      document.dispatchEvent(new CustomEvent('chromeNav:toolsRendered', {
        detail: { category: currentCategory }
      }));
      return;
    }

    // 使用 DocumentFragment 批量插入，减少 DOM 重排
    const fragment = document.createDocumentFragment();
    tools.forEach(tool => {
      const card = createToolCard(tool);
      // 初始状态设为隐藏，由动画控制显示
      card.classList.add('tool-item-hidden');
      fragment.appendChild(card);
    });

    grid.appendChild(fragment);

    // 批量显示动画 - 所有卡片同时显示
    requestAnimationFrame(() => {
      grid.style.visibility = 'visible';
      // 移除隐藏类，触发 CSS 动画
      const cards = grid.querySelectorAll('.tool-item-hidden');
      cards.forEach(card => {
        card.classList.remove('tool-item-hidden');
      });

      document.dispatchEvent(new CustomEvent('chromeNav:toolsRendered', {
        detail: { category: currentCategory }
      }));
    });
  }

  /**
   * 创建单个工具卡片，并为图标、名称和删除按钮绑定展示与交互行为。
   *
   * @param {Object} tool - 工具数据；期望包含 name、url、icon、id、category 等字段，
   *   name 会作为显示文本和悬浮提示，url 会在卡片点击时打开。
   * @returns {HTMLDivElement} 可插入工具网格的卡片节点。
   * @throws {Error} 本函数不主动抛错；若传入字段类型异常，DOM API 或下游 openLink 可能失败。
   * @sideeffects 创建 DOM、写入 innerHTML、绑定点击事件和删除按钮事件；不执行外部 I/O。
   */
  function createToolCard(tool) {
    const card = document.createElement('div');
    card.className = 'tool-item';
    card.setAttribute('data-id', tool.id || '');
    card.setAttribute('data-category', tool.category || '');
    card.title = tool.name || '';

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
        // Emoji 或其他（使用透明背景的图标容器）
        iconHtml = `<span class="emoji-icon">${tool.icon}</span>`;
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

    const nameEl = card.querySelector('.tool-name');
    if (nameEl) {
      nameEl.title = tool.name || '';
    }

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

    statusEl.classList.remove('info', 'success', 'error');
    statusEl.textContent = message;
    statusEl.classList.add(type);
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
   * 获取当前可切换的分类顺序（含“全部”）
   * @returns {Array<string>}
   */
  function getCategorySequence() {
    const categoryOrder = ['主页', 'AI', 'Code'];
    const sortedCategories = [...cachedCategories].sort((a, b) => {
      const indexA = categoryOrder.indexOf(a);
      const indexB = categoryOrder.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    return ['all', ...sortedCategories];
  }

  /**
   * 按方向切换到相邻分类
   * @param {number} direction - 1 为向下，-1 为向上
   * @returns {string|null}
   */
  function switchAdjacentCategory(direction) {
    const categories = getCategorySequence();
    if (categories.length <= 1) return null;

    const currentIndex = Math.max(0, categories.indexOf(currentCategory));
    const nextIndex = (currentIndex + direction + categories.length) % categories.length;
    const nextCategory = categories[nextIndex];

    if (!nextCategory || nextCategory === currentCategory) {
      return null;
    }

    switchCategory(nextCategory);
    return nextCategory;
  }

  /**
   * 获取导航数据快照（深拷贝）
   */
  function getNavDataSnapshot() {
    return {
      data: JSON.parse(JSON.stringify(cachedNavData || {})),
      categories: [...cachedCategories],
      dateInfo: cachedDateInfo ? JSON.parse(JSON.stringify(cachedDateInfo)) : null
    };
  }

  /**
   * 设置导航数据并刷新界面
   * @param {Object} data
   * @param {Array} categories
   * @param {Object} dateInfo
   */
  function setNavDataAndRefresh(data, categories, dateInfo) {
    cachedNavData = data || {};
    cachedCategories = categories || [];
    cachedDateInfo = dateInfo || null;

    renderCategoryMenu(cachedCategories);

    if (currentCategory === 'all' || !cachedCategories.includes(currentCategory)) {
      currentCategory = 'all';
      renderTools(cachedNavData);
    } else {
      const filteredData = { [currentCategory]: cachedNavData[currentCategory] || [] };
      renderTools(filteredData);
    }

    renderDateTime(cachedDateInfo);
  }

  function resolveCategoryIcon(category) {
    const normalized = String(category || '').trim();
    if (!normalized) {
      return 'bi-folder';
    }

    const exactIconMap = {
      '主页': 'bi-house-door',
      '首页': 'bi-house-door',
      'Home': 'bi-house-door',
      'AI': 'bi-cpu',
      'AIGC': 'bi-cpu',
      'Code': 'bi-code-slash',
      '开发': 'bi-code-square',
      '编程': 'bi-code-square',
      '技术': 'bi-code-square',
      '文档': 'bi-journal-text',
      '设计': 'bi-palette',
      '工具': 'bi-tools',
      '效率': 'bi-lightning-charge',
      '学习': 'bi-book',
      '娱乐': 'bi-controller',
      '生活': 'bi-cup-hot',
      '社交': 'bi-people',
      '办公': 'bi-briefcase',
      '资讯': 'bi-newspaper',
      '新闻': 'bi-newspaper',
      '搜索': 'bi-search',
      '未分类': 'bi-folder'
    };

    if (exactIconMap[normalized]) {
      return exactIconMap[normalized];
    }

    const keywordIconMap = [
      { test: /ai|gpt|模型|智能/i, icon: 'bi-cpu' },
      { test: /code|开发|编程|技术|程序/i, icon: 'bi-code-square' },
      { test: /设计|创意|ui|ux/i, icon: 'bi-palette' },
      { test: /工具|效率|实用/i, icon: 'bi-tools' },
      { test: /学习|教程|课程|知识|文档/i, icon: 'bi-book' },
      { test: /娱乐|游戏|影音|影视|视频|音乐/i, icon: 'bi-controller' },
      { test: /生活|日常|消费|美食|出行/i, icon: 'bi-cup-hot' },
      { test: /社交|社区|论坛/i, icon: 'bi-people' },
      { test: /办公|工作|协作/i, icon: 'bi-briefcase' },
      { test: /资讯|新闻|媒体/i, icon: 'bi-newspaper' },
      { test: /搜索|导航/i, icon: 'bi-search' }
    ];

    const keywordMatch = keywordIconMap.find(({ test }) => test.test(normalized));
    if (keywordMatch) {
      return keywordMatch.icon;
    }

    if (typeof getCategoryIcon === 'function') {
      return getCategoryIcon(normalized);
    }

    return 'bi-folder2';
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
    getCategorySequence,
    switchAdjacentCategory,
    getNavDataSnapshot,
    setNavDataAndRefresh
  };
})();

// 导出到全局
window.UIRenderer = UIRenderer;
