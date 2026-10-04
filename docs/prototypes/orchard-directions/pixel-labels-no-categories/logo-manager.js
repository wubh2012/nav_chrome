/* 仅用于此原型：保留全部网站，图标优先本地；失败或超时后用首字。 */
(() => {
  'use strict';
  if (window.UIRenderer) {
    const switchCategory = UIRenderer.switchCategory;
    UIRenderer.switchCategory = () => switchCategory('all');
    UIRenderer.switchAdjacentCategory = () => null;
  }
  const handled = new WeakSet();
  const selector = '#tools-grid img.tool-icon, #quick-search-list img.quick-search-item-icon-img';
  function improve(image) {
    if (handled.has(image)) return;
    handled.add(image);
    const holder = image.parentElement;
    const card = image.closest('.tool-item, .quick-search-item');
    const name = image.alt || card?.getAttribute('aria-label') || card?.querySelector('.quick-search-item-name')?.textContent || '网站';
    const link = card?.matches('a') ? card : card?.querySelector('a');
    const siteUrl = link?.href;
    const local = window.OrchardLocalIcons?.byUrl[siteUrl] || window.OrchardLocalIcons?.byIcon[image.src];
    const candidates = [local && new URL(local, document.baseURI).href, image.src];
    try {
      const url = new URL(siteUrl);
      if (/^https?:$/.test(url.protocol)) candidates.push(url.origin + '/favicon.ico');
    } catch (_) { /* 搜索结果没有链接时，使用已有图标地址。 */ }
    const queue = [...new Set(candidates.filter(Boolean))];
    const placeholder = document.createElement('span');
    placeholder.className = 'logo-placeholder';
    placeholder.textContent = '·';
    placeholder.setAttribute('aria-hidden', 'true');
    image.replaceWith(placeholder);
    const deadline = Date.now() + 6500;
    function fallback() {
      const initial = document.createElement('span');
      initial.className = 'logo-fallback';
      initial.textContent = Array.from(name.trim())[0]?.toUpperCase() || '网';
      initial.title = name + '：暂无法加载图标';
      placeholder.replaceWith(initial);
      holder.dataset.logoStatus = 'fallback';
    }
    function next() {
      const source = queue.shift();
      const remaining = deadline - Date.now();
      if (!source || remaining <= 0 || !holder.isConnected) { fallback(); return; }
      const candidate = new Image();
      handled.add(candidate);
      candidate.className = image.className;
      candidate.alt = image.alt;
      candidate.referrerPolicy = 'no-referrer';
      let settled = false;
      const settle = success => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        candidate.onload = candidate.onerror = null;
        if (success && candidate.naturalWidth > 0) {
          placeholder.replaceWith(candidate);
          holder.dataset.logoStatus = 'loaded';
        } else { next(); }
      };
      const timer = setTimeout(() => settle(false), Math.min(2200, remaining));
      candidate.onload = () => settle(true);
      candidate.onerror = () => settle(false);
      candidate.src = source;
    }
    next();
  }
  function scan() {
    document.querySelectorAll(selector).forEach(improve);
    document.querySelectorAll('#tools-grid .text-icon').forEach(initial => {
      initial.classList.add('logo-fallback');
      initial.parentElement.dataset.logoStatus = 'fallback';
      initial.title = initial.closest('.tool-item')?.getAttribute('aria-label') + '：暂无本地图标';
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    ['tools-grid', 'quick-search-list'].forEach(id => {
      const container = document.getElementById(id);
      if (container) new MutationObserver(scan).observe(container, { childList: true, subtree: true });
    });
    scan();
  });
})();
