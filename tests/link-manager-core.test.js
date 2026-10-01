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
  applyOptimisticDeleteToSnapshot,
  applyOptimisticLinkChangeToSnapshot,
  findDuplicateUrl,
  normalizeLinkUrl,
  replaceRecordIdInSnapshot,
  resolveFaviconUrl,
  rollbackOptimisticDeleteInSnapshot,
  rollbackOptimisticSaveInSnapshot,
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

test('乐观新增会插入目标分类并按排序稳定排列', () => {
  const snapshot = {
    data: { 工具: [{ id: '1', name: 'B', url: 'https://b.test', sort: 20 }] },
    categories: ['工具'],
    dateInfo: { date: '6月30日' }
  };

  const next = applyOptimisticLinkChangeToSnapshot(snapshot, {
    url: 'https://a.test',
    name: 'A',
    icon: '',
    category: '工具',
    sort: 10
  }, {
    isEditing: false,
    recordId: 'local-1'
  });

  assert.equal(next.changed, true);
  assert.deepEqual(next.data.工具.map(item => item.id), ['local-1', '1']);
  assert.equal(next.data.工具[0].icon, 'https://www.google.com/s2/favicons?domain=a.test&sz=64');
});

test('乐观编辑会从旧分类移除并清理空分类', () => {
  const snapshot = {
    data: { 工具: [{ id: '1', name: 'Docs', url: 'https://docs.test', sort: 20 }] },
    categories: ['工具'],
    dateInfo: null
  };

  const next = applyOptimisticLinkChangeToSnapshot(snapshot, {
    url: 'https://docs.test',
    name: 'Docs',
    icon: 'https://docs.test/icon.png',
    category: 'Code',
    sort: 5
  }, {
    isEditing: true,
    recordId: '1',
    previousLink: { id: '1', category: '工具' }
  });

  assert.deepEqual(next.categories, ['Code']);
  assert.equal(next.data.工具, undefined);
  assert.deepEqual(next.data.Code[0], {
    id: '1',
    name: 'Docs',
    url: 'https://docs.test',
    icon: 'https://docs.test/icon.png',
    customIcon: 'https://docs.test/icon.png',
    sort: 5
  });
});

test('乐观删除会移除记录并清理空分类', () => {
  const snapshot = {
    data: { 工具: [{ id: '1', name: 'Docs', url: 'https://docs.test', sort: 20 }] },
    categories: ['工具'],
    dateInfo: null
  };

  const next = applyOptimisticDeleteToSnapshot(snapshot, { id: '1', category: '工具' });

  assert.equal(next.changed, true);
  assert.deepEqual(next.categories, []);
  assert.deepEqual(next.data, {});
});

test('远端 ID 替换只修改匹配的本地临时记录', () => {
  const snapshot = {
    data: { 工具: [{ id: 'local-1', name: 'Docs' }, { id: '2', name: 'Other' }] },
    categories: ['工具'],
    dateInfo: null
  };

  const next = replaceRecordIdInSnapshot(snapshot, 'local-1', 'rec_abc');

  assert.equal(next.changed, true);
  assert.deepEqual(next.data.工具.map(item => item.id), ['rec_abc', '2']);
  assert.equal(snapshot.data.工具[0].id, 'local-1');
});

test('保存失败回滚会移除本次乐观新增', () => {
  const snapshot = {
    data: { 工具: [{ id: 'local-1', name: 'Docs', url: 'https://docs.test', customIcon: '', sort: 10 }] },
    categories: ['工具'],
    dateInfo: null
  };

  const next = rollbackOptimisticSaveInSnapshot(snapshot, {
    isEditing: false,
    recordId: 'local-1',
    formData: {
      name: 'Docs',
      url: 'https://docs.test',
      icon: '',
      category: '工具',
      sort: 10
    }
  });

  assert.equal(next.changed, true);
  assert.deepEqual(next.data, {});
  assert.deepEqual(next.categories, []);
});

test('删除失败回滚会恢复被删记录', () => {
  const snapshot = {
    data: {},
    categories: [],
    dateInfo: null
  };

  const next = rollbackOptimisticDeleteInSnapshot(snapshot, {
    id: '1',
    name: 'Docs',
    url: 'https://docs.test',
    icon: '',
    customIcon: '',
    category: '工具',
    sort: 10
  });

  assert.equal(next.changed, true);
  assert.deepEqual(next.categories, ['工具']);
  assert.equal(next.data.工具[0].id, '1');
});
