// 使用隔离扩展与真实页面，验证收线结束、后台异常和恢复。
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.ORCHARD_PLAYWRIGHT_MODULE || 'playwright');
const Core = require('../js/modules/orchard-core.js');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.orchard-qa');

async function run() {
  fs.mkdirSync(output, { recursive: true });
  const context = await chromium.launchPersistentContext(path.join(output, 'fishing-profile-' + Date.now()), {
    channel: 'chromium', headless: true, reducedMotion: 'reduce',
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async state => chrome.storage.local.set({ chromeNav_testMode: true, chromeNav_orchard_v2: state }), Core.fresh());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`chrome-extension://${worker.url().split('/')[2]}/newtab.html`);
    const click = action => page.locator(`#orchard-dialog [data-orchard="${action}"]`).click();
    await page.locator('.garden-pocket').click();
    await page.locator('[data-orchard="book"]').click();
    await page.locator('#orchard-dialog [data-route="fish"]').click();
    await click('fishing');
    await page.clock.install();
    const cast = async () => {
      await click('cast');
      await page.clock.runFor(20100);
      await page.waitForSelector('.fishing-water[data-phase="bite"]');
    };
    await cast();
    await page.evaluate(() => {
      window.originalOrchardSend = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (message, callback) => {
        if (message.action?.type === 'fish-reel') { window.delayedReel = callback; return; }
        return window.originalOrchardSend(message, callback);
      };
    });
    await click('reel');
    await page.clock.runFor(15000);
    assert.notEqual(await page.locator('.fishing-water').getAttribute('data-phase'), 'reel', '后台无响应后必须结束收线等待');
    assert.match(await page.locator('.fishing-notice').textContent(), /超时/);
    console.log('PASS 后台无响应时退出收线，显示超时提示');
    // 恢复后按真实后台结果结算，过期回调不能覆盖新结果。
    await page.evaluate(() => { chrome.runtime.sendMessage = window.originalOrchardSend; });
    await worker.evaluate(() => { Math.random = () => 0; });
    if (await page.locator('#orchard-dialog [data-orchard="cast"]').count()) await cast();
    await click('reel');
    await page.clock.runFor(1);
    await page.waitForSelector('.fishing-water[data-phase="caught"]');
    await page.evaluate(async () => window.delayedReel({ success: true, state: (await chrome.storage.local.get('chromeNav_orchard_v2')).chromeNav_orchard_v2, fishing: { outcome: 'miss', fish: null } }));
    assert.equal(await page.locator('.fishing-water').getAttribute('data-phase'), 'caught');
    assert.equal(await page.evaluate(async () => (await chrome.storage.local.get('chromeNav_orchard_v2')).chromeNav_orchard_v2.life.inventory.fish), 1);
    console.log('PASS 后台恢复后能钓到鱼，过期响应不会覆盖结果');
    await cast();
    await page.evaluate(() => {
      chrome.runtime.sendMessage = (message, callback) => {
        if (message.action?.type === 'fish-reel') {
          chrome.storage.local.get('chromeNav_orchard_v2').then(saved => callback({ success: false, message: '果园操作无法识别。', state: saved.chromeNav_orchard_v2 }));
          return;
        }
        return window.originalOrchardSend(message, callback);
      };
    });
    await click('reel');
    await page.clock.runFor(1);
    await page.waitForFunction(() => document.querySelector('.fishing-water').dataset.phase !== 'reel');
    assert.match(await page.locator('.fishing-notice').textContent(), /重新加载.*插件/);
    assert.equal(await page.locator('#orchard-dialog [data-orchard="cast"]').isEnabled(), true);
    for (const fishing of [undefined, { outcome: 'unknown' }, { outcome: 'caught', fish: 'unknown' }]) {
      await cast();
      await page.evaluate(result => {
        chrome.runtime.sendMessage = (message, callback) => {
          if (message.action?.type === 'fish-reel') {
            chrome.storage.local.get('chromeNav_orchard_v2').then(saved => callback({ success: true, state: saved.chromeNav_orchard_v2, fishing: result }));
            return;
          }
          return window.originalOrchardSend(message, callback);
        };
      }, fishing);
      await click('reel');
      await page.clock.runFor(1);
      await page.waitForSelector('.fishing-water[data-phase="ready"]');
      assert.match(await page.locator('.fishing-notice').textContent(), /重新加载.*插件/);
      assert.equal(await page.locator('#orchard-dialog [data-orchard="cast"]').isEnabled(), true);
    }
    assert.deepEqual(errors, []);
    console.log('PASS 旧后台拒绝收线后可重新抛竿，并提示重新加载插件');
    console.log('PASS 缺失或非法钓鱼结果不会留下收线状态或造成渲染异常');
  } finally {
    await context.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
