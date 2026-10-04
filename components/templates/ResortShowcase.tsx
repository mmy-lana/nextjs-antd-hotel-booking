'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { Button, Col, Empty, Layout, Row, Spin } from 'antd';
import { useInventoryStore } from '@/lib/store/inventoryStore';
import { useBookingStore } from '@/lib/store/bookingStore';
import { defaultRooms } from '@/lib/data/seedRooms';
import { defaultAddons } from '@/lib/data/seedAddons';
import { seedInventoryStorage } from '@/lib/utils/storage';
import { checkOccupancyCapacity, checkRoomAvailability } from '@/lib/utils/availability';
import { HeaderNavbar } from '@/components/organisms/HeaderNavbar';
import { AddonSelector, type AddonSelectionMap } from '@/components/molecules/AddonSelector';
import { DateGuestFilterBar } from '@/components/molecules/DateGuestFilterBar';
import { RoomCard } from '@/components/molecules/RoomCard';
import { BookingDrawer } from '@/components/organisms/BookingDrawer';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import type { Room } from '@/types/booking';

const { Content, Footer } = Layout;

/** One catalogue entry together with the reason it cannot be booked, if any. */
interface CatalogueEntry {
  room: Room;
  unavailableReason: string | null;
}

/**
 * Guest-facing catalogue: hero, live search, room grid and the booking drawer.
 *
 * Availability is evaluated on every render from the persisted stores, so a window the
 * concierge has just sold disappears from the results immediately. Suites that cannot
 * take the party or the window stay listed with an explanation rather than vanishing,
 * which keeps the catalogue informative instead of mysteriously short.
 */
export function ResortShowcase() {
  const [hydrated, setHydrated] = useState(false);
  const [conciergeSelections, setConciergeSelections] = useState<AddonSelectionMap>({});
  const [bookingRoom, setBookingRoom] = useState<Room | null>(null);

  const rooms = useInventoryStore((state) => state.rooms);
  const reservations = useInventoryStore((state) => state.reservations);
  const addons = useInventoryStore((state) => state.addons);
  const dateRange = useBookingStore((state) => state.dateRange);
  const guests = useBookingStore((state) => state.guests);
  const resetFilters = useBookingStore((state) => state.resetFilters);

  useEffect(() => {
    // `skipHydration` stores need an explicit rehydrate on the client. The curated seed
    // is written first so a first-time visitor's storage mirrors the shipped catalogue.
    seedInventoryStorage({ rooms: defaultRooms, addons: defaultAddons });
    useInventoryStore.persist.rehydrate();
    useBookingStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  const catalogue = useMemo<CatalogueEntry[]>(() => {
    const party = { adults: guests.adults, children: guests.children, infants: 0 };

    // A suite withdrawn for maintenance or housekeeping is never bookable; party size
    // always narrows the catalogue; the calendar adds a second axis once chosen.
    const bookable = new Set(
      rooms
        .filter((room) => room.status !== 'MAINTENANCE' && room.status !== 'CLEANING')
        .filter((room) => checkOccupancyCapacity(room, party).withinCapacity)
        .filter((room) =>
          dateRange
            ? checkRoomAvailability(room, dateRange[0], dateRange[1], reservations).isAvailable
            : true,
        )
        .map((room) => room.id),
    );

    return rooms.map((room) => {
      if (bookable.has(room.id)) {
        return { room, unavailableReason: null };
      }
      if (room.status === 'MAINTENANCE') {
        return { room, unavailableReason: 'Withdrawn for maintenance' };
      }
      if (room.status === 'CLEANING') {
        return { room, unavailableReason: 'Housekeeping in progress' };
      }
      const capacity = checkOccupancyCapacity(room, party);
      return {
        room,
        unavailableReason: capacity.withinCapacity
          ? 'Unavailable for the selected dates'
          : (capacity.reason ?? 'Unavailable for the selected dates'),
      };
    });
  }, [dateRange, guests.adults, guests.children, reservations, rooms]);

  const bookableCount = catalogue.filter((entry) => entry.unavailableReason === null).length;
  const stayNights = dateRange
    ? Math.max(1, dayjs(dateRange[1]).diff(dayjs(dateRange[0]), 'day'))
    : 1;

  const handleConciergeChange = useCallback((addonId: string, quantity: number) => {
    setConciergeSelections((current) => {
      const next = { ...current };
      if (quantity <= 0) {
        delete next[addonId];
      } else {
        next[addonId] = quantity;
      }
      return next;
    });
  }, []);

  // Client-side transition keeps the SPA shell and the in-memory inventory alive
  // across checkout, instead of forcing a full document reload.
  const router = useRouter();

  const handleReserved = useCallback(
    (reservation: { bookingReference: string }) => {
      router.push(`/booking/confirmation/${reservation.bookingReference}`);
    },
    [router],
  );

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--resort-sand)' }}>
      <HeaderNavbar />

      <Content style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 24px', width: '100%' }}>
        <section
          aria-labelledby="showcase-heading"
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 'var(--resort-radius-lg)',
            border: '1px solid var(--resort-border)',
            background: 'linear-gradient(140deg, #F3EFE9 0%, #FAF8F5 55%, #EFEAE1 100%)',
            padding: '40px 24px',
          }}
        >
          <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
            <SectionHeader
              id="showcase-heading"
              level={1}
              align="center"
              eyebrow="Architectural Sanctuaries"
              title="Curated Coastal Residences"
              description="Immerse yourself in cliffside seclusion, uninterrupted ocean horizons, and dedicated hospitality rituals. Every residence is inspected nightly by our housekeeping atelier."
            />
            <dl
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 28,
                marginTop: 26,
              }}
            >
              {[
                { label: 'Residences', value: String(rooms.length || defaultRooms.length) },
                { label: 'Concierge services', value: String(addons.length || defaultAddons.length) },
                { label: 'Vantage points', value: String(new Set(rooms.map((room) => room.viewType)).size) },
              ].map((stat) => (
                <div key={stat.label} style={{ textAlign: 'center' }}>
                  <dt className="resort-eyebrow resort-eyebrow--muted" style={{ fontSize: 10 }}>
                    {stat.label}
                  </dt>
                  <dd
                    className="resort-display"
                    style={{ fontSize: 30, color: 'var(--resort-bronze)', margin: 0 }}
                  >
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <div style={{ marginTop: 24 }}>
          <DateGuestFilterBar />
        </div>
      </Content>

      <Content style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 40px', width: '100%' }}>
        {!hydrated ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              padding: '96px 0',
            }}
          >
            <Spin />
            <span className="resort-eyebrow resort-eyebrow--muted">Opening the sanctuary inventory</span>
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 16,
                borderBottom: '1px solid var(--resort-border)',
              }}
            >
              <span className="resort-eyebrow resort-eyebrow--muted" data-testid="result-count">
                {bookableCount} of {rooms.length} residences available
              </span>
              <span className="resort-eyebrow resort-eyebrow--muted">
                {addons.length} concierge services
              </span>
            </div>

            {bookableCount === 0 ? (
              <div data-testid="empty-results" style={{ marginTop: 32 }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <div style={{ textAlign: 'center' }}>
                      <h3 style={{ marginBottom: 10 }}>No sanctuaries found for selected dates</h3>
                      <p style={{ marginBottom: 20, color: 'var(--resort-stone)' }}>
                        {catalogue.length === 0
                          ? 'The catalogue is empty. Add a residence from the staff console to begin.'
                          : 'No residence can take that party or window. Adjust your dates or reset the search.'}
                      </p>
                      <Button type="primary" onClick={resetFilters} data-testid="empty-reset" style={{ height: 44 }}>
                        Reset search
                      </Button>
                    </div>
                  }
                />
              </div>
            ) : (
              <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
                {catalogue.map(({ room, unavailableReason }) => (
                  <Col xs={24} md={12} lg={8} key={room.id}>
                    <RoomCard
                      room={room}
                      unavailableReason={unavailableReason}
                      onReserve={setBookingRoom}
                      reserveDisabled={unavailableReason !== null}
                    />
                  </Col>
                ))}
              </Row>
            )}
          </>
        )}
      </Content>

      <Content
        style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 72px', width: '100%' }}
      >
        <section aria-labelledby="concierge-heading">
          <SectionHeader
            id="concierge-heading"
            level={2}
            eyebrow="Resort Services"
            title="Concierge Enhancements"
            description="Selected services are carried into your reservation at checkout. Per-night services are quoted against the length of your stay."
          />
          <div style={{ marginTop: 24 }}>
            <AddonSelector
              addons={addons}
              selections={conciergeSelections}
              onChange={handleConciergeChange}
              totalNights={stayNights}
            />
          </div>
        </section>
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
          Aura Cove Sanctuary Resort &amp; Spa — est. 2026
        </span>
      </Footer>

      <BookingDrawer
        open={bookingRoom !== null}
        room={bookingRoom}
        onClose={() => setBookingRoom(null)}
        onReserved={handleReserved}
      />
    </Layout>
  );
}