// Hooks for gig CRUD operations

import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';
import { useGigDraftStore } from '../stores/gigDraft';
import { priceFor, type PricingModel } from '../lib/pricing';
import { sendToUser } from '../lib/notifications';
import type { Gig, GigApplication } from '../lib/supabase';

export function useGigs() {
  const profile = useAuthStore((s) => s.profile);

  async function createGig(pricingModel: PricingModel = 'flat'): Promise<string> {
    if (!profile) throw new Error('Must be signed in');
    const draft = useGigDraftStore.getState().draft;

    const price = priceFor(
      {
        homeSize: draft.home_size,
        crew: draft.crew_size,
        truck: draft.truck_size,
        stairsFrom: draft.stairs_from,
        stairsTo: draft.stairs_to,
        elevatorFrom: draft.elevator_from,
        elevatorTo: draft.elevator_to,
        longCarry: draft.long_carry,
        heavyItems: draft.heavy_items,
        distanceMiles: draft.distance_miles || undefined,
      },
      pricingModel,
    );

    // Build customer_notes with pickup/dropoff notes prepended
    const notesParts: string[] = [];
    if (draft.pickup_notes) notesParts.push(`PICKUP: ${draft.pickup_notes}`);
    if (draft.dropoff_notes) notesParts.push(`DROPOFF: ${draft.dropoff_notes}`);
    if (draft.customer_notes) notesParts.push(draft.customer_notes);
    const combinedNotes = notesParts.join('\n') || null;

    const { data, error } = await supabase
      .from('gigs')
      .insert({
        customer_id: profile.id,
        status: 'posted',
        from_address: draft.from_address,
        from_lat: draft.from_lat,
        from_lng: draft.from_lng,
        from_zip: draft.from_zip,
        to_address: draft.to_address,
        to_lat: draft.to_lat,
        to_lng: draft.to_lng,
        to_zip: draft.to_zip,
        distance_miles: draft.distance_miles,
        home_size: draft.home_size,
        rooms: draft.rooms,
        heavy_items: draft.heavy_items,
        crew_size: draft.crew_size,
        truck_size: draft.truck_size,
        stairs_from: draft.stairs_from,
        stairs_to: draft.stairs_to,
        elevator_from: draft.elevator_from,
        elevator_to: draft.elevator_to,
        long_carry: draft.long_carry,
        has_fragile_items: draft.has_fragile_items,
        scheduled_for: draft.scheduled_for,
        pricing_model: pricingModel,
        quoted_price_cents: price.totalCents,
        hourly_rate_cents: price.pricing === 'hourly' ? price.rateCentsPerHour : null,
        customer_notes: combinedNotes,
        gig_category: draft.gig_category,
        gig_title: draft.gig_title || null,
        gig_description: draft.gig_description || null,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  async function fetchMyGigs(): Promise<Gig[]> {
    if (!profile) return [];
    const { data, error } = await supabase
      .from('gigs')
      .select('*')
      .eq('customer_id', profile.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async function fetchAvailableGigs(zipCodes?: string[]): Promise<Gig[]> {
    let query = supabase
      .from('gigs')
      .select('*')
      .eq('status', 'posted')
      .order('created_at', { ascending: false });

    if (zipCodes?.length) {
      query = query.in('from_zip', zipCodes);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async function fetchGig(id: string): Promise<Gig | null> {
    const { data, error } = await supabase
      .from('gigs')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async function applyToGig(gigId: string, message?: string, counterOfferCents?: number) {
    if (!profile) throw new Error('Must be signed in');
    const { error } = await supabase
      .from('gig_applications')
      .insert({
        gig_id: gigId,
        mover_id: profile.id,
        message: message || null,
        quoted_price_cents: counterOfferCents || null,
      });
    if (error) throw error;

    // Notify the customer
    const { data: gig } = await supabase.from('gigs').select('customer_id').eq('id', gigId).single();
    if (gig?.customer_id) {
      sendToUser(gig.customer_id, 'New application 📬', 'A mover applied to your gig. Tap to review.', { gigId, role: 'customer' });
    }
  }

  async function acceptApplication(applicationId: string, gigId: string) {
    // Get the application to find the mover
    const { data: app, error: fetchErr } = await supabase
      .from('gig_applications')
      .select('mover_id')
      .eq('id', applicationId)
      .single();
    if (fetchErr) throw fetchErr;

    // Update application status
    const { error: appError } = await supabase
      .from('gig_applications')
      .update({ status: 'accepted' })
      .eq('id', applicationId);
    if (appError) throw appError;

    // Decline other applications
    await supabase
      .from('gig_applications')
      .update({ status: 'declined' })
      .eq('gig_id', gigId)
      .neq('id', applicationId);

    // Update gig status to matched and assign the mover
    await supabase
      .from('gigs')
      .update({ status: 'matched', mover_id: app.mover_id, matched_at: new Date().toISOString() })
      .eq('id', gigId);

    // Notify the mover
    sendToUser(app.mover_id, "You're accepted! 🎉", 'A customer accepted your application. Pay deposit to confirm.', { gigId, role: 'mover' });
  }

  async function fetchApplicationsForGig(gigId: string): Promise<GigApplication[]> {
    const { data, error } = await supabase
      .from('gig_applications')
      .select('*, profiles:mover_id(*)')
      .eq('gig_id', gigId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  return {
    createGig,
    fetchMyGigs,
    fetchAvailableGigs,
    fetchGig,
    applyToGig,
    acceptApplication,
    fetchApplicationsForGig,
  };
}
