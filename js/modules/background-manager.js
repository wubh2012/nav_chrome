/**
 * Applies the configured light/dark background profile to the new tab page.
 */
const BackgroundManager = (function() {
  'use strict';

  let imageLayer = null;
  let overlayLayer = null;
  let activeObjectUrl = null;
  let activeThemeMode = null;
  let requestVersion = 0;
  let eventsBound = false;

  async function init() {
    imageLayer = document.querySelector('.background-image-layer');
    overlayLayer = document.querySelector('.background-overlay-layer');

    if (!imageLayer || !overlayLayer || !window.Storage) {
      return;
    }

    bindEvents();
    const themeMode = resolveThemeMode();
    activeThemeMode = themeMode;
    await applyCurrentBackground(themeMode);
  }

  function bindEvents() {
    if (eventsBound) return;

    document.addEventListener('chromeNav:themeChanged', (event) => {
      const nextMode = normalizeThemeMode(event.detail?.mode);
      if (nextMode === activeThemeMode) return;

      activeThemeMode = nextMode;
      void applyCurrentBackground(nextMode);
    });
    eventsBound = true;
  }

  function resolveThemeMode() {
    if (window.ThemeManager && typeof ThemeManager.getCurrentMode === 'function') {
      return normalizeThemeMode(ThemeManager.getCurrentMode());
    }
    return normalizeThemeMode(document.documentElement.dataset.theme);
  }

  function normalizeThemeMode(themeMode) {
    return themeMode === 'dark' ? 'dark' : 'light';
  }

  async function applyCurrentBackground(themeMode = resolveThemeMode()) {
    const safeThemeMode = normalizeThemeMode(themeMode);
    const currentRequest = ++requestVersion;
    const settings = await Storage.loadBackgroundSettings(safeThemeMode);
    if (currentRequest !== requestVersion) return false;

    if (settings.mode === 'default') {
      resetVisualSettings();
      clearImage();
      return true;
    }

    if (settings.mode === 'url') {
      if (!settings.url) {
        await fallbackToDefault(safeThemeMode, settings, currentRequest);
        return false;
      }
      return loadAndCommit(settings.url, settings, safeThemeMode, currentRequest, false);
    }

    if (settings.mode === 'upload') {
      try {
        const saved = await BackgroundStorage.getUploadedBackground(safeThemeMode);
        if (currentRequest !== requestVersion) return false;
        if (!saved || !(saved.blob instanceof Blob)) {
          await fallbackToDefault(safeThemeMode, settings, currentRequest);
          return false;
        }

        const objectUrl = URL.createObjectURL(saved.blob);
        return loadAndCommit(objectUrl, settings, safeThemeMode, currentRequest, true);
      } catch (error) {
        console.warn('[BackgroundManager] Failed to load uploaded background:', error);
        await fallbackToDefault(safeThemeMode, settings, currentRequest);
        return false;
      }
    }

    await fallbackToDefault(safeThemeMode, settings, currentRequest);
    return false;
  }

  function loadAndCommit(url, settings, themeMode, currentRequest, isObjectUrl) {
    return new Promise((resolve) => {
      const probe = new Image();

      probe.onload = () => {
        if (currentRequest !== requestVersion) {
          if (isObjectUrl) URL.revokeObjectURL(url);
          resolve(false);
          return;
        }

        applyVisualSettings(settings);
        imageLayer.classList.remove('is-visible');
        imageLayer.style.backgroundImage = `url("${escapeUrl(url)}")`;

        const previousObjectUrl = activeObjectUrl;
        activeObjectUrl = isObjectUrl ? url : null;
        if (previousObjectUrl && previousObjectUrl !== activeObjectUrl) {
          URL.revokeObjectURL(previousObjectUrl);
        }

        requestAnimationFrame(() => {
          if (currentRequest === requestVersion && imageLayer) {
            imageLayer.classList.add('is-visible');
          }
        });
        resolve(true);
      };

      probe.onerror = async () => {
        if (isObjectUrl) URL.revokeObjectURL(url);
        if (currentRequest === requestVersion) {
          await fallbackToDefault(themeMode, settings, currentRequest);
        }
        resolve(false);
      };

      probe.src = url;
    });
  }

  function applyVisualSettings(settings) {
    if (!overlayLayer || !imageLayer) return;

    overlayLayer.style.background = `rgba(0, 0, 0, ${settings.overlayOpacity})`;
    imageLayer.style.backgroundSize = settings.size;
    imageLayer.style.backgroundPosition = settings.position;
    imageLayer.style.filter = settings.blurPx > 0 ? `blur(${settings.blurPx}px)` : 'none';
    document.body.classList.add('has-custom-background');
  }

  function resetVisualSettings() {
    if (!overlayLayer || !imageLayer) return;

    overlayLayer.style.background = 'rgba(0, 0, 0, var(--background-overlay-opacity))';
    imageLayer.style.backgroundSize = 'cover';
    imageLayer.style.backgroundPosition = 'center center';
    imageLayer.style.filter = 'none';
    document.body.classList.remove('has-custom-background');
  }

  async function fallbackToDefault(themeMode, settings, currentRequest) {
    if (currentRequest !== requestVersion) return;

    resetVisualSettings();
    clearImage();
    try {
      await Storage.saveBackgroundSettings(themeMode, {
        ...settings,
        mode: 'default',
        url: ''
      });
    } catch (error) {
      console.warn('[BackgroundManager] Failed to persist default background fallback:', error);
    }

    if (currentRequest === requestVersion
      && window.UIRenderer
      && typeof UIRenderer.showSyncStatus === 'function') {
      UIRenderer.showSyncStatus(
        `${themeMode === 'dark' ? '深色' : '浅色'}背景加载失败，已恢复默认背景`,
        'info'
      );
    }
  }

  function clearImage() {
    if (!imageLayer) return;

    imageLayer.style.backgroundImage = 'none';
    imageLayer.classList.remove('is-visible');
    document.body.classList.remove('has-custom-background');
    revokeObjectUrl();
  }

  function revokeObjectUrl() {
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
  }

  function escapeUrl(url) {
    return String(url || '').replace(/"/g, '\\"');
  }

  return {
    init,
    applyCurrentBackground
  };
})();

window.BackgroundManager = BackgroundManager;
