import { CompassOutlined, DashboardOutlined, ColumnHeightOutlined, TeamOutlined } from '@ant-design/icons';
import type { Room } from '@/types/booking';

export type RoomSpecGridVariant = 'inline' | 'detailed';

export interface RoomSpecGridProps {
  /** Interior floor area in square metres. */
  squareMeters: number;
  /** Published bed arrangement, e.g. `1 King Bed + 1 Daybed Lounge`. */
  bedConfiguration: string;
  /** Orientation of the principal outlook. */
  viewType: Room['viewType'];
  /** Published occupancy limits for the suite. */
  maxOccupancy: Room['maxOccupancy'];
  /** `inline` is a single wrapped row for catalogue cards; `detailed` is a two-column grid. */
  variant?: RoomSpecGridVariant;
  /** Extra class applied to the wrapper. */
  className?: string;
}

interface SpecEntry {
  key: string;
  label: string;
  value: string;
  icon: React.ReactNode;
}

function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** Renders `2 adults · 1 child · 0 infants`, dropping nothing so limits stay unambiguous. */
function describeOccupancy(maxOccupancy: Room['maxOccupancy']): string {
  return [
    pluralise(maxOccupancy.adults, 'adult'),
    pluralise(maxOccupancy.children, 'child'),
    pluralise(maxOccupancy.infants, 'infant'),
  ].join(' · ');
}

/**
 * Suite specification readout.
 *
 * Rendered as a description list so the room, bed, view and occupancy limits remain
 * machine readable. Every value is visible without hover, pointer or motion.
 */
export function RoomSpecGrid({
  squareMeters,
  bedConfiguration,
  viewType,
  maxOccupancy,
  variant = 'inline',
  className,
}: RoomSpecGridProps) {
  const entries: SpecEntry[] = [
    {
      key: 'area',
      label: 'Interior',
      value: `${squareMeters} m²`,
      icon: <ColumnHeightOutlined aria-hidden />,
    },
    {
      key: 'bed',
      label: 'Bedding',
      value: bedConfiguration,
      icon: <DashboardOutlined aria-hidden />,
    },
    {
      key: 'view',
      label: 'Outlook',
      value: viewType,
      icon: <CompassOutlined aria-hidden />,
    },
    {
      key: 'occupancy',
      label: 'Sleeps',
      value: describeOccupancy(maxOccupancy),
      icon: <TeamOutlined aria-hidden />,
    },
  ];

  const detailed = variant === 'detailed';

  return (
    <dl
      className={className}
      data-testid="room-spec-grid"
      data-variant={variant}
      style={{
        display: 'grid',
        gridTemplateColumns: detailed ? 'repeat(auto-fit, minmax(200px, 1fr))' : '1fr',
        gap: detailed ? 20 : 8,
        margin: 0,
      }}
    >
      {entries.map((entry) => (
        <div
          key={entry.key}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            minWidth: 0,
            ...(detailed
              ? { paddingBottom: 16, borderBottom: '1px solid var(--resort-border-soft)' }
              : {}),
          }}
        >
          <span
            aria-hidden
            style={{
              color: 'var(--resort-bronze)',
              fontSize: detailed ? 17 : 14,
              lineHeight: detailed ? '26px' : '22px',
              flexShrink: 0,
            }}
          >
            {entry.icon}
          </span>
          <div style={{ minWidth: 0 }}>
            <dt
              className="resort-eyebrow resort-eyebrow--muted"
              style={{ fontSize: 10, letterSpacing: '0.16em', marginBottom: 2 }}
            >
              {entry.label}
            </dt>
            <dd
              style={{
                margin: 0,
                fontSize: detailed ? 15 : 13,
                color: 'var(--resort-taupe)',
                lineHeight: 1.45,
              }}
            >
              {entry.value}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}