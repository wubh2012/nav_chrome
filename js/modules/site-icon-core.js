/** 网站图标的 URL、缓存键、候选及评分；不执行网络或存储操作。 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SiteIconCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const MAX_ICON_BYTES = 512 * 1024;
  const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
  const FAILURE_TTL = 60 * 60 * 1000;

  function httpUrl(value, base) {
    if (typeof value !== 'string' || !value.trim() || value.length > 4096) return '';
    try {
      const url = new URL(value.trim(), base);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return '';
      url.hash = '';
      return url.href;
    } catch (_) { return ''; }
  }

  function isLegacyAutoIcon(icon, pageUrl) {
    try {
      const image = new URL(icon);
      const page = new URL(pageUrl);
      if (!/^(www\.)?google\.com$/i.test(image.hostname) || image.pathname !== '/s2/favicons') return false;
      const domain = image.searchParams.get('domain') || '';
      const domainUrl = image.searchParams.get('domain_url');
      return domain.toLowerCase() === page.hostname.toLowerCase()
        || (domainUrl && new URL(domainUrl).hostname === page.hostname);
    } catch (_) { return false; }
  }

  function getCustomIcon(site) {
    if (Object.prototype.hasOwnProperty.call(site || {}, 'customIcon')) return httpUrl(site.customIcon);
    const icon = httpUrl(site?.icon);
    return icon && !isLegacyAutoIcon(icon, site?.url) ? icon : '';
  }

  function cacheKey(pageUrl, customIcon = '') {
    const page = httpUrl(pageUrl);
    if (!page) return '';
    return `v1|${encodeURIComponent(page)}|${encodeURIComponent(httpUrl(customIcon))}`;
  }

  function conventionalCandidates(pageUrl, faviconBase) {
    const page = httpUrl(pageUrl);
    if (!page) return [];
    const result = [];
    if (faviconBase) {
      for (const size of [128, 64]) {
        const url = new URL(faviconBase);
        url.searchParams.set('pageUrl', page);
        url.searchParams.set('size', String(size));
        result.push({ url: url.href, kind: 'chrome', size });
      }
    }
    const origin = new URL(page).origin;
    for (const file of ['apple-touch-icon.png', 'favicon.ico', 'favicon.png']) {
      result.push({ url: `${origin}/${file}`, kind: 'conventional', size: 0 });
    }
    return result;
  }

  function providerCandidates(pageUrl) {
    const page = httpUrl(pageUrl);
    if (!page) return [];
    const host = new URL(page).hostname.toLowerCase();
    // 内网和本机图标只能向原站/浏览器获取，公共服务也无法抓取这些地址。
    if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') || host.startsWith('[')
      || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return [];
    return [{
      url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
      kind: 'google', size: 128
    }];
  }

  function dedupe(candidates) {
    const seen = new Set();
    return candidates.filter(candidate => {
      if (!candidate?.url || seen.has(candidate.url)) return false;
      seen.add(candidate.url);
      return true;
    });
  }

  function score(candidate, image) {
    const sources = { custom: 100, html: 55, manifest: 50, apple: 42, chrome: 38, conventional: 25, google: 8 };
    const pixels = Math.min(image.width || 0, image.height || 0);
    const svg = /image\/svg\+xml/i.test(image.mimeType || '');
    return (sources[candidate.kind] || 0)
      + (svg ? 15 : /image\/(png|webp)/i.test(image.mimeType || '') ? 10 : 0)
      + (svg || pixels >= 128 ? 25 : pixels >= 64 ? 20 : pixels >= 32 ? 10 : 0);
  }

  function chooseBest(images, minPx = 32) {
    return images.filter(image => image && (/image\/svg\+xml/i.test(image.mimeType)
      || Math.min(image.width, image.height) >= minPx))
      .sort((a, b) => b.score - a.score || b.width - a.width || a.blob.size - b.blob.size)[0] || null;
  }

  return { MAX_ICON_BYTES, CACHE_TTL, FAILURE_TTL, httpUrl, isLegacyAutoIcon, getCustomIcon,
    cacheKey, conventionalCandidates, providerCandidates, dedupe, score, chooseBest };
});
