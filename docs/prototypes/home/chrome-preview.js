// 仅供开发服务器预览扩展页面。浏览器预览数据与真实扩展存储隔离。
(() => {
  const state = { chromeNav_testMode: true };
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
        changesEvent.emit(changes);
        callback?.(); return Promise.resolve();
      },
      remove(keys, callback) { (Array.isArray(keys) ? keys : [keys]).forEach(key => delete state[key]); callback?.(); return Promise.resolve(); },
      clear(callback) { Object.keys(state).forEach(key => delete state[key]); localStorage.removeItem(fontPreviewKey); localStorage.removeItem(previewKey); changesEvent.emit({[fontKey]:{newValue:undefined}}); callback?.(); return Promise.resolve(); }
    }, onChanged: changesEvent },
    runtime: { id: 'prototype-only', onMessage: event(), getURL: file => '/' + file,
      openOptionsPage() { window.open('/options.html','_blank','noopener'); },
      sendMessage(message, callback) { callback?.({ success: true }); return Promise.resolve({ success: true }); } },
    tabs: { create({ url }) { window.open(url, '_blank', 'noopener'); } },
    alarms: { onAlarm: event(), create: async () => {}, clear: async () => true }
  };
})();
