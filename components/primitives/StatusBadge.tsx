import { Tag } from 'antd';
import type { ReservationStatus, RoomStatus } from '@/types/booking';

export type StatusTone = 'success' | 'processing' | 'warning' | 'error' | 'info' | 'neutral';

export type StatusBadgeSize = 'sm' | 'md';

export interface StatusBadgeProps {
  /** Human readable label rendered inside the badge. */
  label: string;
  /** Semantic colour family applied to the badge. */
  tone?: StatusTone;
  /** Renders a small filled dot before the label. */
  showDot?: boolean;
  /** Badge scale. `sm` is used inside dense tables. */
  size?: StatusBadgeSize;
  /** Extra class applied to the badge wrapper. */
  className?: string;
}

/** Tone and copy for each operational room status. */
export const ROOM_STATUS_PRESENTATION: Record<RoomStatus, { label: string; tone: StatusTone }> = {
  AVAILABLE: { label: 'Available', tone: 'success' },
  OCCUPIED: { label: 'Occupied', tone: 'processing' },
  RESERVED: { label: 'Reserved', tone: 'warning' },
  MAINTENANCE: { label: 'Maintenance', tone: 'error' },
  CLEANING: { label: 'Cleaning', tone: 'info' },
};

/** Tone and copy for each itinerary status. */
export const RESERVATION_STATUS_PRESENTATION: Record<
  ReservationStatus,
  { label: string; tone: StatusTone }
> = {
  PENDING: { label: 'Pending', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  CHECKED_IN: { label: 'Checked In', tone: 'processing' },
  CHECKED_OUT: { label: 'Checked Out', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'error' },
};

/** Tone and copy for each payment state. */
export const PAYMENT_STATUS_PRESENTATION = {
  PAID: { label: 'Settled', tone: 'success' },
  PENDING: { label: 'Awaiting Settlement', tone: 'warning' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
} as const satisfies Record<string, { label: string; tone: StatusTone }>;

export type PaymentStatusKey = keyof typeof PAYMENT_STATUS_PRESENTATION;

/** Solid swatch colours used for the leading dot, keyed by tone. */
const TONE_DOT_COLOUR: Record<StatusTone, string> = {
  success: '#4E6E58',
  processing: '#8C704B',
  warning: '#B8860B',
  error: '#8A3324',
  info: '#5A6B7C',
  neutral: '#7A6F64',
};

/**
 * Single badge vocabulary shared by the catalogue, the admin table and the itinerary.
 *
 * Ant Design's `Tag` supplies the outline, while the tone drives a muted wash that
 * keeps the palette warm instead of using saturated stock colours.
 */
export function StatusBadge({
  label,
  tone = 'neutral',
  showDot = false,
  size = 'md',
  className,
}: StatusBadgeProps) {
  return (
    <span className={className} data-testid="status-badge" data-tone={tone}>
      <Tag
        bordered
        style={{
          marginInlineEnd: 0,
          borderRadius: 'var(--resort-radius)',
          fontSize: size === 'sm' ? 11 : 12,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 600,
          lineHeight: size === 'sm' ? '18px' : '20px',
          paddingInline: size === 'sm' ? 6 : 8,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {showDot ? (
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: TONE_DOT_COLOUR[tone],
                display: 'inline-block',
              }}
            />
          ) : null}
          {label}
        </span>
      </Tag>
    </span>
  );
}

/** Convenience wrapper that resolves a room status through the shared vocabulary. */
export function RoomStatusBadge({ status, size }: { status: RoomStatus; size?: StatusBadgeSize }) {
  const presentation = ROOM_STATUS_PRESENTATION[status];
  return <StatusBadge label={presentation.label} tone={presentation.tone} showDot size={size} />;
}

/** Convenience wrapper that resolves an itinerary status through the shared vocabulary. */
export function ReservationStatusBadge({
  status,
  size,
}: {
  status: ReservationStatus;
  size?: StatusBadgeSize;
}) {
  const presentation = RESERVATION_STATUS_PRESENTATION[status];
  return <StatusBadge label={presentation.label} tone={presentation.tone} size={size} />;
}

/** Convenience wrapper that resolves a payment state through the shared vocabulary. */
export function PaymentStatusBadge({
  status,
  size,
}: {
  status: keyof typeof PAYMENT_STATUS_PRESENTATION;
  size?: StatusBadgeSize;
}) {
  const presentation = PAYMENT_STATUS_PRESENTATION[status];
  return <StatusBadge label={presentation.label} tone={presentation.tone} size={size} />;
}