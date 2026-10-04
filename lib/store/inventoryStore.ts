import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Room, Reservation, AddonService } from '@/types/booking';
import { defaultRooms } from '@/lib/data/seedRooms';
import { defaultAddons } from '@/lib/data/seedAddons';
import { isDateRangeOverlapping } from '@/lib/utils/availability';
import { STORAGE_KEYS, readInventorySnapshot, readRawValue } from '@/lib/utils/storage';

/* -------------------------------------------------------------------------- */
/* Cross-tab synchronisation                                                  */
/* -------------------------------------------------------------------------- */

/** Broadcast channel shared by every open tab of the resort. */
const SYNC_CHANNEL_NAME = 'aura-cove-inventory-sync';

/** Web Lock name serialising the reservation check-then-commit across tabs. */
const COMMIT_LOCK_NAME = 'aura-cove-inventory-commit';

/** Which slice of inventory a mutation touched. */
export type InventoryMutationScope = 'rooms' | 'reservations' | 'addons';

/** Announcement posted to sibling tabs after this tab commits a mutation. */
export interface InventorySyncMessage {
  type: 'INVENTORY_MUTATED';
  /** Identifies the sending tab so a receiver can ignore its own echo. */
  origin: string;
  /** Monotonic counter, letting a receiver discard out-of-order deliveries. */
  revision: number;
  /** Slice the receiver should re-read from storage. */
  scope: InventoryMutationScope;
}

/** Listener invoked when a sibling tab commits an inventory mutation. */
export type InventorySyncListener = (message: InventorySyncMessage) => void;

/**
 * Stable identifier for this tab.
 *
 * Computed once per document. Tabs are separate JavaScript realms, so each gets its own
 * value and therefore never discards another tab's broadcast as an echo.
 */
const TAB_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

/** Lazily created channel; one per tab, shared by every store action. */
let syncChannel: BroadcastChannel | null = null;

/** Highest revision this tab has applied, so late deliveries cannot regress state. */
let lastAppliedRevision = 0;

/** Revision counter for messages this tab originates. */
let outboundRevision = 0;

const syncListeners = new Set<InventorySyncListener>();

function ensureSyncChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return null;
  }
  if (syncChannel) {
    return syncChannel;
  }

  syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  syncChannel.onmessage = (event: MessageEvent<InventorySyncMessage>) => {
    const message = event.data;
    if (!message || message.type !== 'INVENTORY_MUTATED' || message.origin === TAB_ID) {
      return;
    }
    if (message.revision <= lastAppliedRevision) {
      return;
    }
    lastAppliedRevision = message.revision;
    for (const listener of syncListeners) {
      listener(message);
    }
  };

  return syncChannel;
}

/**
 * Announces a committed mutation to every sibling tab.
 *
 * @param scope slice the receiver should re-read from storage.
 */
function broadcastMutation(scope: InventoryMutationScope): void {
  const channel = ensureSyncChannel();
  if (!channel) {
    return;
  }
  outboundRevision += 1;
  channel.postMessage({
    type: 'INVENTORY_MUTATED',
    origin: TAB_ID,
    revision: outboundRevision,
    scope,
  } satisfies InventorySyncMessage);
}

/**
 * Registers a listener for inventory mutations committed in other tabs.
 *
 * @param listener called with the sibling tab's announcement.
 * @returns a function that removes the listener.
 */
export function subscribeToInventorySync(listener: InventorySyncListener): () => void {
  ensureSyncChannel();
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

/**
 * Runs `task` while holding a cross-tab exclusive lock.
 *
 * `localStorage` offers no compare-and-swap, so a plain read-then-write double-booking
 * check is a race: two tabs can both read an empty itinerary list, both pass the check
 * and both commit. The Web Locks API is the only primitive available to a client that
 * serialises the whole check-then-commit sequence across tabs.
 *
 * Browsers without Web Locks (Safari before 15.4, Firefox) fall through to running the
 * task unguarded, which still re-reads storage but cannot fully serialise the window.
 *
 * @param name lock name.
 * @param task critical section; kept synchronous so the return value is deterministic.
 * @returns whatever `task` returned.
 */
async function runExclusively<T>(name: string, task: () => T): Promise<T> {
  // Gated on a real browser: Web Locks exist to serialise *tabs*, which only exist in a
  // browser. Node also exposes a `navigator.locks` shim, and server rendering has no
  // concurrent tabs to race against, so both take the unguarded path.
  const locks = typeof window !== 'undefined' ? window.navigator?.locks : undefined;
  if (locks && typeof locks.request === 'function') {
    return locks.request(name, task);
  }
  return task();
}

interface InventoryState {
  rooms: Room[];
  reservations: Reservation[];
  addons: AddonService[];
  addRoom: (room: Omit<Room, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateRoom: (id: string, updates: Partial<Room>) => void;
  deleteRoom: (id: string) => void;
  updateRoomStatus: (id: string, status: Room['status']) => void;
  /**
   * Commits an itinerary.
   *
   * Asynchronous because the double-booking check and the write are serialised across
   * sibling tabs with a Web Lock; the lock cannot be held by a synchronous function.
   */
  createReservation: (
    reservation: Omit<Reservation, 'id' | 'bookingReference' | 'createdAt' | 'updatedAt'>
  ) => Promise<Reservation>;
  updateReservationStatus: (id: string, status: Reservation['status']) => void;
  cancelReservation: (id: string) => void;
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      rooms: defaultRooms,
      reservations: [],
      addons: defaultAddons,

      addRoom: (roomData) => {
        const now = new Date().toISOString();
        const newRoom: Room = {
          ...roomData,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ rooms: [newRoom, ...state.rooms] }));
        broadcastMutation('rooms');
      },

      updateRoom: (id, updates) => {
        const now = new Date().toISOString();
        set((state) => ({
          rooms: state.rooms.map((r) =>
            r.id === id ? { ...r, ...updates, updatedAt: now } : r
          ),
        }));
        broadcastMutation('rooms');
      },

      deleteRoom: (id) => {
        const hasActive = get().reservations.some(
          (r) => r.roomId === id && !['CANCELLED', 'CHECKED_OUT'].includes(r.status)
        );
        if (hasActive) {
          throw new Error('Cannot delete room with active reservations. Reassign or cancel reservations first.');
        }
        set((state) => ({
          rooms: state.rooms.filter((r) => r.id !== id),
        }));
        broadcastMutation('rooms');
      },

      updateRoomStatus: (id, status) => {
        const now = new Date().toISOString();
        set((state) => ({
          rooms: state.rooms.map((r) =>
            r.id === id ? { ...r, status, updatedAt: now } : r
          ),
        }));
        broadcastMutation('rooms');
      },

      createReservation: async (data) =>
        // The conflict check and the write form one critical section: holding a Web Lock
        // is what stops a second tab from passing the same check and selling the same
        // nights between our read and our write.
        runExclusively(COMMIT_LOCK_NAME, () => {
          // Re-read the committed inventory rather than trusting in-memory state, which
          // may predate a sibling tab's booking.
          const stored = readRawValue(STORAGE_KEYS.inventory);
          const currentReservations: Reservation[] =
            stored === null ? get().reservations : readInventorySnapshot().reservations;

          const targetRoom =
            get().rooms.find((r) => r.id === data.roomId) ??
            (stored === null ? undefined : readInventorySnapshot().rooms.find((r) => r.id === data.roomId));
          if (!targetRoom) {
            throw new Error('Room not found in inventory');
          }

          const conflict = currentReservations.some(
            (res) =>
              res.roomId === data.roomId &&
              res.status !== 'CANCELLED' &&
              isDateRangeOverlapping(
                data.checkInDate,
                data.checkOutDate,
                res.checkInDate,
                res.checkOutDate
              )
          );

          if (conflict) {
            throw new Error(
              'Room dates were reserved during checkout. Please select alternate dates.'
            );
          }

          const now = new Date().toISOString();
          const bookingReference = `RES-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;

          const newRes: Reservation = {
            ...data,
            id: crypto.randomUUID(),
            bookingReference,
            createdAt: now,
            updatedAt: now,
          };

          set((state) => ({
            reservations: [newRes, ...currentReservations],
          }));

          broadcastMutation('reservations');

          return newRes;
        }),

      updateReservationStatus: (id, status) => {
        const now = new Date().toISOString();
        set((state) => ({
          reservations: state.reservations.map((res) =>
            res.id === id ? { ...res, status, updatedAt: now } : res
          ),
        }));
        broadcastMutation('reservations');
      },

      cancelReservation: (id) => {
        const now = new Date().toISOString();
        set((state) => ({
          reservations: state.reservations.map((res) =>
            res.id === id ? { ...res, status: 'CANCELLED', updatedAt: now } : res
          ),
        }));
        broadcastMutation('reservations');
      },
    }),
    {
      name: STORAGE_KEYS.inventory,
      version: 0,
      skipHydration: true,
    }
  )
);

/*
 * A sibling tab announced a commit: re-read the persisted inventory so this tab's
 * catalogue, register and availability checks converge on the same truth.
 *
 * Applying the snapshot with `set` directly (rather than through a store action) is
 * deliberate: the actions broadcast, and broadcasting here would echo the message
 * straight back and spin between tabs.
 */
subscribeToInventorySync(() => {
  useInventoryStore.setState(readInventorySnapshot());
});
