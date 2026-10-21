/** 首页、搜索和编辑预览共用的图标加载器；通过后台获取并持久缓存图片。 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SiteLogoManager = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';
  const core = root.SiteIconCore || (typeof require === 'function' ? require('./site-icon-core.js') : null);
  const states = new WeakMap();
  const active = new Set();
  const requests = new Map();

  function release(image) {
    const state = states.get(image);
    if (!state) return;
    states.delete(image);
    active.delete(image);
    clearTimeout(state.timer);
    image.onload = image.onerror = null;
    image.removeAttribute('src');
    state.placeholder?.remove();
    if (state.objectUrl) root.URL.revokeObjectURL(state.objectUrl);
    state.cancel?.();
  }

  function releaseWithin(container) {
    if (!container) return;
    if (states.has(container)) release(container);
    container.querySelectorAll?.('img').forEach(release);
  }

  function request(site, force) {
    const customIcon = core.getCustomIcon(site);
    const key = `${core.cacheKey(site.url, customIcon)}|${Boolean(force)}`;
    if (!requests.has(key)) {
      const promise = Promise.resolve().then(() => root.chrome.runtime.sendMessage({
        type: 'GET_SITE_ICON', url: site.url, customIcon, force: Boolean(force)
      }));
      requests.set(key, promise);
      promise.finally(() => { if (requests.get(key) === promise) requests.delete(key); }).catch(() => {});
    }
    return requests.get(key);
  }

  async function load(image, site, { onStatus, force = false, placeholder = true } = {}) {
    release(image);
    const state = { site, options: { onStatus, placeholder } };
    states.set(image, state);
    active.add(image);
    image.hidden = true;
    image.referrerPolicy = 'no-referrer';
    const holder = image.parentElement;
    const current = () => states.get(image) === state;
    const status = (value, detail) => {
      if (!current()) return;
      if (holder) holder.dataset.logoStatus = value;
      onStatus?.(value, detail);
    };
    if (placeholder && holder) {
      state.placeholder = root.document.createElement('span');
      state.placeholder.className = 'logo-fallback';
      state.placeholder.textContent = Array.from(String(site?.name || '网站').trim())[0]?.toUpperCase() || '网';
      state.placeholder.setAttribute('aria-hidden', 'true');
      holder.appendChild(state.placeholder);
    }
    status('loading');

    function show(source, objectUrl = false) {
      return new Promise(resolve => {
        if (!current()) { if (objectUrl) root.URL.revokeObjectURL(source); resolve(false); return; }
        if (objectUrl) state.objectUrl = source;
        const settle = success => {
          clearTimeout(state.timer);
          state.cancel = null;
          image.onload = image.onerror = null;
          if (!current()) { resolve(false); return; }
          if (success && image.naturalWidth > 0) {
            state.placeholder?.remove();
            image.hidden = false;
            resolve(true);
          } else {
            image.removeAttribute('src');
            if (state.objectUrl) { root.URL.revokeObjectURL(state.objectUrl); state.objectUrl = null; }
            resolve(false);
          }
        };
        state.cancel = () => resolve(false);
        image.onload = () => settle(true);
        image.onerror = () => settle(false);
        state.timer = setTimeout(() => settle(false), 2200);
        image.src = source;
      });
    }

    try {
      if (/^data:image\//i.test(site?.icon || '')) {
        if (await show(site.icon)) { status('loaded', { local: true }); return; }
      } else {
        const response = await request(site || {}, force);
        if (!current()) return;
        if (response?.success && Array.isArray(response.bytes) && response.bytes.length
          && response.bytes.length <= core.MAX_ICON_BYTES && /^image\//i.test(response.mimeType || '')) {
          const blob = new Blob([Uint8Array.from(response.bytes)], { type: response.mimeType });
          if (await show(root.URL.createObjectURL(blob), true)) { status('loaded', response); return; }
        }
      }
    } catch (_) { /* 扩展重载或后台不可用时保留文字回退。 */ }
    status('fallback');
  }

  if (root.addEventListener) root.addEventListener('pagehide', event => {
    if (!event.persisted) [...active].forEach(release);
  });
  function refreshVisible(url, exclude) {
    for (const image of [...active]) {
      const state = states.get(image);
      if (image !== exclude && core.httpUrl(state?.site?.url) === core.httpUrl(url)) {
        load(image, state.site, state.options);
      }
    }
  }
  return { load, release, releaseWithin, refreshVisible };
});
