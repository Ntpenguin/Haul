// Stripe integration — wraps @stripe/stripe-react-native
//
// Payment model:
// - Customer pays 10% deposit through the app when a worker is accepted
// - The remaining 90% is settled directly between customer and worker offline

export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

// Deposit percentage taken through the app
export const DEPOSIT_PERCENT = 10;

// Calculate deposit in cents (what the customer pays through Stripe)
export function depositCents(totalCents: number): number {
  return Math.round(totalCents * (DEPOSIT_PERCENT / 100));
}

// Calculate remainder owed directly to worker offline
export function remainderCents(totalCents: number): number {
  return totalCents - depositCents(totalCents);
}

// Legacy aliases — keep workerPayoutCents for any remaining references
// Worker gets the full quoted price (90% offline + they keep whatever is settled)
export function workerPayoutCents(totalCents: number): number {
  return totalCents;
}

export function platformFeeCents(totalCents: number): number {
  return depositCents(totalCents);
}
