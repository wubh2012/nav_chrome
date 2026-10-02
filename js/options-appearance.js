/* 设置页中的字体草稿及实时预览，保存后才更新首页。 */
document.addEventListener('DOMContentLoaded', async () => {
  const body = document.getElementById('font-body');
  const size = document.getElementById('font-size');
  const sample = document.getElementById('font-preview');
  const status = document.getElementById('font-status');
  const save = document.getElementById('font-save');
  const reset = document.getElementById('font-reset');
  let revision = 0;
  let saved = await FontManager.init();
  const read = () => FontManager.normalize({ body: body.value, size: size.value });
  const fill = value => { body.value = value.body; size.value = value.size; };
  async function preview() {
    const request = ++revision;
    const value = read();
    sample.style.setProperty('--preview-font', FontManager.fonts[value.body].family);
    sample.style.setProperty('--preview-size', value.size + 'px');
    const dirty = JSON.stringify(value) !== JSON.stringify(saved);
    document.getElementById('font-draft').textContent = dirty ? '预览中 · 修改尚未保存' : '当前首页字体';
    status.textContent = '正在加载预览字体…';
    save.disabled = true;
    try {
      await FontManager.loadFont(value.body);
      if (request !== revision) return;
      status.textContent = '字体已就绪 · 离线可用';
      save.disabled = false;
    } catch (_) {
      if (request !== revision) return;
      status.textContent = '字体加载失败，请重新加载设置页后再试。';
    }
  }
  [body, size].forEach(control => control.addEventListener('change', preview));
  reset.addEventListener('click', () => { fill(FontManager.defaults); preview(); });
  save.addEventListener('click', async () => {
    save.disabled = reset.disabled = body.disabled = size.disabled = true;
    const value = read();
    try {
      saved = await FontManager.save(value);
      document.getElementById('font-draft').textContent = JSON.stringify(read()) === JSON.stringify(saved) ? '当前首页字体' : '预览中 · 修改尚未保存';
      status.textContent = '已保存，打开的首页也会自动更新。';
    } catch (_) { status.textContent = '保存失败，请重试。'; }
    finally { save.disabled = reset.disabled = body.disabled = size.disabled = false; }
  });
  fill(saved);
  preview();
});
