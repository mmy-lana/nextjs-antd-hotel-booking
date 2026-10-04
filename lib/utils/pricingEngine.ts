import dayjs from 'dayjs';
import type { Room, AddonService, PricingBreakdown } from '@/types/booking';

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
