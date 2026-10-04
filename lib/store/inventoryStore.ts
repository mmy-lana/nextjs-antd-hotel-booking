import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Room, Reservation, AddonService } from '@/types/booking';
import { defaultRooms } from '@/lib/data/seedRooms';
import { defaultAddons } from '@/lib/data/seedAddons';
import { isDateRangeOverlapping } from '@/lib/utils/availability';
import { STORAGE_KEYS } from '@/lib/utils/storage';

interface InventoryState {
  rooms: Room[];
  reservations: Reservation[];
  addons: AddonService[];
  addRoom: (room: Omit<Room, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateRoom: (id: string, updates: Partial<Room>) => void;
  deleteRoom: (id: string) => void;
  updateRoomStatus: (id: string, status: Room['status']) => void;
  createReservation: (reservation: Omit<Reservation, 'id' | 'bookingReference' | 'createdAt' | 'updatedAt'>) => Reservation;
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
      },

      updateRoom: (id, updates) => {
        const now = new Date().toISOString();
        set((state) => ({
          rooms: state.rooms.map((r) =>
            r.id === id ? { ...r, ...updates, updatedAt: now } : r
          ),
        }));
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
      },

      updateRoomStatus: (id, status) => {
        const now = new Date().toISOString();
        set((state) => ({
          rooms: state.rooms.map((r) =>
            r.id === id ? { ...r, status, updatedAt: now } : r
          ),
        }));
      },

      createReservation: (data) => {
        const currentReservations = get().reservations;
        const targetRoom = get().rooms.find((r) => r.id === data.roomId);
        if (!targetRoom) {
          throw new Error('Room not found in inventory');
        }

        const conflict = currentReservations.some(
          (res) =>
            res.roomId === data.roomId &&
            res.status !== 'CANCELLED' &&
            isDateRangeOverlapping(data.checkInDate, data.checkOutDate, res.checkInDate, res.checkOutDate)
        );

        if (conflict) {
          throw new Error('Room dates were reserved during checkout. Please select alternate dates.');
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
          reservations: [newRes, ...state.reservations],
        }));

        return newRes;
      },

      updateReservationStatus: (id, status) => {
        const now = new Date().toISOString();
        set((state) => ({
          reservations: state.reservations.map((res) =>
            res.id === id ? { ...res, status, updatedAt: now } : res
          ),
        }));
      },

      cancelReservation: (id) => {
        const now = new Date().toISOString();
        set((state) => ({
          reservations: state.reservations.map((res) =>
            res.id === id ? { ...res, status: 'CANCELLED', updatedAt: now } : res
          ),
        }));
      },
    }),
    {
      name: STORAGE_KEYS.inventory,
      version: 0,
      skipHydration: true,
    }
  )
);
