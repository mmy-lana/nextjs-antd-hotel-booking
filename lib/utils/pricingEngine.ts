import dayjs from 'dayjs';
import type { Room, AddonService, PricingBreakdown } from '@/types/booking';

/** Raised when a quote is requested for a stay that cannot be billed. */
export class InvalidStayRangeError extends Error {
  constructor(checkInDate: string, checkOutDate: string) {
    super(`Check-out date must be strictly after check-in date (received ${checkInDate} → ${checkOutDate})`);
    this.name = 'InvalidStayRangeError';
  }
}

/**
 * Prices a stay.
 *
 * Financial integrity rules:
 *  - The stay window is normalised to whole days and must contain at least one night.
 *    An inverted or same-day range throws instead of silently billing a night the guest
 *    never requested, which previously turned a corrupted range into a payable quote.
 *  - Every money value is rounded at the point it becomes a ledger line, and the tax
 *    percentages are expressed as an integer ratio so repeated arithmetic on binary
 *    floating point cannot drift the total by a cent.
 *
 * @param room rates used to build the quote.
 * @param checkInDate arrival date, `YYYY-MM-DD`.
 * @param checkOutDate departure date, `YYYY-MM-DD`; must be strictly after arrival.
 * @param selectedAddons concierge selections with their quantities.
 * @returns the fully itemised pricing breakdown.
 * @throws {InvalidStayRangeError} when the stay window does not contain at least one night.
 */
export function calculateReservationQuote(
  room: Pick<Room, 'basePricePerNight' | 'weekendPricePerNight' | 'resortFeePerNight' | 'cleaningFee'>,
  checkInDate: string,
  checkOutDate: string,
  selectedAddons: { addon: AddonService; quantity: number }[]
): PricingBreakdown {
  const start = dayjs(checkInDate).startOf('day');
  const end = dayjs(checkOutDate).startOf('day');
  const nightDifference = end.diff(start, 'day');

  if (!Number.isFinite(nightDifference) || nightDifference <= 0) {
    throw new InvalidStayRangeError(checkInDate, checkOutDate);
  }

  const totalNights = nightDifference;

  let weekdayNights = 0;
  let weekendNights = 0;

  for (let i = 0; i < totalNights; i++) {
    const currentDay = start.add(i, 'day').day();
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

  // Round at the ledger boundary and express the percentages as integer ratios so
  // repeated float multiplication cannot drift the payable total.
  const subtotal = Math.round(
    baseRoomSubtotal + weekendSurchargeSubtotal + resortFeeTotal + cleaningFee + addonsSubtotal,
  );
  const serviceCharge = Math.round((subtotal * 10) / 100);
  const occupancyTax = Math.round((subtotal * 8) / 100);
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
