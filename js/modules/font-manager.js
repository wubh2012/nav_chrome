/* 首页字体偏好：限制为已登记字体，持久化并监听其他扩展页的修改。 */
const FontManager = (() => {
  'use strict';
  const KEY = 'chromeNav_typography_v1';
  const fallback = '"Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif';
  const stylesheets = new Map();
  const fonts = Object.freeze({
    system: { name: '系统黑体', family: fallback },
    kuaile: { name: '站酷快乐体', family: 'NavKuaiLe, ' + fallback, face: 'NavKuaiLe' },
    pixel: { name: '缝合像素', family: 'NavPixel, ' + fallback, face: 'NavPixel' },
    notoSerif: {
      name: '思源宋体 SC', family: '"Noto Serif SC", ' + fallback, face: 'Noto Serif SC',
      stylesheet: 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&display=swap'
    },
    notoSans: {
      name: '思源黑体 SC', family: '"Noto Sans SC", ' + fallback, face: 'Noto Sans SC',
      stylesheet: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap'
    },
    smiley: {
      name: '得意黑', family: '"Smiley Sans Oblique", ' + fallback, face: 'Smiley Sans Oblique',
      stylesheet: 'https://fontsapi.zeoseven.com/92/main/result.css'
    },
    wenkaiGb: {
      name: '霞鹜文楷 GB', family: '"LXGW WenKai GB", ' + fallback, face: 'LXGW WenKai GB',
      stylesheet: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-gb-web@1.522.0/lxgwwenkaigb-regular/result.css'
    }
  });
  const defaults = Object.freeze({ body: 'wenkaiGb', size: 16 });
  let current = { ...defaults };
  let listening = false;
  function normalize(value) {
    value = value && typeof value === 'object' ? value : {};
    const size = Number(value.size);
    // 兼容旧版内置霞鹜文楷 TC 偏好，迁移到在线简体版。
    const body = value.body === 'wenkai' ? 'wenkaiGb' : value.body;
    return {
      body: Object.hasOwn(fonts, body) ? body : defaults.body,
      size: Number.isFinite(size) ? Math.max(14, Math.min(20, Math.round(size))) : defaults.size
    };
  }
  function apply(value) {
    current = normalize(value);
    const style = document.documentElement.style;
    style.setProperty('--navigation-font', fonts[current.body].family);
    style.setProperty('--navigation-heading-font', fonts[current.body].family);
    style.setProperty('--navigation-text-size', current.size + 'px');
    document.documentElement.dataset.navigationFont = current.body;
    window.dispatchEvent(new CustomEvent('chromeNav:typographyChanged', { detail: { ...current } }));
    return { ...current };
  }
  function applyAndLoad(value) {
    const config = apply(value);
    if (fonts[config.body].stylesheet) loadFont(config.body).catch(() => {});
    return config;
  }
  function loadStylesheet(id, href) {
    if (stylesheets.has(id)) return stylesheets.get(id);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.fontStylesheet = id;
    const loading = new Promise((resolve, reject) => {
      link.onload = resolve;
      link.onerror = () => {
        stylesheets.delete(id);
        link.remove();
        reject(new Error('在线字体样式加载失败'));
      };
    });
    stylesheets.set(id, loading);
    document.head.appendChild(link);
    return loading;
  }
  async function init() {
    if (!listening && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && Object.hasOwn(changes, KEY)) applyAndLoad(changes[KEY].newValue);
      });
      listening = true;
    }
    try { return applyAndLoad((await Storage.get(KEY))[KEY]); }
    catch (error) { console.warn('读取字体偏好失败，使用默认字体。'); return apply(defaults); }
  }
  async function save(value) {
    const config = normalize(value);
    await Storage.set({ [KEY]: config });
    return applyAndLoad(config);
  }
  async function loadFont(id) {
    const font = fonts[id];
    if (!font) return;
    if (font.stylesheet) await loadStylesheet(id, font.stylesheet);
    const face = font.face;
    if (!face) return;
    const loaded = await document.fonts.load('16px ' + JSON.stringify(face), '水果导航中文网站 GitHub');
    if (!loaded.length) throw new Error('字体资源未加载');
  }
  return { KEY, fonts, defaults, normalize, init, save, loadFont, get: () => ({ ...current }) };
})();
