/* 首页布局独立保存；刷新或重新打开首页后生效，避免打断正在编辑的网站。 */
document.addEventListener('DOMContentLoaded', async () => {
  const select = document.getElementById('home-layout');
  const save = document.getElementById('home-layout-save');
  const status = document.getElementById('home-layout-status');
  let saved;
  select.disabled = save.disabled = true;
  try {
    saved = await HomeLayout.load();
    select.value = saved;
    status.textContent = '当前使用：' + select.selectedOptions[0].textContent;
  } catch (_) {
    select.value = HomeLayout.DEFAULT;
    status.textContent = '读取布局失败，请重新选择并保存。';
  } finally { select.disabled = save.disabled = false; }
  select.addEventListener('change', () => {
    status.textContent = select.value === saved ? '当前布局已保存。' : '修改尚未保存。';
  });
  save.addEventListener('click', async () => {
    select.disabled = save.disabled = true;
    try {
      saved = await HomeLayout.save(select.value);
      status.textContent = '已保存，刷新或重新打开首页即可切换。';
    } catch (_) { status.textContent = '保存失败，请重试。'; }
    finally { select.disabled = save.disabled = false; }
  });
});
