/**
 * 链接管理纯逻辑模块
 *
 * 职责与边界：提供链接表单校验、URL 规范化、重复链接检测和 favicon 建议 URL 生成；
 * 不负责 DOM 渲染、事件绑定、Chrome Extension API、飞书 API 调用或本地存储。
 * 关键副作用：无外部副作用；所有函数仅根据入参返回计算结果。
 * 关键依赖与约束：依赖浏览器或 Node.js 标准 URL 实现；调用方需自行处理 UI 提示和保存流程。
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LinkManagerCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  /**
   * 判断输入是否为可保存的 http/https URL。
   *
   * @param {string} value - 待检测 URL 字符串；调用方应传入用户输入的原始值或 trim 后值。
   * @returns {boolean} 合法且协议为 http/https 时返回 true，否则返回 false。
   * @throws {Error} 不主动抛错；URL 解析异常会被捕获并转为 false。
   * @sideeffects 无副作用。
   */
  function isValidHttpUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_error) {
      return false;
    }
  }

  /**
   * 将 URL 转为适合重复检测的稳定格式。
   *
   * @param {string} value - 待规范化 URL；支持 http/https，hash 会被忽略。
   * @returns {string} 规范化后的 URL；非法或非 http/https URL 返回空字符串。
   * @throws {Error} 不主动抛错；URL 解析异常会被捕获并转为空字符串。
   * @sideeffects 无副作用。
   */
  function normalizeLinkUrl(value) {
    if (!isValidHttpUrl(value)) {
      return '';
    }

    const url = new URL(String(value || '').trim());
    url.hash = '';

    const path = url.pathname === '/'
      ? ''
      : url.pathname.replace(/\/+$/u, '');
    const search = url.search || '';

    return `${url.protocol}//${url.host.toLowerCase()}${path}${search}`;
  }

  /**
   * 在导航数据中查找与目标 URL 等价的已有链接。
   *
   * @param {Object<string, Array<Object>>} navData - 分类到站点数组的导航数据；缺失或非数组分类会被忽略。
   * @param {string} url - 待查重 URL；会先经过 normalizeLinkUrl 规范化。
   * @param {string|null} excludeRecordId - 编辑场景下要排除的记录 ID；新增场景传 null。
   * @returns {Object|null} 命中时返回包含 category 的站点副本；未命中或 URL 非法时返回 null。
   * @throws {Error} 不主动抛错；异常输入按无命中处理。
   * @sideeffects 无副作用。
   */
  function findDuplicateUrl(navData, url, excludeRecordId = null) {
    const normalizedTarget = normalizeLinkUrl(url);
    if (!normalizedTarget || !navData || typeof navData !== 'object') {
      return null;
    }

    for (const [category, items] of Object.entries(navData)) {
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        if (!item || String(item.id || '') === String(excludeRecordId || '')) {
          continue;
        }

        if (normalizeLinkUrl(item.url) === normalizedTarget) {
          return { ...item, category };
        }
      }
    }

    return null;
  }

  /**
   * 基于站点 URL 生成无需扩展新增主机权限的 favicon 建议地址。
   *
   * @param {string} value - 站点 URL；必须为 http/https。
   * @param {number} size - 期望图标尺寸，单位 px；非法值会回退为 64。
   * @returns {string} 可用作 img src 或图标字段的 favicon 服务 URL；非法 URL 返回空字符串。
   * @throws {Error} 不主动抛错；URL 解析异常会被捕获并转为空字符串。
   * @sideeffects 无副作用；不会请求 favicon 服务。
   */
  function resolveFaviconUrl(value, size = 64) {
    if (!isValidHttpUrl(value)) {
      return '';
    }

    const url = new URL(String(value || '').trim());
    const iconSize = Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : 64;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=${iconSize}`;
  }

  /**
   * 创建链接表单错误对象。
   *
   * @returns {{hasErrors: boolean, url: string, name: string, icon: string, category: string}} 空错误对象。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无副作用。
   */
  function createEmptyErrors() {
    return {
      hasErrors: false,
      url: '',
      name: '',
      icon: '',
      category: ''
    };
  }

  /**
   * 校验链接表单数据并可选执行重复 URL 检测。
   *
   * @param {Object} formData - 表单数据。
   * @param {string} formData.url - 网站 URL；必须为 http/https 且不能是占位值。
   * @param {string} formData.name - 网站名称；不能为空且不超过 50 个字符。
   * @param {string} formData.icon - 可选图标 URL；填写时必须为 http/https。
   * @param {string} formData.category - 分类名称；不能为空。
   * @param {Object} options - 校验选项。
   * @param {Object<string, Array<Object>>} options.navData - 可选导航数据，用于查重。
   * @param {string|null} options.excludeRecordId - 编辑场景下排除的记录 ID。
   * @returns {{hasErrors: boolean, url: string, name: string, icon: string, category: string}} 字段错误集合。
   * @throws {Error} 不主动抛错；非法入参按空值处理。
   * @sideeffects 无副作用。
   */
  function validateLinkForm(formData, options = {}) {
    const data = formData || {};
    const url = String(data.url || '').trim();
    const name = String(data.name || '').trim();
    const icon = String(data.icon || '').trim();
    const category = String(data.category || '').trim();
    const errors = createEmptyErrors();

    if (!url || url === 'https://') {
      errors.hasErrors = true;
      errors.url = '请输入完整的网站网址';
    } else if (!isValidHttpUrl(url)) {
      errors.hasErrors = true;
      errors.url = '网址格式不正确，仅支持 http:// 或 https://';
    } else {
      const duplicate = findDuplicateUrl(options.navData, url, options.excludeRecordId || null);
      if (duplicate) {
        errors.hasErrors = true;
        errors.url = `该网址已存在：${duplicate.name || duplicate.url}`;
      }
    }

    if (!name) {
      errors.hasErrors = true;
      errors.name = '请输入网站名称';
    } else if (name.length > 50) {
      errors.hasErrors = true;
      errors.name = '名称不能超过 50 个字符';
    }

    if (icon && !isValidHttpUrl(icon)) {
      errors.hasErrors = true;
      errors.icon = '图标 URL 格式不正确，仅支持 http:// 或 https://';
    }

    if (!category) {
      errors.hasErrors = true;
      errors.category = '请选择或填写分类';
    }

    return errors;
  }

  return {
    findDuplicateUrl,
    isValidHttpUrl,
    normalizeLinkUrl,
    resolveFaviconUrl,
    validateLinkForm
  };
});
