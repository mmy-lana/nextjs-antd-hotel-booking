/**
 * In-memory Web Storage double used by the domain suites so the browser-only
 * persistence layer can be exercised inside Node.
 *
 * It implements the full `Storage` contract (including quota errors when
 * `failOnWrite` is enabled) so `lib/utils/storage.ts` sees exactly the same API
 * surface it uses in the browser.
 *
 * A single instance is reused for the lifetime of the process because Zustand's
 * `persist` middleware captures `window.localStorage` once, at store creation
 * time; swapping the object would silently detach the stores from the fixture.
 */

class MemoryStorage {
  constructor() {
    /** @type {Map<string, string>} */
    this.map = new Map();
    /** When true, every `setItem` throws a `QuotaExceededError` like Safari private mode. */
    this.failOnWrite = false;
    /** When true, every read returns raw corrupted text regardless of stored state. */
    this.corruptReads = false;
  }

  get length() {
    return this.map.size;
  }

  key(index) {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key) {
    if (this.corruptReads) {
      return '{not-json';
    }
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    if (this.failOnWrite) {
      const error = new Error('The quota has been exceeded.');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

/** @type {MemoryStorage | null} */
let singleton = null;

/**
 * Installs `window.localStorage` on the Node global scope on first call.
 *
 * @returns the shared `MemoryStorage` instance.
 */
export function installMemoryStorage() {
  if (!singleton) {
    singleton = new MemoryStorage();
    globalThis.window = { localStorage: singleton };
  }
  return singleton;
}

/** Empties the shared storage and clears every fault-injection flag. */
export function resetMemoryStorage() {
  const storage = installMemoryStorage();
  storage.clear();
  storage.failOnWrite = false;
  storage.corruptReads = false;
  globalThis.window = { localStorage: storage };
  return storage;
}

/** Temporarily removes the window global so SSR branches can be exercised. */
export function detachWindow() {
  delete globalThis.window;
}

/** Restores the window global after {@link detachWindow}. */
export function attachWindow() {
  globalThis.window = { localStorage: installMemoryStorage() };
}

export { MemoryStorage };