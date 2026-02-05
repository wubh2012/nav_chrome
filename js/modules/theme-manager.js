/**
 * 主题管理器 - 处理主题切换和持久化
 * 改造自 navsite
 */
const ThemeManager = (function() {
  'use strict';

  // 皮肤主题配置
  const SKIN_THEMES = {
    neon: { name: '霓虹风格', colors: { primary: '#ff0066', secondary: '#4500ff', accent: '#00f6ff' } },
    ocean: { name: '海洋蓝调', colors: { primary: '#0077be', secondary: '#0096c7', accent: '#00b4d8' } },
    forest: { name: '森林绿意', colors: { primary: '#2d5016', secondary: '#52734d', accent: '#73a942' } },
    sunset: { name: '日落橙黄', colors: { primary: '#ff6d00', secondary: '#ff8f00', accent: '#ffb300' } },
    purple: { name: '优雅紫色', colors: { primary: '#6a1b9a', secondary: '#8e24aa', accent: '#ab47bc' } },
    classic: { name: '经典灰调', colors: { primary: '#424242', secondary: '#616161', accent: '#757575' } }
  };

  // 默认设置
  const DEFAULT_SKIN = 'neon';
  const DEFAULT_MODE = 'dark';

  // 当前状态
  let currentSkin = DEFAULT_SKIN;
  let currentMode = DEFAULT_MODE;

  /**
   * 初始化主题管理器
   */
  async function init() {
    try {
      // 从存储加载偏好
      const preference = await Storage.loadThemePreference();
      currentSkin = preference.skin || DEFAULT_SKIN;
      currentMode = preference.mode || DEFAULT_MODE;

      // 应用主题
      applyTheme();

      // 更新 UI 状态
      updateSkinSelectorUI();

      console.log(`[ThemeManager] 初始化完成: ${currentSkin} + ${currentMode}`);
    } catch (error) {
      console.error('[ThemeManager] 初始化失败:', error);
      // 使用默认值
      currentSkin = DEFAULT_SKIN;
      currentMode = DEFAULT_MODE;
      applyTheme();
    }
  }

  /**
   * 应用主题
   */
  function applyTheme() {
    const root = document.documentElement;

    // 应用皮肤
    root.setAttribute('data-skin', currentSkin);

    // 应用模式
    root.setAttribute('data-theme', currentMode);

    // 保存到存储
    Storage.saveThemePreference(currentSkin, currentMode);

    // 更新主题图标
    updateThemeIcons();

    console.log(`[ThemeManager] 应用主题: ${currentSkin} + ${currentMode}`);
  }

  /**
   * 更新皮肤选择器 UI
   */
  function updateSkinSelectorUI() {
    // 更新皮肤选项激活状态
    document.querySelectorAll('.skin-option').forEach(option => {
      const skin = option.getAttribute('data-skin');
      if (skin === currentSkin) {
        option.classList.add('active');
      } else {
        option.classList.remove('active');
      }
    });

    // 更新当前皮肤名称
    const skinNameEl = document.querySelector('.current-skin-name');
    if (skinNameEl && SKIN_THEMES[currentSkin]) {
      skinNameEl.textContent = SKIN_THEMES[currentSkin].name;
    }
  }

  /**
   * 更新主题图标
   */
  function updateThemeIcons() {
    const isDark = currentMode === 'dark';
    const moonIcon = 'bi-moon-fill';
    const sunIcon = 'bi-sun-fill';

    // 更新右上角主题按钮
    const themeBtns = document.querySelectorAll('#desktop-theme-toggle-btn, #mobile-theme-btn');
    themeBtns.forEach(btn => {
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = isDark ? sunIcon : moonIcon;
      }
    });

    // 更新皮肤选择器中的模式切换
    const modeToggle = document.getElementById('theme-mode-toggle');
    if (modeToggle) {
      const icon = modeToggle.querySelector('i');
      const span = modeToggle.querySelector('span');
      if (icon) {
        icon.className = isDark ? 'bi-sun' : 'bi-moon';
      }
      if (span) {
        span.textContent = isDark ? '亮色模式' : '暗黑模式';
      }
    }
  }

  /**
   * 切换皮肤
   * @param {string} skin - 皮肤名称
   */
  async function setSkin(skin) {
    if (!SKIN_THEMES[skin]) {
      console.warn(`[ThemeManager] 未知的皮肤: ${skin}`);
      return false;
    }

    currentSkin = skin;
    applyTheme();
    updateSkinSelectorUI();
    return true;
  }

  /**
   * 切换模式（暗黑/亮色）
   */
  function toggleMode() {
    currentMode = currentMode === 'dark' ? 'light' : 'dark';
    applyTheme();
  }

  /**
   * 设置模式
   * @param {string} mode - 'dark' 或 'light'
   */
  function setMode(mode) {
    if (mode !== 'dark' && mode !== 'light') return;
    currentMode = mode;
    applyTheme();
  }

  /**
   * 获取当前皮肤
   */
  function getSkin() {
    return currentSkin;
  }

  /**
   * 获取当前模式
   */
  function getMode() {
    return currentMode;
  }

  /**
   * 获取所有皮肤主题
   */
  function getAllThemes() {
    return SKIN_THEMES;
  }

  // ==================== 事件绑定 ====================

  /**
   * 绑定主题相关事件
   */
  function bindEvents() {
    // 皮肤选择器展开/收起
    const skinSelector = document.getElementById('skin-selector');
    if (skinSelector) {
      skinSelector.querySelector('.current-skin').addEventListener('click', () => {
        skinSelector.classList.toggle('expanded');
      });

      // 点击其他地方关闭
      document.addEventListener('click', (e) => {
        if (!skinSelector.contains(e.target)) {
          skinSelector.classList.remove('expanded');
        }
      });
    }

    // 皮肤选项点击
    document.querySelectorAll('.skin-option').forEach(option => {
      option.addEventListener('click', async () => {
        const skin = option.getAttribute('data-skin');
        await setSkin(skin);

        // 收起皮肤选择器
        const skinSelector = document.getElementById('skin-selector');
        if (skinSelector) {
          skinSelector.classList.remove('expanded');
        }
      });
    });

    // 模式切换按钮
    const modeToggle = document.getElementById('theme-mode-toggle');
    if (modeToggle) {
      modeToggle.addEventListener('click', () => {
        toggleMode();
      });
    }

    // 右上角主题切换按钮
    const themeBtns = document.querySelectorAll('#desktop-theme-toggle-btn, #mobile-theme-btn');
    themeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        toggleMode();
      });
    });
  }

  // ==================== 公共 API ====================

  return {
    init,
    setSkin,
    setMode,
    toggleMode,
    getSkin,
    getMode,
    getAllThemes,
    bindEvents
  };
})();

// 导出到全局
window.ThemeManager = ThemeManager;
