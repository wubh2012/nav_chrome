/**
 * Theme manager for skin and light/dark mode switching.
 * Applies CSS custom properties directly on the document root.
 */
const ThemeManager = (function() {
  'use strict';

  function withLegacy(vars) {
    return {
      ...vars,
      '--gold-primary': vars['--accent-primary'],
      '--gold-light': vars['--accent-soft'],
      '--gold-dark': vars['--accent-strong'],
      '--gold-dim': vars['--accent-dim'],
      '--gold-glow': vars['--accent-glow'],
      '--bg-primary': vars['--page-bg'],
      '--bg-secondary': vars['--surface-1'],
      '--bg-card': vars['--surface-2'],
      '--border-gold': `1px solid ${vars['--border-strong-color']}`,
      '--border-thin': `1px solid ${vars['--border-soft-color']}`,
      '--border-dim': `1px solid ${vars['--border-faint-color']}`,
      '--shadow-card': vars['--shadow-soft'],
      '--shadow-gold': vars['--shadow-accent'],
      '--shadow-hover': vars['--shadow-float'],
      '--background-overlay-opacity': vars['--overlay-opacity']
    };
  }

  const SKIN_THEMES = {
    graphite: {
      name: '石墨中性',
      icon: 'bi-circle-square',
      artDecoVars: {
        dark: withLegacy({
          '--page-bg': '#0b0b0c',
          '--surface-1': 'rgba(18, 18, 20, 0.9)',
          '--surface-2': 'rgba(26, 26, 29, 0.74)',
          '--surface-3': 'rgba(38, 38, 42, 0.88)',
          '--surface-raised': 'rgba(48, 48, 52, 0.92)',
          '--surface-input': 'rgba(0, 0, 0, 0.24)',
          '--text-primary': '#f4f4f5',
          '--text-secondary': '#b4b4bc',
          '--text-muted': '#72727c',
          '--accent-primary': '#f2f2f3',
          '--accent-soft': '#ffffff',
          '--accent-strong': '#b3b3ba',
          '--accent-dim': 'rgba(255, 255, 255, 0.14)',
          '--accent-glow': 'rgba(255, 255, 255, 0.22)',
          '--selected-bg': 'rgba(242, 242, 243, 0.1)',
          '--selected-text': '#f4f4f5',
          '--selected-border': 'rgba(255, 255, 255, 0.24)',
          '--border-soft-color': 'rgba(255, 255, 255, 0.08)',
          '--border-strong-color': 'rgba(255, 255, 255, 0.14)',
          '--border-faint-color': 'rgba(255, 255, 255, 0.05)',
          '--shadow-soft': '0 18px 50px rgba(0, 0, 0, 0.44)',
          '--shadow-float': '0 24px 70px rgba(0, 0, 0, 0.48)',
          '--shadow-accent': '0 0 28px rgba(255, 255, 255, 0.08)',
          '--hover-surface': 'rgba(40, 40, 40, 0.85)',
          '--hover-border': 'rgba(255, 255, 255, 0.24)',
          '--hover-shadow': '0 24px 70px rgba(0, 0, 0, 0.48)',
          '--tooltip-bg': 'rgba(12, 12, 12, 0.72)',
          '--tooltip-shadow': '0 8px 24px rgba(0, 0, 0, 0.28)',
          '--icon-surface-bg': 'rgba(255, 255, 255, 0.04)',
          '--artdeco-rotate-primary': 'rgba(255, 255, 255, 0.14)',
          '--artdeco-rotate-secondary': 'rgba(255, 255, 255, 0.08)',
          '--overlay-opacity': '0.46',
          '--grid-line-color': 'rgba(255, 255, 255, 0.06)',
          '--success-soft': 'rgba(82, 196, 26, 0.18)',
          '--success-text': '#d9ffe8',
          '--error-soft': 'rgba(255, 107, 107, 0.16)',
          '--error-text': '#ffe1e1',
          '--info-soft': 'rgba(242, 242, 243, 0.14)',
          '--info-text': '#f4f4f5'
        }),
        light: withLegacy({
          '--page-bg': '#ececef',
          '--surface-1': 'rgba(255, 255, 255, 0.88)',
          '--surface-2': 'rgba(255, 255, 255, 0.78)',
          '--surface-3': 'rgba(246, 246, 248, 0.96)',
          '--surface-raised': '#ffffff',
          '--surface-input': 'rgba(255, 255, 255, 0.94)',
          '--text-primary': '#15161a',
          '--text-secondary': '#5d6068',
          '--text-muted': '#8a8d96',
          '--accent-primary': '#17181b',
          '--accent-soft': '#3a3c42',
          '--accent-strong': '#5f6168',
          '--accent-dim': 'rgba(23, 24, 27, 0.12)',
          '--accent-glow': 'rgba(23, 24, 27, 0.18)',
          '--selected-bg': 'rgba(23, 24, 27, 0.08)',
          '--selected-text': '#17181b',
          '--selected-border': 'rgba(23, 24, 27, 0.18)',
          '--border-soft-color': 'rgba(23, 24, 27, 0.1)',
          '--border-strong-color': 'rgba(23, 24, 27, 0.12)',
          '--border-faint-color': 'rgba(23, 24, 27, 0.06)',
          '--shadow-soft': '0 18px 42px rgba(17, 18, 22, 0.12)',
          '--shadow-float': '0 24px 60px rgba(17, 18, 22, 0.16)',
          '--shadow-accent': '0 0 20px rgba(23, 24, 27, 0.05)',
          '--hover-surface': 'rgba(255, 255, 255, 0.94)',
          '--hover-border': 'rgba(23, 24, 27, 0.18)',
          '--hover-shadow': '0 16px 34px rgba(17, 18, 22, 0.09)',
          '--tooltip-bg': 'rgba(255, 255, 255, 0.94)',
          '--tooltip-shadow': '0 10px 28px rgba(17, 18, 22, 0.12)',
          '--icon-surface-bg': 'rgba(255, 255, 255, 0.72)',
          '--artdeco-rotate-primary': 'rgba(23, 24, 27, 0.1)',
          '--artdeco-rotate-secondary': 'rgba(23, 24, 27, 0.05)',
          '--overlay-opacity': '0.16',
          '--grid-line-color': 'rgba(23, 24, 27, 0.06)',
          '--success-soft': 'rgba(82, 196, 26, 0.12)',
          '--success-text': '#1f7a35',
          '--error-soft': 'rgba(255, 107, 107, 0.12)',
          '--error-text': '#b24848',
          '--info-soft': 'rgba(23, 24, 27, 0.08)',
          '--info-text': '#30323a'
        })
      }
    },
    neon: {
      name: '霓虹风格',
      icon: 'bi-stars',
      artDecoVars: {
        dark: withLegacy({
          '--page-bg': '#0a0a0f',
          '--surface-1': 'rgba(13, 1, 34, 0.98)',
          '--surface-2': 'rgba(28, 12, 34, 0.78)',
          '--surface-3': 'rgba(42, 12, 32, 0.9)',
          '--surface-raised': 'rgba(56, 14, 44, 0.96)',
          '--surface-input': 'rgba(0, 0, 0, 0.26)',
          '--text-primary': '#ffffff',
          '--text-secondary': '#ff6b9d',
          '--text-muted': '#8b86bd',
          '--accent-primary': '#ff2d9a',
          '--accent-soft': '#ff8fd1',
          '--accent-strong': '#d41472',
          '--accent-dim': 'rgba(255, 45, 154, 0.24)',
          '--accent-glow': 'rgba(255, 79, 182, 0.3)',
          '--selected-bg': 'rgba(255, 45, 154, 0.16)',
          '--selected-text': '#ffffff',
          '--selected-border': 'rgba(255, 143, 209, 0.3)',
          '--border-soft-color': 'rgba(255, 45, 154, 0.14)',
          '--border-strong-color': 'rgba(255, 143, 209, 0.2)',
          '--border-faint-color': 'rgba(255, 45, 154, 0.08)',
          '--shadow-soft': '0 8px 40px rgba(0, 0, 0, 0.6)',
          '--shadow-float': '0 12px 50px rgba(255, 45, 154, 0.2)',
          '--shadow-accent': '0 0 24px rgba(255, 45, 154, 0.18)',
          '--hover-surface': 'rgba(60, 12, 44, 0.88)',
          '--hover-border': 'rgba(255, 143, 209, 0.34)',
          '--hover-shadow': '0 16px 48px rgba(255, 45, 154, 0.22)',
          '--tooltip-bg': 'rgba(25, 7, 31, 0.88)',
          '--tooltip-shadow': '0 10px 28px rgba(0, 0, 0, 0.3)',
          '--icon-surface-bg': 'rgba(255, 255, 255, 0.06)',
          '--artdeco-rotate-primary': 'rgba(255, 0, 128, 0.24)',
          '--artdeco-rotate-secondary': 'rgba(255, 102, 196, 0.18)',
          '--overlay-opacity': '0.42',
          '--grid-line-color': 'rgba(255, 45, 154, 0.08)',
          '--success-soft': 'rgba(82, 196, 26, 0.18)',
          '--success-text': '#d9ffe8',
          '--error-soft': 'rgba(255, 107, 107, 0.18)',
          '--error-text': '#ffe1e1',
          '--info-soft': 'rgba(255, 45, 154, 0.14)',
          '--info-text': '#ffd1e9'
        }),
        light: withLegacy({
          '--page-bg': '#fff7fb',
          '--surface-1': 'rgba(255, 255, 255, 0.96)',
          '--surface-2': 'rgba(255, 244, 250, 0.9)',
          '--surface-3': 'rgba(255, 236, 246, 0.98)',
          '--surface-raised': '#ffffff',
          '--surface-input': 'rgba(255, 255, 255, 0.94)',
          '--text-primary': '#2a1830',
          '--text-secondary': '#9d3a72',
          '--text-muted': '#a8889a',
          '--accent-primary': '#ff2d9a',
          '--accent-soft': '#ff8fd1',
          '--accent-strong': '#d41472',
          '--accent-dim': 'rgba(255, 45, 154, 0.16)',
          '--accent-glow': 'rgba(255, 79, 182, 0.2)',
          '--selected-bg': 'rgba(255, 45, 154, 0.12)',
          '--selected-text': '#8f1254',
          '--selected-border': 'rgba(212, 20, 114, 0.2)',
          '--border-soft-color': 'rgba(212, 20, 114, 0.1)',
          '--border-strong-color': 'rgba(212, 20, 114, 0.14)',
          '--border-faint-color': 'rgba(212, 20, 114, 0.06)',
          '--shadow-soft': '0 10px 34px rgba(81, 21, 56, 0.1)',
          '--shadow-float': '0 16px 36px rgba(212, 20, 114, 0.16)',
          '--shadow-accent': '0 0 20px rgba(255, 45, 154, 0.12)',
          '--hover-surface': 'rgba(255, 248, 252, 0.98)',
          '--hover-border': 'rgba(212, 20, 114, 0.18)',
          '--hover-shadow': '0 14px 30px rgba(212, 20, 114, 0.12)',
          '--tooltip-bg': 'rgba(255, 248, 252, 0.96)',
          '--tooltip-shadow': '0 10px 28px rgba(81, 21, 56, 0.12)',
          '--icon-surface-bg': 'rgba(255, 45, 154, 0.06)',
          '--artdeco-rotate-primary': 'rgba(255, 45, 154, 0.1)',
          '--artdeco-rotate-secondary': 'rgba(255, 143, 209, 0.1)',
          '--overlay-opacity': '0.12',
          '--grid-line-color': 'rgba(212, 20, 114, 0.05)',
          '--success-soft': 'rgba(82, 196, 26, 0.12)',
          '--success-text': '#22753a',
          '--error-soft': 'rgba(255, 107, 107, 0.12)',
          '--error-text': '#b24848',
          '--info-soft': 'rgba(255, 45, 154, 0.1)',
          '--info-text': '#9d3a72'
        })
      }
    },
    cream: {
      name: '奶油复古',
      icon: 'bi-flower1',
      artDecoVars: {
        dark: withLegacy({
          '--page-bg': '#2a211b',
          '--surface-1': 'rgba(52, 40, 32, 0.9)',
          '--surface-2': 'rgba(67, 52, 43, 0.82)',
          '--surface-3': 'rgba(84, 65, 54, 0.92)',
          '--surface-raised': 'rgba(98, 76, 62, 0.96)',
          '--surface-input': 'rgba(42, 31, 25, 0.82)',
          '--text-primary': '#f4ebdc',
          '--text-secondary': '#d4c0a8',
          '--text-muted': '#b39b84',
          '--accent-primary': '#c9962a',
          '--accent-soft': '#dfbe74',
          '--accent-strong': '#a87820',
          '--accent-dim': 'rgba(201, 150, 42, 0.18)',
          '--accent-glow': 'rgba(201, 150, 42, 0.22)',
          '--selected-bg': 'rgba(107, 142, 36, 0.22)',
          '--selected-text': '#f7f2e8',
          '--selected-border': 'rgba(107, 142, 36, 0.34)',
          '--border-soft-color': 'rgba(244, 235, 220, 0.1)',
          '--border-strong-color': 'rgba(210, 184, 145, 0.22)',
          '--border-faint-color': 'rgba(244, 235, 220, 0.06)',
          '--shadow-soft': '0 18px 42px rgba(19, 13, 9, 0.34)',
          '--shadow-float': '0 22px 48px rgba(19, 13, 9, 0.4)',
          '--shadow-accent': '0 0 24px rgba(201, 150, 42, 0.12)',
          '--hover-surface': 'rgba(82, 63, 51, 0.96)',
          '--hover-border': 'rgba(210, 184, 145, 0.28)',
          '--hover-shadow': '0 20px 44px rgba(19, 13, 9, 0.34)',
          '--tooltip-bg': 'rgba(61, 47, 37, 0.94)',
          '--tooltip-shadow': '0 12px 28px rgba(19, 13, 9, 0.26)',
          '--icon-surface-bg': 'rgba(251, 247, 239, 0.08)',
          '--artdeco-rotate-primary': 'rgba(201, 150, 42, 0.1)',
          '--artdeco-rotate-secondary': 'rgba(107, 142, 36, 0.08)',
          '--overlay-opacity': '0.24',
          '--grid-line-color': 'rgba(255, 244, 230, 0.05)',
          '--success-soft': 'rgba(107, 142, 36, 0.2)',
          '--success-text': '#edf7d9',
          '--error-soft': 'rgba(186, 94, 71, 0.2)',
          '--error-text': '#ffe8e1',
          '--info-soft': 'rgba(201, 150, 42, 0.18)',
          '--info-text': '#faeccf'
        }),
        light: withLegacy({
          '--page-bg': '#f7f2e8',
          '--surface-1': 'rgba(251, 247, 239, 0.88)',
          '--surface-2': 'rgba(245, 239, 228, 0.88)',
          '--surface-3': 'rgba(237, 229, 214, 0.96)',
          '--surface-raised': '#fbf7ef',
          '--surface-input': 'rgba(255, 252, 246, 0.94)',
          '--text-primary': '#40362f',
          '--text-secondary': '#6e6258',
          '--text-muted': '#a79a8d',
          '--accent-primary': '#c9962a',
          '--accent-soft': '#e0bf7a',
          '--accent-strong': '#a9751b',
          '--accent-dim': 'rgba(201, 150, 42, 0.14)',
          '--accent-glow': 'rgba(201, 150, 42, 0.16)',
          '--selected-bg': 'rgba(107, 142, 36, 0.16)',
          '--selected-text': '#465d17',
          '--selected-border': 'rgba(107, 142, 36, 0.24)',
          '--border-soft-color': 'rgba(120, 96, 62, 0.14)',
          '--border-strong-color': 'rgba(120, 96, 62, 0.24)',
          '--border-faint-color': 'rgba(120, 96, 62, 0.08)',
          '--shadow-soft': '0 10px 30px rgba(120, 93, 57, 0.08)',
          '--shadow-float': '0 18px 36px rgba(120, 93, 57, 0.12)',
          '--shadow-accent': '0 0 18px rgba(201, 150, 42, 0.1)',
          '--hover-surface': 'rgba(255, 251, 245, 0.98)',
          '--hover-border': 'rgba(120, 96, 62, 0.22)',
          '--hover-shadow': '0 16px 28px rgba(120, 93, 57, 0.12)',
          '--tooltip-bg': 'rgba(255, 251, 245, 0.96)',
          '--tooltip-shadow': '0 10px 28px rgba(120, 93, 57, 0.12)',
          '--icon-surface-bg': 'rgba(255, 255, 255, 0.42)',
          '--artdeco-rotate-primary': 'rgba(201, 150, 42, 0.06)',
          '--artdeco-rotate-secondary': 'rgba(107, 142, 36, 0.04)',
          '--overlay-opacity': '0.08',
          '--grid-line-color': 'rgba(120, 96, 62, 0.05)',
          '--success-soft': 'rgba(107, 142, 36, 0.14)',
          '--success-text': '#5b7330',
          '--error-soft': 'rgba(186, 94, 71, 0.14)',
          '--error-text': '#a24f3b',
          '--info-soft': 'rgba(201, 150, 42, 0.12)',
          '--info-text': '#8f6b1d'
        })
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

    const currentSkinIcon = document.querySelector('.current-skin-icon');
    if (currentSkinIcon && SKIN_THEMES[currentSkin]) {
      currentSkinIcon.className = `bi ${SKIN_THEMES[currentSkin].icon} current-skin-icon`;
      currentSkinIcon.style.color = SKIN_THEMES[currentSkin].artDecoVars[currentMode]['--accent-primary'];
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

      if (primaryDot) primaryDot.style.background = skinColors['--surface-2'];
      if (secondaryDot) secondaryDot.style.background = skinColors['--accent-primary'];
      if (accentDot) accentDot.style.background = skinColors['--selected-bg'];
    });
  }

  function updateFavicon() {
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent-primary')
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

    document.querySelectorAll('#desktop-theme-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleMode();
      });
    });
  }

  return {
    init,
    setSkin,
    toggleMode,
    bindEvents
  };
})();

window.ThemeManager = ThemeManager;
