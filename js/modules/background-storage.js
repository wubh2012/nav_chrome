/**
 * IndexedDB-backed storage for uploaded light/dark background images.
 */
const BackgroundStorage = (function() {
  'use strict';

  const DB_NAME = 'chromeNavBackgrounds';
  const STORE_NAME = 'assets';
  const DB_VERSION = 1;
  const LEGACY_KEY = 'currentBackground';

  function normalizeThemeMode(themeMode) {
    return themeMode === 'dark' ? 'dark' : 'light';
  }

  function getModeKey(themeMode) {
    return `${normalizeThemeMode(themeMode)}Background`;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
    });
  }

  async function withStore(mode, callback) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);

      let result;
      try {
        result = callback(store);
      } catch (error) {
        db.close();
        reject(error);
        return;
      }

      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error('IndexedDB transaction failed'));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error || new Error('IndexedDB transaction aborted'));
      };
    });
  }

  async function saveUploadedBackground(themeMode, blob) {
    if (!(blob instanceof Blob)) {
      throw new Error('Background file is invalid');
    }

    return withStore('readwrite', (store) => {
      store.put({
        id: getModeKey(themeMode),
        blob,
        mimeType: blob.type || 'image/jpeg',
        updatedAt: Date.now()
      });
    });
  }

  async function getUploadedBackground(themeMode) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(getModeKey(themeMode));

      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error || new Error('Failed to read uploaded background'));
      };
    });
  }

  async function clearUploadedBackground(themeMode) {
    return withStore('readwrite', (store) => {
      store.delete(getModeKey(themeMode));
    });
  }

  async function clearAllUploadedBackgrounds() {
    return withStore('readwrite', (store) => {
      store.delete(getModeKey('light'));
      store.delete(getModeKey('dark'));
      store.delete(LEGACY_KEY);
    });
  }

  async function migrateLegacyUploadedBackground(themeMode) {
    const targetKey = getModeKey(themeMode);
    const state = { migrated: false, alreadyPresent: false };

    await withStore('readwrite', (store) => {
      const legacyRequest = store.get(LEGACY_KEY);
      const targetRequest = store.get(targetKey);
      let legacyRecord;
      let targetRecord;
      let completed = 0;

      const finish = () => {
        completed += 1;
        if (completed < 2 || !legacyRecord) return;

        if (!targetRecord) {
          store.put({
            ...legacyRecord,
            id: targetKey,
            updatedAt: legacyRecord.updatedAt || Date.now()
          });
          state.migrated = true;
        } else {
          state.alreadyPresent = true;
        }
        store.delete(LEGACY_KEY);
      };

      legacyRequest.onsuccess = () => {
        legacyRecord = legacyRequest.result || null;
        finish();
      };
      targetRequest.onsuccess = () => {
        targetRecord = targetRequest.result || null;
        finish();
      };
    });

    return state;
  }

  return {
    saveUploadedBackground,
    getUploadedBackground,
    clearUploadedBackground,
    clearAllUploadedBackgrounds,
    migrateLegacyUploadedBackground
  };
})();

window.BackgroundStorage = BackgroundStorage;
