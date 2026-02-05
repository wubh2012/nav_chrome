/**
 * 配置页脚本
 */
(function() {
  'use strict';

  console.log('[Options] 正在初始化...');

  // DOM 元素
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
    viewGuideBtn: document.getElementById('view-guide-btn')
  };

  /**
   * 初始化
   */
  async function init() {
    await loadConfig();
    bindEvents();
    console.log('[Options] 初始化完成');
  }

  /**
   * 加载配置
   */
  async function loadConfig() {
    try {
      // 加载飞书配置
      const config = await Storage.loadFeishuConfig();
      if (config) {
        elements.appId.value = config.appId || '';
        elements.appSecret.value = config.appSecret || '';
        elements.appToken.value = config.appToken || '';
        elements.tableId.value = config.tableId || '';
      }

      // 加载测试模式状态
      const testMode = await Storage.getTestMode();
      elements.testModeToggle.checked = testMode;
      updateTestModeUI(testMode);
    } catch (error) {
      console.error('[Options] 加载配置失败:', error);
    }
  }

  /**
   * 绑定事件
   */
  function bindEvents() {
    // 保存配置
    elements.saveBtn.addEventListener('click', saveConfig);

    // 测试连接
    elements.testBtn.addEventListener('click', testConnection);

    // 测试模式切换
    elements.testModeToggle.addEventListener('change', toggleTestMode);

    // 清除缓存
    elements.clearCacheBtn.addEventListener('click', clearCache);

    // 重置所有
    elements.resetBtn.addEventListener('click', resetAll);

    // 查看指南
    elements.viewGuideBtn.addEventListener('click', showGuide);
  }

  /**
   * 显示状态消息
   * @param {string} message - 消息内容
   * @param {string} type - 消息类型 (success/error/info)
   */
  function showStatus(message, type = 'info') {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status-message show ${type}`;

    setTimeout(() => {
      elements.statusMessage.classList.remove('show');
    }, 5000);
  }

  /**
   * 保存配置
   */
  async function saveConfig() {
    const config = {
      appId: elements.appId.value.trim(),
      appSecret: elements.appSecret.value.trim(),
      appToken: elements.appToken.value.trim(),
      tableId: elements.tableId.value.trim()
    };

    // 验证必填字段
    if (!config.appId || !config.appSecret || !config.appToken || !config.tableId) {
      showStatus('请填写所有必填字段', 'error');
      return;
    }

    // 禁用保存按钮
    elements.saveBtn.disabled = true;
    elements.saveBtn.textContent = '保存中...';

    try {
      await Storage.saveFeishuConfig(config);
      showStatus('配置已保存', 'success');

      // 清除 Token 缓存，强制重新获取
      await FeishuAPI.clearTokenCache();

      // 清除导航缓存，下次打开时重新加载
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
   * 测试连接
   */
  async function testConnection() {
    // 检查测试模式
    if (elements.testModeToggle.checked) {
      showStatus('测试模式已启用，无法测试飞书连接', 'info');
      return;
    }

    // 验证必填字段
    const appId = elements.appId.value.trim();
    const appSecret = elements.appSecret.value.trim();

    if (!appId || !appSecret) {
      showStatus('请先填写 APP_ID 和 APP_SECRET', 'error');
      return;
    }

    // 禁用测试按钮
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
   * 切换测试模式
   */
  async function toggleTestMode() {
    const enabled = elements.testModeToggle.checked;

    try {
      await Storage.saveTestMode(enabled);
      updateTestModeUI(enabled);

      // 清除导航缓存
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
   * 更新测试模式 UI
   * @param {boolean} enabled
   */
  function updateTestModeUI(enabled) {
    if (enabled) {
      elements.testModeNotice.classList.add('show');
      // 禁用飞书配置相关字段
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
   * 清除缓存
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
   * 重置所有
   */
  async function resetAll() {
    if (!confirm('确定要重置所有设置吗？此操作不可撤销。')) {
      return;
    }

    try {
      await Storage.clearAll();
      location.reload();
    } catch (error) {
      console.error('[Options] 重置失败:', error);
      showStatus('重置失败', 'error');
    }
  }

  /**
   * 显示配置指南
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

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
