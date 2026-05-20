// Pricing logic — based on Austin, TX moving market rates (2025-2026)
// ALL PRICES IN CENTS — never store dollars as floats
//
// Sources:
// - Austin movers: $90–$180/hr for 2-mover crew + truck
// - Studio: $300–$450, 1BR: $400–$650, 2BR: $700–$900, 3BR: $1,100–$1,650
// - Stairs surcharge: ~$75/flight industry standard
// - Heavy items: $50–$150 each depending on item
//
// Payment model:
// - Customer pays a 10% deposit through the app when a worker is accepted
// - The remaining 90% is settled directly between customer and worker

import { z } from 'zod';

export const GigDataSchema = z.object({
  homeSize: z.enum(['item', 'few-items', 'studio', '1br', '2br', '3br+', 'other']),
  crew: z.number().min(1).max(6),
  truck: z.enum(['none', 'small', 'medium', 'large']),
  stairsFrom: z.number().min(0),
  stairsTo: z.number().min(0),
  elevatorFrom: z.boolean(),
  elevatorTo: z.boolean(),
  longCarry: z.boolean(),
  heavyItems: z.array(z.string()),
  distanceMiles: z.number().optional(),
});

export type GigPricingData = z.infer<typeof GigDataSchema>;

export type PricingModel = 'flat' | 'hourly';

export interface FlatPriceResult {
  pricing: 'flat';
  subtotalCents: number;
  taxesCents: number;
  totalCents: number;
  baseCents: number;
  stairsSurchargeCents: number;
  longCarryCents: number;
  heavyItemsCents: number;
  distanceSurchargeCents: number;
}

export interface HourlyPriceResult {
  pricing: 'hourly';
  rateCentsPerHour: number;
  estimatedHours: number;
  subtotalCents: number;
  taxesCents: number;
  totalCents: number;
  minimumHours: number;
}

export type PriceResult = FlatPriceResult | HourlyPriceResult;

// Base prices aligned with Austin, TX local moving market
const BASE_PRICES_CENTS: Record<string, number> = {
  item: 8500,       // $85 — single item (couch, desk, appliance)
  'few-items': 17500, // $175 — few items, between single item and studio
  studio: 35000,    // $350 — studio apartment
  '1br': 50000,     // $500 — 1 bedroom
  '2br': 80000,     // $800 — 2 bedroom
  '3br+': 135000,   // $1,350 — 3+ bedroom
  other: 0,          // $0 — custom quote (TBD)
};

// More crew = higher cost (Austin avg ~$45-55/hr per additional mover)
const CREW_MULTIPLIERS: Record<number, number> = {
  1: 0.75,
  2: 1,
  3: 1.4,
  4: 1.8,
  5: 2.15,
  6: 2.5,
};

// Truck size affects cost (fuel, insurance, availability)
const TRUCK_MULTIPLIERS: Record<string, number> = {
  none: 0.7,     // No truck — labor only
  small: 1,      // Cargo van / small truck
  medium: 1.2,   // 16-17ft truck
  large: 1.5,    // 20-26ft truck
};

// Austin industry standard surcharges
const STAIRS_SURCHARGE_CENTS_PER_FLIGHT = 7500;   // $75/flight
const LONG_CARRY_SURCHARGE_CENTS = 5000;           // $50 for long carry (100+ ft)
const HEAVY_ITEM_SURCHARGE_CENTS = 7500;           // $75 per heavy/specialty item (default)
const TAX_RATE = 0.0825;                           // Texas sales tax 8.25%

// Distance surcharge — Austin movers charge ~$1.00-$1.50/mile beyond 15 miles
export const DISTANCE_FREE_MILES = 15;
export const DISTANCE_PER_MILE_CENTS = 125;        // $1.25/mile over free miles

// Per-item heavy/specialty item pricing
const HEAVY_ITEM_PRICES: Record<string, number> = {
  piano: 25000,       // $250
  safe: 15000,        // $150
  'pool-table': 30000, // $300
  'hot-tub': 35000,   // $350
};

// Hourly rates — calibrated so 3 movers + truck = $150/hr
const HOURLY_BASE_RATE_CENTS = 10700; // $107/hr base (2 movers + small truck)
const MINIMUM_HOURS = 2;

const ESTIMATED_HOURS: Record<string, number> = {
  item: 1,
  'few-items': 1.5,
  studio: 2.5,
  '1br': 3.5,
  '2br': 5,
  '3br+': 7,
  other: 0,
};

// Deposit percentage — customer pays this through the app
export const DEPOSIT_PERCENT = 10;

// Calculate deposit amount in cents
export function depositCents(totalCents: number): number {
  return Math.round(totalCents * (DEPOSIT_PERCENT / 100));
}

// Calculate remainder owed directly to worker
export function remainderCents(totalCents: number): number {
  return totalCents - depositCents(totalCents);
}

function heavyItemCost(item: string): number {
  return HEAVY_ITEM_PRICES[item] ?? HEAVY_ITEM_SURCHARGE_CENTS;
}

function distanceSurcharge(distanceMiles?: number): number {
  if (!distanceMiles || distanceMiles <= DISTANCE_FREE_MILES) return 0;
  return Math.round((distanceMiles - DISTANCE_FREE_MILES) * DISTANCE_PER_MILE_CENTS);
}

export function priceFor(data: GigPricingData, model: PricingModel = 'flat'): PriceResult {
  const crewMult = CREW_MULTIPLIERS[data.crew] ?? 1;
  const truckMult = TRUCK_MULTIPLIERS[data.truck] ?? 1;

  if (model === 'hourly') {
    const rateCentsPerHour = Math.round(HOURLY_BASE_RATE_CENTS * crewMult * truckMult);
    const estimatedHours = ESTIMATED_HOURS[data.homeSize] ?? 2;
    const subtotalCents = Math.round(rateCentsPerHour * estimatedHours);
    const taxesCents = Math.round(subtotalCents * TAX_RATE);
    const totalCents = subtotalCents + taxesCents;

    return {
      pricing: 'hourly',
      rateCentsPerHour,
      estimatedHours,
      subtotalCents,
      taxesCents,
      totalCents,
      minimumHours: MINIMUM_HOURS,
    };
  }

  // Flat rate
  const baseCents = BASE_PRICES_CENTS[data.homeSize] ?? 50000;
  const stairsFlights = Math.max(
    0,
    data.stairsFrom + data.stairsTo - (data.elevatorFrom ? 1 : 0) - (data.elevatorTo ? 1 : 0)
  );
  const stairsSurchargeCents = stairsFlights * STAIRS_SURCHARGE_CENTS_PER_FLIGHT;
  const longCarryCents = data.longCarry ? LONG_CARRY_SURCHARGE_CENTS : 0;
  const heavyItemsCents = data.heavyItems.reduce((sum, item) => sum + heavyItemCost(item), 0);
  const distanceSurchargeCents = distanceSurcharge(data.distanceMiles);

  const subtotalCents = Math.round(baseCents * crewMult * truckMult) + stairsSurchargeCents + longCarryCents + heavyItemsCents + distanceSurchargeCents;
  const taxesCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxesCents;

  return {
    pricing: 'flat',
    subtotalCents,
    taxesCents,
    totalCents,
    baseCents,
    stairsSurchargeCents,
    longCarryCents,
    heavyItemsCents,
    distanceSurchargeCents,
  };
}

// Calculate total surcharges from a gig's data
export function surchargesFromGig(gig: {
  stairs_from: number;
  stairs_to: number;
  elevator_from?: boolean;
  elevator_to?: boolean;
  long_carry?: boolean;
  heavy_items?: string[];
  distance_miles?: number;
}): { stairsCents: number; longCarryCents: number; heavyItemsCents: number; distanceCents: number; totalCents: number } {
  const flights = Math.max(
    0,
    (gig.stairs_from || 0) + (gig.stairs_to || 0) - (gig.elevator_from ? 1 : 0) - (gig.elevator_to ? 1 : 0)
  );
  const stairsCents = flights * STAIRS_SURCHARGE_CENTS_PER_FLIGHT;
  const longCarryCents = gig.long_carry ? LONG_CARRY_SURCHARGE_CENTS : 0;
  const heavyItemsCents = (gig.heavy_items ?? []).reduce((sum, item) => sum + heavyItemCost(item), 0);
  const distanceCents = distanceSurcharge(gig.distance_miles);
  return {
    stairsCents,
    longCarryCents,
    heavyItemsCents,
    distanceCents,
    totalCents: stairsCents + longCarryCents + heavyItemsCents + distanceCents,
  };
}

// Format cents as dollar string
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
