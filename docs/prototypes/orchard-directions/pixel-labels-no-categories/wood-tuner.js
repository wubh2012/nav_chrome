/* 原型调色器：只保存本站预览配色，不写扩展数据。 */
(() => {
  'use strict';
  const keys = ['wood', 'wood-hover', 'wood-edge', 'wood-bottom', 'wood-ink', 'wood-knot'];
  const light = { wood: '#f9e9cf', 'wood-hover': '#fff2dc', 'wood-edge': '#879058', 'wood-bottom': '#c1a16a', 'wood-ink': '#234657', 'wood-knot': '#b6a06b', grain: 6, fontWeight: 600, fontSize: 17 };
  const dark = { ...light, wood: '#46513d', 'wood-hover': '#536047', 'wood-edge': '#8b9c68', 'wood-bottom': '#273b28', 'wood-ink': '#f0f3dc' };
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
    const storageKey = () => 'orchardPrototype_woodPalette_v1_' + mode();
    let palette;
    function load() {
      palette = { ...(mode() === 'dark' ? dark : light) };
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey()) || '{}');
        keys.forEach(key => { if (valid(saved[key])) palette[key] = saved[key]; });
        if (Number.isFinite(saved.grain) && saved.grain >= 0 && saved.grain <= 100) palette.grain = saved.grain;
        if (Number.isFinite(saved.fontWeight) && saved.fontWeight >= 300 && saved.fontWeight <= 800) palette.fontWeight = saved.fontWeight;
        if (Number.isFinite(saved.fontSize) && saved.fontSize >= 14 && saved.fontSize <= 20) palette.fontSize = saved.fontSize;
      } catch (_) { /* 存储不可用时继续实时调节。 */ }
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
      css.value = '.pixel-home.wooden-prototype {\n' + keys.map(key => `  --${key}: ${palette[key]};`).join('\n') + `\n  --wood-grain: ${palette.grain / 100};\n  --wood-font-weight: ${palette.fontWeight};\n  --wood-font-size: ${palette.fontSize}px;\n}`;
      if (save) {
        try { localStorage.setItem(storageKey(), JSON.stringify(palette)); status.textContent = '已保存'; }
        catch (_) { status.textContent = '当前仅实时预览，浏览器未允许保存。'; }
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
      try { await navigator.clipboard.writeText(css.value); status.textContent = '配色已复制，可以发给我'; }
      catch (_) { css.focus(); css.select(); status.textContent = '请复制下方配色参数'; }
    });
    new MutationObserver(load).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    load();
  });
})();
