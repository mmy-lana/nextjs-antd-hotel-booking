'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from 'antd';
import type { Room } from '@/types/booking';
import { AmenityIcon } from '@/components/primitives/AmenityIcon';
import { LuxuryPriceTag } from '@/components/primitives/LuxuryPriceTag';
import { RoomStatusBadge } from '@/components/primitives/StatusBadge';
import { RoomSpecGrid } from '@/components/molecules/RoomSpecGrid';

/** Human readable label for a suite category slug. */
export const ROOM_CATEGORY_LABEL: Record<Room['category'], string> = {
  'cliffside-villa': 'Cliffside Villa',
  'ocean-suite': 'Ocean Suite',
  'garden-pavilion': 'Garden Pavilion',
  'penthouse-residence': 'Penthouse Residence',
};

export interface RoomCardProps {
  /** Suite record to present. */
  room: Room;
  /**
   * Reason the suite is not bookable for the active search window, e.g. an overlapping
   * itinerary or a party larger than the published occupancy. When set, the card renders
   * an inline warning ribbon instead of disappearing from the catalogue.
   */
  unavailableReason?: string | null;
  /**
   * Reserve callback. When supplied the primary call to action becomes a real button
   * (for the booking drawer) instead of a link to the suite page.
   */
  onReserve?: (room: Room) => void;
  /** Label for the reserve button. Defaults to `Reserve`. */
  reserveLabel?: string;
  /** Disables the call to action, e.g. while a quote is recalculating. */
  reserveDisabled?: boolean;
  /** Extra class applied to the card root. */
  className?: string;
}

/** Maximum amenities surfaced on the card; the suite page shows the full inventory. */
const VISIBLE_AMENITIES = 4;

/**
 * Catalogue presentation card.
 *
 * The image is locked to a 4:3 crop, and the rate, outlook, occupancy and amenities are
 * all present in the first paint. Nothing is revealed on hover, so the card reads
 * identically on a touch device and on a pointer device.
 */
export function RoomCard({
  room,
  unavailableReason = null,
  onReserve,
  reserveLabel = 'Reserve',
  reserveDisabled = false,
  className,
}: RoomCardProps) {
  const primaryImage = room.images.find((image) => image.isPrimary) ?? room.images[0];
  const bookable = !unavailableReason;

  return (
    <article
      className={className}
      data-testid="room-card"
      data-room-number={room.roomNumber}
      data-bookable={bookable ? 'true' : 'false'}
      style={{
        background: 'var(--resort-paper)',
        border: '1px solid var(--resort-border-soft)',
        borderRadius: 'var(--resort-radius-lg)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        opacity: bookable ? 1 : 0.92,
      }}
    >
      <div style={{ position: 'relative' }}>
        <img
          src={primaryImage?.url}
          alt={primaryImage?.altText ?? `${room.title} suite`}
          className="room-card-media"
          loading="lazy"
          decoding="async"
        />
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span
            className="resort-eyebrow"
            style={{
              background: 'rgba(252, 250, 248, 0.94)',
              border: '1px solid var(--resort-border)',
              borderRadius: 'var(--resort-radius)',
              padding: '4px 9px',
              fontSize: 10,
            }}
          >
            {ROOM_CATEGORY_LABEL[room.category]}
          </span>
          <RoomStatusBadge status={room.status} size="sm" />
        </div>
      </div>

      <div
        style={{
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          flex: 1,
        }}
      >
        <div>
          <span className="resort-eyebrow resort-eyebrow--muted">Residence {room.roomNumber}</span>
          <h3 style={{ margin: '4px 0 0' }}>
            <Link
              href={`/rooms/${room.slug}`}
              data-testid="room-card-link"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                paddingBlock: 6,
              }}
            >
              {room.title}
            </Link>
          </h3>
        </div>

        <p style={{ color: 'var(--resort-taupe)', fontSize: 14, lineHeight: 1.6 }}>{room.tagline}</p>

        <RoomSpecGrid
          variant="inline"
          squareMeters={room.squareMeters}
          bedConfiguration={room.bedConfiguration}
          viewType={room.viewType}
          maxOccupancy={room.maxOccupancy}
        />

        <ul
          aria-label="Signature amenities"
          style={{
            listStyle: 'none',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            margin: '2px 0 0',
            padding: 0,
          }}
        >
          {room.amenities.slice(0, VISIBLE_AMENITIES).map((amenity) => (
            <li
              key={amenity.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid var(--resort-border-soft)',
                borderRadius: 'var(--resort-radius)',
                padding: '5px 9px',
                fontSize: 12,
                color: 'var(--resort-stone)',
                background: 'var(--resort-linen-soft)',
              }}
            >
              <AmenityIcon iconKey={amenity.iconKey} size={15} />
              {amenity.name}
            </li>
          ))}
          {room.amenities.length > VISIBLE_AMENITIES ? (
            <li
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                border: '1px solid var(--resort-border-soft)',
                borderRadius: 'var(--resort-radius)',
                padding: '5px 9px',
                fontSize: 12,
                color: 'var(--resort-mist)',
                background: 'var(--resort-linen-soft)',
              }}
            >
              +{room.amenities.length - VISIBLE_AMENITIES} more
            </li>
          ) : null}
        </ul>

        {unavailableReason ? (
          <p
            role="status"
            data-testid="room-card-warning"
            style={{
              margin: 0,
              borderLeft: '2px solid var(--resort-goldenrod)',
              background: 'var(--resort-linen-soft)',
              padding: '8px 12px',
              fontSize: 13,
              color: 'var(--resort-taupe)',
            }}
          >
            {unavailableReason}
          </p>
        ) : null}

        <div
          style={{
            marginTop: 'auto',
            paddingTop: 16,
            borderTop: '1px solid var(--resort-border-soft)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 14,
          }}
        >
          <LuxuryPriceTag
            amount={room.basePricePerNight}
            prefix="from"
            unitLabel="night"
            compareAtAmount={room.weekendPricePerNight}
            note={`Weekend rate · resort fee ${room.resortFeePerNight}/night`}
          />

          {onReserve ? (
            <Button
              type="primary"
              disabled={reserveDisabled || !bookable}
              onClick={() => onReserve(room)}
              data-testid="room-card-reserve"
              style={{ minHeight: 44 }}
            >
              {reserveLabel}
            </Button>
          ) : (
            <Link href={`/rooms/${room.slug}`}>
              <Button style={{ minHeight: 44 }}>Explore Suite</Button>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}