/* 木牌外观的默认值、校验和本地存储；与导航数据、飞书同步独立。 */
(() => {
  const colors = ['wood', 'wood-hover', 'wood-edge', 'wood-bottom', 'wood-ink', 'wood-knot'];
  const light = Object.freeze({ wood: '#f9e9cf', 'wood-hover': '#fff2dc', 'wood-edge': '#879058', 'wood-bottom': '#c1a16a', 'wood-ink': '#234657', 'wood-knot': '#b6a06b', grain: 6, fontWeight: 600, fontSize: 17 });
  const dark = Object.freeze({ ...light, wood: '#46513d', 'wood-hover': '#536047', 'wood-edge': '#8b9c68', 'wood-bottom': '#273b28', 'wood-ink': '#f0f3dc' });
  function normalize(value, mode) {
    const result = { ...(mode === 'dark' ? dark : light) };
    if (!value || typeof value !== 'object') return result;
    colors.forEach(key => { if (/^#[0-9a-f]{6}$/i.test(value[key])) result[key] = value[key].toLowerCase(); });
    [['grain', 0, 100, 1], ['fontWeight', 300, 800, 100], ['fontSize', 14, 20, 1]].forEach(([key, min, max, step]) => {
      if (Number.isFinite(value[key])) result[key] = Math.max(min, Math.min(max, Math.round(value[key] / step) * step));
    });
    return result;
  }
  function createStore(storage) {
    const key = mode => 'chromeNav_woodAppearance_v1_' + (mode === 'dark' ? 'dark' : 'light');
    return {
      key,
      async get(mode) { const name = key(mode); return normalize((await storage.get(name))[name], mode); },
      async set(mode, value) { const normalized = normalize(value, mode); await storage.set({ [key(mode)]: normalized }); return normalized; }
    };
  }
  const api = { colors, defaults: { light, dark }, normalize, createStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.WoodAppearanceCore = api;
})();
