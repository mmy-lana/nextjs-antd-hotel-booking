import type { CSSProperties } from 'react';

export type LuxuryPriceTagSize = 'sm' | 'md' | 'lg';

export interface LuxuryPriceTagProps {
  /** Monetary amount in the major unit of `currency` (e.g. 1250 renders as `$1,250`). */
  amount: number;
  /** ISO currency code. The resort is single-currency today but the prop keeps receipts explicit. */
  currency?: 'USD';
  /** Unit suffix shown after the amount, e.g. `night` or `stay`. Rendered only when provided. */
  unitLabel?: string | null;
  /** Visual weight. `lg` is used for the room detail headline rate. */
  size?: LuxuryPriceTagSize;
  /** Optional struck-through comparison rate, typically the base weekday rate beside a weekend rate. */
  compareAtAmount?: number | null;
  /** Text placed before the amount, e.g. `from`. */
  prefix?: string | null;
  /** Optional explanatory line rendered beneath the amount. */
  note?: string | null;
  /** Extra class applied to the wrapper element. */
  className?: string;
  /** Inline style escape hatch for layout contexts. */
  style?: CSSProperties;
}

const SIZE_SCALE: Record<LuxuryPriceTagSize, { amount: number; unit: number; note: number }> = {
  sm: { amount: 17, unit: 12, note: 12 },
  md: { amount: 24, unit: 13, note: 13 },
  lg: { amount: 38, unit: 15, note: 13 },
};

/**
 * Formats a monetary amount with a thousands separator and no fractional digits.
 *
 * Falls back to a plain `$` prefixed integer if the runtime rejects the currency
 * formatting options, so a receipt never renders `NaN` to a guest.
 */
function formatAmount(amount: number, currency: 'USD'): string {
  if (!Number.isFinite(amount)) {
    return '$0';
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
  }
}

/**
 * Editorial price element.
 *
 * Renders the nightly rate in the display serif with a light sans-serif unit label,
 * and can show a struck-through comparison rate so a weekend premium is legible at a glance.
 * Pricing is never revealed on hover — it is present in the markup on first paint.
 */
export function LuxuryPriceTag({
  amount,
  currency = 'USD',
  unitLabel = null,
  size = 'md',
  compareAtAmount = null,
  prefix = null,
  note = null,
  className,
  style,
}: LuxuryPriceTagProps) {
  const scale = SIZE_SCALE[size];
  const hasComparison = compareAtAmount !== null && compareAtAmount > amount;

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, ...style }}
      data-testid="luxury-price-tag"
    >
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        {prefix ? (
          <span
            className="resort-eyebrow resort-eyebrow--muted"
            style={{ fontSize: 11, letterSpacing: '0.14em' }}
          >
            {prefix}
          </span>
        ) : null}

        <span
          className="resort-display"
          style={{
            fontSize: scale.amount,
            lineHeight: 1.1,
            color: 'var(--resort-bronze)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatAmount(amount, currency)}
        </span>

        {hasComparison ? (
          <span
            style={{
              fontSize: scale.unit + 1,
              color: 'var(--resort-mist)',
              textDecoration: 'line-through',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatAmount(compareAtAmount as number, currency)}
          </span>
        ) : null}

        {unitLabel ? (
          <span
            style={{
              fontSize: scale.unit,
              color: 'var(--resort-stone)',
              letterSpacing: '0.06em',
            }}
          >
            / {unitLabel}
          </span>
        ) : null}
      </span>

      {note ? (
        <span style={{ fontSize: scale.note, color: 'var(--resort-stone)' }}>{note}</span>
      ) : null}
    </span>
  );
}