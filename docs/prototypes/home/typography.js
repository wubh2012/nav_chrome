// 临时字体探索：同一首页、同一组 60 个中英文网站，统一切换全页字体。
// 数据在内存中生成，不连接真实飞书账户，不写入正式扩展存储。
(() => {
  const groups = {
    '主页': [
      ['哔哩哔哩', 'bilibili.com', 'bi-play-btn'], ['知乎', 'zhihu.com', 'bi-chat-square-text'],
      ['豆瓣', 'douban.com', 'bi-book'], ['小红书', 'xiaohongshu.com', 'bi-journal-richtext'],
      ['少数派', 'sspai.com', 'bi-compass'], ['什么值得买', 'smzdm.com', 'bi-bag'],
      ['百度网盘', 'pan.baidu.com', 'bi-cloud'], ['阿里云盘', 'alipan.com', 'bi-cloud-arrow-up'],
      ['网易云音乐', 'music.163.com', 'bi-music-note-beamed'], ['微信公众平台', 'mp.weixin.qq.com', 'bi-chat-dots'],
      ['语雀', 'yuque.com', 'bi-journal-text'], ['飞书', 'feishu.cn', 'bi-send'],
      ['中国知网', 'cnki.net', 'bi-book-half'], ['中国大学慕课', 'icourse163.org', 'bi-mortarboard'],
      ['国家图书馆', 'nlc.cn', 'bi-bookshelf'], ['国家中小学智慧教育平台', 'smartedu.cn', 'bi-backpack']
    ],
    'AI': [
      ['豆包', 'doubao.com', 'bi-stars'], ['通义千问', 'tongyi.com', 'bi-chat-square'],
      ['腾讯元宝', 'yuanbao.tencent.com', 'bi-gem'], ['文心一言', 'yiyan.baidu.com', 'bi-chat-left-text'],
      ['智谱清言', 'chatglm.cn', 'bi-lightbulb'], ['秘塔AI搜索', 'metaso.cn', 'bi-search'],
      ['硅基流动', 'siliconflow.cn', 'bi-cpu'], ['即梦AI', 'jimeng.jianying.com', 'bi-image'],
      ['ChatGPT', 'chatgpt.com', 'bi-robot'], ['Claude', 'claude.ai', 'bi-flower1'],
      ['DeepSeek', 'deepseek.com', 'bi-water'], ['Kimi 智能助手', 'kimi.com', 'bi-moon-stars']
    ],
    'Code': [
      ['掘金', 'juejin.cn', 'bi-code-square'], ['菜鸟教程', 'runoob.com', 'bi-braces'],
      ['开源中国', 'oschina.net', 'bi-code-slash'], ['开发者社区', 'developer.aliyun.com', 'bi-terminal'],
      ['稀土技术社区', 'juejin.cn', 'bi-stack'], ['牛客网', 'nowcoder.com', 'bi-puzzle'],
      ['GitHub', 'github.com', 'bi-github'], ['Gitee 码云', 'gitee.com', 'bi-git'],
      ['MDN Web 文档', 'developer.mozilla.org', 'bi-file-code'], ['Stack Overflow', 'stackoverflow.com', 'bi-stack']
    ],
    '其他': [
      ['石墨文档', 'shimo.im', 'bi-file-text'], ['腾讯文档', 'docs.qq.com', 'bi-file-earmark-text'],
      ['ProcessOn', 'processon.com', 'bi-diagram-3'], ['幕布', 'mubu.com', 'bi-list-nested'],
      ['稿定设计', 'gaoding.com', 'bi-palette'], ['创客贴', 'chuangkit.com', 'bi-brush'],
      ['在线图片压缩', 'tinypng.com', 'bi-file-zip'], ['全国天气预报', 'weather.com.cn', 'bi-cloud-sun'],
      ['高德地图', 'amap.com', 'bi-map'], ['百度翻译', 'fanyi.baidu.com', 'bi-translate'],
      ['Notion', 'notion.so', 'bi-journal'], ['Figma', 'figma.com', 'bi-vector-pen'],
      ['Canva 可画', 'canva.cn', 'bi-easel'], ['小众软件', 'appinn.com', 'bi-window']
    ],
    '影视': [
      ['腾讯视频', 'v.qq.com', 'bi-camera-video'], ['爱奇艺', 'iqiyi.com', 'bi-play-circle'],
      ['优酷', 'youku.com', 'bi-film'], ['芒果TV', 'mgtv.com', 'bi-tv'],
      ['央视网', 'cctv.com', 'bi-broadcast'], ['电影天堂', 'dytt8.net', 'bi-ticket-perforated'],
      ['追剧小站', 'example.com', 'bi-collection-play'], ['动画收藏夹', 'example.org', 'bi-bookmark-heart']
    ]
  };
  const data = Object.fromEntries(Object.entries(groups).map(([category, sites]) => [category,
    sites.map(([name, domain, icon], index) => ({id: `type-${category}-${index}`, name, url: `https://${domain}`, icon, sort:index + 1}))
  ]));
  FeishuAPI.getMockData = () => data;
  const variants = {
    A: {name:'温和手写', font:'霞鹜文楷 TC', family:'TypeWenKai', note:'轻松、自然，像果园里的手写小牌子。', verdict:'适合每天打开的中文导航；我更推荐这个方向。'},
    B: {name:'圆润活泼', font:'站酷快乐体', family:'TypeKuaiLe', note:'圆润、饱满，水果和小猫的趣味更明显。', verdict:'更可爱、更有个性；长站名需要留意辨识度。'},
    C: {name:'复古像素', font:'缝合像素字体', family:'TypePixel', note:'方格字形，把文字也变成果园游戏的一部分。', verdict:'与像素场景最统一；复杂汉字在小字号下更费眼。'}
  };
  const keys = Object.keys(variants);
  let selected = new URLSearchParams(location.search).get('variant') || 'A';
  if (!variants[selected]) selected = 'A';
  document.body.dataset.fontVariant = selected;

  function setVariant(key) {
    selected = key;
    document.body.dataset.fontVariant = key;
    const url = new URL(location.href); url.searchParams.set('variant', key); history.replaceState(null,'',url);
    document.querySelectorAll('[data-font-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.fontChoice === key)));
    document.getElementById('type-current').textContent = `${key} · ${variants[key].font} · 网站名称 16px`;
    document.getElementById('type-description').textContent = variants[key].note;
  }
  function cycle(direction) { setVariant(keys[(keys.indexOf(selected) + direction + keys.length) % keys.length]); }
  function init() {
    const bar = document.createElement('aside'); bar.className = 'type-switcher'; bar.setAttribute('aria-label','字体探索方案切换');
    bar.innerHTML = `<div class="type-choices"><span class="type-tag">字体探索</span><button id="type-prev" aria-label="上一个字体方案">‹</button>${keys.map(key => `<button data-font-choice="${key}" aria-pressed="false">${key} ${variants[key].name}</button>`).join('')}<button id="type-next" aria-label="下一个字体方案">›</button><button id="type-compare">并排对比</button></div><div class="type-meta"><strong id="type-current"></strong><span id="type-description"></span><span>60 个示例网站 · 未应用到正式首页</span></div>`;
    document.body.appendChild(bar);
    const dialog = document.createElement('dialog'); dialog.className = 'type-comparison';
    dialog.innerHTML = `<div class="type-comparison-heading"><div><span>相同内容 · 相同字号 · 真实浏览器字体渲染</span><h2>哪一种中文，更像你的小果园？</h2></div><button id="type-close" aria-label="关闭字体对比">×</button></div><div class="type-comparison-grid">${keys.map(key => `<article class="type-specimen" data-specimen="${key}"><div class="type-specimen-meta"><b>${key} · ${variants[key].name}</b><span>${variants[key].font}</span></div><div class="type-sample-brand">水果导航</div><div class="type-sample-search"><i class="bi bi-search" aria-hidden="true"></i>找一条熟悉的小路…</div><div class="type-sample-categories">全部　主页　AI　Code　影视</div><div class="type-sample-heading">我的网站果园</div><div class="type-sample-sites">${['哔哩哔哩','什么值得买','网易云音乐','中国大学慕课','国家图书馆','微信公众平台','在线图片压缩','Kimi 智能助手','GitHub','MDN Web 文档'].map(name=>`<span>${name}</span>`).join('')}</div><div class="type-sample-caption">轻点果树、小猫或池塘，果园会回应你。</div><div class="type-sample-search-result"><strong>国家中小学智慧教育平台</strong><span>学习 · smartedu.cn</span></div><p>${variants[key].verdict}</p><button data-try="${key}">全页看看 ${key}</button></article>`).join('')}</div><p class="type-comparison-footnote">主要文字 16px；时间区域也使用相同字体。全页预览可切换分类、搜索，检查短中文、长中文和中英文混排。</p>`;
    document.body.appendChild(dialog);
    bar.querySelectorAll('[data-font-choice]').forEach(button => button.addEventListener('click',()=>setVariant(button.dataset.fontChoice)));
    document.getElementById('type-prev').addEventListener('click',()=>cycle(-1));
    document.getElementById('type-next').addEventListener('click',()=>cycle(1));
    document.getElementById('type-compare').addEventListener('click',()=>dialog.showModal());
    document.getElementById('type-close').addEventListener('click',()=>dialog.close());
    dialog.querySelectorAll('[data-try]').forEach(button=>button.addEventListener('click',()=>{setVariant(button.dataset.try);dialog.close();}));
    document.addEventListener('keydown', event => {
      if (event.target.closest('input, textarea, select, [contenteditable], dialog') || document.querySelector('dialog[open], .modal.active, .quick-search-modal.active')) return;
      if (event.key==='ArrowLeft' || event.key==='ArrowRight') { event.preventDefault(); cycle(event.key==='ArrowLeft' ? -1 : 1); }
    });
    setVariant(selected);
    if (new URLSearchParams(location.search).get('compare')==='1') dialog.showModal();
  }
  document.addEventListener('DOMContentLoaded',init);
})();
