/**
 * 快速搜索核心逻辑
 *
 * 职责与边界：为快速搜索提供站点索引、文本归一化、拼音/首字母匹配、模糊匹配与结果排序；
 * 不负责 DOM 渲染、键盘事件、Chrome 标签页打开或飞书数据读取。
 * 关键副作用：无持久化副作用；仅在浏览器环境将 QuickSearchCore 暴露到全局对象。
 * 关键依赖与约束：可选依赖 pinyin-pro 兼容适配器；依赖调用方传入站点对象包含 name、url、category、sort 等字段。
 */
(function(root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.QuickSearchCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : null, function() {
  'use strict';

  const MATCH_WEIGHTS = {
    empty: 0,
    name: 1000,
    pinyin: 920,
    initial: 900,
    category: 760,
    categoryPinyin: 740,
    categoryInitial: 730,
    domain: 650,
    url: 620,
    fuzzyName: 520
  };

  /**
   * 搜索站点并按匹配质量排序。
   *
   * @param {Array<Object>} sites - 扁平站点列表；无效项会被跳过，原对象会保留在返回值 site 字段中。
   * @param {string} keyword - 用户输入关键字；会做大小写、空白和拼音空格归一化。
   * @param {Object} options - 搜索选项。
   * @param {Object|null} options.pinyinAdapter - 可选拼音适配器，需提供 pinyin(text, options)。
   * @returns {Array<Object>} 搜索结果；每项包含 site、score、matchType、matchedFields、highlight。
   * @throws {Error} 本函数不主动抛错；拼音适配器异常会被吞掉并降级为普通文本搜索。
   * @sideeffects 无外部副作用。
   */
  function searchSites(sites, keyword, options = {}) {
    const safeSites = Array.isArray(sites) ? sites : [];
    const query = normalizeQuery(keyword);
    const records = safeSites
      .filter(isValidSite)
      .map((site, index) => createSearchRecord(site, index, options.pinyinAdapter));

    if (!query) {
      return records
        .sort(compareByNaturalOrder)
        .map((record) => createResult(record, 'empty', 0, [], createEmptyHighlight()));
    }

    return records
      .map((record) => matchRecord(record, query))
      .filter(Boolean)
      .sort(compareResults)
      .map(stripInternalRecord);
  }

  /**
   * 为站点创建可搜索索引记录。
   *
   * @param {Object} site - 原始站点对象。
   * @param {number} index - 原始顺序，用于排序兜底。
   * @param {Object|null} pinyinAdapter - 可选拼音适配器。
   * @returns {Object} 内部搜索记录。
   * @throws {Error} 不主动抛错；拼音转换失败时对应字段为空。
   * @sideeffects 无外部副作用。
   */
  function createSearchRecord(site, index, pinyinAdapter) {
    const name = String(site.name || '');
    const category = String(site.category || '');
    const url = String(site.url || '');

    return {
      site,
      index,
      sort: Number.isFinite(Number(site.sort)) ? Number(site.sort) : 999,
      name,
      category,
      url,
      domain: extractDomain(url),
      normalizedName: normalizeText(name),
      normalizedCategory: normalizeText(category),
      normalizedUrl: normalizeText(url),
      normalizedDomain: normalizeText(extractDomain(url)),
      namePinyin: normalizePinyin(toPinyin(name, pinyinAdapter, false)),
      nameInitial: normalizePinyin(toPinyin(name, pinyinAdapter, true)),
      categoryPinyin: normalizePinyin(toPinyin(category, pinyinAdapter, false)),
      categoryInitial: normalizePinyin(toPinyin(category, pinyinAdapter, true))
    };
  }

  /**
   * 匹配单条搜索记录。
   *
   * @param {Object} record - createSearchRecord 返回的内部记录。
   * @param {string} query - 已归一化的搜索关键字。
   * @returns {Object|null} 内部搜索结果；未命中返回 null。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function matchRecord(record, query) {
    const directNameRange = findRange(record.normalizedName, query);
    if (directNameRange) {
      return createInternalResult(record, 'name', query, ['name'], {
        name: [directNameRange]
      });
    }

    if (record.namePinyin.includes(query)) {
      return createInternalResult(record, 'pinyin', query, ['namePinyin'], createEmptyHighlight());
    }

    if (record.nameInitial.includes(query)) {
      return createInternalResult(record, 'initial', query, ['nameInitial'], createEmptyHighlight());
    }

    const categoryRange = findRange(record.normalizedCategory, query);
    if (categoryRange) {
      return createInternalResult(record, 'category', query, ['category'], {
        category: [categoryRange]
      });
    }

    if (record.categoryInitial.includes(query)) {
      return createInternalResult(record, 'categoryInitial', query, ['categoryInitial'], createEmptyHighlight());
    }

    if (record.categoryPinyin.includes(query)) {
      return createInternalResult(record, 'categoryPinyin', query, ['categoryPinyin'], createEmptyHighlight());
    }

    const domainRange = findRange(record.normalizedDomain, query);
    if (domainRange) {
      return createInternalResult(record, 'domain', query, ['domain'], {
        domain: [domainRange]
      });
    }

    const urlRange = findRange(record.normalizedUrl, query);
    if (urlRange) {
      return createInternalResult(record, 'url', query, ['url'], {
        url: [urlRange]
      });
    }

    if (isSubsequence(query, record.normalizedName)) {
      return createInternalResult(record, 'fuzzyName', query, ['name'], createEmptyHighlight());
    }

    return null;
  }

  /**
   * 创建内部结果并计算分数。
   *
   * @param {Object} record - 内部搜索记录。
   * @param {string} matchType - 命中类型。
   * @param {string} query - 归一化关键字。
   * @param {Array<string>} matchedFields - 命中的索引字段。
   * @param {Object} highlight - 可用于 UI 高亮的原文本范围。
   * @returns {Object} 内部结果。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function createInternalResult(record, matchType, query, matchedFields, highlight) {
    const base = MATCH_WEIGHTS[matchType] || 0;
    const lengthBonus = Math.min(40, query.length * 3);

    return {
      record,
      site: record.site,
      score: base + lengthBonus,
      matchType,
      matchedFields,
      highlight
    };
  }

  /**
   * 创建对外结果对象。
   *
   * @param {Object} record - 内部搜索记录。
   * @param {string} matchType - 命中类型。
   * @param {number} score - 分数。
   * @param {Array<string>} matchedFields - 命中的索引字段。
   * @param {Object} highlight - 高亮信息。
   * @returns {Object} 对外搜索结果。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function createResult(record, matchType, score, matchedFields, highlight) {
    return {
      site: record.site,
      score,
      matchType,
      matchedFields,
      highlight
    };
  }

  /**
   * 移除排序所需的内部记录。
   *
   * @param {Object} result - 内部搜索结果。
   * @returns {Object} 对外搜索结果。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function stripInternalRecord(result) {
    return createResult(result.record, result.matchType, result.score, result.matchedFields, result.highlight);
  }

  /**
   * 判断站点是否可被搜索。
   *
   * @param {Object} site - 待检查站点。
   * @returns {boolean} name 与 url 都存在时返回 true。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function isValidSite(site) {
    return !!(site && site.name && site.url);
  }

  /**
   * 按搜索分数和原始排序比较两个结果。
   *
   * @param {Object} a - 内部搜索结果。
   * @param {Object} b - 内部搜索结果。
   * @returns {number} 排序比较值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function compareResults(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return compareByNaturalOrder(a.record, b.record);
  }

  /**
   * 按站点业务排序和名称比较两个记录。
   *
   * @param {Object} a - 内部搜索记录。
   * @param {Object} b - 内部搜索记录。
   * @returns {number} 排序比较值。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function compareByNaturalOrder(a, b) {
    if (a.sort !== b.sort) return a.sort - b.sort;
    const byName = a.name.localeCompare(b.name, 'zh-Hans-CN');
    if (byName !== 0) return byName;
    const byCategory = a.category.localeCompare(b.category, 'zh-Hans-CN');
    if (byCategory !== 0) return byCategory;
    return a.index - b.index;
  }

  /**
   * 归一化查询关键字。
   *
   * @param {string} keyword - 用户输入。
   * @returns {string} 小写、去重空白、移除拼音空格后的关键字。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function normalizeQuery(keyword) {
    return normalizePinyin(keyword);
  }

  /**
   * 归一化普通文本。
   *
   * @param {string} text - 原始文本。
   * @returns {string} 小写并折叠空白后的文本。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function normalizeText(text) {
    return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * 归一化拼音文本。
   *
   * @param {string} text - 原始拼音或用户输入。
   * @returns {string} 小写并移除空白、连字符、下划线后的文本。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function normalizePinyin(text) {
    return String(text || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  }

  /**
   * 调用拼音适配器转换文本。
   *
   * @param {string} text - 待转换文本。
   * @param {Object|null} pinyinAdapter - 可选拼音适配器。
   * @param {boolean} firstOnly - 是否只取首字母。
   * @returns {string} 拼音字符串；无适配器或失败时返回空字符串。
   * @throws {Error} 不主动抛错；适配器错误会被吞掉以保持搜索可用。
   * @sideeffects 无外部副作用。
   */
  function toPinyin(text, pinyinAdapter, firstOnly) {
    if (!pinyinAdapter || typeof pinyinAdapter.pinyin !== 'function') {
      return '';
    }

    try {
      return pinyinAdapter.pinyin(String(text || ''), {
        pattern: firstOnly ? 'first' : 'pinyin',
        toneType: 'none'
      });
    } catch (_error) {
      return '';
    }
  }

  /**
   * 从归一化文本中查找连续命中范围。
   *
   * @param {string} normalizedText - 已归一化文本。
   * @param {string} query - 已归一化关键字。
   * @returns {Object|null} 命中范围；未命中返回 null。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function findRange(normalizedText, query) {
    const start = normalizedText.indexOf(query);
    if (start < 0) {
      return null;
    }
    return { start, end: start + query.length };
  }

  /**
   * 判断 query 是否为 target 的有序子序列。
   *
   * @param {string} query - 归一化关键字。
   * @param {string} target - 归一化目标文本。
   * @returns {boolean} 按顺序全部匹配时返回 true。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function isSubsequence(query, target) {
    if (!query || !target) return false;

    let queryIndex = 0;
    for (let i = 0; i < target.length && queryIndex < query.length; i++) {
      if (target[i] === query[queryIndex]) {
        queryIndex++;
      }
    }

    return queryIndex === query.length;
  }

  /**
   * 提取 URL 域名。
   *
   * @param {string} url - 原始 URL，可省略协议。
   * @returns {string} 域名；解析失败时返回原始 URL。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function extractDomain(url) {
    if (!url) return '';
    try {
      const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      return new URL(normalized).hostname;
    } catch (_error) {
      return String(url || '');
    }
  }

  /**
   * 创建空高亮信息对象。
   *
   * @returns {Object} 各展示字段的空范围列表。
   * @throws {Error} 不主动抛错。
   * @sideeffects 无外部副作用。
   */
  function createEmptyHighlight() {
    return {
      name: [],
      category: [],
      domain: [],
      url: []
    };
  }

  return {
    searchSites,
    normalizeText,
    normalizePinyin,
    extractDomain
  };
});
