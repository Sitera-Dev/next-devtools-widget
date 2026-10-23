import type { DevToolsEntry } from '../shared/types';

const DB_NAME = 'next_devtools_db';
const DB_VERSION = 1;
const SS_KEY = 'next-devtools:entries';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('entries', { keyPath: 'id' });
        req.result.createObjectStore('settings');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

// ---- sessionStorage fallback (used only when IndexedDB is unavailable) ----
function ssRead(): DevToolsEntry[] {
  try {
    return JSON.parse(sessionStorage.getItem(SS_KEY) || '[]');
  } catch {
    return [];
  }
}
function ssWrite(entries: DevToolsEntry[]): void {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify(entries));
  } catch {
    /* quota exceeded: drop persistence silently */
  }
}

export async function loadEntries(): Promise<DevToolsEntry[]> {
  const db = await openDb();
  if (!db) return ssRead();
  const tx = db.transaction('entries', 'readonly');
  const req = tx.objectStore('entries').getAll();
  await done(tx);
  return (req.result as DevToolsEntry[]) || [];
}

export async function saveEntry(entry: DevToolsEntry): Promise<void> {
  const db = await openDb();
  if (!db) {
    const all = ssRead().filter((e) => e.id !== entry.id);
    all.push(entry);
    return ssWrite(all);
  }
  const tx = db.transaction('entries', 'readwrite');
  tx.objectStore('entries').put(entry);
  await done(tx);
}

export async function deleteEntries(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDb();
  if (!db) return ssWrite(ssRead().filter((e) => !ids.includes(e.id)));
  const tx = db.transaction('entries', 'readwrite');
  for (const id of ids) tx.objectStore('entries').delete(id);
  await done(tx);
}

export async function clearEntries(): Promise<void> {
  const db = await openDb();
  if (!db) return ssWrite([]);
  const tx = db.transaction('entries', 'readwrite');
  tx.objectStore('entries').clear();
  await done(tx);
}
