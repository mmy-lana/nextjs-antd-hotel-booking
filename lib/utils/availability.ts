import dayjs from 'dayjs';
import type { Reservation, Room } from '@/types/booking';

/** Guest composition accepted by the occupancy validator. */
export interface OccupancyRequest {
  adults: number;
  children: number;
  infants: number;
}

/** Outcome of an occupancy capacity check, including the numbers shown to the guest. */
export interface OccupancyCapacityResult {
  withinCapacity: boolean;
  requestedGuests: number;
  maximumGuests: number;
  /** Human readable explanation of which limit was exceeded. */
  reason?: string;
}

/**
 * Half-open interval overlap test: `[startA, endA)` intersects `[startB, endB)`.
 *
 * A guest who departs on the same morning an arrival checks in is therefore **not**
 * treated as a conflict, which matches physical hotel turnover operations.
 */
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

/** Counts the nights between two ISO dates, floored at a single night. */
export function countNights(checkIn: string, checkOut: string): number {
  return Math.max(1, dayjs(checkOut).diff(dayjs(checkIn), 'day'));
}

/**
 * Rejects a stay whose check-out is not strictly after its check-in.
 *
 * @returns `true` when the range is a valid forward-dated stay.
 */
export function isValidStayRange(checkIn: string, checkOut: string): boolean {
  return dayjs(checkOut).isAfter(dayjs(checkIn), 'day');
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

/**
 * Validates a party size against a suite's published occupancy limits.
 *
 * @param room suite being requested.
 * @param guests adults, children and infants travelling together.
 */
export function checkOccupancyCapacity(
  room: Room,
  guests: OccupancyRequest
): OccupancyCapacityResult {
  const requestedGuests = guests.adults + guests.children + guests.infants;
  const maximumGuests = room.maxOccupancy.adults + room.maxOccupancy.children + room.maxOccupancy.infants;

  if (guests.adults > room.maxOccupancy.adults) {
    return {
      withinCapacity: false,
      requestedGuests,
      maximumGuests,
      reason: `This suite accommodates a maximum of ${room.maxOccupancy.adults} adult${room.maxOccupancy.adults === 1 ? '' : 's'}.`,
    };
  }

  if (guests.children > room.maxOccupancy.children) {
    return {
      withinCapacity: false,
      requestedGuests,
      maximumGuests,
      reason: `This suite accommodates a maximum of ${room.maxOccupancy.children} child${room.maxOccupancy.children === 1 ? '' : 'ren'}.`,
    };
  }

  if (guests.infants > room.maxOccupancy.infants) {
    return {
      withinCapacity: false,
      requestedGuests,
      maximumGuests,
      reason: `This suite accommodates a maximum of ${room.maxOccupancy.infants} infant${room.maxOccupancy.infants === 1 ? '' : 's'}.`,
    };
  }

  return { withinCapacity: true, requestedGuests, maximumGuests };
}

/**
 * Filters a catalogue down to the suites that can actually host the requested stay.
 *
 * A suite is retained only when it is in a bookable status, free of date conflicts for
 * the requested window, and large enough for the party when `guests` is supplied.
 */
export function filterAvailableRooms(
  rooms: Room[],
  checkIn: string,
  checkOut: string,
  existingReservations: Reservation[],
  guests?: OccupancyRequest
): Room[] {
  if (!isValidStayRange(checkIn, checkOut)) {
    return [];
  }

  return rooms.filter((room) => {
    if (!checkRoomAvailability(room, checkIn, checkOut, existingReservations).isAvailable) {
      return false;
    }
    if (guests && !checkOccupancyCapacity(room, guests).withinCapacity) {
      return false;
    }
    return true;
  });
}

/**
 * Returns the reservations of a single suite whose stay spans `date`, used by the admin
 * calendar strip to colour each night.
 *
 * @param date ISO night under inspection.
 */
export function reservationsSpanningDate(
  roomId: string,
  date: string,
  existingReservations: Reservation[]
): Reservation[] {
  const target = dayjs(date);
  return existingReservations.filter((reservation) => {
    if (reservation.roomId !== roomId || reservation.status === 'CANCELLED') {
      return false;
    }
    return (
      target.isSame(dayjs(reservation.checkInDate), 'day') ||
      target.isBefore(dayjs(reservation.checkOutDate), 'day')
    );
  });
}
