/**
 * Theme manager for skin and light/dark mode switching.
 * Applies CSS custom properties directly on the document root.
 */
const ThemeManager = (function() {
  'use strict';

  const SKIN_THEMES = {
    graphite: {
      name: '石墨中性',
      artDecoVars: {
        dark: {
          '--gold-primary': '#f2f2f3',
          '--gold-light': '#ffffff',
          '--gold-dark': '#b3b3ba',
          '--gold-dim': 'rgba(255, 255, 255, 0.14)',
          '--gold-glow': 'rgba(255, 255, 255, 0.22)',
          '--bg-primary': '#0b0b0c',
          '--bg-secondary': 'rgba(18, 18, 20, 0.9)',
          '--bg-card': 'rgba(26, 26, 29, 0.74)',
          '--text-primary': '#f4f4f5',
          '--text-secondary': '#b4b4bc',
          '--text-muted': '#72727c',
          '--border-gold': '1px solid rgba(255, 255, 255, 0.14)',
          '--border-thin': '1px solid rgba(255, 255, 255, 0.08)',
          '--border-dim': '1px solid rgba(255, 255, 255, 0.05)',
          '--shadow-card': '0 18px 50px rgba(0, 0, 0, 0.44)',
          '--shadow-gold': '0 0 28px rgba(255, 255, 255, 0.08)',
          '--shadow-hover': '0 24px 70px rgba(0, 0, 0, 0.48)',
          '--background-overlay-opacity': '0.46'
        },
        light: {
          '--gold-primary': '#17181b',
          '--gold-light': '#3a3c42',
          '--gold-dark': '#5f6168',
          '--gold-dim': 'rgba(23, 24, 27, 0.12)',
          '--gold-glow': 'rgba(23, 24, 27, 0.18)',
          '--bg-primary': '#ececef',
          '--bg-secondary': 'rgba(255, 255, 255, 0.88)',
          '--bg-card': 'rgba(255, 255, 255, 0.78)',
          '--text-primary': '#15161a',
          '--text-secondary': '#5d6068',
          '--text-muted': '#8a8d96',
          '--border-gold': '1px solid rgba(23, 24, 27, 0.12)',
          '--border-thin': '1px solid rgba(23, 24, 27, 0.1)',
          '--border-dim': '1px solid rgba(23, 24, 27, 0.06)',
          '--shadow-card': '0 18px 42px rgba(17, 18, 22, 0.12)',
          '--shadow-gold': '0 0 20px rgba(23, 24, 27, 0.05)',
          '--shadow-hover': '0 24px 60px rgba(17, 18, 22, 0.16)',
          '--background-overlay-opacity': '0.16'
        }
      }
    },
    neon: {
      name: '霓虹风格',
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
    }
  };

  const DEFAULT_SKIN = 'graphite';
  const DEFAULT_MODE = 'dark';

  let currentSkin = DEFAULT_SKIN;
  let currentMode = DEFAULT_MODE;

  async function init() {
    try {
      const preference = await Storage.loadThemePreference();
      currentSkin = preference.skin || DEFAULT_SKIN;
      currentMode = preference.mode || DEFAULT_MODE;

      if (!SKIN_THEMES[currentSkin]) {
        currentSkin = DEFAULT_SKIN;
      }

      if (currentMode !== 'dark' && currentMode !== 'light') {
        currentMode = DEFAULT_MODE;
      }

      applyTheme(false);
      updateSkinSelectorUI();
    } catch (error) {
      console.error('[ThemeManager] init failed', error);
      currentSkin = DEFAULT_SKIN;
      currentMode = DEFAULT_MODE;
      applyTheme(false);
    }
  }

  function applyTheme(persistPreference = true) {
    const skinConfig = SKIN_THEMES[currentSkin];
    if (!skinConfig) return;

    const colors = skinConfig.artDecoVars[currentMode];
    if (!colors) return;

    const root = document.documentElement;
    root.dataset.skin = currentSkin;
    root.dataset.theme = currentMode;

    for (const [prop, value] of Object.entries(colors)) {
      root.style.setProperty(prop, value);
    }

    if (persistPreference) {
      Storage.saveThemePreference(currentSkin, currentMode);
    }

    updateThemeIcons();
    updateFavicon();
  }

  function updateSkinSelectorUI() {
    document.querySelectorAll('.skin-option').forEach(option => {
      const skin = option.getAttribute('data-skin');
      option.classList.toggle('active', skin === currentSkin);
    });

    const skinNameEl = document.querySelector('.current-skin-name');
    if (skinNameEl && SKIN_THEMES[currentSkin]) {
      skinNameEl.textContent = SKIN_THEMES[currentSkin].name;
    }

    updateSkinPreviewColors();
  }

  function updateSkinPreviewColors() {
    document.querySelectorAll('.skin-option').forEach(option => {
      const skin = option.getAttribute('data-skin');
      const skinConfig = SKIN_THEMES[skin];
      if (!skinConfig) return;

      const skinColors = skinConfig.artDecoVars[currentMode];
      if (!skinColors) return;

      const primaryDot = option.querySelector('.color-dot.primary');
      const secondaryDot = option.querySelector('.color-dot.secondary');
      const accentDot = option.querySelector('.color-dot.accent');

      if (primaryDot) primaryDot.style.background = skinColors['--gold-primary'];
      if (secondaryDot) secondaryDot.style.background = skinColors['--gold-dark'];
      if (accentDot) accentDot.style.background = skinColors['--gold-light'];
    });

    const currentSkinIcon = document.querySelector('.current-skin-icon');
    const activeSkin = SKIN_THEMES[currentSkin];
    if (currentSkinIcon && activeSkin) {
      currentSkinIcon.style.color = activeSkin.artDecoVars[currentMode]['--gold-primary'];
    }
  }

  function updateFavicon() {
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue('--gold-primary')
      .trim();

    if (!color) return;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <path d="M16 4 L28 16 Q28 28 16 28 Q4 28 4 16 L16 4 Z" fill="${color}"/>
      <path d="M8 16 Q8 22 16 24 Q24 22 24 16" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="1.5"/>
      <ellipse cx="12" cy="16" rx="2" ry="1.2" fill="rgba(0,0,0,0.2)" transform="rotate(-20 12 16)"/>
      <ellipse cx="18" cy="18" rx="2" ry="1.2" fill="rgba(0,0,0,0.2)" transform="rotate(30 18 18)"/>
      <ellipse cx="14" cy="20" rx="1.5" ry="1" fill="rgba(0,0,0,0.2)" transform="rotate(-10 14 20)"/>
    </svg>`;

    const favicon = document.querySelector("link[rel='icon']");
    if (favicon) {
      favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
  }

  function updateThemeIcons() {
    const isDark = currentMode === 'dark';

    document.querySelectorAll('#desktop-theme-toggle-btn').forEach(btn => {
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = isDark ? 'bi-sun-fill' : 'bi-moon-fill';
      }
    });

    const modeToggle = document.getElementById('theme-mode-toggle');
    if (!modeToggle) return;

    const icon = modeToggle.querySelector('i');
    const label = modeToggle.querySelector('span');

    if (icon) {
      icon.className = isDark ? 'bi-sun' : 'bi-moon';
    }

    if (label) {
      label.textContent = isDark ? '亮色模式' : '暗黑模式';
    }
  }

  async function setSkin(skin) {
    if (!SKIN_THEMES[skin]) {
      console.warn(`[ThemeManager] unknown skin: ${skin}`);
      return false;
    }

    currentSkin = skin;
    applyTheme(true);
    updateSkinSelectorUI();
    return true;
  }

  function toggleMode() {
    currentMode = currentMode === 'dark' ? 'light' : 'dark';
    applyTheme(true);
    updateSkinSelectorUI();
  }

  function setMode(mode) {
    if (mode !== 'dark' && mode !== 'light') return;
    currentMode = mode;
    applyTheme(true);
    updateSkinSelectorUI();
  }

  function getSkin() {
    return currentSkin;
  }

  function getMode() {
    return currentMode;
  }

  function getAllThemes() {
    return SKIN_THEMES;
  }

  function syncSkinSelectorState(isExpanded) {
    const skinSelector = document.getElementById('skin-selector');
    const sidebar = document.getElementById('sidebar');
    if (!skinSelector || !sidebar) return;

    skinSelector.classList.toggle('expanded', isExpanded);
    sidebar.classList.toggle('skin-selector-open', isExpanded);
  }

  function bindEvents() {
    const skinSelector = document.getElementById('skin-selector');
    if (skinSelector) {
      const currentSkinTrigger = skinSelector.querySelector('.current-skin');
      if (currentSkinTrigger) {
        currentSkinTrigger.addEventListener('click', () => {
          syncSkinSelectorState(!skinSelector.classList.contains('expanded'));
        });
      }

      document.addEventListener('click', event => {
        if (!skinSelector.contains(event.target)) {
          syncSkinSelectorState(false);
        }
      });
    }

    document.querySelectorAll('.skin-option').forEach(option => {
      option.addEventListener('click', async () => {
        const skin = option.getAttribute('data-skin');
        await setSkin(skin);
        syncSkinSelectorState(false);
      });
    });

    const modeToggle = document.getElementById('theme-mode-toggle');
    if (modeToggle) {
      modeToggle.addEventListener('click', event => {
        event.stopPropagation();
        toggleMode();
      });
    }

    document.querySelectorAll('#desktop-theme-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleMode();
      });
    });
  }

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

window.ThemeManager = ThemeManager;
