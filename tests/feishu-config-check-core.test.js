/**
 * 飞书配置检测核心测试
 *
 * 职责与边界：验证飞书配置向导中字段完整性、凭证校验和错误归类的纯逻辑；
 * 不测试 DOM、Chrome Extension API、真实飞书网络请求或浏览器存储。
 * 关键副作用：通过 Node.js 测试运行器读取本地模块；不读写网络、文件或浏览器存储。
 * 关键依赖与约束：依赖 feishu-config-check-core.js 暴露 CommonJS API；断言使用稳定的中文文案。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REQUIRED_FIELD_NAMES,
  analyzeFieldList,
  classifyFeishuError,
  getInitialWizardStep,
  validateRequiredConfig
} = require('../js/modules/feishu-config-check-core.js');

test('字段列表包含全部五个字段时检测通过', () => {
  const result = analyzeFieldList([
    { field_name: '分类' },
    { field_name: '站点名称' },
    { field_name: '网址' },
    { field_name: '排序' },
    { field_name: '备用图标' }
  ]);

  assert.deepEqual(REQUIRED_FIELD_NAMES, ['分类', '站点名称', '网址', '排序', '备用图标']);
  assert.equal(result.success, true);
  assert.deepEqual(result.missingFields, []);
  assert.match(result.message, /字段检查通过/);
});

test('缺少备用图标字段时检测失败并说明需要一次性创建', () => {
  const result = analyzeFieldList([
    { field_name: '分类' },
    { field_name: '站点名称' },
    { field_name: '网址' },
    { field_name: '排序' }
  ]);

  assert.equal(result.success, false);
  assert.deepEqual(result.missingFields, ['备用图标']);
  assert.match(result.message, /备用图标/);
});

test('凭证缺失时返回明确的缺失字段', () => {
  const result = validateRequiredConfig({
    appId: 'cli_xxx',
    appSecret: '',
    appToken: 'bascnxxx',
    tableId: ''
  });

  assert.equal(result.success, false);
  assert.deepEqual(result.missingKeys, ['APP_SECRET', 'TABLE_ID']);
  assert.equal(result.category, 'missing_config');
});

test('已有完整飞书配置时向导直接进入检测保存步骤', () => {
  const step = getInitialWizardStep({
    appId: 'cli_xxx',
    appSecret: 'secret',
    appToken: 'bascnxxx',
    tableId: 'tblxxx'
  });

  assert.equal(step, 3);
});

test('飞书配置不完整时向导仍从准备资源开始', () => {
  const step = getInitialWizardStep({
    appId: 'cli_xxx',
    appSecret: '',
    appToken: 'bascnxxx',
    tableId: 'tblxxx'
  });

  assert.equal(step, 1);
});

test('飞书权限错误会归类为权限不足', () => {
  const result = classifyFeishuError({ code: 1254030, msg: 'Forbidden: no permission' });

  assert.equal(result.category, 'permission_denied');
  assert.match(result.message, /权限不足/);
});

test('表格或多维表格标识错误会归类为表格 ID 错误', () => {
  const result = classifyFeishuError({ code: 1254040, msg: 'table not found' });

  assert.equal(result.category, 'table_not_found');
  assert.match(result.message, /APP_TOKEN 或 TABLE_ID/);
});
