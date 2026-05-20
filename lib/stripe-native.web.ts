// Web stub for @stripe/stripe-react-native (native-only SDK)
// Metro/Webpack picks .web.ts over .ts on web platform

import React from 'react';

export function StripeProvider({ children }: { children: React.ReactNode }) {
  return children as React.ReactElement;
}

export function useStripe() {
  return {
    initPaymentSheet: async (_opts: any) => ({ error: { message: 'Stripe payments are only available on mobile' } }),
    presentPaymentSheet: async () => ({ error: { code: 'Canceled', message: 'Not available on web' } }),
  };
}
