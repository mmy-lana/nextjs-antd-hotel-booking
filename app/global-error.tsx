'use client';

import { useEffect } from 'react';

/**
 * Root error boundary.
 *
 * `global-error` replaces the entire document, including `<html>` and `<body>`, so it
 * cannot rely on the root layout, the Ant Design provider or any global stylesheet. It
 * is therefore written in plain elements with literal colours: if the root layout itself
 * fails, this screen still has to render.
 */
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      `[Aura Cove] Root boundary caught${error.digest ? ` (digest ${error.digest})` : ''}:`,
      error,
    );
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 24,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#FAF8F5',
          color: '#1F1B18',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <p
            style={{
              fontSize: 11,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#8C704B',
              margin: '0 0 12px',
            }}
          >
            Sanctuary system unavailable
          </p>
          <h1
            style={{
              fontFamily: '"Cormorant Garamond", Didot, Georgia, "Times New Roman", serif',
              fontWeight: 400,
              fontSize: 28,
              margin: '0 0 12px',
            }}
          >
            The resort could not be reached
          </h1>
          <p style={{ fontSize: 14, color: '#7A6F64', margin: '0 0 24px' }}>
            An unrecoverable error interrupted the application. Reloading usually clears it.
          </p>
          <button
            type="button"
            onClick={reset}
            data-testid="global-error-reset"
            style={{
              minHeight: 44,
              minWidth: 200,
              padding: '0 24px',
              background: '#8C704B',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
              fontWeight: 500,
              letterSpacing: '0.04em',
            }}
          >
            Reload the application
          </button>
        </div>
      </body>
    </html>
  );
}