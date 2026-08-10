/**
 * Background settings extension for Storage.
 *
 * Background profiles are global to the extension and keyed by light/dark mode.
 * Skin selection (graphite/neon/cream) does not affect the selected profile.
 */
(function() {
  'use strict';

  if (!window.Storage) {
    console.warn('[BackgroundConfig] Storage is not available');
    return;
  }

  const KEY = 'chromeNav_backgroundSettings';
  const VERSION = 2;
  const THEME_MODES = ['light', 'dark'];
  const DEFAULT_PROFILE = Object.freeze({
    mode: 'default',
    url: '',
    overlayOpacity: 0.38,
    blurPx: 0,
    size: 'cover',
    position: 'center center',
    updatedAt: 0
  });

  let migrationPromise = null;

  function normalizeThemeMode(themeMode) {
    return THEME_MODES.includes(themeMode) ? themeMode : 'light';
  }

  function normalizeProfile(settings = {}) {
    const mode = ['default', 'upload', 'url'].includes(settings.mode) ? settings.mode : DEFAULT_PROFILE.mode;
    const size = ['cover', 'contain'].includes(settings.size) ? settings.size : DEFAULT_PROFILE.size;
    const overlayOpacity = Number.isFinite(Number(settings.overlayOpacity))
      ? Math.min(0.85, Math.max(0, Number(settings.overlayOpacity)))
      : DEFAULT_PROFILE.overlayOpacity;
    const blurPx = Number.isFinite(Number(settings.blurPx))
      ? Math.min(24, Math.max(0, Number(settings.blurPx)))
      : DEFAULT_PROFILE.blurPx;

    return {
      ...DEFAULT_PROFILE,
      ...settings,
      mode,
      url: typeof settings.url === 'string' ? settings.url.trim() : '',
      overlayOpacity,
      blurPx,
      size,
      position: typeof settings.position === 'string' && settings.position.trim()
        ? settings.position.trim()
        : DEFAULT_PROFILE.position,
      updatedAt: Number.isFinite(Number(settings.updatedAt)) ? Number(settings.updatedAt) : 0
    };
  }

  function createProfiles(source = {}) {
    return {
      version: VERSION,
      profiles: {
        light: normalizeProfile(source.light),
        dark: normalizeProfile(source.dark)
      }
    };
  }

  function isVersionTwo(settings) {
    return settings?.version === VERSION && settings.profiles && typeof settings.profiles === 'object';
  }

  async function readStoredValue() {
    const result = await Storage.get(KEY);
    return result[KEY] || null;
  }

  async function ensureMigrated() {
    if (migrationPromise) {
      return migrationPromise;
    }

    migrationPromise = (async () => {
      const stored = await readStoredValue();
      if (isVersionTwo(stored)) {
        return createProfiles(stored.profiles);
      }

      if (!stored) {
        return createProfiles();
      }

      const preference = await Storage.loadThemePreference();
      const legacyThemeMode = normalizeThemeMode(preference?.mode);
      const profiles = createProfiles();
      profiles.profiles[legacyThemeMode] = normalizeProfile(stored);

      if (stored.mode === 'upload') {
        if (!window.BackgroundStorage
          || typeof BackgroundStorage.migrateLegacyUploadedBackground !== 'function') {
          throw new Error('BackgroundStorage is required to migrate the uploaded background');
        }
        await BackgroundStorage.migrateLegacyUploadedBackground(legacyThemeMode);
      }

      await Storage.set({ [KEY]: profiles });
      return profiles;
    })();

    try {
      return await migrationPromise;
    } catch (error) {
      migrationPromise = null;
      throw error;
    }
  }

  Storage.KEYS.BACKGROUND_SETTINGS = Storage.KEYS.BACKGROUND_SETTINGS || KEY;
  Storage.DEFAULT_BACKGROUND_SETTINGS = DEFAULT_PROFILE;
  Storage.BACKGROUND_SETTINGS_VERSION = VERSION;
  Storage.normalizeThemeMode = normalizeThemeMode;
  Storage.normalizeBackgroundSettings = normalizeProfile;
  Storage.ensureBackgroundSettingsMigrated = ensureMigrated;

  Storage.saveBackgroundSettings = async function saveBackgroundSettings(themeMode, settings) {
    const safeThemeMode = normalizeThemeMode(themeMode);
    const stored = await ensureMigrated();
    const next = createProfiles(stored.profiles);
    next.profiles[safeThemeMode] = normalizeProfile({
      ...settings,
      updatedAt: Date.now()
    });
    await Storage.set({ [KEY]: next });
    migrationPromise = Promise.resolve(next);
    return next.profiles[safeThemeMode];
  };

  Storage.loadBackgroundSettings = async function loadBackgroundSettings(themeMode) {
    try {
      const stored = await ensureMigrated();
      return normalizeProfile(stored.profiles[normalizeThemeMode(themeMode)]);
    } catch (error) {
      console.warn('[BackgroundConfig] Failed to load background settings:', error);
      return normalizeProfile();
    }
  };

  Storage.loadAllBackgroundSettings = async function loadAllBackgroundSettings() {
    try {
      const stored = await ensureMigrated();
      return createProfiles(stored.profiles);
    } catch (error) {
      console.warn('[BackgroundConfig] Failed to load all background settings:', error);
      return createProfiles();
    }
  };

  Storage.clearBackgroundSettings = async function clearBackgroundSettings(themeMode) {
    const safeThemeMode = normalizeThemeMode(themeMode);
    const stored = await ensureMigrated();
    const next = createProfiles(stored.profiles);
    next.profiles[safeThemeMode] = normalizeProfile();
    await Storage.set({ [KEY]: next });
    migrationPromise = Promise.resolve(next);
  };

  Storage.clearAllBackgroundSettings = async function clearAllBackgroundSettings() {
    await Storage.remove(KEY);
    migrationPromise = null;
  };
})();
