/* 此原型独立接管搜索快捷键，避免重复 Ctrl+F 打开浏览器默认查找。 */
(() => {
  'use strict';
  // 在 app 初始化搜索管理器前注册，先于其 document 捕获监听器执行。
  document.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]')) return;
    const modal = document.getElementById('quick-search-modal');
    if (!modal || !window.QuickSearchManager) return;
    const active = modal.classList.contains('active');
    const searchShortcut = event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'f';
    if (searchShortcut) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (active) document.getElementById('quick-search-input')?.focus();
      else window.QuickSearchManager.open();
    } else if (event.key === 'Escape' && active) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.QuickSearchManager.close();
    }
  }, true);
})();
