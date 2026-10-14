/* 果园规则与存档边界：纯函数，不访问 DOM、Chrome API 或网络。 */
(function (root) {
  'use strict';
  const HOUR = 3600000;
  const KEY = 'chromeNav_orchard_v2';
  const LEGACY_KEY = 'chromeNav_pixelGarden_v1';
  const MAX_TREES = 7;
  const KINDS = { orange:{name:'橘树',color:'#edb56d',flower:'#fff0b8'},peach:{name:'桃树',color:'#efa6a2',flower:'#f6cad5'},apple:{name:'苹果树',color:'#dd8974',flower:'#fff0cf'} };
  const CROPS = { berry:{name:'小莓果',hours:6,yield:2},mint:{name:'薄荷',hours:3,yield:2,level:2} };
  const ROUTES = { grow:{name:'种植',icon:'flower1',reward:'薄荷种植',desc:'照料苗床与果树，看一点生长。',color:'#6f9470'},forage:{name:'采集',icon:'tree',reward:'隐蔽的苔藓角落',desc:'沿着小路，收好自然留下的小东西。',color:'#a29356'},fish:{name:'钓鱼',icon:'water',reward:'浅滩钓点',desc:'看看浮标，慢慢收线，认识水里的朋友。',color:'#6294a1'},craft:{name:'制作',icon:'tools',reward:'草木灯配方',desc:'把收获做成有用的小物和温暖的礼物。',color:'#b08c68'},friends:{name:'关系',icon:'heart',reward:'朋友的小信',desc:'聊聊天，送点小心意，慢慢听见更多故事。',color:'#b77f90'} };
  const DECOR = { flowers:{name:'小花丛',icon:'flower1',cost:2,note:'相邻的花丛会邀请蝴蝶'},lantern:{name:'暖灯笼',icon:'lamp',cost:3,note:'夜色中与花丛相伴，会有新来访者'},dish:{name:'果盘',icon:'basket',cost:2,note:'放在果树附近，邀请小麻雀'},bench:{name:'长椅',icon:'signpost',cost:3,note:'给朋友留一个休息位置'},bed:{name:'猫咪软垫',icon:'heart',cost:2,note:'长椅旁的小软垫，适合午睡'},bath:{name:'鸟儿水盆',icon:'water',cost:3,note:'放在河湾边，让鸟儿喝口水'},fence:{name:'木栅栏',icon:'bricks',cost:1,note:'围起自己喜欢的小角落'},path:{name:'小路石板',icon:'grid',cost:1,note:'一块块拼出自己的小路'} };
  const RECIPES = { jam:{name:'水果果酱',icon:'cup',cost:{fruit:2},output:'jam',note:'小栗喜欢把果酱带去林间野餐。'},tea:{name:'花果茶',icon:'cup-hot',cost:{fruit:2,greens:1},output:'tea',note:'带给朋友的一杯小温暖。'},soup:{name:'鲜鱼汤',icon:'water',cost:{fish:1,greens:1},output:'soup',note:'小橘很喜欢这一碗。'},cushion:{name:'编织软垫',icon:'heart',cost:{materials:2},output:'bed',note:'可以布置进果园，也可以送给小橘。'},lamp:{name:'草木灯',icon:'lamp',cost:{materials:3},output:'lantern',level:2,note:'留一盏温暖的小灯。'} };
  const CHARACTERS = { cat:{name:'小橘',prefers:['soup','cushion'],intro:'喜欢长椅、软垫，还有一碗热乎乎的汤。',stories:['它给你留了一个晒太阳的位置。','下雨时，它曾躲在桥下。现在它知道，长椅旁也有一个安心的角落。','它把一颗种子推向你：春天来的时候，我们一起看它开花吧。','它不再只是来访者。这个果园，也是它的小小家。']},chestnut:{name:'小栗',prefers:['jam','tea'],intro:'一位林间送信的小朋友，喜欢果酱和花果茶。',stories:['它路过果园，想在这里歇歇脚。','它每天替林子里的朋友送信。偶尔，也希望有人问问它今天过得怎么样。','它带来一张手绘地图，在你喜欢的角落画了一颗小小的星星。','“下一次没有信件，也可以来这里坐坐吗？”它笑着问你。']} };
  const FISH = { blue:{name:'蓝色小鱼',color:'#5f9cb9'},orange:{name:'橙色小鱼',color:'#e28a57'},gold:{name:'雨中金鱼',color:'#d7b76d'},moon:{name:'月光小鱼',color:'#b8d6d0'},silver:{name:'河湾银鱼',color:'#91b8b5'},shrimp:{name:'浅滩小虾',color:'#d3a29a'} };
  const CREATURES = { butterfly:'花间蝴蝶',sparrow:'果香麻雀',cat:'午睡小猫',bird:'河湾白鸟',moth:'灯下小飞蛾' };
  const GIFT_NAMES = {jam:'水果果酱',tea:'花果茶',soup:'鲜鱼汤',cushion:'编织软垫'};
  const SWATCHES = ['#e7a3b0','#e5c27b','#9cc2b3','#aaa7d0'];
  const TREE_POINTS = [[150,175],[330,210],[210,350],[600,230],[750,170],[845,295],[720,435]];
  const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj||{},key);
  const integer = (value,fallback=0,max=1000000) => Number.isSafeInteger(value)&&value>=0&&value<=max?value:fallback;
  const text = (value,fallback='',max=48) => typeof value==='string'?value.replace(/[\u0000-\u001f]/g,'').slice(0,max):fallback;
  const time = (value,fallback,now) => Number.isFinite(value)&&value>=0&&value<=now+366*24*HOUR?Math.floor(value):fallback;
  const enumValue = (obj,value,fallback) => own(obj,value)?value:fallback;
  const unique = (values,valid,max=200) => [...new Set((Array.isArray(values)?values:[]).filter(valid))].slice(-max);
  const clone = value => JSON.parse(JSON.stringify(value));
  function environment(now=Date.now()) {
    const date=new Date(now),day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    let hash=0;for(const c of day)hash=(hash*31+c.charCodeAt(0))>>>0;
    const hour=date.getHours();
    return {day,hour,night:hour>=18||hour<6,raining:hash%5===0};
  }
  function level(state,key) { return [0,3,7,12].filter(x=>state.life.skills[key]>=x).length; }
  function award(state,key,amount=1) { const before=level(state,key);state.life.skills[key]=Math.min(1000000,state.life.skills[key]+amount);const after=level(state,key);return after>before?`${ROUTES[key].name}达到 Lv.${after}${after===2?'，学会了「'+ROUTES[key].reward+'」':'，你已经越来越熟悉这件事了'}。`:''; }
  function fresh(now=Date.now()) {
    return { version:2,revision:0,createdAt:now,enabled:true,fruit:0,seeds:3,total:0,cats:0,fish:[],trees:Array.from({length:4},(_,i)=>({kind:['orange','peach','apple','orange'][i],name:`果树 ${i+1}`,plantedAt:now-9*HOUR,matureAt:now,readyAt:now,fruit:3,watered:false})),
      stone:false,chime:false,daily:[],rainDay:'',message:'轻点果树、池塘或小猫，果园会回应你。',
      landscape:{items:[{id:1,kind:'bench',x:640,y:160,turn:0,color:1}],bag:{flowers:2,lantern:1,dish:1,bench:0,bed:1,bath:1,fence:3,path:5},materials:3,nextId:2,discoveries:[],album:[]},
      life:{skills:{grow:0,forage:0,fish:0,craft:0,friends:0},plots:[null,null,null],inventory:{greens:0,fish:0,jam:0,tea:0,soup:0},catches:[],friends:{cat:{points:1},chestnut:{points:0}},letters:[]},layoutUndo:[] };
  }
  function normalizeLayout(value,defaults) {
    const items=[],ids=new Set();
    for(const item of (Array.isArray(value?.items)?value.items:defaults.items).slice(0,80)) {
      if(!own(DECOR,item?.kind))continue;
      const id=integer(item.id,0,1000000);if(!id||ids.has(id))continue;ids.add(id);
      items.push({id,kind:item.kind,x:Math.max(40,Math.min(860,integer(item.x,640,920))),y:Math.max(85,Math.min(515,integer(item.y,160,570))),turn:integer(item.turn,0,item.kind==='path'?3:1),color:integer(item.color,1,3)});
    }
    return {items,bag:Object.fromEntries(Object.keys(DECOR).map(k=>[k,integer(value?.bag?.[k],defaults.bag[k],1000)])),materials:integer(value?.materials,defaults.materials),nextId:Math.max(integer(value?.nextId,1),...items.map(i=>i.id+1))};
  }
  function migrate(value,now) {
    const state=fresh(now);
    state.enabled=value.enabled!==false;state.fruit=integer(value.basket);state.total=Math.max(state.fruit,integer(value.total));state.cats=integer(value.cats);
    state.trees.forEach((t,i)=>{t.fruit=integer(value.fruit?.[i],3,3);if(!t.fruit)t.readyAt=now+6*HOUR;});
    for(const old of (Array.isArray(value.trees)?value.trees:[]).slice(0,3)) {
      const stage=integer(old?.stage,0,3),matureAt=now+(3-stage)*3*HOUR;
      state.trees.push({kind:'orange',name:`小树 ${state.trees.length-3}`,plantedAt:now-stage*3*HOUR,matureAt,readyAt:stage===3&&!integer(old?.fruit,3,3)?now+6*HOUR:matureAt,fruit:stage===3?integer(old?.fruit,3,3):0,watered:false});
    }
    state.fish=unique(value.fish,id=>Number.isInteger(id)&&id>=0&&id<3).map(id=>['blue','orange','gold'][id]);
    for(const old of Array.isArray(value.decorations)?value.decorations:[]) {
      if(!own(DECOR,old?.id)||old.owned!==true)continue;
      const zone=integer(old.zone,1,2),positions={flowers:[[100,320],[580,320],[680,340]],lantern:[[220,300],[680,360],[820,190]],fence:[[180,240],[550,150],[830,360]]};
      if(!positions[old.id])continue;
      if(old.visible===false)state.landscape.bag[old.id]++;
      else {const [x,y]=positions[old.id][zone];state.landscape.items.push({id:state.landscape.nextId++,kind:old.id,x,y,turn:0,color:1});}
    }
    return state;
  }
  function normalize(value,now=Date.now()) {
    if(Number.isInteger(value?.version)&&value.version>2)throw new Error('这份果园存档来自更新的插件版本，请更新插件后继续。');
    if(value?.version===1)return migrate(value,now);
    const defaults=fresh(now);if(value?.version!==2)return defaults;
    const s=value,land=normalizeLayout(s.landscape,defaults.landscape),life=s.life||{};
    return {version:2,revision:integer(s.revision),createdAt:time(s.createdAt,now,now),enabled:s.enabled!==false,fruit:integer(s.fruit),seeds:integer(s.seeds,3),total:Math.max(integer(s.fruit),integer(s.total)),cats:integer(s.cats),fish:unique(s.fish,id=>own(FISH,id)),
      trees:(Array.isArray(s.trees)?s.trees:defaults.trees).slice(0,MAX_TREES).map((t,i)=>({kind:enumValue(KINDS,t?.kind,'orange'),name:text(t?.name,`果树 ${i+1}`),plantedAt:time(t?.plantedAt,now,now),matureAt:time(t?.matureAt,now+9*HOUR,now),readyAt:time(t?.readyAt,now+9*HOUR,now),fruit:integer(t?.fruit,0,3),watered:t?.watered===true})),
      stone:s.stone===true,chime:s.chime===true,daily:unique(s.daily,k=>typeof k==='string'&&/^\d{4}-\d{2}-\d{2}:(forage:(branch|petal|seed|moss)|fish:(blue|orange|gold|moon|silver|shrimp)|talk:(cat|chestnut)|gift:(cat|chestnut)|pet:cat)$/.test(k),400),rainDay:text(s.rainDay),message:text(s.message,defaults.message,220),
      landscape:{...land,discoveries:unique(s.landscape?.discoveries,id=>own(CREATURES,id),5),album:unique(s.landscape?.album,id=>['树枝','落下的花瓣','发光叶片','一颗野生种子','河边小石头','隐蔽的小苔藓'].includes(id),6)},
      life:{skills:Object.fromEntries(Object.keys(ROUTES).map(k=>[k,integer(life.skills?.[k])])),plots:Array.from({length:3},(_,i)=>{const p=life.plots?.[i];return own(CROPS,p?.kind)?{kind:p.kind,readyAt:time(p.readyAt,now+CROPS[p.kind].hours*HOUR,now),watered:p.watered===true}:null;}),inventory:Object.fromEntries(Object.keys(defaults.life.inventory).map(k=>[k,integer(life.inventory?.[k])])),catches:unique(life.catches,id=>own(FISH,id),6),friends:Object.fromEntries(Object.keys(CHARACTERS).map(id=>[id,{points:integer(life.friends?.[id]?.points,defaults.life.friends[id].points,10000)}])),letters:unique(life.letters,k=>typeof k==='string'&&/^(cat|chestnut):[123]$/.test(k),6)},
      layoutUndo:(Array.isArray(s.layoutUndo)?s.layoutUndo:[]).slice(-10).map(h=>({...normalizeLayout(h,defaults.landscape),craftXp:integer(h?.craftXp)}))};
  }
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function habitats(state,env) {
    const of=kind=>state.landscape.items.filter(i=>i.kind===kind),result=[];
    const add=(id,position)=>{if(position)result.push({...position,id});};
    add('butterfly',of('flowers').find(a=>of('flowers').some(b=>a.id!==b.id&&distance(a,b)<145)));
    add('sparrow',of('dish').find(a=>TREE_POINTS.slice(0,state.trees.length).some(([x,y])=>distance(a,{x,y})<190)));
    add('cat',of('bed').find(a=>of('bench').some(b=>distance(a,b)<130)));
    add('bird',of('bath').find(i=>i.x>290&&i.x<620));
    if(env.night)add('moth',of('lantern').find(a=>of('flowers').some(b=>distance(a,b)<160)));
    return result;
  }
  function forageSlots(state,env) {
    const ordinal=Math.floor(new Date(env.day+'T12:00:00').getTime()/(24*HOUR));
    const slots=[{id:'branch',name:'树枝',kind:'branch',x:75+ordinal%3*35,y:310},{id:'petal',name:env.night?'发光叶片':'落下的花瓣',kind:env.night?'leaf':'petal',x:560+ordinal%2*75,y:320},{id:'seed',name:ordinal%2?'一颗野生种子':'河边小石头',kind:ordinal%2?'seed':'stone',x:275,y:175+ordinal%3*20}];
    if(level(state,'forage')>=2)slots.push({id:'moss',name:'隐蔽的小苔藓',kind:'leaf',x:520,y:510});
    return slots.filter(i=>!state.daily.includes(`${env.day}:forage:${i.id}`));
  }
  function validPosition(state,point,ignoreId) {
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<40||point.x>860||point.y<85||point.y>515)return false;
    const riverX=point.y<140?480:point.y<265?450:point.y<340?423:390;
    if(Math.abs(point.x-riverX)<56)return false;
    if(point.x>540&&point.x<665&&point.y>365&&point.y<475)return false;
    if(point.x>700&&point.x<810&&point.y>240&&point.y<350)return false;
    if(point.x>110&&point.x<345&&point.y>390&&point.y<450)return false;
    return !state.landscape.items.some(i=>i.id!==ignoreId&&i.kind!=='path'&&distance(i,point)<35);
  }
  function advance(state,now=Date.now()) {
    const env=environment(now);
    if(env.raining&&state.rainDay!==env.day) {
      state.rainDay=env.day;
      state.trees.forEach(t=>{if(!t.watered&&!t.fruit&&t.readyAt>now){t.watered=true;t.readyAt=Math.max(now,t.readyAt-HOUR);t.matureAt=Math.max(t.plantedAt,t.matureAt-HOUR);}});
      state.life.plots.forEach(p=>{if(p&&!p.watered&&p.readyAt>now){p.watered=true;p.readyAt=Math.max(now,p.readyAt-HOUR);}});
    }
    state.trees.forEach(t=>{if(!t.fruit&&now>=t.readyAt)t.fruit=3;});
    habitats(state,env).forEach(h=>{if(!state.landscape.discoveries.includes(h.id))state.landscape.discoveries.push(h.id);});
    return state;
  }
  function fishAt(state,place,env) {
    if(!['pond','river','shallows'].includes(place))throw new Error('请选择一个钓点。');
    if(place==='shallows'&&level(state,'fish')<2)throw new Error('钓鱼达到 Lv.2 后，可以到浅滩坐坐。');
    return env.night?'moon':env.raining?'gold':place==='river'?'silver':place==='shallows'?'shrimp':'blue';
  }
  function giftCount(state,key){return key==='cushion'?state.landscape.bag.bed:state.life.inventory[key]||0;}
  function resourceCount(state,key){return key==='fruit'?state.fruit:key==='materials'?state.landscape.materials:state.life.inventory[key]||0;}
  function spend(state,key,n){if(key==='fruit')state.fruit-=n;else if(key==='materials')state.landscape.materials-=n;else state.life.inventory[key]-=n;}
  function letters(state,id) {if(level(state,'friends')<2)return '';let added=false;const chapter=Math.min(3,Math.floor(state.life.friends[id].points/2));for(let n=1;n<=chapter;n++){const key=id+':'+n;if(!state.life.letters.includes(key)){state.life.letters.push(key);state.seeds++;added=true;}}return added?'朋友留下一封小信，还送来一颗种子。':'';}
  function layoutSnapshot(state) {return {...clone(state.landscape),craftXp:state.life.skills.craft};}
  function transition(value,action,now=Date.now()) {
    const state=advance(normalize(value,now),now),env=environment(now),before=JSON.stringify(state);
    const fail=message=>({state,changed:JSON.stringify(value)!==JSON.stringify(state),ok:false,message});
    if(!action||typeof action.type!=='string')return fail('果园操作无法识别。');
    if(action.type==='read')return {state,changed:JSON.stringify(value)!==JSON.stringify(state),ok:true,message:''};
    if(action.type==='toggle'){state.enabled=!state.enabled;state.layoutUndo=[];state.revision++;return {state,changed:true,ok:true,message:state.enabled?'果园醒来了。':'互动已关闭，果园静静陪你。'};}
    if(!state.enabled)return fail('先在「我的果园」里开启互动，再继续照料。');
    let message='',upgrade='',isLayout=false,fishing=null;
    const requireValue=(condition,message)=>{if(!condition)throw new Error(message);};
    const daily=key=>`${env.day}:${key}`;
    const pushLayout=()=>{state.layoutUndo.push(layoutSnapshot(state));state.layoutUndo=state.layoutUndo.slice(-10);isLayout=true;};
    try {
      if(action.type==='plant-tree') {requireValue(own(KINDS,action.kind),'请选择一种果树。');requireValue(state.seeds>0&&state.trees.length<MAX_TREES,'种子不足，或小树已经种满了。');state.seeds--;state.trees.push({kind:action.kind,name:`${KINDS[action.kind].name} ${state.trees.length+1} 号`,plantedAt:now,matureAt:now+9*HOUR,readyAt:now+9*HOUR,fruit:0,watered:false});upgrade=award(state,'grow');message='种下一点期待，它会慢慢长大。';}
      else if(action.type==='tree-water'||action.type==='tree-harvest') {
        const t=state.trees[action.index];requireValue(t&&Number.isInteger(action.index),'这棵小树暂时找不到了。');
        if(action.type==='tree-harvest'){requireValue(t.fruit>0,'果实还在慢慢长大。');const n=t.fruit;state.fruit+=n;state.total+=n;t.fruit=0;t.readyAt=now+6*HOUR;t.watered=false;upgrade=award(state,'grow',2);message=`收获 ${n} 颗果子，果篮里有 ${state.fruit} 颗。`;}
        else {requireValue(!t.watered&&!t.fruit,'这棵树已经照料过了。');t.watered=true;t.readyAt=Math.max(now,t.readyAt-2*HOUR);t.matureAt=Math.max(t.plantedAt,t.matureAt-2*HOUR);upgrade=award(state,'grow');message='浇好水了，它长得快了一点。';}
      }
      else if(action.type==='sow') {const c=CROPS[action.kind];requireValue(own(CROPS,action.kind)&&Number.isInteger(action.index)&&action.index>=0&&action.index<3,'请选择一种作物和苗床。');requireValue(!state.life.plots[action.index]&&state.seeds>0,'这块苗床已经种好了，或种子还不够。');requireValue(!c.level||level(state,'grow')>=c.level,'种植达到 Lv.2 后会学会种薄荷。');state.seeds--;state.life.plots[action.index]={kind:action.kind,readyAt:now+c.hours*HOUR,watered:false};upgrade=award(state,'grow');message=`种下一份${c.name}。`;}
      else if(action.type==='crop-water'||action.type==='crop-harvest') {const p=state.life.plots[action.index];requireValue(p&&Number.isInteger(action.index),'这块苗床还没有种下作物。');if(action.type==='crop-water'){requireValue(!p.watered&&now<p.readyAt,'苗床已经喝过水了。');p.watered=true;p.readyAt=Math.max(now,p.readyAt-HOUR);upgrade=award(state,'grow');message='苗床喝过水了。';}else {requireValue(now>=p.readyAt,'作物还在慢慢长大。');const c=CROPS[p.kind];if(p.kind==='berry'){state.fruit+=c.yield;state.total+=c.yield;}else state.life.inventory.greens+=c.yield;state.seeds++;state.life.plots[action.index]=null;upgrade=award(state,'grow',2);message=`收获 ${c.yield} 份${c.name}，留下一颗种子。`;}}
      else if(action.type==='forage') {const slot=forageSlots(state,env).find(i=>i.id===action.id);requireValue(slot,'今天的这份小发现已经收好了。');state.daily.push(daily('forage:'+slot.id));state.landscape.materials++;if(!state.landscape.album.includes(slot.name))state.landscape.album.push(slot.name);if(slot.kind==='seed')state.seeds++;if(['leaf','petal'].includes(slot.kind))state.life.inventory.greens++;upgrade=award(state,'forage');message=`拾到${slot.name}，收好一份自然素材。`;}
      else if(action.type==='fish-catch'||action.type==='fish-reel') {
        const id=fishAt(state,action.place,env),key=daily('fish:'+id);
        if(action.type==='fish-reel')requireValue(Number.isFinite(action.roll)&&action.roll>=0&&action.roll<1,'这次收线暂时无法确认，请再试一次。');
        if(action.type==='fish-reel'&&action.roll>=.75){fishing={outcome:'miss',fish:null};message='小鱼轻轻游走了。这次没钓中，再抛一竿试试吧。';}
        else if(action.type==='fish-reel'&&state.daily.includes(key)){fishing={outcome:'released',fish:id};message=`又钓到${FISH[id].name}。今天已经收获过它了，轻轻放归水中。`;}
        else {requireValue(!state.daily.includes(key),`又遇见${FISH[id].name}，今天已经记录过它了。这次轻轻放回水里。`);state.daily.push(key);state.life.inventory.fish++;if(!state.life.catches.includes(id))state.life.catches.push(id);if(!state.fish.includes(id))state.fish.push(id);upgrade=award(state,'fish',2);message=`钓到${FISH[id].name}，收进鱼篓。`;fishing={outcome:'caught',fish:id};}
      }
      else if(action.type==='observe') {const id=env.night?'moon':env.raining?'gold':'blue';if(!state.fish.includes(id))state.fish.push(id);message=`${FISH[id].name}和你打了个招呼。`;}
      else if(action.type==='recipe') {const r=RECIPES[action.id];requireValue(own(RECIPES,action.id),'这份配方暂时没有收录。');requireValue(!r.level||level(state,'craft')>=r.level,'制作达到 Lv.2 后会学会这份配方。');requireValue(Object.entries(r.cost).every(([k,n])=>resourceCount(state,k)>=n),'材料还不够，可以去果园走走。');Object.entries(r.cost).forEach(([k,n])=>spend(state,k,n));if(own(DECOR,r.output))state.landscape.bag[r.output]++;else state.life.inventory[r.output]++;upgrade=award(state,'craft');message=`做好了一份${r.name}。`;}
      else if(['chat','gift','pet'].includes(action.type)) {const id=action.type==='pet'?'cat':action.id;requireValue(own(CHARACTERS,id),'这位朋友暂时不在这里。');const f=state.life.friends[id],key=daily(action.type==='pet'?'pet:cat':(action.type==='chat'?'talk:':'gift:')+id);requireValue(!state.daily.includes(key),'今天已经打过招呼了，再坐一会儿吧。');if(action.type==='gift'){requireValue(own(GIFT_NAMES,action.gift)&&giftCount(state,action.gift)>0,'背包里还没有这份礼物。');if(action.gift==='cushion')state.landscape.bag.bed--;else state.life.inventory[action.gift]--;f.points+=CHARACTERS[id].prefers.includes(action.gift)?2:1;message=`${CHARACTERS[id].name}收下了${GIFT_NAMES[action.gift]}。`;}else {f.points++;if(action.type==='pet')state.cats++;message=action.type==='pet'?'小橘蹭了蹭你的手。':`和${CHARACTERS[id].name}聊了聊今天。`;}state.daily.push(key);upgrade=award(state,'friends');message+=letters(state,id);}
      else if(action.type==='stone'||action.type==='chime') {const solved=action.type;requireValue(!state[solved],'这个小秘密已经记在手记里了。');requireValue(solved==='stone'?action.answer==='stone':Array.isArray(action.tones)&&action.tones.join(',')==='high,low,middle','慢慢试，没有关系。再观察一下这里。');state[solved]=true;if(solved==='stone')state.seeds++;else {state.fruit+=2;state.total+=2;}message=solved==='stone'?'你发现了小叶精灵！它送来一颗种子。':'小麻雀开心地拍了拍翅膀，给你带来 2 颗果子。';}
      else if(action.type==='decor-craft') {requireValue(own(DECOR,action.kind),'请选择一个物件。');const c=DECOR[action.kind];requireValue(state.landscape.materials>=c.cost,'素材还不够，可以去小路上拾取。');requireValue(state.landscape.bag[action.kind]<1000,'背包已经装满这种物件了。');pushLayout();state.landscape.materials-=c.cost;state.landscape.bag[action.kind]++;upgrade=award(state,'craft');message=`做好了一件${c.name}。`;}
      else if(action.type==='decor-place'||action.type==='decor-move') {const item=state.landscape.items.find(i=>i.id===action.id),moving=action.type==='decor-move';requireValue(moving?!!item:own(DECOR,action.kind),'这个物件暂时找不到了。');const point={x:Math.round(action.x/20)*20,y:Math.round(action.y/20)*20};requireValue(validPosition(state,point,moving?item.id:null),'这里留给河流、苗床、谜题或其他物件，换一块空地试试。');if(!moving){requireValue(state.landscape.bag[action.kind]>0,'背包里还没有这一件，可以先用素材制作。');requireValue(state.landscape.items.length<80,'已经摆下很多小风景了，可以先收回一些。');}pushLayout();if(moving)Object.assign(item,point);else {state.landscape.bag[action.kind]--;state.landscape.items.push({id:state.landscape.nextId++,kind:action.kind,...point,color:1,turn:0});}message='小角落摆好了。';}
      else if(['decor-store','decor-turn','decor-color'].includes(action.type)) {const item=state.landscape.items.find(i=>i.id===action.id);requireValue(item,'这个物件暂时找不到了。');if(action.type==='decor-color')requireValue(Number.isInteger(action.color)&&action.color>=0&&action.color<4,'请选择一款配色。');pushLayout();if(action.type==='decor-store'){state.landscape.bag[item.kind]++;state.landscape.items=state.landscape.items.filter(i=>i.id!==item.id);}else if(action.type==='decor-turn')item.turn=(item.turn+1)%(item.kind==='path'?4:2);else item.color=action.color;message='小角落已经调整好了。';}
      else if(action.type==='decor-undo') {requireValue(action.expectedRevision===state.revision&&state.layoutUndo.length>0,'布置已被其他操作更新，保留了最新进度。');const previous=state.layoutUndo.pop();const {craftXp,...land}=previous;Object.assign(state.landscape,land);state.life.skills.craft=craftXp;isLayout=true;message='撤销了上一次布置。';}
      else return fail('果园操作无法识别。');
    } catch(error) {return fail(error.message);}
    if(!isLayout&&(!fishing||fishing.outcome==='caught'))state.layoutUndo=[];
    state.daily=state.daily.slice(-400);state.message=message+upgrade;advance(state,now);
    const changed=JSON.stringify(state)!==before;if(changed)state.revision++;
    return {state,changed:true,ok:true,message:state.message,...(fishing?{fishing}:{})};
  }
  const api={KEY,LEGACY_KEY,HOUR,MAX_TREES,KINDS,CROPS,ROUTES,DECOR,RECIPES,CHARACTERS,FISH,CREATURES,GIFT_NAMES,SWATCHES,TREE_POINTS,fresh,normalize,environment,level,award,advance,transition,habitats,forageSlots,validPosition,fishAt,giftCount,resourceCount};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.OrchardCore=api;
})(typeof globalThis==='object'?globalThis:this);
