// Pricing logic — based on Austin, TX moving market rates (2025-2026)
// ALL PRICES IN CENTS — never store dollars as floats
//
// Sources:
// - Austin movers: $90–$180/hr for 2-mover crew + truck
// - Studio: $300–$450, 1BR: $400–$650, 2BR: $700–$900, 3BR: $1,100–$1,650
// - Stairs surcharge: $50/flight (matches intake form + admin)
// - Elevator surcharge: $40 per location with an elevator (matches intake + admin)
// - Heavy items: $50–$150 each depending on item
//
// Payment model:
// - Customer pays 100% upfront through the app at booking.
// - Platform keeps PLATFORM_FEE_PERCENT; the worker is paid the remainder
//   after the job via Stripe Connect.
//
// Pricing parity: this engine is kept EXACTLY in sync with the public intake
// form (landing/intake.html `calcQuote`). That means:
//   - base price is by move size only — crew size and truck size do NOT change
//     the price (they're still collected for the mover's planning).
//   - long-distance (>= 50 mi) multiplies the base by 1.5x.
//   - stairs are charged per flight; an elevator at a location adds a flat fee.

import { z } from 'zod';

export const GigDataSchema = z.object({
  homeSize: z.enum(['few-items', 'studio', '1br', '2br', '3br+', '4br', 'other']),
  crew: z.number().min(1).max(6),
  truck: z.enum(['none', 'small', 'medium', 'large']),
  stairsFrom: z.number().min(0),
  stairsTo: z.number().min(0),
  elevatorFrom: z.boolean(),
  elevatorTo: z.boolean(),
  longCarry: z.boolean(),
  heavyItems: z.array(z.string()),
  distanceMiles: z.number().optional(),
  staging: z.boolean().optional(),
  packing: z.boolean().optional(),
});

export type GigPricingData = z.infer<typeof GigDataSchema>;

export type PricingModel = 'flat' | 'hourly';

export interface FlatPriceResult {
  pricing: 'flat';
  subtotalCents: number;
  taxesCents: number;
  totalCents: number;
  baseCents: number;
  longDistanceCents: number;
  stairsSurchargeCents: number;
  elevatorSurchargeCents: number;
  longCarryCents: number;
  heavyItemsCents: number;
  distanceSurchargeCents: number;
  stagingCents: number;
  packingCents: number;
}

export interface HourlyPriceResult {
  pricing: 'hourly';
  rateCentsPerHour: number;
  estimatedHours: number;
  subtotalCents: number;
  taxesCents: number;
  totalCents: number;
  minimumHours: number;
  stagingCents: number;
  packingCents: number;
}

export type PriceResult = FlatPriceResult | HourlyPriceResult;

// Base prices — kept identical to the intake form (landing/intake.html BASE_PRICES)
const BASE_PRICES_CENTS: Record<string, number> = {
  'few-items': 17500, // $175 — just a few items
  studio: 35000,    // $350 — studio apartment
  '1br': 50000,     // $500 — 1 bedroom
  '2br': 80000,     // $800 — 2 bedroom
  '3br+': 135000,   // $1,350 — 3 bedroom
  '4br': 160000,    // $1,600 — 4+ BR / full house
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
const STAIRS_SURCHARGE_CENTS_PER_FLIGHT = 5000;   // $50/flight (matches intake/admin)
const ELEVATOR_SURCHARGE_CENTS = 4000;             // $40 per location that has an elevator
const LONG_CARRY_SURCHARGE_CENTS = 5000;           // $50 for long carry (100+ ft)
const HEAVY_ITEM_SURCHARGE_CENTS = 7500;           // $75 per heavy/specialty item (default)
const TAX_RATE = 0.0825;                           // Texas sales tax 8.25%

// Staging surcharge — crew arranges/styles furniture (occupied-home staging, existing furniture).
// Industry: furniture arrangement ~$250/room; occupied staging $1,000-$3,000.
// Applied as a percentage of the move base (after crew/truck multipliers) so it scales with home size.
export const STAGING_SURCHARGE_PERCENT = 30;

// Packing service — crew brings boxes, materials & labor and packs everything.
// Applied as a percentage of the move base (after crew/truck multipliers) so it scales with home size.
export const PACKING_SURCHARGE_PERCENT = 25;

// Distance surcharge — Austin movers charge ~$1.00-$1.50/mile beyond 15 miles
export const DISTANCE_FREE_MILES = 15;
export const DISTANCE_PER_MILE_CENTS = 125;        // $1.25/mile over free miles

// Long-distance — moves at/above this distance multiply the base by 1.5x.
// Mirrors the intake form (LONG_DISTANCE_THRESHOLD / LONG_DISTANCE_MULTIPLIER).
export const LONG_DISTANCE_THRESHOLD_MILES = 50;
export const LONG_DISTANCE_MULTIPLIER = 1.5;

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
  'few-items': 1.5,
  studio: 2.5,
  '1br': 3.5,
  '2br': 5,
  '3br+': 7,
  '4br': 8.5,
  other: 0,
};

// Customer pays 100% upfront through the app. The platform keeps a platform
// fee and pays the worker the remainder after the job (via Stripe Connect).
export const PLATFORM_FEE_PERCENT = 15;

// Platform's cut in cents
export function platformFeeCents(totalCents: number): number {
  return Math.round(totalCents * (PLATFORM_FEE_PERCENT / 100));
}

// What the worker is paid after the job (total minus platform fee)
export function moverPayoutCents(totalCents: number): number {
  return totalCents - platformFeeCents(totalCents);
}

function heavyItemCost(item: string): number {
  return HEAVY_ITEM_PRICES[item] ?? HEAVY_ITEM_SURCHARGE_CENTS;
}

function distanceSurcharge(distanceMiles?: number | null): number {
  if (!distanceMiles || distanceMiles <= DISTANCE_FREE_MILES) return 0;
  return Math.round((distanceMiles - DISTANCE_FREE_MILES) * DISTANCE_PER_MILE_CENTS);
}

// Long-distance multiplier applied to the base (1.5x at/over the threshold).
function longDistanceMultiplier(distanceMiles?: number): number {
  return distanceMiles != null && distanceMiles >= LONG_DISTANCE_THRESHOLD_MILES
    ? LONG_DISTANCE_MULTIPLIER
    : 1;
}

export function priceFor(data: GigPricingData, model: PricingModel = 'flat'): PriceResult {
  const crewMult = CREW_MULTIPLIERS[data.crew] ?? 1;
  const truckMult = TRUCK_MULTIPLIERS[data.truck] ?? 1;

  if (model === 'hourly') {
    const rateCentsPerHour = Math.round(HOURLY_BASE_RATE_CENTS * crewMult * truckMult);
    const estimatedHours = ESTIMATED_HOURS[data.homeSize] ?? 2;
    const laborCents = Math.round(rateCentsPerHour * estimatedHours);
    const stagingCents = data.staging ? Math.round(laborCents * (STAGING_SURCHARGE_PERCENT / 100)) : 0;
    const packingCents = data.packing ? Math.round(laborCents * (PACKING_SURCHARGE_PERCENT / 100)) : 0;
    const subtotalCents = laborCents + stagingCents + packingCents;
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
      stagingCents,
      packingCents,
    };
  }

  // Flat rate — mirrors the intake form's calcQuote exactly.
  // Crew size and truck size do NOT affect the flat price (parity with the website).
  const baseCents = BASE_PRICES_CENTS[data.homeSize] ?? 50000;
  // Stairs are charged per flight (matches intake form).
  const stairsFlights = Math.max(0, data.stairsFrom + data.stairsTo);
  const stairsSurchargeCents = stairsFlights * STAIRS_SURCHARGE_CENTS_PER_FLIGHT;
  // Elevator at a location adds a flat fee per location (slower load via lift / dock walk).
  const elevatorSurchargeCents = ((data.elevatorFrom ? 1 : 0) + (data.elevatorTo ? 1 : 0)) * ELEVATOR_SURCHARGE_CENTS;
  const longCarryCents = data.longCarry ? LONG_CARRY_SURCHARGE_CENTS : 0;
  const heavyItemsCents = data.heavyItems.reduce((sum, item) => sum + heavyItemCost(item), 0);
  const distanceSurchargeCents = distanceSurcharge(data.distanceMiles);

  // Long-distance (>= 50 mi) multiplies the base by 1.5x before percentage add-ons.
  const adjustedBaseCents = baseCents * longDistanceMultiplier(data.distanceMiles);
  const longDistanceCents = Math.round(adjustedBaseCents - baseCents);
  const stagingCents = data.staging ? Math.round(adjustedBaseCents * (STAGING_SURCHARGE_PERCENT / 100)) : 0;
  const packingCents = data.packing ? Math.round(adjustedBaseCents * (PACKING_SURCHARGE_PERCENT / 100)) : 0;

  const subtotalCents = Math.round(adjustedBaseCents + stairsSurchargeCents + elevatorSurchargeCents + longCarryCents + heavyItemsCents + distanceSurchargeCents + stagingCents + packingCents);
  const taxesCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxesCents;

  return {
    pricing: 'flat',
    subtotalCents,
    taxesCents,
    totalCents,
    baseCents,
    longDistanceCents,
    stairsSurchargeCents,
    elevatorSurchargeCents,
    longCarryCents,
    heavyItemsCents,
    distanceSurchargeCents,
    stagingCents,
    packingCents,
  };
}

// Estimated job duration in hours — size-based labor time plus one-way loaded
// drive time (distance ÷ ~45 mph). Mirrors compute_gig_duration_hours() in
// supabase/migrations/042 (the DB value is authoritative; this is for the wizard).
export const DRIVE_MPH = 45;
export function estimatedDurationHours(homeSize: string | null | undefined, distanceMiles?: number | null): number {
  const base = ESTIMATED_HOURS[homeSize ?? ''] ?? 3;
  const drive = distanceMiles ? distanceMiles / DRIVE_MPH : 0;
  return Math.round((base + drive) * 10) / 10;
}

// Calculate total surcharges from a gig's data
export function surchargesFromGig(gig: {
  stairs_from: number;
  stairs_to: number;
  elevator_from?: boolean;
  elevator_to?: boolean;
  long_carry?: boolean;
  heavy_items?: string[];
  distance_miles?: number | null;
}): { stairsCents: number; longCarryCents: number; heavyItemsCents: number; distanceCents: number; totalCents: number } {
  // Stairs charged per flight, no elevator discount (matches intake form).
  const flights = Math.max(0, (gig.stairs_from || 0) + (gig.stairs_to || 0));
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
