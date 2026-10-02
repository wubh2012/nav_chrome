(() => {
  const variants = [ ['A', '正式首页'], ['B', '极简书签架'], ['C', '水果便签板'], ['D', '像素果园'] ];
  const params = new URLSearchParams(location.search);
  const current = params.get('variant') || 'A';
  document.documentElement.dataset.overview = String(params.get('overview') === '1');
  document.title = `${current} · ${variants.find(([key]) => key === current)?.[1] || '首页原型'} · 水果导航`;
  const go = key => { const url = new URL(location.href); url.searchParams.set('variant', key); location.href = url.href; };
  const cycle = step => go(variants[(variants.findIndex(([key]) => key === current) + step + variants.length) % variants.length][0]);
  const bar = document.createElement('nav');
  bar.className = 'prototype-switcher'; bar.setAttribute('aria-label', '切换首页设计原型');
  bar.innerHTML = `<span class="prototype-note">已选 D · 细节体验</span><button class="cycle-button" data-step="-1" aria-label="上一个原型">←</button><span class="prototype-current">${current} · ${variants.find(([key]) => key === current)?.[1] || ''}</span>${variants.map(([key]) => `<button data-variant="${key}" aria-label="查看候选 ${key}" aria-pressed="${key === current}">${key}</button>`).join('')}<button class="cycle-button" data-step="1" aria-label="下一个原型">→</button><a class="compare-link" href="/">并排比较</a>`;
  bar.addEventListener('click', event => { const button = event.target.closest('button'); if (button?.dataset.variant) go(button.dataset.variant); if (button?.dataset.step) cycle(Number(button.dataset.step)); });
  document.body.append(bar);
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input, textarea, select, #garden-panel, [contenteditable="true"]') || document.querySelector('dialog[open], .modal.active, .quick-search-modal.active')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowRight' ? 1 : -1); }
  });
  if (current === 'A' && params.get('theme') === 'dark') {
    const timer = setInterval(() => { if (document.body.classList.contains('loaded')) { if (ThemeManager.getCurrentMode() !== 'dark') ThemeManager.toggleMode(); clearInterval(timer); } }, 50);
  }
})();
