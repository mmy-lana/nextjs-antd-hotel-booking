'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Col, Layout, Row, Spin } from 'antd';
import { useInventoryStore } from '@/lib/store/inventoryStore';
import { useBookingStore } from '@/lib/store/bookingStore';
import { defaultRooms } from '@/lib/data/seedRooms';
import { defaultAddons } from '@/lib/data/seedAddons';
import { seedInventoryStorage } from '@/lib/utils/storage';
import { checkOccupancyCapacity, filterAvailableRooms } from '@/lib/utils/availability';
import { HeaderNavbar } from '@/components/organisms/HeaderNavbar';
import { AddonSelector, type AddonSelectionMap } from '@/components/molecules/AddonSelector';
import { DateGuestFilterBar } from '@/components/molecules/DateGuestFilterBar';
import { RoomCard } from '@/components/molecules/RoomCard';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import type { Room } from '@/types/booking';

const { Content, Footer } = Layout;

export default function HomePage() {
  const [hydrated, setHydrated] = useState(false);
  const [conciergeSelections, setConciergeSelections] = useState<AddonSelectionMap>({});
  const rooms = useInventoryStore((state) => state.rooms);
  const reservations = useInventoryStore((state) => state.reservations);
  const addons = useInventoryStore((state) => state.addons);
  const dateRange = useBookingStore((state) => state.dateRange);
  const guests = useBookingStore((state) => state.guests);

  useEffect(() => {
    // `skipHydration` stores need an explicit rehydrate on the client. The curated seed
    // is written first so a first-time visitor's storage mirrors the shipped catalogue.
    seedInventoryStorage({ rooms: defaultRooms, addons: defaultAddons });
    useInventoryStore.persist.rehydrate();
    useBookingStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  /**
   * Applies the active search criteria to the catalogue.
   *
   * A suite stays listed when it cannot take the party or the window; the card then
   * explains why, which keeps the catalogue useful instead of silently dropping options.
   */
  const visibleRooms = useMemo<Array<{ room: Room; unavailableReason: string | null }>>(() => {
    const party = { adults: guests.adults, children: guests.children, infants: 0 };

    // Party size always narrows the catalogue; the calendar only adds a second axis
    // once the guest has actually chosen a window.
    const bookable = new Set(
      (dateRange
        ? filterAvailableRooms(rooms, dateRange[0], dateRange[1], reservations, party)
        : rooms.filter((room) => checkOccupancyCapacity(room, party).withinCapacity)
      ).map((room) => room.id),
    );

    return rooms.map((room) => {
      if (bookable.has(room.id)) {
        return { room, unavailableReason: null };
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

  const bookableCount = visibleRooms.filter((entry) => entry.unavailableReason === null).length;

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

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--resort-sand)' }}>
      <HeaderNavbar />

      <Content style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 72px', width: '100%' }}>
        <SectionHeader
          align="center"
          level={1}
          eyebrow="Architectural Sanctuaries"
          title="Curated Coastal Residences"
          description="Immerse yourself in cliffside seclusion, uninterrupted ocean horizons, and dedicated hospitality rituals."
        />

        <div style={{ marginTop: 32 }}>
          <DateGuestFilterBar />
        </div>

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
                marginTop: 28,
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

            {visibleRooms.length === 0 ? (
              <div
                role="status"
                data-testid="empty-results"
                style={{
                  marginTop: 32,
                  padding: '56px 24px',
                  textAlign: 'center',
                  border: '1px dashed var(--resort-border)',
                  borderRadius: 'var(--resort-radius-lg)',
                  color: 'var(--resort-stone)',
                }}
              >
                <h3 style={{ marginBottom: 10 }}>No sanctuaries found for selected dates</h3>
                <p style={{ marginBottom: 20 }}>
                  Every residence is committed for that window. Adjust your dates or reset the search.
                </p>
              </div>
            ) : (
              <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
                {visibleRooms.map(({ room, unavailableReason }) => (
                  <Col xs={24} md={12} lg={8} key={room.id}>
                    <RoomCard room={room} unavailableReason={unavailableReason} />
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
            totalNights={dateRange ? dayjs(dateRange[1]).diff(dayjs(dateRange[0]), 'day') : 1}
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
    </Layout>
  );
}