import { AddonService } from '@/types/booking';

export const defaultAddons: AddonService[] = [
  {
    id: 'addon-1',
    name: 'Helicopter Airport Transfer',
    description: 'Direct aerial transport from international arrival terminal to resort helipad.',
    pricePerUnit: 650,
    chargeType: 'per_stay',
  },
  {
    id: 'addon-2',
    name: 'In-Villa Champagne & Caviar Ritual',
    description: 'Bottle of Dom Perignon paired with 50g Ossetra caviar and accompaniments.',
    pricePerUnit: 320,
    chargeType: 'per_stay',
  },
  {
    id: 'addon-3',
    name: 'Unlimited Thermal Spa & Thalassotherapy Pass',
    description: 'Daily unconstrained access to mineral vitality pools, steam caverns, and saunas.',
    pricePerUnit: 85,
    chargeType: 'per_night',
  },
  {
    id: 'addon-4',
    name: 'Private Sunset Catamaran Cruise',
    description: '3-hour private yacht excursion with dedicated onboard chef and sommelier.',
    pricePerUnit: 890,
    chargeType: 'per_stay',
  },
];
