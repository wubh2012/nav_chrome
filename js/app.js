/**
 * Chrome 导航插件 - 主入口
 */
(function() {
  'use strict';

  console.log('[ChromeNav] 正在初始化...');

  const WHEEL_SWITCH_THRESHOLD = 60;
  const WHEEL_SWITCH_COOLDOWN = 420;
  const SHORTCUT_HINT_SHOWN_KEY = 'chromeNav_shortcutHintShown';
  const DATE_REFRESH_INTERVAL = 60 * 1000;
  const TIME_FOCUS_MODE_CLASS = 'time-focus-mode';
  let wheelDeltaAccumulator = 0;
  let wheelCooldownUntil = 0;

  /**
   * 初始化应用
   */
  async function initApp() {
    try {
      if (window.HomeLayout) await HomeLayout.init();
      await ThemeManager.init();
      if (typeof FontManager !== 'undefined') await FontManager.init();
      ThemeManager.bindEvents();

      if (window.PixelGarden && document.body.classList.contains('pixel-home')) {
        await PixelGarden.init(document.querySelector('.main-content'));
      }

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

      bindPageActions();
      bindCategoryWheelSwitch();
      bindTimeFocusToggle();
      bindShortcutHelp();
      listenSyncMessages();
      listenNavigationStorageChanges();

      document.body.classList.add('loaded');
      showShortcutToastIfNeeded();

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

  function listenNavigationStorageChanges() {
    chrome.storage?.onChanged?.addListener(async (changes, areaName) => {
      if (areaName !== 'local') return;
      try {
        const [testMode, config] = await Promise.all([
          Storage.getTestMode(), Storage.loadFeishuConfig()
        ]);
        const scope = testMode ? 'test-mode'
          : `${config?.appToken || 'unconfigured'}:${config?.tableId || 'default'}`;
        const revisionChange = changes[Storage.getNavDataRevisionKey(scope)];
        if (!revisionChange) return;
        const nextRevision = Number(revisionChange.newValue || 0);
        if (nextRevision <= UIRenderer.getNavDataSnapshot().revision) return;

        const [cached, pending] = await Promise.all([
          Storage.loadNavData(scope), Storage.loadPendingSortSync(scope)
        ]);
        if (!cached || cached.revision < nextRevision) return;
        await renderResolvedNavigation(cached.data, cached.categories, cached.dateInfo,
          pending, cached.revision, scope);
      } catch (error) {
        console.warn('[ChromeNav] 同步其他标签页的网站顺序失败:', error);
      }
    });
  }

  /**
   * 检查是否首次安装
   */
  async function loadStartupState() {
    const [testMode, feishuConfig] = await Promise.all([
      Storage.getTestMode(),
      Storage.loadFeishuConfig()
    ]);
    const dataScope = testMode ? 'test-mode'
      : `${feishuConfig?.appToken || 'unconfigured'}:${feishuConfig?.tableId || 'default'}`;
    const [cached, pendingSortSync] = await Promise.all([
      Storage.loadNavData(dataScope), Storage.loadPendingSortSync(dataScope)
    ]);

    return {
      testMode,
      feishuConfig,
      cached,
      pendingSortSync,
      dataScope,
      isFirstInstall: !feishuConfig
    };
  }

  /**
   * 在渲染前用本地待同步排序覆盖远端数据，避免刷新覆盖掉本地最新顺序。
   * @param {Object} data
   * @param {Object|null} pendingSortSync
   * @returns {Object}
   */
  function resolveNavDataForRender(data, pendingSortSync = null) {
    if (!pendingSortSync || !globalThis.DragSortCore) {
      return data;
    }

    return DragSortCore.applyPendingSortToNavData(data, pendingSortSync);
  }

  /**
   * 统一渲染导航数据并同步分类缓存。
   * @param {Object} data
   * @param {Array<string>} categories
   * @param {Object} dateInfo
   * @param {Object|null} pendingSortSync
   */
  async function renderResolvedNavigation(data, categories, dateInfo, pendingSortSync = null, revision = null, dataScope = null) {
    const resolvedData = resolveNavDataForRender(data, pendingSortSync);
    await UIRenderer.init(resolvedData, categories, dateInfo,
      revision === null ? await Storage.getNavDataRevision(dataScope) : revision);
    window.cachedCategories = categories;

    if (window.LinkManager) {
      LinkManager.updateCategories(categories);
    }
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
        await renderResolvedNavigation(
          state.cached.data,
          state.cached.categories,
          getCurrentDateInfo(state.cached.dateInfo),
          state.pendingSortSync,
          state.cached.revision,
          state.dataScope
        );
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
              UIRenderer.showSyncStatus('请在“设置”中配置飞书数据', 'info');
            }, 2000);
          }
        }
      } catch (error) {
        console.warn('[ChromeNav] 获取飞书数据失败:', error);

        if (state.cached) {
          await renderResolvedNavigation(
            state.cached.data,
            state.cached.categories,
            getCurrentDateInfo(state.cached.dateInfo),
            state.pendingSortSync,
            state.cached.revision,
            state.dataScope
          );
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
    const config = await Storage.loadFeishuConfig();
    const dataScope = `${config?.appToken || 'unconfigured'}:${config?.tableId || 'default'}`;
    const expectedRevision = await Storage.getNavDataRevision(dataScope);
    const result = await FeishuAPI.getRecords();
    const dateInfo = getCurrentDateInfo(result.dateInfo);
    const pendingSortSync = await Storage.loadPendingSortSync(dataScope);
    const resolvedData = pendingSortSync && globalThis.DragSortCore
      ? DragSortCore.applyPendingSortToNavData(result.data, pendingSortSync)
      : result.data;
    const committed = await Storage.commitNavData(result.data, result.categories, dateInfo, {
      expectedRevision,
      dataScope,
      preserveSyncTime: false
    });

    if (!committed.success) {
      const latest = committed.current || await Storage.loadNavData(dataScope);
      if (!latest) throw new Error(committed.error || '网站列表已更新，请重新加载');
      const latestPendingSort = await Storage.loadPendingSortSync(dataScope);
      await renderResolvedNavigation(latest.data, latest.categories,
        getCurrentDateInfo(latest.dateInfo), latestPendingSort, latest.revision, dataScope);
      UIRenderer.showSyncStatus('网站列表已在其他标签页更新，已显示最新版本', 'info');
      return;
    }

    await renderResolvedNavigation(resolvedData, result.categories, dateInfo, pendingSortSync,
      committed.revision, dataScope);

    UIRenderer.showSyncStatus('数据加载完成', 'success');
    console.log('[ChromeNav] 飞书数据加载完成');
  }

  /**
   * 加载测试数据
   */
  async function loadTestData() {
    console.log('[ChromeNav] 加载测试数据');

    const cached = await Storage.loadNavData('test-mode');
    if (cached) {
      const pendingSortSync = await Storage.loadPendingSortSync('test-mode');
      await renderResolvedNavigation(cached.data, cached.categories,
        getCurrentDateInfo(cached.dateInfo), pendingSortSync, cached.revision, 'test-mode');
      UIRenderer.showSyncStatus('测试模式已启用', 'info');
      return;
    }

    const mockData = FeishuAPI.getMockData();
    const mockDateInfo = getCurrentDateInfo(FeishuAPI.getMockDateInfo());
    const categories = Object.keys(mockData);

    await Storage.saveNavData(mockData, categories, mockDateInfo, { dataScope: 'test-mode' });
    await renderResolvedNavigation(mockData, categories, mockDateInfo, null,
      await Storage.getNavDataRevision('test-mode'), 'test-mode');

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
   * 绑定页面操作
   */
  function bindPageActions() {
    const manageBtn = document.getElementById('manage-sites-btn');
    manageBtn?.addEventListener('click', () => {
      const managing = document.body.classList.toggle('site-manage-mode');
      manageBtn.setAttribute('aria-pressed',String(managing));
      const label = managing ? '完成整理' : '整理网站';
      manageBtn.setAttribute('aria-label',label); manageBtn.title = label;
      manageBtn.querySelector('i').className = managing ? 'bi bi-check-lg' : 'bi bi-pencil';
      document.body.dispatchEvent(new CustomEvent('chromeNav:siteManageModeChanged', {
        detail: { managing }
      }));
    });
    const settingsBtn = document.getElementById('open-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
      settingsBtn.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          settingsBtn.click();
        }
      });
    }
  }

  /**
   * 绑定滚轮切换分类
   */
  function bindCategoryWheelSwitch() {
    if (document.body.classList.contains('wooden-home')) return;
    const categoryMenu = document.getElementById('category-menu');
    const mainContent = document.querySelector('.main-content');
    if (!window.UIRenderer) {
      return;
    }

    if (categoryMenu) {
      categoryMenu.addEventListener('wheel', handleCategoryWheelSwitch, { passive: false });
    }

    if (mainContent) {
      mainContent.addEventListener('wheel', handleMainContentWheelSwitch, { passive: false });
    }
  }

  function bindShortcutHelp() {
    const anchor = document.querySelector('.theme-toggle-anchor');
    const button = document.getElementById('shortcut-help-btn');
    const panel = document.getElementById('shortcut-help-panel');
    if (!anchor || !button || !panel) {
      return;
    }

    const closePanel = () => {
      anchor.classList.remove('shortcut-help-open');
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
      button.setAttribute('aria-expanded', 'false');
    };

    const openPanel = () => {
      anchor.classList.add('shortcut-help-open');
      panel.classList.add('is-open');
      panel.setAttribute('aria-hidden', 'false');
      button.setAttribute('aria-expanded', 'true');
      hideShortcutToast();
      markShortcutHintShown();
    };

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (panel.classList.contains('is-open')) {
        closePanel();
      } else {
        openPanel();
      }
    });

    document.addEventListener('pointerdown', (event) => {
      if (!panel.classList.contains('is-open')) {
        return;
      }
      if (anchor.contains(event.target)) {
        return;
      }
      closePanel();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && panel.classList.contains('is-open')) {
        closePanel();
      }
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

    const syncTimeFocusState = () => {
      const isFocused = document.body.classList.contains(TIME_FOCUS_MODE_CLASS);
      timeInfo.setAttribute('aria-pressed', isFocused ? 'true' : 'false');
      timeInfo.title = isFocused ? '双击退出时间聚焦' : '双击进入时间聚焦';
    };

    const toggleTimeFocusMode = () => {
      document.body.classList.toggle(TIME_FOCUS_MODE_CLASS);
      syncTimeFocusState();
    };

    timeInfo.setAttribute('role', 'button');
    timeInfo.setAttribute('tabindex', '0');
    timeInfo.setAttribute('aria-label', '时间聚焦模式');
    syncTimeFocusState();

    timeInfo.addEventListener('dblclick', (event) => {
      event.preventDefault();
      toggleTimeFocusMode();
    });

    timeInfo.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
      toggleTimeFocusMode();
    });
  }

  function showShortcutToastIfNeeded() {
    const toast = document.getElementById('shortcut-toast');
    if (!toast || window.innerWidth <= 768 || hasShortcutHintShown()) {
      return;
    }

    window.setTimeout(() => {
      toast.classList.add('is-visible');
      markShortcutHintShown();

      window.setTimeout(() => {
        hideShortcutToast();
      }, 4200);
    }, 1200);
  }

  function hideShortcutToast() {
    const toast = document.getElementById('shortcut-toast');
    if (toast) {
      toast.classList.remove('is-visible');
    }
  }

  function hasShortcutHintShown() {
    try {
      return window.localStorage.getItem(SHORTCUT_HINT_SHOWN_KEY) === '1';
    } catch (_error) {
      return false;
    }
  }

  function markShortcutHintShown() {
    try {
      window.localStorage.setItem(SHORTCUT_HINT_SHOWN_KEY, '1');
    } catch (_error) {
      // ignore storage failures
    }
  }

  /**
   * 处理主内容区 Shift + 滚轮切换分类
   * @param {WheelEvent} event
   */
  function handleMainContentWheelSwitch(event) {
    if (!event.shiftKey) {
      return;
    }

    handleCategoryWheelSwitch(event);
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

    if (target.closest('input, textarea, select, button, dialog, #garden-panel, .modal-content, .quick-search-panel')) {
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
