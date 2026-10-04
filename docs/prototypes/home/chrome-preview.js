// 仅供开发服务器预览扩展页面。浏览器预览数据与真实扩展存储隔离。
(() => {
  const state = { chromeNav_testMode: true };
  const navigationPreviewKey = 'chromeNav_previewNavigation_v1';
  try { Object.assign(state, JSON.parse(localStorage.getItem(navigationPreviewKey) || '{}')); } catch (_) {}
  const previewKey = 'chromeNav_previewGarden';
  try { state.chromeNav_pixelGarden_v1 = JSON.parse(localStorage.getItem(previewKey)); } catch (_) {}
  const fontKey = 'chromeNav_typography_v1';
  const fontPreviewKey = 'chromeNav_previewTypography';
  try { state[fontKey] = JSON.parse(localStorage.getItem(fontPreviewKey)); } catch (_) {}
  if (new URLSearchParams(location.search).get('theme') === 'dark') state.chromeNav_theme = {skin:'cream',mode:'dark'};
  const event = () => {
    const listeners = new Set();
    return { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); }, emit(changes) { listeners.forEach(fn => fn(changes, 'local')); } };
  };
  const changesEvent = event();
  function persistNavigationPreview() {
    const navigationState = Object.fromEntries(Object.entries(state).filter(([key]) =>
      key === 'chromeNav_navData' || key === 'chromeNav_categories' || key === 'chromeNav_dateInfo'
      || key === 'chromeNav_lastSyncTime' || key === 'chromeNav_navRevision'
      || key.startsWith('chromeNav_scopedNav_') || key === 'chromeNav_pendingSortSync'));
    localStorage.setItem(navigationPreviewKey, JSON.stringify(navigationState));
  }
  window.addEventListener('storage', event => {
    if (event.key !== fontPreviewKey) return;
    const oldValue = state[fontKey];
    try { state[fontKey] = JSON.parse(event.newValue); } catch (_) { delete state[fontKey]; }
    changesEvent.emit({ [fontKey]: { oldValue, newValue: state[fontKey] } });
  });
  window.chrome = {
    storage: { local: {
      get(keys, callback) {
        const result = keys == null ? { ...state } : Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys]).filter(key => key in state).map(key => [key, state[key]]));
        callback?.(result); return Promise.resolve(result);
      },
      set(items, callback) {
        const changes = Object.fromEntries(Object.entries(items).map(([key, value]) => [key, {oldValue: state[key], newValue: value}]));
        Object.assign(state, items);
        if ('chromeNav_pixelGarden_v1' in items) localStorage.setItem(previewKey,JSON.stringify(items.chromeNav_pixelGarden_v1));
        if (fontKey in items) localStorage.setItem(fontPreviewKey, JSON.stringify(items[fontKey]));
        if (Object.keys(items).some(key => key.startsWith('chromeNav_scopedNav_')
          || ['chromeNav_navData', 'chromeNav_categories', 'chromeNav_dateInfo', 'chromeNav_lastSyncTime',
            'chromeNav_navRevision', 'chromeNav_pendingSortSync'].includes(key))) persistNavigationPreview();
        changesEvent.emit(changes);
        callback?.(); return Promise.resolve();
      },
      remove(keys, callback) { (Array.isArray(keys) ? keys : [keys]).forEach(key => delete state[key]); persistNavigationPreview(); callback?.(); return Promise.resolve(); },
      clear(callback) { Object.keys(state).forEach(key => delete state[key]); localStorage.removeItem(fontPreviewKey); localStorage.removeItem(previewKey); localStorage.removeItem(navigationPreviewKey); changesEvent.emit({[fontKey]:{newValue:undefined}}); callback?.(); return Promise.resolve(); }
    }, onChanged: changesEvent },
    runtime: { id: 'prototype-only', onMessage: event(), getURL: file => '/' + file,
      openOptionsPage() { window.open('/options.html','_blank','noopener'); },
      sendMessage(message, callback) {
        if (message?.type !== 'COMMIT_NAV_DATA') {
          callback?.({ success: true }); return Promise.resolve({ success: true });
        }
        let hash = 2166136261;
        for (const character of String(message.dataScope || '')) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
        const prefix = `chromeNav_scopedNav_${(hash >>> 0).toString(36)}`;
        const revisionKey = message.dataScope ? `${prefix}_revision` : 'chromeNav_navRevision';
        const currentRevision = Number(state[revisionKey] || state.chromeNav_navRevision || 0);
        if (currentRevision !== Number(message.expectedRevision || 0)) {
          const current = message.dataScope
            ? { data: state[`${prefix}_data`], categories: state[`${prefix}_categories`], dateInfo: state[`${prefix}_dateInfo`], revision: currentRevision }
            : { data: state.chromeNav_navData, categories: state.chromeNav_categories, dateInfo: state.chromeNav_dateInfo, revision: currentRevision };
          const response = { success: false, conflict: true, current };
          callback?.(response); return Promise.resolve(response);
        }
        const dataKey = message.dataScope ? `${prefix}_data` : 'chromeNav_navData';
        const categoriesKey = message.dataScope ? `${prefix}_categories` : 'chromeNav_categories';
        const dateInfoKey = message.dataScope ? `${prefix}_dateInfo` : 'chromeNav_dateInfo';
        const syncTimeKey = message.dataScope ? `${prefix}_syncTime` : 'chromeNav_lastSyncTime';
        const nextRevision = currentRevision + 1;
        const changes = {
          [dataKey]: message.data,
          [categoriesKey]: message.categories,
          [dateInfoKey]: message.dateInfo,
          [revisionKey]: nextRevision
        };
        if (message.pendingSortSync !== undefined) {
          const pendingKey = 'chromeNav_pendingSortSync';
          const pendingState = state[pendingKey]?.scopes ? { ...state[pendingKey].scopes } : {};
          const scope = message.dataScope || '__legacy__';
          if (message.pendingSortSync) pendingState[scope] = { ...message.pendingSortSync, dataScope: scope };
          else delete pendingState[scope];
          if (Object.keys(pendingState).length) changes[pendingKey] = { version: 2, scopes: pendingState };
          else changes[pendingKey] = undefined;
        }
        if (!message.preserveSyncTime || !state[syncTimeKey]) changes[syncTimeKey] = Date.now();
        else changes[syncTimeKey] = state[syncTimeKey];
        Object.keys(changes).forEach(key => { if (changes[key] === undefined) delete changes[key]; });
        window.chrome.storage.local.set(changes, () => {
          const response = { success: true, revision: nextRevision };
          callback?.(response);
        });
        return Promise.resolve({ success: true, revision: nextRevision });
      } },
    tabs: { create({ url }) { window.open(url, '_blank', 'noopener'); } },
    alarms: { onAlarm: event(), create: async () => {}, clear: async () => true }
  };
})();
