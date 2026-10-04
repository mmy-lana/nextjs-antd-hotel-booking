import type { Metadata } from 'next';
import { AntdProviders } from '@/components/AntdProviders';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aura Cove Sanctuary | Luxury Boutique Resort',
  description: 'Unrivaled coastal serenity, cliffside villas, and bespoke concierge hospitality.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AntdProviders>{children}</AntdProviders>
      </body>
    </html>
  );
}
