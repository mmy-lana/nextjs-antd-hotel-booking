'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { Alert, App, Button, DatePicker, Drawer, Form, Grid, Input, Select, Steps } from 'antd';
import type { FormInstance, Rule } from 'antd/es/form';
import { useInventoryStore } from '@/lib/store/inventoryStore';
import { useBookingStore } from '@/lib/store/bookingStore';
import { calculateReservationQuote } from '@/lib/utils/pricingEngine';
import { checkOccupancyCapacity, checkRoomAvailability, isValidStayRange } from '@/lib/utils/availability';
import { deriveGuestId } from '@/lib/utils/storage';
import { GuestDetailsSchema, ReservationSubmissionSchema, zodIssuesToFieldErrors } from '@/schemas/validation';
import { AddonSelector, type AddonSelectionMap } from '@/components/molecules/AddonSelector';
import { CounterStepper } from '@/components/molecules/DateGuestFilterBar';
import { LuxuryPriceTag } from '@/components/primitives/LuxuryPriceTag';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import type { GuestDetails, Reservation, Room } from '@/types/booking';

const { TextArea } = Input;

export interface BookingDrawerProps {
  /** Drawer visibility. */
  open: boolean;
  /** Suite being reserved; `null` renders the empty state. */
  room: Room | null;
  /** Called when the guest dismisses the drawer. */
  onClose: () => void;
  /** Called with the persisted itinerary once a reservation succeeds. */
  onReserved?: (reservation: Reservation) => void;
}

/** Fields collected by the guest details form. */
interface GuestFormValues {
  title: GuestDetails['title'];
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialRequests?: string;
  estimatedArrivalTime?: string;
}

/** Ant Design does not re-export `FieldData` in v6, so it is derived from the instance. */
type FieldData = Parameters<FormInstance<GuestFormValues>['setFields']>[0] extends ReadonlyArray<
  infer TEntry
>
  ? TEntry
  : never;

/** Mirrors `GuestDetailsSchema` so feedback appears while typing. */
const GUEST_RULES: Record<'firstName' | 'lastName' | 'email' | 'phone' | 'specialRequests', Rule[]> = {
  firstName: [
    { required: true, message: 'First name must contain at least 2 characters' },
    { min: 2, max: 50, message: 'First name must contain at least 2 characters' },
  ],
  lastName: [
    { required: true, message: 'Last name must contain at least 2 characters' },
    { min: 2, max: 50, message: 'Last name must contain at least 2 characters' },
  ],
  email: [
    { required: true, message: 'Please enter a valid guest email address' },
    { type: 'email' as const, message: 'Please enter a valid guest email address' },
  ],
  phone: [
    { required: true, message: 'Valid contact number required for concierge communications' },
    { min: 8, message: 'Valid contact number required for concierge communications' },
  ],
  specialRequests: [{ max: 500, message: 'Special requests are limited to 500 characters' }],
};

/** Field names rendered by the guest details form. */
const GUEST_FIELD_NAMES = [
  'title',
  'firstName',
  'lastName',
  'email',
  'phone',
  'specialRequests',
  'estimatedArrivalTime',
] as const satisfies ReadonlyArray<keyof GuestFormValues>;

type GuestFieldName = (typeof GUEST_FIELD_NAMES)[number];

function isGuestFieldName(value: string): value is GuestFieldName {
  return (GUEST_FIELD_NAMES as ReadonlyArray<string>).includes(value);
}

const DEFAULT_FORM_VALUES: GuestFormValues = {
  title: 'Mr',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  specialRequests: '',
  estimatedArrivalTime: '16:00 - 20:00',
};

/**
 * Slide-over reservation flow.
 *
 * The quote is recalculated from the pricing engine on every edit, availability is
 * re-checked against live itineraries before each submission, and the guest form is
 * validated by the same Zod schema the domain layer uses. The drawer never blocks the
 * catalogue behind it, and every failure is reported in place rather than as a
 * transient toast.
 */
export function BookingDrawer({ open, room, onClose, onReserved }: BookingDrawerProps) {
  const screens = Grid.useBreakpoint();
  const { message } = App.useApp();
  const [form] = Form.useForm<GuestFormValues>();

  const addons = useInventoryStore((state) => state.addons);
  const reservations = useInventoryStore((state) => state.reservations);
  const createReservation = useInventoryStore((state) => state.createReservation);

  const sessionDateRange = useBookingStore((state) => state.dateRange);

  const [checkIn, setCheckIn] = useState<Dayjs | null>(null);
  const [checkOut, setCheckOut] = useState<Dayjs | null>(null);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [selections, setSelections] = useState<AddonSelectionMap>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Seed the flow from the active search session whenever a new suite is opened.
  useEffect(() => {
    if (!open) {
      return;
    }
    setSubmitError(null);
    setSelections({});
    const [sessionStart, sessionEnd] = sessionDateRange ?? [];
    setCheckIn(sessionStart ? dayjs(sessionStart) : null);
    setCheckOut(sessionEnd ? dayjs(sessionEnd) : null);
    form.setFieldsValue(DEFAULT_FORM_VALUES);
  }, [open, room?.id, sessionDateRange, form]);

  const today = useMemo(() => dayjs().startOf('day'), []);

  const selectedAddons = useMemo(
    () =>
      Object.entries(selections)
        .map(([addonId, quantity]) => {
          const addon = addons.find((candidate) => candidate.id === addonId);
          return addon ? { addon, quantity } : null;
        })
        .filter((entry): entry is { addon: (typeof addons)[number]; quantity: number } => entry !== null),
    [addons, selections],
  );

  const hasDates = Boolean(checkIn && checkOut);
  const totalNights = hasDates ? Math.max(1, (checkOut as Dayjs).diff(checkIn as Dayjs, 'day')) : 1;

  const quote = useMemo(() => {
    if (!room || !hasDates) {
      return null;
    }
    const arrival = (checkIn as Dayjs).format('YYYY-MM-DD');
    const departure = (checkOut as Dayjs).format('YYYY-MM-DD');
    // The engine rejects a window that cannot be billed, so only quote a valid stay
    // rather than letting an invariant violation surface from inside render.
    if (!isValidStayRange(arrival, departure)) {
      return null;
    }
    return calculateReservationQuote(room, arrival, departure, selectedAddons);
  }, [checkIn, checkOut, hasDates, room, selectedAddons]);

  const availability = useMemo(() => {
    if (!room || !hasDates) {
      return null;
    }
    return checkRoomAvailability(
      room,
      (checkIn as Dayjs).format('YYYY-MM-DD'),
      (checkOut as Dayjs).format('YYYY-MM-DD'),
      reservations,
    );
  }, [checkIn, checkOut, hasDates, reservations, room]);

  const capacity = useMemo(() => {
    if (!room) {
      return null;
    }
    return checkOccupancyCapacity(room, { adults, children, infants });
  }, [adults, children, infants, room]);

  const conflictMessage = useMemo(() => {
    if (!room || !hasDates) {
      return null;
    }
    if (room.status === 'MAINTENANCE' || room.status === 'CLEANING') {
      return `${room.title} is currently ${room.status.toLowerCase()} and cannot be reserved. Our concierge will contact you with alternatives.`;
    }
    if (availability && !availability.isAvailable) {
      return 'Those dates are already reserved. Choose a different arrival or departure date to continue.';
    }
    if (capacity && !capacity.withinCapacity) {
      return capacity.reason ?? 'The selected party exceeds this suite’s occupancy.';
    }
    return null;
  }, [availability, capacity, hasDates, room]);

  const canSubmit = Boolean(room && quote && !conflictMessage && !submitting);

  const handleCheckInChange = useCallback((value: Dayjs | null) => {
    setCheckIn(value);
    setSubmitError(null);
    setCheckOut((current) => {
      if (!value) {
        return null;
      }
      if (!current || !current.isAfter(value)) {
        return value.add(1, 'day');
      }
      return current;
    });
  }, []);

  const handleCheckOutChange = useCallback(
    (value: Dayjs | null) => {
      setSubmitError(null);
      setCheckOut((current) => {
        if (!value) {
          return null;
        }
        if (checkIn && !value.isAfter(checkIn)) {
          return checkIn.add(1, 'day');
        }
        return current ? value : value;
      });
    },
    [checkIn],
  );

  const handleAddonChange = useCallback((addonId: string, quantity: number) => {
    setSelections((current) => {
      const next = { ...current };
      if (quantity <= 0) {
        delete next[addonId];
      } else {
        next[addonId] = quantity;
      }
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!room || !checkIn || !checkOut || !quote) {
      return;
    }

    let values: GuestFormValues;
    try {
      values = await form.validateFields();
    } catch {
      // antd has already surfaced the inline messages.
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const submission = {
      roomId: room.id,
      checkInDate: checkIn.format('YYYY-MM-DD'),
      checkOutDate: checkOut.format('YYYY-MM-DD'),
      guestCounts: { adults, children, infants },
      selectedAddons: selectedAddons.map((entry) => ({
        addonId: entry.addon.id,
        quantity: entry.quantity,
        calculatedPrice:
          entry.addon.chargeType === 'per_night'
            ? entry.addon.pricePerUnit * entry.quantity * totalNights
            : entry.addon.pricePerUnit * entry.quantity,
      })),
      guest: {
        ...values,
        guestId: deriveGuestId(values.email),
      } satisfies GuestDetails,
    };

    const parsed = ReservationSubmissionSchema.safeParse(submission);
    if (!parsed.success) {
      // `ReservationSubmissionSchema` nests guest fields under `guest.`; the form is flat,
      // so the prefix is stripped before the authoritative errors are attached.
      const fieldErrors: FieldData[] = [];
      for (const [path, field] of Object.entries(zodIssuesToFieldErrors(parsed.error))) {
        const fieldName = path.startsWith('guest.') ? path.slice('guest.'.length) : path;
        if (!isGuestFieldName(fieldName)) {
          continue;
        }
        fieldErrors.push({ name: [fieldName], errors: field.errors });
      }
      if (fieldErrors.length > 0) {
        form.setFields(fieldErrors);
      }
      setSubmitting(false);
      setSubmitError('Please correct the highlighted details before confirming.');
      return;
    }

    try {
      // The store commits under a cross-tab Web Lock, so the call is asynchronous.
      const reservation = await createReservation({
        roomId: parsed.data.roomId,
        guest: { ...parsed.data.guest, guestId: deriveGuestId(parsed.data.guest.email) },
        checkInDate: parsed.data.checkInDate,
        checkOutDate: parsed.data.checkOutDate,
        guestCounts: parsed.data.guestCounts,
        selectedAddons: submission.selectedAddons,
        pricing: quote,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
      });
      message.success({
        content: `Reservation ${reservation.bookingReference} confirmed`,
        duration: 4,
      });
      onReserved?.(reservation);
      onClose();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The reservation could not be completed.';
      setSubmitError(reason);
      message.error({ content: reason, duration: 4 });
    } finally {
      setSubmitting(false);
    }
  }, [
    adults,
    checkIn,
    checkOut,
    children,
    createReservation,
    form,
    infants,
    message,
    onClose,
    onReserved,
    quote,
    room,
    selectedAddons,
    totalNights,
  ]);

  // Responsive panel extent, applied through the wrapper style slot because Ant Design
  // v6 deprecates the `width` prop.
  const width = screens.xl ? 560 : screens.md ? 480 : '100%';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      destroyOnHidden={false}
      title={
        room ? (
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{room.title}</span>
        ) : (
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>Reserve a residence</span>
        )
      }
      styles={{
        wrapper: { width },
        header: { borderBottom: '1px solid var(--resort-border)' },
        body: { padding: 24 },
      }}
      data-testid="booking-drawer"
      extra={
        room ? (
          <LuxuryPriceTag
            amount={room.basePricePerNight}
            size="sm"
            prefix="from"
            unitLabel="night"
          />
        ) : null
      }
    >
      {!room ? (
        <Alert
          type="info"
          showIcon
          title="No residence selected"
          description="Choose a suite from the catalogue to begin a reservation."
        />
      ) : (
        <Form form={form} layout="vertical" requiredMark={false} data-testid="booking-form">
          <Steps
            size="small"
            current={2}
            style={{ marginBottom: 24 }}
            items={[{ title: 'Suite' }, { title: 'Stay & party' }, { title: 'Guest details' }]}
          />

          <SectionHeader level={4} eyebrow="Your stay" title="Dates and party" />

          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            <Form.Item label="Arrival" style={{ marginBottom: 0 }}>
              <DatePicker
                value={checkIn}
                onChange={handleCheckInChange}
                disabledDate={(current) => current < today}
                format="DD MMM YYYY"
                allowClear={false}
                style={{ width: '100%', height: 44 }}
                data-testid="booking-check-in"
              />
            </Form.Item>
            <Form.Item label="Departure" style={{ marginBottom: 0 }}>
              <DatePicker
                value={checkOut}
                onChange={handleCheckOutChange}
                disabledDate={(current) => (checkIn ? current <= checkIn : current < today)}
                format="DD MMM YYYY"
                allowClear={false}
                style={{ width: '100%', height: 44 }}
                data-testid="booking-check-out"
              />
            </Form.Item>

            <div
              style={{
                border: '1px solid var(--resort-border-soft)',
                borderRadius: 'var(--resort-radius)',
                padding: 16,
                display: 'grid',
                gap: 16,
                marginTop: 4,
              }}
            >
              <CounterStepper label="Adults" value={adults} min={1} max={10} testId="booking-adults" onChange={setAdults} />
              <CounterStepper label="Children" value={children} min={0} max={8} testId="booking-children" onChange={setChildren} />
              <CounterStepper label="Infants" value={infants} min={0} max={room.maxOccupancy.infants} testId="booking-infants" onChange={setInfants} />
            </div>
          </div>

          <div style={{ marginTop: 28 }}>
            <SectionHeader level={4} eyebrow="Enhancements" title="Concierge services" />
            <div style={{ marginTop: 14 }}>
              <AddonSelector
                addons={addons}
                selections={selections}
                onChange={handleAddonChange}
                totalNights={totalNights}
                disabled={submitting}
              />
            </div>
          </div>

          <div style={{ marginTop: 28 }}>
            <SectionHeader level={4} eyebrow="Who is staying" title="Guest details" />
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              <Form.Item name="title" label="Salutation" style={{ marginBottom: 0 }}>
                <Select
                  options={[
                    { value: 'Mr', label: 'Mr' },
                    { value: 'Mrs', label: 'Mrs' },
                    { value: 'Ms', label: 'Ms' },
                    { value: 'Dr', label: 'Dr' },
                  ]}
                  data-testid="booking-title"
                />
              </Form.Item>
              <Form.Item name="firstName" label="First name" rules={GUEST_RULES.firstName} style={{ marginBottom: 0 }}>
                <Input data-testid="booking-first-name" autoComplete="given-name" />
              </Form.Item>
              <Form.Item name="lastName" label="Last name" rules={GUEST_RULES.lastName} style={{ marginBottom: 0 }}>
                <Input data-testid="booking-last-name" autoComplete="family-name" />
              </Form.Item>
              <Form.Item name="email" label="Email" rules={GUEST_RULES.email} style={{ marginBottom: 0 }}>
                <Input data-testid="booking-email" autoComplete="email" inputMode="email" />
              </Form.Item>
              <Form.Item name="phone" label="Contact number" rules={GUEST_RULES.phone} style={{ marginBottom: 0 }}>
                <Input data-testid="booking-phone" autoComplete="tel" inputMode="tel" />
              </Form.Item>
              <Form.Item name="estimatedArrivalTime" label="Estimated arrival" style={{ marginBottom: 0 }}>
                <Select
                  data-testid="booking-arrival-time"
                  options={[
                    { value: 'Before 12:00', label: 'Before 12:00' },
                    { value: '12:00 - 16:00', label: '12:00 - 16:00' },
                    { value: '16:00 - 20:00', label: '16:00 - 20:00' },
                    { value: 'After 20:00', label: 'After 20:00' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="specialRequests" label="Special requests" rules={GUEST_RULES.specialRequests} style={{ marginBottom: 0 }}>
                <TextArea rows={3} maxLength={500} showCount data-testid="booking-requests" />
              </Form.Item>
            </div>
          </div>

          {conflictMessage ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 20 }}
              title="Dates unavailable"
              description={conflictMessage}
              data-testid="booking-conflict"
            />
          ) : null}

          {submitError ? (
            <Alert
              type="error"
              showIcon
              style={{ marginTop: 20 }}
              title="Reservation could not be completed"
              description={submitError}
              data-testid="booking-error"
            />
          ) : null}

          <div
            style={{
              marginTop: 24,
              padding: 20,
              border: '1px solid var(--resort-border)',
              borderRadius: 'var(--resort-radius-lg)',
              background: 'var(--resort-linen-soft)',
            }}
          >
            <span className="resort-eyebrow resort-eyebrow--muted">Stay summary</span>
            {quote ? (
              <dl style={{ margin: '14px 0 0', display: 'grid', gap: 8 }}>
                {[
                  [
                    `${quote.weekdayNights} weekday × ${room.basePricePerNight}`,
                    quote.baseRoomSubtotal,
                  ],
                  [
                    `${quote.weekendNights} weekend × ${room.weekendPricePerNight}`,
                    quote.weekendSurchargeSubtotal,
                  ],
                  [`Resort fee · ${quote.totalNights} nights`, quote.resortFeeTotal],
                  ['Cleaning fee', quote.cleaningFee],
                  ...(quote.addonsSubtotal > 0 ? [['Concierge enhancements', quote.addonsSubtotal] as const] : []),
                  ['Luxury resort service charge (10%)', quote.serviceCharge],
                  ['Local hospitality and tourism tax (8%)', quote.occupancyTax],
                ].map(([label, amount]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <dt style={{ color: 'var(--resort-taupe)', fontSize: 13 }}>{label}</dt>
                    <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                      ${amount.toLocaleString('en-US')}
                    </dd>
                  </div>
                ))}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    paddingTop: 12,
                    borderTop: '1px solid var(--resort-border)',
                    marginTop: 4,
                  }}
                >
                  <dt className="resort-eyebrow" style={{ fontSize: 11 }}>
                    Total for {quote.totalNights} {quote.totalNights === 1 ? 'night' : 'nights'}
                  </dt>
                  <dd style={{ margin: 0 }} data-testid="booking-grand-total">
                    <LuxuryPriceTag amount={quote.grandTotal} size="sm" />
                  </dd>
                </div>
              </dl>
            ) : (
              <p style={{ margin: '10px 0 0', color: 'var(--resort-stone)', fontSize: 13 }}>
                Select arrival and departure dates to receive an itemised quote.
              </p>
            )}
          </div>

          <Button
            type="primary"
            block
            size="large"
            disabled={!canSubmit}
            loading={submitting}
            onClick={handleSubmit}
            style={{ marginTop: 20, height: 48 }}
            data-testid="booking-submit"
          >
            Confirm reservation
          </Button>
        </Form>
      )}
    </Drawer>
  );
}