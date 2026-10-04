import type { Metadata } from 'next';
import { ItineraryPass } from '@/components/templates/ItineraryPass';

interface ConfirmationPageParams {
  params: Promise<{ ref: string }>;
}

export async function generateMetadata({ params }: ConfirmationPageParams): Promise<Metadata> {
  const { ref } = await params;
  return {
    title: `Itinerary ${ref} | Aura Cove Sanctuary`,
    description: 'Your Aura Cove booking confirmation, folio and arrival notes.',
    robots: { index: false, follow: false },
  };
}

/**
 * Server-rendered shell for the itinerary pass.
 *
 * Itineraries live in the guest's own browser, so the voucher body is a client island
 * that reads the persisted store; the route itself still streams a complete shell with
 * metadata and a stable URL for the guest's own records.
 */
export default async function BookingConfirmationPage({ params }: ConfirmationPageParams) {
  const { ref } = await params;
  return <ItineraryPass reference={ref} />;
}