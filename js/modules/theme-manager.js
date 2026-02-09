/**
 * 主题管理器 - 处理主题切换和持久化
 * 使用 JS 动态注入 CSS 变量方式
 */
const ThemeManager = (function() {
  'use strict';

  // 皮肤主题配置（包含 dark/light 模式）
  const SKIN_THEMES = {
    neon: {
      name: '霓虹风格',
      colors: {
        dark: {
          '--bg-color': '#0a0a0f',
          '--sidebar-bg': '#0a0a0f',
          '--text-color': '#ffffff',
          '--primary-color': '#ff0066',
          '--secondary-color': '#4500ff',
          '--accent-color': '#00f6ff',
          '--accent-green': '#00ffaa',
          '--warning-color': '#ff8800',
          '--danger-color': '#ff4d4f',
          '--neon-pink': '#ff0066',
          '--neon-cyan': '#00f6ff',
          '--neon-purple': '#4500ff',
          '--neon-pink-rgb': '255, 0, 102',
          '--neon-cyan-rgb': '0, 246, 255',
          '--neon-purple-rgb': '69, 0, 255',
          '--text-high': '#ffffff',
          '--text-mid': '#8b86bd',
          '--text-low': '#5e55e7',
          '--glass-bg': 'rgba(13, 1, 34, 0.6)',
          '--elevated-bg': 'rgba(13, 1, 34, 0.8)',
          '--border-glass': 'rgba(255, 255, 255, 0.1)',
          '--border-neon': 'rgba(255, 0, 102, 0.3)',
          '--glow-pink': '0 0 20px rgba(255, 0, 102, 0.5)',
          '--glow-cyan': '0 0 20px rgba(0, 246, 255, 0.3)'
        },
        light: {
          '--bg-color': '#f5f7fa',
          '--sidebar-bg': '#f5f7fa',
          '--text-color': '#1a1a1a',
          '--primary-color': '#ff0066',
          '--secondary-color': '#4500ff',
          '--accent-color': '#00f6ff',
          '--accent-green': '#00ffaa',
          '--warning-color': '#ff8800',
          '--danger-color': '#ff4d4f',
          '--neon-pink': '#ff0066',
          '--neon-cyan': '#00f6ff',
          '--neon-purple': '#4500ff',
          '--neon-pink-rgb': '255, 0, 102',
          '--neon-cyan-rgb': '0, 246, 255',
          '--neon-purple-rgb': '69, 0, 255',
          '--text-high': '#1a1a1a',
          '--text-mid': '#666666',
          '--text-low': '#888888',
          '--glass-bg': 'rgba(255, 255, 255, 0.8)',
          '--elevated-bg': 'rgba(245, 247, 250, 0.8)',
          '--border-glass': 'rgba(255, 255, 255, 0.2)',
          '--border-neon': 'rgba(255, 0, 102, 0.2)',
          '--glow-pink': '0 0 15px rgba(255, 0, 102, 0.3)',
          '--glow-cyan': '0 0 15px rgba(0, 246, 255, 0.3)'
        }
      }
    },
    ocean: {
      name: '海洋蓝调',
      colors: {
        dark: {
          '--bg-color': '#001122',
          '--sidebar-bg': '#001122',
          '--text-color': '#ffffff',
          '--primary-color': '#0077be',
          '--secondary-color': '#0096c7',
          '--accent-color': '#00b4d8',
          '--accent-green': '#48cae4',
          '--warning-color': '#ffb703',
          '--danger-color': '#ff6b6b',
          '--neon-pink': '#00f5ff',
          '--neon-cyan': '#40e0d0',
          '--neon-purple': '#0096c7',
          '--neon-pink-rgb': '0, 245, 255',
          '--neon-cyan-rgb': '64, 224, 208',
          '--neon-purple-rgb': '0, 150, 199',
          '--text-high': '#ffffff',
          '--text-mid': '#caf0f8',
          '--text-low': '#ade8f4',
          '--glass-bg': 'rgba(0, 34, 68, 0.6)',
          '--elevated-bg': 'rgba(0, 34, 68, 0.8)',
          '--border-glass': 'rgba(0, 181, 216, 0.1)',
          '--border-neon': 'rgba(0, 245, 255, 0.3)',
          '--glow-pink': '0 0 20px rgba(0, 245, 255, 0.5)',
          '--glow-cyan': '0 0 20px rgba(64, 224, 208, 0.3)'
        },
        light: {
          '--bg-color': '#caf0f8',
          '--sidebar-bg': '#caf0f8',
          '--text-color': '#1a1a1a',
          '--primary-color': '#0077be',
          '--secondary-color': '#0096c7',
          '--accent-color': '#00b4d8',
          '--accent-green': '#48cae4',
          '--warning-color': '#ffb703',
          '--danger-color': '#ff6b6b',
          '--neon-pink': '#00f5ff',
          '--neon-cyan': '#40e0d0',
          '--neon-purple': '#0096c7',
          '--neon-pink-rgb': '0, 245, 255',
          '--neon-cyan-rgb': '64, 224, 208',
          '--neon-purple-rgb': '0, 150, 199',
          '--text-high': '#1a1a1a',
          '--text-mid': '#666666',
          '--text-low': '#888888',
          '--glass-bg': 'rgba(255, 255, 255, 0.8)',
          '--elevated-bg': 'rgba(202, 240, 248, 0.8)',
          '--border-glass': 'rgba(0, 181, 216, 0.1)',
          '--border-neon': 'rgba(0, 245, 255, 0.3)',
          '--glow-pink': '0 0 20px rgba(0, 245, 255, 0.5)',
          '--glow-cyan': '0 0 20px rgba(64, 224, 208, 0.3)'
        }
      }
    }
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

      // 验证皮肤是否有效
      if (!SKIN_THEMES[currentSkin]) {
        currentSkin = DEFAULT_SKIN;
      }

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
   * 应用主题 - 动态注入 CSS 变量
   */
  function applyTheme() {
    const root = document.documentElement;
    const skinConfig = SKIN_THEMES[currentSkin];

    if (!skinConfig) return;

    // 获取当前模式的颜色配置
    const colors = skinConfig.colors[currentMode];

    if (colors) {
      // 动态注入 CSS 变量
      Object.entries(colors).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }

    // 应用皮肤和模式属性（用于 CSS 选择器）
    root.setAttribute('data-skin', currentSkin);
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
