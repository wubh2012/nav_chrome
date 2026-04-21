/**
 * Background settings extension for Storage.
 */
(function() {
  'use strict';

  if (!window.Storage) {
    console.warn('[BackgroundConfig] Storage is not available');
    return;
  }

  const KEY = 'chromeNav_backgroundSettings';
  const DEFAULTS = {
    mode: 'default',
    url: '',
    overlayOpacity: 0.38,
    blurPx: 0,
    size: 'cover',
    position: 'center center',
    updatedAt: 0
  };

  function normalize(settings = {}) {
    const mode = ['default', 'upload', 'url'].includes(settings.mode) ? settings.mode : DEFAULTS.mode;
    const size = ['cover', 'contain'].includes(settings.size) ? settings.size : DEFAULTS.size;
    const overlayOpacity = Number.isFinite(Number(settings.overlayOpacity))
      ? Math.min(0.85, Math.max(0, Number(settings.overlayOpacity)))
      : DEFAULTS.overlayOpacity;
    const blurPx = Number.isFinite(Number(settings.blurPx))
      ? Math.min(24, Math.max(0, Number(settings.blurPx)))
      : DEFAULTS.blurPx;

    return {
      ...DEFAULTS,
      ...settings,
      mode,
      url: typeof settings.url === 'string' ? settings.url.trim() : '',
      overlayOpacity,
      blurPx,
      size,
      position: typeof settings.position === 'string' && settings.position.trim()
        ? settings.position.trim()
        : DEFAULTS.position
    };
  }

  Storage.KEYS.BACKGROUND_SETTINGS = Storage.KEYS.BACKGROUND_SETTINGS || KEY;
  Storage.DEFAULT_BACKGROUND_SETTINGS = DEFAULTS;
  Storage.normalizeBackgroundSettings = normalize;

  Storage.saveBackgroundSettings = async function saveBackgroundSettings(settings) {
    await Storage.set({
      [Storage.KEYS.BACKGROUND_SETTINGS]: {
        ...normalize(settings),
        updatedAt: Date.now()
      }
    });
  };

  Storage.loadBackgroundSettings = async function loadBackgroundSettings() {
    try {
      const result = await Storage.get(Storage.KEYS.BACKGROUND_SETTINGS);
      return normalize(result[Storage.KEYS.BACKGROUND_SETTINGS] || DEFAULTS);
    } catch (error) {
      console.warn('[BackgroundConfig] Failed to load background settings:', error);
      return { ...DEFAULTS };
    }
  };

  Storage.clearBackgroundSettings = async function clearBackgroundSettings() {
    await Storage.remove(Storage.KEYS.BACKGROUND_SETTINGS);
  };
})();
