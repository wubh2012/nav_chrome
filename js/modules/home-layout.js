/* 首页布局偏好：两套布局共用导航数据，在业务模块初始化前选择页面结构。 */
const HomeLayout = (() => {
  'use strict';
  const KEY = 'chromeNav_homeLayout_v1';
  const DEFAULT = 'wooden';
  const normalize = value => value === 'classic' ? 'classic' : DEFAULT;

  async function load() {
    return normalize((await Storage.get(KEY))[KEY]);
  }

  async function save(value) {
    const layout = normalize(value);
    await Storage.set({ [KEY]: layout });
    return layout;
  }

  function bindSidebar() {
    const trigger = document.querySelector('.user-avatar');
    if (!trigger) return;
    const key = 'chromeNav_sidebarCollapsed';
    let preferredCollapsed = false;
    try { preferredCollapsed = window.localStorage.getItem(key) === '1'; }
    catch (_) { /* 本地存储不可用时仍可切换侧栏。 */ }
    const apply = () => {
      const collapsed = window.innerWidth > 768 && preferredCollapsed;
      document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
      document.body.classList.toggle('sidebar-collapsed', collapsed);
      trigger.setAttribute('aria-expanded', String(!collapsed));
      trigger.title = collapsed ? '点击 Logo 展开侧栏' : '点击 Logo 折叠侧栏';
      trigger.setAttribute('aria-label', trigger.title);
    };
    const toggle = () => {
      if (window.innerWidth <= 768) return;
      preferredCollapsed = !preferredCollapsed;
      apply();
      try { window.localStorage.setItem(key, preferredCollapsed ? '1' : '0'); }
      catch (_) { /* 不影响当前页面的折叠状态。 */ }
    };
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.addEventListener('click', toggle);
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    });
    window.addEventListener('resize', apply);
    apply();
  }

  async function init() {
    let layout = DEFAULT;
    try { layout = await load(); }
    catch (error) { console.warn('[HomeLayout] 读取布局失败，使用当前布局:', error); }
    if (layout === 'classic') {
      const template = document.getElementById('classic-home-template');
      document.querySelector('.main-content').replaceWith(template.content.cloneNode(true));
      document.body.classList.remove('pixel-home', 'wooden-home');
      document.body.classList.add('classic-home');
      document.getElementById('wood-tuner')?.remove();
      document.querySelector('.skip-link').setAttribute('href', '#current-time');
      bindSidebar();
    }
    document.documentElement.dataset.homeLayout = layout;
    document.body.classList.remove('home-layout-pending');
    document.dispatchEvent(new CustomEvent('chromeNav:layoutReady', { detail: { layout } }));
    return layout;
  }

  return { KEY, DEFAULT, normalize, load, save, init };
})();
window.HomeLayout = HomeLayout;
