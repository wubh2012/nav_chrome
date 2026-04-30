/**
 * 飞书 API 模块
 *
 * 职责与边界：封装插件与飞书开放平台、多维表格 API 的通信，负责获取 token、读取和写入导航记录、
 * 检测连接与表格字段；不负责渲染 DOM、管理 options 表单状态或决定页面交互流程。
 * 关键副作用：发起飞书网络请求，读写 chrome.storage.local 中的 token 缓存和导航相关配置。
 * 关键依赖与约束：依赖 Storage 模块和 FeishuConfigCheckCore；字段名必须与用户多维表格中的字段保持一致。
 */
const FeishuAPI = (function() {
  'use strict';

  // API 基础地址
  const API_BASE = 'https://open.feishu.cn/open-apis';

  // Token 缓存键名
  const TOKEN_KEY = 'chromeNav_tenantToken';
  const TOKEN_EXPIRY_KEY = 'chromeNav_tenantTokenExpiry';

  // Token 有效期（2小时）
  const TOKEN_DURATION = 2 * 60 * 60 * 1000;
  const BATCH_UPDATE_SIZE = 100;

  // 飞书多维表格字段映射
  const FIELD_MAPPING = {
    category: '分类',
    name: '站点名称',
    url: '网址',
    sort: '排序',
    icon: '备用图标'
  };

  const ConfigCheckCore = typeof FeishuConfigCheckCore !== 'undefined'
    ? FeishuConfigCheckCore
    : null;

  // ==================== 工具函数 ====================

  /**
   * 获取网站图标 URL
   * 优先使用备用图标，否则使用 Google Favicon 服务
   * @param {string} fallbackIcon - 飞书配置的备用图标
   * @param {string} url - 网站 URL
   * @returns {string} 图标 URL 或图标内容
   */
  function getIconUrl(fallbackIcon, url) {
    // 如果有备用图标，直接返回
    if (fallbackIcon && fallbackIcon.trim()) {
      return fallbackIcon;
    }

    // 没有备用图标时，使用 Google Favicon 服务
    // 注意：需要编码 URL 中的特殊字符
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
    } catch (e) {
      console.warn('[FeishuAPI] 解析域名失败:', url);
      return '';
    }
  }

  // 模拟数据（测试模式用）
  const MOCK_DATA = {
    'Code': [
      { name: 'GitHub', url: 'https://github.com', icon: '🐙', sort: 1 },
      { name: 'Stack Overflow', url: 'https://stackoverflow.com', icon: '📚', sort: 2 },
      { name: 'VS Code', url: 'https://code.visualstudio.com', icon: '💻', sort: 3 },
      { name: 'GitLab', url: 'https://gitlab.com', icon: '🦊', sort: 4 }
    ],
    '设计': [
      { name: 'Figma', url: 'https://figma.com', icon: '🎨', sort: 1 },
      { name: 'Dribbble', url: 'https://dribbble.com', icon: '🏀', sort: 2 },
      { name: 'Behance', url: 'https://behance.net', icon: '📐', sort: 3 },
      { name: 'Pixso', url: 'https://pixso.cc', icon: '✏️', sort: 4 }
    ],
    '工具': [
      { name: 'Google', url: 'https://google.com', icon: '🔍', sort: 1 },
      { name: '翻译', url: 'https://translate.google.com', icon: '🌐', sort: 2 },
      { name: '时间', url: 'https://time.is', icon: '⏰', sort: 3 },
      { name: 'Notion', url: 'https://notion.so', icon: '📝', sort: 4 }
    ],
    '学习': [
      { name: 'MDN', url: 'https://developer.mozilla.org', icon: '📖', sort: 1 },
      { name: 'W3Schools', url: 'https://w3schools.com', icon: '🎓', sort: 2 },
      { name: 'FreeCodeCamp', url: 'https://freecodecamp.org', icon: '💡', sort: 3 },
      { name: '牛客网', url: 'https://nowcoder.com', icon: '🐂', sort: 4 }
    ]
  };

  /**
   * 获取配置
   */
  async function getConfig() {
    return await Storage.loadFeishuConfig();
  }

  /**
   * 检查是否为测试模式
   */
  async function isTestMode() {
    return await Storage.getTestMode();
  }

  /**
   * 从本地存储获取 Token
   */
  async function getCachedToken() {
    const result = await Storage.get([TOKEN_KEY, TOKEN_EXPIRY_KEY]);
    const token = result[TOKEN_KEY];
    const expiry = result[TOKEN_EXPIRY_KEY];

    if (!token || !expiry) return null;

    // 检查 Token 是否过期
    if (Date.now() > expiry) {
      console.log('[FeishuAPI] Token 已过期，需要重新获取');
      return null;
    }

    return token;
  }

  /**
   * 缓存 Token 到本地存储
   * @param {string} token
   */
  async function cacheToken(token) {
    await Storage.set({
      [TOKEN_KEY]: token,
      [TOKEN_EXPIRY_KEY]: Date.now() + TOKEN_DURATION
    });
  }

  /**
   * 获取 tenant_access_token。
   *
   * @param {Object|null} configOverride - 可选配置；传入时用于检测未保存的表单配置并跳过旧 token 缓存。
   * @returns {Promise<string>} 飞书 tenant_access_token。
   * @throws {Error} 配置缺失、飞书返回非 0 code 或网络异常时抛出。
   * @sideeffects 未传入 configOverride 时会读取和写入本地 token 缓存；始终可能发起飞书网络请求。
   */
  async function getTenantAccessToken(configOverride = null) {
    if (!configOverride) {
      // 先检查缓存
      const cachedToken = await getCachedToken();
      if (cachedToken) {
        console.log('[FeishuAPI] 使用缓存的 Token');
        return cachedToken;
      }
    }

    const config = configOverride || await getConfig();
    if (!config || !config.appId || !config.appSecret) {
      throw new Error('飞书配置不完整，请先配置 APP_ID 和 APP_SECRET');
    }

    try {
      console.log('[FeishuAPI] 正在获取新 Token...');

      const response = await fetch(`${API_BASE}/auth/v3/tenant_access_token/internal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({
          app_id: config.appId,
          app_secret: config.appSecret
        })
      });

      const result = await response.json();

      if (result.code !== 0) {
        console.error('[FeishuAPI] 获取 Token 失败:', result.msg);
        throw new Error(`获取 Token 失败: ${result.msg}`);
      }

      if (!configOverride) {
        // 缓存 Token
        await cacheToken(result.tenant_access_token);
      }
      console.log('[FeishuAPI] Token 获取成功');

      return result.tenant_access_token;
    } catch (error) {
      console.error('[FeishuAPI] 请求异常:', error);
      throw error;
    }
  }

  /**
   * 获取所有记录
   * @param {string} appToken - 多维表格 Token（已废弃，从 Storage 获取）
   * @param {string} tableId - 表格 ID（已废弃，从 Storage 获取）
   * @returns {Promise<Object>} { success, data, categories, dateInfo }
   */
  async function getRecords(appToken, tableId) {
    // 测试模式
    if (await isTestMode()) {
      console.log('[FeishuAPI] 使用测试模式数据');
      return {
        success: true,
        ...transformMockData()
      };
    }

    const config = await getConfig();
    if (!config || !config.appToken || !config.tableId) {
      throw new Error('飞书配置不完整，请先配置 APP_TOKEN 和 TABLE_ID');
    }

    const token = await getTenantAccessToken();

    try {
      console.log('[FeishuAPI] 正在获取数据...');

      const response = await fetch(
        `${API_BASE}/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records?page_size=100`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = await response.json();

      if (result.code !== 0) {
        // 错误码 99991663 通常是 Token 过期
        if (result.code === 99991663) {
          console.log('[FeishuAPI] Token 过期，尝试重新获取...');
          await Storage.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY]);
          return await getRecords(); // 递归重试
        }
        console.error('[FeishuAPI] 获取数据失败:', result.msg);
        throw new Error(`获取数据失败: ${result.msg}`);
      }

      console.log('[FeishuAPI] 数据获取成功，共', result.data?.items?.length || 0, '条记录');

      return {
        success: true,
        ...transformRecords(result.data?.items || [])
      };
    } catch (error) {
      console.error('[FeishuAPI] 请求异常:', error);
      throw error;
    }
  }

  /**
   * 生成日期信息
   * @returns {{date: string, weekday: string, lunarDate: string}}
   */
  function generateDateInfo() {
    const now = new Date();
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

    // 获取农历日期
    /** @type {string} */
    let lunarDate = '';
    /** @type {Object|null} */
    const Lunar = window.Lunar;
    if (Lunar) {
      /** @type {Object} */
      const lunar = Lunar.fromDate(now);
      let result = '';

      // 处理闰月
      if (lunar.isLeap) {
        result += '闰';
      }

      // 月份和日期
      result += lunar.getMonthInChinese() + '月' + lunar.getDayInChinese();

      lunarDate = result;
    }

    return {
      date: `${now.getMonth() + 1}月${now.getDate()}日`,
      weekday: weekdays[now.getDay()],
      lunarDate: lunarDate
    };
  }

  /**
   * 转换飞书记录格式为导航数据格式
   * @param {Array} records - 飞书记录数组
   * @returns {Object} { data, categories, dateInfo }
   */
  function transformRecords(records) {
    const data = {};
    const categories = new Set();

    records.forEach(record => {
      const fields = record.fields || {};

      const category = fields[FIELD_MAPPING.category] || '未分类';
      const name = fields[FIELD_MAPPING.name] || '';
      const urlField = fields[FIELD_MAPPING.url];
      const sort = fields[FIELD_MAPPING.sort] || 999;
      const fallbackIcon = fields[FIELD_MAPPING.icon]?.link || '';

      // 解析网址字段
      let url = '';
      if (typeof urlField === 'string') {
        url = urlField;
      } else if (urlField && typeof urlField === 'object') {
        url = urlField.link || urlField.text || '';
      }

      if (!name || !url) return;

      categories.add(category);

      if (!data[category]) {
        data[category] = [];
      }

      data[category].push({
        id: record.record_id,
        name,
        url,
        icon: getIconUrl(fallbackIcon, url),
        customIcon: fallbackIcon,
        sort
      });
    });

    // 按排序字段排序
    Object.keys(data).forEach(category => {
      data[category].sort((a, b) => (a.sort || 999) - (b.sort || 999));
    });

    return {
      data,
      categories: Array.from(categories).sort(),
      dateInfo: generateDateInfo()
    };
  }

  /**
   * 转换测试数据为导航格式
   */
  function transformMockData() {
    const data = {};
    const categories = Object.keys(MOCK_DATA);

    categories.forEach(category => {
      data[category] = MOCK_DATA[category].map((item, index) => ({
        id: `mock-${category}-${index}`,
        customIcon: item.icon || '',
        ...item
      }));
    });

    return {
      data,
      categories,
      dateInfo: generateDateInfo()
    };
  }

  /**
   * 添加记录
   * @param {Object} linkData - 链接数据
   * @param {string} linkData.name - 站点名称
   * @param {string} linkData.url - 网址
   * @param {string} linkData.category - 分类
   * @param {string} linkData.icon - 图标
   * @param {number} linkData.sort - 排序
   * @returns {Promise<Object>} 添加结果
   */
  function buildRecordFields(linkData) {
    const fields = {};
    fields[FIELD_MAPPING.name] = linkData.name;
    fields[FIELD_MAPPING.category] = linkData.category;
    fields[FIELD_MAPPING.sort] = linkData.sort || 999;

    if (linkData.url) {
      fields[FIELD_MAPPING.url] = {
        link: linkData.url,
        text: linkData.name
      };
    }

    fields[FIELD_MAPPING.icon] = linkData.icon
      ? { link: linkData.icon }
      : null;

    return fields;
  }

  /**
   * 读取指定配置对应的数据表字段列表。
   *
   * @param {Object|null} configOverride - 可选飞书配置；传入时用于检测尚未保存的表单配置。
   * @param {string|null} tokenOverride - 可选 tenant_access_token；省略时按配置获取。
   * @returns {Promise<Array<Object>>} 飞书字段对象数组。
   * @throws {Error} 缺少 APP_TOKEN/TABLE_ID、权限不足、表格不存在或网络异常时抛出。
   * @sideeffects 可能发起飞书网络请求；未传入 tokenOverride 时可能读取或刷新 token。
   */
  async function listTableFields(configOverride = null, tokenOverride = null) {
    const config = configOverride || await getConfig();
    if (!config || !config.appToken || !config.tableId) {
      throw new Error('飞书配置不完整，请先配置 APP_TOKEN 和 TABLE_ID');
    }

    const token = tokenOverride || await getTenantAccessToken(configOverride);
    const response = await fetch(
      `${API_BASE}/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/fields?page_size=100`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const result = await response.json();

    if (result.code !== 0) {
      const classified = classifyConnectionError(result);
      throw new Error(classified.message);
    }

    return result.data?.items || [];
  }

  /**
   * 使用指定配置读取记录，用于连接向导检测未保存的表单配置。
   *
   * @param {Object} config - 飞书配置对象，必须包含 appToken 和 tableId。
   * @param {string} token - 已获取的 tenant_access_token。
   * @returns {Promise<Object>} 与 getRecords 一致的转换后导航数据结果。
   * @throws {Error} 飞书返回错误、JSON 解析失败或网络异常时抛出。
   * @sideeffects 发起飞书记录读取网络请求，不读写本地导航缓存。
   */
  async function fetchRecordsForConfig(config, token) {
    const response = await fetch(
      `${API_BASE}/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records?page_size=100`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const result = await response.json();

    if (result.code !== 0) {
      const classified = classifyConnectionError(result);
      throw new Error(classified.message);
    }

    return {
      success: true,
      ...transformRecords(result.data?.items || [])
    };
  }

  async function updateRecord(recordId, linkData, canRetry = true) {
    if (!recordId) {
      throw new Error('记录 ID 不能为空');
    }

    if (await isTestMode()) {
      console.log('[FeishuAPI] 测试模式：更新记录', recordId, linkData);
      return {
        success: true,
        message: '测试模式下记录已更新'
      };
    }

    const config = await getConfig();
    if (!config || !config.appToken || !config.tableId) {
      throw new Error('飞书配置不完整');
    }

    const token = await getTenantAccessToken();
    const fields = buildRecordFields(linkData);

    try {
      console.log('[FeishuAPI] 正在更新记录...', recordId);

      const response = await fetch(
        `${API_BASE}/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/${recordId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fields })
        }
      );

      const result = await response.json();

      if (result.code !== 0) {
        if (result.code === 99991663 && canRetry) {
          console.log('[FeishuAPI] Token 过期，尝试重新获取...');
          await Storage.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY]);
          return await updateRecord(recordId, linkData, false);
        }
        if (isRecordNotFoundError(result)) {
          return {
            success: true,
            skipped: true,
            message: '记录不存在，已跳过'
          };
        }
        console.error('[FeishuAPI] 更新记录失败:', result.msg);
        throw new Error(`更新记录失败: ${result.msg}`);
      }

      return {
        success: true,
        skipped: false,
        message: '更新成功'
      };
    } catch (error) {
      console.error('[FeishuAPI] 更新记录异常:', error);
      throw error;
    }
  }

  async function addRecord(linkData) {
    // 测试模式
    if (await isTestMode()) {
      console.log('[FeishuAPI] 测试模式：添加记录', linkData);
      return {
        success: true,
        recordId: `mock-${Date.now()}`,
        message: '测试模式下记录已添加'
      };
    }

    const config = await getConfig();
    if (!config || !config.appToken || !config.tableId) {
      throw new Error('飞书配置不完整');
    }

    const token = await getTenantAccessToken();

    const fields = {};
    fields[FIELD_MAPPING.name] = linkData.name;
    fields[FIELD_MAPPING.category] = linkData.category;
    fields[FIELD_MAPPING.sort] = linkData.sort || 999;

    // 处理网址字段格式
    if (linkData.url) {
      fields[FIELD_MAPPING.url] = {
        link: linkData.url,
        text: linkData.name
      };
    }

    // 处理图标
    if (linkData.icon) {
      fields[FIELD_MAPPING.icon] = { link: linkData.icon };
    }

    try {
      console.log('[FeishuAPI] 正在添加记录...');

      const response = await fetch(
        `${API_BASE}/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fields })
        }
      );

      const result = await response.json();

      if (result.code !== 0) {
        if (result.code === 99991663) {
          console.log('[FeishuAPI] Token 过期，尝试重新获取...');
          await Storage.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY]);
          return await addRecord(linkData); // 递归重试
        }
        console.error('[FeishuAPI] 添加记录失败:', result.msg);
        throw new Error(`添加记录失败: ${result.msg}`);
      }

      console.log('[FeishuAPI] 记录添加成功:', result.data?.record_id);

      return {
        success: true,
        recordId: result.data?.record_id,
        message: '添加成功'
      };
    } catch (error) {
      console.error('[FeishuAPI] 添加记录异常:', error);
      throw error;
    }
  }

  /**
   * 删除记录
   * @param {string} recordId - 记录 ID
   * @returns {Promise<Object>} 删除结果
   */
  async function deleteRecord(recordId) {
    // 测试模式
    if (await isTestMode()) {
      console.log('[FeishuAPI] 测试模式：删除记录', recordId);
      return {
        success: true,
        message: '测试模式下记录已删除'
      };
    }

    const config = await getConfig();
    if (!config || !config.appToken || !config.tableId) {
      throw new Error('飞书配置不完整');
    }

    const token = await getTenantAccessToken();

    try {
      console.log('[FeishuAPI] 正在删除记录...');

      const response = await fetch(
        `${API_BASE}/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/${recordId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = await response.json();

      if (result.code !== 0) {
        if (result.code === 99991663) {
          console.log('[FeishuAPI] Token 过期，尝试重新获取...');
          await Storage.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY]);
          return await deleteRecord(recordId); // 递归重试
        }
        if (isRecordNotFoundError(result)) {
          console.warn('[FeishuAPI] 删除时记录不存在，跳过并继续同步:', recordId);
          return {
            success: true,
            skipped: true,
            message: '记录不存在，已跳过删除'
          };
        }
        console.error('[FeishuAPI] 删除记录失败:', result.msg);
        throw new Error(`删除记录失败: ${result.msg}`);
      }

      console.log('[FeishuAPI] 记录删除成功');

      return {
        success: true,
        skipped: false,
        message: '删除成功'
      };
    } catch (error) {
      console.error('[FeishuAPI] 删除记录异常:', error);
      throw error;
    }
  }

  /**
   * 判断是否为记录不存在错误
   * @param {Object|string} errorLike - 错误对象或消息
   * @returns {boolean}
   */
  function isRecordNotFoundError(errorLike) {
    const text = typeof errorLike === 'string'
      ? errorLike
      : `${errorLike?.msg || ''} ${errorLike?.message || ''}`.trim();
    return text.includes('RecordIdNotFound');
  }

  /**
   * 更新记录排序字段
   * @param {string} recordId - 记录 ID
   * @param {number} sort - 排序值
   * @param {boolean} canRetry - 是否允许重试 token 失效
   * @returns {Promise<Object>} 更新结果
   */
  async function updateRecordSort(recordId, sort, canRetry = true) {
    if (!recordId) {
      throw new Error('记录 ID 不能为空');
    }

    // 测试模式：仅本地模拟成功
    if (await isTestMode()) {
      console.log('[FeishuAPI] 测试模式：更新排序', recordId, sort);
      return {
        success: true,
        message: '测试模式下排序已更新'
      };
    }

    const config = await getConfig();
    if (!config || !config.appToken || !config.tableId) {
      throw new Error('飞书配置不完整');
    }

    const token = await getTenantAccessToken();
    const fields = {
      [FIELD_MAPPING.sort]: sort
    };

    try {
      console.log('[FeishuAPI] 正在更新排序...', recordId, sort);

      const response = await fetch(
        `${API_BASE}/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/${recordId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fields })
        }
      );

      const result = await response.json();

      if (result.code !== 0) {
        if (result.code === 99991663 && canRetry) {
          console.log('[FeishuAPI] Token 过期，尝试重新获取...');
          await Storage.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY]);
          return await updateRecordSort(recordId, sort, false);
        }
        if (isRecordNotFoundError(result)) {
          console.warn('[FeishuAPI] 记录不存在，跳过排序更新:', recordId);
          return {
            success: true,
            skipped: true,
            message: '记录不存在，已跳过'
          };
        }
        console.error('[FeishuAPI] 更新排序失败:', result.msg);
        throw new Error(`更新排序失败: ${result.msg}`);
      }

      return {
        success: true,
        skipped: false,
        message: '排序更新成功'
      };
    } catch (error) {
      console.error('[FeishuAPI] 更新排序异常:', error);
      throw error;
    }
  }

  /**
   * 批量更新记录排序字段
   * @param {Array<{recordId: string, sort: number}>} updates - 批量更新项
   * @param {boolean} canRetry - 是否允许重试 token 失效
   * @returns {Promise<Object>} 更新结果
   */
  async function batchUpdateRecordSorts(updates, canRetry = true) {
    const safeUpdates = Array.isArray(updates) ? updates : [];
    if (safeUpdates.length === 0) {
      return {
        success: true,
        message: '无排序变更',
        updatedCount: 0
      };
    }

    // 测试模式：仅本地模拟成功
    if (await isTestMode()) {
      console.log('[FeishuAPI] 测试模式：批量更新排序', safeUpdates.length);
      return {
        success: true,
        message: '测试模式下排序已更新',
        updatedCount: safeUpdates.length
      };
    }

    const config = await getConfig();
    if (!config || !config.appToken || !config.tableId) {
      throw new Error('飞书配置不完整');
    }

    const payloadUpdates = safeUpdates
      .filter(item => item && item.recordId)
      .map(item => ({
        record_id: item.recordId,
        fields: {
          [FIELD_MAPPING.sort]: item.sort
        }
      }));

    if (payloadUpdates.length === 0) {
      return {
        success: true,
        message: '无可更新记录',
        updatedCount: 0
      };
    }

    const token = await getTenantAccessToken();
    let updatedCount = 0;
    let skippedCount = 0;

    try {
      for (let i = 0; i < payloadUpdates.length; i += BATCH_UPDATE_SIZE) {
        const chunk = payloadUpdates.slice(i, i + BATCH_UPDATE_SIZE);
        const response = await fetch(
          `${API_BASE}/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/batch_update`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ records: chunk })
          }
        );

        const result = await response.json();

        if (result.code !== 0) {
          if (result.code === 99991663 && canRetry) {
            console.log('[FeishuAPI] Token 过期，尝试重新获取...');
            await Storage.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY]);
            return await batchUpdateRecordSorts(safeUpdates, false);
          }
          if (isRecordNotFoundError(result)) {
            console.warn('[FeishuAPI] 批量更新含无效记录，降级逐条更新并跳过无效记录');
            const singleResult = await fallbackBatchBySingleUpdates(chunk);
            updatedCount += singleResult.updatedCount;
            skippedCount += singleResult.skippedCount;
            continue;
          }
          console.error('[FeishuAPI] 批量更新排序失败:', result.msg);
          throw new Error(`批量更新排序失败: ${result.msg}`);
        }

        updatedCount += chunk.length;
      }

      return {
        success: true,
        message: skippedCount > 0 ? '批量排序更新成功（已跳过无效记录）' : '批量排序更新成功',
        updatedCount,
        skippedCount
      };
    } catch (error) {
      console.error('[FeishuAPI] 批量更新排序异常:', error);
      throw error;
    }
  }

  /**
   * 批量接口失败时降级逐条更新
   * @param {Array<{record_id: string, fields: Object}>} chunk
   * @returns {Promise<{updatedCount: number, skippedCount: number}>}
   */
  async function fallbackBatchBySingleUpdates(chunk) {
    let updatedCount = 0;
    let skippedCount = 0;

    for (const item of chunk) {
      const recordId = item?.record_id;
      const sort = item?.fields?.[FIELD_MAPPING.sort];
      if (!recordId) continue;

      const result = await updateRecordSort(recordId, sort);
      if (result?.skipped) {
        skippedCount++;
      } else {
        updatedCount++;
      }
    }

    return { updatedCount, skippedCount };
  }

  /**
   * 创建连接检测步骤结果。
   *
   * @param {string} status - pending、success 或 error。
   * @param {string} message - 面向用户的步骤说明。
   * @param {Object} extra - 需要附加到步骤上的结构化信息。
   * @returns {Object} 单个检测步骤对象。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function createConnectionCheck(status, message, extra = {}) {
    return { status, message, ...extra };
  }

  /**
   * 构建连接检测结果的初始结构。
   *
   * @returns {Object} 包含所有检测步骤的结果对象。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function createConnectionResult() {
    return {
      success: false,
      message: '连接检测未完成',
      missingFields: [],
      checks: {
        credentials: createConnectionCheck('pending', '等待检查连接凭证'),
        token: createConnectionCheck('pending', '等待获取飞书 Token'),
        table: createConnectionCheck('pending', '等待访问多维表格'),
        fields: createConnectionCheck('pending', '等待检查表格字段'),
        records: createConnectionCheck('pending', '等待读取记录')
      }
    };
  }

  /**
   * 归类飞书连接检测中的异常。
   *
   * @param {Object|Error|string|null} errorLike - 飞书响应、异常或错误文本。
   * @returns {Object} 包含 category、message、code、rawMessage 的错误归类结果。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function classifyConnectionError(errorLike) {
    if (ConfigCheckCore && typeof ConfigCheckCore.classifyFeishuError === 'function') {
      return ConfigCheckCore.classifyFeishuError(errorLike);
    }

    return {
      category: 'unknown',
      message: errorLike?.message || errorLike?.msg || String(errorLike || '飞书请求失败'),
      code: errorLike?.code || null,
      rawMessage: errorLike?.msg || errorLike?.message || ''
    };
  }

  /**
   * 测试飞书连接并检查字段完整性。
   *
   * @param {Object|null} configOverride - 可选飞书配置；传入时检测尚未保存的表单输入。
   * @returns {Promise<Object>} 结构化测试结果，包含 success、message、checks 和 missingFields。
   * @throws {Error} 内部捕获并转为失败结果；通常不向调用方抛出。
   * @sideeffects 可能发起飞书 token、字段列表和记录读取网络请求；不会保存配置或导航缓存。
   */
  async function testConnection(configOverride = null) {
    const result = createConnectionResult();
    const core = ConfigCheckCore;

    try {
      // 先检查测试模式
      if (await isTestMode()) {
        result.success = true;
        result.message = '测试模式已启用';
        result.checks.credentials = createConnectionCheck('success', '测试模式下无需飞书凭证');
        return result;
      }

      const config = configOverride || await getConfig();
      const configCheck = core && typeof core.validateRequiredConfig === 'function'
        ? core.validateRequiredConfig(config)
        : { success: !!(config && config.appId && config.appSecret && config.appToken && config.tableId), message: '飞书连接凭证已填写完整', missingKeys: [] };

      if (!configCheck.success) {
        result.message = configCheck.message;
        result.checks.credentials = createConnectionCheck('error', configCheck.message, {
          category: configCheck.category,
          missingKeys: configCheck.missingKeys || []
        });
        return result;
      }
      result.checks.credentials = createConnectionCheck('success', '飞书连接凭证已填写完整');

      let token = '';
      try {
        token = await getTenantAccessToken(config);
        result.checks.token = createConnectionCheck('success', 'APP_ID / APP_SECRET 有效');
      } catch (error) {
        const classified = classifyConnectionError(error);
        result.message = classified.message;
        result.checks.token = createConnectionCheck('error', classified.message, classified);
        return result;
      }

      let fields = [];
      try {
        fields = await listTableFields(config, token);
        result.checks.table = createConnectionCheck('success', 'APP_TOKEN / TABLE_ID 可访问');
      } catch (error) {
        const classified = classifyConnectionError(error);
        result.message = classified.message;
        result.checks.table = createConnectionCheck('error', classified.message, classified);
        return result;
      }

      const fieldCheck = core && typeof core.analyzeFieldList === 'function'
        ? core.analyzeFieldList(fields)
        : { success: true, message: '字段检查通过', missingFields: [] };
      result.missingFields = fieldCheck.missingFields || [];
      if (!fieldCheck.success) {
        result.message = fieldCheck.message;
        result.checks.fields = createConnectionCheck('error', fieldCheck.message, {
          category: fieldCheck.category,
          missingFields: fieldCheck.missingFields || []
        });
        return result;
      }
      result.checks.fields = createConnectionCheck('success', fieldCheck.message);

      try {
        await fetchRecordsForConfig(config, token);
        result.checks.records = createConnectionCheck('success', '可以读取表格记录');
      } catch (error) {
        const classified = classifyConnectionError(error);
        result.message = classified.message;
        result.checks.records = createConnectionCheck('error', classified.message, classified);
        return result;
      }

      result.success = true;
      result.message = '连接成功，字段完整，可以保存配置';
      return result;
    } catch (error) {
      result.success = false;
      result.message = error.message || '连接检测失败';
      return result;
    }
  }

  /**
   * 清除 Token 缓存
   */
  async function clearTokenCache() {
    await Storage.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY]);
    console.log('[FeishuAPI] Token 缓存已清除');
  }

  /**
   * 获取模拟数据（供 UI 使用）
   */
  function getMockData() {
    return MOCK_DATA;
  }

  /**
   * 获取模拟数据的日期信息
   * @returns {{date: string, weekday: string, lunarDate: string}}
   */
  function getMockDateInfo() {
    return generateDateInfo();
  }

  function getCurrentDateInfo() {
    return generateDateInfo();
  }

  // ==================== 公共 API ====================

  return {
    // 核心方法
    getTenantAccessToken,
    getRecords,
    addRecord,
    updateRecord,
    deleteRecord,
    updateRecordSort,
    batchUpdateRecordSorts,
    listTableFields,
    testConnection,

    // Token 管理
    clearTokenCache,

    // 测试模式支持
    isTestMode,
    getMockData,
    getCurrentDateInfo,
    getMockDateInfo,

    // 工具方法
    getConfig
  };
})();

// 导出到全局
window.FeishuAPI = FeishuAPI;
