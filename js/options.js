/**
 * Options page logic.
 *
 * 职责与边界：管理扩展设置页的表单、飞书配置向导、背景配置和数据管理交互；
 * 不负责实现飞书 API 协议、导航首页渲染或 popup 同步状态面板。
 * 关键副作用：读写 chrome.storage.local、调用飞书网络检测、处理本地背景图、修改 options 页 DOM。
 * 关键依赖与约束：依赖 Storage、FeishuAPI、FeishuConfigCheckCore、ThemeManager 和 BackgroundStorage 全局模块；
 * 飞书配置必须先通过连接与字段检测再保存。
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
    wizardPanels: document.querySelectorAll('[data-wizard-panel]'),
    wizardIndicators: document.querySelectorAll('[data-step-indicator]'),
    nextStepBtns: document.querySelectorAll('[data-next-step]'),
    prevStepBtns: document.querySelectorAll('[data-prev-step]'),
    connectionChecks: document.querySelectorAll('[data-check]'),
    testModeToggle: document.getElementById('test-mode-toggle'),
    statusMessage: document.getElementById('status-message'),
    testModeNotice: document.getElementById('test-mode-notice'),
    clearCacheBtn: document.getElementById('clear-cache-btn'),
    resetBtn: document.getElementById('reset-btn'),
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
  let currentWizardStep = 1;
  let lastConnectionPassed = false;

  /**
   * 初始化设置页状态。
   *
   * @returns {Promise<void>} 页面配置加载和事件绑定完成后 resolve。
   * @throws {Error} 依赖模块初始化失败时向上抛出。
   * @sideeffects 初始化主题、读取存储配置、修改表单和向导 DOM 状态。
   */
  async function init() {
    if (window.ThemeManager) {
      try {
        await ThemeManager.init();
      } catch (error) {
        console.warn('[Options] 主题初始化失败，继续加载设置页:', error);
      }
    }

    await loadConfig();
    updateWizardStep(currentWizardStep);
    resetConnectionChecks();
    bindEvents();
    console.log('[Options] 初始化完成');
  }

  /**
   * 加载已保存设置并回填页面控件。
   *
   * @returns {Promise<void>} 所有可读取配置处理完成后 resolve。
   * @throws {Error} 内部捕获存储异常，不向调用方抛出。
   * @sideeffects 读取 chrome.storage.local，并更新飞书表单、测试模式和背景配置控件。
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
        currentWizardStep = window.FeishuConfigCheckCore
          ? FeishuConfigCheckCore.getInitialWizardStep(config)
          : (config.appId && config.appSecret && config.appToken && config.tableId ? 3 : 1);
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
   * 绑定设置页交互事件。
   *
   * @returns {void}
   * @throws {Error} 不主动抛错；缺失 DOM 节点会在调用点按可选绑定跳过。
   * @sideeffects 为保存、检测、向导切换、背景配置和数据管理控件注册事件监听。
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

    elements.nextStepBtns.forEach((button) => {
      button.addEventListener('click', () => {
        const step = Number(button.getAttribute('data-next-step'));
        if (step === 3 && !validateConfigForm()) {
          return;
        }
        updateWizardStep(step);
      });
    });

    elements.prevStepBtns.forEach((button) => {
      button.addEventListener('click', () => {
        updateWizardStep(Number(button.getAttribute('data-prev-step')));
      });
    });

    [elements.appId, elements.appSecret, elements.appToken, elements.tableId].forEach((input) => {
      input?.addEventListener('input', resetConnectionChecks);
    });

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
   * 显示设置页状态消息。
   *
   * @param {string} message - 要展示给用户的消息内容。
   * @param {string} type - 消息类型，支持 info、success、error。
   * @param {HTMLElement|null} target - 消息容器；默认使用飞书配置状态容器。
   * @returns {void}
   * @throws {Error} 不主动抛错；目标元素缺失时直接返回。
   * @sideeffects 修改目标 DOM 的文本和样式类，并在 5 秒后隐藏。
   */
  function showStatus(message, type = 'info', target = elements.statusMessage) {
    if (!target) return;

    target.textContent = message;
    target.className = `status-message show ${type}`;

    setTimeout(() => {
      target.classList.remove('show');
    }, 5000);
  }

  /**
   * 切换飞书配置向导步骤。
   *
   * @param {number} step - 目标步骤编号，范围为 1 到 3；非法值会被夹取到有效范围。
   * @returns {void}
   * @throws {Error} 不主动抛错。
   * @sideeffects 修改向导面板和步骤指示器 DOM 状态。
   */
  function updateWizardStep(step) {
    currentWizardStep = Math.min(3, Math.max(1, Number(step) || 1));

    elements.wizardPanels.forEach((panel) => {
      panel.classList.toggle('active', Number(panel.getAttribute('data-wizard-panel')) === currentWizardStep);
    });

    elements.wizardIndicators.forEach((indicator) => {
      const indicatorStep = Number(indicator.getAttribute('data-step-indicator'));
      indicator.classList.toggle('active', indicatorStep === currentWizardStep);
      indicator.classList.toggle('complete', indicatorStep < currentWizardStep);
    });
  }

  /**
   * 从表单收集飞书配置。
   *
   * @returns {Object} 包含 appId、appSecret、appToken、tableId 的配置对象。
   * @throws {Error} 不主动抛错；缺失输入元素按空字符串处理。
   * @sideeffects 无外部副作用。
   */
  function collectFeishuConfig() {
    return {
      appId: elements.appId?.value.trim() || '',
      appSecret: elements.appSecret?.value.trim() || '',
      appToken: elements.appToken?.value.trim() || '',
      tableId: elements.tableId?.value.trim() || ''
    };
  }

  /**
   * 校验飞书配置表单的本地必填字段。
   *
   * @returns {boolean} 所有必填字段已填写时返回 true。
   * @throws {Error} 不主动抛错。
   * @sideeffects 可能显示错误状态消息。
   */
  function validateConfigForm() {
    const config = collectFeishuConfig();
    const result = window.FeishuConfigCheckCore
      ? FeishuConfigCheckCore.validateRequiredConfig(config)
      : { success: Boolean(config.appId && config.appSecret && config.appToken && config.tableId), message: '请填写所有必填字段' };

    if (!result.success) {
      showStatus(result.message, 'error');
      return false;
    }

    return true;
  }

  /**
   * 重置连接检测分项展示。
   *
   * @returns {void}
   * @throws {Error} 不主动抛错。
   * @sideeffects 修改检测项 DOM 状态，并清空上一次成功检测标记。
   */
  function resetConnectionChecks() {
    lastConnectionPassed = false;
    const defaults = {
      credentials: '等待检查连接凭证',
      token: '等待获取飞书 Token',
      table: '等待访问多维表格',
      fields: '等待检查表格字段',
      records: '等待读取记录'
    };

    Object.keys(defaults).forEach((key) => {
      renderConnectionCheck(key, { status: 'pending', message: defaults[key] });
    });
  }

  /**
   * 渲染单个连接检测项。
   *
   * @param {string} key - 检测项键名，如 credentials、token、table、fields、records。
   * @param {Object} check - 检测项结果；包含 status 和 message。
   * @returns {void}
   * @throws {Error} 不主动抛错；找不到对应 DOM 时跳过。
   * @sideeffects 修改检测项 DOM 的图标、文本和样式类。
   */
  function renderConnectionCheck(key, check) {
    const element = document.querySelector(`[data-check="${key}"]`);
    if (!element) return;

    const status = check?.status || 'pending';
    const icon = element.querySelector('i');
    const text = element.querySelector('div');
    element.className = `connection-check ${status}`;

    if (icon) {
      icon.className = status === 'success'
        ? 'bi bi-check-circle'
        : status === 'error'
          ? 'bi bi-x-circle'
          : 'bi bi-circle';
    }

    if (text) {
      text.textContent = check?.message || '等待检测';
    }
  }

  /**
   * 渲染完整连接检测结果。
   *
   * @param {Object} result - FeishuAPI.testConnection 返回的结构化结果。
   * @returns {void}
   * @throws {Error} 不主动抛错。
   * @sideeffects 更新所有检测项 DOM，并记录检测是否通过。
   */
  function renderConnectionResult(result) {
    lastConnectionPassed = Boolean(result?.success);
    const checks = result?.checks || {};
    ['credentials', 'token', 'table', 'fields', 'records'].forEach((key) => {
      renderConnectionCheck(key, checks[key] || { status: 'pending', message: '等待检测' });
    });
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
   * 保存飞书配置。
   *
   * @returns {Promise<void>} 配置检测通过并保存完成后 resolve。
   * @throws {Error} 内部捕获保存和检测异常，不向调用方抛出。
   * @sideeffects 可能发起飞书连接检测，写入 chrome.storage.local，清理 token 和导航缓存，并更新 DOM 状态。
   */
  async function saveConfig() {
    const config = collectFeishuConfig();

    if (elements.testModeToggle.checked) {
      showStatus('测试模式已启用，关闭后再保存飞书配置', 'info');
      return;
    }

    if (!validateConfigForm()) {
      return;
    }

    // Disable the button while saving.
    elements.saveBtn.disabled = true;
    elements.saveBtn.textContent = '检测中...';

    try {
      if (!lastConnectionPassed) {
        const result = await FeishuAPI.testConnection(config);
        renderConnectionResult(result);
        if (!result.success) {
          updateWizardStep(3);
          showStatus(result.message || '连接检测未通过，暂不保存配置', 'error');
          return;
        }
      }

      elements.saveBtn.textContent = '保存中...';
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
   * 测试当前表单中的飞书连接配置。
   *
   * @returns {Promise<void>} 检测流程完成并渲染结果后 resolve。
   * @throws {Error} 内部捕获飞书检测异常，不向调用方抛出。
   * @sideeffects 可能发起飞书网络请求，更新分项检测 DOM 和状态消息。
   */
  async function testConnection() {
    // Skip network tests while mock mode is enabled.
    if (elements.testModeToggle.checked) {
      showStatus('测试模式已启用，无法测试飞书连接', 'info');
      return;
    }

    const config = collectFeishuConfig();
    if (!validateConfigForm()) {
      return;
    }

    // Disable the button while testing.
    elements.testBtn.disabled = true;
    elements.testBtn.textContent = '测试中...';

    try {
      showStatus('正在测试连接...', 'info');

      const result = await FeishuAPI.testConnection(config);
      renderConnectionResult(result);

      if (result.success) {
        showStatus(result.message || '连接成功！', 'success');
      } else {
        showStatus(result.message || '连接失败', 'error');
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
   * 同步测试模式对飞书向导的禁用状态。
   *
   * @param {boolean} enabled - 是否启用测试模式。
   * @returns {void}
   * @throws {Error} 不主动抛错。
   * @sideeffects 修改飞书表单、检测按钮、保存按钮和测试模式提示 DOM。
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
      elements.saveBtn.disabled = true;
    } else {
      elements.testModeNotice.classList.remove('show');
      elements.appId.disabled = false;
      elements.appSecret.disabled = false;
      elements.appToken.disabled = false;
      elements.tableId.disabled = false;
      elements.testBtn.disabled = false;
      elements.saveBtn.disabled = false;
    }
    resetConnectionChecks();
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

  // Initialize once the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
