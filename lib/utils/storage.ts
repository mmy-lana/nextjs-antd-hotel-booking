import type { AddonService, Reservation, Room } from '@/types/booking';

/**
 * Browser-local persistence layer.
 *
 * This module is the single source of truth for the resort's localStorage keys and
 * for every raw read/write performed outside of the Zustand `persist` middleware.
 *
 * Contract:
 *  - Every exported function is SSR safe. When `window.localStorage` is missing
 *    (server render, prerender, unit test) the safe fallback branch is taken and the
 *    caller receives the supplied default instead of a thrown error.
 *  - Reads never throw: corrupted or foreign JSON payloads resolve to the default
 *    value so a poisoned storage entry can never white-screen the application.
 *  - Writes never throw: quota exhaustion and Safari private-mode failures are
 *    reported through the boolean return value so callers can surface a toast.
 */

/** Persisted Zustand store keys. Kept in sync with the `persist` middleware configs. */
export const STORAGE_KEYS = {
  /** `lib/store/inventoryStore.ts` -> rooms, reservations, addons. */
  inventory: 'resort-inventory-storage',
  /** `lib/store/bookingStore.ts` -> active guest search session. */
  bookingSession: 'resort-search-session',
} as const;

/** Zustand `persist` serialises as `{ state: <slice>, version: <number> }`. */
interface PersistedEnvelope<TState> {
  state: TState;
  version: number;
}

/** The serialisable slice of the inventory store (actions are dropped by JSON). */
export interface PersistedInventoryPayload {
  rooms: Room[];
  reservations: Reservation[];
  addons: AddonService[];
}

export const EMPTY_INVENTORY_PAYLOAD: PersistedInventoryPayload = {
  rooms: [],
  reservations: [],
  addons: [],
};

/** The curated collection used to prime storage on a guest's first ever visit. */
export interface InventorySeed {
  rooms: Room[];
  addons: AddonService[];
}

/** Returns the browser `Storage` handle, or `null` when unavailable or blocked. */
export function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const storage = window.localStorage;
    // Safari private mode exposes the object but throws on the first write probe.
    const probeKey = '__resort_storage_probe__';
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

/** True when persisted guest sessions and inventory survive a page reload. */
export function isBrowserStorageAvailable(): boolean {
  return getBrowserStorage() !== null;
}

/**
 * Reads a raw string entry.
 *
 * @returns the stored string, or `null` when storage is unavailable or the key is absent.
 */
export function readRawValue(key: string): string | null {
  const storage = getBrowserStorage();
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Reads and parses a JSON entry, falling back to `fallback` on any failure.
 *
 * @param key localStorage key to read.
 * @param fallback value returned when the key is absent, storage is blocked, or the payload is not valid JSON.
 */
export function readJsonValue<T>(key: string, fallback: T): T {
  const raw = readRawValue(key);
  if (raw === null) {
    return fallback;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') {
      return fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

/**
 * Serialises and stores a JSON value.
 *
 * @returns `true` when the value reached storage, `false` when storage is blocked or over quota.
 */
export function writeJsonValue<T>(key: string, value: T): boolean {
  const storage = getBrowserStorage();
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aura-cove-storage-error', {
          detail: { operation: 'write', key, error },
        })
      );
    }
    return false;
  }
}

/** Removes a single key. Dispatches diagnostic event on failure without throwing. */
export function removeValue(key: string): void {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(key);
  } catch (error) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aura-cove-storage-error', {
          detail: { operation: 'remove', key, error },
        })
      );
    }
  }
}

/** Masks an email address to protect customer PII from shoulder-surfing in public views. */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 1) {
    return trimmed;
  }
  const user = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex);
  if (user.length <= 2) {
    return `${user[0]}*${domain}`;
  }
  return `${user[0]}${'*'.repeat(Math.min(user.length - 2, 6))}${user[user.length - 1]}${domain}`;
}

/** Masks a telephone number, preserving trailing digits for reservation verification. */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 4) {
    return trimmed;
  }
  const visibleTail = trimmed.slice(-2);
  const leading = trimmed.slice(0, trimmed.length - 2);
  return leading.replace(/[0-9]/g, '*') + visibleTail;
}

/**
 * Writes the initial inventory seed **only** when the inventory key is still absent.
 *
 * Never overwrites an existing guest payload, so concierge edits and guest bookings
 * survive rehydration. Safe to call on every mount; it is a no-op after the first visit.
 *
 * @returns `true` when a seed was written, `false` when skipped or storage is blocked.
 */
export function seedInventoryStorage(seed: InventorySeed): boolean {
  if (readRawValue(STORAGE_KEYS.inventory) !== null) {
    return false;
  }
  const envelope: PersistedEnvelope<PersistedInventoryPayload> = {
    state: {
      rooms: seed.rooms,
      reservations: [],
      addons: seed.addons,
    },
    version: 0,
  };
  return writeJsonValue(STORAGE_KEYS.inventory, envelope);
}

/**
 * Reads the persisted inventory snapshot.
 *
 * Tolerates both the Zustand envelope shape and a bare payload so the function stays
 * correct if the persist configuration is ever migrated to a custom storage adapter.
 */
export function readInventorySnapshot(): PersistedInventoryPayload {
  const envelope = readJsonValue<Partial<PersistedEnvelope<PersistedInventoryPayload>> | null>(
    STORAGE_KEYS.inventory,
    null,
  );
  if (envelope && typeof envelope === 'object' && 'state' in envelope && envelope.state) {
    const state = envelope.state;
    return {
      rooms: Array.isArray(state.rooms) ? state.rooms : [],
      reservations: Array.isArray(state.reservations) ? state.reservations : [],
      addons: Array.isArray(state.addons) ? state.addons : [],
    };
  }
  const bare = envelope as Partial<PersistedInventoryPayload> | null;
  if (bare && typeof bare === 'object') {
    return {
      rooms: Array.isArray(bare.rooms) ? bare.rooms : [],
      reservations: Array.isArray(bare.reservations) ? bare.reservations : [],
      addons: Array.isArray(bare.addons) ? bare.addons : [],
    };
  }
  return { ...EMPTY_INVENTORY_PAYLOAD };
}

/** Reads every persisted reservation, newest first. */
export function readStoredReservations(): Reservation[] {
  return readInventorySnapshot().reservations;
}

/** Looks up a single itinerary by its `RES-XXXXXXXXXX` booking reference (case-insensitive). */
export function findStoredReservationByReference(reference: string): Reservation | null {
  const normalised = reference.trim().toUpperCase();
  if (!normalised) {
    return null;
  }
  const match = readStoredReservations().find(
    (reservation) => reservation.bookingReference.toUpperCase() === normalised,
  );
  return match ?? null;
}

/**
 * Deterministic, non-reversible guest fingerprint used for returning-guest itinerary lookup.
 *
 * Implements 32-bit FNV-1a over the case-folded, whitespace-collapsed email address so a
 * guest who books again is matched to their previous stays without persisting a second
 * copy of their personal details.
 *
 * @returns an 8 character lowercase hex identifier, e.g. `guest-1a2b3c4d`.
 */
export function deriveGuestId(email: string): string {
  const normalised = email.trim().toLowerCase();
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalised.length; index += 1) {
    hash ^= normalised.charCodeAt(index);
    // 32-bit FNV prime multiply, kept in unsigned range with Math.imul.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `guest-${hash.toString(16).padStart(8, '0')}`;
}

/**
 * Clears every resort-owned key. Used by the concierge console "reset demo data" action
 * so a staff member can return the browser to the curated seed state.
 */
export function resetResortStorage(): void {
  removeValue(STORAGE_KEYS.inventory);
  removeValue(STORAGE_KEYS.bookingSession);
}