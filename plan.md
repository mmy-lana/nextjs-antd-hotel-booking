# plan.md: Hotel Booking Platform with Room Management

**Repository / Project Slug:** `nextjs-antd-hotel-booking`  
**Technology Stack:** Next.js (App Router, latest), Ant Design (latest), `@ant-design/nextjs-registry` (latest), `@ant-design/icons` (latest), Day.js (latest), Zustand (latest), Zod (latest)  
**Aesthetic Profile:** Luxury boutique resort booking experience. Warm neutrals (sand, ivory, warm taupe, deep espresso), burnished gold/bronze accents, refined serif typography for headings, clean sans-serif for functional data, generous negative space, crisp architectural borders, and zero decorative emojis.

---

## 1. Data Schema & Pure TypeScript Interfaces

### 1.1 Domain Types & Interfaces

```typescript
// types/booking.ts
import type { Dayjs } from 'dayjs';

export type RoomCategory =
  | 'cliffside-villa'
  | 'ocean-suite'
  | 'garden-pavilion'
  | 'penthouse-residence';

export type RoomStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'RESERVED'
  | 'MAINTENANCE'
  | 'CLEANING';

export type ReservationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'CANCELLED';

export interface Amenity {
  id: string;
  name: string;
  category: 'wellness' | 'convenience' | 'view' | 'dining';
  iconKey: string;
  description: string;
}

export interface AddonService {
  id: string;
  name: string;
  description: string;
  pricePerUnit: number;
  chargeType: 'per_stay' | 'per_night' | 'per_guest';
}

export interface RoomImage {
  id: string;
  url: string;
  altText: string;
  isPrimary: boolean;
  caption: string;
}

export interface Room {
  id: string;
  roomNumber: string;
  slug: string;
  title: string;
  category: RoomCategory;
  tagline: string;
  description: string;
  basePricePerNight: number;
  weekendPricePerNight: number;
  resortFeePerNight: number;
  cleaningFee: number;
  squareMeters: number;
  maxOccupancy: {
    adults: number;
    children: number;
    infants: number;
  };
  bedConfiguration: string;
  status: RoomStatus;
  amenities: Amenity[];
  images: RoomImage[];
  viewType: 'Ocean Front' | 'Tropical Garden' | 'Panoramic Cliff' | 'Private Lagoon';
  createdAt: string;
  updatedAt: string;
}

export interface GuestDetails {
  guestId?: string; // Derived identifier or hash for returning guest itinerary lookup
  title: 'Mr' | 'Mrs' | 'Ms' | 'Dr';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialRequests?: string;
  estimatedArrivalTime?: string;
}

export interface PricingBreakdown {
  totalNights: number;
  weekdayNights: number;
  weekendNights: number;
  baseRoomSubtotal: number;
  weekendSurchargeSubtotal: number;
  resortFeeTotal: number;
  cleaningFee: number;
  addonsSubtotal: number;
  subtotal: number;
  serviceCharge: number;   // Itemized 10% Luxury Resort Service Charge
  occupancyTax: number;    // Itemized 8% Local Hospitality & Tourism Tax
  taxesTotal: number;      // Combined tax subtotal
  grandTotal: number;
  currency: 'USD';
}

export interface ReservationAddonSelection {
  addonId: string;
  quantity: number;
  calculatedPrice: number; // Authoritative historical price snapshot locked at reservation time
}

export interface Reservation {
  id: string;
  bookingReference: string; // Format: RES-XXXXXXXXXX (1.09+ trillion unique keyspace)
  roomId: string;
  guest: GuestDetails;
  checkInDate: string; // ISO string YYYY-MM-DD
  checkOutDate: string; // ISO string YYYY-MM-DD
  guestCounts: {
    adults: number;
    children: number;
    infants: number;
  };
  selectedAddons: ReservationAddonSelection[];
  pricing: PricingBreakdown;
  status: ReservationStatus;
  paymentStatus: 'PAID' | 'PENDING' | 'REFUNDED';
  createdAt: string;
  updatedAt: string;
}

export interface SearchFilterCriteria {
  dateRange: [Dayjs, Dayjs] | null; // Managed as Dayjs in active UI; serialized to ISO for queries
  guests: {
    adults: number;
    children: number;
  };
  categories: RoomCategory[];
  priceRange: [number, number];
  viewTypes: string[];
  sortBy: 'price_asc' | 'price_desc' | 'occupancy_desc' | 'recommended';
}
```

### 1.2 Runtime Zod Validation Schemas

```typescript
// schemas/validation.ts
import { z } from 'zod';

export const GuestDetailsSchema = z.object({
  guestId: z.string().optional(),
  title: z.enum(['Mr', 'Mrs', 'Ms', 'Dr']),
  firstName: z.string().min(2, 'First name must contain at least 2 characters').max(50),
  lastName: z.string().min(2, 'Last name must contain at least 2 characters').max(50),
  email: z.string().email('Please enter a valid guest email address'),
  phone: z.string().min(8, 'Valid contact number required for concierge communications'),
  specialRequests: z.string().max(500).optional(),
  estimatedArrivalTime: z.string().optional(),
});

export const ReservationSubmissionSchema = z.object({
  roomId: z.string().uuid('Invalid room selection identifier'),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid check-in date required (YYYY-MM-DD)'),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid check-out date required (YYYY-MM-DD)'),
  guestCounts: z.object({
    adults: z.number().int().min(1, 'At least 1 adult required'),
    children: z.number().int().min(0).default(0),
    infants: z.number().int().min(0).default(0),
  }),
  selectedAddons: z.array(
    z.object({
      addonId: z.string().min(1, 'Addon identifier required'), // Format: 'addon-N' (not UUID)
      quantity: z.number().int().positive(),
    })
  ).default([]),
  guest: GuestDetailsSchema,
});

export const RoomAmenitySchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  name: z.string().min(2),
  category: z.enum(['wellness', 'convenience', 'view', 'dining']),
  iconKey: z.string().min(1),
  description: z.string().min(5),
});

export const RoomImageSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  url: z.string().url('Must be a valid high-resolution image URL'),
  altText: z.string().min(3),
  isPrimary: z.boolean().default(false),
  caption: z.string().min(2),
});

export const RoomCreateSchema = z.object({
  roomNumber: z.string().min(1, 'Room number is mandatory'),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  category: z.enum(['cliffside-villa', 'ocean-suite', 'garden-pavilion', 'penthouse-residence']),
  tagline: z.string().min(5),
  description: z.string().min(20),
  basePricePerNight: z.number().positive('Base price must be greater than zero'),
  weekendPricePerNight: z.number().positive('Weekend rate must be greater than zero'),
  resortFeePerNight: z.number().nonnegative(),
  cleaningFee: z.number().nonnegative(),
  squareMeters: z.number().positive(),
  maxOccupancy: z.object({
    adults: z.number().int().positive(),
    children: z.number().int().nonnegative(),
    infants: z.number().int().nonnegative(),
  }),
  bedConfiguration: z.string().min(2),
  status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'CLEANING']),
  viewType: z.enum(['Ocean Front', 'Tropical Garden', 'Panoramic Cliff', 'Private Lagoon']),
  amenities: z.array(RoomAmenitySchema).default([]),
  images: z.array(RoomImageSchema).min(1, 'At least one room showcase image required'),
});

export const RoomUpdateSchema = RoomCreateSchema.extend({
  id: z.string().uuid('Valid room UUID required for updates'),
});
```

---

## 2. Component Architecture

### 2.1 Component Directory Structure

```
nextjs-antd-hotel-booking/
├── app/
│   ├── layout.tsx                     # [SC] Root SSR shell rendering AntdProviders client boundary
│   ├── page.tsx                       # [SC] Guest landing with client island catalog
│   ├── rooms/
│   │   └── [slug]/
│   │       └── page.tsx               # [SC] Room deep dive, metadata, and booking client island
│   ├── booking/
│   │   └── confirmation/[ref]/
│   │       └── page.tsx               # [SC] Server-rendered itinerary pass with client print trigger
│   └── admin/
│       ├── layout.tsx                 # [SC] Staff/Concierge management shell layout
│       ├── rooms/
│       │   └── page.tsx               # [CC] Room inventory matrix, status edits, pricing controls
│       └── reservations/
│           └── page.tsx               # [CC] Booking schedule, date range view, guest records
├── components/
│   ├── AntdProviders.tsx              # [CC] 'use client' boundary wrapping AntdRegistry & ConfigProvider
│   ├── primitives/
│   │   ├── LuxuryPriceTag.tsx         # [SC] Serif-formatted price element with unit breakdown
│   │   ├── StatusBadge.tsx            # [SC] Colored Antd Tag wrapper for room/booking states
│   │   ├── SectionHeader.tsx          # [SC] Editorial section typography
│   │   └── AmenityIcon.tsx            # [SC] SVG mapper for resort amenities
│   ├── molecules/
│   │   ├── DateGuestFilterBar.tsx     # [CC] Check-in, check-out, and guest count selector
│   │   ├── RoomCard.tsx               # [CC] Catalog display card with slug navigation
│   │   ├── RoomSpecGrid.tsx           # [SC] Dimensions, view type, and bed layout specs
│   │   └── AddonSelector.tsx          # [CC] Concierge upgrades (Spa, Helicopter, Dining)
│   ├── organisms/
│   │   ├── HeaderNavbar.tsx           # [CC] Luxury header with mobile drawer navigation
│   │   ├── BookingDrawer.tsx          # [CC] Slide-out booking drawer with dynamic quote engine
│   │   ├── RoomInventoryTable.tsx     # [CC] Admin Antd Table with inline status and price edits
│   │   ├── RoomEditorModal.tsx        # [CC] Add/Edit room modal with Zod-validated Antd Form
│   │   └── ReservationDetailsDrawer.tsx # [CC] Staff view for guest check-in/out procedures
│   └── templates/
│       ├── ResortShowcase.tsx         # [CC] Guest browsing catalog layout
│       └── AdminConsoleShell.tsx      # [CC] Admin dashboard shell with metrics top-bar
├── lib/
│   ├── theme/
│   │   └── themeConfig.ts             # Ant Design v5 Design Token customization
│   ├── store/
│   │   ├── bookingStore.ts            # Zustand client store for active checkout session
│   │   └── inventoryStore.ts          # Zustand client store for rooms and reservations
│   ├── utils/
│   │   ├── pricingEngine.ts           # Pure functions for room quote and breakdown calculations
│   │   ├── availability.ts            # Pure date conflict checker and occupancy validator
│   │   └── storage.ts                 # LocalStorage persistence wrapper with initial seed
│   └── data/
│       ├── seedRooms.ts               # Initial curated boutique resort rooms
│       └── seedAddons.ts              # Initial luxury concierge services
```

### 2.2 Client Provider Wrapper (`AntdProviders.tsx`)

```typescript
// components/AntdProviders.tsx
'use client';

import React from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import { luxuryResortTheme } from '@/lib/theme/themeConfig';

export function AntdProviders({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider theme={luxuryResortTheme}>
        {children}
      </ConfigProvider>
    </AntdRegistry>
  );
}
```

### 2.3 Ant Design Theme Configuration (`themeConfig.ts`)

```typescript
// lib/theme/themeConfig.ts
// Dependency Requirement: package.json must use "antd": "latest" to support defaultBorderColor and defaultColor button tokens natively.
import type { ThemeConfig } from 'antd';

export const luxuryResortTheme: ThemeConfig = {
  token: {
    // Palette: Sand, Bronze, Espresso, Warm Ivory
    colorPrimary: '#8C704B',       // Refined Bronze
    colorSuccess: '#4E6E58',       // Deep Sage
    colorWarning: '#B8860B',       // Dark Goldenrod
    colorError: '#8A3324',         // Terracotta Crimson
    colorInfo: '#5A6B7C',          // Slate Blue
    colorTextBase: '#1F1B18',      // Deep Espresso Charcoal
    colorBgBase: '#FAF8F5',        // Sand Silk Ivory
    colorBorder: '#E5DFD7',        // Subtle Linen Border
    colorBorderSecondary: '#EFEBE5',
    
    // Typography
    fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSizeHeading1: 38,
    fontSizeHeading2: 30,
    fontSizeHeading3: 24,
    fontSize: 15,
    
    // Geometry & Motion
    borderRadius: 2,               // Sharp architectural minimalist radius
    borderRadiusLG: 4,
    borderRadiusSM: 1,
    wireframe: false,
    
    // Transitions
    motionDurationFast: '0.15s',
    motionDurationMid: '0.25s',
    motionDurationSlow: '0.35s',
  },
  components: {
    Button: {
      controlHeight: 44,
      borderRadius: 2,
      fontWeight: 500,
      primaryColor: '#FFFFFF',
      defaultBorderColor: '#8C704B',
      defaultColor: '#8C704B',
    },
    DatePicker: {
      controlHeight: 44,
      borderRadius: 2,
    },
    Card: {
      colorBgContainer: '#FFFFFF',
      colorBorderSecondary: '#EAE5DE',
      paddingLG: 24,
    },
    Table: {
      headerBg: '#F3EFE9',
      headerColor: '#1F1B18',
      headerBorderRadius: 2,
      rowHoverBg: '#F9F7F3',
    },
    Drawer: {
      colorBgElevated: '#FCFAF8',
    },
    Modal: {
      colorBgElevated: '#FCFAF8',
    },
  },
};
```

---

## 3. Core Feature Logic

### 3.1 Financial Calculation Engine (`pricingEngine.ts`)

```typescript
// lib/utils/pricingEngine.ts
// Strict boundary: Only imports types, never stores. Stores depend on this engine.
import dayjs from 'dayjs';
import { Room, AddonService, PricingBreakdown } from '@/types/booking';

export function calculateReservationQuote(
  room: Pick<Room, 'basePricePerNight' | 'weekendPricePerNight' | 'resortFeePerNight' | 'cleaningFee'>,
  checkInDate: string,
  checkOutDate: string,
  selectedAddons: { addon: AddonService; quantity: number }[]
): PricingBreakdown {
  const start = dayjs(checkInDate);
  const end = dayjs(checkOutDate);
  const totalNights = Math.max(1, end.diff(start, 'day'));

  let weekdayNights = 0;
  let weekendNights = 0;

  for (let i = 0; i < totalNights; i++) {
    const currentDay = start.add(i, 'day').day();
    // 0 = Sunday, 5 = Friday, 6 = Saturday
    // Luxury resort applies premium weekend rate for Friday and Saturday nights
    if (currentDay === 5 || currentDay === 6) {
      weekendNights++;
    } else {
      weekdayNights++;
    }
  }

  const baseRoomSubtotal = weekdayNights * room.basePricePerNight;
  const weekendSurchargeSubtotal = weekendNights * room.weekendPricePerNight;
  const resortFeeTotal = totalNights * room.resortFeePerNight;
  const cleaningFee = room.cleaningFee;

  let addonsSubtotal = 0;
  for (const item of selectedAddons) {
    if (item.addon.chargeType === 'per_night') {
      addonsSubtotal += item.addon.pricePerUnit * item.quantity * totalNights;
    } else {
      addonsSubtotal += item.addon.pricePerUnit * item.quantity;
    }
  }

  const subtotal = baseRoomSubtotal + weekendSurchargeSubtotal + resortFeeTotal + cleaningFee + addonsSubtotal;
  
  // Tax policy: 10% Resort Hospitality Charge + 8% Local Occupancy Tax
  const serviceCharge = Math.round(subtotal * 0.10);
  const occupancyTax = Math.round(subtotal * 0.08);
  const taxesTotal = serviceCharge + occupancyTax;
  const grandTotal = subtotal + taxesTotal;

  return {
    totalNights,
    weekdayNights,
    weekendNights,
    baseRoomSubtotal,
    weekendSurchargeSubtotal,
    resortFeeTotal,
    cleaningFee,
    addonsSubtotal,
    subtotal,
    serviceCharge,
    occupancyTax,
    taxesTotal,
    grandTotal,
    currency: 'USD',
  };
}
```

### 3.2 Date Overlap & Availability Algorithm (`availability.ts`)

```typescript
// lib/utils/availability.ts
import dayjs from 'dayjs';
import { Reservation, Room } from '@/types/booking';

export function isDateRangeOverlapping(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const aStart = dayjs(startA);
  const aEnd = dayjs(endA);
  const bStart = dayjs(startB);
  const bEnd = dayjs(endB);

  // Overlap condition: startA < endB && endA > startB
  return aStart.isBefore(bEnd) && aEnd.isAfter(bStart);
}

export function checkRoomAvailability(
  room: Room,
  checkIn: string,
  checkOut: string,
  existingReservations: Reservation[]
): { isAvailable: boolean; conflictReservationId?: string } {
  if (room.status === 'MAINTENANCE' || room.status === 'CLEANING') {
    return { isAvailable: false };
  }

  const roomReservations = existingReservations.filter(
    (res) => res.roomId === room.id && res.status !== 'CANCELLED'
  );

  for (const res of roomReservations) {
    if (isDateRangeOverlapping(checkIn, checkOut, res.checkInDate, res.checkOutDate)) {
      return { isAvailable: false, conflictReservationId: res.id };
    }
  }

  return { isAvailable: true };
}
```

### 3.3 Reactive State Management: Zustand Stores

```typescript
// lib/store/inventoryStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Room, Reservation, AddonService } from '@/types/booking';
import { defaultRooms } from '@/lib/data/seedRooms';
import { defaultAddons } from '@/lib/data/seedAddons';
import { isDateRangeOverlapping } from '@/lib/utils/availability';

interface InventoryState {
  rooms: Room[];
  reservations: Reservation[];
  addons: AddonService[];
  
  // Room operations
  addRoom: (room: Omit<Room, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateRoom: (id: string, updates: Partial<Room>) => void;
  deleteRoom: (id: string) => void;
  updateRoomStatus: (id: string, status: Room['status']) => void;

  // Reservation operations
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

        // Optimistic double-booking concurrency check
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
        // 16^10 = 1.09+ trillion unique keyspace; guarantees zero collision in local/offline store
        const bookingReference = `RES-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;

        // Contract: createReservation is strictly executed client-side inside user checkout action
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
      name: 'resort-inventory-storage',
      skipHydration: true, // Client components invoke useInventoryStore.persist.rehydrate() in useEffect
    }
  )
);
```

```typescript
// lib/store/bookingStore.ts
// Client search and active checkout reservation session
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Dayjs } from 'dayjs';
import { RoomCategory } from '@/types/booking';

interface BookingSessionState {
  // Stored in state as ISO strings for persistent serialization, converted to/from Dayjs at UI boundary
  // Subset of SearchFilterCriteria; priceRange, viewTypes, and sortBy are derived at query time and not persisted across sessions.
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
      name: 'resort-search-session',
      skipHydration: true, // Client components invoke useBookingStore.persist.rehydrate() in useEffect
    }
  )
);
```

### 3.4 Seed Data Collections

```typescript
// lib/data/seedAddons.ts
import { AddonService } from '@/types/booking';

export const defaultAddons: AddonService[] = [
  {
    id: 'addon-1',
    name: 'Helicopter Airport Transfer',
    description: 'Direct aerial transport from international arrival terminal to resort helipad.',
    pricePerUnit: 650,
    chargeType: 'per_stay',
  },
  {
    id: 'addon-2',
    name: 'In-Villa Champagne & Caviar Ritual',
    description: 'Bottle of Dom Pérignon paired with 50g Ossetra caviar and accompaniments.',
    pricePerUnit: 320,
    chargeType: 'per_stay',
  },
  {
    id: 'addon-3',
    name: 'Unlimited Thermal Spa & Thalassotherapy Pass',
    description: 'Daily unconstrained access to mineral vitality pools, steam caverns, and saunas.',
    pricePerUnit: 85,
    chargeType: 'per_night',
  },
  {
    id: 'addon-4',
    name: 'Private Sunset Catamaran Cruise',
    description: '3-hour private yacht excursion with dedicated onboard chef and sommelier.',
    pricePerUnit: 890,
    chargeType: 'per_stay',
  },
];
```

```typescript
// lib/data/seedRooms.ts
import { Room } from '@/types/booking';

export const defaultRooms: Room[] = [
  {
    id: 'b7a8d56b-42e7-494f-9e73-b3c0e181c010',
    roomNumber: 'V-101',
    slug: 'the-cliffside-sanctuary',
    title: 'The Cliffside Sanctuary',
    category: 'cliffside-villa',
    tagline: 'Perched 80 meters above the azure coastline with panoramic horizon infinity pool.',
    description: 'Sculpted into volcanic basalt stone, this signature cliffside villa blends minimalist Japanese wabi-sabi geometry with warm coastal timber. Features private 12-meter heated pool, sunken outdoor dining pavilion, outdoor rain shower, and dedicated 24-hour butler service.',
    basePricePerNight: 1250,
    weekendPricePerNight: 1450,
    resortFeePerNight: 75,
    cleaningFee: 150,
    squareMeters: 280,
    maxOccupancy: {
      adults: 3,
      children: 1,
      infants: 1,
    },
    bedConfiguration: '1 King Bed + 1 Daybed Lounge',
    status: 'AVAILABLE',
    viewType: 'Panoramic Cliff',
    amenities: [
      { id: 'am-1', name: 'Private Infinity Pool', category: 'wellness', iconKey: 'pool', description: 'Heated plunge pool directly overlooking the Pacific' },
      { id: 'am-2', name: 'Dedicated Butler', category: 'convenience', iconKey: 'concierge', description: 'On-demand personal valet service' },
      { id: 'am-3', name: 'Wine Cellar Cabinet', category: 'dining', iconKey: 'wine', description: 'Curated organic vintages at cellar temperature' },
      { id: 'am-4', name: 'Deep Soaking Marble Tub', category: 'wellness', iconKey: 'bath', description: 'Handcrafted monolithic stone bathtub' },
    ],
    images: [
      {
        id: 'img-101-1',
        url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1600&q=85',
        altText: 'The Cliffside Sanctuary exterior pool deck',
        isPrimary: true,
        caption: 'Private infinity deck overlooking the sea',
      },
      {
        id: 'img-101-2',
        url: 'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=1200&q=80',
        altText: 'Master bedroom with open timber louvers',
        isPrimary: false,
        caption: 'Master bedroom with linen-draped king bed',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'e1c9f280-928c-4a37-b9f1-a128e4695b21',
    roomNumber: 'S-204',
    slug: 'azure-lagoon-overwater-suite',
    title: 'Azure Lagoon Overwater Suite',
    category: 'ocean-suite',
    tagline: 'Hovering directly over crystalline waters with transparent glass floor portals.',
    description: 'Suspended gently above the calm waters of the private lagoon, this suite offers direct ladder access into the turquoise sea, glass viewing floor apertures, and a shaded daybed terrace for unhurried reading and stargazing.',
    basePricePerNight: 980,
    weekendPricePerNight: 1120,
    resortFeePerNight: 65,
    cleaningFee: 120,
    squareMeters: 175,
    maxOccupancy: {
      adults: 2,
      children: 0,
      infants: 1,
    },
    bedConfiguration: '1 Californian King Bed',
    status: 'AVAILABLE',
    viewType: 'Private Lagoon',
    amenities: [
      { id: 'am-5', name: 'Direct Lagoon Descent', category: 'view', iconKey: 'ocean', description: 'Teak swim ladder straight into the coral lagoon' },
      { id: 'am-6', name: 'Glass Floor Portal', category: 'view', iconKey: 'eye', description: 'Illuminated underwater viewing panels' },
      { id: 'am-7', name: 'Bespoke Espresso Bar', category: 'dining', iconKey: 'coffee', description: 'Artisan single-origin roast selection' },
    ],
    images: [
      {
        id: 'img-204-1',
        url: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1600&q=85',
        altText: 'Azure Lagoon Suite overwater terrace',
        isPrimary: true,
        caption: 'Overwater wooden deck with direct lagoon ladder',
      },
    ],
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'f928e441-591a-4d23-99b8-3f8190c12033',
    roomNumber: 'G-108',
    slug: 'the-banyan-garden-pavilion',
    title: 'The Banyan Garden Pavilion',
    category: 'garden-pavilion',
    tagline: 'Secluded amongst ancient ficus trees, fragrant frangipani, and private meditation gardens.',
    description: 'A sanctuary of profound serenity enveloped in tropical flora. Includes an open-concept stone bath, shaded outdoor yoga pavilion, open fireplace, and private enclosed courtyard offering complete acoustic quietude.',
    basePricePerNight: 720,
    weekendPricePerNight: 850,
    resortFeePerNight: 50,
    cleaningFee: 100,
    squareMeters: 210,
    maxOccupancy: {
      adults: 4,
      children: 2,
      infants: 1,
    },
    bedConfiguration: '2 King Beds',
    status: 'AVAILABLE',
    viewType: 'Tropical Garden',
    amenities: [
      { id: 'am-8', name: 'Outdoor Fire Hearth', category: 'convenience', iconKey: 'fire', description: 'Evening wood-fire terrace gathering space' },
      { id: 'am-9', name: 'Yoga & Meditation Pavilion', category: 'wellness', iconKey: 'lotus', description: 'Teak platform equipped with mats and singing bowls' },
    ],
    images: [
      {
        id: 'img-108-1',
        url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=85',
        altText: 'Garden pavilion surrounded by lush tropical palms',
        isPrimary: true,
        caption: 'Private tropical botanical garden entrance',
      },
    ],
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
  },
  {
    id: 'c44199aa-77b1-419b-a012-de77395018f2',
    roomNumber: 'P-501',
    slug: 'the-celestial-penthouse',
    title: 'The Celestial Penthouse',
    category: 'penthouse-residence',
    tagline: 'The pinnacle of resort luxury with 360-degree crown views and private rooftop observatory.',
    description: 'Occupying the entire top level of the resort sanctuary. Offers private elevator arrival, chef presentation kitchen, private 15-meter heated rooftop lap pool, and a high-aperture astronomical telescope for celestial observation.',
    basePricePerNight: 2800,
    weekendPricePerNight: 3200,
    resortFeePerNight: 120,
    cleaningFee: 300,
    squareMeters: 450,
    maxOccupancy: {
      adults: 6,
      children: 2,
      infants: 2,
    },
    bedConfiguration: '3 King Suites + Staff Quarters',
    status: 'AVAILABLE',
    viewType: 'Ocean Front',
    amenities: [
      { id: 'am-10', name: 'Rooftop Lap Pool', category: 'wellness', iconKey: 'pool', description: 'Private 15m elevated pool with skyline view' },
      { id: 'am-11', name: 'Private Chef Kitchen', category: 'dining', iconKey: 'kitchen', description: 'Professional Gaggenau kitchen for private dinners' },
      { id: 'am-12', name: 'Direct Keycard Elevator', category: 'convenience', iconKey: 'key', description: 'Secure elevator terminating inside the residence foyer' },
    ],
    images: [
      {
        id: 'img-501-1',
        url: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1600&q=85',
        altText: 'Celestial penthouse living salon',
        isPrimary: true,
        caption: 'Double-height living salon with wrap-around balcony',
      },
    ],
    createdAt: '2026-01-04T00:00:00.000Z',
    updatedAt: '2026-01-04T00:00:00.000Z',
  },
];
```

---

## 4. UI Specification & Mobile-First Responsive Shell

### 4.1 Viewport Breakpoint Validation Matrix

| Breakpoint | Target Screen Width | Target Device Class | Interaction & Layout Adjustments |
| :--- | :--- | :--- | :--- |
| **Mobile S** | 360px | Budget / Compact Android | Single column card; search bar converts to two stacked single DatePickers (start/end) to prevent RangePicker truncation; drawer expands to 100% width; table scroll set to `scroll={{ x: 900 }}` with container `overflow-x: auto`; minimum touch targets 44x44px. |
| **Mobile M** | 390px | iPhone 14/15/16 Pro | Single column card; form layout set to `layout="vertical"` across all drawers and modals to prevent label squishing; fixed bottom reserve CTA bar for room details. |
| **Mobile L** | 430px | iPhone Pro Max / Plus | Single column; gallery preview switches from carousel to vertical stack; drawer is 100% width. |
| **Tablet** | 768px | iPad Mini / Air portrait | Two-column room catalog grid with locked `aspect-ratio: 4/3; object-fit: cover` images; horizontal date search bar with wrapped guest counter; drawer width 480px. |
| **Desktop** | 1024px+ | Laptop / High-Res Desktop | Three-column room catalog grid; integrated sticky side-panel for price calculations; drawer width 560px. |

### 4.2 Non-Hover Touch-First Strategy

1. **Card Interactions:** No hidden information revealed exclusively via `:hover`. Pricing, key amenities, and dimensions are immediately visible. Images maintain locked `aspect-ratio: 4/3; width: 100%; object-fit: cover`.
2. **Addon Steppers:** Increment and decrement controls in `AddonSelector` utilize custom Button primitives styled with `style={{ minWidth: 44, minHeight: 44 }}` to satisfy touch guidelines.
3. **Form Orientation:** All input forms inside `BookingDrawer` and `RoomEditorModal` strictly use `layout="vertical"`.
4. **Admin Data Presentation:** `RoomInventoryTable` defines `scroll={{ x: 900 }}` and wrapped in a CSS container with `overflow-x: auto; -webkit-overflow-scrolling: touch;`.
5. **Bottom Bar Sticky CTA:** On mobile screens (`<768px`), viewing room details reveals a fixed bottom bar with safe-area compensation:
   `style={{ position: 'fixed', bottom: 0, paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}`.
6. **Date Filter Bar Strategy:** Below `xs` breakpoint (576px), `DateGuestFilterBar` renders two separate `DatePicker` components (Check-In / Check-Out) with `getPopupContainer={(trigger) => trigger.parentElement || document.body}` to prevent viewport overflow; at or above 576px, renders unified `DatePicker.RangePicker`.

---

## 5. 5-Phase Sequential Execution Queue

### Phase 1: Types, Storage/API Client Config, and Base Utilities
- [x] Configure pure TypeScript models: `Room`, `Amenity`, `Reservation`, `AddonService`, `PricingBreakdown`, and `SearchFilterCriteria`.
- [x] Implement runtime validation schemas using `Zod` (`GuestDetailsSchema`, `ReservationSubmissionSchema`, `RoomAmenitySchema`, `RoomImageSchema`, `RoomCreateSchema`, and `RoomUpdateSchema`).
- [x] Formulate pure calculation utility `pricingEngine.ts` handling weekday/weekend multipliers, resort fees, cleaning fees, and itemized taxes (`serviceCharge` and `occupancyTax`).
- [x] Formulate pure date-checking utility `availability.ts` to detect date overlap across active reservations.
- [x] Implement seed data collections for luxury suites (`seedRooms.ts`) and curated concierge additions (`seedAddons.ts`).
- [x] Setup Zustand stores with persistent client-side storage for rooms (`inventoryStore.ts`) and search session (`bookingStore.ts`), both configured with `skipHydration: true`.

### Phase 2: Design Foundation & Atomic UI Primitives
- [x] Establish root Next.js App Router layout with `AntdProviders.tsx` client component wrapping `@ant-design/nextjs-registry` and Antd `ConfigProvider`.
- [x] Configure Ant Design v5 Design Token theme (`themeConfig.ts`) with custom warm sand, bronze, and deep charcoal palette and verified latest Antd button tokens.
- [x] Create atomic primitive `LuxuryPriceTag`: typography for luxury currency presentation with formatted delimiters.
- [x] Create atomic primitive `StatusBadge`: consistent Ant Design `Tag` wrapper for room states (`AVAILABLE`, `OCCUPIED`, `MAINTENANCE`) and reservation states.
- [x] Create atomic primitive `AmenityIcon`: clean SVG icons for pool, ocean, wine, tub, butler, and dining amenities.
- [x] Create atomic primitive `SectionHeader`: editorial typography pairing serif title with subtle uppercase tracking subtitle.

### Phase 3: Compound Molecules & Feature Components
- [x] Construct `DateGuestFilterBar`: Responsive filter bar conditionally rendering dual `DatePicker` (<576px) or unified `RangePicker` (>=576px) and guest stepper dropdown.
- [x] Construct `RoomCard`: High-performance room presentation card featuring locked 4:3 image previews, dimension badges, view type, and price breakdown linking via `room.slug`.
- [x] Construct `RoomSpecGrid`: Specification grid displaying square meters, max guest capacity, bed arrangement, and view orientation.
- [x] Construct `AddonSelector`: Interactive list with 44x44px touch-friendly increment/decrement steppers for luxury amenities.
- [x] Construct `HeaderNavbar`: Resort branding header with responsive mobile hamburger drawer and quick link to Admin Inventory console.

### Phase 4: Domain Logic, Reactive State, and Specialized Workflows
- [x] Build `BookingDrawer`: Slide-over booking flow integrating live calendar selection, `layout="vertical"` guest form, dynamic quote recalculation, and reservation submission with optimistic lock.
- [x] Implement error, loading, and empty states:
  - Empty search state: "No sanctuaries found for selected dates" with single-click reset.
  - Conflict warning: Immediate notice if chosen dates overlap with an existing booking.
  - Form validation: Real-time inline field validation matching `Zod` requirements.
- [x] Build `RoomInventoryTable`: Staff admin view utilizing Ant Design `Table` with `scroll={{ x: 900 }}`, sorting, status toggle dropdown, and direct price editing.
- [x] Build `RoomEditorModal`: Modal with Ant Design `Form` (`layout="vertical"`) enabling concierges to add new suites or update occupancy and pricing rules with validated sub-entities.
- [x] Build `ReservationDetailsDrawer`: Staff modal for viewing guest reservation details, calculating balances, and executing check-in / check-out.

### Phase 5: Complete Page/Screen Assembly & Responsive Shell
- [x] Assemble `app/page.tsx`: Guest browsing catalog with hero banner, live availability filtering, dynamic room list, and instant booking drawer integration.
- [x] Assemble `app/rooms/[slug]/page.tsx`: Dedicated suite showcase indexed by human-readable slug with photo gallery, complete amenity inventory, and sticky booking sidebar (desktop) or fixed bottom bar (mobile).
- [x] Assemble `app/booking/confirmation/[ref]/page.tsx`: Digital guest itinerary card, itemized receipt with distinct service charge and occupancy tax breakdowns, check-in instructions, and print-ready reservation voucher.
- [x] Assemble `app/admin/rooms/page.tsx`: Centralized room management control center with live status indicators, add-room trigger, and occupancy statistics.
- [x] Assemble `app/admin/reservations/page.tsx`: Concierge reservation register featuring date filtering, guest lookups, and status updates.
- [x] Execute responsive viewport testing at 360px, 390px, 430px, 768px, and 1024px+ to ensure zero layout clipping and seamless touch target compliance.