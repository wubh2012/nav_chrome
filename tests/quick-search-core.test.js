/**
 * 快速搜索核心测试
 *
 * 职责与边界：验证快速搜索的纯数据索引、拼音匹配、排序与高亮信息；
 * 不测试浏览器 DOM、Chrome Extension API 或真实飞书数据同步。
 * 关键副作用：通过 Node.js 测试运行器读取本地模块；不读写浏览器存储、网络或文件。
 * 关键依赖与约束：依赖 quick-search-core.js 暴露 CommonJS API，并使用测试内注入的拼音适配器保证用例稳定。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { searchSites } = require('../js/modules/quick-search-core.js');

function createPinyinAdapter() {
  const fullMap = new Map([
    ['飞书', 'fei shu'],
    ['飞书文档', 'fei shu wen dang'],
    ['多维表格', 'duo wei biao ge'],
    ['工具', 'gong ju']
  ]);
  const firstMap = new Map([
    ['飞书', 'f s'],
    ['飞书文档', 'f s w d'],
    ['多维表格', 'd w b g'],
    ['工具', 'g j']
  ]);

  return {
    pinyin(text, options = {}) {
      const source = String(text || '');
      const map = options.pattern === 'first' ? firstMap : fullMap;
      return map.get(source) || source;
    }
  };
}

const sites = [
  { id: '1', name: '飞书文档', url: 'https://docs.feishu.cn', category: '工具', sort: 20 },
  { id: '2', name: '多维表格', url: 'https://bitable.feishu.cn', category: '工具', sort: 10 },
  { id: '3', name: 'GitHub', url: 'https://github.com', category: 'Code', sort: 30 }
];

test('按中文名称直接命中并返回高亮范围', () => {
  const results = searchSites(sites, '飞书', { pinyinAdapter: createPinyinAdapter() });

  assert.equal(results[0].site.name, '飞书文档');
  assert.equal(results[0].matchType, 'name');
  assert.deepEqual(results[0].highlight.name, [{ start: 0, end: 2 }]);
});

test('按全拼命中中文站点名', () => {
  const results = searchSites(sites, 'feishu', { pinyinAdapter: createPinyinAdapter() });

  assert.equal(results[0].site.name, '飞书文档');
  assert.equal(results[0].matchType, 'pinyin');
});

test('按拼音首字母命中中文站点名', () => {
  const results = searchSites(sites, 'fswd', { pinyinAdapter: createPinyinAdapter() });

  assert.equal(results[0].site.name, '飞书文档');
  assert.equal(results[0].matchType, 'initial');
});

test('拼音分类命中时保留原有排序优先级', () => {
  const results = searchSites(sites, 'gj', { pinyinAdapter: createPinyinAdapter() });

  assert.deepEqual(results.map((result) => result.site.name), ['多维表格', '飞书文档']);
  assert.equal(results[0].matchType, 'categoryInitial');
});

test('无拼音适配器时仍支持英文名称和域名匹配', () => {
  const results = searchSites(sites, 'github');

  assert.equal(results[0].site.name, 'GitHub');
  assert.equal(results[0].matchType, 'name');
});

test('空关键字返回全量站点并按排序和名称稳定排序', () => {
  const results = searchSites(sites, '', { pinyinAdapter: createPinyinAdapter() });

  assert.deepEqual(results.map((result) => result.site.name), ['多维表格', '飞书文档', 'GitHub']);
  assert.equal(results[0].matchType, 'empty');
});

test('支持英文模糊子序列匹配但优先级低于直接命中', () => {
  const results = searchSites(sites, 'gtb', { pinyinAdapter: createPinyinAdapter() });

  assert.equal(results[0].site.name, 'GitHub');
  assert.equal(results[0].matchType, 'fuzzyName');
});
