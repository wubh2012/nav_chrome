/**
 * 在主脚本加载前恢复侧栏折叠状态，避免首屏闪动。
 */
(function() {
  'use strict';

  var root = document.documentElement;
  var collapsed = '0';

  try {
    collapsed = window.localStorage.getItem('chromeNav_sidebarCollapsed') === '1' ? '1' : '0';
  } catch (_error) {
    // ignore storage failures during initial paint
  }

  root.dataset.sidebarCollapsed = collapsed;
  root.classList.toggle('sidebar-collapsed', collapsed === '1');
})();
