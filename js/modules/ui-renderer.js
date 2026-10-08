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

  const rendererCore = (typeof globalThis !== 'undefined' && globalThis.UIRendererCore)
    ? globalThis.UIRendererCore
    : {
        getCategoryPriority(category) {
          const normalized = String(category || '').trim();
          if (normalized === '主页') return 1;
          if (normalized === 'AI') return 2;
          if (normalized === 'Code') return 3;
          if (normalized === '影视') return 5;
          return 4;
        },
        sortCategoriesByPriority(categories) {
          const safeCategories = Array.isArray(categories) ? categories : [];
          return [...safeCategories].sort((a, b) => {
            const priorityDiff = this.getCategoryPriority(a) - this.getCategoryPriority(b);
            if (priorityDiff !== 0) {
              return priorityDiff;
            }

            return String(a || '').localeCompare(String(b || ''), 'zh-Hans-CN');
          });
        },
        flattenToolsByCategoryPriority(data) {
          if (!data || typeof data !== 'object') {
            return [];
          }

          const tools = [];
          this.sortCategoriesByPriority(Object.keys(data)).forEach((category) => {
            const categoryTools = Array.isArray(data[category]) ? data[category] : [];
            categoryTools.forEach((tool) => {
              tools.push({ ...tool, category });
            });
          });

          return tools.sort((left, right) => {
            const leftSort = Number(left.sort);
            const rightSort = Number(right.sort);
            const leftValid = left.sort != null && left.sort !== '' && Number.isFinite(leftSort);
            const rightValid = right.sort != null && right.sort !== '' && Number.isFinite(rightSort);
            if (leftValid !== rightValid) return leftValid ? -1 : 1;
            if (leftValid && leftSort !== rightSort) return leftSort - rightSort;
            const priorityDiff = this.getCategoryPriority(left.category) - this.getCategoryPriority(right.category);
            if (priorityDiff) return priorityDiff;
            const categoryDiff = String(left.category || '').localeCompare(String(right.category || ''), 'zh-Hans-CN');
            return categoryDiff || String(left.id || '').localeCompare(String(right.id || ''), 'zh-Hans-CN');
          });
        }
      };

  // 当前选中的分类
  let currentCategory = 'all';

  // 缓存的导航数据
  let cachedNavData = null;
  let cachedCategories = [];
  let cachedDateInfo = null;
  let cachedRevision = 0;

  /**
   * 初始化 UI
   * @param {Object} data - 导航数据
   * @param {Array} categories - 分类列表
   * @param {Object} dateInfo - 日期信息
   */
  async function init(data, categories, dateInfo, revision = 0) {
    cachedNavData = data;
    cachedCategories = categories;
    cachedDateInfo = dateInfo;
    cachedRevision = Number(revision || 0);
    if (currentCategory !== 'all' && !cachedCategories.includes(currentCategory)) {
      currentCategory = 'all';
    }

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

    const sortedCategories = rendererCore.sortCategoriesByPriority(categories);

    menu.textContent = '';
    const fragment = document.createDocumentFragment();
    fragment.appendChild(createCategoryMenuItem('all', '全部', 'bi-grid-3x3-gap', currentCategory === 'all'));

    sortedCategories.forEach(category => {
      fragment.appendChild(createCategoryMenuItem(category, category, resolveCategoryIcon(category), currentCategory === category));
    });

    menu.appendChild(fragment);

    // 绑定点击事件
    menu.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        const category = li.getAttribute('data-category');
        switchCategory(category);
      });
      li.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          li.click();
        }
      });
    });
  }

  function createCategoryMenuItem(category, label, iconClass, active) {
    const item = document.createElement('li');
    item.dataset.category = String(category || '');
    item.classList.toggle('active', Boolean(active));
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-pressed', String(Boolean(active)));
    item.title = label || '';

    const icon = document.createElement('i');
    icon.classList.add('bi');
    icon.classList.add(resolveSafeIconClass(iconClass));

    item.appendChild(icon);
    const labelElement = document.createElement('span');
    labelElement.className = 'category-label';
    labelElement.textContent = label || '';
    item.appendChild(labelElement);
    const countElement = document.createElement('span');
    countElement.className = 'category-count';
    const items = category === 'all'
      ? rendererCore.flattenToolsByCategoryPriority(cachedNavData)
      : cachedNavData?.[category];
    countElement.textContent = String(Array.isArray(items) ? items.length : 0);
    countElement.setAttribute('aria-hidden', 'true');
    item.appendChild(countElement);
    return item;
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
    if (document.body.classList.contains('wooden-home')) category = 'all';
    currentCategory = category;

    // 更新菜单激活状态
    document.querySelectorAll('#category-menu li').forEach(li => {
      if (li.getAttribute('data-category') === category) {
        li.classList.add('active');
        li.setAttribute('aria-pressed', 'true');
      } else {
        li.classList.remove('active');
        li.setAttribute('aria-pressed', 'false');
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
    grid.textContent = '';

    const tools = rendererCore.flattenToolsByCategoryPriority(data);
    const title = document.getElementById('collection-title');
    const count = document.getElementById('collection-count');
    if (title) title.textContent = currentCategory === 'all' ? '我的网站果园' : currentCategory;
    if (count) count.textContent = `${tools.length} 个网站`;

    if (tools.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.textContent = '这里还没有网站，点击「添加网站」收藏第一个。';
      grid.appendChild(emptyState);
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
   * @sideeffects 创建 DOM、绑定点击事件和删除按钮事件；不执行外部 I/O。
   */
  function createToolCard(tool) {
    const card = document.createElement('div');
    card.className = 'tool-item';
    card.setAttribute('data-id', tool.id || '');
    card.setAttribute('data-category', tool.category || '');
    card.title = tool.name || '';
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', tool.name || '打开网站');

    const { element: iconElement, useImageIcon } = createToolIconElement(tool);
    const nameElement = document.createElement('span');
    nameElement.className = 'tool-name';
    nameElement.textContent = tool.name || '';
    const copyElement = document.createElement('div');
    copyElement.className = 'tool-copy';
    const domainElement = document.createElement('span');
    domainElement.className = 'tool-domain';
    try {
      domainElement.textContent = new URL(tool.url).hostname.replace(/^www\./, '') || tool.category || '';
    } catch (_error) {
      domainElement.textContent = tool.category || '';
    }
    copyElement.appendChild(nameElement);
    copyElement.appendChild(domainElement);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'tool-item-delete-btn';
    deleteButton.title = '删除';
    deleteButton.setAttribute('aria-label', `删除 ${tool.name || '网站'}`);

    const deleteIcon = document.createElement('i');
    deleteIcon.classList.add('bi', 'bi-x');
    deleteButton.appendChild(deleteIcon);

    const iconTile = document.createElement('span');
    iconTile.className = 'tool-icon-tile';
    iconTile.appendChild(iconElement);
    card.appendChild(iconTile);
    card.appendChild(copyElement);
    card.appendChild(deleteButton);

    const nameEl = card.querySelector('.tool-name');
    if (nameEl) {
      nameEl.title = tool.name || '';
    }

    if (useImageIcon) {
      const imageIcon = card.querySelector('.tool-icon');
      if (imageIcon) {
        imageIcon.addEventListener('error', () => {
          imageIcon.replaceWith(createTextIconElement(getInitial(tool.name)));
        }, { once: true });
      }
    }

    // 点击打开链接
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.tool-item-delete-btn')) {
        openLink(tool.url);
      }
    });
    card.addEventListener('keydown', event => {
      if (event.target === card && event.key === 'Enter') {
        event.preventDefault();
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

  function createToolIconElement(tool) {
    const icon = String(tool?.icon || '');

    if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
      const image = document.createElement('img');
      image.src = icon;
      image.alt = tool?.name || '';
      image.className = 'tool-icon';
      return { element: image, useImageIcon: true };
    }

    if (isSafeIconClass(icon)) {
      const iconElement = document.createElement('i');
      iconElement.classList.add('bi', icon, 'tool-icon');
      return { element: iconElement, useImageIcon: false };
    }

    if (/^[\u4e00-\u9fa5]$/.test(icon)) {
      return { element: createTextIconElement(icon), useImageIcon: false };
    }

    if (icon) {
      const emoji = document.createElement('span');
      emoji.className = 'emoji-icon';
      emoji.textContent = icon;
      return { element: emoji, useImageIcon: false };
    }

    return { element: createTextIconElement(getInitial(tool?.name)), useImageIcon: false };
  }

  function isSafeIconClass(iconClass) {
    return /^(bi|fa)-[A-Za-z0-9_-]+$/.test(String(iconClass || ''));
  }

  function resolveSafeIconClass(iconClass) {
    return isSafeIconClass(iconClass) ? iconClass : 'bi-folder2';
  }

  function createTextIconElement(text) {
    const colors = [
      'linear-gradient(135deg, #ff6b6b, #ee5a24)',
      'linear-gradient(135deg, #feca57, #ff9f43)',
      'linear-gradient(135deg, #26de81, #20bf6b)',
      'linear-gradient(135deg, #45aaf2, #2d98da)',
      'linear-gradient(135deg, #a55eea, #8854d0)',
      'linear-gradient(135deg, #fc5c65, #eb3b5a)'
    ];
    const color = colors[Math.abs(hashCode(text)) % colors.length];
    const element = document.createElement('span');
    element.className = 'text-icon';
    element.style.background = color;
    element.textContent = text;
    return element;
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
    if (dateEl) {
      const safeDateInfo = dateInfo || createLocalDateInfo();
      const dateParts = [];

      if (safeDateInfo.date) {
        dateParts.push(safeDateInfo.date);
      }

      if (safeDateInfo.weekday) {
        dateParts.push(safeDateInfo.weekday);
      }

      if (safeDateInfo.lunarDate) {
        dateParts.push(safeDateInfo.lunarDate);
      }

      dateEl.textContent = dateParts.join(' · ') || createLocalDateInfo().date;
    }
  }

  function createLocalDateInfo() {
    const now = new Date();
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

    return {
      date: `${now.getMonth() + 1}月${now.getDate()}日`,
      weekday: weekdays[now.getDay()],
      lunarDate: ''
    };
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
    return ['all', ...rendererCore.sortCategoriesByPriority(cachedCategories)];
  }

  /**
   * 按方向切换到相邻分类
   * @param {number} direction - 1 为向下，-1 为向上
   * @returns {string|null}
   */
  function switchAdjacentCategory(direction) {
    if (document.body.classList.contains('wooden-home')) return null;
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
      dateInfo: cachedDateInfo ? JSON.parse(JSON.stringify(cachedDateInfo)) : null,
      revision: cachedRevision
    };
  }

  /**
   * 设置导航数据并刷新界面
   * @param {Object} data
   * @param {Array} categories
   * @param {Object} dateInfo
   */
  function setNavDataAndRefresh(data, categories, dateInfo, revision = cachedRevision) {
    cachedNavData = data || {};
    cachedCategories = categories || [];
    cachedDateInfo = dateInfo || null;
    cachedRevision = Number(revision || 0);
    if (!cachedCategories.includes(currentCategory)) currentCategory = 'all';

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

  /**
   * 仅更新指定分类的缓存顺序，不触发整页重渲染。
   * @param {string} category
   * @param {Array<Object>} items
   */
  function updateCategoryOrder(category, items) {
    const normalizedCategory = String(category || '').trim();
    if (!normalizedCategory) {
      return;
    }

    if (!cachedNavData || typeof cachedNavData !== 'object') {
      cachedNavData = {};
    }

    cachedNavData[normalizedCategory] = Array.isArray(items) ? items : [];

    if (!cachedCategories.includes(normalizedCategory)) {
      cachedCategories = [...cachedCategories, normalizedCategory];
    }
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
    setNavDataAndRefresh,
    updateCategoryOrder
  };
})();

// 导出到全局
globalThis.UIRenderer = UIRenderer;
