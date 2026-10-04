#!/usr/bin/env node

/**
 * Reorder Feishu Bitable site records using the existing category and site sort.
 * Reads credentials from .env.local (ignored by Git) or the process environment.
 * Dry-run by default; pass --apply to update the Feishu table.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = resolve(ROOT, '.env.local');
const API_BASE = 'https://open.feishu.cn/open-apis';
const PAGE_SIZE = 100;
const BATCH_SIZE = 100;
const START_SORT = 100;
const SORT_STEP = 10;
const FIELD_CATEGORY = '分类';
const FIELD_SORT = '排序';
const CATEGORY_PRIORITY = Object.freeze({
  '主页': 1,
  'AI': 2,
  'Code': 3,
  '影视': 5
});

function loadEnvFile(contents) {
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] != null) continue;

    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function getRequiredConfig() {
  const config = {
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    appToken: process.env.FEISHU_APP_TOKEN,
    tableId: process.env.FEISHU_TABLE_ID
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    throw new Error(`缺少配置：${missing.join(', ')}。请在 .env.local 中填写 FEISHU_APP_ID、FEISHU_APP_SECRET、FEISHU_APP_TOKEN、FEISHU_TABLE_ID。`);
  }
  return config;
}

async function readJson(response, context) {
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`${context}：飞书返回了无效 JSON（HTTP ${response.status}）`);
  }

  if (!response.ok || result.code !== 0) {
    const detail = result.msg || result.error?.message || `HTTP ${response.status}`;
    throw new Error(`${context}：${detail}`);
  }
  return result;
}

async function getTenantAccessToken(config) {
  const response = await fetch(`${API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret })
  });
  const result = await readJson(response, '获取飞书 tenant_access_token 失败');
  if (!result.tenant_access_token) throw new Error('飞书没有返回 tenant_access_token');
  return result.tenant_access_token;
}

function recordsUrl(config, pageToken) {
  const url = new URL(
    `${API_BASE}/bitable/v1/apps/${encodeURIComponent(config.appToken)}`
      + `/tables/${encodeURIComponent(config.tableId)}/records`
  );
  url.searchParams.set('page_size', String(PAGE_SIZE));
  if (pageToken) url.searchParams.set('page_token', pageToken);
  return url;
}

async function listAllRecords(config, token) {
  const records = [];
  const seenPageTokens = new Set();
  let pageToken = '';

  do {
    const response = await fetch(recordsUrl(config, pageToken), {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await readJson(response, '读取飞书多维表格记录失败');
    const data = result.data || {};
    records.push(...(Array.isArray(data.items) ? data.items : []));

    if (!data.has_more) break;
    pageToken = String(data.page_token || '');
    if (!pageToken || seenPageTokens.has(pageToken)) {
      throw new Error('飞书分页状态异常，停止读取以避免漏掉记录');
    }
    seenPageTokens.add(pageToken);
  } while (true);

  return records;
}

function readCategory(record) {
  const value = record.fields?.[FIELD_CATEGORY];
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim() || '未分类';
  if (value && typeof value === 'object') {
    const label = value.text || value.name || value.value;
    if (label != null) return String(label).trim() || '未分类';
  }
  return '未分类';
}

function readSort(record) {
  const value = record.fields?.[FIELD_SORT];
  const number = Number(value);
  return value !== null && value !== '' && Number.isFinite(number) ? number : null;
}

function compareCategories(left, right) {
  const priorityDiff = (CATEGORY_PRIORITY[left] || 4) - (CATEGORY_PRIORITY[right] || 4);
  return priorityDiff || left.localeCompare(right, 'zh-Hans-CN');
}

function makePlan(records) {
  const grouped = new Map();
  records.forEach((record, index) => {
    if (!record?.record_id) throw new Error(`飞书第 ${index + 1} 条记录缺少 record_id，停止更新`);
    const category = readCategory(record);
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push({ record, index, oldSort: readSort(record) });
  });

  const plan = [];
  const categorySummaries = [];
  let nextSort = START_SORT;

  for (const category of [...grouped.keys()].sort(compareCategories)) {
    const items = grouped.get(category).sort((left, right) => {
      if (left.oldSort == null && right.oldSort != null) return 1;
      if (left.oldSort != null && right.oldSort == null) return -1;
      if (left.oldSort != null && right.oldSort != null && left.oldSort !== right.oldSort) {
        return left.oldSort - right.oldSort;
      }
      return left.index - right.index;
    });

    const firstSort = nextSort;
    for (const item of items) {
      plan.push({
        recordId: item.record.record_id,
        category,
        oldSort: item.oldSort,
        sort: nextSort
      });
      nextSort += SORT_STEP;
    }
    categorySummaries.push({ category, count: items.length, firstSort, lastSort: nextSort - SORT_STEP });
  }

  return { plan, categorySummaries };
}

async function updateRecords(config, token, updates) {
  for (let offset = 0; offset < updates.length; offset += BATCH_SIZE) {
    const batch = updates.slice(offset, offset + BATCH_SIZE);
    const url = `${API_BASE}/bitable/v1/apps/${encodeURIComponent(config.appToken)}`
      + `/tables/${encodeURIComponent(config.tableId)}/records/batch_update`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        records: batch.map(item => ({
          record_id: item.recordId,
          fields: { [FIELD_SORT]: item.sort }
        }))
      })
    });
    await readJson(response, `批量更新失败（第 ${Math.floor(offset / BATCH_SIZE) + 1} 批）`);
    console.log(`已提交 ${Math.min(offset + batch.length, updates.length)} / ${updates.length} 条`);
  }
}

async function verifyUpdates(config, token, plan) {
  const freshRecords = await listAllRecords(config, token);
  const sortById = new Map(freshRecords.map(record => [record.record_id, readSort(record)]));
  const mismatches = plan.filter(item => sortById.get(item.recordId) !== item.sort);
  if (mismatches.length) {
    throw new Error(`写入后校验发现 ${mismatches.length} 条排序值不一致`);
  }
}

async function main() {
  try {
    try {
      loadEnvFile(await readFile(ENV_FILE, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const apply = process.argv.includes('--apply');
    const unknownArgs = process.argv.slice(2).filter(argument => argument !== '--apply');
    if (unknownArgs.length) throw new Error(`不支持的参数：${unknownArgs.join(' ')}`);

    const config = getRequiredConfig();
    const token = await getTenantAccessToken(config);
    const records = await listAllRecords(config, token);
    if (!records.length) throw new Error('飞书表格没有记录，未执行任何更新');

    const { plan, categorySummaries } = makePlan(records);
    const updates = plan.filter(item => item.oldSort !== item.sort);

    console.log(`共读取 ${records.length} 条记录；按原分类顺序、分类内原排序排列。`);
    for (const summary of categorySummaries) {
      console.log(`- ${summary.category}: ${summary.count} 条，排序 ${summary.firstSort}–${summary.lastSort}`);
    }
    console.log(`需要更新 ${updates.length} 条；起始值 ${START_SORT}，步长 ${SORT_STEP}。`);

    if (!apply) {
      console.log('当前为预览模式，没有写入飞书。确认后运行：node scripts/reorder-feishu-sort.mjs --apply');
      return;
    }

    if (updates.length) await updateRecords(config, token, updates);
    await verifyUpdates(config, token, plan);
    console.log(`完成并校验通过：${plan.length} 条记录的排序字段按 100、110、120… 全局递增。`);
  } catch (error) {
    console.error(`失败：${error.message}`);
    process.exitCode = 1;
  }
}

main();
