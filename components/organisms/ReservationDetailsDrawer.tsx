'use client';

import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import { Alert, App, Button, Descriptions, Drawer, Popconfirm } from 'antd';
import { AmenityIcon } from '@/components/primitives/AmenityIcon';
import {
  PaymentStatusBadge,
  ReservationStatusBadge,
  ROOM_STATUS_PRESENTATION,
} from '@/components/primitives/StatusBadge';
import type { AddonService, Reservation, Room } from '@/types/booking';

export interface ReservationDetailsDrawerProps {
  /** Drawer visibility. */
  open: boolean;
  /** Itinerary under review; `null` renders the empty state. */
  reservation: Reservation | null;
  /** Suite the itinerary belongs to, used for the residence summary. */
  room: Room | null;
  /** Concierge catalogue, used to label addon lines. */
  addons: AddonService[];
  /** Called when the drawer is dismissed. */
  onClose: () => void;
  /** Marks the guest as checked in. */
  onCheckIn: (reservationId: string) => void;
  /** Marks the stay as complete. */
  onCheckOut: (reservationId: string) => void;
  /** Cancels the itinerary. */
  onCancel: (reservationId: string) => void;
}

/**
 * Formats an ISO date for display, e.g. `Fri 12 Jun 2026`.
 */
function formatStayDate(iso: string): string {
  return dayjs(iso).format('ddd DD MMM YYYY');
}

/**
 * Staff view of a single itinerary.
 *
 * Shows the guest record, the stay window, every addon line as it was priced at
 * booking time, and the itemised balance. The permitted next actions are derived from
 * the current status so a concierge can never advance an itinerary past a valid state.
 */
export function ReservationDetailsDrawer({
  open,
  reservation,
  room,
  addons,
  onClose,
  onCheckIn,
  onCheckOut,
  onCancel,
}: ReservationDetailsDrawerProps) {
  const { message } = App.useApp();

  const addonLines = useMemo(() => {
    if (!reservation) {
      return [];
    }
    return reservation.selectedAddons.map((selection) => {
      const addon = addons.find((candidate) => candidate.id === selection.addonId);
      return {
        id: selection.addonId,
        name: addon?.name ?? selection.addonId,
        quantity: selection.quantity,
        calculatedPrice: selection.calculatedPrice,
        known: Boolean(addon),
      };
    });
  }, [addons, reservation]);

  const canCheckIn = reservation?.status === 'CONFIRMED' || reservation?.status === 'PENDING';
  const canCheckOut = reservation?.status === 'CHECKED_IN';
  const canCancel =
    reservation !== null &&
    reservation !== undefined &&
    reservation.status !== 'CHECKED_OUT' &&
    reservation.status !== 'CANCELLED';

  const handleCheckIn = () => {
    if (!reservation) {
      return;
    }
    onCheckIn(reservation.id);
    message.success({ content: `${reservation.guest.firstName} checked in`, duration: 2 });
  };

  const handleCheckOut = () => {
    if (!reservation) {
      return;
    }
    onCheckOut(reservation.id);
    message.success({ content: 'Stay closed and folio settled', duration: 2 });
  };

  const handleCancel = () => {
    if (!reservation) {
      return;
    }
    onCancel(reservation.id);
    message.warning({ content: 'Reservation cancelled', duration: 3 });
  };

  return (
    /* `width` is deprecated on Ant Design v6 in favour of `size`. */
    <Drawer
      open={open}
      onClose={onClose}
      size="min(520px, 100vw)"
      placement="right"
      title={
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>
          {reservation ? reservation.bookingReference : 'Reservation'}
        </span>
      }
      styles={{ header: { borderBottom: '1px solid var(--resort-border)' }, body: { padding: 24 } }}
      data-testid="reservation-drawer"
    >
      {!reservation ? (
        <Alert
          type="info"
          showIcon
          message="No reservation selected"
          description="Choose an itinerary from the register to review its folio."
        />
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            <ReservationStatusBadge status={reservation.status} />
            <PaymentStatusBadge status={reservation.paymentStatus} />
            {room ? (
              <span className="resort-eyebrow resort-eyebrow--muted" data-testid="reservation-room-status">
                Suite {room.roomNumber} · {ROOM_STATUS_PRESENTATION[room.status].label}
              </span>
            ) : null}
          </div>

          <Descriptions
            column={1}
            size="small"
            bordered
            colon={false}
            items={[
              { key: 'guest', label: 'Guest', children: `${reservation.guest.title} ${reservation.guest.firstName} ${reservation.guest.lastName}` },
              { key: 'email', label: 'Email', children: reservation.guest.email },
              { key: 'phone', label: 'Contact', children: reservation.guest.phone },
              {
                key: 'arrival',
                label: 'Arrival window',
                children: reservation.guest.estimatedArrivalTime ?? 'Not specified',
              },
              {
                key: 'party',
                label: 'Party',
                children: `${reservation.guestCounts.adults} adults · ${reservation.guestCounts.children} children · ${reservation.guestCounts.infants} infants`,
              },
            ]}
          />

          {reservation.guest.specialRequests ? (
            <div
              style={{
                marginTop: 16,
                padding: 14,
                borderLeft: '2px solid var(--resort-bronze)',
                background: 'var(--resort-linen-soft)',
              }}
            >
              <span className="resort-eyebrow resort-eyebrow--muted">Special requests</span>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--resort-taupe)' }}>
                {reservation.guest.specialRequests}
              </p>
            </div>
          ) : null}

          <div style={{ marginTop: 24 }}>
            <span className="resort-eyebrow resort-eyebrow--muted">Stay</span>
            <p style={{ margin: '6px 0 0', fontSize: 15 }} data-testid="reservation-stay">
              {formatStayDate(reservation.checkInDate)} → {formatStayDate(reservation.checkOutDate)} ·{' '}
              {reservation.pricing.totalNights} {reservation.pricing.totalNights === 1 ? 'night' : 'nights'}
            </p>
            {room ? <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--resort-stone)' }}>{room.title}</p> : null}
          </div>

          <div style={{ marginTop: 24 }}>
            <span className="resort-eyebrow resort-eyebrow--muted">Folio</span>
            <dl style={{ margin: '12px 0 0', display: 'grid', gap: 8 }} data-testid="reservation-folio">
              {[
                [`Room · ${reservation.pricing.weekdayNights} weekday night(s)`, reservation.pricing.baseRoomSubtotal],
                [`Room · ${reservation.pricing.weekendNights} weekend night(s)`, reservation.pricing.weekendSurchargeSubtotal],
                [`Resort fee · ${reservation.pricing.totalNights} nights`, reservation.pricing.resortFeeTotal],
                ['Cleaning fee', reservation.pricing.cleaningFee],
                ...addonLines.map((line) => [`${line.name} × ${line.quantity}`, line.calculatedPrice] as const),
                ['Luxury resort service charge (10%)', reservation.pricing.serviceCharge],
                ['Local hospitality and tourism tax (8%)', reservation.pricing.occupancyTax],
              ].map(([label, amount]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <dt style={{ color: 'var(--resort-taupe)', fontSize: 13 }}>{label}</dt>
                  <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                    ${amount.toLocaleString('en-US')}
                  </dd>
                </div>
              ))}
            </dl>

            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid var(--resort-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 12,
              }}
            >
              <span className="resort-eyebrow">Balance due</span>
              <span
                data-testid="reservation-total"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 26,
                  color: 'var(--resort-bronze)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                ${reservation.pricing.grandTotal.toLocaleString('en-US')}
              </span>
            </div>
          </div>

          {addonLines.some((line) => !line.known) ? (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 16 }}
              message="One or more concierge services are no longer offered"
              description="They remain priced at the rate captured when the guest booked."
            />
          ) : null}

          <div
            style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: '1px solid var(--resort-border)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <Button
              type="primary"
              disabled={!canCheckIn}
              onClick={handleCheckIn}
              style={{ minHeight: 44 }}
              data-testid="reservation-check-in"
            >
              Check in
            </Button>
            <Button
              disabled={!canCheckOut}
              onClick={handleCheckOut}
              style={{ minHeight: 44 }}
              data-testid="reservation-check-out"
            >
              Check out
            </Button>
            <Popconfirm
              title="Cancel this reservation?"
              description="The dates will be released back to inventory."
              okText="Cancel reservation"
              cancelText="Keep"
              onConfirm={handleCancel}
              disabled={!canCancel}
            >
              <Button danger disabled={!canCancel} style={{ minHeight: 44 }} data-testid="reservation-cancel">
                Cancel
              </Button>
            </Popconfirm>
          </div>

          <p
            className="resort-eyebrow resort-eyebrow--muted"
            style={{ marginTop: 16, fontSize: 10, letterSpacing: '0.14em' }}
          >
            Booked {dayjs(reservation.createdAt).format('DD MMM YYYY HH:mm')} · updated{' '}
            {dayjs(reservation.updatedAt).format('DD MMM YYYY HH:mm')}
          </p>
        </>
      )}
    </Drawer>
  );
}