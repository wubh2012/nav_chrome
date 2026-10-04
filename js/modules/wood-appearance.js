/* 木牌外观设置：即时预览，持久保存到 chrome.storage.local。 */
(() => {
  'use strict';
  const core = window.WoodAppearanceCore;
  const keys = core.colors;
  const { light, dark } = core.defaults;
  const storage = window.chrome?.storage?.local || {
    async get(key) { return { [key]: JSON.parse(localStorage.getItem(key) || 'null') }; },
    async set(items) { Object.entries(items).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value))); }
  };
  const store = core.createStore(storage);
  const valid = value => /^#[0-9a-f]{6}$/i.test(value);
  function hsl(hex) {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = rgb, max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    let h = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return [(h * 60 + 360) % 360, s * 100, l * 100];
  }
  function hex([h, s, l]) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const component = n => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
    };
    return '#' + component(0) + component(8) + component(4);
  }
  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('wood-tuner');
    const toggle = document.getElementById('wood-tuner-toggle');
    const status = document.getElementById('wood-tuner-status');
    const css = document.getElementById('wood-tuner-css');
    const mode = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    let palette;
    let loadRevision = 0;
    let saveQueue = Promise.resolve();
    let pendingWrites = 0;
    async function load() {
      const revision = ++loadRevision;
      const currentMode = mode();
      try {
        const loaded = await store.get(currentMode);
        if (revision !== loadRevision || currentMode !== mode()) return;
        palette = loaded;
      } catch (_) {
        if (revision !== loadRevision) return;
        palette = core.normalize(null, currentMode);
        status.textContent = '读取设置失败，可以重新调整并保存。';
      }
      apply(false);
    }
    function apply(save = true) {
      keys.forEach(key => {
        document.body.style.setProperty('--' + key, palette[key]);
        document.querySelector(`[data-wood-color="${key}"]`).value = palette[key];
        const input = document.querySelector(`[data-wood-hex="${key}"]`);
        input.value = palette[key]; input.removeAttribute('aria-invalid');
      });
      document.body.style.setProperty('--wood-grain', palette.grain / 100);
      document.body.style.setProperty('--wood-font-weight', palette.fontWeight);
      document.body.style.setProperty('--wood-font-size', palette.fontSize + 'px');
      const [, saturation, lightness] = hsl(palette.wood);
      Object.entries({ lightness: Math.round(lightness), saturation: Math.round(saturation), grain: palette.grain, fontWeight: palette.fontWeight, fontSize: palette.fontSize }).forEach(([key, value]) => {
        document.getElementById('wood-' + key).value = value;
        document.getElementById('wood-' + key + '-value').textContent = value + (key === 'fontWeight' ? '' : key === 'fontSize' ? 'px' : '%');
      });
      css.value = '.pixel-home.wooden-home {\n' + keys.map(key => `  --${key}: ${palette[key]};`).join('\n') + `\n  --wood-grain: ${palette.grain / 100};\n  --wood-font-weight: ${palette.fontWeight};\n  --wood-font-size: ${palette.fontSize}px;\n}`;
      if (save) {
        const currentMode = mode(), value = { ...palette };
        pendingWrites++;
        status.textContent = '正在保存…';
        saveQueue = saveQueue.catch(() => {}).then(() => store.set(currentMode, value)).then(() => {
          if (mode() === currentMode && JSON.stringify(palette) === JSON.stringify(value)) status.textContent = '已保存在本地';
        }).catch(() => { status.textContent = '保存失败，请重新调整后重试。'; }).finally(() => { pendingWrites--; });
      }
    }

    function setOpen(open) { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); }
    toggle.addEventListener('click', () => setOpen(panel.hidden));
    document.getElementById('wood-tuner-close').addEventListener('click', () => { setOpen(false); toggle.focus(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden && !document.querySelector('#quick-search-modal.active') && !document.querySelector('dialog[open]')) setOpen(false);
    });
    keys.forEach(key => {
      document.querySelector(`[data-wood-color="${key}"]`).addEventListener('input', event => { palette[key] = event.target.value; apply(); });
      document.querySelector(`[data-wood-hex="${key}"]`).addEventListener('input', event => {
        const value = event.target.value.trim();
        event.target.setAttribute('aria-invalid', String(!valid(value)));
        if (valid(value)) { palette[key] = value.toLowerCase(); apply(); }
      });
    });
    ['lightness', 'saturation', 'grain', 'fontWeight', 'fontSize'].forEach(key => {
      document.getElementById('wood-' + key).addEventListener('input', event => {
        const value = Number(event.target.value);
        if (['grain', 'fontWeight', 'fontSize'].includes(key)) palette[key] = value;
        else { const channels = hsl(palette.wood); channels[key === 'lightness' ? 2 : 1] = value; palette.wood = hex(channels); }
        apply();
      });
    });
    document.getElementById('wood-tuner-reset').addEventListener('click', () => {
      palette = { ...(mode() === 'dark' ? dark : light) }; apply(); status.textContent = '已恢复默认配色';
    });
    document.getElementById('wood-tuner-copy').addEventListener('click', async () => {
      css.hidden = false;
      try { await navigator.clipboard.writeText(css.value); status.textContent = '配色已复制'; }
      catch (_) { css.focus(); css.select(); status.textContent = '请复制下方配色参数'; }
    });
    new MutationObserver(load).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.chrome?.storage?.onChanged?.addListener((changes, area) => {
      const change = changes[store.key(mode())];
      if (!pendingWrites && area === 'local' && change && JSON.stringify(core.normalize(change.newValue, mode())) !== JSON.stringify(palette)) load();
    });
    palette = core.normalize(null, mode());
    apply(false);
    load();
  });
})();
