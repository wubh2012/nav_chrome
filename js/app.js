/**
 * Chrome 导航插件 - 主入口
 */
(function() {
  'use strict';

  console.log('[ChromeNav] 正在初始化...');

  /**
   * 初始化应用
   */
  async function initApp() {
    try {
      // 1. 初始化主题管理器（优先加载主题）
      await ThemeManager.init();
      ThemeManager.bindEvents();

      // 2. 初始化同步管理器
      SyncManager.init();
      await startPeriodicSyncIfNeeded();

      // 3. 检查是否首次安装
      const isFirstInstall = await checkFirstInstall();

      // 4. 加载数据
      await loadNavigationData(isFirstInstall);

      // 5. 初始化 UI 渲染器
      UIRenderer.startTimeUpdate();

      // 6. 初始化链接管理器
      LinkManager.init(window.cachedCategories || []);

      // 7. 绑定移动端事件
      bindMobileEvents();

      // 8. 监听后台同步消息
      listenSyncMessages();

      // 9. 标记页面加载完成，触发动画
      document.body.classList.add('loaded');

      console.log('[ChromeNav] 初始化完成');
    } catch (error) {
      console.error('[ChromeNav] 初始化失败:', error);
      UIRenderer.showSyncStatus('初始化失败，请刷新重试', 'error');
    }
  }

  /**
   * 根据配置启动定时同步
   */
  async function startPeriodicSyncIfNeeded() {
    try {
      const testMode = await Storage.getTestMode();
      if (testMode) {
        console.log('[ChromeNav] 测试模式，跳过定时同步');
        return;
      }

      const feishuConfig = await Storage.loadFeishuConfig();
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

        // 重新加载数据并更新 UI
        loadNavigationData(false).then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          console.warn('[ChromeNav] 更新数据失败:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true;
      }

      if (message.type === 'TRIGGER_SYNC') {
        // 后台触发同步
        SyncManager.syncNow().then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
        return true;
      }
    });
  }

  /**
   * 检查是否首次安装
   */
  async function checkFirstInstall() {
    const config = await Storage.loadFeishuConfig();
    return !config;
  }

  /**
   * 加载导航数据
   * @param {boolean} isFirstInstall - 是否首次安装
   */
  async function loadNavigationData(isFirstInstall) {
    try {
      UIRenderer.showSyncStatus('正在加载数据...', 'info');

      // 检查测试模式
      const testMode = await Storage.getTestMode();

      if (testMode) {
        console.log('[ChromeNav] 测试模式已启用');
        await loadTestData();
        return;
      }

      // 检查是否有缓存数据
      const cached = await Storage.loadNavData();

      if (cached && !isFirstInstall) {
        console.log('[ChromeNav] 使用缓存数据');
        UIRenderer.init(cached.data, cached.categories, cached.dateInfo || {});
        window.cachedCategories = cached.categories;

        return;
      }

      // 尝试获取飞书数据
      try {
        const isConfigured = await Storage.isFeishuConfigured();

        if (isConfigured) {
          console.log('[ChromeNav] 从飞书获取数据...');
          await loadFeishuData();
        } else {
          console.log('[ChromeNav] 未配置飞书，进入测试模式数据');
          await loadTestData();

          // 提示用户配置
          if (isFirstInstall) {
            setTimeout(() => {
              UIRenderer.showSyncStatus('请点击右上角"设置"配置飞书数据', 'info');
            }, 2000);
          }
        }
      } catch (error) {
        console.warn('[ChromeNav] 获取飞书数据失败:', error);

        // 如果有缓存，使用缓存
        if (cached) {
          UIRenderer.init(cached.data, cached.categories, cached.dateInfo || {});
          window.cachedCategories = cached.categories;
          UIRenderer.showSyncStatus('使用缓存数据', 'info');
        } else {
          // 没有缓存时加载测试数据
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

    // 保存到存储
    await Storage.saveNavData(result.data, result.categories, result.dateInfo);

    // 更新 UI
    UIRenderer.init(result.data, result.categories, result.dateInfo);
    window.cachedCategories = result.categories;

    // 更新链接管理器
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
    const mockDateInfo = FeishuAPI.getMockDateInfo();
    const categories = Object.keys(mockData);

    // 保存到存储
    await Storage.saveNavData(mockData, categories, mockDateInfo);

    // 更新 UI
    UIRenderer.init(mockData, categories, mockDateInfo);
    window.cachedCategories = categories;

    // 更新链接管理器
    if (window.LinkManager) {
      LinkManager.updateCategories(categories);
    }

    UIRenderer.showSyncStatus('测试模式已启用', 'info');
  }

  /**
   * 后台刷新数据
   * 仅当数据真正变化时才更新 UI，避免图标闪烁
   */
  async function refreshDataBackground() {
    try {
      const isConfigured = await Storage.isFeishuConfigured();

      if (!isConfigured) return;

      // 保存同步状态
      await Storage.saveSyncStatus('syncing', '同步中...');

      const result = await FeishuAPI.getRecords();

      // 先比较数据是否变化（注意：要在保存之前比较）
      const cached = await Storage.loadNavData();
      const hasChanged = !cached || JSON.stringify(cached.data) !== JSON.stringify(result.data);

      // 仅在数据变化时才保存和更新 UI
      if (hasChanged) {
        // 保存到存储
        await Storage.saveNavData(result.data, result.categories, result.dateInfo);

        // 更新 UI
        UIRenderer.init(result.data, result.categories, result.dateInfo);
        window.cachedCategories = result.categories;

        // 更新链接管理器
        if (window.LinkManager) {
          LinkManager.updateCategories(result.categories);
        }
        console.log('[ChromeNav] 后台刷新完成，数据已更新');
      } else {
        console.log('[ChromeNav] 后台刷新完成，数据无变化，跳过更新');
      }

      await Storage.saveSyncStatus('success', '同步完成');

      setTimeout(() => {
        const syncStatus = document.getElementById('sync-status');
        if (syncStatus) {
          syncStatus.classList.remove('show');
        }
      }, 3000);
    } catch (error) {
      console.warn('[ChromeNav] 后台刷新失败:', error);
      await Storage.saveSyncStatus('error', '同步失败');
    }
  }

  /**
   * 绑定移动端事件
   */
  function bindMobileEvents() {
    // 汉堡菜单
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

    // 点击遮罩关闭
    if (overlay) {
      overlay.addEventListener('click', () => {
        if (hamburgerBtn) hamburgerBtn.classList.remove('active');
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
      });
    }

    // 设置按钮
    const settingsBtn = document.getElementById('open-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
    }

    // 关闭侧边栏当选择分类时
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
   * 页面加载完成后初始化
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
