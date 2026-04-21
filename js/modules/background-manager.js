/**
 * Applies configured background images to the new tab page.
 */
const BackgroundManager = (function() {
  'use strict';

  let imageLayer = null;
  let overlayLayer = null;
  let activeObjectUrl = null;

  async function init() {
    imageLayer = document.querySelector('.background-image-layer');
    overlayLayer = document.querySelector('.background-overlay-layer');

    if (!imageLayer || !overlayLayer || !window.Storage) {
      return;
    }

    await applyCurrentBackground();
  }

  async function applyCurrentBackground() {
    const settings = await Storage.loadBackgroundSettings();
    applyVisualSettings(settings);

    if (settings.mode === 'default') {
      clearImage();
      return;
    }

    if (settings.mode === 'url') {
      if (!settings.url) {
        clearImage();
        return;
      }
      void loadIntoLayer(settings.url, true);
      return;
    }

    if (settings.mode === 'upload') {
      const saved = await BackgroundStorage.getUploadedBackground();
      if (!saved || !(saved.blob instanceof Blob)) {
        clearImage();
        return;
      }

      revokeObjectUrl();
      activeObjectUrl = URL.createObjectURL(saved.blob);
      void loadIntoLayer(activeObjectUrl, false);
    }
  }

  function applyVisualSettings(settings) {
    if (!overlayLayer || !imageLayer) return;

    overlayLayer.style.background = `rgba(0, 0, 0, ${settings.overlayOpacity})`;
    imageLayer.style.backgroundSize = settings.size;
    imageLayer.style.backgroundPosition = settings.position;
    imageLayer.style.filter = settings.blurPx > 0 ? `blur(${settings.blurPx}px)` : 'none';
    document.body.classList.toggle('has-custom-background', settings.mode !== 'default');
  }

  function loadIntoLayer(url, resetOnFailure) {
    return new Promise((resolve) => {
      const probe = new Image();

      probe.onload = () => {
        if (imageLayer) {
          imageLayer.style.backgroundImage = `url("${escapeUrl(url)}")`;
          imageLayer.classList.add('is-visible');
        }
        resolve(true);
      };

      probe.onerror = async () => {
        clearImage();

        if (resetOnFailure) {
          await Storage.saveBackgroundSettings({
            ...(await Storage.loadBackgroundSettings()),
            mode: 'default',
            url: ''
          });
        }

        if (window.UIRenderer && typeof UIRenderer.showSyncStatus === 'function') {
          UIRenderer.showSyncStatus('背景图片加载失败，已恢复默认背景', 'info');
        }
        resolve(false);
      };

      probe.src = url;
    });
  }

  async function resetToDefault() {
    clearImage();
    await Storage.clearBackgroundSettings();
    await BackgroundStorage.clearUploadedBackground();
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
    applyCurrentBackground,
    resetToDefault
  };
})();

window.BackgroundManager = BackgroundManager;
