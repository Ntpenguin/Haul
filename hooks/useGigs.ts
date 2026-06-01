// Hooks for gig CRUD operations

import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';
import { useGigDraftStore } from '../stores/gigDraft';
import { priceFor, type PricingModel } from '../lib/pricing';
import { sendToUser } from '../lib/notifications';
import type { Gig, GigApplication } from '../lib/supabase';
import { hasVehicle } from '../lib/vehicleTypes';

export function useGigs() {
  const profile = useAuthStore((s) => s.profile);

  // Create the gig (or promote an existing draft row to 'posted').
  async function createGig(pricingModel: PricingModel = 'flat', draftId: string | null = null): Promise<string> {
    if (!profile) throw new Error('Must be signed in');
    const draft = useGigDraftStore.getState().draft;
    const row = { ...buildGigRow(draft, pricingModel), status: 'posted', draft_step: null };

    if (draftId) {
      const { data, error } = await supabase
        .from('gigs')
        .update(row)
        .eq('id', draftId)
        .eq('customer_id', profile.id)
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    }

    const { data, error } = await supabase
      .from('gigs')
      .insert({ ...row, customer_id: profile.id })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  // Persist in-progress wizard state as a 'draft' gig so abandoned gig
  // creation is visible in admin, tagged with the step they stopped on.
  // Best-effort: never throws, returns the (possibly new) draft id.
  async function saveDraft(draftId: string | null, draftStep: string): Promise<string | null> {
    if (!profile) return draftId;
    const draft = useGigDraftStore.getState().draft;
    // Wait until there's something meaningful (a pickup address) before saving.
    if (!draft.from_address?.trim()) return draftId;
    const row = { ...buildGigRow(draft, 'flat'), status: 'draft', draft_step: draftStep };
    try {
      if (draftId) {
        await supabase.from('gigs').update(row).eq('id', draftId).eq('customer_id', profile.id);
        return draftId;
      }
      const { data } = await supabase
        .from('gigs')
        .insert({ ...row, customer_id: profile.id })
        .select('id')
        .single();
      return data?.id ?? null;
    } catch {
      return draftId;
    }
  }

  async function fetchMyGigs(): Promise<Gig[]> {
    if (!profile) return [];
    const { data, error } = await supabase
      .from('gigs')
      .select('*')
      .eq('customer_id', profile.id)
      .neq('status', 'draft')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async function fetchAvailableGigs(zipCodes?: string[]): Promise<Gig[]> {
    // Fetch posted gigs + matched gigs that may still have open slots
    let query = supabase
      .from('gigs')
      .select('*')
      .in('status', ['posted', 'matched'])
      .order('created_at', { ascending: false });

    if (zipCodes?.length) {
      query = query.in('from_zip', zipCodes);
    }

    const { data: gigs, error } = await query;
    if (error) throw error;
    if (!gigs?.length) return [];

    // For matched gigs, check if slots are still open
    const matchedIds = gigs.filter(g => g.status === 'matched').map(g => g.id);
    if (!matchedIds.length) return gigs;

    const { data: accepted } = await supabase
      .from('gig_applications')
      .select('gig_id, slots_claimed')
      .in('gig_id', matchedIds)
      .eq('status', 'accepted');

    const slotsByGig: Record<string, number> = {};
    for (const a of accepted ?? []) {
      slotsByGig[a.gig_id] = (slotsByGig[a.gig_id] ?? 0) + (a.slots_claimed ?? 1);
    }

    return gigs.filter(g => {
      if (g.status === 'posted') return true;
      // Show matched gig only if crew isn't full yet
      return (slotsByGig[g.id] ?? 0) < (g.crew_size ?? 1);
    });
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
    // Load app + gig + current accepted apps in parallel
    const [appRes, gigRes, acceptedRes] = await Promise.all([
      supabase.from('gig_applications').select('mover_id, slots_claimed').eq('id', applicationId).single(),
      supabase.from('gigs').select('crew_size, truck_size, status').eq('id', gigId).single(),
      supabase.from('gig_applications').select('mover_id, slots_claimed, is_lead').eq('gig_id', gigId).eq('status', 'accepted'),
    ]);
    if (appRes.error) throw appRes.error;
    if (gigRes.error) throw gigRes.error;

    const app = appRes.data;
    const gig = gigRes.data;
    const acceptedApps = acceptedRes.data ?? [];

    const crewSize = gig.crew_size ?? 1;
    const acceptedSlots = acceptedApps.reduce((sum, a) => sum + (a.slots_claimed ?? 1), 0);
    const hasLead = acceptedApps.some(a => a.is_lead);
    const slotsToAdd = app.slots_claimed ?? 1;

    if (acceptedSlots + slotsToAdd > crewSize) {
      throw new Error('Crew is already full');
    }

    // Check vehicle requirement: if gig needs a truck and no lead yet, this mover must have a vehicle
    const requiresVehicle = !!(gig.truck_size && gig.truck_size !== 'none');
    if (!hasLead && requiresVehicle) {
      const { data: mp } = await supabase.from('mover_profiles').select('vehicle_type').eq('id', app.mover_id).maybeSingle();
      if (!hasVehicle(mp?.vehicle_type)) {
        throw new Error('A mover with a qualifying vehicle must be accepted first for this job.');
      }
    }

    // Determine if this mover becomes the lead
    const isLead = !hasLead;

    // Accept this application
    const { error: appErr } = await supabase
      .from('gig_applications')
      .update({ status: 'accepted', is_lead: isLead })
      .eq('id', applicationId);
    if (appErr) throw appErr;

    // Update gig: transition to matched on first accept; set mover_id to lead
    const gigUpdate: Record<string, any> = {};
    if (gig.status === 'posted') {
      gigUpdate.status = 'matched';
      gigUpdate.matched_at = new Date().toISOString();
    }
    if (isLead) {
      gigUpdate.mover_id = app.mover_id;
    }
    if (Object.keys(gigUpdate).length > 0) {
      await supabase.from('gigs').update(gigUpdate).eq('id', gigId);
    }

    // Notify the mover
    sendToUser(app.mover_id, "You're accepted!", 'A customer accepted your application. Check the app for details.', { gigId, role: 'mover' });
  }

  async function fetchApplicationsForGig(gigId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('gig_applications')
      .select('*, profiles:mover_id(*)')
      .eq('gig_id', gigId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data?.length) return [];

    // Fetch vehicle types for all applicants
    const moverIds = data.map(a => a.mover_id);
    const { data: moverProfiles } = await supabase
      .from('mover_profiles')
      .select('id, vehicle_type, vehicle_make_model')
      .in('id', moverIds);

    const vehicleMap: Record<string, { type: string | null; makeModel: string | null }> = {};
    for (const mp of moverProfiles ?? []) {
      vehicleMap[mp.id] = { type: mp.vehicle_type ?? null, makeModel: mp.vehicle_make_model ?? null };
    }

    return data.map(a => ({
      ...a,
      vehicle_type: vehicleMap[a.mover_id]?.type ?? null,
      vehicle_make_model: vehicleMap[a.mover_id]?.makeModel ?? null,
    }));
  }

  return {
    createGig,
    saveDraft,
    fetchMyGigs,
    fetchAvailableGigs,
    fetchGig,
    applyToGig,
    acceptApplication,
    fetchApplicationsForGig,
  };
}

// Build the shared gig column values from the wizard draft. Used both for the
// final posted gig and for the in-progress 'draft' row.
function buildGigRow(draft: ReturnType<typeof useGigDraftStore.getState>['draft'], pricingModel: PricingModel) {
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
      staging: draft.staging,
      packing: draft.packing_service,
    },
    pricingModel,
  );

  const notesParts: string[] = [];
  if (draft.pickup_notes) notesParts.push(`PICKUP: ${draft.pickup_notes}`);
  if (draft.dropoff_notes) notesParts.push(`DROPOFF: ${draft.dropoff_notes}`);
  if (draft.customer_notes) notesParts.push(draft.customer_notes);
  const combinedNotes = notesParts.join('\n') || null;

  return {
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
    staging: draft.staging,
    packing_service: draft.packing_service,
    has_fragile_items: draft.has_fragile_items,
    scheduled_for: draft.scheduled_for,
    pricing_model: pricingModel,
    quoted_price_cents: price.totalCents,
    hourly_rate_cents: price.pricing === 'hourly' ? price.rateCentsPerHour : null,
    customer_notes: combinedNotes,
    gig_category: draft.gig_category,
    gig_title: autoGigTitle(draft),
    gig_description: null,
  };
}

function autoGigTitle(draft: ReturnType<typeof useGigDraftStore.getState>['draft']): string {
  const sizeLabel: Record<string, string> = {
    item: 'Single Item',
    studio: 'Studio',
    '1br': '1BR',
    '2br': '2BR',
    '3br': '3BR',
    '4br': '4BR+',
    other: 'Move',
  };
  const category = draft.gig_category ?? 'moving';
  const size = draft.home_size ? (sizeLabel[draft.home_size] ?? 'Move') : 'Move';
  const label = category === 'moving' ? `${size} Move` : category.charAt(0).toUpperCase() + category.slice(1);

  const when = draft.scheduled_for
    ? (() => {
        const d = new Date(draft.scheduled_for);
        const mon = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const hr = d.getHours();
        const period = hr < 12 ? 'AM' : 'PM';
        return `${mon} ${period}`;
      })()
    : 'ASAP';

  return `${label} – ${when}`;
}
