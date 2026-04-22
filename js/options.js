/**
 * Options page logic.
 */
(function() {
  'use strict';

  console.log('[Options] 正在初始化...');

  // DOM references
  const elements = {
    appId: document.getElementById('app-id'),
    appSecret: document.getElementById('app-secret'),
    appToken: document.getElementById('app-token'),
    tableId: document.getElementById('table-id'),
    saveBtn: document.getElementById('save-btn'),
    testBtn: document.getElementById('test-connection-btn'),
    testModeToggle: document.getElementById('test-mode-toggle'),
    statusMessage: document.getElementById('status-message'),
    testModeNotice: document.getElementById('test-mode-notice'),
    clearCacheBtn: document.getElementById('clear-cache-btn'),
    resetBtn: document.getElementById('reset-btn'),
    viewGuideBtn: document.getElementById('view-guide-btn'),
    backgroundModeInputs: document.querySelectorAll('input[name="background-mode"]'),
    backgroundModeOptions: document.querySelectorAll('.mode-option'),
    backgroundUploadSection: document.getElementById('background-upload-section'),
    backgroundUrlSection: document.getElementById('background-url-section'),
    backgroundFileInput: document.getElementById('background-file'),
    backgroundFileMeta: document.getElementById('background-file-meta'),
    backgroundUrl: document.getElementById('background-url'),
    backgroundSize: document.getElementById('background-size'),
    backgroundOverlay: document.getElementById('background-overlay'),
    backgroundOverlayValue: document.getElementById('background-overlay-value'),
    backgroundBlur: document.getElementById('background-blur'),
    backgroundBlurValue: document.getElementById('background-blur-value'),
    backgroundSaveBtn: document.getElementById('background-save-btn'),
    backgroundResetBtn: document.getElementById('background-reset-btn'),
    backgroundStatusMessage: document.getElementById('background-status-message')
  };

  let pendingBackgroundFile = null;

  /**
   * Initialize page state.
   */
  async function init() {
    await loadConfig();
    bindEvents();
    console.log('[Options] 初始化完成');
  }

  /**
   * Load persisted settings.
   */
  async function loadConfig() {
    try {
      // Load Feishu config.
      const config = await Storage.loadFeishuConfig();
      if (config) {
        elements.appId.value = config.appId || '';
        elements.appSecret.value = config.appSecret || '';
        elements.appToken.value = config.appToken || '';
        elements.tableId.value = config.tableId || '';
      }

      // Load test mode state.
      const testMode = await Storage.getTestMode();
      elements.testModeToggle.checked = testMode;
      updateTestModeUI(testMode);

      if (Storage.loadBackgroundSettings) {
        const backgroundSettings = await Storage.loadBackgroundSettings();
        populateBackgroundSettings(backgroundSettings);
      }
    } catch (error) {
      console.error('[Options] 加载配置失败:', error);
    }
  }

  /**
   * Bind event listeners.
   */
  function bindEvents() {
    // Save config.
    elements.saveBtn.addEventListener('click', saveConfig);

    // Test connection.
    elements.testBtn.addEventListener('click', testConnection);

    // Toggle test mode.
    elements.testModeToggle.addEventListener('change', toggleTestMode);

    // Clear cache.
    elements.clearCacheBtn.addEventListener('click', clearCache);

    // Reset all settings.
    elements.resetBtn.addEventListener('click', resetAll);

    // Open guide.
    elements.viewGuideBtn.addEventListener('click', showGuide);

    elements.backgroundModeInputs.forEach((input) => {
      input.addEventListener('change', () => {
        updateBackgroundModeUI(input.value);
      });
    });

    if (elements.backgroundFileInput) {
      elements.backgroundFileInput.addEventListener('change', handleBackgroundFileChange);
    }

    if (elements.backgroundOverlay) {
      elements.backgroundOverlay.addEventListener('input', () => {
        updateRangeLabels();
      });
    }

    if (elements.backgroundBlur) {
      elements.backgroundBlur.addEventListener('input', () => {
        updateRangeLabels();
      });
    }

    if (elements.backgroundSaveBtn) {
      elements.backgroundSaveBtn.addEventListener('click', saveBackgroundSettings);
    }

    if (elements.backgroundResetBtn) {
      elements.backgroundResetBtn.addEventListener('click', resetBackgroundSettings);
    }
  }

  /**
   * Show a status message.
   */
  function showStatus(message, type = 'info', target = elements.statusMessage) {
    if (!target) return;

    target.textContent = message;
    target.className = `status-message show ${type}`;

    setTimeout(() => {
      target.classList.remove('show');
    }, 5000);
  }

  function populateBackgroundSettings(settings) {
    const safeSettings = Storage.normalizeBackgroundSettings
      ? Storage.normalizeBackgroundSettings(settings)
      : settings;
    const mode = safeSettings.mode || 'default';
    const modeInput = Array.from(elements.backgroundModeInputs).find((input) => input.value === mode);

    if (modeInput) {
      modeInput.checked = true;
    }

    if (elements.backgroundUrl) {
      elements.backgroundUrl.value = safeSettings.url || '';
    }
    if (elements.backgroundSize) {
      elements.backgroundSize.value = safeSettings.size || 'cover';
    }
    if (elements.backgroundOverlay) {
      elements.backgroundOverlay.value = String(safeSettings.overlayOpacity ?? 0.38);
    }
    if (elements.backgroundBlur) {
      elements.backgroundBlur.value = String(safeSettings.blurPx ?? 0);
    }

    updateBackgroundModeUI(mode);
    updateRangeLabels();
    setBackgroundFileMeta(mode === 'upload' ? '已保存本地背景图或等待重新上传' : '未选择文件');
  }

  function updateBackgroundModeUI(mode) {
    elements.backgroundModeOptions.forEach((option) => {
      option.classList.toggle('active', option.getAttribute('data-mode') === mode);
    });

    if (elements.backgroundUploadSection) {
      elements.backgroundUploadSection.classList.toggle('hidden', mode !== 'upload');
    }

    if (elements.backgroundUrlSection) {
      elements.backgroundUrlSection.classList.toggle('hidden', mode !== 'url');
    }
  }

  function updateRangeLabels() {
    if (elements.backgroundOverlayValue && elements.backgroundOverlay) {
      elements.backgroundOverlayValue.textContent = `${Math.round(Number(elements.backgroundOverlay.value || 0) * 100)}%`;
    }

    if (elements.backgroundBlurValue && elements.backgroundBlur) {
      elements.backgroundBlurValue.textContent = `${Math.round(Number(elements.backgroundBlur.value || 0))}px`;
    }
  }

  function setBackgroundFileMeta(text) {
    if (elements.backgroundFileMeta) {
      elements.backgroundFileMeta.textContent = text;
    }
  }

  function getSelectedBackgroundMode() {
    const selected = Array.from(elements.backgroundModeInputs).find((input) => input.checked);
    return selected ? selected.value : 'default';
  }

  function handleBackgroundFileChange(event) {
    const [file] = event.target.files || [];
    pendingBackgroundFile = file || null;
    setBackgroundFileMeta(file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : '未选择文件');
  }

  async function saveBackgroundSettings() {
    const button = elements.backgroundSaveBtn;
    if (button) {
      button.disabled = true;
    }

    try {
      const mode = getSelectedBackgroundMode();
      const currentSettings = await Storage.loadBackgroundSettings();
      const nextSettings = {
        ...currentSettings,
        mode,
        url: '',
        size: elements.backgroundSize.value,
        overlayOpacity: Number(elements.backgroundOverlay.value),
        blurPx: Number(elements.backgroundBlur.value)
      };

      if (mode === 'url') {
        const url = elements.backgroundUrl.value.trim();
        if (!/^https?:\/\//i.test(url)) {
          showStatus('请输入有效的图片 URL', 'error', elements.backgroundStatusMessage);
          return;
        }
        nextSettings.url = url;
      }

      if (mode === 'upload') {
        if (pendingBackgroundFile) {
          const processedBlob = await prepareBackgroundImage(pendingBackgroundFile);
          await BackgroundStorage.saveUploadedBackground(processedBlob);
          pendingBackgroundFile = null;
        } else {
          const existing = await BackgroundStorage.getUploadedBackground();
          if (!existing) {
            showStatus('请先选择一张本地图片', 'error', elements.backgroundStatusMessage);
            return;
          }
        }
      }

      if (mode !== 'upload') {
        pendingBackgroundFile = null;
        if (elements.backgroundFileInput) {
          elements.backgroundFileInput.value = '';
        }
      }

      await Storage.saveBackgroundSettings(nextSettings);
      showStatus('背景设置已保存', 'success', elements.backgroundStatusMessage);
      populateBackgroundSettings(nextSettings);
    } catch (error) {
      console.error('[Options] 保存背景失败:', error);
      showStatus(error.message || '保存背景失败', 'error', elements.backgroundStatusMessage);
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  async function resetBackgroundSettings() {
    try {
      pendingBackgroundFile = null;
      if (elements.backgroundFileInput) {
        elements.backgroundFileInput.value = '';
      }

      await Storage.clearBackgroundSettings();
      await BackgroundStorage.clearUploadedBackground();
      populateBackgroundSettings(Storage.DEFAULT_BACKGROUND_SETTINGS || {});
      showStatus('已恢复默认背景', 'success', elements.backgroundStatusMessage);
    } catch (error) {
      console.error('[Options] 重置背景失败:', error);
      showStatus('重置背景失败', 'error', elements.backgroundStatusMessage);
    }
  }

  async function prepareBackgroundImage(file) {
    if (!file || !file.type.startsWith('image/')) {
      throw new Error('请选择图片文件');
    }

    const image = await readImageFile(file);
    const { width, height } = scaleDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height, 2560);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('图片处理失败'));
        }
      }, 'image/jpeg', 0.82);
    });
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const image = new Image();

      reader.onload = () => {
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('图片加载失败'));
        image.src = reader.result;
      };
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.readAsDataURL(file);
    });
  }

  function scaleDimensions(width, height, maxSide) {
    if (!width || !height) {
      return { width: 1920, height: 1080 };
    }

    const longestSide = Math.max(width, height);
    if (longestSide <= maxSide) {
      return { width, height };
    }

    const ratio = maxSide / longestSide;
    return {
      width: Math.round(width * ratio),
      height: Math.round(height * ratio)
    };
  }

  /**
   * Save Feishu config.
   */
  async function saveConfig() {
    const config = {
      appId: elements.appId.value.trim(),
      appSecret: elements.appSecret.value.trim(),
      appToken: elements.appToken.value.trim(),
      tableId: elements.tableId.value.trim()
    };

    // Validate required fields.
    if (!config.appId || !config.appSecret || !config.appToken || !config.tableId) {
      showStatus('请填写所有必填字段', 'error');
      return;
    }

    // Disable the button while saving.
    elements.saveBtn.disabled = true;
    elements.saveBtn.textContent = '保存中...';

    try {
      await Storage.saveFeishuConfig(config);
      showStatus('配置已保存', 'success');

      // Refresh token and nav cache after config changes.
      await FeishuAPI.clearTokenCache();
      await Storage.clearNavCache();
    } catch (error) {
      console.error('[Options] 保存配置失败:', error);
      showStatus('保存失败: ' + error.message, 'error');
    } finally {
      elements.saveBtn.disabled = false;
      elements.saveBtn.textContent = '保存配置';
    }
  }

  /**
   * Test Feishu connectivity.
   */
  async function testConnection() {
    // Skip network tests while mock mode is enabled.
    if (elements.testModeToggle.checked) {
      showStatus('测试模式已启用，无法测试飞书连接', 'info');
      return;
    }

    // Validate required fields.
    const appId = elements.appId.value.trim();
    const appSecret = elements.appSecret.value.trim();

    if (!appId || !appSecret) {
      showStatus('请先填写 APP_ID 和 APP_SECRET', 'error');
      return;
    }

    // Disable the button while testing.
    elements.testBtn.disabled = true;
    elements.testBtn.textContent = '测试中...';

    try {
      showStatus('正在测试连接...', 'info');

      const result = await FeishuAPI.testConnection();

      if (result.success) {
        showStatus('连接成功！', 'success');
      } else {
        showStatus('连接失败: ' + result.message, 'error');
      }
    } catch (error) {
      console.error('[Options] 测试连接失败:', error);
      showStatus('测试失败: ' + error.message, 'error');
    } finally {
      elements.testBtn.disabled = false;
      elements.testBtn.textContent = '测试连接';
    }
  }

  /**
   * Toggle test mode.
   */
  async function toggleTestMode() {
    const enabled = elements.testModeToggle.checked;

    try {
      await Storage.saveTestMode(enabled);
      updateTestModeUI(enabled);

      // Force nav data refresh on next load.
      await Storage.clearNavCache();

      if (enabled) {
        showStatus('测试模式已启用', 'info');
      } else {
        showStatus('测试模式已关闭', 'info');
      }
    } catch (error) {
      console.error('[Options] 切换测试模式失败:', error);
    }
  }

  /**
   * Sync the test mode UI.
   * @param {boolean} enabled
   */
  function updateTestModeUI(enabled) {
    if (enabled) {
      elements.testModeNotice.classList.add('show');
      // Lock Feishu fields in mock mode.
      elements.appId.disabled = true;
      elements.appSecret.disabled = true;
      elements.appToken.disabled = true;
      elements.tableId.disabled = true;
      elements.testBtn.disabled = true;
    } else {
      elements.testModeNotice.classList.remove('show');
      elements.appId.disabled = false;
      elements.appSecret.disabled = false;
      elements.appToken.disabled = false;
      elements.tableId.disabled = false;
      elements.testBtn.disabled = false;
    }
  }

  /**
   * Clear cached nav data.
   */
  async function clearCache() {
    if (!confirm('确定要清除缓存吗？这不会删除您的配置。')) {
      return;
    }

    try {
      await Storage.clearNavCache();
      showStatus('缓存已清除', 'success');
    } catch (error) {
      console.error('[Options] 清除缓存失败:', error);
      showStatus('清除缓存失败', 'error');
    }
  }

  /**
   * Reset all stored settings.
   */
  async function resetAll() {
    if (!confirm('确定要重置所有设置吗？此操作不可撤销。')) {
      return;
    }

    try {
      await Storage.clearAll();
      if (window.BackgroundStorage) {
        await BackgroundStorage.clearUploadedBackground();
      }
      location.reload();
    } catch (error) {
      console.error('[Options] 重置失败:', error);
      showStatus('重置失败', 'error');
    }
  }

  /**
   * Show the setup guide.
   */
  function showGuide(e) {
    e.preventDefault();

    const guide = `
配置指南：

1. 创建飞书应用
   - 访问 https://open.feishu.cn/
   - 登录后创建应用
   - 获取 APP_ID 和 APP_SECRET

2. 配置应用权限
   - 在"权限管理"中开启以下权限：
     * bitable:app 读写多维表格

3. 创建多维表格
   - 在飞书中创建多维表格
   - 获取多维表格的 APP_TOKEN

4. 配置表格字段
   确保表格包含以下字段：
   - 分类（单行文本）
   - 站点名称（单行文本）
   - 网址（超链接）
   - 排序（数字）
   - 图标（单行文本/超链接）

5. 获取 TABLE_ID
   - 在多维表格 URL 中获取表格 ID
    `;

    alert(guide);
  }

  // Initialize once the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
