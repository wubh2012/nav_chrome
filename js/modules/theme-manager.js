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
      '--card-hover-bg': vars['--hover-surface'],
      '--card-hover-border': vars['--hover-border'],
      '--card-hover-shadow': vars['--hover-shadow'],
      '--on-accent': vars['--on-accent'] || '#ffffff',
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
          '--page-bg': '#14171c',
          '--surface-1': 'rgba(27, 32, 39, 0.96)',
          '--surface-2': 'rgba(34, 40, 49, 0.94)',
          '--surface-3': '#2b333e',
          '--surface-raised': '#303a47',
          '--surface-input': '#171c23',
          '--text-primary': '#edf1f7',
          '--text-secondary': '#b7c1cf',
          '--text-muted': '#a2adba',
          '--on-accent': '#182333',
          '--accent-primary': '#aac4e8',
          '--accent-soft': '#c4d7f0',
          '--accent-strong': '#96b2d6',
          '--accent-dim': 'rgba(170, 196, 232, 0.12)',
          '--accent-glow': 'rgba(170, 196, 232, 0.16)',
          '--selected-bg': 'rgba(170, 196, 232, 0.12)',
          '--selected-text': '#d7e5f8',
          '--selected-border': 'rgba(170, 196, 232, 0.32)',
          '--border-soft-color': 'rgba(196, 211, 232, 0.12)',
          '--border-strong-color': 'rgba(196, 211, 232, 0.22)',
          '--border-faint-color': 'rgba(196, 211, 232, 0.07)',
          '--shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.16)',
          '--shadow-float': '0 18px 48px rgba(0, 0, 0, 0.36)',
          '--shadow-accent': '0 2px 8px rgba(0, 0, 0, 0.16)',
          '--hover-surface': '#2b333e',
          '--hover-border': 'rgba(170, 196, 232, 0.32)',
          '--hover-shadow': '0 6px 18px rgba(0, 0, 0, 0.24)',
          '--tooltip-bg': '#303a47',
          '--tooltip-shadow': '0 8px 24px rgba(0, 0, 0, 0.32)',
          '--icon-surface-bg': 'rgba(170, 196, 232, 0.08)',
          '--artdeco-rotate-primary': 'rgba(170, 196, 232, 0.05)',
          '--artdeco-rotate-secondary': 'rgba(170, 196, 232, 0.03)',
          '--overlay-opacity': '0.48',
          '--grid-line-color': 'rgba(196, 211, 232, 0.025)',
          '--success-soft': 'rgba(124, 204, 163, 0.12)',
          '--success-text': '#9cddb9',
          '--error-soft': 'rgba(232, 153, 153, 0.12)',
          '--error-text': '#efb0b0',
          '--info-soft': 'rgba(170, 196, 232, 0.12)',
          '--info-text': '#c4d7f0'
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
    cream: {
      name: '奶油复古',
      icon: 'bi-flower1',
      artDecoVars: {
        dark: withLegacy({
          '--page-bg': '#1c1b18',
          '--surface-1': 'rgba(36, 35, 31, 0.96)',
          '--surface-2': 'rgba(45, 43, 37, 0.94)',
          '--surface-3': '#37342c',
          '--surface-raised': '#3e3a31',
          '--surface-input': '#201f1b',
          '--text-primary': '#f2eee5',
          '--text-secondary': '#c4beaf',
          '--text-muted': '#b5ac9a',
          '--on-accent': '#282419',
          '--accent-primary': '#dbc38d',
          '--accent-soft': '#ead8b1',
          '--accent-strong': '#c7b07d',
          '--accent-dim': 'rgba(219, 195, 141, 0.12)',
          '--accent-glow': 'rgba(219, 195, 141, 0.16)',
          '--selected-bg': 'rgba(219, 195, 141, 0.12)',
          '--selected-text': '#f0dfb9',
          '--selected-border': 'rgba(219, 195, 141, 0.32)',
          '--border-soft-color': 'rgba(225, 214, 190, 0.12)',
          '--border-strong-color': 'rgba(225, 214, 190, 0.22)',
          '--border-faint-color': 'rgba(225, 214, 190, 0.07)',
          '--shadow-soft': '0 2px 8px rgba(0, 0, 0, 0.16)',
          '--shadow-float': '0 18px 48px rgba(0, 0, 0, 0.36)',
          '--shadow-accent': '0 2px 8px rgba(0, 0, 0, 0.16)',
          '--hover-surface': '#37342c',
          '--hover-border': 'rgba(219, 195, 141, 0.32)',
          '--hover-shadow': '0 6px 18px rgba(0, 0, 0, 0.24)',
          '--tooltip-bg': '#3e3a31',
          '--tooltip-shadow': '0 8px 24px rgba(0, 0, 0, 0.32)',
          '--icon-surface-bg': 'rgba(219, 195, 141, 0.08)',
          '--artdeco-rotate-primary': 'rgba(219, 195, 141, 0.05)',
          '--artdeco-rotate-secondary': 'rgba(219, 195, 141, 0.03)',
          '--overlay-opacity': '0.48',
          '--grid-line-color': 'rgba(225, 214, 190, 0.025)',
          '--success-soft': 'rgba(124, 204, 163, 0.12)',
          '--success-text': '#9cddb9',
          '--error-soft': 'rgba(232, 153, 153, 0.12)',
          '--error-text': '#efb0b0',
          '--info-soft': 'rgba(219, 195, 141, 0.12)',
          '--info-text': '#ead8b1'
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
          '--on-accent': '#30230b',
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

  const DEFAULT_SKIN = 'cream';
  const DEFAULT_MODE = 'light';

  let currentSkin = DEFAULT_SKIN;
  let currentMode = DEFAULT_MODE;

  async function init() {
    try {
      const preference = await Storage.loadThemePreference();
      // Retired neon preferences move to graphite without changing light/dark mode.
      currentSkin = preference.skin === 'neon' ? 'graphite' : (preference.skin || DEFAULT_SKIN);
      currentMode = preference.mode || DEFAULT_MODE;

      if (!SKIN_THEMES[currentSkin]) {
        currentSkin = DEFAULT_SKIN;
      }

      if (currentMode !== 'dark' && currentMode !== 'light') {
        currentMode = DEFAULT_MODE;
      }

      applyTheme(false);
      updateSkinSelectorUI();
      if (preference.skin === 'neon') {
        await Storage.saveThemePreference(currentSkin, currentMode);
      }
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
    root.style.colorScheme = currentMode;

    for (const [prop, value] of Object.entries(colors)) {
      root.style.setProperty(prop, value);
    }

    if (persistPreference) {
      Storage.saveThemePreference(currentSkin, currentMode);
    }

    updateThemeIcons();
    updateFavicon();

    document.dispatchEvent(new CustomEvent('chromeNav:themeChanged', {
      detail: { skin: currentSkin, mode: currentMode }
    }));
  }

  function updateSkinSelectorUI() {
    document.querySelectorAll('.skin-option').forEach(option => {
      const skin = option.getAttribute('data-skin');
      option.classList.toggle('active', skin === currentSkin);
      option.setAttribute('aria-pressed', String(skin === currentSkin));
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
      const label = isDark ? '切换到浅色模式' : '切换到深色模式';
      btn.title = label;
      btn.setAttribute('aria-label', label);
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

  function getCurrentMode() {
    return currentMode;
  }

  function getCurrentSkin() {
    return currentSkin;
  }

  function syncSkinSelectorState(isExpanded) {
    const skinSelector = document.getElementById('skin-selector');
    const sidebar = document.getElementById('sidebar');
    if (!skinSelector || !sidebar) return;

    skinSelector.classList.toggle('expanded', isExpanded);
    sidebar.classList.toggle('skin-selector-open', isExpanded);
    skinSelector.querySelector('.current-skin')?.setAttribute('aria-expanded', String(isExpanded));
  }

  function bindEvents() {
    document.querySelectorAll('.current-skin, .skin-option').forEach(control => {
      control.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          control.click();
        }
        if (event.key === 'Escape') {
          syncSkinSelectorState(false);
          document.querySelector('.current-skin')?.focus();
        }
      });
    });

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
    bindEvents,
    getCurrentMode,
    getCurrentSkin
  };
})();

window.ThemeManager = ThemeManager;
