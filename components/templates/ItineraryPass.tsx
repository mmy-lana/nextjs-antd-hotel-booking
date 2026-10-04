'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { Alert, Button, Empty, Layout, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { useInventoryStore } from '@/lib/store/inventoryStore';
import { defaultRooms } from '@/lib/data/seedRooms';
import { defaultAddons } from '@/lib/data/seedAddons';
import { seedInventoryStorage, deriveGuestId } from '@/lib/utils/storage';
import { HeaderNavbar } from '@/components/organisms/HeaderNavbar';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { PaymentStatusBadge, ReservationStatusBadge } from '@/components/primitives/StatusBadge';
import { AmenityIcon } from '@/components/primitives/AmenityIcon';
import type { Reservation, Room } from '@/types/booking';

const { Content, Footer } = Layout;

export interface ItineraryPassProps {
  /** Booking reference taken from the route, e.g. `RES-1A2B3C4D5E`. */
  reference: string;
}

/** House rules shown on every itinerary so a guest knows what to expect on arrival. */
const ARRIVAL_NOTES = [
  {
    title: 'Arrival',
    body: 'Reception is staffed from 07:00. Suites are released from 15:00; early arrival is arranged on request.',
  },
  {
    title: 'Transfer',
    body: 'Tell us your flight number at least 24 hours ahead and the house car will meet you arrivals.',
  },
  {
    title: 'Residence',
    body: 'Your suite key and a handwritten amenity card are left at the residence door on the morning of arrival.',
  },
  {
    title: 'Departure',
    body: 'Check-out is 11:00. A same-day late departure is complimentary when the residence allows.',
  },
];

/**
 * Printable itinerary voucher for a completed reservation.
 *
 * The folio keeps the luxury resort service charge and the local hospitality tax on
 * separate lines, and the whole pass is designed to survive `window.print()` with the
 * navigation and action bar removed.
 */
export function ItineraryPass({ reference }: ItineraryPassProps) {
  const [hydrated, setHydrated] = useState(false);
  const rooms = useInventoryStore((state) => state.rooms);
  const reservations = useInventoryStore((state) => state.reservations);
  const addons = useInventoryStore((state) => state.addons);

  useEffect(() => {
    seedInventoryStorage({ rooms: defaultRooms, addons: defaultAddons });
    useInventoryStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  const reservation = useMemo<Reservation | null>(() => {
    if (!hydrated) {
      return null;
    }
    const normalised = reference.trim().toUpperCase();
    return (
      reservations.find((entry) => entry.bookingReference.toUpperCase() === normalised) ?? null
    );
  }, [hydrated, reference, reservations]);

  const room: Room | null = useMemo(() => {
    if (!reservation) {
      return null;
    }
    return rooms.find((entry) => entry.id === reservation.roomId) ?? null;
  }, [reservation, rooms]);

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
        price: selection.calculatedPrice,
      };
    });
  }, [addons, reservation]);

  const returningGuest = useMemo(
    () =>
      reservations.filter(
        (entry) => entry.guest.guestId && entry.guest.guestId === reservation?.guest.guestId,
      ).length,
    [reservation, reservations],
  );

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (!hydrated) {
    return (
      <Layout style={{ minHeight: '100vh', background: 'var(--resort-sand)' }}>
        <HeaderNavbar />
        <Content
          role="status"
          aria-live="polite"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '120px 24px' }}
        >
          <Spin />
          <span className="resort-eyebrow resort-eyebrow--muted">Retrieving your itinerary</span>
        </Content>
      </Layout>
    );
  }

  if (!reservation) {
    return (
      <Layout style={{ minHeight: '100vh', background: 'var(--resort-sand)' }}>
        <HeaderNavbar />
        <Content style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ marginBottom: 12 }}>Itinerary not found on this device</h2>
                <p style={{ marginBottom: 8, color: 'var(--resort-stone)' }}>
                  Reference {reference} was not found in this browser. Itineraries are stored on the
                  device used to book.
                </p>
                <p style={{ marginBottom: 20, color: 'var(--resort-stone)' }}>
                  Please contact the concierge desk and we will resend your voucher.
                </p>
                <Link href="/">
                  <Button type="primary" style={{ height: 44 }}>
                    Return to the catalogue
                  </Button>
                </Link>
              </div>
            }
          />
        </Content>
      </Layout>
    );
  }

  const folioLines: Array<[string, number]> = [
    [`Nightly rate · ${reservation.pricing.weekdayNights} weekday night(s)`, reservation.pricing.baseRoomSubtotal],
    [`Weekend rate · ${reservation.pricing.weekendNights} weekend night(s)`, reservation.pricing.weekendSurchargeSubtotal],
    [`Resort fee · ${reservation.pricing.totalNights} nights`, reservation.pricing.resortFeeTotal],
    ['Cleaning fee', reservation.pricing.cleaningFee],
    ...addonLines.map((line): [string, number] => [`${line.name} × ${line.quantity}`, line.price]),
    ['Luxury resort service charge (10%)', reservation.pricing.serviceCharge],
    ['Local hospitality and tourism tax (8%)', reservation.pricing.occupancyTax],
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--resort-sand)' }}>
      <HeaderNavbar />

      <Content style={{ maxWidth: 880, margin: '0 auto', padding: '32px 24px 72px', width: '100%' }}>
        <article className="itinerary-pass" data-testid="itinerary-pass">
          <header
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              paddingBottom: 24,
              borderBottom: '1px solid var(--resort-border)',
            }}
          >
            <div>
              <p className="resort-eyebrow" style={{ marginBottom: 8 }}>
                Aura Cove Sanctuary
              </p>
              <h1 style={{ margin: 0 }}>Your itinerary</h1>
              <p style={{ margin: '10px 0 0', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em' }}>
                {reservation.bookingReference}
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <ReservationStatusBadge status={reservation.status} />
              <PaymentStatusBadge status={reservation.paymentStatus} />
            </div>
          </header>

          <section style={{ padding: '24px 0', borderBottom: '1px solid var(--resort-border)' }}>
            <SectionHeader level={4} eyebrow="Guest" title={`${reservation.guest.title} ${reservation.guest.firstName} ${reservation.guest.lastName}`} />
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
                marginTop: 16,
              }}
            >
              {[
                ['Email', reservation.guest.email],
                ['Contact', reservation.guest.phone],
                ['Arrival window', reservation.guest.estimatedArrivalTime ?? 'Not specified'],
                [
                  'Party',
                  `${reservation.guestCounts.adults} adults · ${reservation.guestCounts.children} children · ${reservation.guestCounts.infants} infants`,
                ],
                ['Guest reference', reservation.guest.guestId ?? deriveGuestId(reservation.guest.email)],
                [
                  'Booked',
                  dayjs(reservation.createdAt).format('DD MMM YYYY HH:mm'),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="resort-eyebrow resort-eyebrow--muted" style={{ fontSize: 10 }}>
                    {label}
                  </dt>
                  <dd style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--resort-taupe)' }}>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section style={{ padding: '24px 0', borderBottom: '1px solid var(--resort-border)' }}>
            <SectionHeader level={4} eyebrow="Stay" title={room?.title ?? 'Residence'} />
            <p style={{ margin: '12px 0 0', fontSize: 15 }} data-testid="itinerary-stay">
              {dayjs(reservation.checkInDate).format('dddd DD MMMM YYYY')} →{' '}
              {dayjs(reservation.checkOutDate).format('dddd DD MMMM YYYY')} ·{' '}
              {reservation.pricing.totalNights} {reservation.pricing.totalNights === 1 ? 'night' : 'nights'}
            </p>
            {room ? (
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--resort-stone)' }}>
                Residence {room.roomNumber} · {room.viewType} · {room.squareMeters} m²
              </p>
            ) : null}
          </section>

          <section style={{ padding: '24px 0', borderBottom: '1px solid var(--resort-border)' }}>
            <SectionHeader level={4} eyebrow="Receipt" title="Your folio" />
            <dl style={{ margin: '16px 0 0', display: 'grid', gap: 10 }} data-testid="itinerary-folio">
              {folioLines.map(([label, amount]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <dt style={{ color: 'var(--resort-taupe)', fontSize: 14 }}>{label}</dt>
                  <dd style={{ margin: 0, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                    ${amount.toLocaleString('en-US')}
                  </dd>
                </div>
              ))}
            </dl>

            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid var(--resort-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 16,
              }}
            >
              <span className="resort-eyebrow">Total paid</span>
              <span
                data-testid="itinerary-total"
                className="resort-display"
                style={{ fontSize: 32, color: 'var(--resort-bronze)', fontVariantNumeric: 'tabular-nums' }}
              >
                ${reservation.pricing.grandTotal.toLocaleString('en-US')}
              </span>
            </div>
          </section>

          <section style={{ padding: '24px 0', borderBottom: '1px solid var(--resort-border)' }}>
            <SectionHeader level={4} eyebrow="Before you arrive" title="House notes" />
            <ul
              style={{
                listStyle: 'none',
                margin: '16px 0 0',
                padding: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              {ARRIVAL_NOTES.map((note) => (
                <li key={note.title}>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: 'var(--resort-bronze)',
                    }}
                  >
                    <AmenityIcon iconKey="key" size={16} />
                    <span className="resort-eyebrow">{note.title}</span>
                  </span>
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--resort-taupe)', lineHeight: 1.6 }}>
                    {note.body}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {reservation.guest.specialRequests ? (
            <section style={{ padding: '24px 0' }}>
              <span className="resort-eyebrow">Your requests</span>
              <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--resort-taupe)' }}>
                {reservation.guest.specialRequests}
              </p>
            </section>
          ) : null}

          <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
            <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint} style={{ height: 44 }} data-testid="print-itinerary">
              Print this itinerary
            </Button>
            <Link href="/">
              <Button style={{ height: 44 }}>Return to the catalogue</Button>
            </Link>
          </div>

          {returningGuest > 1 ? (
            <Alert
              type="success"
              showIcon
              style={{ marginTop: 20 }}
              title="We have your preferences on file"
              description="Our concierge will apply them to this and any future stay."
            />
          ) : null}
        </article>
      </Content>

      <Footer
        style={{
          textAlign: 'center',
          background: 'var(--resort-linen)',
          borderTop: '1px solid var(--resort-border)',
          padding: 24,
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--resort-stone)' }}>
          Aura Cove Sanctuary Resort &amp; Spa — concierge desk available 24 hours
        </span>
      </Footer>
    </Layout>
  );
}