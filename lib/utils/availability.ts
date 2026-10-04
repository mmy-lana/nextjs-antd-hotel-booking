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
