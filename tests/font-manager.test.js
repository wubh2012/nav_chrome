const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function create(stored, fail = false) {
  const properties = {};
  let listener;
  let writes;
  let registrations = 0;
  const context = vm.createContext({
    console, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    window: { dispatchEvent() {} },
    document: { documentElement: { style: { setProperty(k,v) { properties[k] = v; } }, dataset: {} } },
    chrome: { storage: { onChanged: { addListener(fn) { listener = fn; registrations++; } } } },
    Storage: { get: async key => ({[key]: stored}), set: async value => { if (fail) throw Error('Storage failed'); writes = value; } }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../js/modules/font-manager.js'), 'utf8') + '\nglobalThis.manager = FontManager;', context);
  return { manager: context.manager, properties, change: (value, area = 'local') => listener({chromeNav_typography_v1:{newValue:value}}, area), writes: () => writes, registrations: () => registrations };
}
test('损坏或未知偏好回退，字号限制范围，拒绝自定义 CSS 注入', async () => {
  const env = create({body:'evil; color:red', size:40});
  await env.manager.init();
  assert.equal(env.manager.get().body, 'wenkaiGb');
  assert.equal(env.manager.get().size, 20);
  assert.equal(env.manager.normalize({body:'pixel', size:'bad'}).size, 16);
  assert.equal(env.manager.normalize(null).size, 16);
  assert.equal(env.manager.normalize({size:1}).size,14);
});
test('保存偏好并统一正文和标题；其他页面更改与删除实时应用', async () => {
  const env = create({body:'system', size:14});
  await env.manager.init();
  await env.manager.init();
  assert.equal(env.registrations(),1);
  await env.manager.save({body:'kuaile', size:18});
  assert.equal(env.writes().chromeNav_typography_v1.body,'kuaile');
  assert.equal(env.properties['--navigation-font'],env.properties['--navigation-heading-font']);
  assert.equal(env.properties['--navigation-text-size'],'18px');
  env.change({body:'pixel', size:17},'sync');
  assert.equal(env.manager.get().body,'kuaile');
  env.change({body:'pixel', size:17});
  assert.equal(env.manager.get().body,'pixel');
  env.change(undefined);
  assert.equal(env.manager.get().body,'wenkaiGb');
});
test('保存失败保留原配置', async () => {
  const env = create({body:'system', size:15},true);
  await env.manager.init();
  await assert.rejects(env.manager.save({body:'pixel',size:18}));
  assert.equal(env.manager.get().body,'system');
});
