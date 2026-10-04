'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Breadcrumb, Button, Carousel, Col, Empty, Grid, Layout, Row, Spin } from 'antd';
import { useInventoryStore } from '@/lib/store/inventoryStore';
import { defaultRooms } from '@/lib/data/seedRooms';
import { defaultAddons } from '@/lib/data/seedAddons';
import { seedInventoryStorage } from '@/lib/utils/storage';
import { checkOccupancyCapacity, checkRoomAvailability } from '@/lib/utils/availability';
import { AmenityIcon } from '@/components/primitives/AmenityIcon';
import { LuxuryPriceTag } from '@/components/primitives/LuxuryPriceTag';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { RoomSpecGrid } from '@/components/molecules/RoomSpecGrid';
import { RoomStatusBadge } from '@/components/primitives/StatusBadge';
import { BookingDrawer } from '@/components/organisms/BookingDrawer';
import { HeaderNavbar } from '@/components/organisms/HeaderNavbar';
import { ROOM_CATEGORY_LABEL } from '@/components/molecules/RoomCard';
import type { Room } from '@/types/booking';

const { Content, Footer } = Layout;

export interface SuiteShowcaseProps {
  /** Slug requested by the route. */
  slug: string;
  /**
   * Server-rendered suite record from the curated seed.
   *
   * Used for the very first paint so the page is meaningful before localStorage has
   * been read; the live catalogue supersedes it as soon as the store rehydrates.
   */
  initialRoom: Room;
}

/**
 * Full suite presentation for a single residence.
 *
 * Desktop keeps a sticky booking rail in the right column; below the tablet breakpoint
 * the same call to action becomes a fixed bottom bar with safe-area compensation, so the
 * reserve action is always within thumb reach on a phone.
 */
export function SuiteShowcase({ slug, initialRoom }: SuiteShowcaseProps) {
  const screens = Grid.useBreakpoint();
  const [hydrated, setHydrated] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  const rooms = useInventoryStore((state) => state.rooms);
  const reservations = useInventoryStore((state) => state.reservations);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    seedInventoryStorage({ rooms: defaultRooms, addons: defaultAddons });
    useInventoryStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  const room = useMemo(() => {
    if (!hydrated) {
      return initialRoom;
    }
    return rooms.find((candidate) => candidate.slug === slug) ?? null;
  }, [hydrated, initialRoom, rooms, slug]);

  const relatedRooms = useMemo(
    () => (room ? rooms.filter((candidate) => candidate.id !== room.id).slice(0, 3) : []),
    [room, rooms],
  );

  const availability = useMemo(() => {
    if (!room) {
      return null;
    }
    return checkRoomAvailability(room, today, today, reservations);
  }, [reservations, room, today]);

  const capacity = useMemo(() => {
    if (!room) {
      return null;
    }
    return checkOccupancyCapacity(room, { adults: 2, children: 0, infants: 0 });
  }, [room]);

  const handleReserve = useCallback(() => setBookingOpen(true), []);

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
          <span className="resort-eyebrow resort-eyebrow--muted">Preparing {initialRoom.title}</span>
        </Content>
      </Layout>
    );
  }

  if (!room) {
    return (
      <Layout style={{ minHeight: '100vh', background: 'var(--resort-sand)' }}>
        <HeaderNavbar />
        <Content style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ marginBottom: 12 }}>This residence is no longer listed</h2>
                <p style={{ marginBottom: 20, color: 'var(--resort-stone)' }}>
                  The suite may have been withdrawn from the catalogue. Our concierge can suggest alternatives.
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

  const bookable = availability?.isAvailable !== false && capacity?.withinCapacity !== false;
  const stackGallery = screens.sm !== true;

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--resort-sand)', paddingBottom: bookable ? 0 : 92 }}>
      <HeaderNavbar />

      <Content style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 72px', width: '100%' }}>
        <Breadcrumb
          className="resort-breadcrumb"
          style={{ marginBottom: 20 }}
          items={[
            { title: <Link href="/">Residences</Link> },
            { title: ROOM_CATEGORY_LABEL[room.category] },
            { title: room.title },
          ]}
        />

        <Row gutter={[32, 32]}>
          <Col xs={24} lg={16}>
            {/*
              Below the `sm` breakpoint the gallery becomes a plain vertical stack. A
              carousel would offer only 3px pagination dots on a phone, which is neither
              a usable touch target nor a useful affordance for a one or two image set.
            */}
            {stackGallery ? (
              <div data-testid="suite-gallery" className="suite-gallery">
                {room.images.map((image) => (
                  <figure key={image.id} style={{ margin: '0 0 12px' }}>
                    <img
                      src={image.url}
                      alt={image.altText}
                      className="room-card-media"
                      style={{ width: '100%' }}
                      data-testid="suite-gallery-image"
                    />
                    <figcaption
                      className="resort-eyebrow resort-eyebrow--muted"
                      style={{ marginTop: 8, textAlign: 'center' }}
                    >
                      {image.caption}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              /*
               * The carousel does not forward unknown props to its root, so the test
               * hook lives on this wrapper.
               */
              <div data-testid="suite-gallery" style={{ marginBottom: 8 }}>
                <Carousel dots autoplay={false} className="suite-gallery">
                  {room.images.map((image) => (
                    <figure key={image.id} style={{ margin: 0 }}>
                      <img
                        src={image.url}
                        alt={image.altText}
                        className="room-card-media"
                        style={{ width: '100%' }}
                        data-testid="suite-gallery-image"
                      />
                      <figcaption
                        className="resort-eyebrow resort-eyebrow--muted"
                        style={{ marginTop: 10, textAlign: 'center' }}
                      >
                        {image.caption}
                      </figcaption>
                    </figure>
                  ))}
                </Carousel>
              </div>
            )}

            <div style={{ marginTop: 32 }}>
              <SectionHeader
                eyebrow={ROOM_CATEGORY_LABEL[room.category]}
                title={room.title}
                description={room.description}
                level={1}
              />

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', margin: '18px 0 24px' }}>
                <RoomStatusBadge status={room.status} />
                <span className="resort-eyebrow resort-eyebrow--muted">Residence {room.roomNumber}</span>
              </div>

              <div style={{ paddingBottom: 28, borderBottom: '1px solid var(--resort-border)' }}>
                <RoomSpecGrid
                  variant="detailed"
                  squareMeters={room.squareMeters}
                  bedConfiguration={room.bedConfiguration}
                  viewType={room.viewType}
                  maxOccupancy={room.maxOccupancy}
                />
              </div>
            </div>

            <section aria-labelledby="amenities-heading" style={{ marginTop: 32 }}>
              <SectionHeader id="amenities-heading" level={2} eyebrow="Signature" title="Amenities" />
              <ul
                style={{
                  listStyle: 'none',
                  margin: '20px 0 0',
                  padding: 0,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 14,
                }}
              >
                {room.amenities.map((amenity) => (
                  <li
                    key={amenity.id}
                    data-testid="amenity-row"
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      padding: 16,
                      border: '1px solid var(--resort-border-soft)',
                      borderRadius: 'var(--resort-radius)',
                      background: 'var(--resort-paper)',
                    }}
                  >
                    <span style={{ color: 'var(--resort-bronze)', marginTop: 2 }}>
                      <AmenityIcon iconKey={amenity.iconKey} size={22} title={amenity.name} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14 }}>{amenity.name}</span>
                      <span
                        style={{ display: 'block', fontSize: 13, color: 'var(--resort-stone)', lineHeight: 1.5 }}
                      >
                        {amenity.description}
                      </span>
                      <span
                        className="resort-eyebrow resort-eyebrow--muted"
                        style={{ display: 'block', marginTop: 6, fontSize: 10 }}
                      >
                        {amenity.category}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {relatedRooms.length > 0 ? (
              <section aria-labelledby="related-heading" style={{ marginTop: 40 }}>
                <SectionHeader id="related-heading" level={2} eyebrow="Also available" title="Other residences" />
                <ul
                  style={{
                    listStyle: 'none',
                    margin: '18px 0 0',
                    padding: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 14,
                  }}
                >
                  {relatedRooms.map((candidate) => (
                    <li key={candidate.id}>
                      <Link
                        href={`/rooms/${candidate.slug}`}
                        style={{
                          display: 'block',
                          border: '1px solid var(--resort-border-soft)',
                          borderRadius: 'var(--resort-radius)',
                          overflow: 'hidden',
                          background: 'var(--resort-paper)',
                        }}
                      >
                        <img
                          src={candidate.images[0]?.url}
                          alt={candidate.images[0]?.altText ?? candidate.title}
                          className="room-card-media"
                          loading="lazy"
                        />
                        <span style={{ display: 'block', padding: 14 }}>
                          <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 18 }}>
                            {candidate.title}
                          </span>
                          <span
                            className="resort-eyebrow resort-eyebrow--muted"
                            style={{ display: 'block', marginTop: 4, fontSize: 10 }}
                          >
                            from ${candidate.basePricePerNight.toLocaleString('en-US')} / night
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </Col>

          <Col xs={24} lg={8}>
            <div style={{ position: 'sticky', top: 96 }} data-testid="booking-rail">
              <div
                style={{
                  border: '1px solid var(--resort-border)',
                  borderRadius: 'var(--resort-radius-lg)',
                  background: 'var(--resort-paper)',
                  padding: 24,
                }}
              >
                <LuxuryPriceTag
                  amount={room.basePricePerNight}
                  size="lg"
                  prefix="from"
                  unitLabel="night"
                  compareAtAmount={room.weekendPricePerNight}
                />
                <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--resort-stone)' }}>
                  Weekend nights are Friday and Saturday. A 10% resort service charge and 8%
                  local hospitality tax are added at checkout.
                </p>

                <dl style={{ margin: '20px 0 0', display: 'grid', gap: 10 }}>
                  {[
                    ['Nightly rate', `$${room.basePricePerNight.toLocaleString('en-US')}`],
                    ['Friday & Saturday', `$${room.weekendPricePerNight.toLocaleString('en-US')}`],
                    ['Resort fee', `$${room.resortFeePerNight.toLocaleString('en-US')} / night`],
                    ['Cleaning fee', `$${room.cleaningFee.toLocaleString('en-US')} once`],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <dt style={{ color: 'var(--resort-taupe)', fontSize: 13 }}>{label}</dt>
                      <dd style={{ margin: 0, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</dd>
                    </div>
                  ))}
                </dl>

                {bookable ? (
                  <Button
                    type="primary"
                    block
                    onClick={handleReserve}
                    style={{ marginTop: 20, height: 48 }}
                    data-testid="suite-reserve"
                  >
                    Reserve this residence
                  </Button>
                ) : (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginTop: 20 }}
                    title="Currently unavailable"
                    description={
                      capacity?.withinCapacity === false
                        ? (capacity.reason ?? 'This suite cannot take the selected party.')
                        : 'This residence is not available for the current stay window.'
                    }
                    data-testid="suite-unavailable"
                  />
                )}

                <p
                  className="resort-eyebrow resort-eyebrow--muted"
                  style={{ marginTop: 16, fontSize: 10, letterSpacing: '0.14em', textAlign: 'center' }}
                >
                  No charge until confirmed
                </p>
              </div>
            </div>
          </Col>
        </Row>
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

      {/* Mobile bottom bar: keeps the reserve action within thumb reach on a phone. */}
      {bookable ? (
        <div className="mobile-sticky-action no-print">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              maxWidth: 1200,
              margin: '0 auto',
            }}
          >
            <LuxuryPriceTag
              amount={room.basePricePerNight}
              size="md"
              prefix="from"
              unitLabel="night"
            />
            <Button
              type="primary"
              onClick={handleReserve}
              style={{ height: 48, minWidth: 160 }}
              data-testid="suite-reserve-mobile"
            >
              Reserve
            </Button>
          </div>
        </div>
      ) : null}

      <BookingDrawer open={bookingOpen} room={room} onClose={() => setBookingOpen(false)} />
    </Layout>
  );
}