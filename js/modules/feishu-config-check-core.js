/**
 * 飞书配置检测核心逻辑
 *
 * 职责与边界：提供配置向导可复用的纯函数，用于校验必填凭证、检查多维表格字段、
 * 以及把飞书接口错误归类为用户可理解的配置问题；不负责发起网络请求、读取存储或操作 DOM。
 * 关键副作用：无持久化副作用；仅在浏览器环境把 FeishuConfigCheckCore 暴露到全局对象。
 * 关键依赖与约束：字段名必须与 FeishuAPI 的字段映射保持一致；调用方负责传入已解析的飞书响应对象。
 */
(function(root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.FeishuConfigCheckCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : null, function() {
  'use strict';

  const REQUIRED_FIELD_NAMES = ['分类', '站点名称', '网址', '排序', '备用图标'];
  const CONFIG_KEY_LABELS = {
    appId: 'APP_ID',
    appSecret: 'APP_SECRET',
    appToken: 'APP_TOKEN',
    tableId: 'TABLE_ID'
  };

  /**
   * 校验飞书配置对象是否包含连接检测所需的全部字段。
   *
   * @param {Object|null} config - 飞书配置对象；字段会按字符串 trim 后判断。
   * @returns {Object} 校验结果，包含 success、category、message 和 missingKeys。
   * @throws {Error} 不主动抛错；无效输入按缺失配置处理。
   * @sideeffects 无外部副作用。
   */
  function validateRequiredConfig(config) {
    const safeConfig = config || {};
    const missingKeys = Object.keys(CONFIG_KEY_LABELS)
      .filter((key) => !String(safeConfig[key] || '').trim())
      .map((key) => CONFIG_KEY_LABELS[key]);

    if (missingKeys.length === 0) {
      return {
        success: true,
        category: 'ok',
        message: '飞书连接凭证已填写完整',
        missingKeys
      };
    }

    return {
      success: false,
      category: 'missing_config',
      message: `请先填写 ${missingKeys.join('、')}`,
      missingKeys
    };
  }

  /**
   * 根据已保存飞书配置决定向导初始步骤。
   *
   * @param {Object|null} config - 已保存的飞书配置对象；字段缺失或空白视为未完整配置。
   * @returns {number} 完整配置返回 3，表示直接进入检测保存；否则返回 1，从准备资源开始。
   * @throws {Error} 不主动抛错；无效输入按未配置处理。
   * @sideeffects 无外部副作用。
   */
  function getInitialWizardStep(config) {
    return validateRequiredConfig(config).success ? 3 : 1;
  }

  /**
   * 检查飞书多维表格字段列表是否包含项目运行所需字段。
   *
   * @param {Array<Object>} fields - 飞书字段列表；每项应包含 field_name 或 name。
   * @returns {Object} 字段检查结果，包含 success、message、missingFields 和 existingFields。
   * @throws {Error} 不主动抛错；非数组输入按空字段列表处理。
   * @sideeffects 无外部副作用。
   */
  function analyzeFieldList(fields) {
    const existingFields = (Array.isArray(fields) ? fields : [])
      .map((field) => String(field?.field_name || field?.name || '').trim())
      .filter(Boolean);
    const fieldSet = new Set(existingFields);
    const missingFields = REQUIRED_FIELD_NAMES.filter((fieldName) => !fieldSet.has(fieldName));

    if (missingFields.length === 0) {
      return {
        success: true,
        category: 'ok',
        message: '字段检查通过，表格字段已创建完整',
        missingFields,
        existingFields
      };
    }

    return {
      success: false,
      category: 'missing_fields',
      message: `缺少字段：${missingFields.join('、')}。建议一次性创建完整字段，备用图标字段可留空但字段本身需要存在。`,
      missingFields,
      existingFields
    };
  }

  /**
   * 将飞书接口错误归类为向导可展示的配置问题。
   *
   * @param {Object|Error|string|null} errorLike - 飞书响应、异常或错误文本。
   * @returns {Object} 归类结果，包含 category、message、code 和 rawMessage。
   * @throws {Error} 不主动抛错；未知错误归为 unknown。
   * @sideeffects 无外部副作用。
   */
  function classifyFeishuError(errorLike) {
    const code = Number(errorLike?.code);
    const rawMessage = typeof errorLike === 'string'
      ? errorLike
      : String(errorLike?.msg || errorLike?.message || '');
    const normalized = rawMessage.toLowerCase();

    if (Number.isFinite(code) && code === 0) {
      return {
        category: 'ok',
        message: '请求成功',
        code,
        rawMessage
      };
    }

    if ([1254030, 1254031, 99991672].includes(code) || /forbidden|permission|no permission|无权限|权限/.test(normalized)) {
      return {
        category: 'permission_denied',
        message: '权限不足，请确认飞书应用已开通多维表格读写权限，并已被授权访问该多维表格。',
        code,
        rawMessage
      };
    }

    if ([1254040, 1254041, 1254003].includes(code) || /not found|table|app_token|table_id|不存在/.test(normalized)) {
      return {
        category: 'table_not_found',
        message: 'APP_TOKEN 或 TABLE_ID 不正确，请从目标多维表格 URL 中重新复制。',
        code,
        rawMessage
      };
    }

    if ([99991663, 99991664].includes(code) || /token|app_id|app_secret|invalid app/.test(normalized)) {
      return {
        category: 'token_failed',
        message: 'Token 获取失败，请检查 APP_ID 和 APP_SECRET 是否正确。',
        code,
        rawMessage
      };
    }

    return {
      category: 'unknown',
      message: rawMessage ? `飞书请求失败：${rawMessage}` : '飞书请求失败，请稍后重试。',
      code: Number.isFinite(code) ? code : null,
      rawMessage
    };
  }

  return {
    REQUIRED_FIELD_NAMES,
    validateRequiredConfig,
    getInitialWizardStep,
    analyzeFieldList,
    classifyFeishuError
  };
});
