const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/modules/orchard-core.js');
const Service = require('../js/modules/orchard-service.js');
const now = new Date(2026,9,14,13).getTime();
const step = (state,action,at=now) => C.transition(state,action,at);

test('旧存档迁移保留四棵果树、三棵树苗、果篮、装饰、鱼和关闭状态', () => {
  const old={version:1,enabled:false,basket:17,total:21,cats:8,fruit:[0,1,2,3],trees:[{stage:0,fruit:0},{stage:2,fruit:0},{stage:3,fruit:2}],fish:[0,1,2],decorations:[{id:'flowers',owned:true,visible:false,zone:2},{id:'lantern',owned:true,visible:true,zone:1}]};
  const before=JSON.stringify(old),state=C.normalize(old,now);
  assert.equal(state.enabled,false);assert.equal(state.fruit,17);assert.equal(state.total,21);assert.equal(state.cats,8);assert.equal(state.trees.length,7);
  assert.deepEqual(state.trees.slice(0,4).map(t=>t.fruit),[0,1,2,3]);assert.equal(state.trees[6].fruit,2);
  assert.equal(state.trees[4].readyAt,now+9*C.HOUR);assert.equal(state.trees[5].readyAt,now+3*C.HOUR);
  assert.deepEqual(state.fish,['blue','orange','gold']);assert.equal(state.landscape.bag.flowers,3);assert.ok(state.landscape.items.some(i=>i.kind==='lantern'));
  assert.equal(JSON.stringify(old),before);
});

test('损坏存档过滤未知字段、负数、非法物件与重复 ID，未来版本不被覆盖', () => {
  const fresh=C.fresh(now);fresh.fruit=-3;fresh.life.skills.grow=Infinity;fresh.life.inventory.fish=-9;
  fresh.landscape.items=[{id:1,kind:'bench',x:99999,y:-10},{id:1,kind:'bed',x:50,y:100},{id:4,kind:'<script>'}];
  fresh.life.letters=['cat:1','cat:1','evil:3'];fresh.daily=['<img>','2026-10-14:fish:blue'];fresh.landscape.bag.__proto__={evil:3};
  const state=C.normalize(fresh,now);assert.equal(state.fruit,0);assert.equal(state.life.skills.grow,0);assert.equal(state.life.inventory.fish,0);assert.equal(state.landscape.items.length,1);assert.ok(state.landscape.items[0].x<=860);
  assert.deepEqual(state.life.letters,['cat:1']);assert.deepEqual(state.daily,['2026-10-14:fish:blue']);assert.equal(state.landscape.bag.evil,undefined);
  assert.throws(()=>C.normalize({version:3},now),/更新/);
});

test('时间推进恢复离线生长，重复收获不能再次获得资源', () => {
  let s=step(C.fresh(now),{type:'plant-tree',kind:'peach'}).state;
  const index=s.trees.length-1;
  assert.equal(step(s,{type:'tree-harvest',index}).ok,false);
  const watered=step(s,{type:'tree-water',index});s=watered.state;
  assert.equal(step(s,{type:'tree-water',index}).ok,false);
  assert.equal(s.trees[index].readyAt,now+7*C.HOUR);
  const harvest=step(s,{type:'tree-harvest',index},now+7*C.HOUR);assert.equal(harvest.ok,true);assert.equal(harvest.state.fruit,3);
  assert.equal(step(harvest.state,{type:'tree-harvest',index},now+7*C.HOUR).ok,false);
  assert.equal(harvest.state.trees[index].readyAt,now+13*C.HOUR);
});

test('苗床种植、浇水、成熟收获和薄荷解锁只增长种植路线', () => {
  let s=C.fresh(now);
  assert.equal(step(s,{type:'sow',kind:'mint',index:0}).ok,false);
  s=step(s,{type:'sow',kind:'berry',index:0}).state;s=step(s,{type:'crop-water',index:0}).state;
  assert.equal(step(s,{type:'crop-water',index:0}).ok,false);
  assert.equal(step(s,{type:'crop-harvest',index:0}).ok,false);
  s=step(s,{type:'crop-harvest',index:0},now+5*C.HOUR).state;
  assert.equal(s.fruit,2);assert.equal(s.seeds,3);assert.equal(C.level(s,'grow'),2);
  assert.equal(step(s,{type:'sow',kind:'mint',index:0},now+5*C.HOUR).ok,true);
  for(const key of ['forage','fish','craft','friends'])assert.equal(s.life.skills[key],0);
});

test('采集每天只奖励一次，升到 Lv.2 后出现隐藏角落', () => {
  let s=C.fresh(now);
  for(const id of ['branch','petal','seed'])s=step(s,{type:'forage',id}).state;
  assert.equal(C.level(s,'forage'),2);assert.equal(s.life.inventory.greens,1);assert.equal(s.landscape.materials,6);
  assert.equal(step(s,{type:'forage',id:'branch'}).ok,false);
  assert.ok(C.forageSlots(s,C.environment(now)).some(i=>i.id==='moss'));
  assert.equal(step(s,{type:'forage',id:'branch'},now+24*C.HOUR).ok,true);
});

test('钓点、昼夜和果园天气决定鱼，首次收获升级并开放浅滩', () => {
  let s=C.fresh(now);assert.equal(step(s,{type:'fish-catch',place:'shallows'}).ok,false);
  s=step(s,{type:'fish-catch',place:'pond'}).state;s=step(s,{type:'fish-catch',place:'river'}).state;
  assert.equal(C.level(s,'fish'),2);assert.equal(s.life.inventory.fish,2);assert.deepEqual(s.life.catches,['blue','silver']);
  assert.equal(step(s,{type:'fish-catch',place:'pond'}).ok,false);
  s=step(s,{type:'fish-catch',place:'shallows'}).state;assert.ok(s.life.catches.includes('shrimp'));
  assert.equal(C.fishAt(s,'pond',{night:true,raining:false}),'moon');assert.equal(C.fishAt(s,'river',{night:false,raining:true}),'gold');
  assert.equal(step(s,{type:'fish-catch',place:'evil'}).ok,false);
});

test('制作真实扣除收获，喜欢的礼物推进朋友故事并记下小信', () => {
  let s=C.fresh(now);s.fruit=10;s.life.inventory.greens=2;
  s=step(s,{type:'recipe',id:'jam'}).state;s=step(s,{type:'recipe',id:'tea'}).state;s=step(s,{type:'recipe',id:'cushion'}).state;
  assert.equal(s.fruit,6);assert.equal(s.life.inventory.greens,1);assert.equal(C.level(s,'craft'),2);assert.equal(s.landscape.bag.bed,2);
  assert.equal(step(s,{type:'recipe',id:'soup'}).ok,false);
  s=step(s,{type:'chat',id:'chestnut'}).state;s=step(s,{type:'gift',id:'chestnut',gift:'tea'}).state;
  assert.equal(s.life.inventory.tea,0);assert.equal(s.life.friends.chestnut.points,3);assert.equal(step(s,{type:'chat',id:'chestnut'}).ok,false);
  s=step(s,{type:'chat',id:'cat'}).state;assert.equal(C.level(s,'friends'),2);assert.ok(s.life.letters.includes('cat:1'));assert.equal(s.seeds,4);
  assert.equal(step(s,{type:'gift',id:'cat',gift:'__proto__'}).ok,false);
});

test('布置保护河流、苗床和谜题，收回、转向和撤销保留资源守恒', () => {
  let s=C.fresh(now);assert.equal(step(s,{type:'decor-place',kind:'flowers',x:420,y:320}).ok,false);assert.equal(step(s,{type:'decor-place',kind:'flowers',x:225,y:420}).ok,false);
  assert.equal(step(s,{type:'decor-place',kind:'flowers',x:600,y:400}).ok,false);
  s=step(s,{type:'decor-place',kind:'flowers',x:560,y:320}).state;
  const id=s.landscape.nextId-1;assert.equal(s.landscape.bag.flowers,1);
  s=step(s,{type:'decor-color',id,color:0}).state;s=step(s,{type:'decor-turn',id}).state;s=step(s,{type:'decor-store',id}).state;
  assert.equal(s.landscape.bag.flowers,2);
  s=step(s,{type:'decor-undo',expectedRevision:s.revision}).state;assert.equal(s.landscape.bag.flowers,1);assert.ok(s.landscape.items.some(i=>i.id===id));
  assert.equal(step(s,{type:'decor-undo',expectedRevision:0}).ok,false);
});

test('撤销恢复制作经验，其他操作发生后不能撤回旧资源', () => {
  let s=C.fresh(now);s=step(s,{type:'decor-craft',kind:'fence'}).state;assert.equal(s.life.skills.craft,1);
  s=step(s,{type:'decor-undo',expectedRevision:s.revision}).state;assert.equal(s.life.skills.craft,0);assert.equal(s.landscape.materials,3);assert.equal(s.landscape.bag.fence,3);
  s=step(s,{type:'decor-craft',kind:'fence'}).state;s=step(s,{type:'forage',id:'branch'}).state;
  assert.equal(step(s,{type:'decor-undo',expectedRevision:s.revision}).ok,false);
});

test('动物根据物件组合来访，记录保留；关闭互动阻止资源操作', () => {
  let s=C.fresh(now);s=step(s,{type:'decor-place',kind:'flowers',x:560,y:320}).state;s=step(s,{type:'decor-place',kind:'flowers',x:660,y:320}).state;
  assert.ok(s.landscape.discoveries.includes('butterfly'));
  s=step(s,{type:'decor-store',id:3}).state;assert.equal(C.habitats(s,C.environment(now)).some(i=>i.id==='butterfly'),false);assert.ok(s.landscape.discoveries.includes('butterfly'));
  s=step(s,{type:'toggle'}).state;assert.equal(s.enabled,false);assert.equal(step(s,{type:'tree-harvest',index:0}).ok,false);assert.equal(step(s,{type:'toggle'}).state.enabled,true);
});

test('无效操作不修改传入状态，失败返回不消耗资源', () => {
  const s=C.fresh(now),before=JSON.stringify(s);
  for(const action of [{type:'recipe',id:'bad'},{type:'decor-place',kind:'bed',x:NaN,y:3},{type:'gift',id:'nobody',gift:'tea'},{type:'sow',index:-1,kind:'berry'},{type:'stone',answer:'fruit'},{type:'chime',tones:['high','high','high']}]){const r=step(s,action);assert.equal(r.ok,false);assert.equal(r.state.fruit,s.fruit);assert.equal(r.state.seeds,s.seeds);}
  assert.equal(JSON.stringify(s),before);
});

test('后台将同时收获串行化，一棵树只提交一次收获', async () => {
  const data={[C.KEY]:C.fresh(now)},storage={async get(){await new Promise(r=>setImmediate(r));return structuredClone(data);},async set(value){await new Promise(r=>setImmediate(r));Object.assign(data,structuredClone(value));}};
  const service=Service.create(storage,()=>now);
  const responses=await Promise.all(Array.from({length:8},()=>service.handle({action:{type:'tree-harvest',index:0}})));
  assert.equal(responses.filter(r=>r.success).length,1);assert.equal(data[C.KEY].fruit,3);assert.equal(data[C.KEY].life.skills.grow,2);
});

test('后台并发采集不覆盖，写入失败保留旧存档且队列可以继续', async () => {
  const old={version:1,basket:5,fruit:[3,3,3,3]},data={[C.LEGACY_KEY]:old};let fail=true;
  const storage={async get(){return structuredClone(data);},async set(value){if(fail){fail=false;throw new Error('write failed');}Object.assign(data,structuredClone(value));}};
  const service=Service.create(storage,()=>now);await assert.rejects(service.handle({action:{type:'read'}}),/write failed/);
  assert.deepEqual(data[C.LEGACY_KEY],old);assert.equal(data[C.KEY],undefined);
  await service.handle({action:{type:'read'}});await Promise.all(['branch','petal','seed'].map(id=>service.handle({action:{type:'forage',id}})));
  assert.equal(data[C.KEY].life.skills.forage,3);assert.equal(data[C.KEY].fruit,5);assert.deepEqual(data[C.LEGACY_KEY],old);
});

test('未来版本在后台报错时不写入或重置', async () => {
  const future={version:10,fruit:999};let writes=0;
  const service=Service.create({async get(){return {[C.KEY]:future};},async set(){writes++;}},()=>now);
  await assert.rejects(service.handle({action:{type:'read'}}),/更新/);assert.equal(writes,0);
});

test('一次收线按 75% 边界判定，未钓中不消耗资源也不占当天收获', () => {
  const source=C.fresh(now),before=JSON.stringify(source);
  for(const roll of [.75,.999]){
    const r=step(source,{type:'fish-reel',place:'pond',roll});
    assert.equal(r.ok,true);assert.deepEqual(r.fishing,{outcome:'miss',fish:null});assert.equal(r.state.life.inventory.fish,0);assert.equal(r.state.life.skills.fish,0);assert.equal(r.state.daily.length,0);assert.equal(r.state.seeds,source.seeds);
    const retry=step(r.state,{type:'fish-reel',place:'pond',roll:.749999});assert.equal(retry.fishing.outcome,'caught');assert.equal(retry.state.life.inventory.fish,1);
  }
  assert.equal(JSON.stringify(source),before);
  for(const roll of [-1,1,NaN,undefined])assert.equal(step(source,{type:'fish-reel',place:'pond',roll}).ok,false);
});

test('再次钓中同一种鱼会放归，鱼篓和经验不重复增加', () => {
  const first=step(C.fresh(now),{type:'fish-reel',place:'pond',roll:0});
  assert.deepEqual(first.fishing,{outcome:'caught',fish:'blue'});
  const second=step(first.state,{type:'fish-reel',place:'pond',roll:0});
  assert.equal(second.ok,true);assert.deepEqual(second.fishing,{outcome:'released',fish:'blue'});assert.equal(second.state.life.inventory.fish,1);assert.equal(second.state.life.skills.fish,2);
});

test('后台独立抽样，前台不能指定收线成功；并发收线只保存首次鱼种奖励', async () => {
  const data={[C.KEY]:C.fresh(now)},storage={async get(){return structuredClone(data);},async set(value){Object.assign(data,structuredClone(value));}};
  let roll=.99;const service=Service.create(storage,()=>now,()=>roll);
  const miss=await service.handle({action:{type:'fish-reel',place:'pond',roll:0,success:true}});assert.equal(miss.fishing.outcome,'miss');assert.equal(data[C.KEY].life.inventory.fish,0);
  roll=0;const responses=await Promise.all(Array.from({length:4},()=>service.handle({action:{type:'fish-reel',place:'pond',roll:.99}})));
  assert.equal(responses.filter(r=>r.fishing.outcome==='caught').length,1);assert.equal(responses.filter(r=>r.fishing.outcome==='released').length,3);assert.equal(data[C.KEY].life.inventory.fish,1);
});

test('随机钓中但写入失败时不返回成功，重新收线仍能正常保存', async () => {
  const data={[C.KEY]:C.fresh(now)};let fail=true;
  const service=Service.create({async get(){return structuredClone(data);},async set(value){if(fail){fail=false;throw new Error('write failed');}Object.assign(data,structuredClone(value));}},()=>now,()=>0);
  await assert.rejects(service.handle({action:{type:'fish-reel',place:'pond'}}),/write failed/);assert.equal(data[C.KEY].life.inventory.fish,0);
  const response=await service.handle({action:{type:'fish-reel',place:'pond'}});assert.equal(response.fishing.outcome,'caught');assert.equal(data[C.KEY].life.inventory.fish,1);
});
