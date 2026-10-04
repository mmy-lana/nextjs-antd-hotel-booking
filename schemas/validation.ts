import { z, type ZodError } from 'zod';

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
      addonId: z.string().min(1, 'Addon identifier required'),
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

/**
 * Ant Design compatible error map, keyed by dotted field path.
 *
 * Declared here rather than in a component so the bridge stays framework free and can
 * be exercised by the domain suite without a React runtime.
 */
export interface FormFieldError {
  errors: string[];
}

/**
 * Converts a `ZodError` into the error map `antd` Form accepts.
 *
 * Both validation paths share one source of truth: the antd `rules` give instant
 * feedback while typing, and this function applies the authoritative Zod verdict on
 * submit so a form can never disagree with the domain schema.
 *
 * Nested paths such as `guest.email` or `images.0.url` are preserved verbatim, and
 * multiple issues on one field are collapsed into a single entry.
 *
 * @param error the Zod failure raised by `.safeParse()`.
 * @returns a record of field path to its human readable messages.
 */
export function zodIssuesToFieldErrors(error: ZodError): Record<string, FormFieldError> {
  const fieldErrors: Record<string, FormFieldError> = {};
  for (const issue of error.issues) {
    const path = issue.path.map((segment) => String(segment)).join('.');
    if (path.length === 0) {
      continue;
    }
    fieldErrors[path] = { errors: [...(fieldErrors[path]?.errors ?? []), issue.message] };
  }
  return fieldErrors;
}
