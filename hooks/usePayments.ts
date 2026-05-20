// Payment hook — create payment intents and process payments via Stripe

import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';
import { useStripe } from '../lib/stripe-native';

export function usePayments() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const profile = useAuthStore((s) => s.profile);

  /**
   * Pay for a gig — creates a PaymentIntent server-side, then presents the Stripe payment sheet.
   * Returns true if payment succeeded, false otherwise.
   */
  async function payForGig(gigId: string, amountCents: number): Promise<boolean> {
    if (!profile) throw new Error('Must be signed in');

    // 1. Create PaymentIntent via Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('create-payment-intent', {
      body: { gig_id: gigId, amount_cents: amountCents },
    });

    if (error || !data?.clientSecret) {
      throw new Error(error?.message || 'Failed to create payment');
    }

    // 2. Initialize the payment sheet
    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: data.clientSecret,
      merchantDisplayName: 'Fast Fix Work',
      defaultBillingDetails: {
        email: profile.email || undefined,
      },
    });

    if (initError) {
      throw new Error(initError.message);
    }

    // 3. Present the payment sheet to the user
    const { error: presentError } = await presentPaymentSheet();

    if (presentError) {
      if (presentError.code === 'Canceled') {
        // User cancelled — not an error
        return false;
      }
      throw new Error(presentError.message);
    }

    // 4. Payment succeeded — the webhook/edge function will update the payment record
    return true;
  }

  /**
   * Fetch payment status for a gig
   */
  async function fetchPaymentForGig(gigId: string) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('gig_id', gigId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  return { payForGig, fetchPaymentForGig };
}
