/**
 * 快速搜索管理器
 *
 * 职责与边界：管理新标签页搜索弹层、键盘唤起、结果渲染、选中态和打开网站；
 * 不负责导航数据持久化、飞书同步、站点 CRUD 或主题管理。
 * 关键副作用：读取当前页面 DOM、绑定全局键盘事件、调用 chrome.tabs.create 打开新标签页；
 * 不直接读写浏览器存储、网络、文件或飞书 API。
 * 关键依赖与约束：依赖 UIRenderer.getNavDataSnapshot() 提供站点快照，
 * 可选依赖 QuickSearchCore 与 pinyinPro，缺失时会降级为普通包含匹配。
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
  let searchResults = [];
  let selectedIndex = -1;
  let lastShiftKeyDownAt = 0;
  let isInitialized = false;

  /**
   * 初始化快速搜索弹层并绑定一次性事件。
   *
   * @returns {void}
   * @throws {Error} 不主动抛错；缺少 DOM 时记录警告并停止初始化。
   * @sideeffects 读取 DOM、绑定全局和弹层事件、设置模块初始化状态。
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
   * 绑定搜索弹层所需的键盘、鼠标和数据刷新事件。
   *
   * @returns {void}
   * @throws {Error} 不主动抛错；依赖调用前已完成 DOM 引用初始化。
   * @sideeffects 绑定 document、overlay、input、list 的事件监听器。
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
   * 处理全局快捷键：打开态下接管导航键，关闭态下监听 Ctrl+F 和双击 Shift。
   *
   * @param {KeyboardEvent} event - 浏览器键盘事件。
   * @returns {void}
   * @throws {Error} 不主动抛错。
   * @sideeffects 可能阻止默认行为、打开搜索框或更新双击 Shift 时间戳。
   */
  function handleGlobalKeyDown(event) {
    if (!isInitialized) return;

    if (isOpen() && handleOpenStateKey(event)) {
      return;
    }
    if (isOpen()) return;

    if (event.ctrlKey && !event.altKey && !event.metaKey && (event.key === 'f' || event.key === 'F')) {
      event.preventDefault();
      lastShiftKeyDownAt = 0;
      open();
      return;
    }

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
   * 处理搜索框打开状态下的键盘操作。
   *
   * @param {KeyboardEvent} event - 浏览器键盘事件。
   * @returns {boolean} 已处理并阻止默认行为时返回 true。
   * @throws {Error} 不主动抛错。
   * @sideeffects 可能移动选中项、打开网站或关闭弹层。
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
   * 打开搜索框并加载当前站点快照。
   *
   * @returns {void}
   * @throws {Error} 不主动抛错。
   * @sideeffects 修改弹层 DOM 状态、刷新搜索结果、聚焦输入框。
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
   * 关闭搜索框。
   *
   * @returns {void}
   * @throws {Error} 不主动抛错。
   * @sideeffects 修改弹层 DOM 状态并移除输入框焦点。
   */
  function close() {
    if (!isInitialized || !isOpen()) return;

    modalEl.classList.remove('active');
    modalEl.setAttribute('aria-hidden', 'true');
    inputEl.blur();
  }

  /**
   * 判断搜索弹层是否打开。
   *
   * @returns {boolean} 打开时返回 true。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function isOpen() {
    return !!modalEl && modalEl.classList.contains('active');
  }

  /**
   * 刷新站点快照、重新搜索并渲染结果。
   *
   * @param {string} keyword - 当前输入关键字。
   * @returns {void}
   * @throws {Error} 不主动抛错；搜索核心异常时在 applyFilter 内降级。
   * @sideeffects 更新模块内站点缓存和结果列表，写入结果 DOM。
   */
  function refreshData(keyword) {
    allSites = collectAllSites();
    applyFilter(keyword);
    renderResults();
  }

  /**
   * 从 UI 渲染器快照中收集所有站点。
   *
   * @returns {Array<Object>} 扁平站点列表，字段包含 id、name、url、icon、category、sort。
   * @throws {Error} 不主动抛错；UIRenderer 不可用时返回空数组。
   * @sideeffects 读取 UIRenderer 快照，不修改外部状态。
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

    return sites;
  }

  /**
   * 应用关键字过滤，并根据核心搜索结果更新当前列表。
   *
   * @param {string} keyword - 用户输入；可为空，支持中文、拼音、首字母、网址和分类。
   * @returns {void}
   * @throws {Error} 不主动抛错；QuickSearchCore 缺失或异常时降级为普通包含匹配。
   * @sideeffects 更新模块内 searchResults 与 selectedIndex，不写入外部状态。
   */
  function applyFilter(keyword) {
    try {
      if (window.QuickSearchCore && typeof QuickSearchCore.searchSites === 'function') {
        searchResults = QuickSearchCore.searchSites(allSites, keyword, {
          pinyinAdapter: getPinyinAdapter()
        });
      } else {
        searchResults = fallbackSearchSites(allSites, keyword);
      }
    } catch (error) {
      console.warn('[QuickSearchManager] 搜索核心异常，已降级为普通搜索:', error);
      searchResults = fallbackSearchSites(allSites, keyword);
    }

    selectedIndex = searchResults.length > 0 ? 0 : -1;
  }

  /**
   * 渲染结果列表。
   *
   * @returns {void}
   * @throws {Error} 不主动抛错；DOM 写入失败会由浏览器抛出。
   * @sideeffects 写入搜索结果列表和空状态 DOM。
   */
  function renderResults() {
    if (!listEl || !emptyEl) return;

    if (searchResults.length === 0) {
      listEl.innerHTML = '';
      const keyword = inputEl ? inputEl.value.trim() : '';
      emptyEl.textContent = keyword ? `没有匹配“${keyword}”的网站` : '暂无可搜索的网站';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    listEl.innerHTML = searchResults.map((result, index) => createItemHtml(result, index)).join('');
    updateSelectionUI();
  }

  /**
   * 生成结果项模板。
   *
   * @param {Object} result - QuickSearchCore 返回的搜索结果。
   * @param {number} index - 当前结果在列表中的索引，用于点击和键盘选择。
   * @returns {string} 可插入列表的 HTML 字符串。
   * @throws {Error} 不主动抛错；字段异常时会按空字符串渲染。
   * @sideeffects 无外部副作用。
   */
  function createItemHtml(result, index) {
    const site = result.site || {};
    const domain = extractDomain(site.url);
    const activeClass = index === selectedIndex ? ' active' : '';
    const selected = index === selectedIndex ? 'true' : 'false';
    const nameHtml = renderHighlightedText(site.name, result.highlight?.name || []);
    const categoryHtml = renderHighlightedText(site.category, result.highlight?.category || []);
    const domainHtml = renderHighlightedText(domain, result.highlight?.domain || []);
    const matchBadge = renderMatchBadge(result.matchType);

    return `
      <li class="quick-search-item${activeClass}" data-index="${index}" role="option" aria-selected="${selected}">
        ${renderSiteIcon(site)}
        <div class="quick-search-item-content">
          <div class="quick-search-item-name"><span class="quick-search-item-name-text">${nameHtml}</span>${matchBadge}</div>
          <div class="quick-search-item-meta">${categoryHtml} · ${domainHtml}</div>
        </div>
      </li>
    `;
  }

  /**
   * 渲染结果项图标。
   *
   * @param {Object} site - 站点数据；icon 可为 URL、data URI、Bootstrap Icons 类名或文本。
   * @returns {string} 图标 HTML。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
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
   * 渲染匹配类型标记。
   *
   * @param {string} matchType - 搜索核心返回的命中类型。
   * @returns {string} 需要展示的标记 HTML；直接命中返回空字符串。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function renderMatchBadge(matchType) {
    const label = getMatchLabel(matchType);
    if (!label) return '';
    return `<span class="quick-search-match-badge">${escapeHtml(label)}</span>`;
  }

  /**
   * 将命中类型映射为用户可读标签。
   *
   * @param {string} matchType - 搜索核心返回的命中类型。
   * @returns {string} 标签文本；不需要展示时返回空字符串。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function getMatchLabel(matchType) {
    const labels = {
      pinyin: '拼音匹配',
      initial: '首字母匹配',
      categoryPinyin: '分类拼音',
      categoryInitial: '分类首字母',
      fuzzyName: '模糊匹配'
    };
    return labels[matchType] || '';
  }

  /**
   * 渲染带高亮的文本。
   *
   * @param {string} text - 原始展示文本。
   * @param {Array<Object>} ranges - 命中范围；start/end 使用原文本索引。
   * @returns {string} 已转义的 HTML 片段。
   * @throws {Error} 不主动抛错；异常范围会被忽略。
   * @sideeffects 无外部副作用。
   */
  function renderHighlightedText(text, ranges) {
    const source = String(text || '');
    const safeRanges = Array.isArray(ranges)
      ? ranges
        .filter(range => range && Number.isFinite(range.start) && Number.isFinite(range.end))
        .map(range => ({
          start: Math.max(0, Math.min(source.length, range.start)),
          end: Math.max(0, Math.min(source.length, range.end))
        }))
        .filter(range => range.end > range.start)
        .sort((a, b) => a.start - b.start)
      : [];

    if (safeRanges.length === 0) {
      return escapeHtml(source);
    }

    let cursor = 0;
    let html = '';
    safeRanges.forEach((range) => {
      if (range.start < cursor) return;
      html += escapeHtml(source.slice(cursor, range.start));
      html += `<mark class="quick-search-highlight">${escapeHtml(source.slice(range.start, range.end))}</mark>`;
      cursor = range.end;
    });
    html += escapeHtml(source.slice(cursor));
    return html;
  }

  /**
   * 移动选中项（循环）。
   *
   * @param {number} delta - 移动方向，1 为向下，-1 为向上。
   * @returns {void}
   * @throws {Error} 不主动抛错。
   * @sideeffects 更新 selectedIndex、选中态 DOM，并滚动当前项到可见区域。
   */
  function moveSelection(delta) {
    if (searchResults.length === 0) return;

    if (selectedIndex < 0) {
      selectedIndex = 0;
    } else {
      const total = searchResults.length;
      selectedIndex = (selectedIndex + delta + total) % total;
    }

    updateSelectionUI();
    scrollSelectedItemIntoView();
  }

  /**
   * 更新结果列表选中项样式。
   *
   * @returns {void}
   * @throws {Error} 不主动抛错。
   * @sideeffects 修改结果项 class 与 aria-selected 属性。
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
   * 打开当前选中的站点。
   *
   * @returns {void}
   * @throws {Error} 不主动抛错；chrome.tabs.create 异常由浏览器环境处理。
   * @sideeffects 可能创建新标签页，并关闭搜索弹层。
   */
  function openSelectedSite() {
    if (searchResults.length === 0) return;

    const index = selectedIndex >= 0 ? selectedIndex : 0;
    const site = searchResults[index]?.site;
    if (!site || !site.url) return;

    let targetUrl = site.url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    chrome.tabs.create({ url: targetUrl });
    close();
  }

  /**
   * 滚动当前选中项到可见区域。
   *
   * @returns {void}
   * @throws {Error} 不主动抛错。
   * @sideeffects 调用 DOM scrollIntoView。
   */
  function scrollSelectedItemIntoView() {
    if (!listEl) return;
    const active = listEl.querySelector('.quick-search-item.active');
    if (!active) return;
    active.scrollIntoView({ block: 'nearest' });
  }

  /**
   * 提取 URL 域名。
   *
   * @param {string} url - 站点 URL，可省略协议。
   * @returns {string} 域名；解析失败时返回原始 URL。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
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
   * 获取站点名称首字。
   *
   * @param {string} name - 站点名称。
   * @returns {string} 首字符大写；空名称返回问号。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function getInitial(name) {
    if (!name) return '?';
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  /**
   * 归一化文本用于降级搜索。
   *
   * @param {string} text - 原始文本。
   * @returns {string} 小写并去首尾空白后的文本。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function normalizeText(text) {
    return String(text || '').trim().toLowerCase();
  }

  /**
   * 获取浏览器端拼音适配器。
   *
   * @returns {Object|null} pinyin-pro 全局对象；不可用时返回 null。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function getPinyinAdapter() {
    if (window.pinyinPro && typeof window.pinyinPro.pinyin === 'function') {
      return window.pinyinPro;
    }
    return null;
  }

  /**
   * 在搜索核心不可用时执行原有包含搜索。
   *
   * @param {Array<Object>} sites - 站点列表。
   * @param {string} keyword - 用户输入。
   * @returns {Array<Object>} 与 QuickSearchCore 兼容的结果列表。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function fallbackSearchSites(sites, keyword) {
    const normalizedKeyword = normalizeText(keyword);
    const sourceSites = Array.isArray(sites) ? sites : [];
    const matchedSites = normalizedKeyword
      ? sourceSites.filter((site) => {
        const haystack = normalizeText(`${site.name} ${site.url} ${site.category}`);
        return haystack.includes(normalizedKeyword);
      })
      : sourceSites.slice();

    return matchedSites.map((site) => ({
      site,
      score: 0,
      matchType: normalizedKeyword ? 'name' : 'empty',
      matchedFields: [],
      highlight: { name: [], category: [], domain: [], url: [] }
    }));
  }

  /**
   * HTML 转义。
   *
   * @param {string} text - 原始文本。
   * @returns {string} 可安全插入 HTML 文本节点位置的字符串。
   * @throws {Error} 不主动抛错。
   * @sideeffects 创建临时 DOM 元素用于浏览器原生转义。
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
  }

  /**
   * HTML 属性值转义。
   *
   * @param {string} text - 原始文本。
   * @returns {string} 可安全插入双引号属性值的字符串。
   * @throws {Error} 不主动抛错。
   * @sideeffects 间接调用 escapeHtml 创建临时 DOM 元素。
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
