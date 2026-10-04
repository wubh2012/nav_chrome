/* 原型从实际导航快照初始化；所有改动仅保存在页面内存，不调用飞书。 */
(() => {
  'use strict';
  const state = { chromeNav_testMode: true, chromeNav_shortcutHintShown: true,
    chromeNav_typography_v1: { body: 'wenkaiGb', size: 16 }, chromeNav_theme: { skin: 'cream', mode: 'light' } };
  const nativeChrome = location.protocol === 'chrome-extension:' ? window.chrome : null;
  const event = () => {
    const listeners = new Set();
    return { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); },
      emit(changes) { listeners.forEach(fn => fn(changes, 'local')); } };
  };
  const changesEvent = event();
  function prefix(scope) {
    let hash = 2166136261;
    for (const character of String(scope)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return `chromeNav_scopedNav_${(hash >>> 0).toString(36)}`;
  }
  function seed(snapshot) {
    if (!snapshot?.data || !Array.isArray(snapshot.categories)) return;
    const key = prefix('test-mode');
    Object.assign(state, { [key + '_data']: snapshot.data, [key + '_categories']: snapshot.categories,
      [key + '_revision']: 1, [key + '_syncTime']: Date.now() });
    document.documentElement.dataset.prototypeDataSource = snapshot.source || 'extension-snapshot';
  }
  seed(window.OrchardPrototypeData);
  const ready = (async () => {
    if (!nativeChrome?.storage?.local) return;
    try {
      const configState = await nativeChrome.storage.local.get(['chromeNav_feishuConfig', 'chromeNav_testMode']);
      const config = configState.chromeNav_feishuConfig || {};
      const scope = configState.chromeNav_testMode ? 'test-mode' : `${config.appToken || 'unconfigured'}:${config.tableId || 'default'}`;
      const key = prefix(scope);
      const saved = await nativeChrome.storage.local.get([key + '_data', key + '_categories',
        'chromeNav_navData', 'chromeNav_categories']);
      const data = saved[key + '_data'] || saved.chromeNav_navData;
      if (data) seed({ data, categories: saved[key + '_categories'] || saved.chromeNav_categories || Object.keys(data), source: 'extension-live' });
    } catch (_error) { console.warn('[OrchardPrototype] 使用已保存的导航快照'); }
  })();
  const mockChrome = {
    storage: { local: {
      async get(keys, callback) {
        await ready;
        const value = keys == null ? { ...state } : Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys]).filter(key => key in state).map(key => [key, state[key]]));
        callback?.(value); return value;
      },
      async set(items, callback) {
        await ready;
        const changes = Object.fromEntries(Object.entries(items).map(([key, value]) => [key, { oldValue: state[key], newValue: value }]));
        Object.assign(state, items); changesEvent.emit(changes); callback?.();
      },
      async remove(keys, callback) { await ready; (Array.isArray(keys) ? keys : [keys]).forEach(key => delete state[key]); callback?.(); },
      async clear(callback) { await ready; Object.keys(state).forEach(key => delete state[key]); callback?.(); }
    }, onChanged: changesEvent },
    runtime: { id: 'orchard-prototype', onMessage: event(),
      getURL: file => new URL(file, document.baseURI).href,
      openOptionsPage() { document.getElementById('prototype-settings')?.showModal(); },
      async sendMessage(message, callback) {
        await ready;
        let response = { success: true };
        if (message?.type === 'COMMIT_NAV_DATA') {
          const key = prefix(message.dataScope || 'test-mode');
          const currentRevision = Number(state[key + '_revision'] || 0);
          if (currentRevision !== Number(message.expectedRevision || 0)) {
            response = { success: false, conflict: true, current: { data: state[key + '_data'],
              categories: state[key + '_categories'], revision: currentRevision } };
          } else {
            const revision = currentRevision + 1;
            await mockChrome.storage.local.set({ [key + '_data']: message.data,
              [key + '_categories']: message.categories, [key + '_dateInfo']: message.dateInfo,
              [key + '_revision']: revision, [key + '_syncTime']: Date.now() });
            response = { success: true, revision };
          }
        }
        callback?.(response); return response;
      }
    },
    tabs: { create({ url }) { window.open(url, '_blank', 'noopener'); } },
    alarms: { onAlarm: event(), create: async () => {}, clear: async () => true }
  };
  window.chrome = mockChrome;
  document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.getElementById('prototype-settings');
    const font = document.getElementById('prototype-font');
    const size = document.getElementById('prototype-font-size');
    document.getElementById('open-settings-btn')?.addEventListener('click', () => {
      const current = FontManager.get(); font.value = current.body; size.value = current.size;
    });
    document.getElementById('prototype-close-settings')?.addEventListener('click', () => dialog.close());
    const apply = () => FontManager.save({ body: font.value, size: Number(size.value) });
    font?.addEventListener('change', apply); size?.addEventListener('input', apply);
    dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  });
})();
