/**
 * IndexedDB persistence. One database with four object stores. Every write
 * goes through `writeBatch`, which runs all operations in a single
 * transaction, so multi-record changes (restores, goal switches, phase
 * switches) either fully apply or fully roll back.
 */
import type { AppData, UserSettings, WeightEntry, WeightGoal, WeightPhase } from './types';
import { DEFAULT_SETTINGS } from './types';

const DB_NAME = 'weight-tracker';
const DB_VERSION = 1;
const SETTINGS_KEY = 'user';

export type StoreName = 'entries' | 'goals' | 'phases' | 'settings';

export type WriteOp =
  | { type: 'put'; store: 'entries'; value: WeightEntry }
  | { type: 'put'; store: 'goals'; value: WeightGoal }
  | { type: 'put'; store: 'phases'; value: WeightPhase }
  | { type: 'put'; store: 'settings'; value: UserSettings }
  | { type: 'delete'; store: StoreName; key: string }
  | { type: 'clear'; store: StoreName };

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support local storage (IndexedDB).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) {
        db.createObjectStore('entries', { keyPath: 'id' }).createIndex('measured_at', 'measured_at');
      }
      if (!db.objectStoreNames.contains('goals')) db.createObjectStore('goals', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('phases')) db.createObjectStore('phases', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('Could not open the database.'));
    req.onblocked = () => reject(new Error('The database is in use by another tab. Close other tabs and reload.'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function getAll<T>(tx: IDBTransaction, store: StoreName): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const r = tx.objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result as T[]);
    r.onerror = () => reject(r.error);
  });
}

export async function loadAll(): Promise<AppData> {
  const db = await openDb();
  const tx = db.transaction(['entries', 'goals', 'phases', 'settings'], 'readonly');
  const settingsReq = new Promise<UserSettings | undefined>((resolve, reject) => {
    const r = tx.objectStore('settings').get(SETTINGS_KEY);
    r.onsuccess = () => resolve(r.result as UserSettings | undefined);
    r.onerror = () => reject(r.error);
  });
  const [entries, goals, phases, settings] = await Promise.all([
    getAll<WeightEntry>(tx, 'entries'),
    getAll<WeightGoal>(tx, 'goals'),
    getAll<WeightPhase>(tx, 'phases'),
    settingsReq,
  ]);
  return { entries, goals, phases, settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) } };
}

export async function writeBatch(ops: readonly WriteOp[]): Promise<void> {
  if (!ops.length) return;
  const db = await openDb();
  const stores = [...new Set(ops.map((o) => o.store))];
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Saving failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Saving was aborted.'));
    try {
      for (const op of ops) {
        const s = tx.objectStore(op.store);
        if (op.type === 'put') {
          if (op.store === 'settings') s.put(op.value, SETTINGS_KEY);
          else s.put(op.value);
        } else if (op.type === 'delete') s.delete(op.key);
        else s.clear();
      }
    } catch (err) {
      tx.abort();
      reject(err);
    }
  });
}

/** Ops that atomically replace all stored data. */
export function replaceAllOps(data: AppData): WriteOp[] {
  return [
    { type: 'clear', store: 'entries' },
    { type: 'clear', store: 'goals' },
    { type: 'clear', store: 'phases' },
    ...data.entries.map((value): WriteOp => ({ type: 'put', store: 'entries', value })),
    ...data.goals.map((value): WriteOp => ({ type: 'put', store: 'goals', value })),
    ...data.phases.map((value): WriteOp => ({ type: 'put', store: 'phases', value })),
    { type: 'put', store: 'settings', value: data.settings },
  ];
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* best effort */
  }
}
