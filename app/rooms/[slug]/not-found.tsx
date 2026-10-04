import Link from 'next/link';
import { HeaderNavbar } from '@/components/organisms/HeaderNavbar';

/**
 * Styled 404 for the residence route.
 *
 * Deliberately free of Ant Design: `Layout.Content` and its siblings are only
 * populated in the client bundle, so destructuring them from a server component
 * renders an `undefined` element type. This page is built from the same design
 * tokens as the rest of the shell, without pulling the component runtime onto an
 * error page.
 */
export default function RoomNotFound() {
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
          Residence not found
        </p>
        <h1 style={{ marginBottom: 16 }}>This suite is not part of the collection</h1>
        <p className="resort-lede" style={{ margin: '0 auto 28px' }}>
          The link may be out of date, or the residence may have been retired from the
          catalogue. Our concierge would be glad to arrange an alternative.
        </p>
        <Link
          href="/"
          data-testid="not-found-home"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            minWidth: 220,
            padding: '0 22px',
            borderRadius: 'var(--resort-radius)',
            background: 'var(--resort-bronze)',
            color: '#ffffff',
            fontWeight: 500,
            letterSpacing: '0.04em',
          }}
        >
          Return to the catalogue
        </Link>
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