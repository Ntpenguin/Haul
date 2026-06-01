// Stripe integration — wraps @stripe/stripe-react-native
//
// Payment model:
// - Customer pays 100% upfront through the app when a worker is accepted.
// - The platform keeps a platform fee and pays the worker the remainder
//   after the job is complete (via Stripe Connect; see lib/pricing.ts for
//   platformFeeCents/moverPayoutCents and the transfer-to-mover edge function).

export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
