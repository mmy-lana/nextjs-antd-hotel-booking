import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Dayjs } from 'dayjs';
import type { RoomCategory } from '@/types/booking';
import { STORAGE_KEYS } from '@/lib/utils/storage';

interface BookingSessionState {
  dateRange: [string, string] | null;
  guests: {
    adults: number;
    children: number;
  };
  selectedCategory: RoomCategory | 'ALL';
  setDateRange: (dates: [Dayjs, Dayjs] | null) => void;
  setGuests: (guests: { adults: number; children: number }) => void;
  setSelectedCategory: (cat: RoomCategory | 'ALL') => void;
  resetFilters: () => void;
}

export const useBookingStore = create<BookingSessionState>()(
  persist(
    (set) => ({
      dateRange: null,
      guests: { adults: 2, children: 0 },
      selectedCategory: 'ALL',
      setDateRange: (dates) =>
        set({
          dateRange: dates ? [dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')] : null,
        }),
      setGuests: (guests) => set({ guests }),
      setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
      resetFilters: () => set({ dateRange: null, guests: { adults: 2, children: 0 }, selectedCategory: 'ALL' }),
    }),
    {
      name: STORAGE_KEYS.bookingSession,
      version: 0,
      skipHydration: true,
    }
  )
);
