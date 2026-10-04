'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CloseOutlined, MenuOutlined } from '@ant-design/icons';
import { Button, Drawer, Grid } from 'antd';

export interface HeaderNavItem {
  /** Visible label. */
  label: string;
  /** Internal route. */
  href: string;
  /** Optional eyebrow copy shown under the label inside the mobile drawer. */
  description?: string;
}

export interface HeaderNavbarProps {
  /** Navigation entries rendered on desktop and inside the mobile drawer. */
  items?: HeaderNavItem[];
  /** Extra class applied to the header element. */
  className?: string;
}

/** Default guest-facing navigation for the resort shell. */
export const DEFAULT_NAV_ITEMS: HeaderNavItem[] = [
  { label: 'Residences', href: '/', description: 'The curated coastal catalogue' },
  { label: 'Staff Console', href: '/admin/rooms', description: 'Inventory and reservation register' },
  { label: 'Reservations', href: '/admin/reservations', description: 'Concierge schedule and guest records' },
];

/**
 * Sticky resort masthead.
 *
 * Desktop shows the wordmark and inline links. Below the `md` breakpoint the links move
 * into a hamburger drawer so nothing is truncated, and the trigger is a full 44x44 touch
 * target. Navigation is never hover-only.
 */
export function HeaderNavbar({ items = DEFAULT_NAV_ITEMS, className }: HeaderNavbarProps) {
  const screens = Grid.useBreakpoint();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [elevated, setElevated] = useState(false);

  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Any navigation closes the drawer, including in-app anchor jumps.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const isCompact = screens.md !== true;

  return (
    <header
      className={className}
      data-testid="header-navbar"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        padding: '16px 24px',
        background: 'rgba(250, 248, 245, 0.94)',
        backdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${elevated ? 'var(--resort-border)' : 'transparent'}`,
        transition: 'border-color 0.25s var(--resort-ease)',
      }}
    >
      <Link
        href="/"
        aria-label="Aura Cove Sanctuary Resort and Spa, home"
        style={{ display: 'inline-flex', alignItems: 'baseline', gap: 12, minHeight: 44 }}
      >
        <span
          className="resort-display"
          style={{ fontSize: 26, letterSpacing: '0.08em', color: 'var(--resort-espresso)' }}
        >
          AURA COVE
        </span>
        <span className="resort-eyebrow resort-eyebrow--muted">Resort &amp; Spa</span>
      </Link>

      {isCompact ? (
        <Button
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
          icon={drawerOpen ? <CloseOutlined /> : <MenuOutlined />}
          onClick={() => setDrawerOpen((open) => !open)}
          data-testid="navbar-toggle"
          style={{ minWidth: 44, minHeight: 44 }}
        />
      ) : (
        <nav aria-label="Primary" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {items.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  fontSize: 13,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  color: active ? 'var(--resort-bronze)' : 'var(--resort-taupe)',
                  paddingBottom: 4,
                  borderBottom: `1px solid ${active ? 'var(--resort-bronze)' : 'transparent'}`,
                  minHeight: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

      <Drawer
        title="Aura Cove"
        placement="right"
        open={drawerOpen}
        onClose={closeDrawer}
        data-testid="navbar-drawer"
        styles={{
          // `width` is deprecated on Ant Design v6. The panel extent is set through the
          // wrapper style slot rather than the legacy prop.
          wrapper: { width: '100%' },
          body: { padding: 24 },
          header: { borderBottom: '1px solid var(--resort-border)' },
        }}
      >
        <nav aria-label="Mobile primary" style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeDrawer}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '16px 0',
                borderBottom: '1px solid var(--resort-border-soft)',
                minHeight: 44,
              }}
            >
              <span
                className="resort-display"
                style={{ fontSize: 22, color: 'var(--resort-espresso)' }}
              >
                {item.label}
              </span>
              {item.description ? (
                <span className="resort-eyebrow resort-eyebrow--muted">{item.description}</span>
              ) : null}
            </Link>
          ))}
        </nav>
      </Drawer>
    </header>
  );
}