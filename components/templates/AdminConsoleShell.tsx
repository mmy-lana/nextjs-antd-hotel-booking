'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layout, Spin } from 'antd';
import { useInventoryStore } from '@/lib/store/inventoryStore';
import { useBookingStore } from '@/lib/store/bookingStore';
import { defaultRooms } from '@/lib/data/seedRooms';
import { defaultAddons } from '@/lib/data/seedAddons';
import { seedInventoryStorage } from '@/lib/utils/storage';
import { HeaderNavbar, DEFAULT_NAV_ITEMS } from '@/components/organisms/HeaderNavbar';

const { Content, Footer } = Layout;

/** A single figure in the console metrics top-bar. */
export interface ConsoleMetric {
  label: string;
  value: string;
  /** Optional supporting line, e.g. a share of inventory. */
  hint?: string;
}

export interface AdminConsoleShellProps {
  /** Page eyebrow, e.g. `Front office`. */
  eyebrow: string;
  /** Page title. */
  title: string;
  /** Supporting copy rendered under the title. */
  description?: string;
  /** Trailing controls rendered beside the page title. */
  actions?: ReactNode;
  /** Occupancy and revenue figures rendered as a top bar; omitted renders no bar. */
  metrics?: ConsoleMetric[];
  /** Page body. */
  children: ReactNode;
  /** Navigation highlighted as current; defaults to the section matching the pathname. */
  activeSection?: string;
}

/** Console navigation; every destination is a staff surface. */
const CONSOLE_SECTIONS = [
  { href: '/admin/rooms', label: 'Inventory' },
  { href: '/admin/reservations', label: 'Reservations' },
  { href: '/', label: 'Guest site' },
];

/**
 * Staff console shell.
 *
 * Owns the one-time hydration of both persisted stores so every console page starts
 * from the same, fully rehydrated state, and renders a deterministic loading frame
 * instead of flashing an empty table before localStorage has been read.
 */
export function AdminConsoleShell({
  eyebrow,
  title,
  description,
  actions,
  metrics,
  children,
  activeSection,
}: AdminConsoleShellProps) {
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    seedInventoryStorage({ rooms: defaultRooms, addons: defaultAddons });
    useInventoryStore.persist.rehydrate();
    useBookingStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  const current = activeSection ?? pathname ?? '/admin/rooms';

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--resort-sand)' }}>
      <HeaderNavbar items={DEFAULT_NAV_ITEMS} />

      <div
        style={{
          background: 'var(--resort-linen)',
          borderBottom: '1px solid var(--resort-border)',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '12px 24px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
            alignItems: 'center',
          }}
        >
          <nav aria-label="Console sections" style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            {CONSOLE_SECTIONS.map((section) => {
              const active = current === section.href;
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  aria-current={active ? 'page' : undefined}
                  data-testid={`console-nav-${section.label.toLowerCase().replace(/\s+/g, '-')}`}
                  style={{
                    fontSize: 12,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    color: active ? 'var(--resort-bronze)' : 'var(--resort-stone)',
                    borderBottom: `1px solid ${active ? 'var(--resort-bronze)' : 'transparent'}`,
                    paddingBottom: 4,
                    minHeight: 44,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  {section.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <Content style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 72px', width: '100%' }}>
        {metrics && metrics.length > 0 ? (
          <dl
            data-testid="console-metrics"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 1,
              marginBottom: 28,
              border: '1px solid var(--resort-border)',
              borderRadius: 'var(--resort-radius-lg)',
              overflow: 'hidden',
              background: 'var(--resort-border-soft)',
            }}
          >
            {metrics.map((metric) => (
              <div key={metric.label} style={{ background: 'var(--resort-paper)', padding: '16px 18px' }}>
                <dt className="resort-eyebrow resort-eyebrow--muted" style={{ fontSize: 10 }}>
                  {metric.label}
                </dt>
                <dd
                  style={{
                    margin: '6px 0 0',
                    fontFamily: 'var(--font-display)',
                    fontSize: 26,
                    lineHeight: 1.15,
                    color: 'var(--resort-espresso)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {metric.value}
                </dd>
                {metric.hint ? (
                  <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'var(--resort-stone)' }}>
                    {metric.hint}
                  </span>
                ) : null}
              </div>
            ))}
          </dl>
        ) : null}

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: 28,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p className="resort-eyebrow" style={{ marginBottom: 8 }}>
              {eyebrow}
            </p>
            <h1 style={{ margin: 0 }}>{title}</h1>
            {description ? (
              <p className="resort-lede" style={{ marginTop: 10, fontSize: 15 }}>
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div style={{ flexShrink: 0 }}>{actions}</div> : null}
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
            <span className="resort-eyebrow resort-eyebrow--muted">Loading the resort register</span>
          </div>
        ) : (
          children
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
          Aura Cove front office · concierge console
        </span>
      </Footer>
    </Layout>
  );
}