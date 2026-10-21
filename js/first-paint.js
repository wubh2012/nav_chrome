/** 首屏外观的小型同步镜像。chrome.storage / IndexedDB 仍是正式设置来源。 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FirstPaint = api.create(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const KEY = 'chromeNav_firstPaint_v1';
  const TTL = 30 * 24 * 60 * 60 * 1000;
  const PREVIEW_LIMIT = 160 * 1024;
  const WOOD_COLORS = ['wood', 'wood-hover', 'wood-edge', 'wood-bottom', 'wood-ink', 'wood-knot'];
  const validTime = (value, now) => Number.isFinite(value) && value > 0 && value <= now + 60000 && now - value <= TTL;
  const safeValue = value => typeof value === 'string' && value.length <= 240
    && /^[-#a-zA-Z0-9(),.%\s]+$/.test(value) && !/\b(?:url|expression)\s*\(/i.test(value);
  const safeColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const validPreview = value => typeof value === 'string' && value.length <= PREVIEW_LIMIT
    && /^data:image\/(?:webp|jpeg|png);base64,[a-zA-Z0-9+/]+=*$/.test(value);

  function normalizeWood(value) {
    if (!value || typeof value !== 'object') return null;
    const result = {};
    for (const key of WOOD_COLORS) {
      if (!safeColor(value[key])) return null;
      result[key] = value[key];
    }
    for (const [key, min, max] of [['grain', 0, 100], ['fontWeight', 300, 800], ['fontSize', 14, 20]]) {
      if (!Number.isFinite(value[key]) || value[key] < min || value[key] > max) return null;
      result[key] = value[key];
    }
    return result;
  }

  function normalize(value, now = Date.now()) {
    if (!value || value.version !== 1 || !validTime(value.updatedAt, now)) return null;
    const theme = value.theme;
    if (!theme || !['cream', 'graphite'].includes(theme.skin) || !['light', 'dark'].includes(theme.mode)) return null;
    const vars = {};
    for (const [name, content] of Object.entries(theme.vars || {}).slice(0, 96)) {
      if (/^--[a-z][a-z0-9-]{0,63}$/.test(name) && !name.startsWith('--first-paint-') && safeValue(content)) vars[name] = content;
    }
    const result = { version: 1, updatedAt: value.updatedAt, theme: { skin: theme.skin, mode: theme.mode, vars },
      color: safeColor(value.color) ? value.color : theme.mode === 'dark' ? '#192940' : '#def0fa',
      layout: value.layout === 'classic' ? 'classic' : 'wooden', backgrounds: {}, wood: {} };
    for (const mode of ['light', 'dark']) {
      const entry = value.backgrounds?.[mode];
      if (entry && validTime(entry.createdAt, now) && validPreview(entry.preview)
        && typeof entry.signature === 'string' && entry.signature.length < 8192) {
        result.backgrounds[mode] = { signature: entry.signature, preview: entry.preview, createdAt: entry.createdAt,
          size: entry.size === 'contain' ? 'contain' : 'cover',
          position: safeValue(entry.position) ? entry.position : 'center center',
          overlayOpacity: Number.isFinite(entry.overlayOpacity) ? Math.max(0, Math.min(0.85, entry.overlayOpacity)) : 0.38,
          blurPx: Number.isFinite(entry.blurPx) ? Math.max(0, Math.min(24, entry.blurPx)) : 0 };
      }
      const wood = normalizeWood(value.wood?.[mode]);
      if (wood) result.wood[mode] = wood;
    }
    return result;
  }

  function signature(settings) {
    return JSON.stringify([settings.mode, settings.url || '', settings.updatedAt || 0,
      settings.size, settings.position, settings.overlayOpacity, settings.blurPx]);
  }

  function create(env) {
    const doc = env.document;
    const root = doc.documentElement;
    const isPage = root.hasAttribute('data-first-paint-page');
    const now = () => env.Date?.now?.() || Date.now();
    const timers = new Set();
    const controllers = new Map();
    let epoch = 0;
    let phase = 'idle';
    let forceTimer;
    let fadeTimer;
    const captureTokens = { light: 0, dark: 0 };
    const raf = callback => env.requestAnimationFrame ? env.requestAnimationFrame(callback) : env.setTimeout(callback, 16);
    function later(callback, delay) {
      const id = env.setTimeout(() => { timers.delete(id); callback(); }, delay);
      timers.add(id);
      return id;
    }
    function cancel(id) { env.clearTimeout(id); timers.delete(id); }
    function empty() {
      return { version: 1, updatedAt: now(), theme: { skin: 'cream', mode: 'light', vars: {} },
        color: '#def0fa', layout: 'wooden', backgrounds: {}, wood: {} };
    }
    function read() {
      try {
        const text = env.localStorage.getItem(KEY);
        return text && text.length < 400 * 1024 ? normalize(JSON.parse(text), now()) : null;
      } catch (_) { return null; }
    }
    let state = read();
    function write(update) {
      state = read() || state || empty();
      update(state);
      state.updatedAt = now();
      try { env.localStorage.setItem(KEY, JSON.stringify(state)); return true; }
      catch (_) { return false; }
    }

    function cleanupPreview() {
      cancel(forceTimer); cancel(fadeTimer);
      phase = 'done';
      delete root.dataset.firstPaint;
      delete root.dataset.firstPaintImage;
      for (const key of ['image', 'size', 'position', 'overlay', 'blur']) root.style.removeProperty('--first-paint-' + key);
      const realImage = doc.querySelector('.background-image-layer');
      if (!realImage?.classList.contains('is-visible')) doc.body?.classList.remove('has-custom-background');
    }
    function finish({ immediate = false } = {}) {
      if (phase !== 'armed' && phase !== 'fading') return;
      if (immediate) { cleanupPreview(); return; }
      if (phase === 'fading') return;
      phase = 'fading';
      raf(() => raf(() => {
        if (phase !== 'fading') return;
        root.dataset.firstPaint = 'fading';
        const reduced = env.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduced) cleanupPreview();
        else fadeTimer = later(cleanupPreview, 220);
      }));
    }

    function arm() {
      if (!state || !isPage) return;
      root.dataset.skin = state.theme.skin;
      root.dataset.theme = state.theme.mode;
      root.dataset.homeLayout = state.layout;
      root.style.colorScheme = state.theme.mode;
      root.style.backgroundColor = state.color;
      for (const [name, value] of Object.entries(state.theme.vars)) root.style.setProperty(name, value);
      phase = 'armed';
      root.dataset.firstPaint = 'armed';
      const entry = state.backgrounds[state.theme.mode];
      if (entry) {
        root.dataset.firstPaintImage = '1';
        root.style.setProperty('--first-paint-image', `url("${entry.preview}")`);
        root.style.setProperty('--first-paint-size', entry.size);
        root.style.setProperty('--first-paint-position', entry.position);
        root.style.setProperty('--first-paint-overlay', String(entry.overlayOpacity));
        root.style.setProperty('--first-paint-blur', `${entry.blurPx}px`);
      }
      // 慢网络、初始化异常或后台标签页中都不永久保留预览。
      forceTimer = later(cleanupPreview, 3000);
    }

    function applyBody() {
      if (!state || !isPage || !doc.body) return;
      if (root.dataset.firstPaintImage === '1') doc.body.classList.add('has-custom-background');
      const palette = state.wood[state.theme.mode];
      if (palette) {
        WOOD_COLORS.forEach(key => doc.body.style.setProperty('--' + key, palette[key]));
        doc.body.style.setProperty('--wood-grain', palette.grain / 100);
        doc.body.style.setProperty('--wood-font-weight', palette.fontWeight);
        doc.body.style.setProperty('--wood-font-size', palette.fontSize + 'px');
      }
    }

    function rememberTheme(skin, mode, vars) {
      if (isPage && state && state.theme.mode !== mode) finish({ immediate: true });
      const color = env.getComputedStyle?.(doc.body || root).getPropertyValue('--page-bg').trim();
      if (state && state.theme.skin === skin && state.theme.mode === mode
        && JSON.stringify(state.theme.vars) === JSON.stringify(vars)
        && (!safeColor(color) || state.color === color) && now() - state.updatedAt < 24 * 60 * 60 * 1000) return;
      write(snapshot => {
        snapshot.theme = { skin, mode, vars: { ...vars } };
        snapshot.color = safeColor(color) ? color : vars['--page-bg'];
      });
      if (isPage && safeColor(state.color)) root.style.backgroundColor = state.color;
    }
    function rememberLayout(layout) {
      const next = layout === 'classic' ? 'classic' : 'wooden';
      if (state?.layout !== next) write(snapshot => { snapshot.layout = next; });
    }
    function rememberWood(mode, palette) {
      const normalized = normalizeWood(palette);
      const name = mode === 'dark' ? 'dark' : 'light';
      if (normalized && JSON.stringify(state?.wood[name]) !== JSON.stringify(normalized)) {
        write(snapshot => { snapshot.wood[name] = normalized; });
      }
    }
    function getWood(mode) { return (read() || state)?.wood[mode] || null; }

    function clearBackground(mode) {
      captureTokens[mode]++;
      for (const [controller, target] of controllers) if (target === mode) controller.abort();
      // 清理镜像不应在第一次打开设置页时凭空创建一个默认首屏偏好。
      if ((read() || state)?.backgrounds[mode]) write(snapshot => { delete snapshot.backgrounds[mode]; });
    }

    async function fetchBlob(url, mode) {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) return null;
      const controller = new env.AbortController();
      controllers.set(controller, mode);
      const timer = later(() => controller.abort(), 2500);
      let reader;
      try {
        const response = await env.fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'force-cache' });
        if (!response.ok || !/^image\//i.test(response.headers.get('content-type') || '')
          || Number(response.headers.get('content-length') || 0) > 8 * 1024 * 1024) return null;
        const parts = [];
        let length = 0;
        reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 8 * 1024 * 1024) { controller.abort(); return null; }
          parts.push(value);
        }
        return new env.Blob(parts, { type: response.headers.get('content-type') });
      } catch (_) { return null; }
      finally {
        cancel(timer);
        controllers.delete(controller);
        if (reader) { try { await reader.cancel(); } catch (_) { /* 请求已取消 */ } }
      }
    }

    async function captureBackground({ mode, settings, image, readable, isCurrent = () => true }) {
      const token = ++captureTokens[mode], capturedEpoch = epoch;
      const valid = () => epoch === capturedEpoch && captureTokens[mode] === token && isCurrent();
      const existing = (read() || state)?.backgrounds[mode];
      const key = signature(settings);
      if (existing?.signature === key) return;
      let bitmap;
      try {
        // 等首屏绘制后再生成缩略图；远程图片不能直接读 canvas，需先读取图片字节。
        await new Promise(resolve => later(resolve, 0));
        if (!valid()) return;
        let source = image;
        if (!readable) {
          const blob = await fetchBlob(settings.url, mode);
          if (!blob || !valid()) return;
          bitmap = await env.createImageBitmap(blob);
          source = bitmap;
        }
        if (!valid()) return;
        const width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
        if (!width || !height) return;
        const canvas = doc.createElement('canvas');
        let preview = '';
        for (const [limit, quality] of [[640, 0.65], [320, 0.45]]) {
          const scale = Math.min(1, limit / width, limit * 0.75 / height);
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
          preview = canvas.toDataURL('image/webp', quality);
          if (validPreview(preview)) break;
        }
        if (!valid() || !validPreview(preview)) return;
        write(snapshot => { snapshot.backgrounds[mode] = { signature: key, preview, createdAt: now(),
          size: settings.size, position: settings.position, overlayOpacity: settings.overlayOpacity, blurPx: settings.blurPx }; });
      } catch (_) { /* 无配额、解码或网络失败时继续使用主题底色，不影响正式背景。 */ }
      finally { bitmap?.close(); }
    }

    function backgroundReady(details) {
      finish();
      if (details.settings.mode === 'default') clearBackground(details.mode);
      else void captureBackground(details);
    }
    function clear() {
      epoch++;
      for (const controller of controllers.keys()) controller.abort();
      state = null;
      try { env.localStorage.removeItem(KEY); } catch (_) { /* 存储不可用 */ }
      finish({ immediate: true });
    }

    env.chrome?.storage?.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      const change = changes.chromeNav_backgroundSettings;
      if (change) {
        for (const mode of ['light', 'dark']) {
          if (JSON.stringify(change.oldValue?.profiles?.[mode]) !== JSON.stringify(change.newValue?.profiles?.[mode])) clearBackground(mode);
        }
      }
    });
    env.addEventListener?.('storage', event => {
      if (event.key === KEY && !event.newValue) {
        epoch++; state = null;
        for (const controller of controllers.keys()) controller.abort();
      }
    });
    env.addEventListener?.('pagehide', () => {
      epoch++;
      for (const controller of controllers.keys()) controller.abort();
      finish({ immediate: true });
      for (const id of timers) env.clearTimeout(id);
      timers.clear();
    });
    arm();
    return { applyBody, rememberTheme, rememberLayout, rememberWood, getWood, backgroundReady, clearBackground, clear, finish };
  }
  return { create, normalize, signature, KEY, TTL, PREVIEW_LIMIT };
});
