const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../js/modules/pixel-garden-state.js');

test('果园存档保留成长、装扮、果篮、小鱼和关闭状态', () => {
  const source = { version:1, enabled:false, basket:7, total:21, cats:2, pondVisits:4,
    fruit:[0,1,2,3], trees:[{stage:1,fruit:0},{stage:3,fruit:2}], fish:[0,2],
    decorations:[{id:'flowers',owned:true,visible:false,zone:2}] };
  const state = normalize(source);
  assert.equal(state.enabled,false);
  assert.equal(state.basket,7);
  assert.deepEqual(state.fruit,[0,1,2,3]);
  assert.deepEqual(state.trees,source.trees);
  assert.deepEqual(state.fish,[0,2]);
  assert.deepEqual(state.decorations[0],source.decorations[0]);
  state.trees[0].stage = 2;
  assert.equal(source.trees[0].stage,1);
});

test('损坏存档不能产生负果子、额外树位或注入未知装饰字段', () => {
  const state = normalize({ version:1, basket:-10, total:Infinity, cats:1.2,
    fruit:[100,-1,NaN,0], trees:[{stage:99,fruit:3},{stage:2,fruit:3},null,{stage:3}],
    fish:[0,0,99,-1,'2',2], decorations:[{id:'flowers',owned:true,zone:9,name:'<script>'},{id:'unknown',owned:true}] });
  assert.equal(state.basket,0);
  assert.equal(state.total,0);
  assert.deepEqual(state.fruit,[3,3,3,0]);
  assert.deepEqual(state.trees,[{stage:0,fruit:0},{stage:2,fruit:0},{stage:0,fruit:0}]);
  assert.deepEqual(state.fish,[0,2]);
  assert.equal(state.decorations.length,3);
  assert.deepEqual(state.decorations[0],{id:'flowers',owned:true,visible:true,zone:0});
});

test('缺失或不支持的存档版本安全回到初始果园', () => {
  assert.deepEqual(normalize(null),normalize({version:99,basket:100,enabled:false}));
  assert.deepEqual(normalize({}).fruit,[3,3,3,3]);
  assert.equal(normalize({}).enabled,true);
});
