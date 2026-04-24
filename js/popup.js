// 弹窗脚本
document.addEventListener('DOMContentLoaded', () => {
  if (window.ThemeManager) {
    ThemeManager.init();
  }

  // 打开选项页面
  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
