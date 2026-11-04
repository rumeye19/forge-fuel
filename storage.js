import { blankState, validateState, upgradeState } from './core.js';

let database;
export async function openStore() {
  if (!globalThis.indexedDB) throw new Error('On-device storage is unavailable in this browser.');
  database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('forge-fuel', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Forge&Fuel tabs, then reopen.'));
  });
  database.onversionchange = () => database.close();
  return readStore();
}
export function readStore() {
  return new Promise((resolve, reject) => {
    const request = database.transaction('state', 'readonly').objectStore('state').get('current');
    request.onsuccess = () => {
      try { resolve(request.result ? upgradeState(request.result) : blankState()); } catch (e) { reject(e); }
    };
    request.onerror = () => reject(request.error);
  });
}
export function writeStore(value, expectedRevision) {
  validateState(value);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('state', 'readwrite');
    const store = transaction.objectStore('state');
    let failure;
    const request = store.get('current');
    request.onsuccess = () => {
      const revision = request.result?.revision ?? 0;
      if (revision !== expectedRevision) {
        failure = new Error('Data changed in another tab. Reopen the app before making more changes.');
        transaction.abort(); return;
      }
      store.put(value, 'current');
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(failure || transaction.error || new Error('Save interrupted. Your change was not saved.'));
    transaction.onerror = () => { failure ||= transaction.error; };
  });
}
