/**
 * Popup 同步状态核心测试
 *
 * 职责与边界：验证 popup 同步状态面板的纯格式化逻辑；
 * 不测试 DOM、Chrome Extension API、飞书网络请求或真实浏览器存储。
 * 关键副作用：通过 Node.js 测试运行器读取本地模块；不读写网络、文件或浏览器存储。
 * 关键依赖与约束：依赖 popup-status-core.js 暴露 CommonJS API，时间相关断言使用固定 now。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createSyncStatusViewModel } = require('../js/modules/popup-status-core.js');

const NOW = new Date('2026-04-30T12:00:00+08:00').getTime();

test('未配置飞书时提示需要配置并禁用同步', () => {
  const viewModel = createSyncStatusViewModel({
    testMode: false,
    feishuConfig: null,
    syncStatus: null,
    syncTime: null,
    now: NOW
  });

  assert.equal(viewModel.statusLabel, '未配置');
  assert.equal(viewModel.statusTone, 'warning');
  assert.equal(viewModel.sourceLabel, '未配置飞书');
  assert.equal(viewModel.syncButtonEnabled, false);
});

test('测试模式显示模拟数据并禁用同步', () => {
  const viewModel = createSyncStatusViewModel({
    testMode: true,
    feishuConfig: { appId: 'cli_xxx', appToken: 'token' },
    syncStatus: { status: 'success', message: '同步成功' },
    syncTime: NOW - 60 * 1000,
    now: NOW
  });

  assert.equal(viewModel.statusLabel, '测试模式');
  assert.equal(viewModel.statusTone, 'info');
  assert.equal(viewModel.sourceLabel, '模拟数据');
  assert.equal(viewModel.lastSyncLabel, '1 分钟前');
  assert.equal(viewModel.syncButtonEnabled, false);
});

test('同步成功时展示飞书来源和相对同步时间', () => {
  const viewModel = createSyncStatusViewModel({
    testMode: false,
    feishuConfig: {
      appId: 'cli_xxx',
      appSecret: 'secret',
      appToken: 'token',
      tableId: 'tbl',
      syncEnabled: true,
      syncInterval: 15
    },
    syncStatus: { status: 'success', message: '同步成功' },
    syncTime: NOW - 2 * 60 * 60 * 1000,
    now: NOW
  });

  assert.equal(viewModel.statusLabel, '同步正常');
  assert.equal(viewModel.statusTone, 'success');
  assert.equal(viewModel.sourceLabel, '飞书多维表格');
  assert.equal(viewModel.lastSyncLabel, '2 小时前');
  assert.equal(viewModel.autoSyncLabel, '每 15 分钟');
  assert.equal(viewModel.syncButtonEnabled, true);
});

test('同步失败时保留错误消息并允许重试', () => {
  const viewModel = createSyncStatusViewModel({
    testMode: false,
    feishuConfig: { appId: 'cli_xxx', appSecret: 'secret', appToken: 'token', tableId: 'tbl' },
    syncStatus: { status: 'error', message: 'token invalid' },
    syncTime: NOW - 3 * 24 * 60 * 60 * 1000,
    now: NOW
  });

  assert.equal(viewModel.statusLabel, '同步失败');
  assert.equal(viewModel.statusTone, 'error');
  assert.equal(viewModel.messageLabel, 'token invalid');
  assert.equal(viewModel.lastSyncLabel, '3 天前');
  assert.equal(viewModel.syncButtonEnabled, true);
});
