/**
 * Domain logic verification suite.
 *
 * Exercises the real project modules — pricing engine, availability checks,
 * Zod schemas, Zustand stores and the localStorage layer — without any mocks or
 * duplicated logic. Run with:
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *        --import ./scripts/verify/register-aliases.mjs \
 *        ./scripts/verify/domain-suite.mjs
 */
import './install-dom.mjs';
import dayjs from 'dayjs';

import { assertEqual, assertFalse, assertMatch, assertRejects, assertSame, assertThrows, assertTrue, report, runAsyncTests, suite, test, testAsync } from './harness.mjs';
import { attachWindow, detachWindow, installMemoryStorage, resetMemoryStorage } from './dom-stub.mjs';

import { defaultRooms } from '@/lib/data/seedRooms';
import { defaultAddons } from '@/lib/data/seedAddons';
import { calculateReservationQuote, InvalidStayRangeError } from '@/lib/utils/pricingEngine';
import {
  checkOccupancyCapacity,
  checkRoomAvailability,
  countNights,
  filterAvailableRooms,
  isDateRangeOverlapping,
  isValidStayRange,
  reservationsSpanningDate,
} from '@/lib/utils/availability';
import {
  GuestDetailsSchema,
  ReservationSubmissionSchema,
  RoomCreateSchema,
  RoomUpdateSchema,
} from '@/schemas/validation';
import { useInventoryStore } from '@/lib/store/inventoryStore';
import { useBookingStore } from '@/lib/store/bookingStore';
import {
  STORAGE_KEYS,
  deriveGuestId,
  isBrowserStorageAvailable,
  readInventorySnapshot,
  readJsonValue,
  readStoredReservations,
  findStoredReservationByReference,
  resetResortStorage,
  seedInventoryStorage,
  writeJsonValue,
} from '@/lib/utils/storage';

const CLIFFSIDE = defaultRooms[0];
const LAGOON = defaultRooms[1];
const GARDEN = defaultRooms[2];
const PENTHOUSE = defaultRooms[3];

/* -------------------------------------------------------------------------- */
/* Seed data integrity                                                         */
/* -------------------------------------------------------------------------- */

suite('Seed data collections');

test('four curated suites are seeded with unique ids and slugs', () => {
  assertSame(defaultRooms.length, 4, 'seed suite count');
  const ids = new Set(defaultRooms.map((room) => room.id));
  const slugs = new Set(defaultRooms.map((room) => room.slug));
  assertSame(ids.size, 4, 'suite ids must be unique');
  assertSame(slugs.size, 4, 'suite slugs must be unique');
});

test('every suite carries at least one showcase image and amenity', () => {
  for (const room of defaultRooms) {
    assertTrue(room.images.length >= 1, `${room.roomNumber} must ship at least one image`);
    assertTrue(
      room.images.some((image) => image.isPrimary),
      `${room.roomNumber} must designate a primary image`,
    );
    assertTrue(room.amenities.length >= 1, `${room.roomNumber} must ship at least one amenity`);
    assertTrue(
      room.images.every((image) => image.url.startsWith('https://')),
      `${room.roomNumber} images must be served over https`,
    );
  }
});

test('every suite weekend rate is greater than or equal to its base rate', () => {
  for (const room of defaultRooms) {
    assertTrue(
      room.weekendPricePerNight >= room.basePricePerNight,
      `${room.roomNumber} weekend rate must not undercut the base rate`,
    );
    assertTrue(room.resortFeePerNight >= 0, `${room.roomNumber} resort fee must be non-negative`);
    assertTrue(room.cleaningFee >= 0, `${room.roomNumber} cleaning fee must be non-negative`);
  }
});

test('four concierge addons are seeded with unique ids', () => {
  assertSame(defaultAddons.length, 4, 'seed addon count');
  const ids = new Set(defaultAddons.map((addon) => addon.id));
  assertSame(ids.size, 4, 'addon ids must be unique');
  for (const addon of defaultAddons) {
    assertTrue(addon.pricePerUnit > 0, `${addon.name} must be priced`);
    assertMatch(addon.id, /^addon-\d+$/, `${addon.name} uses the addon-N identifier format`);
  }
});

/* -------------------------------------------------------------------------- */
/* Pricing engine                                                              */
/* -------------------------------------------------------------------------- */

suite('Pricing engine — calculateReservationQuote');

test('splits a Fri-to-Tue stay into 2 weekend and 3 weekday nights', () => {
  const quote = calculateReservationQuote(CLIFFSIDE, '2026-03-06', '2026-03-10', []);
  assertSame(quote.totalNights, 4, 'nights between 6 Mar and 10 Mar 2026');
  assertSame(quote.weekendNights, 2, 'Fri 6 and Sat 7 Mar are premium nights');
  assertSame(quote.weekdayNights, 2, 'Sun 8 and Mon 9 Mar are standard nights');
});

test('applies the full itemised breakdown for a four-night cliffside stay', () => {
  const quote = calculateReservationQuote(CLIFFSIDE, '2026-03-06', '2026-03-10', []);
  assertSame(quote.baseRoomSubtotal, 2500, '2 weekday nights x $1,250');
  assertSame(quote.weekendSurchargeSubtotal, 2900, '2 weekend nights x $1,450');
  assertSame(quote.resortFeeTotal, 300, '4 nights x $75 resort fee');
  assertSame(quote.cleaningFee, 150, 'flat cleaning fee charged once');
  assertSame(quote.addonsSubtotal, 0, 'no addons selected');
  assertSame(quote.subtotal, 5850, 'sum of room, resort fee and cleaning');
  assertSame(quote.serviceCharge, 585, '10% luxury resort service charge');
  assertSame(quote.occupancyTax, 468, '8% local hospitality and tourism tax');
  assertSame(quote.taxesTotal, 1053, 'combined tax subtotal');
  assertSame(quote.grandTotal, 6903, 'subtotal plus taxes');
  assertSame(quote.currency, 'USD', 'currency is locked to USD');
});

test('charges per-night addons once per night and per-stay addons once in total', () => {
  const spaPass = defaultAddons.find((addon) => addon.id === 'addon-3');
  const helicopter = defaultAddons.find((addon) => addon.id === 'addon-1');
  assertTrue(spaPass.chargeType === 'per_night', 'addon-3 is a per-night pass');
  assertTrue(helicopter.chargeType === 'per_stay', 'addon-1 is a per-stay transfer');

  const quote = calculateReservationQuote(
    CLIFFSIDE,
    '2026-03-06',
    '2026-03-10',
    [
      { addon: spaPass, quantity: 2 },
      { addon: helicopter, quantity: 1 },
    ],
  );
  assertSame(quote.addonsSubtotal, 85 * 2 * 4 + 650, '2 spa passes nightly for 4 nights plus one transfer');
  assertSame(quote.subtotal, 5850 + 1330, 'subtotal grows by exactly the addon subtotal');
});

test('multiplies per-night addon charges by guest quantity and night count', () => {
  const spaPass = defaultAddons.find((addon) => addon.id === 'addon-3');
  const quote = calculateReservationQuote(CLIFFSIDE, '2026-03-02', '2026-03-05', [
    { addon: spaPass, quantity: 3 },
  ]);
  assertSame(quote.totalNights, 3, 'Mon to Thu is three nights');
  assertSame(quote.addonsSubtotal, 85 * 3 * 3, 'quantity multiplies the nightly unit price');
});

test('rejects a same-day or inverted date range instead of billing a phantom night', () => {
  const sameDay = assertThrows(
    () => calculateReservationQuote(CLIFFSIDE, '2026-03-06', '2026-03-06', []),
    'a same-day range must be rejected',
    'Check-out date must be strictly after check-in date',
  );
  assertSame(sameDay.name, 'InvalidStayRangeError', 'the failure is a typed, catchable error');

  assertThrows(
    () => calculateReservationQuote(CLIFFSIDE, '2026-03-10', '2026-03-06', []),
    'an inverted range must be rejected',
    'Check-out date must be strictly after check-in date',
  );

  assertThrows(
    () => calculateReservationQuote(CLIFFSIDE, 'not-a-date', '2026-03-06', []),
    'an unparseable arrival date must be rejected',
    'Check-out date must be strictly after check-in date',
  );
});

test('rounds every ledger line to whole currency units', () => {
  const quote = calculateReservationQuote(CLIFFSIDE, '2026-03-02', '2026-03-05', []);
  for (const line of [
    quote.baseRoomSubtotal,
    quote.weekendSurchargeSubtotal,
    quote.resortFeeTotal,
    quote.cleaningFee,
    quote.addonsSubtotal,
    quote.subtotal,
    quote.serviceCharge,
    quote.occupancyTax,
    quote.taxesTotal,
    quote.grandTotal,
  ]) {
    assertTrue(Number.isInteger(line), `every ledger line must be a whole unit (got ${line})`);
  }
  assertSame(quote.serviceCharge, Math.round((quote.subtotal * 10) / 100), 'service charge uses the integer ratio');
  assertSame(quote.occupancyTax, Math.round((quote.subtotal * 8) / 100), 'occupancy tax uses the integer ratio');
});

test('keeps tax lines and the grand total internally consistent', () => {
  const quote = calculateReservationQuote(PENTHOUSE, '2026-06-12', '2026-06-18', [
    { addon: defaultAddons[3], quantity: 1 },
  ]);
  assertSame(quote.subtotal, quote.baseRoomSubtotal + quote.weekendSurchargeSubtotal + quote.resortFeeTotal + quote.cleaningFee + quote.addonsSubtotal, 'subtotal equals the sum of its parts');
  assertSame(quote.taxesTotal, quote.serviceCharge + quote.occupancyTax, 'tax subtotal equals both tax lines');
  assertSame(quote.grandTotal, quote.subtotal + quote.taxesTotal, 'grand total equals subtotal plus taxes');
  assertSame(quote.totalNights, quote.weekdayNights + quote.weekendNights, 'nights reconcile with the weekday/weekend split');
});

/* -------------------------------------------------------------------------- */
/* Availability                                                                */
/* -------------------------------------------------------------------------- */

suite('Availability — date overlap and occupancy');

test('treats partially overlapping stays as a conflict', () => {
  assertTrue(
    isDateRangeOverlapping('2026-04-01', '2026-04-05', '2026-04-04', '2026-04-08'),
    'two stays sharing a night must conflict',
  );
  assertTrue(
    isDateRangeOverlapping('2026-04-04', '2026-04-08', '2026-04-01', '2026-04-05'),
    'overlap detection is symmetric',
  );
});

test('allows turnover where one departure equals the next arrival', () => {
  assertFalse(
    isDateRangeOverlapping('2026-04-01', '2026-04-05', '2026-04-05', '2026-04-09'),
    'a departure on the arrival day is not an overlap',
  );
  assertFalse(
    isDateRangeOverlapping('2026-04-10', '2026-04-14', '2026-04-01', '2026-04-05'),
    'entirely separate stays must not conflict',
  );
});

test('counts nights and validates forward-dated stays', () => {
  assertSame(countNights('2026-04-01', '2026-04-05'), 4, 'night count between two ISO dates');
  assertSame(countNights('2026-04-01', '2026-04-01'), 1, 'night count floors at one');
  assertTrue(isValidStayRange('2026-04-01', '2026-04-05'), 'forward range is valid');
  assertFalse(isValidStayRange('2026-04-05', '2026-04-01'), 'reverse range is rejected');
  assertFalse(isValidStayRange('2026-04-01', '2026-04-01'), 'same-day range is rejected as a stay');
});

test('blocks a suite held in maintenance or cleaning regardless of the calendar', () => {
  const base = { isAvailable: false };
  assertEqual(
    checkRoomAvailability({ ...CLIFFSIDE, status: 'MAINTENANCE' }, '2026-04-01', '2026-04-05', []),
    base,
    'maintenance suites are never bookable',
  );
  assertEqual(
    checkRoomAvailability({ ...CLIFFSIDE, status: 'CLEANING' }, '2026-04-01', '2026-04-05', []),
    base,
    'cleaning suites are never bookable',
  );
});

test('reports the conflicting reservation id for an occupied window', () => {
  const existing = [
    {
      id: 'res-occupied',
      bookingReference: 'RES-AAAAAAAAAA',
      roomId: CLIFFSIDE.id,
      guest: { title: 'Mr', firstName: 'Ada', lastName: 'Byron', email: 'ada@example.com', phone: '+1 555 0100' },
      checkInDate: '2026-04-02',
      checkOutDate: '2026-04-06',
      guestCounts: { adults: 2, children: 0, infants: 0 },
      selectedAddons: [],
      pricing: null,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const result = checkRoomAvailability(CLIFFSIDE, '2026-04-05', '2026-04-09', existing);
  assertFalse(result.isAvailable, 'the overlapping window must be rejected');
  assertSame(result.conflictReservationId, 'res-occupied', 'the blocking reservation is identified');
  assertTrue(
    checkRoomAvailability(CLIFFSIDE, '2026-04-06', '2026-04-09', existing).isAvailable,
    'the following window remains bookable',
  );
  assertTrue(
    checkRoomAvailability(CLIFFSIDE, '2026-04-02', '2026-04-06', [
      { ...existing[0], status: 'CANCELLED' },
    ]).isAvailable,
    'cancelled reservations free their window',
  );
});

test('enforces the published occupancy limits of each suite', () => {
  assertTrue(
    checkOccupancyCapacity(GARDEN, { adults: 4, children: 2, infants: 1 }).withinCapacity,
    'the garden pavilion hosts a family of seven',
  );
  const overflow = checkOccupancyCapacity(LAGOON, { adults: 3, children: 0, infants: 0 });
  assertFalse(overflow.withinCapacity, 'the lagoon suite is limited to two adults');
  assertMatch(overflow.reason, 'maximum of 2 adults', 'the overflow reason is guest readable');
  assertFalse(
    checkOccupancyCapacity(LAGOON, { adults: 2, children: 1, infants: 0 }).withinCapacity,
    'the lagoon suite accepts no children',
  );
});

test('filters the catalogue to bookable suites for a window and party size', () => {
  const party = { adults: 6, children: 0, infants: 0 };
  const open = filterAvailableRooms(defaultRooms, '2026-04-01', '2026-04-05', [], party);
  assertEqual(
    open.map((room) => room.roomNumber),
    ['P-501'],
    'only the penthouse accommodates six adults',
  );
  assertEqual(
    filterAvailableRooms(defaultRooms, '2026-04-05', '2026-04-01', []),
    [],
    'a reverse date range yields no bookable suites',
  );
});

test('lists the reservations that span a given night for the calendar strip', () => {
  const existing = [
    {
      id: 'res-stay',
      bookingReference: 'RES-BBBBBBBBBB',
      roomId: CLIFFSIDE.id,
      guest: { title: 'Ms', firstName: 'Iris', lastName: 'Vale', email: 'iris@example.com', phone: '+1 555 0101' },
      checkInDate: '2026-04-02',
      checkOutDate: '2026-04-06',
      guestCounts: { adults: 2, children: 0, infants: 0 },
      selectedAddons: [],
      pricing: null,
      status: 'CHECKED_IN',
      paymentStatus: 'PAID',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  assertSame(reservationsSpanningDate(CLIFFSIDE.id, '2026-04-04', existing).length, 1, 'a mid-stay night belongs to the reservation');
  assertSame(reservationsSpanningDate(CLIFFSIDE.id, '2026-04-02', existing).length, 1, 'the arrival night belongs to the reservation');
  assertSame(reservationsSpanningDate(CLIFFSIDE.id, '2026-04-06', existing).length, 0, 'the departure night is free for turnover');
  assertSame(reservationsSpanningDate(LAGOON.id, '2026-04-04', existing).length, 0, 'other suites are unaffected');
});

/* -------------------------------------------------------------------------- */
/* Zod validation                                                              */
/* -------------------------------------------------------------------------- */

suite('Zod runtime validation');

const VALID_GUEST = {
  title: 'Dr',
  firstName: 'Amelia',
  lastName: 'Hartwell',
  email: 'amelia.hartwell@example.com',
  phone: '+1 555 0142',
};

test('accepts a complete guest record', () => {
  const parsed = GuestDetailsSchema.safeParse(VALID_GUEST);
  assertTrue(parsed.success, 'a well formed guest record passes validation');
  assertSame(parsed.data.email, VALID_GUEST.email, 'the validated email is preserved');
});

test('rejects malformed guest contact details with readable messages', () => {
  const shortName = GuestDetailsSchema.safeParse({ ...VALID_GUEST, firstName: 'A' });
  assertFalse(shortName.success, 'a one character first name is rejected');
  assertMatch(shortName.error.issues[0].message, 'at least 2 characters', 'first name message');

  const badEmail = GuestDetailsSchema.safeParse({ ...VALID_GUEST, email: 'not-an-email' });
  assertFalse(badEmail.success, 'a malformed email is rejected');
  assertMatch(badEmail.error.issues[0].message, 'valid guest email address', 'email message');

  const shortPhone = GuestDetailsSchema.safeParse({ ...VALID_GUEST, phone: '123' });
  assertFalse(shortPhone.success, 'a too-short phone number is rejected');
  assertMatch(shortPhone.error.issues[0].message, 'concierge', 'phone message');
});

test('validates a reservation submission end to end', () => {
  const parsed = ReservationSubmissionSchema.safeParse({
    roomId: CLIFFSIDE.id,
    checkInDate: '2026-04-01',
    checkOutDate: '2026-04-05',
    guestCounts: { adults: 2, children: 0, infants: 0 },
    selectedAddons: [{ addonId: 'addon-1', quantity: 1 }],
    guest: VALID_GUEST,
  });
  assertTrue(parsed.success, 'a well formed submission passes validation');
});

test('rejects malformed reservation dates and room identifiers', () => {
  const badRoom = ReservationSubmissionSchema.safeParse({
    roomId: 'not-a-uuid',
    checkInDate: '2026-04-01',
    checkOutDate: '2026-04-05',
    guestCounts: { adults: 2, children: 0, infants: 0 },
    guest: VALID_GUEST,
  });
  assertFalse(badRoom.success, 'a malformed room id is rejected');
  assertMatch(badRoom.error.issues[0].message, 'Invalid room selection identifier', 'room id message');

  const badDate = ReservationSubmissionSchema.safeParse({
    roomId: CLIFFSIDE.id,
    checkInDate: '01/04/2026',
    checkOutDate: '2026-04-05',
    guestCounts: { adults: 2, children: 0, infants: 0 },
    guest: VALID_GUEST,
  });
  assertFalse(badDate.success, 'a non ISO check-in date is rejected');
  assertMatch(badDate.error.issues[0].message, 'YYYY-MM-DD', 'date format message');

  const noAdults = ReservationSubmissionSchema.safeParse({
    roomId: CLIFFSIDE.id,
    checkInDate: '2026-04-01',
    checkOutDate: '2026-04-05',
    guestCounts: { adults: 0, children: 0, infants: 0 },
    guest: VALID_GUEST,
  });
  assertFalse(noAdults.success, 'a party with no adults is rejected');
  assertMatch(noAdults.error.issues[0].message, 'At least 1 adult', 'adult minimum message');
});

test('applies defaults for optional guest counts and addon selections', () => {
  const parsed = ReservationSubmissionSchema.parse({
    roomId: CLIFFSIDE.id,
    checkInDate: '2026-04-01',
    checkOutDate: '2026-04-05',
    guestCounts: { adults: 2 },
    guest: VALID_GUEST,
  });
  assertSame(parsed.guestCounts.children, 0, 'children default to zero');
  assertSame(parsed.guestCounts.infants, 0, 'infants default to zero');
  assertEqual(parsed.selectedAddons, [], 'addon selections default to an empty list');
});

test('requires at least one showcase image when creating a suite', () => {
  const roomDraft = {
    roomNumber: 'T-301',
    title: 'The Tessellated Terrace',
    category: 'garden-pavilion',
    tagline: 'Geometric stone terraces above the herb garden.',
    description: 'A serene suite with hand-cut tessellated floors and a shaded reading loggia.',
    basePricePerNight: 810,
    weekendPricePerNight: 940,
    resortFeePerNight: 60,
    cleaningFee: 110,
    squareMeters: 160,
    maxOccupancy: { adults: 2, children: 1, infants: 1 },
    bedConfiguration: '1 King Bed',
    status: 'AVAILABLE',
    viewType: 'Tropical Garden',
    images: [],
  };

  const noImages = RoomCreateSchema.safeParse(roomDraft);
  assertFalse(noImages.success, 'an empty gallery is rejected');
  assertMatch(noImages.error.issues[0].message, 'At least one room showcase image', 'gallery message');

  const parsed = RoomCreateSchema.safeParse({
    ...roomDraft,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32',
        altText: 'Tessellated terrace lounge',
        isPrimary: true,
        caption: 'Sunlit reading loggia',
      },
    ],
  });
  assertTrue(parsed.success, 'a suite with one image passes validation');
  assertTrue(Boolean(parsed.data.images[0].id), 'a gallery image id is generated when omitted');
  assertEqual(parsed.data.amenities, [], 'amenities default to an empty collection');
});

test('rejects non-positive pricing and unknown enum members', () => {
  const zeroPrice = RoomCreateSchema.safeParse({
    roomNumber: 'T-301',
    title: 'The Tessellated Terrace',
    category: 'garden-pavilion',
    tagline: 'Geometric stone terraces above the herb garden.',
    description: 'A serene suite with hand-cut tessellated floors and a shaded reading loggia.',
    basePricePerNight: 0,
    weekendPricePerNight: 940,
    resortFeePerNight: 60,
    cleaningFee: 110,
    squareMeters: 160,
    maxOccupancy: { adults: 2, children: 1, infants: 1 },
    bedConfiguration: '1 King Bed',
    status: 'AVAILABLE',
    viewType: 'Tropical Garden',
    images: [{ url: 'https://example.com/a.jpg', altText: 'Terrace', caption: 'Terrace' }],
  });
  assertFalse(zeroPrice.success, 'a zero base rate is rejected');
  assertMatch(zeroPrice.error.issues[0].message, 'greater than zero', 'base price message');

  const badCategory = RoomCreateSchema.safeParse({
    roomNumber: 'T-301',
    title: 'The Tessellated Terrace',
    category: 'sky-mansion',
    tagline: 'Geometric stone terraces above the herb garden.',
    description: 'A serene suite with hand-cut tessellated floors and a shaded reading loggia.',
    basePricePerNight: 810,
    weekendPricePerNight: 940,
    resortFeePerNight: 60,
    cleaningFee: 110,
    squareMeters: 160,
    maxOccupancy: { adults: 2, children: 1, infants: 1 },
    bedConfiguration: '1 King Bed',
    status: 'AVAILABLE',
    viewType: 'Tropical Garden',
    images: [{ url: 'https://example.com/a.jpg', altText: 'Terrace', caption: 'Terrace' }],
  });
  assertFalse(badCategory.success, 'an unknown room category is rejected');
});

test('room updates additionally require a UUID identifier', () => {
  const updateDraft = {
    id: 'not-a-uuid',
    roomNumber: 'T-301',
    title: 'The Tessellated Terrace',
    category: 'garden-pavilion',
    tagline: 'Geometric stone terraces above the herb garden.',
    description: 'A serene suite with hand-cut tessellated floors and a shaded reading loggia.',
    basePricePerNight: 810,
    weekendPricePerNight: 940,
    resortFeePerNight: 60,
    cleaningFee: 110,
    squareMeters: 160,
    maxOccupancy: { adults: 2, children: 1, infants: 1 },
    bedConfiguration: '1 King Bed',
    status: 'AVAILABLE',
    viewType: 'Tropical Garden',
    images: [{ url: 'https://example.com/a.jpg', altText: 'Terrace', caption: 'Terrace' }],
  };
  const invalid = RoomUpdateSchema.safeParse(updateDraft);
  assertFalse(invalid.success, 'an update without a UUID is rejected');
  assertMatch(invalid.error.issues[0].message, 'Valid room UUID required', 'update id message');

  const valid = RoomUpdateSchema.safeParse({ ...updateDraft, id: CLIFFSIDE.id });
  assertTrue(valid.success, 'an update carrying a real UUID passes validation');
});

test('every seeded suite satisfies the create schema', () => {
  for (const room of defaultRooms) {
    const { id, slug, createdAt, updatedAt, ...draft } = room;
    const parsed = RoomCreateSchema.safeParse(draft);
    assertTrue(parsed.success, `seeded suite ${room.roomNumber} must satisfy RoomCreateSchema: ${JSON.stringify(parsed.success ? [] : parsed.error.issues)}`);
  }
});

/* -------------------------------------------------------------------------- */
/* Inventory store                                                             */
/* -------------------------------------------------------------------------- */

suite('Inventory store (Zustand)');

function resetInventoryStore() {
  useInventoryStore.setState({
    rooms: defaultRooms.map((room) => ({ ...room })),
    reservations: [],
    addons: defaultAddons.map((addon) => ({ ...addon })),
  });
}

const ROOM_TEMPLATE = {
  roomNumber: 'D-402',
  slug: 'the-dune-cottage',
  title: 'The Dune Cottage',
  category: 'garden-pavilion',
  tagline: 'A secluded stone cottage resting between the dune grass and the tide line.',
  description: 'Built from reclaimed coastal stone with a cedar shingle roof, intimate reading loft and sheltered outdoor bathing court.',
  basePricePerNight: 640,
  weekendPricePerNight: 760,
  resortFeePerNight: 45,
  cleaningFee: 95,
  squareMeters: 120,
  maxOccupancy: { adults: 2, children: 1, infants: 1 },
  bedConfiguration: '1 Queen Bed',
  status: 'AVAILABLE',
  amenities: [],
  images: [{ id: 'img-402-1', url: 'https://example.com/dune.jpg', altText: 'Dune cottage', isPrimary: true, caption: 'Stone cottage exterior' }],
  viewType: 'Ocean Front',
};

test('seeds the catalogue and concierge catalogue on first load', () => {
  resetInventoryStore();
  assertSame(useInventoryStore.getState().rooms.length, 4, 'seed rooms are present');
  assertSame(useInventoryStore.getState().addons.length, 4, 'seed addons are present');
  assertSame(useInventoryStore.getState().reservations.length, 0, 'a fresh store has no reservations');
});

test('adds a suite with a generated identifier and audit timestamps', () => {
  resetInventoryStore();
  useInventoryStore.getState().addRoom(ROOM_TEMPLATE);
  const rooms = useInventoryStore.getState().rooms;
  const created = rooms.find((room) => room.roomNumber === 'D-402');
  assertTrue(Boolean(created), 'the new suite is present in the catalogue');
  assertMatch(created.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'a UUID is generated');
  assertTrue(Boolean(created.createdAt), 'a creation timestamp is stamped');
  assertSame(created.updatedAt, created.createdAt, 'the update timestamp starts equal to creation');
  assertSame(rooms.length, 5, 'the catalogue grows by exactly one suite');
});

test('updates suite fields and refreshes the audit timestamp', async () => {
  resetInventoryStore();
  await new Promise((resolve) => setTimeout(resolve, 5));
  useInventoryStore.getState().updateRoom(CLIFFSIDE.id, { basePricePerNight: 1390 });
  const updated = useInventoryStore.getState().rooms.find((room) => room.id === CLIFFSIDE.id);
  assertSame(updated.basePricePerNight, 1390, 'the new rate is persisted');
  assertTrue(updated.updatedAt > CLIFFSIDE.updatedAt, 'the audit timestamp advances');
  assertSame(updated.createdAt, CLIFFSIDE.createdAt, 'the creation timestamp is immutable');
});

test('toggles operational room status through updateRoomStatus', () => {
  resetInventoryStore();
  useInventoryStore.getState().updateRoomStatus(GARDEN.id, 'MAINTENANCE');
  assertSame(
    useInventoryStore.getState().rooms.find((room) => room.id === GARDEN.id).status,
    'MAINTENANCE',
    'the suite is withdrawn for maintenance',
  );
  useInventoryStore.getState().updateRoomStatus(GARDEN.id, 'AVAILABLE');
  assertSame(
    useInventoryStore.getState().rooms.find((room) => room.id === GARDEN.id).status,
    'AVAILABLE',
    'the suite returns to sale',
  );
});

testAsync('refuses to delete a suite that still carries active reservations', async () => {
  resetInventoryStore();
  const reservation = await useInventoryStore.getState().createReservation({
    roomId: CLIFFSIDE.id,
    guest: VALID_GUEST,
    checkInDate: '2026-05-01',
    checkOutDate: '2026-05-05',
    guestCounts: { adults: 2, children: 0, infants: 0 },
    selectedAddons: [],
    pricing: calculateReservationQuote(CLIFFSIDE, '2026-05-01', '2026-05-05', []),
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
  });

  const error = assertThrows(
    () => useInventoryStore.getState().deleteRoom(CLIFFSIDE.id),
    'deleting an occupied suite must be blocked',
    'active reservations',
  );
  assertMatch(error.message, 'Reassign or cancel', 'the guard explains the remediation');
  assertSame(
    useInventoryStore.getState().rooms.some((room) => room.id === CLIFFSIDE.id),
    true,
    'the blocked suite remains in the catalogue',
  );

  useInventoryStore.getState().cancelReservation(reservation.id);
  useInventoryStore.getState().deleteRoom(CLIFFSIDE.id);
  assertSame(
    useInventoryStore.getState().rooms.some((room) => room.id === CLIFFSIDE.id),
    false,
    'a suite with no live reservations can be withdrawn',
  );
});

testAsync('creates a reservation with a RES-XXXXXXXXXX booking reference', async () => {
  resetInventoryStore();
  const reservation = await useInventoryStore.getState().createReservation({
    roomId: PENTHOUSE.id,
    guest: { ...VALID_GUEST, guestId: deriveGuestId(VALID_GUEST.email) },
    checkInDate: '2026-07-01',
    checkOutDate: '2026-07-05',
    guestCounts: { adults: 4, children: 1, infants: 0 },
    selectedAddons: [{ addonId: 'addon-4', quantity: 1, calculatedPrice: 890 }],
    pricing: calculateReservationQuote(PENTHOUSE, '2026-07-01', '2026-07-05', [
      { addon: defaultAddons[3], quantity: 1 },
    ]),
    status: 'PENDING',
    paymentStatus: 'PENDING',
  });
  assertMatch(reservation.bookingReference, /^RES-[0-9A-F]{10}$/, 'the booking reference uses the documented format');
  assertSame(reservation.pricing.grandTotal, reservation.pricing.subtotal + reservation.pricing.taxesTotal, 'the stored quote stays internally consistent');
  assertSame(useInventoryStore.getState().reservations.length, 1, 'the reservation is recorded');
});

testAsync('rejects an overlapping booking as a double booking', async () => {
  resetInventoryStore();
  const quote = calculateReservationQuote(CLIFFSIDE, '2026-08-10', '2026-08-14', []);
  await useInventoryStore.getState().createReservation({
    roomId: CLIFFSIDE.id,
    guest: VALID_GUEST,
    checkInDate: '2026-08-10',
    checkOutDate: '2026-08-14',
    guestCounts: { adults: 2, children: 0, infants: 0 },
    selectedAddons: [],
    pricing: quote,
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
  });

  await assertRejects(
    useInventoryStore.getState().createReservation({
      roomId: CLIFFSIDE.id,
      guest: { ...VALID_GUEST, firstName: 'Claude' },
      checkInDate: '2026-08-12',
      checkOutDate: '2026-08-16',
      guestCounts: { adults: 2, children: 0, infants: 0 },
      selectedAddons: [],
      pricing: quote,
      status: 'PENDING',
      paymentStatus: 'PENDING',
    }),
    'an overlapping window must be rejected',
    'reserved during checkout',
  );

  const turnover = await useInventoryStore.getState().createReservation({
    roomId: CLIFFSIDE.id,
    guest: { ...VALID_GUEST, firstName: 'Claude' },
    checkInDate: '2026-08-14',
    checkOutDate: '2026-08-18',
    guestCounts: { adults: 2, children: 0, infants: 0 },
    selectedAddons: [],
    pricing: quote,
    status: 'PENDING',
    paymentStatus: 'PENDING',
  });
  assertTrue(Boolean(turnover), 'a booking that begins on the departure date is allowed');
});

testAsync('throws a descriptive error when the room is missing from the catalogue', async () => {
  resetInventoryStore();
  await assertRejects(
    useInventoryStore.getState().createReservation({
      roomId: '00000000-0000-4000-8000-000000000000',
      guest: VALID_GUEST,
      checkInDate: '2026-09-01',
      checkOutDate: '2026-09-04',
      guestCounts: { adults: 1, children: 0, infants: 0 },
      selectedAddons: [],
      pricing: null,
      status: 'PENDING',
      paymentStatus: 'PENDING',
    }),
    'an unknown room must be rejected',
    'not found in inventory',
  );
});

testAsync('advances reservation status through check-in, check-out and cancellation', async () => {
  resetInventoryStore();
  const reservation = await useInventoryStore.getState().createReservation({
    roomId: LAGOON.id,
    guest: VALID_GUEST,
    checkInDate: '2026-10-01',
    checkOutDate: '2026-10-04',
    guestCounts: { adults: 2, children: 0, infants: 0 },
    selectedAddons: [],
    pricing: calculateReservationQuote(LAGOON, '2026-10-01', '2026-10-04', []),
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
  });

  useInventoryStore.getState().updateReservationStatus(reservation.id, 'CHECKED_IN');
  assertSame(
    useInventoryStore.getState().reservations.find((item) => item.id === reservation.id).status,
    'CHECKED_IN',
    'the guest is checked in',
  );

  useInventoryStore.getState().updateReservationStatus(reservation.id, 'CHECKED_OUT');
  assertSame(
    useInventoryStore.getState().reservations.find((item) => item.id === reservation.id).status,
    'CHECKED_OUT',
    'the guest is checked out',
  );

  useInventoryStore.getState().cancelReservation(reservation.id);
  assertSame(
    useInventoryStore.getState().reservations.find((item) => item.id === reservation.id).status,
    'CANCELLED',
    'the itinerary is cancelled',
  );
});

/* -------------------------------------------------------------------------- */
/* Booking session store                                                       */
/* -------------------------------------------------------------------------- */

suite('Booking session store (Zustand)');

test('stores the date range as ISO strings for durable serialisation', () => {
  useBookingStore.getState().resetFilters();
  useBookingStore.getState().setDateRange([dayjs('2026-04-01'), dayjs('2026-04-05')]);
  assertEqual(useBookingStore.getState().dateRange, ['2026-04-01', '2026-04-05'], 'Dayjs values are serialised to ISO dates');

  useBookingStore.getState().setDateRange(null);
  assertSame(useBookingStore.getState().dateRange, null, 'clearing the calendar resets the range');
});

test('records guest counts, category filter and resets the session', () => {
  useBookingStore.getState().resetFilters();
  useBookingStore.getState().setGuests({ adults: 3, children: 2 });
  useBookingStore.getState().setSelectedCategory('ocean-suite');
  assertEqual(useBookingStore.getState().guests, { adults: 3, children: 2 }, 'guest counts are recorded');
  assertSame(useBookingStore.getState().selectedCategory, 'ocean-suite', 'category filter is recorded');

  useBookingStore.getState().resetFilters();
  assertEqual(useBookingStore.getState().guests, { adults: 2, children: 0 }, 'guests reset to the resort default');
  assertSame(useBookingStore.getState().selectedCategory, 'ALL', 'category filter resets');
  assertSame(useBookingStore.getState().dateRange, null, 'date range resets');
});

test('both stores are configured with skipHydration for SSR safety', () => {
  assertSame(typeof useInventoryStore.persist?.rehydrate, 'function', 'inventory store exposes a rehydrate control');
  assertSame(typeof useBookingStore.persist?.rehydrate, 'function', 'booking store exposes a rehydrate control');
});

/* -------------------------------------------------------------------------- */
/* LocalStorage persistence layer                                              */
/* -------------------------------------------------------------------------- */

suite('LocalStorage persistence layer');

test('reports storage availability and stays inert without a browser window', () => {
  const storage = resetMemoryStorage();
  assertTrue(isBrowserStorageAvailable(), 'the in-memory storage is detected');
  const key = `${STORAGE_KEYS.inventory}-probe`;
  assertTrue(writeJsonValue(key, { ok: true }), 'a value is written');
  assertEqual(readJsonValue(key, null), { ok: true }, 'the value round-trips');

  detachWindow();
  assertFalse(isBrowserStorageAvailable(), 'server rendering never touches storage');
  assertSame(writeJsonValue(key, { ok: false }), false, 'writes are refused without a browser');
  assertSame(readJsonValue(key, 'fallback'), 'fallback', 'reads fall back when storage is absent');
  assertFalse(seedInventoryStorage({ rooms: defaultRooms, addons: defaultAddons }), 'seeding is refused without a browser');
  attachWindow();
  assertTrue(isBrowserStorageAvailable(), 'the browser environment is restored');
  resetMemoryStorage();
  assertSame(storage.length, 0, 'the fixture is clean for the following assertions');
});

test('survives a storage backend that rejects every write', () => {
  const storage = resetMemoryStorage();
  storage.failOnWrite = true;
  assertFalse(isBrowserStorageAvailable(), 'a throwing storage backend is reported as unavailable');
  assertSame(writeJsonValue(STORAGE_KEYS.bookingSession, { a: 1 }), false, 'quota failures are surfaced as false, not thrown');
  assertSame(readJsonValue(STORAGE_KEYS.bookingSession, null), null, 'reads still resolve safely');
  resetMemoryStorage();
});

test('seeds the inventory exactly once and never overwrites a guest payload', () => {
  const storage = resetMemoryStorage();
  assertTrue(seedInventoryStorage({ rooms: defaultRooms, addons: defaultAddons }), 'the first visit is seeded');
  assertEqual(readInventorySnapshot().rooms.length, 4, 'the seeded catalogue is readable');
  assertSame(storage.length, 1, 'only the inventory key is written by the seed');

  writeJsonValue(STORAGE_KEYS.inventory, { state: { rooms: [], reservations: [], addons: [] }, version: 0 });
  assertFalse(seedInventoryStorage({ rooms: defaultRooms, addons: defaultAddons }), 'a second seed attempt is skipped');
  assertEqual(readInventorySnapshot().rooms.length, 0, 'the concierge-edited payload survives re-entry');

  resetResortStorage();
  assertSame(storage.length, 0, 'the reset clears every resort key');
  resetMemoryStorage();
});

test('recovers from a corrupted storage payload instead of throwing', () => {
  const storage = resetMemoryStorage();
  storage.corruptReads = true;
  assertEqual(readInventorySnapshot(), { rooms: [], reservations: [], addons: [] }, 'corrupt JSON resolves to an empty inventory');
  assertSame(readJsonValue(STORAGE_KEYS.bookingSession, 'default'), 'default', 'a corrupt session resolves to its default');
  resetMemoryStorage();
});

test('reads both the Zustand envelope and a bare persisted payload', () => {
  resetMemoryStorage();
  writeJsonValue(STORAGE_KEYS.inventory, { state: { rooms: defaultRooms, reservations: [], addons: defaultAddons }, version: 0 });
  assertSame(readInventorySnapshot().rooms.length, 4, 'the envelope shape is understood');

  writeJsonValue(STORAGE_KEYS.inventory, { rooms: defaultRooms.slice(0, 2), reservations: [], addons: defaultAddons });
  assertSame(readInventorySnapshot().rooms.length, 2, 'a bare payload shape is understood');

  writeJsonValue(STORAGE_KEYS.inventory, 'not-an-object');
  assertSame(readInventorySnapshot().rooms.length, 0, 'a non-object payload resolves to an empty inventory');
  resetMemoryStorage();
});

test('finds a persisted itinerary by its booking reference, case-insensitively', () => {
  resetMemoryStorage();
  const reservation = {
    id: 'res-lookup',
    bookingReference: 'RES-DEADBEEF01',
    roomId: CLIFFSIDE.id,
    guest: VALID_GUEST,
    checkInDate: '2026-11-02',
    checkOutDate: '2026-11-06',
    guestCounts: { adults: 2, children: 0, infants: 0 },
    selectedAddons: [],
    pricing: calculateReservationQuote(CLIFFSIDE, '2026-11-02', '2026-11-06', []),
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  writeJsonValue(STORAGE_KEYS.inventory, { state: { rooms: defaultRooms, reservations: [reservation], addons: defaultAddons }, version: 0 });

  assertSame(readStoredReservations().length, 1, 'the persisted itinerary is listed');
  assertSame(findStoredReservationByReference('res-deadbeef01').id, 'res-lookup', 'the reference lookup ignores case and padding');
  assertSame(findStoredReservationByReference('RES-0000000000'), null, 'an unknown reference resolves to null');
  assertSame(findStoredReservationByReference('   '), null, 'a blank reference resolves to null');

  resetResortStorage();
  resetMemoryStorage();
});

test('derives a stable, case-insensitive guest fingerprint', () => {
  assertSame(
    deriveGuestId('  Amelia.Hartwell@Example.com '),
    deriveGuestId('amelia.hartwell@example.com'),
    'the fingerprint ignores case and surrounding whitespace',
  );
  assertMatch(deriveGuestId(VALID_GUEST.email), /^guest-[0-9a-f]{8}$/, 'the fingerprint is an 8 character hex identifier');
  assertTrue(
    deriveGuestId(VALID_GUEST.email) !== deriveGuestId('someone.else@example.com'),
    'distinct guests receive distinct fingerprints',
  );
});

/* -------------------------------------------------------------------------- */
/* Zustand persistence round trip                                              */
/* -------------------------------------------------------------------------- */

suite('Zustand persistence round trip');

testAsync('rehydrates a persisted catalogue into the live store', async () => {
  resetMemoryStorage();
  resetInventoryStore();
  // Written after the reset so the patched setState does not immediately rewrite it.
  writeJsonValue(STORAGE_KEYS.inventory, {
    state: { rooms: [CLIFFSIDE, LAGOON], reservations: [], addons: defaultAddons },
    version: 0,
  });

  await useInventoryStore.persist.rehydrate();
  assertSame(useInventoryStore.getState().rooms.length, 2, 'the stored catalogue replaces the in-memory seed');
  assertSame(useInventoryStore.getState().rooms[0].roomNumber, 'V-101', 'the stored suites keep their identity');

  resetMemoryStorage();
  resetInventoryStore();
});

testAsync('persists store mutations back to localStorage', async () => {
  const storage = resetMemoryStorage();
  useBookingStore.getState().resetFilters();

  useBookingStore.getState().setGuests({ adults: 3, children: 1 });
  // Zustand writes through its patched setter synchronously.
  const persisted = JSON.parse(storage.getItem(STORAGE_KEYS.bookingSession) ?? '{}');
  assertEqual(persisted?.state?.guests, { adults: 3, children: 1 }, 'the guest counts reach localStorage');

  useBookingStore.getState().resetFilters();
  resetMemoryStorage();
});

testAsync('round-trips a full reservation through localStorage', async () => {
  resetMemoryStorage();
  resetInventoryStore();
  const reservation = await useInventoryStore.getState().createReservation({
    roomId: GARDEN.id,
    guest: VALID_GUEST,
    checkInDate: '2026-12-20',
    checkOutDate: '2026-12-24',
    guestCounts: { adults: 2, children: 0, infants: 0 },
    selectedAddons: [],
    pricing: calculateReservationQuote(GARDEN, '2026-12-20', '2026-12-24', []),
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
  });

  const stored = JSON.parse(installMemoryStorage().getItem(STORAGE_KEYS.inventory) ?? '{}');
  assertSame(
    stored?.state?.reservations?.[0]?.bookingReference,
    reservation.bookingReference,
    'the itinerary is written through to storage on creation',
  );

  // Simulate a page reload: in-memory state is discarded, storage is replayed verbatim.
  resetInventoryStore();
  writeJsonValue(STORAGE_KEYS.inventory, stored);
  await useInventoryStore.persist.rehydrate();
  assertSame(useInventoryStore.getState().reservations.length, 1, 'the itinerary is restored after rehydration');
  assertSame(
    useInventoryStore.getState().reservations[0].bookingReference,
    reservation.bookingReference,
    'the restored itinerary keeps its booking reference',
  );
  assertSame(
    useInventoryStore.getState().reservations[0].pricing.grandTotal,
    reservation.pricing.grandTotal,
    'the itemised quote survives the round trip intact',
  );

  resetMemoryStorage();
  resetInventoryStore();
});

await runAsyncTests();
await report('Domain logic suite');