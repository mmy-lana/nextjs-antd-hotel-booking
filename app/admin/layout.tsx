import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Front Office Console | Aura Cove Sanctuary',
  description: 'Suite inventory, rates and reservation control for resort staff.',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}