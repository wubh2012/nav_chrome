/**
 * Chrome 导航插件 - 主入口
 */
(function() {
  'use strict';

  console.log('[ChromeNav] 正在初始化...');

  const WHEEL_SWITCH_THRESHOLD = 60;
  const WHEEL_SWITCH_COOLDOWN = 420;
  const SIDEBAR_COLLAPSED_KEY = 'chromeNav_sidebarCollapsed';
  const SIDEBAR_HINT_SHOWN_KEY = 'chromeNav_sidebarHintShown';
  const DATE_REFRESH_INTERVAL = 60 * 1000;
  const TIME_FOCUS_MODE_CLASS = 'time-focus-mode';
  let wheelDeltaAccumulator = 0;
  let wheelCooldownUntil = 0;

  /**
   * 初始化应用
   */
  async function initApp() {
    try {
      await ThemeManager.init();
      ThemeManager.bindEvents();

      UIRenderer.startTimeUpdate();
      startDateRefresh();

      if (window.BackgroundManager) {
        BackgroundManager.init().catch((error) => {
          console.warn('[ChromeNav] Background init failed:', error);
        });
      }

      SyncManager.init();
      startPeriodicSyncIfNeeded();

      const startupState = await loadStartupState();
      await loadNavigationData(startupState);
      LinkManager.init(window.cachedCategories || []);

      if (window.DragSortManager) {
        DragSortManager.init();
      }

      if (window.QuickSearchManager) {
        QuickSearchManager.init();
      }

      bindMobileEvents();
      bindSidebarToggle();
      bindCategoryWheelSwitch();
      bindTimeFocusToggle();
      listenSyncMessages();

      document.body.classList.add('loaded');
      showSidebarToggleHintIfNeeded();

      console.log('[ChromeNav] 初始化完成');
    } catch (error) {
      console.error('[ChromeNav] 初始化失败:', error);
      UIRenderer.showSyncStatus('初始化失败，请刷新重试', 'error');
    }
  }

  /**
   * 根据配置启动定时同步
   */
  async function startPeriodicSyncIfNeeded(startupState = null) {
    try {
      const state = startupState || await loadStartupState();
      if (state.testMode) {
        console.log('[ChromeNav] 测试模式，跳过定时同步');
        return;
      }

      const feishuConfig = state.feishuConfig;
      if (feishuConfig && feishuConfig.syncEnabled !== false) {
        const interval = feishuConfig.syncInterval || 30;
        await SyncManager.startPeriodicSync(interval);
        console.log(`[ChromeNav] 定时同步已启动，间隔 ${interval} 分钟`);
      } else {
        console.log('[ChromeNav] 定时同步未启用');
      }
    } catch (error) {
      console.warn('[ChromeNav] 启动定时同步失败:', error);
    }
  }

  /**
   * 监听同步消息
   */
  function listenSyncMessages() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SYNC_COMPLETE') {
        console.log('[ChromeNav] 收到同步完成通知');

        loadNavigationData(false).then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          console.warn('[ChromeNav] 更新数据失败:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true;
      }

      if (message.type === 'TRIGGER_SYNC') {
        SyncManager.syncNow().then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
        return true;
      }

      return false;
    });
  }

  /**
   * 检查是否首次安装
   */
  async function loadStartupState() {
    const [testMode, feishuConfig, cached] = await Promise.all([
      Storage.getTestMode(),
      Storage.loadFeishuConfig(),
      Storage.loadNavData()
    ]);

    return {
      testMode,
      feishuConfig,
      cached,
      isFirstInstall: !feishuConfig
    };
  }

  /**
   * 加载导航数据
   * @param {boolean} isFirstInstall
   */
  async function loadNavigationData(startupState) {
    try {
      UIRenderer.showSyncStatus('正在加载数据...', 'info');

      const state = startupState || await loadStartupState();
      if (state.testMode) {
        console.log('[ChromeNav] 测试模式已启用');
        await loadTestData();
        return;
      }

      if (state.cached && !state.isFirstInstall) {
        console.log('[ChromeNav] 使用缓存数据');
        UIRenderer.init(state.cached.data, state.cached.categories, getCurrentDateInfo(state.cached.dateInfo));
        window.cachedCategories = state.cached.categories;
        return;
      }

      try {
        const isConfigured = !!(state.feishuConfig && state.feishuConfig.appId && state.feishuConfig.appSecret && state.feishuConfig.appToken);

        if (isConfigured) {
          console.log('[ChromeNav] 从飞书获取数据...');
          await loadFeishuData();
        } else {
          console.log('[ChromeNav] 未配置飞书，进入测试模式数据');
          await loadTestData();

          if (state.isFirstInstall) {
            setTimeout(() => {
              UIRenderer.showSyncStatus('请点击右上角“设置”配置飞书数据', 'info');
            }, 2000);
          }
        }
      } catch (error) {
        console.warn('[ChromeNav] 获取飞书数据失败:', error);

        if (state.cached) {
          UIRenderer.init(state.cached.data, state.cached.categories, getCurrentDateInfo(state.cached.dateInfo));
          window.cachedCategories = state.cached.categories;
          UIRenderer.showSyncStatus('使用缓存数据', 'info');
        } else {
          await loadTestData();
        }
      }
    } catch (error) {
      console.error('[ChromeNav] 加载数据失败:', error);
      await loadTestData();
    }
  }

  /**
   * 加载飞书数据
   */
  async function loadFeishuData() {
    const result = await FeishuAPI.getRecords();
    const dateInfo = getCurrentDateInfo(result.dateInfo);

    await Storage.saveNavData(result.data, result.categories, dateInfo);
    UIRenderer.init(result.data, result.categories, dateInfo);
    window.cachedCategories = result.categories;

    if (window.LinkManager) {
      LinkManager.updateCategories(result.categories);
    }

    UIRenderer.showSyncStatus('数据加载完成', 'success');
    console.log('[ChromeNav] 飞书数据加载完成');
  }

  /**
   * 加载测试数据
   */
  async function loadTestData() {
    console.log('[ChromeNav] 加载测试数据');

    const mockData = FeishuAPI.getMockData();
    const mockDateInfo = getCurrentDateInfo(FeishuAPI.getMockDateInfo());
    const categories = Object.keys(mockData);

    await Storage.saveNavData(mockData, categories, mockDateInfo);
    UIRenderer.init(mockData, categories, mockDateInfo);
    window.cachedCategories = categories;

    if (window.LinkManager) {
      LinkManager.updateCategories(categories);
    }

    UIRenderer.showSyncStatus('测试模式已启用', 'info');
  }

  /**
   * 随机显示底部搜索提示
   */
  function getCurrentDateInfo(fallbackDateInfo = {}) {
    if (window.FeishuAPI && typeof FeishuAPI.getCurrentDateInfo === 'function') {
      return FeishuAPI.getCurrentDateInfo();
    }
    if (window.FeishuAPI && typeof FeishuAPI.getMockDateInfo === 'function') {
      return FeishuAPI.getMockDateInfo();
    }
    return fallbackDateInfo || {};
  }

  function startDateRefresh() {
    UIRenderer.renderDateTime(getCurrentDateInfo());
    setInterval(() => {
      UIRenderer.renderDateTime(getCurrentDateInfo());
    }, DATE_REFRESH_INTERVAL);
  }

  /**
   * 绑定移动端事件
   */
  function bindMobileEvents() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    if (hamburgerBtn && sidebar) {
      hamburgerBtn.addEventListener('click', () => {
        hamburgerBtn.classList.toggle('active');
        sidebar.classList.toggle('active');

        if (overlay) {
          overlay.classList.toggle('active');
        }
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        if (hamburgerBtn) hamburgerBtn.classList.remove('active');
        if (sidebar) sidebar.classList.remove('active');
        overlay.classList.remove('active');
      });
    }

    const settingsBtn = document.getElementById('open-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
    }

    const categoryMenu = document.getElementById('category-menu');
    if (categoryMenu && sidebar) {
      categoryMenu.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          if (hamburgerBtn) hamburgerBtn.classList.remove('active');
          sidebar.classList.remove('active');
          if (overlay) overlay.classList.remove('active');
        }
      });
    }
  }

  /**
   * 绑定滚轮切换分类
   */
  function bindCategoryWheelSwitch() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent || !window.UIRenderer) {
      return;
    }

    mainContent.addEventListener('wheel', handleCategoryWheelSwitch, { passive: false });
  }

  /**
   * 绑定侧栏折叠切换
   */
  function bindSidebarToggle() {
    const toggleTrigger = document.getElementById('sidebar-toggle-trigger') || document.querySelector('.user-avatar');
    if (!toggleTrigger) {
      return;
    }

    applySidebarCollapsedState(getInitialSidebarCollapsedState(), false);

    toggleTrigger.addEventListener('click', () => {
      const nextCollapsed = !document.body.classList.contains('sidebar-collapsed');
      applySidebarCollapsedState(nextCollapsed, true);
    });

    toggleTrigger.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
      const nextCollapsed = !document.body.classList.contains('sidebar-collapsed');
      applySidebarCollapsedState(nextCollapsed, true);
    });
  }

  /**
   * 绑定时间区域双击切换，仅显示时间与背景
   */
  function bindTimeFocusToggle() {
    const timeInfo = document.querySelector('.time-info');
    if (!timeInfo) {
      return;
    }

    timeInfo.addEventListener('dblclick', (event) => {
      event.preventDefault();
      document.body.classList.toggle(TIME_FOCUS_MODE_CLASS);
    });
  }

  function loadSidebarCollapsedState() {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch (_error) {
      return false;
    }
  }

  function getInitialSidebarCollapsedState() {
    const root = document.documentElement;
    const preloadedState = root.dataset.sidebarCollapsed;
    if (preloadedState === '1' || preloadedState === '0') {
      return preloadedState === '1';
    }

    const collapsed = loadSidebarCollapsedState();
    root.dataset.sidebarCollapsed = collapsed ? '1' : '0';
    return collapsed;
  }

  function saveSidebarCollapsedState(collapsed) {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch (_error) {
      // ignore storage failures
    }
  }

  function applySidebarCollapsedState(collapsed, persist) {
    if (window.innerWidth <= 768) {
      collapsed = false;
    }

    document.documentElement.dataset.sidebarCollapsed = collapsed ? '1' : '0';
    document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
    document.body.classList.toggle('sidebar-collapsed', collapsed);

    const toggleTrigger = document.getElementById('sidebar-toggle-trigger') || document.querySelector('.user-avatar');
    if (toggleTrigger) {
      toggleTrigger.title = collapsed ? '点击 Logo 展开侧栏' : '点击 Logo 折叠侧栏';
      toggleTrigger.setAttribute('aria-label', collapsed ? '点击 Logo 展开侧栏' : '点击 Logo 折叠侧栏');
      toggleTrigger.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    if (persist) {
      saveSidebarCollapsedState(collapsed);
    }
  }

  function showSidebarToggleHintIfNeeded() {
    if (window.innerWidth <= 768) {
      return;
    }

    try {
      if (window.localStorage.getItem(SIDEBAR_HINT_SHOWN_KEY) === '1') {
        return;
      }

      document.body.classList.add('sidebar-hint-visible');
      window.localStorage.setItem(SIDEBAR_HINT_SHOWN_KEY, '1');

      window.setTimeout(() => {
        document.body.classList.remove('sidebar-hint-visible');
      }, 3400);
    } catch (_error) {
      document.body.classList.add('sidebar-hint-visible');
      window.setTimeout(() => {
        document.body.classList.remove('sidebar-hint-visible');
      }, 3400);
    }
  }

  /**
   * 处理滚轮切换分类
   * @param {WheelEvent} event
   */
  function handleCategoryWheelSwitch(event) {
    if (window.innerWidth <= 768) return;
    if (!window.UIRenderer || typeof UIRenderer.switchAdjacentCategory !== 'function') return;
    if (shouldIgnoreWheelSwitch(event)) return;

    const now = Date.now();
    if (now < wheelCooldownUntil) {
      event.preventDefault();
      return;
    }

    wheelDeltaAccumulator += event.deltaY;
    if (Math.abs(wheelDeltaAccumulator) < WHEEL_SWITCH_THRESHOLD) {
      return;
    }

    const direction = wheelDeltaAccumulator > 0 ? 1 : -1;
    wheelDeltaAccumulator = 0;
    wheelCooldownUntil = now + WHEEL_SWITCH_COOLDOWN;

    const nextCategory = UIRenderer.switchAdjacentCategory(direction);
    if (!nextCategory) {
      return;
    }

    event.preventDefault();
    const categories = typeof UIRenderer.getCategorySequence === 'function'
      ? UIRenderer.getCategorySequence()
      : [];
    const displayName = nextCategory === 'all' ? '全部' : nextCategory;
    const currentIndex = Math.max(0, categories.indexOf(nextCategory));
    const maxIndex = Math.max(1, categories.length - 1);

    UIRenderer.showSyncStatus(`已切换到分类：${displayName} (${currentIndex}/${maxIndex})`, 'info');
  }

  /**
   * 判断当前滚轮事件是否应忽略
   * @param {WheelEvent} event
   * @returns {boolean}
   */
  function shouldIgnoreWheelSwitch(event) {
    if (document.body.classList.contains(TIME_FOCUS_MODE_CLASS)) {
      return true;
    }

    const target = event.target;
    if (!target) return false;

    if (target.closest('input, textarea, select, button, .modal-content, .quick-search-panel')) {
      return true;
    }

    const quickSearchModal = document.getElementById('quick-search-modal');
    if (quickSearchModal && quickSearchModal.classList.contains('active')) {
      return true;
    }

    return !!document.querySelector('.modal.active');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
