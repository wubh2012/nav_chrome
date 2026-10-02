// 候选 B/C/D 的一次性视觉探索；只维护内存状态，不连接用户账户。
(() => {
  const variant = new URLSearchParams(location.search).get('variant') || 'B';
  const app = document.getElementById('prototype-app');
  const data = structuredClone(FeishuAPI.getMockData());
  const categories = ['Code', '工具', '设计', '学习'];
  const categoryIcons = { Code: 'bi-code-slash', 工具: 'bi-tools', 设计: 'bi-palette', 学习: 'bi-book' };
  const categoryNames = { Code: '写代码', 工具: '办点事', 设计: '找灵感', 学习: '学一点' };
  let selected = 'all';
  let query = '';
  let dark = new URLSearchParams(location.search).get('theme') === 'dark';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const domain = url => new URL(url).hostname.replace(/^www\./, '');
  const all = () => categories.flatMap(category => data[category].map(site => ({ ...site, category })));
  const matches = site => `${site.name} ${site.url} ${site.category}`.toLowerCase().includes(query.toLowerCase());
  const selectedSites = () => all().filter(site => (selected === 'all' || site.category === selected) && matches(site));
  const logo = `<svg viewBox="0 0 44 44" fill="none" aria-hidden="true"><path d="M7 18C7 29 15 38 25 38C36 38 41 29 38 20L7 18Z" fill="currentColor"/><path d="M11 21C12 30 18 34 25 34C32 34 36 29 35 23L11 21Z" fill="var(--fruit)"/><path d="M22 15C22 8 31 5 35 8C32 14 26 17 22 15Z" fill="currentColor"/><path d="M20 26V28M27 28V30M31 25V27" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const brand = () => `<a class="brand" href="/" aria-label="返回原型选择页">${logo}<strong>水果导航</strong></a>`;
  const controls = () => `<div class="page-controls"><button class="mode-button" data-mode aria-label="切换明暗模式"><i class="bi ${dark ? 'bi-sun' : 'bi-moon'}" aria-hidden="true"></i></button><button class="settings-button" data-settings aria-label="设置"><i class="bi bi-gear" aria-hidden="true"></i></button><button class="new-site" data-add><i class="bi bi-plus-lg" aria-hidden="true"></i><span>添加网站</span></button></div>`;
  const date = () => new Intl.DateTimeFormat('zh-CN', { timeZone:'Asia/Singapore', month:'long', day:'numeric', weekday:'long' }).format(new Date());
  const time = () => new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Singapore', hour:'2-digit', minute:'2-digit', hour12:false }).format(new Date());
  const search = placeholder => `<div class="search-box"><i class="bi bi-search" aria-hidden="true"></i><input id="prototype-search" type="search" autocomplete="off" aria-label="搜索收藏网站" placeholder="${placeholder}"><kbd>Ctrl F</kbd></div>`;
  const tabs = () => `<nav class="category-tabs" aria-label="网站分类">${['all', ...categories].map(category => `<button data-category="${category}" aria-pressed="${selected === category}">${category === 'all' ? '全部网站' : category}<span>${category === 'all' ? all().length : data[category].length}</span></button>`).join('')}</nav>`;
  function row(site) {
    return `<a class="directory-link" href="${escape(site.url)}" target="_blank" rel="noopener noreferrer"><span class="site-icon">${escape(site.icon)}</span><span class="site-copy"><strong>${escape(site.name)}</strong><small>${escape(domain(site.url))}</small></span><i class="bi bi-arrow-up-right" aria-hidden="true"></i></a>`;
  }
  function directory() {
    const groups = categories.filter(category => selected === 'all' || category === selected).map(category => {
      const sites = data[category].map(site => ({ ...site, category })).filter(matches);
      if (!sites.length) return '';
      return `<section class="directory-section"><h2><i class="bi ${categoryIcons[category]}" aria-hidden="true"></i>${category}<span>${sites.length}</span></h2>${sites.map(row).join('')}<button class="section-add" data-add data-add-category="${category}">+ 添加到${category}</button></section>`;
    }).join('');
    return groups || empty();
  }
  function boards() {
    const groups = categories.filter(category => selected === 'all' || category === selected).map(category => {
      const sites = data[category].map(site => ({ ...site, category })).filter(matches);
      if (!sites.length) return '';
      return `<section class="note-board" data-board="${category}"><div class="board-title"><h2>${categoryNames[category]}</h2><span>${category}</span><button data-add data-add-category="${category}" aria-label="添加到${category}">+</button></div><div class="note-sites">${sites.map(site => `<a class="note-link" href="${escape(site.url)}" target="_blank" rel="noopener noreferrer"><span class="note-icon">${escape(site.icon)}</span><span class="site-copy"><strong>${escape(site.name)}</strong><small>${escape(domain(site.url))}</small></span><i class="bi bi-arrow-up-right" aria-hidden="true"></i></a>`).join('')}</div></section>`;
    }).join('');
    return groups || empty();
  }
  const empty = () => '<div class="empty-search"><i class="bi bi-search" aria-hidden="true"></i><strong>没有匹配的网站</strong><span>试试名称、网址或分类。</span></div>';
  function launchers() {
    const sites = selectedSites();
    if (!sites.length) return empty();
    return sites.map(site => `<a class="pixel-site" href="${escape(site.url)}" target="_blank" rel="noopener noreferrer" title="${escape(domain(site.url))}"><span class="pixel-site-icon" data-color="${site.category}">${escape(site.icon)}</span><strong>${escape(site.name)}</strong></a>`).join('') + `<button class="pixel-site pixel-add" data-add><span class="pixel-site-icon">+</span><strong>种下一站</strong></button>`;
  }
  function VariantB() {
    return `<div class="minimal-shell"><header class="minimal-header">${brand()}<span class="header-purpose">收藏夹，打开就能用</span>${controls()}</header><section class="minimal-intro"><div><p class="intro-date">${date()}</p><h1>打开你的下一站。</h1><p>你的工具、灵感和常用网站，都在这里。</p></div><div class="minimal-clock"><time data-clock>${time()}</time><span>今天也有新的发现</span></div></section>${search('搜索收藏的名称或网址')}${tabs()}<div class="directory-heading"><span id="visible-count">${all().length} 个网站</span><span>按分类整理</span></div><div class="site-content directory-grid">${directory()}</div><footer class="minimal-footer"><span>少一点寻找，多一点专注。</span><span>Ctrl F 搜索 / Enter 打开</span></footer></div>`;
  }
  function VariantC() {
    return `<div class="notes-shell"><header class="notes-header">${brand()}<div class="notes-clock"><time data-clock>${time()}</time><span>${date()}</span></div>${controls()}</header><section class="notes-intro"><div><p>我的互联网收藏</p><h1>常用的，总在这儿。</h1><span>把好用的网站，贴在今天的桌面上。</span></div><svg class="citrus-stamp" viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="75" r="60" fill="#ffb882" stroke="currentColor" stroke-width="3"/><circle cx="75" cy="75" r="48" fill="#ffe6a7" stroke="currentColor" stroke-width="2"/><path d="M75 27V123M27 75H123M41 41L109 109M41 109L109 41" stroke="#f7ac65" stroke-width="6"/><circle cx="75" cy="75" r="10" fill="#fff3cb"/></svg></section><div class="notes-search-row">${search('找找你的下一站…')}${tabs()}</div><div class="notes-heading"><h2>今天的便签板</h2><span id="visible-count">${all().length} 个网站</span></div><div class="site-content boards-grid">${boards()}</div><footer class="notes-footer">好东西，随手收藏。 <span>选一个分类，让桌面清爽一点。</span></footer></div>`;
  }
  function VariantD() {
    return `<div class="pixel-shell"><div class="pixel-sky"><header class="pixel-header">${brand()}${controls()}</header><section class="pixel-intro"><div class="pixel-cloud cloud-one" aria-hidden="true"></div><div class="pixel-cloud cloud-two" aria-hidden="true"></div><p>今天，去哪里逛逛？</p><time data-clock>${time()}</time><span>${date()}</span>${search('找一条熟悉的小路…')}</section>${PixelGarden.scene()}</div><section class="pixel-launchpad">${PixelGarden.panel()}${tabs()}<div class="launchpad-heading"><h1>我的网站果园</h1><span id="visible-count">${all().length} 个网站</span></div><div class="site-content pixel-sites">${launchers()}</div><footer class="pixel-footer"><span class="pixel-flower" aria-hidden="true">✿</span> 喜欢的网站，就是每天的小小收获。</footer></section></div>`;
  }
  function paint() {
    document.body.className = `variant-${variant.toLowerCase()}`;
    document.documentElement.dataset.mode = dark ? 'dark' : 'light';
    app.innerHTML = ({ B: VariantB, C: VariantC, D: VariantD }[variant] || VariantB)();
  }
  function updateSites() {
    document.querySelector('.site-content').innerHTML = ({B:directory,C:boards,D:launchers}[variant] || directory)();
    document.getElementById('visible-count').textContent = `${selectedSites().length} 个网站`;
    document.querySelectorAll('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === selected)));
    document.querySelector('.site-content').classList.toggle('filtered', selected !== 'all');
  }
  paint();
  if (variant === 'D') PixelGarden.bind(app);
  app.addEventListener('input', event => { if (event.target.id === 'prototype-search') { query = event.target.value.trim(); updateSites(); } });
  app.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.category) { selected = button.dataset.category; updateSites(); }
    if (button.hasAttribute('data-mode')) {
      dark = !dark; document.documentElement.dataset.mode = dark ? 'dark' : 'light';
      button.querySelector('i').className = `bi ${dark ? 'bi-sun' : 'bi-moon'}`;
      const url = new URL(location.href); url.searchParams.set('theme', dark ? 'dark' : 'light'); history.replaceState(null, '', url);
    }
    if (button.hasAttribute('data-settings')) alert('这是设计原型；设置和同步将在选定方案后接入。');
    if (button.hasAttribute('data-add')) {
      const form = document.getElementById('prototype-add-form'); form.reset();
      form.elements.category.value = button.dataset.addCategory || (selected === 'all' ? 'Code' : selected);
      document.getElementById('prototype-add').showModal();
    }
  });
  document.getElementById('prototype-close').addEventListener('click', () => document.getElementById('prototype-add').close());
  document.getElementById('prototype-add-form').addEventListener('submit', event => {
    event.preventDefault(); const values = new FormData(event.target);
    const url = new URL(values.get('url'));
    if (!['http:', 'https:'].includes(url.protocol)) return;
    const category = values.get('category');
    data[category].push({name:values.get('name'), url:url.href, icon:'🔖'});
    document.getElementById('prototype-add').close();
    selected = category; query = ''; document.getElementById('prototype-search').value = '';
    document.querySelector('.category-tabs').outerHTML = tabs(); updateSites();
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); document.getElementById('prototype-search').focus(); }
    if (event.target.id === 'prototype-search' && event.key === 'Enter') document.querySelector('.site-content a')?.click();
    if (event.target.id === 'prototype-search' && event.key === 'Escape') { query = ''; event.target.value = ''; updateSites(); event.target.blur(); }
  });
  setInterval(() => document.querySelectorAll('[data-clock]').forEach(clock => { clock.textContent = time(); }), 1000);
})();
