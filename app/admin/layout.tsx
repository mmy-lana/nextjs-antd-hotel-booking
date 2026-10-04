import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { AdminAuthGuard } from '@/components/organisms/AdminAuthGuard';

export const metadata: Metadata = {
  title: 'Front Office Console | Aura Cove Sanctuary',
  description: 'Suite inventory, rates and reservation control for resort staff.',
  robots: { index: false, follow: false },
};

/**
 * Every console route is gated.
 *
 * The barrier is a client-side demonstration gate rather than real authentication;
 * see `AdminAuthGuard` for exactly what it does and does not protect.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminAuthGuard>{children}</AdminAuthGuard>;
}