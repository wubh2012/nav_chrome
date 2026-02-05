// 弹窗脚本
document.addEventListener('DOMContentLoaded', () => {
  // 打开选项页面
  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
