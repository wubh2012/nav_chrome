/**
 * 飞书 API 模块
 * 处理与飞书多维表格的通信
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

  // 飞书多维表格字段映射
  const FIELD_MAPPING = {
    category: '分类',
    name: '站点名称',
    url: '网址',
    sort: '排序',
    icon: '备用图标'
  };

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

  /**
   * 获取网站图标 URL（用于 img src）
   * @param {string} url - 网站 URL
   * @returns {string} Google Favicon URL
   */
  function getGoogleFaviconUrl(url) {
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
   * 获取 tenant_access_token
   * @returns {Promise<string>}
   */
  async function getTenantAccessToken() {
    // 先检查缓存
    const cachedToken = await getCachedToken();
    if (cachedToken) {
      console.log('[FeishuAPI] 使用缓存的 Token');
      return cachedToken;
    }

    const config = await getConfig();
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

      // 缓存 Token
      await cacheToken(result.tenant_access_token);
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
      fields[FIELD_MAPPING.icon] = linkData.icon;
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
        console.error('[FeishuAPI] 删除记录失败:', result.msg);
        throw new Error(`删除记录失败: ${result.msg}`);
      }

      console.log('[FeishuAPI] 记录删除成功');

      return {
        success: true,
        message: '删除成功'
      };
    } catch (error) {
      console.error('[FeishuAPI] 删除记录异常:', error);
      throw error;
    }
  }

  /**
   * 测试连接
   * @returns {Promise<Object>} 测试结果
   */
  async function testConnection() {
    try {
      // 先检查测试模式
      if (await isTestMode()) {
        return {
          success: true,
          message: '测试模式已启用'
        };
      }

      // 尝试获取 Token
      await getTenantAccessToken();

      // 尝试获取数据
      const config = await getConfig();
      if (!config || !config.appToken || !config.tableId) {
        return {
          success: false,
          message: 'APP_TOKEN 和 TABLE_ID 未配置'
        };
      }

      await getRecords();

      return {
        success: true,
        message: '连接成功'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
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

  // ==================== 公共 API ====================

  return {
    // 核心方法
    getTenantAccessToken,
    getRecords,
    addRecord,
    deleteRecord,
    testConnection,

    // Token 管理
    clearTokenCache,

    // 测试模式支持
    isTestMode,
    getMockData,
    getMockDateInfo,

    // 工具方法
    getConfig
  };
})();

// 导出到全局
window.FeishuAPI = FeishuAPI;
