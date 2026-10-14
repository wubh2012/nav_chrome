// 隔离扩展资料，测量实际动画帧、连续性与无动态模式，避免只检查 CSS 字符串。
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.ORCHARD_PLAYWRIGHT_MODULE||'playwright');
const Core=require('../js/modules/orchard-core.js');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.orchard-qa');
async function run(){
  fs.mkdirSync(output,{recursive:true});
  const context=await chromium.launchPersistentContext(path.join(output,'motion-profile-'+Date.now()),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
  const report=[],screens=[],errors=[];
  try{
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    const base=`chrome-extension://${worker.url().split('/')[2]}/`;
    const state=Core.fresh();state.fruit=20;state.total=20;state.life.skills={grow:3,forage:3,fish:3,craft:3,friends:3};
    state.life.inventory={greens:5,fish:3,jam:2,tea:2,soup:2};state.life.letters=['cat:1','chestnut:1'];
    state.life.plots[0]={kind:'berry',readyAt:Date.now()+4*Core.HOUR,watered:false};state.landscape.items.push({id:2,kind:'bed',x:700,y:180,color:0,turn:0});state.landscape.nextId=3;
    await worker.evaluate(async saved=>chrome.storage.local.set({chromeNav_testMode:true,chromeNav_typography_v1:{body:'system',size:16},chromeNav_orchard_v2:saved}),state);
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(6000);
    await page.goto(base+'newtab.html');await page.waitForSelector('.garden-pocket');
    const click=action=>page.locator(`#orchard-dialog [data-orchard="${action}"]`).click();
    const close=async()=>{if(await page.locator('#orchard-dialog[open]').count())await page.keyboard.press('Escape');};
    const inspect=async(name)=>{await page.waitForSelector('#orchard-dialog[open]');assert.ok(await page.locator('#orchard-dialog-title').textContent());assert.equal(await page.locator('#orchard-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);screens.push(name);};
    // 首页菜单直接进入手记，再进入路线，覆盖菜单在 pointerdown 时重绘丢失点击的问题。
    await page.locator('.garden-pocket').click();await page.locator('[data-orchard="book"]').click();await inspect('成长手记');await page.locator('#orchard-dialog [data-route="fish"]').click();await click('fishing');await inspect('钓鱼');report.push('首页菜单直接进入手记及玩法正常');
    await worker.evaluate(()=>{Math.random=()=>.99;});await click('cast');await page.waitForSelector('.fishing-water[data-phase="wait"]');
    assert.equal(await page.locator('#orchard-dialog [data-orchard="reel"]').isDisabled(),true);
    assert.equal(await page.locator('#orchard-dialog [data-orchard="wait"],#orchard-dialog [data-orchard="pull"],#orchard-dialog [data-orchard="ease"],#orchard-dialog meter,#orchard-dialog progress').count(),0);
    const float=page.locator('.fishing-float'),before=await float.evaluate(e=>getComputedStyle(e).transform);
    await page.waitForFunction(previous=>getComputedStyle(document.querySelector('.fishing-float')).transform!==previous,before);
    assert.ok(await page.locator('.fishing-ripples').first().evaluate(e=>e.getAnimations().length));report.push('等待时浮标与水纹帧实际变化');
    await page.evaluate(()=>{window.motionWater=document.querySelector('.fishing-water');window.motionFloat=document.querySelector('.fishing-float');});
    await page.screenshot({path:path.join(output,'fishing-wait-motion.png')});
    await page.waitForSelector('.fishing-water[data-phase="bite"]',{timeout:21000});assert.equal(await float.evaluate(e=>getComputedStyle(e).animationName),'orchard-bite');
    await click('reel');await page.waitForSelector('.fishing-water[data-phase="miss"]');
    assert.equal(await worker.evaluate(async()=> (await chrome.storage.local.get('chromeNav_orchard_v2')).chromeNav_orchard_v2.life.inventory.fish),3);
    assert.equal(await page.locator('.orchard-feedback').count(),0);await page.screenshot({path:path.join(output,'fishing-miss-simple.png')});report.push('随机未钓中不增加鱼篓，直接再抛竿');
    await worker.evaluate(()=>{Math.random=()=>0;});await click('cast');await page.waitForSelector('.fishing-water[data-phase="bite"]',{timeout:21000});await click('reel');await page.waitForSelector('.fishing-water[data-phase="caught"]');
    assert.equal(await page.evaluate(()=>window.motionWater===document.querySelector('.fishing-water')&&window.motionFloat===document.querySelector('.fishing-float')),true);report.push('自动咬钩、一次收线与水面节点连续性');
    await page.screenshot({path:path.join(output,'fishing-reel-motion.png')});
    await page.waitForFunction(async()=> (await chrome.storage.local.get('chromeNav_orchard_v2')).chromeNav_orchard_v2.life.inventory.fish===4);
    assert.equal(await page.locator('.fishing-catch').evaluate(e=>getComputedStyle(e).animationName),'orchard-catch');report.push('钓起小鱼动效与真实收获');
    await page.screenshot({path:path.join(output,'fishing-caught-motion.png')});
    await click('cast');await close();await page.waitForTimeout(20100);assert.equal(await page.locator('#orchard-dialog[open]').count(),0);
    await page.locator('.garden-pocket').click();await page.locator('[data-orchard="book"]').click();await page.locator('#orchard-dialog [data-route="fish"]').click();await click('fishing');assert.equal(await page.locator('.fishing-water').getAttribute('data-phase'),'ready');report.push('关闭等待窗口会取消咬钩计时，重新进入可直接抛竿');await close();
    await page.locator('.garden-pocket').click();await page.locator('[data-orchard="walk"]').click();
    const open=async(selector,name)=>{await close();await page.locator('#orchard-world '+selector).first().click();await inspect(name);};
    await open('[data-orchard="tree"][data-index="0"]','果树');await click('tree-harvest');await page.waitForSelector('.orchard-feedback[data-effect="harvest"]');report.push('收获反馈在保存成功后显示');
    await click('tree-water');await page.waitForSelector('.orchard-feedback[data-effect="water"]');
    await open('[data-orchard="crop"][data-index="0"]','苗床');await click('crop-water');await page.waitForSelector('.orchard-feedback[data-effect="water"]');
    await open('[data-orchard="crop"][data-index="1"]','播种');await page.locator('#orchard-dialog [data-orchard="sow"][data-kind="mint"]').click();await page.waitForSelector('.orchard-feedback[data-effect="grow"]');report.push('浇水与播种反馈');
    await open('[data-orchard="plant"]','种树选择');
    for(const route of Object.keys(Core.ROUTES))await open(`[data-orchard="route"][data-route="${route}"]`,'路线 '+Core.ROUTES[route].name);
    await open('[data-orchard="route"][data-route="craft"]','制作路线');await click('recipes');await inspect('配方册');await page.locator('#orchard-dialog [data-orchard="recipe"][data-id="jam"]').click();await page.waitForSelector('.orchard-feedback[data-effect="craft"]');report.push('制作完成反馈');
    await open('[data-orchard="friend"][data-friend="chestnut"]','朋友小栗');await click('chat');await page.waitForSelector('.orchard-feedback[data-effect="heart"]');await page.locator('#orchard-dialog [data-orchard="gift"][data-gift="jam"]').click();await page.waitForSelector('.orchard-feedback[data-effect="heart"]');
    await open('[data-orchard="cat"]','朋友小橘');await click('pet');await page.waitForSelector('.orchard-feedback[data-effect="heart"]');report.push('交谈、赠礼与摸猫反馈');
    await open('[data-orchard="book"]','成长手记');await click('letters');await inspect('朋友的小信');
    await open('[data-orchard="find"]','拾取');await page.locator('#orchard-dialog [data-orchard="forage"]').first().click();await page.waitForSelector('.orchard-feedback[data-effect="gather"]');report.push('采集反馈');
    for(const [action,name]of [['pond','池塘鱼册'],['album','自然手记'],['creature','动物来访'],['stone','石头谜题'],['chime','风铃谜题']])await open(`[data-orchard="${action}"]`,name);
    await page.locator('#orchard-dialog [data-tone="high"]').click();assert.equal(await page.locator('.mini-progress').textContent(),'高');
    await close();await page.locator('#orchard-world [data-orchard="edit"]').first().click();await page.locator('#orchard-world [data-orchard="palette"][data-kind="flowers"]').click();await page.locator('#orchard-world [data-orchard="craft-decor"]').click();await page.waitForSelector('.orchard-feedback[data-effect="craft"]');screens.push('自由布置');
    await page.keyboard.press('Escape');await page.locator('.garden-pocket').click();await page.locator('[data-orchard="help"]').click();await inspect('玩法说明');await close();
    await page.locator('.garden-pocket').click();await page.locator('[data-orchard="book"]').click();await page.locator('#orchard-dialog [data-route="fish"]').click();await click('fishing');await click('cast');
    await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#orchard-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);await page.screenshot({path:path.join(output,'fishing-mobile-motion.png')});report.push('390px 钓鱼完整布局');
    await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await float.evaluate(e=>getComputedStyle(e).animationName),'none');assert.equal(await page.locator('.fishing-ripples').first().evaluate(e=>getComputedStyle(e).animationName),'none');
    await page.waitForSelector('.fishing-water[data-phase="bite"]',{timeout:21000});await click('reel');await page.waitForSelector('.fishing-water[data-phase="released"]');report.push('减少动态模式停止循环动画，仍可自动咬钩与一次收线');
    await close();await page.locator('.garden-pocket').click();await page.locator('[data-orchard="walk"]').click();await page.locator('#orchard-world [data-orchard="tree"][data-index="1"]').first().click();await click('tree-harvest');await page.waitForFunction(async()=> (await chrome.storage.local.get('chromeNav_orchard_v2')).chromeNav_orchard_v2.trees[1].fruit===0);assert.equal(await page.locator('.orchard-feedback').count(),0);report.push('减少动态模式仍保存收获，跳过粒子反馈');
    await page.setViewportSize({width:1440,height:1000});
    for(const file of ['options.html','popup.html']){await page.goto(base+file);await page.waitForLoadState('domcontentloaded');assert.ok(await page.title());screens.push(file);}
    assert.deepEqual(errors,[]);report.push('所有检查页面无脚本错误');
    fs.writeFileSync(path.join(output,'motion-check.json'),JSON.stringify({checkedAt:new Date().toISOString(),screens,report,errors},null,2),'utf8');console.log(JSON.stringify({screens,report,errors},null,2));
  }finally{await context.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
