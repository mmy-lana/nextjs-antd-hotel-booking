'use client';

import React, { useCallback, useMemo } from 'react';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import type { AddonService } from '@/types/booking';
import { CounterStepper } from '@/components/molecules/DateGuestFilterBar';

export interface AddonSelectionMap {
  [addonId: string]: number;
}

export interface AddonSelectorProps {
  /** Concierge catalogue offered for this stay. */
  addons: AddonService[];
  /** Current quantity per addon id. Absent ids mean "not selected". */
  selections: AddonSelectionMap;
  /** Called whenever a quantity changes; receives the new quantity for that addon. */
  onChange: (addonId: string, quantity: number) => void;
  /** Nights in the stay, used to price `per_night` add-ons. Defaults to a single night. */
  totalNights?: number;
  /** Largest quantity selectable for a single add-on. */
  maxQuantity?: number;
  /** Disables every control, e.g. while the drawer is submitting. */
  disabled?: boolean;
  /** Extra class applied to the wrapper. */
  className?: string;
}

/** Upper bound for any single concierge add-on line. */
const DEFAULT_MAX_QUANTITY = 8;

/** Readable label for each charge cadence. */
const CHARGE_LABEL: Record<AddonService['chargeType'], string> = {
  per_stay: 'per stay',
  per_night: 'per night',
  per_guest: 'per guest',
};

function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) {
    return '$0';
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
  }
}

/** Authoritative line price for an add-on, mirroring the pricing engine's cadence rules. */
export function calculateAddonLinePrice(addon: AddonService, quantity: number, totalNights: number): number {
  if (quantity <= 0) {
    return 0;
  }
  const nights = Math.max(1, totalNights);
  const multiplier = addon.chargeType === 'per_night' ? nights : 1;
  return addon.pricePerUnit * quantity * multiplier;
}

/**
 * Concierge upgrade list.
 *
 * Every add-on shows its cadence and its line price at the current party and stay
 * length, so the guest can see the consequence of a tap before opening checkout.
 * Quantities live entirely with the parent, which keeps the pricing engine the single
 * source of truth for the reservation total.
 */
export function AddonSelector({
  addons,
  selections,
  onChange,
  totalNights = 1,
  maxQuantity = DEFAULT_MAX_QUANTITY,
  disabled = false,
  className,
}: AddonSelectorProps) {
  const handleDecrement = useCallback(
    (addon: AddonService) => {
      const current = selections[addon.id] ?? 0;
      if (current <= 1) {
        onChange(addon.id, 0);
        return;
      }
      onChange(addon.id, current - 1);
    },
    [onChange, selections],
  );

  const handleIncrement = useCallback(
    (addon: AddonService) => {
      const current = selections[addon.id] ?? 0;
      onChange(addon.id, Math.min(maxQuantity, current + 1));
    },
    [maxQuantity, onChange, selections],
  );

  const totals = useMemo(() => {
    return addons.reduce((sum, addon) => {
      return sum + calculateAddonLinePrice(addon, selections[addon.id] ?? 0, totalNights);
    }, 0);
  }, [addons, selections, totalNights]);

  if (addons.length === 0) {
    return (
      <div
        className={className}
        data-testid="addon-selector-empty"
        style={{
          border: '1px dashed var(--resort-border)',
          borderRadius: 'var(--resort-radius)',
          padding: 24,
          textAlign: 'center',
          color: 'var(--resort-stone)',
        }}
      >
        No concierge services are currently offered for this residence.
      </div>
    );
  }

  return (
    <div className={className} data-testid="addon-selector">
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {addons.map((addon) => {
          const quantity = selections[addon.id] ?? 0;
          const linePrice = calculateAddonLinePrice(addon, quantity, totalNights);
          const nightlyEquivalent =
            addon.chargeType === 'per_night' && totalNights > 1
              ? `${formatCurrency(addon.pricePerUnit)} × ${totalNights} nights`
              : null;

          return (
            <li
              key={addon.id}
              data-testid="addon-row"
              data-addon-id={addon.id}
              data-quantity={quantity}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
                padding: 16,
                border: `1px solid ${quantity > 0 ? 'var(--resort-bronze)' : 'var(--resort-border-soft)'}`,
                borderRadius: 'var(--resort-radius)',
                background: quantity > 0 ? 'var(--resort-bronze-wash)' : 'var(--resort-paper)',
              }}
            >
              <div style={{ minWidth: 200, flex: '1 1 240px' }}>
                <span style={{ fontSize: 15, color: 'var(--resort-espresso)' }}>{addon.name}</span>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 13,
                    color: 'var(--resort-taupe)',
                    lineHeight: 1.55,
                  }}
                >
                  {addon.description}
                </p>
                <span
                  className="resort-eyebrow resort-eyebrow--muted"
                  style={{ display: 'block', marginTop: 8, fontSize: 10, letterSpacing: '0.14em' }}
                >
                  {formatCurrency(addon.pricePerUnit)} {CHARGE_LABEL[addon.chargeType]}
                  {nightlyEquivalent ? ` · ${nightlyEquivalent}` : ''}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                <span
                  data-testid="addon-line-price"
                  style={{
                    minWidth: 78,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 15,
                    color: quantity > 0 ? 'var(--resort-bronze)' : 'var(--resort-mist)',
                  }}
                >
                  {quantity > 0 ? formatCurrency(linePrice) : '—'}
                </span>

                <CounterStepper
                  label={addon.name}
                  showLabel={false}
                  value={quantity}
                  min={0}
                  max={maxQuantity}
                  disabled={disabled}
                  testId={`addon-stepper-${addon.id}`}
                  onChange={(next) => (next <= 0 ? onChange(addon.id, 0) : onChange(addon.id, next))}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div
        style={{
          marginTop: 14,
          paddingTop: 14,
          borderTop: '1px solid var(--resort-border-soft)',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span className="resort-eyebrow resort-eyebrow--muted">Concierge subtotal</span>
        <span
          data-testid="addon-subtotal"
          style={{
            fontSize: 20,
            fontFamily: 'var(--font-display)',
            color: 'var(--resort-bronze)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatCurrency(totals)}
        </span>
      </div>
    </div>
  );
}