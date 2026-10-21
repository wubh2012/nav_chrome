/** Service Worker 的 DOM 解析与图片解码桥；目标 HTML 不插入活动页面。 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.chrome?.runtime?.onMessage) {
    root.chrome.runtime.onMessage.addListener((message, sender, respond) => {
      if (message?.target !== 'site-icon-offscreen' || sender.id !== root.chrome.runtime.id) return false;
      api.handle(message).then(respond).catch(() => respond(null));
      return true;
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';
  const core = root.SiteIconCore || (typeof require === 'function' ? require('./modules/site-icon-core.js') : null);
  function sizes(value) {
    return Math.max(0, ...String(value || '').split(/\s+/).map(token => {
      const match = /^(\d+)x(\d+)$/i.exec(token);
      return match ? Math.min(Number(match[1]), Number(match[2])) : 0;
    }));
  }

  function parsePage(html, pageUrl) {
    const doc = new root.DOMParser().parseFromString(String(html), 'text/html');
    const base = core.httpUrl(doc.querySelector('base[href]')?.getAttribute('href'), pageUrl) || pageUrl;
    const candidates = [], manifests = [];
    for (const link of doc.querySelectorAll('link[href]')) {
      const rel = (link.getAttribute('rel') || '').toLowerCase().split(/\s+/);
      const url = core.httpUrl(link.getAttribute('href'), base);
      if (!url) continue;
      if (rel.includes('manifest')) manifests.push(url);
      else if (rel.includes('icon') || rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) {
        candidates.push({ url, kind: rel.includes('icon') ? 'html' : 'apple', size: sizes(link.getAttribute('sizes')) });
      }
    }
    return { candidates: core.dedupe(candidates), manifests: [...new Set(manifests)].slice(0, 2) };
  }

  function parseManifest(text, base) {
    try {
      const icons = JSON.parse(text).icons;
      if (!Array.isArray(icons)) return [];
      return icons.slice(0, 32).flatMap(icon => {
        if (String(icon?.purpose || '').toLowerCase().split(/\s+/).includes('monochrome')) return [];
        const url = core.httpUrl(icon?.src, base);
        return url ? [{ url, kind: 'manifest', size: sizes(icon.sizes) }] : [];
      });
    } catch (_) { return []; }
  }

  async function inspect(bytes, mimeType) {
    if (!Array.isArray(bytes) || !bytes.length || bytes.length > core.MAX_ICON_BYTES) return null;
    const blob = new Blob([Uint8Array.from(bytes)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const image = new root.Image();
    let timer;
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        timer = setTimeout(() => reject(new Error('图片解码超时')), 1500);
        image.src = url;
      });
      return { width: image.naturalWidth, height: image.naturalHeight };
    } catch (_) { return null; }
    finally {
      clearTimeout(timer);
      image.onload = image.onerror = null;
      image.removeAttribute('src');
      URL.revokeObjectURL(url);
    }
  }

  async function handle(message) {
    if (message.action === 'page') return parsePage(message.text, message.url);
    if (message.action === 'manifest') return parseManifest(message.text, message.url);
    if (message.action === 'inspect') return inspect(message.bytes, message.mimeType);
    return null;
  }
  return { parsePage, parseManifest, inspect, handle };
});
