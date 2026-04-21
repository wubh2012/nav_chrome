/**
 * IndexedDB-backed storage for uploaded background images.
 */
const BackgroundStorage = (function() {
  'use strict';

  const DB_NAME = 'chromeNavBackgrounds';
  const STORE_NAME = 'assets';
  const DB_VERSION = 1;
  const CURRENT_KEY = 'currentBackground';

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

  async function saveUploadedBackground(blob) {
    if (!(blob instanceof Blob)) {
      throw new Error('Background file is invalid');
    }

    return withStore('readwrite', (store) => {
      store.put({
        id: CURRENT_KEY,
        blob,
        mimeType: blob.type || 'image/jpeg',
        updatedAt: Date.now()
      });
    });
  }

  async function getUploadedBackground() {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(CURRENT_KEY);

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

  async function clearUploadedBackground() {
    return withStore('readwrite', (store) => {
      store.delete(CURRENT_KEY);
    });
  }

  return {
    saveUploadedBackground,
    getUploadedBackground,
    clearUploadedBackground
  };
})();

window.BackgroundStorage = BackgroundStorage;
