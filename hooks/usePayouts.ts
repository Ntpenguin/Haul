// Hook for Stripe Connect payout onboarding + cashing out completed gigs.

import { Linking } from 'react-native';
import { supabase } from '../lib/supabase';

export type ConnectStatus = {
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};

export function usePayouts() {
  // Start (or resume) Stripe Connect onboarding. Opens Stripe's hosted flow in
  // the device browser; returns true once the link was opened.
  async function startOnboarding(): Promise<boolean> {
    const { data, error } = await supabase.functions.invoke('connect-onboard', { body: {} });
    if (error || !data?.url) throw new Error(error?.message || 'Could not start payout setup');
    await Linking.openURL(data.url);
    return true;
  }

  // Refresh the mover's Connect status from Stripe (also persists the flags).
  async function refreshStatus(): Promise<ConnectStatus> {
    const { data, error } = await supabase.functions.invoke('connect-status', { body: {} });
    if (error) throw new Error(error.message || 'Could not check payout status');
    return data as ConnectStatus;
  }

  // Trigger the payout for a completed, paid gig. Returns the transfer id.
  async function cashOut(gigId: string): Promise<{ transfer_id?: string; already?: boolean }> {
    const { data, error } = await supabase.functions.invoke('transfer-to-mover', { body: { gig_id: gigId } });
    if (error) throw new Error(error.message || 'Payout failed');
    return data;
  }

  return { startOnboarding, refreshStatus, cashOut };
}
