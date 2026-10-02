// D 方案的轻互动原型：摘果、种树、装扮和池塘小鱼。
// 原型使用内存状态；正式首页通过 Chrome 本地存储保留进度。
window.PixelGarden = (() => {
  const fruit = [3, 3, 3, 3];
  const plots = [{ x: 451, y: 109 }, { x: 770, y: 111 }, { x: 510, y: 112 }];
  const trees = [];
  const decorations = [
    { id: 'flowers', name: '小花丛', cost: 2, note: '给小路添一点颜色', owned: false, visible: true, zone: 0 },
    { id: 'lantern', name: '暖灯笼', cost: 4, note: '留一盏暖暖的灯', owned: false, visible: true, zone: 1 },
    { id: 'fence', name: '木栅栏', cost: 5, note: '围起你的秘密角落', owned: false, visible: true, zone: 2 }
  ];
  const fishTypes = [
    { name: '蓝色小鱼', color: '#4d91b5' },
    { name: '橙色小鱼', color: '#e28a57' },
    { name: '金色小鱼', color: '#e9bd4b' }
  ];
  const discoveredFish = new Set();
  let pondVisits = 0;
  let activeFish = null;
  let fishTimer;
  let shop;
  let menuOpen = false;
  let helpOpen = false;
  let persist = false;
  let saveQueue = Promise.resolve();
  const STORAGE_KEY = 'chromeNav_pixelGarden_v1';
  let basket = 0;
  let total = 0;
  let cats = 0;
  let enabled = true;
  let host;
  let message = '轻点果树、小猫或池塘，果园会回应你。';
  const fruitShape = (x, y) => `<path d="M${x} ${y}h12v12h-12Z" fill="var(--fruit)"/><path d="M${x} ${y}h4v4h-4Z" fill="#ffe1b2"/>`;
  function tree(x, y, size, count) {
    return `<g transform="translate(${x} ${y}) scale(${size})"><path d="M40 28H56V100H40Z" fill="#715948"/><g class="garden-crown"><path d="M24 0H72V8H88V24H96V56H88V64H8V56H0V24H8V8H24Z" fill="var(--pixel-leaf)"/><path d="M24 0H64V8H80V24H88V40H72V48H16V40H8V24H16V8H24Z" fill="var(--pixel-leaf-light)"/>${count > 0 ? fruitShape(24,24) : ''}${count > 1 ? fruitShape(60,16) : ''}${count > 2 ? fruitShape(52,44) : ''}</g></g>`;
  }
  function control(id, label, content, rect) {
    return `<g class="garden-target" data-garden="${id}" role="button" aria-label="${label}" tabindex="${enabled ? '0' : '-1'}" aria-disabled="${!enabled}"><title>${label}</title>${content}<rect class="garden-hit" x="${rect[0]}" y="${rect[1]}" width="${rect[2]}" height="${rect[3]}" rx="4" fill="transparent"/></g>`;
  }
  function plantedTree(item, index) {
    const {x,y} = plots[index];
    let content;
    if (item.stage === 0) {
      content = `<path d="M${x+5} ${y+43}h38v8h-38Z" fill="#8e7651"/><path d="M${x+20} ${y+20}h8v28h-8Z" fill="var(--pixel-leaf)"/><path d="M${x+8} ${y+21}h12v8h-12ZM${x+28} ${y+14}h12v8h-12Z" fill="var(--pixel-leaf-light)"/>`;
    } else if (item.stage === 1) {
      content = tree(x+1,y+13,.48,0);
    } else if (item.stage === 2) {
      content = tree(x-6,y-4,.65,0) + `<path d="M${x+9} ${y+11}h7v7h-7ZM${x+37} ${y+19}h7v7h-7Z" fill="#fff3bf"/>`;
    } else {
      content = tree(x-15,y-27,.82,item.fruit);
    }
    const action = item.stage < 3 ? '浇水' : (item.fruit ? '摘果' : '浇水让它再结果');
    return control(`plot-${index}`, `第 ${index+1} 棵小树，${action}`, content, [x-18,y-33,95,91]);
  }
  const cat = () => `<g class="garden-cat"><path d="M697 146H717V152H725V164H691V151H697Z" fill="#e9c386"/><path d="M697 140H703V148H697ZM711 140H717V148H711Z" fill="#e9c386"/><path d="M698 151H701V154H698ZM712 151H715V154H712Z" fill="#70594a"/><path d="M723 156H735V164H729V168H717V163H723Z" fill="#e9c386"/></g>`;
  function decorationArt(id) {
    if (id === 'flowers') return '<path d="M12 27h4v20h-4ZM32 19h4v28h-4ZM52 29h4v18h-4Z" fill="var(--pixel-leaf)"/><path d="M8 23h12v12H8ZM28 15h12v12H28ZM48 25h12v12H48Z" fill="#e9a2ae"/><path d="M12 27h4v4h-4ZM32 19h4v4h-4ZM52 29h4v4h-4Z" fill="#fff0b9"/><path d="M4 43h60v6H4Z" fill="var(--pixel-leaf-light)"/>';
    if (id === 'lantern') return '<path d="M12 8h8v48h-8ZM12 8h32v6H12ZM38 12h4v8h-4Z" fill="#78614d"/><path d="M30 20h20v24H30Z" fill="#e6a46c"/><path d="M34 24h12v16H34Z" fill="#fff0b9"/><path d="M28 18h24v4H28ZM28 42h24v4H28ZM8 54h16v4H8Z" fill="#78614d"/>';
    return '<path d="M4 14h8v36H4ZM28 14h8v36H28ZM52 14h8v36H52ZM4 22h56v6H4ZM4 36h56v6H4Z" fill="#af8964"/><path d="M4 14h8v4H4ZM28 14h8v4H28ZM52 14h8v4H52Z" fill="#dcc09a"/>';
  }
  function placedDecorations() {
    const locations = { flowers: [[264,120],[658,120],[838,120]], lantern: [[255,102],[737,102],[1014,102]], fence: [[311,128],[529,128],[807,128]] };
    return decorations.filter(item => item.owned && item.visible).map(item => {
      const [x,y] = locations[item.id][item.zone];
      return `<g data-decoration="${item.id}" transform="translate(${x} ${y})" aria-hidden="true">${decorationArt(item.id)}</g>`;
    }).join('');
  }
  function pond() {
    const fish = activeFish === null ? '' : `<g class="pond-response"><ellipse class="pond-ripple" cx="401" cy="162" rx="28" ry="7" fill="none" stroke="#e4f7f7" stroke-width="2"/><g class="pond-fish"><path d="M388 151h22v4h5v8h-5v4h-22v-4h-6v-8h6ZM415 154h8v12h-8Z" fill="${fishTypes[activeFish].color}"/><path d="M390 156h3v3h-3Z" fill="#254a58"/><path d="M397 152h9v3h-9Z" fill="#fff2c4"/></g></g>`;
    return control('pond', '轻点池塘，看看小鱼', `<path d="M304 156H456V164H480V172H282V164H304Z" fill="#91c3cc"/><path d="M328 160H388V164H328Z" fill="#d5edf0"/>${fish}`, [280,145,201,31]);
  }
  function visitPond() {
    clearTimeout(fishTimer);
    pondVisits++;
    activeFish = pondVisits % 4 === 0 ? 2 : (pondVisits - 1) % 2;
    const newFish = !discoveredFish.has(activeFish);
    discoveredFish.add(activeFish);
    message = `${fishTypes[activeFish].name}探出头，和你打了个招呼。${newFish ? '发现新朋友！' : ''}已见过 ${discoveredFish.size} / 3 种小鱼。`;
    fishTimer = setTimeout(() => {
      activeFish = null;
      const scene = document.getElementById('garden-scene');
      const focused = scene.contains(document.activeElement) ? document.activeElement.dataset.garden : null;
      scene.innerHTML = drawing();
      if (focused) scene.querySelector(`[data-garden="${focused}"]`)?.focus({preventScroll:true});
    }, 1800);
  }
  function shopContent() {
    return `<div class="dialog-heading"><h2 id="garden-shop-title">装扮我的果园</h2><button data-shop-close aria-label="关闭装扮">×</button></div><p class="garden-shop-intro">摘来的果子，换成喜欢的小风景。买下后可免费换位置、收起或摆回。</p><div class="garden-shop-balance">果篮 <strong>${basket}</strong> 颗 <span>小鱼朋友 ${discoveredFish.size} / 3</span></div><div class="garden-shop-items">${decorations.map(item => `<section class="garden-shop-item"><svg viewBox="0 0 68 64" shape-rendering="crispEdges" aria-hidden="true">${decorationArt(item.id)}</svg><div class="garden-shop-copy"><h3>${item.name}</h3><p>${item.note}</p>${item.owned ? `<span class="garden-owned">已拥有 · ${item.visible ? '正在摆放' : '已收起'}</span>` : `<span>${item.cost} 颗果子</span>`}</div><button data-decor-action="${item.id}" ${!enabled || (!item.owned && basket < item.cost) ? 'disabled' : ''}>${item.owned ? (item.visible ? '收起' : '摆回') : (basket < item.cost ? `还差 ${item.cost-basket} 颗` : '兑换')}</button>${item.owned ? `<fieldset class="garden-placement" ${!enabled ? 'disabled' : ''}><legend>${item.name}的位置</legend>${['左边','中间','右边'].map((label,zone) => `<button data-decor-zone="${item.id}-${zone}" aria-pressed="${item.zone === zone}">${label}</button>`).join('')}</fieldset>` : ''}</section>`).join('')}</div><p class="garden-shop-note" role="status">${enabled ? message : '互动已关闭，开启后可以继续装扮。'}<br>${persist ? '果园进度保存在这台设备上。' : '本次装扮保留到页面刷新。'}</p>`;
  }
  function updateShop(focusSelector) {
    if (!shop?.open) return;
    shop.innerHTML = shopContent();
    if (focusSelector) shop.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  function drawing() {
    return `<svg class="pixel-landscape" viewBox="0 0 1200 180" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="group" aria-label="可互动的像素果园"><path d="M0 140H140V132H270V140H420V124H560V132H730V140H900V128H1060V140H1200V180H0Z" fill="var(--meadow)"/><path d="M0 168H1200V180H0Z" fill="var(--meadow)"/>${[[60,43,1.1],[191,72,.8],[890,30,1.25],[1053,65,.9]].map(([x,y,s],i) => control(`tree-${i}`, `果树 ${i+1}，${fruit[i] ? '摘一颗果子' : '浇水让它再结果'}`, tree(x,y,s,fruit[i]), [x-4,y-4,104*s,110*s])).join('')}${pond()}<path d="M577 127H653V134H577ZM577 139H653V145H577Z" fill="#af8964"/><path d="M584 145H591V164H584ZM639 145H646V164H639Z" fill="#78614d"/><path d="M534 168H668V180H534Z" fill="#e1d6aa"/><path d="M38 158H42V167H38ZM36 161H44V164H36ZM843 160H847V169H843ZM840 163H850V166H840Z" fill="#f2f3d4"/>${trees.map(plantedTree).join('')}${placedDecorations()}${control('cat','摸摸小猫',cat(),[686,128,58,49])}</svg>`;
  }
  function scene() { return `<div class="garden-scene" id="garden-scene" data-interactive="${enabled}">${drawing()}</div>`; }
  function panel() {
    const growing = trees.filter(t => t.stage < 3 || !t.fruit).length;
    const basketIcon = '<svg viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><path d="M8 3h8v3h3v5h-3V6H8v5H5V6h3Z" fill="currentColor"/><path d="M3 10h18v3h-2v8H5v-8H3Z" fill="#af8964"/><path d="M8 13h2v6H8ZM14 13h2v6h-2Z" fill="#e9c386"/></svg>';
    const row = (id, icon, title, hint, disabled = false) => `<button class="garden-menu-action" data-garden="${id}" ${disabled ? 'disabled' : ''}><span class="garden-action-icon" aria-hidden="true"><i class="bi ${icon}"></i></span><span><strong>${title}</strong><small>${hint}</small></span><i class="bi bi-chevron-right" aria-hidden="true"></i></button>`;
    return `<div class="garden-panel" id="garden-panel" data-interactive="${enabled}">
      <div class="garden-dock"><p class="garden-message" id="garden-message" role="status" aria-live="polite">${message}</p><button class="garden-pocket" data-garden="menu" aria-expanded="${menuOpen}" aria-controls="garden-notebook" aria-label="我的果园，果篮 ${basket} 颗">${basketIcon}<span>我的果园</span><strong id="garden-basket">${basket}</strong><i class="bi bi-chevron-${menuOpen ? 'up' : 'down'}" aria-hidden="true"></i></button></div>
      <section class="garden-notebook" id="garden-notebook" aria-label="我的果园玩法" ${menuOpen ? '' : 'hidden'}>
        <header class="garden-notebook-heading"><div><span>随手照料的小天地</span><h2>我的小果园</h2></div><button data-garden="menu" class="garden-menu-close" aria-label="收起果园面板"><i class="bi bi-x-lg" aria-hidden="true"></i></button></header>
        <div class="garden-ledger"><span>${basketIcon}<strong>${basket}</strong> 颗果子</span><span>小树 ${trees.length}/3</span><span>小鱼 ${discoveredFish.size}/3</span></div>
        <div class="garden-menu-actions">${row('plant','bi-flower1','种下一棵',trees.length >= 3 ? '三棵小树都在这里了' : (basket < 3 ? `还差 ${3-basket} 颗果子` : '花 3 颗果子，种一点期待'),!enabled || basket < 3 || trees.length >= 3)}${row('water','bi-droplet','照料树苗',growing ? `${growing} 棵小树等你浇水` : (trees.length ? '小树已经结满果子了' : '种下第一棵，再来浇浇水'),!enabled || !growing)}${row('shop','bi-palette','装扮果园','花丛、灯笼，和你喜欢的小角落')}</div>
        <details class="garden-walk"><summary>去果园散个步 <i class="bi bi-chevron-down" aria-hidden="true"></i></summary><div>${row('pick','bi-basket','摘一颗果子','把今天的小收获装进果篮',!enabled)}${row('cat','bi-heart','摸摸小猫','它在长椅旁晒太阳',!enabled)}${row('pond','bi-water','到池塘坐坐',`已遇见 ${discoveredFish.size} 种小鱼`,!enabled)}</div></details>
        <footer class="garden-menu-footer"><button data-garden="help" aria-expanded="${helpOpen}" aria-controls="garden-guide">怎么玩</button><button class="garden-toggle" data-garden="toggle" role="switch" aria-checked="${enabled}" aria-label="果园互动"><span class="garden-switch" aria-hidden="true"></span>${enabled ? '互动开' : '互动关'}</button></footer>
        <div class="garden-guide" id="garden-guide" ${helpOpen ? '' : 'hidden'}><p>轻点果树摘果，空树再点一次就会浇水。花 3 颗种树，浇水三次后，小树就会结果。</p><p>果子可兑换花丛、灯笼和栅栏，买下后随时换位置。也可以点点小猫、池塘，看看它们的回应。</p><p>${persist ? '进度保存在这台设备上，下次打开还在。' : '这是体验原型，刷新会重新开始。'}</p></div>
      </section></div>`;
  }
  function update(focusId, shopFocus) {
    const walkOpen = host.querySelector('.garden-walk')?.open;
    const scrollTop = host.querySelector('.garden-notebook')?.scrollTop || 0;
    document.getElementById('garden-scene').dataset.interactive = String(enabled);
    document.getElementById('garden-scene').innerHTML = drawing();
    document.getElementById('garden-panel').outerHTML = panel();
    host.querySelector('.garden-walk').open = Boolean(walkOpen);
    adjustMenu();
    host.querySelector('.garden-notebook').scrollTop = scrollTop;
    updateShop(shopFocus);
    if (focusId) {
      const target = host.querySelector(`[data-garden="${focusId}"]`);
      (target?.disabled ? host.querySelector('.garden-pocket') : target)?.focus({preventScroll:true});
    }
  }
  function showHelp(open) {
    helpOpen = open;
    document.getElementById('garden-guide').hidden = !open;
    host.querySelector('[data-garden="help"]').setAttribute('aria-expanded',String(open));
  }
  function adjustMenu() {
    if (!menuOpen) return;
    const pocket = host.querySelector('.garden-pocket');
    const notebook = host.querySelector('.garden-notebook');
    notebook.style.setProperty('--garden-menu-height', `${Math.max(160, pocket.getBoundingClientRect().top - 24)}px`);
  }
  function closeMenu(returnFocus = false) {
    menuOpen = false;
    host.querySelector('.garden-notebook').hidden = true;
    const pocket = host.querySelector('.garden-pocket');
    pocket.setAttribute('aria-expanded','false');
    pocket.querySelector('i').className = 'bi bi-chevron-down';
    if (returnFocus) pocket.focus({preventScroll:true});
  }
  function snapshot() {
    return { version:1, enabled, basket, total, cats, pondVisits,
      fruit:[...fruit], trees:trees.map(tree => ({...tree})), fish:[...discoveredFish],
      decorations:decorations.map(({id,owned,visible,zone}) => ({id,owned,visible,zone})) };
  }
  function restore(value) {
    const state = PixelGardenState.normalize(value);
    enabled = state.enabled; basket = state.basket; total = state.total;
    cats = state.cats; pondVisits = state.pondVisits;
    fruit.splice(0,4,...state.fruit); trees.splice(0,trees.length,...state.trees);
    discoveredFish.clear(); state.fish.forEach(id => discoveredFish.add(id));
    decorations.forEach(item => Object.assign(item,state.decorations.find(saved => saved.id === item.id)));
    if (!enabled) message = '果园静静陪你。需要时，可以在「我的果园」里开启互动。';
  }
  function save() {
    if (!persist) return;
    const state = snapshot();
    saveQueue = saveQueue.then(() => chrome.storage.local.set({[STORAGE_KEY]:state})).catch(error => {
      console.warn('[PixelGarden] 果园存档失败:', error);
      message = '本次果园进度暂未保存，请稍后再试。';
      document.getElementById('garden-message').textContent = message;
    });
  }
  async function init(app) {
    persist = true;
    try { const saved = await chrome.storage.local.get(STORAGE_KEY); restore(saved[STORAGE_KEY]); }
    catch (error) { console.warn('[PixelGarden] 无法读取果园存档:',error); }
    document.getElementById('garden-scene-slot').innerHTML = scene();
    document.getElementById('garden-panel-slot').innerHTML = panel();
    bind(app);
  }
  function pop(target, text) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = target.getBoundingClientRect();
    const bubble = document.createElement('span'); bubble.className = 'garden-pop'; bubble.textContent = text;
    bubble.style.left = `${box.x+box.width/2}px`; bubble.style.top = `${box.y+box.height/2}px`;
    document.body.append(bubble); setTimeout(()=>bubble.remove(),800);
  }
  function harvest(index) {
    if (fruit[index] > 0) { fruit[index]--; basket++; total++; message = `收获一颗！果篮里有 ${basket} 颗，累计摘了 ${total} 颗。`; return '+1 🍊'; }
    fruit[index] = 3; message = '浇好水了，这棵果树又结了三颗果子。'; return '💧';
  }
  function water(index) {
    const item = trees[index];
    if (item.stage < 3) {
      item.stage++;
      if (item.stage === 3) { item.fruit = 3; message = '小树长大了！它结了三颗果子，点击就能收获。'; }
      else message = item.stage === 1 ? '树苗长出新叶子了，再浇两次水就能结果。' : '小树开花了，再浇一次水就能结果。';
      return '💧';
    }
    if (item.fruit > 0) { item.fruit--; basket++; total++; message = `收获了自己种的果子！果篮里有 ${basket} 颗。`; return '+1 🍊'; }
    item.fruit = 3; message = '浇好水了，小树又结了三颗果子。'; return '💧';
  }
  function act(target, keyboard) {
    const id = target.dataset.garden;
    if (id === 'menu') {
      menuOpen = !menuOpen; update('menu');
      if (menuOpen && keyboard) host.querySelector('.garden-menu-action:not(:disabled)')?.focus({preventScroll:true});
      return;
    }
    if (id === 'help') { showHelp(document.getElementById('garden-guide').hidden); return; }
    if (id === 'shop') { closeMenu(); shop.innerHTML = shopContent(); shop.showModal(); return; }
    if (id === 'toggle') {
      enabled = !enabled;
      clearTimeout(fishTimer); activeFish = null;
      message = enabled ? '果园醒来了。点果树摘果，或摸摸小猫。' : '互动已关闭，果园静静陪你。';
      update(keyboard ? id : null); save(); return;
    }
    if (!enabled || target.disabled) return;
    let effect;
    if (id.startsWith('tree-')) effect = harvest(Number(id.slice(5)));
    if (id.startsWith('plot-')) effect = water(Number(id.slice(5)));
    if (id === 'pick') {
      const index = fruit.findIndex(n=>n>0);
      if (index >= 0) effect = harvest(index);
      else { fruit[0]=3; message = '果树都摘完了，帮第一棵树浇水。再点一次就能收获。'; effect='💧'; }
    }
    if (id === 'plant' && basket>=3 && trees.length<plots.length) {
      basket -= 3; trees.push({stage:0,fruit:0}); message = '种下一棵小树苗！点击树苗或「浇水」照料它。'; effect='🌱';
    }
    if (id === 'water') { const index=trees.findIndex(t=>t.stage<3 || !t.fruit); if(index>=0) effect=water(index); }
    if (id === 'cat') {
      const lines = ['喵～这里有个晒太阳的好位置。','呼噜呼噜……小猫蹭了蹭你的手。','小猫伸了个懒腰，继续陪你上网。','喵！你的果园越来越热闹了。'];
      message = lines[cats++ % lines.length]; effect = '♥';
    }
    if (id === 'pond') visitPond();
    if (effect) pop(target,effect);
    update(keyboard ? id : null);
    save();
  }
  function bind(app) {
    host = app;
    shop = document.createElement('dialog');
    shop.id = 'garden-shop'; shop.className = 'garden-shop';
    shop.setAttribute('aria-labelledby','garden-shop-title');
    document.body.append(shop);
    shop.addEventListener('close', () => host.querySelector('.garden-pocket')?.focus({preventScroll:true}));
    shop.addEventListener('click', event => {
      if (event.target.closest('[data-shop-close]')) { shop.close(); return; }
      const action = event.target.closest('[data-decor-action]');
      const position = event.target.closest('[data-decor-zone]');
      if (!enabled || action?.disabled || position?.disabled) return;
      if (action) {
        const item = decorations.find(item => item.id === action.dataset.decorAction);
        if (!item.owned) {
          if (basket < item.cost) return;
          basket -= item.cost; item.owned = true;
          message = `${item.name}已经摆进果园！试试换个位置。`;
        } else {
          item.visible = !item.visible;
          message = `${item.name}${item.visible ? '摆回果园了' : '暂时收起来了'}，随时可以调整。`;
        }
        update(null, `[data-decor-action="${item.id}"]`);
        save();
      }
      if (position) {
        const [id,zone] = position.dataset.decorZone.split('-');
        const item = decorations.find(item => item.id === id);
        item.zone = Number(zone); item.visible = true;
        message = `${item.name}移到了果园${['左边','中间','右边'][item.zone]}。`;
        update(null, `[data-decor-zone="${position.dataset.decorZone}"]`);
        save();
      }
    });
    app.addEventListener('click', event => { const target=event.target.closest('[data-garden]'); if(target) act(target,event.detail===0); });
    app.addEventListener('keydown',event => {
      const target=event.target.closest('g[data-garden]');
      if(target && (event.key==='Enter' || event.key===' ')) { event.preventDefault(); act(target,true); }
    });
    document.addEventListener('pointerdown', event => {
      if (menuOpen && !event.target.closest('#garden-panel')) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menuOpen) { event.preventDefault(); closeMenu(true); }
    });
    document.addEventListener('focusin', event => {
      if (menuOpen && !event.target.closest('#garden-panel')) closeMenu();
    });
    window.addEventListener('resize',adjustMenu);
  }
  return {scene,panel,bind,init};
})();
