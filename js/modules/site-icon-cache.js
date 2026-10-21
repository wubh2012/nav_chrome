/** 图标 Blob 的 IndexedDB 缓存；仅后台写入，包含持久失败记录及容量淘汰。 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SiteIconCache = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  function create({ indexedDB: idb = globalThis.indexedDB, now = Date.now,
    maxBytes = 20 * 1024 * 1024, maxEntries = 1000 } = {}) {
    let opening;
    let writes = Promise.resolve();
    function open() {
      if (opening) return opening;
      opening = new Promise((resolve, reject) => {
        const request = idb.open('chromeNavSiteIcons', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('icons', { keyPath: 'key' });
        request.onerror = () => reject(request.error || new Error('图标缓存不可用'));
        request.onblocked = () => reject(new Error('图标缓存被旧连接占用'));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); opening = null; };
          db.onclose = () => { opening = null; };
          resolve(db);
        };
      }).catch(error => { opening = null; throw error; });
      return opening;
    }

    async function transaction(mode, action) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('icons', mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('图标缓存读写失败'));
        try { action(tx.objectStore('icons'), value => { result = value; }); }
        catch (error) { tx.abort(); reject(error); }
      });
    }

    function write(action) {
      const operation = writes.then(() => transaction('readwrite', action));
      writes = operation.catch(() => {});
      return operation;
    }

    async function get(key) {
      // 读和清理遵守同一写队列，避免清缓存后又读到尚未提交的旧结果。
      await writes;
      const entry = await transaction('readonly', (store, done) => {
        const request = store.get(key);
        request.onsuccess = () => done(request.result || null);
      });
      if (!entry) return null;
      if (entry.blob && (!(entry.blob instanceof Blob) || !entry.blob.size)) {
        await remove(key);
        return null;
      }
      if (entry.blob) {
        await write(store => {
          const request = store.get(key);
          request.onsuccess = () => {
            if (request.result) store.put({ ...request.result, accessedAt: now() });
          };
        });
      }
      return entry;
    }

    function set(entry) {
      if (!entry?.key || (entry.blob && (!(entry.blob instanceof Blob) || !entry.blob.size
        || entry.blob.size > 512 * 1024))) return Promise.resolve(false);
      return write((store, done) => {
        const record = { ...entry, size: entry.blob?.size || 0, accessedAt: now() };
        store.put(record);
        // 在同一事务中计算并淘汰，防止并发写入越过容量限制。
        const request = store.getAll();
        request.onsuccess = () => {
          const entries = request.result.sort((a, b) => a.accessedAt - b.accessedAt);
          let bytes = entries.reduce((sum, item) => sum + (item.size || 0), 0);
          let count = entries.length;
          for (const item of entries) {
            if (bytes <= maxBytes && count <= maxEntries) break;
            store.delete(item.key);
            bytes -= item.size || 0;
            count--;
          }
          done(true);
        };
      });
    }

    function remove(key) { return write(store => store.delete(key)); }
    function clear() { return write(store => store.clear()); }
    return { get, set, remove, clear };
  }
  return { create };
});
