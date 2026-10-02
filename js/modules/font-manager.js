/* 首页字体偏好：仅接受内置字体，持久化并监听其他扩展页的修改。 */
const FontManager = (() => {
  'use strict';
  const KEY = 'chromeNav_typography_v1';
  const fallback = '"Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif';
  const fonts = Object.freeze({
    system: { name: '系统黑体', family: fallback },
    wenkai: { name: '霞鹜文楷 TC', family: 'NavWenKai, ' + fallback, face: 'NavWenKai' },
    kuaile: { name: '站酷快乐体', family: 'NavKuaiLe, ' + fallback, face: 'NavKuaiLe' },
    pixel: { name: '缝合像素', family: 'NavPixel, ' + fallback, face: 'NavPixel' }
  });
  const defaults = Object.freeze({ body: 'wenkai', size: 16 });
  let current = { ...defaults };
  let listening = false;
  function normalize(value) {
    value = value && typeof value === 'object' ? value : {};
    const size = Number(value.size);
    return {
      body: Object.hasOwn(fonts, value.body) ? value.body : defaults.body,
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
  async function init() {
    if (!listening && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && Object.hasOwn(changes, KEY)) apply(changes[KEY].newValue);
      });
      listening = true;
    }
    try { return apply((await Storage.get(KEY))[KEY]); }
    catch (error) { console.warn('读取字体偏好失败，使用默认字体。'); return apply(defaults); }
  }
  async function save(value) {
    const config = normalize(value);
    await Storage.set({ [KEY]: config });
    return apply(config);
  }
  async function loadFont(id) {
    const face = fonts[id]?.face;
    if (!face) return;
    const loaded = await document.fonts.load('16px ' + face, '水果导航中文网站 GitHub');
    if (!loaded.length) throw new Error('字体资源未加载');
  }
  return { KEY, fonts, defaults, normalize, init, save, loadFont, get: () => ({ ...current }) };
})();
