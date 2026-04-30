/**
 * 链接管理核心测试
 *
 * 职责与边界：验证链接表单的 URL 规范化、重复检测、favicon 建议和纯数据校验；
 * 不测试 DOM 事件、Chrome Extension API、真实飞书写入或图片加载结果。
 * 关键副作用：通过 Node.js 测试运行器读取本地模块；不读写浏览器存储、网络或文件。
 * 关键依赖与约束：依赖 link-manager-core.js 暴露 CommonJS API，测试用例应保持与浏览器端一致的纯逻辑行为。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findDuplicateUrl,
  normalizeLinkUrl,
  resolveFaviconUrl,
  validateLinkForm
} = require('../js/modules/link-manager-core.js');

const navData = {
  工具: [
    { id: '1', name: 'Example Docs', url: 'https://Example.com/docs/' },
    { id: '2', name: 'Search', url: 'https://search.example.com/?q=nav' }
  ],
  Code: [
    { id: '3', name: 'GitHub', url: 'https://github.com' }
  ]
};

test('规范化 URL 时忽略协议和主机大小写、默认端口、末尾斜杠与 hash', () => {
  assert.equal(
    normalizeLinkUrl('HTTPS://Example.COM:443/docs/#top'),
    'https://example.com/docs'
  );
});

test('重复 URL 检测能跨分类查找并返回命中的站点信息', () => {
  const duplicate = findDuplicateUrl(navData, 'https://example.com/docs');

  assert.deepEqual(duplicate, {
    id: '1',
    name: 'Example Docs',
    url: 'https://Example.com/docs/',
    category: '工具'
  });
});

test('编辑当前记录时重复 URL 检测会排除自身', () => {
  const duplicate = findDuplicateUrl(navData, 'https://example.com/docs', '1');

  assert.equal(duplicate, null);
});

test('favicon 建议 URL 只从合法 http/https URL 生成', () => {
  assert.equal(
    resolveFaviconUrl('https://www.example.com/path'),
    'https://www.google.com/s2/favicons?domain=www.example.com&sz=64'
  );
  assert.equal(resolveFaviconUrl('chrome://extensions'), '');
});

test('表单校验会阻止重复 URL 并保留具体错误文案', () => {
  const errors = validateLinkForm({
    url: 'https://example.com/docs',
    name: 'Example',
    icon: 'https://example.com/icon.png',
    category: '工具'
  }, {
    navData,
    excludeRecordId: null
  });

  assert.equal(errors.hasErrors, true);
  assert.match(errors.url, /已存在/);
});

test('表单校验接受合法的新链接数据', () => {
  const errors = validateLinkForm({
    url: 'https://openai.com',
    name: 'OpenAI',
    icon: '',
    category: 'AI'
  }, {
    navData,
    excludeRecordId: null
  });

  assert.deepEqual(errors, {
    hasErrors: false,
    url: '',
    name: '',
    icon: '',
    category: ''
  });
});
