import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { defaultRooms } from '@/lib/data/seedRooms';
import { SuiteShowcase } from '@/components/templates/SuiteShowcase';

interface RoomPageParams {
  params: Promise<{ slug: string }>;
}

/** Prerenders one route per curated suite so the page is indexable and fast. */
export function generateStaticParams() {
  return defaultRooms.map((room) => ({ slug: room.slug }));
}

export async function generateMetadata({ params }: RoomPageParams): Promise<Metadata> {
  const { slug } = await params;
  const room = defaultRooms.find((candidate) => candidate.slug === slug);
  if (!room) {
    return { title: 'Residence not found | Aura Cove Sanctuary' };
  }
  return {
    title: `${room.title} | Aura Cove Sanctuary`,
    description: room.tagline,
    openGraph: {
      title: room.title,
      description: room.tagline,
      images: [{ url: room.images[0]?.url, alt: room.images[0]?.altText }],
      type: 'website',
    },
  };
}

export default async function RoomDetailPage({ params }: RoomPageParams) {
  const { slug } = await params;
  const room = defaultRooms.find((candidate) => candidate.slug === slug);

  // A suite withdrawn from the curated catalogue still resolves client side; only a slug
  // that was never part of the catalogue is a genuine 404.
  if (!room) {
    notFound();
  }

  return <SuiteShowcase slug={slug} initialRoom={room} />;
}