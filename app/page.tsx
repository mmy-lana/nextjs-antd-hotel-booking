import type { Metadata } from 'next';
import { ResortShowcase } from '@/components/templates/ResortShowcase';

export const metadata: Metadata = {
  title: 'Aura Cove Sanctuary | Luxury Boutique Resort',
  description:
    'Unrivaled coastal serenity, cliffside villas, and bespoke concierge hospitality on the Pacific rim.',
  openGraph: {
    title: 'Aura Cove Sanctuary',
    description: 'Cliffside villas, overwater suites and a private garden pavilion.',
    type: 'website',
  },
};

export default function HomePage() {
  return <ResortShowcase />;
}