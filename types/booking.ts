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
  guestId?: string;
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
  serviceCharge: number;
  occupancyTax: number;
  taxesTotal: number;
  grandTotal: number;
  currency: 'USD';
}

export interface ReservationAddonSelection {
  addonId: string;
  quantity: number;
  calculatedPrice: number;
}

export interface Reservation {
  id: string;
  bookingReference: string;
  roomId: string;
  guest: GuestDetails;
  checkInDate: string;
  checkOutDate: string;
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
  dateRange: [Dayjs, Dayjs] | null;
  guests: {
    adults: number;
    children: number;
  };
  categories: RoomCategory[];
  priceRange: [number, number];
  viewTypes: string[];
  sortBy: 'price_asc' | 'price_desc' | 'occupancy_desc' | 'recommended';
}
