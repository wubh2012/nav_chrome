/** 后台图标获取服务：跨页面请求合并、全局限流、发现、解码和缓存。 */
(function(root, factory) {
  const core = root.SiteIconCore || (typeof require === 'function' ? require('./site-icon-core.js') : null);
  const api = factory(root, core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SiteIconService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root, core) {
  'use strict';
  function limiter(limit) {
    let active = 0;
    const waiting = [];
    function drain() {
      while (active < limit && waiting.length) {
        const { task, resolve, reject } = waiting.shift();
        active++;
        Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; drain(); });
      }
    }
    return task => new Promise((resolve, reject) => { waiting.push({ task, resolve, reject }); drain(); });
  }

  function createOffscreenBridge() {
    let creating;
    const file = 'js/site-icon-offscreen.html';
    async function ensure() {
      if (creating) return creating;
      creating = (async () => {
        const url = root.chrome.runtime.getURL(file);
        let exists = false;
        if (root.chrome.runtime.getContexts) {
          exists = (await root.chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] })).length > 0;
        } else if (root.chrome.offscreen?.hasDocument) {
          exists = await root.chrome.offscreen.hasDocument();
        } else if (root.clients?.matchAll) {
          exists = (await root.clients.matchAll()).some(client => client.url === url);
        }
        if (!exists) await root.chrome.offscreen.createDocument({
          url: file, reasons: ['DOM_PARSER', 'BLOBS'],
          justification: '解析网站声明的图标并验证本地缓存图片的尺寸。'
        });
      })();
      try { await creating; } finally { creating = null; }
    }
    return async message => {
      await ensure();
      let timer;
      try {
        return await Promise.race([
          root.chrome.runtime.sendMessage({ target: 'site-icon-offscreen', ...message }),
          new Promise(resolve => { timer = setTimeout(() => resolve(null), 2000); })
        ]);
      } finally { clearTimeout(timer); }
    };
  }

  function create(options = {}) {
    const cache = options.cache || root.SiteIconCache.create();
    const fetchImage = options.fetch || root.fetch.bind(root);
    const offscreen = options.offscreen || createOffscreenBridge();
    const now = options.now || Date.now;
    const faviconBase = options.faviconBase === undefined ? root.chrome.runtime.getURL('/_favicon/') : options.faviconBase;
    const runFetch = limiter(options.fetchConcurrency || 6);
    const runSite = limiter(options.siteConcurrency || 3);
    const inFlight = new Map();
    let generation = 0;

    function allowedUrl(value) {
      if (core.httpUrl(value)) return true;
      if (!faviconBase) return false;
      try {
        const url = new URL(value), own = new URL(faviconBase);
        return url.protocol === own.protocol && url.host === own.host && url.pathname === own.pathname;
      } catch (_) { return false; }
    }

    function fetchLimited(url, accept, deadline) {
      if (!allowedUrl(url)) return Promise.resolve(null);
      return runFetch(async () => {
        const remaining = Math.min(2500, deadline - now());
        if (remaining <= 0) return null;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), remaining);
        let reader;
        try {
          const response = await fetchImage(url, {
            credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
            headers: { Accept: accept }
          });
          if (!response.ok || Number(response.headers.get('content-length') || 0) > core.MAX_ICON_BYTES) return null;
          const chunks = [];
          let length = 0;
          if (response.body?.getReader) {
            reader = response.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              length += value.byteLength;
              if (length > core.MAX_ICON_BYTES) { controller.abort(); return null; }
              chunks.push(value);
            }
          } else {
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.length > core.MAX_ICON_BYTES) return null;
            chunks.push(bytes); length = bytes.length;
          }
          const bytes = new Uint8Array(length);
          let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
          return { bytes, mimeType: (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), url: response.url || url };
        } catch (_) { return null; }
        finally {
          clearTimeout(timer);
          if (reader) { try { await reader.cancel(); } catch (_) { /* 已结束或取消 */ } }
        }
      });
    }

    async function inspect(candidate, deadline) {
      const data = await fetchLimited(candidate.url, 'image/*', deadline);
      if (!data || !data.bytes.length || !data.mimeType.startsWith('image/') || now() >= deadline) return null;
      let dimensions;
      try { dimensions = await offscreen({ action: 'inspect', bytes: Array.from(data.bytes), mimeType: data.mimeType }); }
      catch (_) { return null; }
      if (!dimensions?.width || !dimensions?.height) return null;
      const image = { ...dimensions, mimeType: data.mimeType, blob: new Blob([data.bytes], { type: data.mimeType }),
        sourceUrl: data.url, sourceKind: candidate.kind };
      image.score = core.score(candidate, image);
      return image;
    }

    async function declaredCandidates(pageUrl, deadline) {
      const page = await fetchLimited(pageUrl, 'text/html,application/xhtml+xml', deadline);
      if (!page || !/^(text\/html|application\/xhtml\+xml)$/.test(page.mimeType) || now() >= deadline) return [];
      try {
        const parsed = await offscreen({ action: 'page', text: new TextDecoder().decode(page.bytes), url: page.url });
        const manifests = await Promise.all((parsed?.manifests || []).slice(0, 2).map(async url => {
          const manifest = await fetchLimited(url, 'application/manifest+json,application/json', deadline);
          if (!manifest || now() >= deadline) return [];
          return await offscreen({ action: 'manifest', text: new TextDecoder().decode(manifest.bytes), url: manifest.url }) || [];
        }));
        return [...(parsed?.candidates || []), ...manifests.flat()];
      } catch (_) { return []; }
    }

    async function discover(pageUrl, customIcon) {
      const deadline = now() + 10000;
      if (customIcon) {
        const custom = await inspect({ url: customIcon, kind: 'custom' }, deadline);
        if (custom) return custom;
      }
      const conventional = core.conventionalCandidates(pageUrl, faviconBase);
      // 浏览器已有足够清晰的图标时直接复用，不为每个新标签页重新抓整站。
      const browserIcon = conventional[0]?.kind === 'chrome' ? await inspect(conventional[0], deadline) : null;
      const native = core.chooseBest([browserIcon], 64);
      if (native) return native;
      const primaryDeadline = Math.min(deadline - 2000, now() + 5500);
      const declared = await declaredCandidates(pageUrl, primaryDeadline);
      const candidates = core.dedupe([...declared.sort((a, b) => (b.size || 0) - (a.size || 0)), ...conventional])
        .filter(candidate => candidate.url !== conventional[0]?.url || !browserIcon).slice(0, 8);
      const images = await Promise.all(candidates.map(candidate => inspect(candidate, primaryDeadline)));
      const best = core.chooseBest([browserIcon, ...images]);
      if (best) return best;
      return core.chooseBest(await Promise.all(core.providerCandidates(pageUrl).map(candidate => inspect(candidate, deadline))), 16);
    }

    function refresh(spec, previous) {
      const key = core.cacheKey(spec.url, spec.customIcon);
      if (inFlight.has(key)) return inFlight.get(key);
      const epoch = generation;
      const task = runSite(async () => {
        if (epoch !== generation) return { entry: previous, refreshFailed: true };
        let image;
        try { image = await discover(spec.url, spec.customIcon); } catch (_) { image = null; }
        if (epoch !== generation) return { entry: previous, refreshFailed: true };
        if (image) {
          const entry = { key, ...image, cachedAt: now(), expiresAt: now() + core.CACHE_TTL };
          try { await cache.set(entry); } catch (_) { /* 缓存不可用时仍显示本次图片 */ }
          return { entry, fromCache: false };
        }
        if (previous?.blob) {
          try { await cache.set({ ...previous, retryAfter: now() + core.FAILURE_TTL }); } catch (_) { /* 保留旧图 */ }
          return { entry: previous, fromCache: true, refreshFailed: true };
        }
        const failed = { key, retryAfter: now() + core.FAILURE_TTL };
        try { await cache.set(failed); } catch (_) { /* 无持久存储时继续文字回退 */ }
        return { entry: null, retryAfter: failed.retryAfter };
      });
      inFlight.set(key, task);
      task.finally(() => { if (inFlight.get(key) === task) inFlight.delete(key); }).catch(() => {});
      return task;
    }

    async function get(request) {
      const spec = { url: core.httpUrl(request?.url), customIcon: core.httpUrl(request?.customIcon) };
      if (!spec.url || (request?.customIcon && !spec.customIcon)) return { entry: null };
      const key = core.cacheKey(spec.url, spec.customIcon);
      let entry;
      try { entry = await cache.get(key); } catch (_) { entry = null; }
      if (!request.force && entry?.blob) {
        if (entry.expiresAt <= now() && !(entry.retryAfter > now())) refresh(spec, entry).catch(() => {});
        return { entry, fromCache: true, stale: entry.expiresAt <= now() };
      }
      if (!request.force && entry?.retryAfter > now()) return { entry: null, retryAfter: entry.retryAfter };
      return refresh(spec, entry);
    }

    async function handle(request) {
      const result = await get(request);
      const entry = result.entry;
      if (!entry?.blob) return { success: false, retryAfter: result.retryAfter || 0 };
      return { success: true, bytes: Array.from(new Uint8Array(await entry.blob.arrayBuffer())),
        mimeType: entry.mimeType, width: entry.width, height: entry.height,
        sourceKind: entry.sourceKind, fromCache: Boolean(result.fromCache),
        stale: Boolean(result.stale), refreshFailed: Boolean(result.refreshFailed) };
    }

    async function clear() {
      generation++;
      inFlight.clear();
      await cache.clear();
      return { success: true };
    }
    return { get, handle, clear };
  }
  return { create, createOffscreenBridge, limiter };
});
