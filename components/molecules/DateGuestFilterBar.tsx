'use client';

import React, { useCallback, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { MinusOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { Button, DatePicker, Grid, Popover } from 'antd';
import { useBookingStore } from '@/lib/store/bookingStore';

const { RangePicker } = DatePicker;

export interface CounterStepperProps {
  /** Field label, e.g. `Adults`. */
  label: string;
  /** Current value. */
  value: number;
  /** Smallest selectable value. */
  min: number;
  /** Largest selectable value. */
  max: number;
  /** Secondary explanation shown under the label. */
  hint?: string;
  /** Called with the next value; the parent clamps and updates the store. */
  onChange: (next: number) => void;
  /** Disables both stepper buttons. */
  disabled?: boolean;
  /**
   * Renders the visible label block. Set to `false` when the surrounding row already
   * names the control; the buttons keep their `aria-label` so the control stays
   * announced correctly.
   */
  showLabel?: boolean;
  /** Extra class applied to the wrapper. */
  className?: string;
  /** Test hook so the verification suite can address a specific counter. */
  testId?: string;
}

/**
 * Finger-sized counter used for guest composition and concierge add-ons.
 *
 * Both stepper buttons are locked to the 44x44 CSS pixel minimum so the control is
 * comfortable on a phone; the value itself is exposed as a live region so a screen
 * reader announces every change.
 */
export function CounterStepper({
  label,
  value,
  min,
  max,
  hint,
  onChange,
  disabled = false,
  showLabel = true,
  className,
  testId,
}: CounterStepperProps) {
  const decrementDisabled = disabled || value <= min;
  const incrementDisabled = disabled || value >= max;

  return (
    <div
      className={className}
      data-testid={testId}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
    >
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: 14, color: 'var(--resort-espresso)', display: showLabel ? 'inline' : 'none' }}>
          {label}
        </span>
        {hint && showLabel ? (
          <span
            style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--resort-stone)',
              lineHeight: 1.4,
            }}
          >
            {hint}
          </span>
        ) : null}
      </div>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Button
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={decrementDisabled}
          onClick={() => onChange(Math.max(min, value - 1))}
          icon={<MinusOutlined />}
          data-testid={testId ? `${testId}-decrement` : undefined}
          style={{ width: 44, height: 44, minWidth: 44, minHeight: 44, paddingInline: 0, flexShrink: 0 }}
        />
        <span
          aria-live="polite"
          data-testid={testId ? `${testId}-value` : undefined}
          style={{
            minWidth: 28,
            textAlign: 'center',
            fontSize: 16,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--resort-espresso)',
          }}
        >
          {value}
        </span>
        <Button
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={incrementDisabled}
          onClick={() => onChange(Math.min(max, value + 1))}
          icon={<PlusOutlined />}
          data-testid={testId ? `${testId}-increment` : undefined}
          style={{ width: 44, height: 44, minWidth: 44, minHeight: 44, paddingInline: 0, flexShrink: 0 }}
        />
      </div>
    </div>
  );
}

export interface DateGuestFilterBarProps {
  /** Extra class applied to the bar. */
  className?: string;
  /** Renders the helper copy under the controls; disable where vertical space is scarce. */
  showHint?: boolean;
}

/** Highest party the filter bar will assemble before the suite list narrows it further. */
const MAX_ADULTS = 10;
const MAX_CHILDREN = 8;

/**
 * Search bar for check-in, check-out and party composition.
 *
 * Below the `xs` breakpoint (576px) the range picker is split into two independent
 * date pickers, because a single range picker truncates its placeholder on narrow
 * phones. Each popup is anchored to its trigger's parent so it can never overflow the
 * viewport. From `xs` upward the unified range picker is used.
 *
 * Party composition lives behind an explicit, click-activated popover rather than a
 * hover menu, so the control is reachable by touch and by keyboard.
 */
export function DateGuestFilterBar({ className, showHint = true }: DateGuestFilterBarProps) {
  const screens = Grid.useBreakpoint();
  const dateRange = useBookingStore((state) => state.dateRange);
  const guests = useBookingStore((state) => state.guests);
  const setDateRange = useBookingStore((state) => state.setDateRange);
  const setGuests = useBookingStore((state) => state.setGuests);
  const resetFilters = useBookingStore((state) => state.resetFilters);

  const [guestPanelOpen, setGuestPanelOpen] = useState(false);

  const useSplitPickers = screens.xs === true;
  const today = useMemo(() => dayjs().startOf('day'), []);

  const rangeValue = useMemo<[Dayjs, Dayjs] | null>(
    () => (dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null),
    [dateRange],
  );

  const checkInValue = rangeValue ? rangeValue[0] : null;
  const checkOutValue = rangeValue ? rangeValue[1] : null;

  const disablePast = useCallback((current: Dayjs) => current < today, [today]);
  const disableBeforeCheckIn = useCallback(
    (current: Dayjs) => (checkInValue ? current <= checkInValue : current < today),
    [checkInValue, today],
  );

  const handleSplitCheckIn = useCallback(
    (value: Dayjs | null) => {
      if (!value) {
        setDateRange(null);
        return;
      }
      const previousCheckOut = checkOutValue;
      setDateRange([
        value,
        previousCheckOut && previousCheckOut.isAfter(value)
          ? previousCheckOut
          : value.add(1, 'day'),
      ]);
    },
    [checkOutValue, setDateRange],
  );

  const handleSplitCheckOut = useCallback(
    (value: Dayjs | null) => {
      if (!value || !checkInValue) {
        return;
      }
      setDateRange([checkInValue, value.isAfter(checkInValue) ? value : checkInValue.add(1, 'day')]);
    },
    [checkInValue, setDateRange],
  );

  const handleRangeChange = useCallback(
    (value: [Dayjs | null, Dayjs | null] | null) => {
      const [start, end] = value ?? [null, null];
      if (!start || !end) {
        setDateRange(null);
        return;
      }
      setDateRange([start, end.isAfter(start) ? end : start.add(1, 'day')]);
    },
    [setDateRange],
  );

  const guestSummary = `${guests.adults} ${guests.adults === 1 ? 'adult' : 'adults'}${
    guests.children > 0
      ? ` · ${guests.children} ${guests.children === 1 ? 'child' : 'children'}`
      : ''
  }`;

  const hasActiveFilters = dateRange !== null || guests.adults !== 2 || guests.children !== 0;

  const popupContainer = useCallback(
    (trigger: HTMLElement) => trigger.parentElement ?? document.body,
    [],
  );

  const guestPanel = (
    <div
      data-testid="guest-panel"
      style={{ display: 'flex', flexDirection: 'column', gap: 18, width: 280, paddingTop: 4 }}
    >
      <CounterStepper
        label="Adults"
        hint="Guests aged 13 and above"
        value={guests.adults}
        min={1}
        max={MAX_ADULTS}
        testId="guest-adults"
        onChange={(next) => setGuests({ ...guests, adults: next })}
      />
      <hr className="resort-rule" style={{ border: 0, borderTop: '1px solid var(--resort-border-soft)' }} />
      <CounterStepper
        label="Children"
        hint="Guests aged 2 to 12"
        value={guests.children}
        min={0}
        max={MAX_CHILDREN}
        testId="guest-children"
        onChange={(next) => setGuests({ ...guests, children: next })}
      />
      <Button block onClick={() => setGuests({ adults: 2, children: 0 })} data-testid="guest-reset">
        Reset party
      </Button>
    </div>
  );

  return (
    <section
      className={className}
      aria-label="Search criteria"
      data-testid="date-guest-filter-bar"
      data-picker-mode={useSplitPickers ? 'split' : 'range'}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'stretch',
        gap: 12,
        padding: 16,
        background: 'var(--resort-paper)',
        border: '1px solid var(--resort-border)',
        borderRadius: 'var(--resort-radius-lg)',
      }}
    >
      {useSplitPickers ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, flex: '1 1 220px', minWidth: 0 }}>
          <label style={{ display: 'block' }}>
            <span className="resort-eyebrow resort-eyebrow--muted" style={{ display: 'block', marginBottom: 6 }}>
              Check-in
            </span>
            <DatePicker
              value={checkInValue}
              onChange={handleSplitCheckIn}
              disabledDate={disablePast}
              format="DD MMM YYYY"
              allowClear={false}
              getPopupContainer={popupContainer}
              style={{ width: '100%' }}
              data-testid="check-in-picker"
            />
          </label>

          <label style={{ display: 'block' }}>
            <span className="resort-eyebrow resort-eyebrow--muted" style={{ display: 'block', marginBottom: 6 }}>
              Check-out
            </span>
            <DatePicker
              value={checkOutValue}
              onChange={handleSplitCheckOut}
              disabledDate={disableBeforeCheckIn}
              format="DD MMM YYYY"
              allowClear={false}
              getPopupContainer={popupContainer}
              style={{ width: '100%' }}
              data-testid="check-out-picker"
            />
          </label>
        </div>
      ) : (
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <span className="resort-eyebrow resort-eyebrow--muted" style={{ display: 'block', marginBottom: 6 }}>
            Stay
          </span>
          <RangePicker
            value={rangeValue}
            onChange={handleRangeChange}
            disabledDate={disablePast}
            format="DD MMM YYYY"
            allowClear={false}
            getPopupContainer={popupContainer}
            style={{ width: '100%' }}
            data-testid="range-picker"
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flex: '0 1 auto', alignItems: 'flex-end' }}>
        <div>
          <span className="resort-eyebrow resort-eyebrow--muted" style={{ display: 'block', marginBottom: 6 }}>
            Party
          </span>
          <Popover
            open={guestPanelOpen}
            onOpenChange={setGuestPanelOpen}
            content={guestPanel}
            title="Guests travelling"
            trigger="click"
            placement="bottomLeft"
          >
            <Button
              icon={<TeamOutlined />}
              aria-expanded={guestPanelOpen}
              aria-haspopup="dialog"
              data-testid="guest-trigger"
              style={{ minHeight: 44, width: '100%' }}
            >
              {guestSummary}
            </Button>
          </Popover>
        </div>

        {hasActiveFilters ? (
          <Button onClick={resetFilters} data-testid="reset-filters" style={{ minHeight: 44 }}>
            Reset
          </Button>
        ) : null}
      </div>

      {showHint ? (
        <p
          className="resort-eyebrow resort-eyebrow--muted"
          style={{ flexBasis: '100%', fontSize: 10, letterSpacing: '0.14em' }}
        >
          Rates are quoted per night · weekend nights are Friday and Saturday
        </p>
      ) : null}
    </section>
  );
}