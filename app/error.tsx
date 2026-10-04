'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from 'antd';
import { HeaderNavbar } from '@/components/organisms/HeaderNavbar';

export interface SegmentErrorProps {
  /** The error thrown while rendering this segment. `digest` is the server-side correlation id. */
  error: Error & { digest?: string };
  /** Re-renders the segment, discarding the failed tree. */
  reset: () => void;
}

/**
 * Segment error boundary.
 *
 * Catches render and lifecycle failures inside the route it wraps and replaces them with
 * a recoverable screen. The guest can retry in place or return to the catalogue, rather
 * than meeting a blank document or Next.js's raw development overlay in production.
 */
export default function SegmentErrorBoundary({ error, reset }: SegmentErrorProps) {
  useEffect(() => {
    // `digest` is the only identifier available for a server-thrown error and is what an
    // error-reporting service would key on. Logging here keeps the failure observable.
    console.error(
      `[Aura Cove] Route segment failed${error.digest ? ` (digest ${error.digest})` : ''}:`,
      error,
    );
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--resort-sand)',
      }}
    >
      <HeaderNavbar />

      <main
        style={{
          flex: 1,
          maxWidth: 640,
          margin: '0 auto',
          padding: '96px 24px',
          textAlign: 'center',
        }}
      >
        <p className="resort-eyebrow" style={{ marginBottom: 12 }}>
          Service interruption
        </p>
        <h1 style={{ marginBottom: 16 }}>Unable to load this page</h1>
        <p className="resort-lede" style={{ margin: '0 auto 28px' }}>
          Something went wrong while preparing this section. Nothing you have booked has been
          affected. You can try again, or return to the catalogue.
        </p>

        {error.digest ? (
          <p
            className="resort-eyebrow resort-eyebrow--muted"
            style={{ marginBottom: 24, fontSize: 10 }}
            data-testid="error-digest"
          >
            Reference {error.digest}
          </p>
        ) : null}

        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Button type="primary" onClick={reset} style={{ height: 44, minWidth: 160 }} data-testid="error-reset">
            Try again
          </Button>
          <Link href="/">
            <Button style={{ height: 44, minWidth: 160 }}>Return to the catalogue</Button>
          </Link>
        </div>
      </main>

      <footer
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
      </footer>
    </div>
  );
}