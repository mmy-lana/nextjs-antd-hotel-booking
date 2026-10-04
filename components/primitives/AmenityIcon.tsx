import type { CSSProperties } from 'react';

/** A single stroke-only glyph drawn on a 24x24 grid. */
interface AmenityGlyph {
  /** Stroke-only paths. */
  readonly paths: readonly string[];
  /** Optional filled paths layered over the strokes. */
  readonly fills?: readonly string[];
}

const GLYPHS: Readonly<Record<string, AmenityGlyph>> = {
  pool: {
    paths: [
      'M3 15.5c1.8-1.6 3.6-1.6 5.4 0s3.6 1.6 5.4 0 3.6-1.6 5.4 0',
      'M3 19c1.8-1.6 3.6-1.6 5.4 0s3.6 1.6 5.4 0 3.6-1.6 5.4 0',
      'M8.5 3v12.5',
      'M13.5 3v12.5',
      'M8.5 7h5',
      'M8.5 11h5',
    ],
  },
  ocean: {
    paths: [
      'M3 7.5c1.8-1.6 3.6-1.6 5.4 0s3.6 1.6 5.4 0 3.6-1.6 5.4 0',
      'M3 12c1.8-1.6 3.6-1.6 5.4 0s3.6 1.6 5.4 0 3.6-1.6 5.4 0',
      'M3 16.5c1.8-1.6 3.6-1.6 5.4 0s3.6 1.6 5.4 0 3.6-1.6 5.4 0',
    ],
  },
  concierge: {
    paths: [
      'M5 16.5a7 7 0 0 1 14 0',
      'M3 16.5h18',
      'M3 16.5V19h18v-2.5',
      'M12 9.5V7.5',
    ],
    fills: ['M12 4.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z'],
  },
  wine: {
    paths: [
      'M8 3.5h8c0 3.9-1.8 6.5-4 6.5s-4-2.6-4-6.5Z',
      'M12 10v8',
      'M8.4 20.5h7.2',
      'M8.8 5.6h6.4',
    ],
  },
  bath: {
    paths: [
      'M3 11.5h18v3.2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3.2Z',
      'M6.5 11.5V8a2 2 0 0 1 2-2h2.2',
      'M11 4.2 9.2 6',
    ],
  },
  eye: {
    paths: ['M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z'],
    fills: ['M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z'],
  },
  coffee: {
    paths: [
      'M4 8.5h12V14a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8.5Z',
      'M16 10.2h2.3a2.2 2.2 0 0 1 0 4.4H16',
      'M3 21h14.5',
      'M8.5 3.2c-.9 1.1-.9 2.2 0 3.3',
      'M12.5 3.2c-.9 1.1-.9 2.2 0 3.3',
    ],
  },
  fire: {
    paths: [
      'M12 2.8s5.2 4.4 5.2 8.9a5.2 5.2 0 0 1-10.4 0c0-2 1-3.6 1-3.6s.5 2.1 1.7 2.8c1-2 2.5-4.4 2.5-8.1Z',
      'M12 20.2a2.7 2.7 0 0 0 2.7-2.7c0-1.8-2.7-3.6-2.7-3.6s-2.7 1.8-2.7 3.6a2.7 2.7 0 0 0 2.7 2.7Z',
    ],
  },
  lotus: {
    paths: [
      'M12 3.5c2.3 2.3 3.4 4.8 3.4 7.5 0 2.4-1.5 4.5-3.4 5.5-1.9-1-3.4-3.1-3.4-5.5 0-2.7 1.1-5.2 3.4-7.5Z',
      'M3.5 11c2.7-.6 4.8 0 6.2 1.5',
      'M20.5 11c-2.7-.6-4.8 0-6.2 1.5',
      'M5 17.2c2.2 1.7 4.5 2.5 7 2.5s4.8-.8 7-2.5',
    ],
  },
  kitchen: {
    paths: [
      'M4 10.5h16V15a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4.5Z',
      'M3.2 10.5h17.6',
      'M12 10.5V7.8',
    ],
    fills: ['M12 4.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z'],
  },
  key: {
    paths: ['M8.6 15.4a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8Z', 'M12.5 11.5H21', 'M17.4 11.5v3.2', 'M20 11.5v2.2'],
  },
  /** Geometric fallback for amenity records authored without a known icon key. */
  terrace: {
    paths: ['M12 2.8 19.4 12 12 21.2 4.6 12 12 2.8Z', 'M12 7.6 15.6 12 12 16.4 8.4 12 12 7.6Z'],
  },
};

/** Every icon key this component can draw. */
export type AmenityIconKey = keyof typeof GLYPHS | string;

export interface AmenityIconProps {
  /** Icon key from the amenity record, e.g. `pool`, `concierge`, `wine`. */
  iconKey: AmenityIconKey;
  /** Rendered edge length in CSS pixels. */
  size?: number;
  /** Stroke and fill colour; inherits the surrounding text colour by default. */
  color?: string;
  /** Stroke weight at the 24px grid; scaled proportionally for other sizes. */
  strokeWidth?: number;
  /** Accessible name. When omitted the glyph is hidden from assistive technology. */
  title?: string;
  /** Extra class applied to the `<svg>` element. */
  className?: string;
  /** Inline style escape hatch. */
  style?: CSSProperties;
}

/** The glyph used when an icon key is unknown. */
export const FALLBACK_ICON_KEY = 'terrace';

/**
 * Stroke-only resort amenity icon set.
 *
 * Every glyph is hand-drawn on the same 24x24 grid with a shared stroke weight so a
 * row of amenities reads as one family. Icons are decorative by default (`aria-hidden`)
 * and only announced when the caller supplies a `title`, which keeps amenity lists from
 * being read twice by a screen reader.
 */
export function AmenityIcon({
  iconKey,
  size = 22,
  color = 'currentColor',
  strokeWidth = 1.4,
  title,
  className,
  style,
}: AmenityIconProps) {
  const glyph = GLYPHS[iconKey] ?? GLYPHS[FALLBACK_ICON_KEY];
  const resolvedStrokeWidth = Number(((strokeWidth / 24) * size).toFixed(3));

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      className={className}
      style={{ flexShrink: 0, display: 'block', color, ...style }}
      data-icon={iconKey in GLYPHS ? iconKey : FALLBACK_ICON_KEY}
      data-testid="amenity-icon"
    >
      {title ? <title>{title}</title> : null}
      {glyph.paths.map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth={resolvedStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {glyph.fills?.map((d) => (
        <path key={d} d={d} fill="currentColor" stroke="none" />
      ))}
    </svg>
  );
}