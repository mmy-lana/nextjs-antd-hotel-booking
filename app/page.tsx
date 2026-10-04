'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Col, Layout, Row, Spin } from 'antd';
import { useInventoryStore } from '@/lib/store/inventoryStore';
import { useBookingStore } from '@/lib/store/bookingStore';
import { defaultRooms } from '@/lib/data/seedRooms';
import { defaultAddons } from '@/lib/data/seedAddons';
import { seedInventoryStorage } from '@/lib/utils/storage';
import { AmenityIcon } from '@/components/primitives/AmenityIcon';
import { LuxuryPriceTag } from '@/components/primitives/LuxuryPriceTag';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { RoomStatusBadge } from '@/components/primitives/StatusBadge';

const { Header, Content, Footer } = Layout;

/** Human readable label for a suite category slug. */
const CATEGORY_LABEL: Record<string, string> = {
  'cliffside-villa': 'Cliffside Villa',
  'ocean-suite': 'Ocean Suite',
  'garden-pavilion': 'Garden Pavilion',
  'penthouse-residence': 'Penthouse Residence',
};

export default function HomePage() {
  const [hydrated, setHydrated] = useState(false);
  const rooms = useInventoryStore((state) => state.rooms);
  const addons = useInventoryStore((state) => state.addons);
  const selectedCategory = useBookingStore((state) => state.selectedCategory);

  useEffect(() => {
    // `skipHydration` stores require an explicit rehydrate on the client. The seed runs
    // first so a first-time visitor's storage mirrors the curated catalogue exactly.
    seedInventoryStorage({ rooms: defaultRooms, addons: defaultAddons });
    useInventoryStore.persist.rehydrate();
    useBookingStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  const visibleRooms = useMemo(
    () =>
      selectedCategory === 'ALL' ? rooms : rooms.filter((room) => room.category === selectedCategory),
    [rooms, selectedCategory],
  );

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--resort-sand)' }}>
      <Header
        style={{
          height: 'auto',
          lineHeight: 'normal',
          background: 'var(--resort-sand)',
          borderBottom: '1px solid var(--resort-border)',
          padding: '20px 24px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 28, margin: 0, letterSpacing: '0.06em' }}>AURA COVE</h1>
          <span className="resort-eyebrow resort-eyebrow--muted">Boutique Resort &amp; Spa</span>
        </div>
        <Link href="/admin/rooms">
          <Button>Staff Console</Button>
        </Link>
      </Header>

      <Content style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px 64px', width: '100%' }}>
        <SectionHeader
          align="center"
          level={1}
          eyebrow="Architectural Sanctuaries"
          title="Curated Coastal Residences"
          description="Immerse yourself in cliffside seclusion, uninterrupted ocean horizons, and dedicated hospitality rituals."
        />

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
                gap: 24,
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                marginTop: 40,
                paddingBottom: 18,
                borderBottom: '1px solid var(--resort-border)',
              }}
            >
              <span className="resort-eyebrow resort-eyebrow--muted">
                {visibleRooms.length} {visibleRooms.length === 1 ? 'residence' : 'residences'} available
              </span>
              <span className="resort-eyebrow resort-eyebrow--muted">
                {addons.length} concierge services
              </span>
            </div>

            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
              {visibleRooms.map((room) => (
                <Col xs={24} sm={24} md={12} lg={8} key={room.id}>
                  <article
                    style={{
                      background: 'var(--resort-paper)',
                      border: '1px solid var(--resort-border-soft)',
                      borderRadius: 'var(--resort-radius-lg)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      height: '100%',
                    }}
                  >
                    <div style={{ position: 'relative' }}>
                      <img src={room.images[0]?.url} alt={room.images[0]?.altText ?? room.title} className="room-card-media" />
                      <div style={{ position: 'absolute', top: 12, right: 12 }}>
                        <RoomStatusBadge status={room.status} size="sm" />
                      </div>
                    </div>

                    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                      <span className="resort-eyebrow">{CATEGORY_LABEL[room.category]}</span>
                      <h3 style={{ margin: 0 }}>{room.title}</h3>
                      <p style={{ color: 'var(--resort-taupe)', fontSize: 14, minHeight: 44 }}>{room.tagline}</p>

                      <ul
                        style={{
                          listStyle: 'none',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 10,
                          margin: '4px 0 8px',
                        }}
                      >
                        {room.amenities.slice(0, 3).map((amenity) => (
                          <li
                            key={amenity.id}
                            title={amenity.name}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              color: 'var(--resort-stone)',
                              fontSize: 12,
                            }}
                          >
                            <AmenityIcon iconKey={amenity.iconKey} size={16} />
                            {amenity.name}
                          </li>
                        ))}
                      </ul>

                      <div
                        style={{
                          marginTop: 'auto',
                          paddingTop: 16,
                          borderTop: '1px solid var(--resort-border-soft)',
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'flex-end',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <LuxuryPriceTag
                          amount={room.basePricePerNight}
                          prefix="from"
                          unitLabel="night"
                          compareAtAmount={room.weekendPricePerNight}
                          note={`Weekend rate · ${room.squareMeters} m² · ${room.viewType}`}
                        />
                        <Link href={`/rooms/${room.slug}`}>
                          <Button type="primary">Explore Suite</Button>
                        </Link>
                      </div>
                    </div>
                  </article>
                </Col>
              ))}
            </Row>
          </>
        )}
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