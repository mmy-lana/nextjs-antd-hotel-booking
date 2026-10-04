'use client';

import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Card, Input, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

/** Session key holding the staff unlock flag for this browser tab. */
const ADMIN_SESSION_KEY = 'aura_cove_staff_session';

/**
 * Demo staff passkey for the front-office console.
 *
 * This is a **demonstration gate, not an authentication system**. The value ships in
 * the client bundle and the inventory it protects lives in this browser's localStorage,
 * so anyone can read it, bypass it, or query the same data directly. It exists to keep
 * the console out of a guest's way and to keep guest PII out of casual view during a
 * demo. A production deployment must replace it with a real server-side session
 * (verified credentials over HTTPS, httpOnly cookie, role checks on every request).
 */
const DEFAULT_STAFF_PASSKEY = 'auracove2026';

export interface AdminAuthGuardProps {
  /** Console surface protected by the gate. */
  children: ReactNode;
}

/**
 * Client barrier in front of the staff console.
 *
 * Renders nothing until the session flag has been read, so the console never flashes
 * its contents to an unauthenticated visitor before the guard resolves.
 */
export function AdminAuthGuard({ children }: AdminAuthGuardProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [passkey, setPasskey] = useState('');
  const [error, setError] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setAuthenticated(sessionStorage.getItem(ADMIN_SESSION_KEY) === 'active');
    setHydrated(true);
  }, []);

  const handleLogin = useCallback(() => {
    if (passkey.trim() === DEFAULT_STAFF_PASSKEY) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, 'active');
      setAuthenticated(true);
      setError(false);
      return;
    }
    setError(true);
  }, [passkey]);

  const handleSignOut = useCallback(() => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setAuthenticated(false);
    setPasskey('');
    setError(false);
  }, []);

  if (!hydrated) {
    return null;
  }

  if (!authenticated) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--resort-sand)',
          padding: 24,
        }}
      >
        <Card
          style={{
            maxWidth: 420,
            width: '100%',
            borderRadius: 'var(--resort-radius-lg)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
          }}
          styles={{ body: { padding: 32 } }}
        >
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <span style={{ fontSize: 32, color: 'var(--resort-bronze)', display: 'inline-block' }}>
              <LockOutlined />
            </span>
            <Title level={3} style={{ marginTop: 12, marginBottom: 4 }}>
              Staff Access Control
            </Title>
            <Paragraph style={{ color: 'var(--resort-stone)', fontSize: 13 }}>
              Enter the staff authorisation passkey to open console inventory and guest records.
            </Paragraph>
          </div>

          {error ? (
            <Alert
              type="error"
              showIcon
              message="Invalid authorisation"
              description="The supplied staff credentials do not grant access."
              style={{ marginBottom: 16 }}
              data-testid="admin-auth-error"
            />
          ) : null}

          <Input.Password
            size="large"
            placeholder="Staff passkey"
            aria-label="Staff passkey"
            autoComplete="off"
            value={passkey}
            onChange={(event) => {
              setPasskey(event.target.value);
              setError(false);
            }}
            onPressEnter={handleLogin}
            style={{ marginBottom: 16 }}
            data-testid="admin-passkey"
          />

          <Button type="primary" block size="large" onClick={handleLogin} data-testid="admin-authorize">
            Authorise terminal
          </Button>

          <Text
            style={{
              display: 'block',
              textAlign: 'center',
              marginTop: 16,
              fontSize: 11,
              color: 'var(--resort-stone)',
            }}
          >
            Demo passkey: {DEFAULT_STAFF_PASSKEY}
          </Text>
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="admin-authenticated">
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '8px 24px 0',
        }}
      >
        <Button onClick={handleSignOut} style={{ minHeight: 44 }} data-testid="admin-sign-out">
          End staff session
        </Button>
      </div>
      {children}
    </div>
  );
}