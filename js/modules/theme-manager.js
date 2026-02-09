/**
 * 主题管理器 - 处理主题切换和持久化
 * 使用 JS 动态注入 CSS 变量方式
 */
const ThemeManager = (function() {
  'use strict';

  // 皮肤主题配置（包含 dark/light 模式）
  // 每个皮肤定义两套配色，分别对应 dark 和 light 模式
  const SKIN_THEMES = {
    neon: {
      name: '霓虹风格',
      // 霓虹风格 - 映射到 Art Deco CSS 变量
      artDecoVars: {
        dark: {
          '--gold-primary': '#ff0066',
          '--gold-light': '#ff6b9d',
          '--gold-dark': '#cc0052',
          '--gold-dim': 'rgba(255, 0, 102, 0.25)',
          '--gold-glow': 'rgba(255, 0, 102, 0.4)',
          '--bg-primary': '#0a0a0f',
          '--bg-secondary': 'rgba(13, 1, 34, 0.98)',
          '--bg-card': 'rgba(28, 28, 28, 0.7)',
          '--text-primary': '#ffffff',
          '--text-secondary': '#ff6b9d',
          '--text-muted': '#8b86bd',
          '--border-gold': '1px solid rgba(255, 0, 102, 0.35)',
          '--border-thin': '1px solid rgba(255, 255, 255, 0.08)',
          '--border-dim': '1px solid rgba(255, 255, 255, 0.05)',
          '--shadow-card': '0 8px 40px rgba(0, 0, 0, 0.6)',
          '--shadow-gold': '0 0 30px rgba(255, 0, 102, 0.15)',
          '--shadow-hover': '0 12px 50px rgba(255, 0, 102, 0.2)'
        },
        light: {
          '--gold-primary': '#ff0066',
          '--gold-light': '#ff6b9d',
          '--gold-dark': '#cc0052',
          '--gold-dim': 'rgba(184, 134, 11, 0.2)',
          '--gold-glow': 'rgba(255, 0, 102, 0.3)',
          '--bg-primary': '#f5f7fa',
          '--bg-secondary': 'rgba(255, 255, 255, 0.98)',
          '--bg-card': 'rgba(255, 255, 255, 0.8)',
          '--text-primary': '#1a1a1a',
          '--text-secondary': '#cc0052',
          '--text-muted': '#888888',
          '--border-gold': '1px solid rgba(255, 0, 102, 0.35)',
          '--border-thin': '1px solid rgba(0, 0, 0, 0.08)',
          '--border-dim': '1px solid rgba(0, 0, 0, 0.04)',
          '--shadow-card': '0 8px 40px rgba(0, 0, 0, 0.1)',
          '--shadow-gold': '0 0 30px rgba(255, 0, 102, 0.15)',
          '--shadow-hover': '0 12px 50px rgba(255, 0, 102, 0.15)'
        }
      }
    },
    ocean: {
      name: '海洋蓝调',
      artDecoVars: {
        dark: {
          '--gold-primary': '#00f5ff',
          '--gold-light': '#40e0d0',
          '--gold-dark': '#00b4d8',
          '--gold-dim': 'rgba(0, 245, 255, 0.25)',
          '--gold-glow': 'rgba(0, 245, 255, 0.4)',
          '--bg-primary': '#001122',
          '--bg-secondary': 'rgba(0, 34, 68, 0.98)',
          '--bg-card': 'rgba(28, 28, 28, 0.7)',
          '--text-primary': '#ffffff',
          '--text-secondary': '#40e0d0',
          '--text-muted': '#caf0f8',
          '--border-gold': '1px solid rgba(0, 245, 255, 0.35)',
          '--border-thin': '1px solid rgba(255, 255, 255, 0.08)',
          '--border-dim': '1px solid rgba(255, 255, 255, 0.05)',
          '--shadow-card': '0 8px 40px rgba(0, 0, 0, 0.6)',
          '--shadow-gold': '0 0 30px rgba(0, 245, 255, 0.15)',
          '--shadow-hover': '0 12px 50px rgba(0, 245, 255, 0.2)'
        },
        light: {
          '--gold-primary': '#0077be',
          '--gold-light': '#40e0d0',
          '--gold-dark': '#0096c7',
          '--gold-dim': 'rgba(0, 119, 190, 0.2)',
          '--gold-glow': 'rgba(0, 119, 190, 0.3)',
          '--bg-primary': '#caf0f8',
          '--bg-secondary': 'rgba(255, 255, 255, 0.98)',
          '--bg-card': 'rgba(255, 255, 255, 0.8)',
          '--text-primary': '#1a1a1a',
          '--text-secondary': '#0077be',
          '--text-muted': '#888888',
          '--border-gold': '1px solid rgba(0, 119, 190, 0.35)',
          '--border-thin': '1px solid rgba(0, 0, 0, 0.08)',
          '--border-dim': '1px solid rgba(0, 0, 0, 0.04)',
          '--shadow-card': '0 8px 40px rgba(0, 0, 0, 0.1)',
          '--shadow-gold': '0 0 30px rgba(0, 119, 190, 0.15)',
          '--shadow-hover': '0 12px 50px rgba(0, 119, 190, 0.15)'
        }
      }
    },
    emerald: {
      name: '翡翠绿',
      artDecoVars: {
        dark: {
          '--gold-primary': '#2d8a6e',
          '--gold-light': '#7dd3b0',
          '--gold-dark': '#1a5c47',
          '--gold-dim': 'rgba(45, 138, 110, 0.25)',
          '--gold-glow': 'rgba(45, 138, 110, 0.4)',
          '--bg-primary': '#0a0f0c',
          '--bg-secondary': 'rgba(10, 15, 12, 0.98)',
          '--bg-card': 'rgba(28, 28, 28, 0.7)',
          '--text-primary': '#f5f5f0',
          '--text-secondary': '#7dd3b0',
          '--text-muted': '#9a9a9a',
          '--border-gold': '1px solid rgba(45, 138, 110, 0.35)',
          '--border-thin': '1px solid rgba(255, 255, 255, 0.08)',
          '--border-dim': '1px solid rgba(255, 255, 255, 0.05)',
          '--shadow-card': '0 8px 40px rgba(0, 0, 0, 0.6)',
          '--shadow-gold': '0 0 30px rgba(45, 138, 110, 0.15)',
          '--shadow-hover': '0 12px 50px rgba(45, 138, 110, 0.2)'
        },
        light: {
          '--gold-primary': '#2d8a6e',
          '--gold-light': '#7dd3b0',
          '--gold-dark': '#1a5c47',
          '--gold-dim': 'rgba(45, 138, 110, 0.2)',
          '--gold-glow': 'rgba(45, 138, 110, 0.3)',
          '--bg-primary': '#f0f5f2',
          '--bg-secondary': 'rgba(255, 255, 255, 0.98)',
          '--bg-card': 'rgba(255, 255, 255, 0.8)',
          '--text-primary': '#1a1a1a',
          '--text-secondary': '#2d8a6e',
          '--text-muted': '#888888',
          '--border-gold': '1px solid rgba(45, 138, 110, 0.35)',
          '--border-thin': '1px solid rgba(0, 0, 0, 0.08)',
          '--border-dim': '1px solid rgba(0, 0, 0, 0.04)',
          '--shadow-card': '0 8px 40px rgba(0, 0, 0, 0.1)',
          '--shadow-gold': '0 0 30px rgba(45, 138, 110, 0.15)',
          '--shadow-hover': '0 12px 50px rgba(45, 138, 110, 0.15)'
        }
      }
    },
    darkgold: {
      name: '暗金色',
      artDecoVars: {
        dark: {
          '--gold-primary': '#d4af37',
          '--gold-light': '#f4e4bc',
          '--gold-dark': '#b8860b',
          '--gold-dim': 'rgba(212, 175, 55, 0.25)',
          '--gold-glow': 'rgba(212, 175, 55, 0.4)',
          '--bg-primary': '#0a0905',
          '--bg-secondary': 'rgba(18, 18, 18, 0.98)',
          '--bg-card': 'rgba(28, 28, 28, 0.7)',
          '--text-primary': '#f5f5f0',
          '--text-secondary': '#9a9a9a',
          '--text-muted': '#666666',
          '--border-gold': '1px solid rgba(212, 175, 55, 0.35)',
          '--border-thin': '1px solid rgba(255, 255, 255, 0.08)',
          '--border-dim': '1px solid rgba(255, 255, 255, 0.05)',
          '--shadow-card': '0 8px 40px rgba(0, 0, 0, 0.6)',
          '--shadow-gold': '0 0 30px rgba(212, 175, 55, 0.15)',
          '--shadow-hover': '0 12px 50px rgba(212, 175, 55, 0.2)'
        },
        light: {
          '--gold-primary': '#d4af37',
          '--gold-light': '#f4e4bc',
          '--gold-dark': '#b8860b',
          '--gold-dim': 'rgba(184, 134, 11, 0.2)',
          '--gold-glow': 'rgba(212, 175, 55, 0.3)',
          '--bg-primary': '#f8f6f0',
          '--bg-secondary': 'rgba(248, 246, 240, 0.98)',
          '--bg-card': 'rgba(255, 255, 255, 0.8)',
          '--text-primary': '#1a1a1a',
          '--text-secondary': '#666666',
          '--text-muted': '#999999',
          '--border-gold': '1px solid rgba(212, 175, 55, 0.35)',
          '--border-thin': '1px solid rgba(0, 0, 0, 0.08)',
          '--border-dim': '1px solid rgba(0, 0, 0, 0.04)',
          '--shadow-card': '0 8px 40px rgba(0, 0, 0, 0.1)',
          '--shadow-gold': '0 0 30px rgba(212, 175, 55, 0.15)',
          '--shadow-hover': '0 12px 50px rgba(212, 175, 55, 0.15)'
        }
      }
    }
  };

  // 默认设置
  const DEFAULT_SKIN = 'darkgold';
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
   * 使用 JS 直接修改 style.css 中的 :root 变量
   */
  function applyTheme() {
    const skinConfig = SKIN_THEMES[currentSkin];

    if (!skinConfig) return;

    // 获取当前模式的颜色配置
    const colors = skinConfig.artDecoVars[currentMode];

    if (colors) {
      // 直接在 documentElement 上设置 CSS 变量
      // 内联样式的优先级高于外部 CSS 文件中的 :root 定义
      const root = document.documentElement;
      for (const [prop, value] of Object.entries(colors)) {
        root.style.setProperty(prop, value);
      }
      console.log(`[ThemeManager] 已更新 ${Object.keys(colors).length} 个 CSS 变量`);
    }

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

    // 动态更新皮肤预览颜色
    updateSkinPreviewColors();
  }

  /**
   * 更新皮肤预览圆点的颜色
   */
  function updateSkinPreviewColors() {
    // 更新所有皮肤选项的预览颜色
    document.querySelectorAll('.skin-option').forEach(option => {
      const skin = option.getAttribute('data-skin');
      const skinConfig = SKIN_THEMES[skin];
      if (!skinConfig || !skinConfig.artDecoVars) return;

      const skinColors = skinConfig.artDecoVars[currentMode];
      if (!skinColors) return;

      const skinPrimary = skinColors['--gold-primary'];
      const skinSecondary = skinColors['--gold-dark'];
      const skinAccent = skinColors['--gold-light'];

      // 更新主色圆点
      const primaryDot = option.querySelector('.color-dot.primary');
      if (primaryDot) {
        primaryDot.style.background = skinPrimary;
      }

      // 更新辅色圆点
      const secondaryDot = option.querySelector('.color-dot.secondary');
      if (secondaryDot) {
        secondaryDot.style.background = skinSecondary;
      }

      // 更新强调色圆点
      const accentDot = option.querySelector('.color-dot.accent');
      if (accentDot) {
        accentDot.style.background = skinAccent;
      }
    });

    // 更新当前选中皮肤的预览图标颜色
    const currentSkinIcon = document.querySelector('.current-skin-icon');
    const skinConfig = SKIN_THEMES[currentSkin];
    if (currentSkinIcon && skinConfig && skinConfig.artDecoVars[currentMode]) {
      currentSkinIcon.style.color = skinConfig.artDecoVars[currentMode]['--gold-primary'];
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
