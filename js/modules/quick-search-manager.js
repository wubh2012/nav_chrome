/**
 * 快速搜索管理器
 * 双击 Shift 打开搜索框，支持键盘导航与回车跳转
 */
const QuickSearchManager = (function() {
  'use strict';

  const DOUBLE_SHIFT_THRESHOLD = 300;

  let modalEl = null;
  let overlayEl = null;
  let inputEl = null;
  let listEl = null;
  let emptyEl = null;

  let allSites = [];
  let filteredSites = [];
  let selectedIndex = -1;
  let lastShiftKeyDownAt = 0;
  let isInitialized = false;

  /**
   * 初始化
   */
  function init() {
    if (isInitialized) return;

    modalEl = document.getElementById('quick-search-modal');
    overlayEl = document.getElementById('quick-search-overlay');
    inputEl = document.getElementById('quick-search-input');
    listEl = document.getElementById('quick-search-list');
    emptyEl = document.getElementById('quick-search-empty');

    if (!modalEl || !overlayEl || !inputEl || !listEl || !emptyEl) {
      console.warn('[QuickSearchManager] 初始化失败：搜索相关 DOM 不完整');
      return;
    }

    bindEvents();
    isInitialized = true;
    console.log('[QuickSearchManager] 初始化完成');
  }

  /**
   * 绑定事件
   */
  function bindEvents() {
    document.addEventListener('keydown', handleGlobalKeyDown, true);

    overlayEl.addEventListener('click', close);

    inputEl.addEventListener('input', () => {
      applyFilter(inputEl.value);
      renderResults();
    });

    listEl.addEventListener('click', (event) => {
      const item = event.target.closest('.quick-search-item');
      if (!item) return;

      const index = Number(item.getAttribute('data-index'));
      if (Number.isNaN(index)) return;

      selectedIndex = index;
      updateSelectionUI();
      openSelectedSite();
    });

    listEl.addEventListener('mousemove', (event) => {
      const item = event.target.closest('.quick-search-item');
      if (!item) return;

      const index = Number(item.getAttribute('data-index'));
      if (Number.isNaN(index) || index === selectedIndex) return;

      selectedIndex = index;
      updateSelectionUI();
    });

    document.addEventListener('chromeNav:toolsRendered', () => {
      if (!isOpen()) return;
      refreshData(inputEl.value);
    });
  }

  /**
   * 全局键盘处理
   * @param {KeyboardEvent} event
   */
  function handleGlobalKeyDown(event) {
    if (!isInitialized) return;

    if (isOpen() && handleOpenStateKey(event)) {
      return;
    }
    if (isOpen()) return;

    if (event.key !== 'Shift' || event.repeat) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const now = Date.now();
    if (now - lastShiftKeyDownAt <= DOUBLE_SHIFT_THRESHOLD) {
      lastShiftKeyDownAt = 0;
      event.preventDefault();
      open();
      return;
    }

    lastShiftKeyDownAt = now;
  }

  /**
   * 处理搜索框打开状态下的键位
   * @param {KeyboardEvent} event
   * @returns {boolean}
   */
  function handleOpenStateKey(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveSelection(1);
        return true;
      case 'ArrowUp':
        event.preventDefault();
        moveSelection(-1);
        return true;
      case 'Enter':
        event.preventDefault();
        openSelectedSite();
        return true;
      case 'Escape':
        event.preventDefault();
        close();
        return true;
      default:
        return false;
    }
  }

  /**
   * 打开搜索框
   */
  function open() {
    if (!isInitialized) return;

    modalEl.classList.add('active');
    modalEl.setAttribute('aria-hidden', 'false');

    refreshData('');

    inputEl.focus();
    inputEl.select();
  }

  /**
   * 关闭搜索框
   */
  function close() {
    if (!isInitialized || !isOpen()) return;

    modalEl.classList.remove('active');
    modalEl.setAttribute('aria-hidden', 'true');
    inputEl.blur();
  }

  /**
   * 是否处于打开状态
   * @returns {boolean}
   */
  function isOpen() {
    return !!modalEl && modalEl.classList.contains('active');
  }

  /**
   * 刷新站点数据并渲染
   * @param {string} keyword
   */
  function refreshData(keyword) {
    allSites = collectAllSites();
    applyFilter(keyword);
    renderResults();
  }

  /**
   * 收集所有站点数据
   * @returns {Array<Object>}
   */
  function collectAllSites() {
    if (!window.UIRenderer || typeof UIRenderer.getNavDataSnapshot !== 'function') {
      return [];
    }

    const snapshot = UIRenderer.getNavDataSnapshot();
    const data = snapshot?.data || {};
    const sites = [];

    Object.keys(data).forEach((category) => {
      const items = data[category] || [];
      items.forEach((item) => {
        if (!item || !item.name || !item.url) return;
        sites.push({
          id: item.id || '',
          name: item.name,
          url: item.url,
          icon: item.icon || '',
          category,
          sort: Number(item.sort) || 999
        });
      });
    });

    sites.sort((a, b) => {
      if (a.sort !== b.sort) return a.sort - b.sort;
      const byName = a.name.localeCompare(b.name, 'zh-Hans-CN');
      if (byName !== 0) return byName;
      return a.category.localeCompare(b.category, 'zh-Hans-CN');
    });

    return sites;
  }

  /**
   * 应用关键字过滤
   * @param {string} keyword
   */
  function applyFilter(keyword) {
    const normalizedKeyword = normalizeText(keyword);

    if (!normalizedKeyword) {
      filteredSites = allSites.slice();
    } else {
      filteredSites = allSites.filter((site) => {
        const haystack = normalizeText(`${site.name} ${site.url} ${site.category}`);
        return haystack.includes(normalizedKeyword);
      });
    }

    selectedIndex = filteredSites.length > 0 ? 0 : -1;
  }

  /**
   * 渲染结果列表
   */
  function renderResults() {
    if (!listEl || !emptyEl) return;

    if (filteredSites.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    listEl.innerHTML = filteredSites.map((site, index) => createItemHtml(site, index)).join('');
    updateSelectionUI();
  }

  /**
   * 结果项模板
   * @param {Object} site
   * @param {number} index
   * @returns {string}
   */
  function createItemHtml(site, index) {
    const domain = extractDomain(site.url);
    const activeClass = index === selectedIndex ? ' active' : '';
    const selected = index === selectedIndex ? 'true' : 'false';

    return `
      <li class="quick-search-item${activeClass}" data-index="${index}" role="option" aria-selected="${selected}">
        ${renderSiteIcon(site)}
        <div class="quick-search-item-content">
          <div class="quick-search-item-name">${escapeHtml(site.name)}</div>
          <div class="quick-search-item-meta">${escapeHtml(site.category)} · ${escapeHtml(domain)}</div>
        </div>
      </li>
    `;
  }

  /**
   * 渲染结果项图标
   * @param {Object} site
   * @returns {string}
   */
  function renderSiteIcon(site) {
    const icon = site.icon || '';

    if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
      return `<span class="quick-search-item-icon"><img class="quick-search-item-icon-img" src="${escapeAttribute(icon)}" alt=""></span>`;
    }

    if (icon.startsWith('bi-')) {
      return `<span class="quick-search-item-icon"><i class="bi ${escapeAttribute(icon)}"></i></span>`;
    }

    const textIcon = (icon || getInitial(site.name)).slice(0, 2);
    return `<span class="quick-search-item-icon quick-search-item-icon-text">${escapeHtml(textIcon)}</span>`;
  }

  /**
   * 移动选中项（循环）
   * @param {number} delta
   */
  function moveSelection(delta) {
    if (filteredSites.length === 0) return;

    if (selectedIndex < 0) {
      selectedIndex = 0;
    } else {
      const total = filteredSites.length;
      selectedIndex = (selectedIndex + delta + total) % total;
    }

    updateSelectionUI();
    scrollSelectedItemIntoView();
  }

  /**
   * 更新选中项样式
   */
  function updateSelectionUI() {
    if (!listEl) return;

    const items = listEl.querySelectorAll('.quick-search-item');
    items.forEach((item, index) => {
      const active = index === selectedIndex;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  /**
   * 打开当前选中站点
   */
  function openSelectedSite() {
    if (filteredSites.length === 0) return;

    const index = selectedIndex >= 0 ? selectedIndex : 0;
    const site = filteredSites[index];
    if (!site || !site.url) return;

    let targetUrl = site.url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    chrome.tabs.create({ url: targetUrl });
    close();
  }

  /**
   * 滚动到选中项
   */
  function scrollSelectedItemIntoView() {
    if (!listEl) return;
    const active = listEl.querySelector('.quick-search-item.active');
    if (!active) return;
    active.scrollIntoView({ block: 'nearest' });
  }

  /**
   * 提取域名
   * @param {string} url
   * @returns {string}
   */
  function extractDomain(url) {
    if (!url) return '';
    try {
      const normalized = url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `https://${url}`;
      return new URL(normalized).hostname;
    } catch (_error) {
      return url;
    }
  }

  /**
   * 获取名称首字
   * @param {string} name
   * @returns {string}
   */
  function getInitial(name) {
    if (!name) return '?';
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  /**
   * 归一化文本
   * @param {string} text
   * @returns {string}
   */
  function normalizeText(text) {
    return String(text || '').trim().toLowerCase();
  }

  /**
   * HTML 转义
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
  }

  /**
   * 属性值转义
   * @param {string} text
   * @returns {string}
   */
  function escapeAttribute(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
  }

  return {
    init,
    open,
    close
  };
})();

// 导出到全局
window.QuickSearchManager = QuickSearchManager;
