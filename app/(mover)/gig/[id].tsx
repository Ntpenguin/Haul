import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TextInput, Alert, TouchableOpacity, Image, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useUploadPhoto } from '../../../hooks/useUploadPhoto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Avatar, Tag } from '../../../components/primitives';
import { colors, radii } from '../../../lib/theme';
import { useGigs } from '../../../hooks/useGigs';
import { useAuthStore } from '../../../stores/auth';
import { supabase } from '../../../lib/supabase';
import { formatCents, moverPayoutCents, surchargesFromGig } from '../../../lib/pricing';
import * as Location from 'expo-location';
import { LOCATION_TASK } from '../../../lib/locationTask';
import { sendToUser } from '../../../lib/notifications';
import { StaticMap } from '../../../components/StaticMap';
import type { Gig, GigPhoto } from '../../../lib/supabase';

export default function MoverGigDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { fetchGig, applyToGig } = useGigs();
  const profile = useAuthStore((s) => s.profile);
  const [gig, setGig] = useState<Gig | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<GigPhoto[]>([]);
  const [waivedSurcharges, setWaivedSurcharges] = useState<Record<string, boolean>>({});
  const [counterOffer, setCounterOffer] = useState(false);
  const [counterPrice, setCounterPrice] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [existingReview, setExistingReview] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [myApplicationId, setMyApplicationId] = useState<string | null>(null);
  const [myApplicationStatus, setMyApplicationStatus] = useState<string | null>(null);
  const [openSlots, setOpenSlots] = useState<number>(0);
  const [checklist, setChecklist] = useState<Record<string, { wrapped: boolean; padded: boolean; assembled: boolean; disassembled: boolean; waived: boolean; junkRemoved: boolean }>>({});
  const [equipmentChecklist, setEquipmentChecklist] = useState<Record<string, boolean>>({});
  const [uploadingPhase, setUploadingPhase] = useState<string | null>(null);
  const [customerBlocked, setCustomerBlocked] = useState(false);
  const [customerProfile, setCustomerProfile] = useState<{ full_name: string | null; phone: string | null } | null>(null);
  const { uploadGigPhoto } = useUploadPhoto();

  useEffect(() => {
    async function load() {
      try {
        const g = await fetchGig(id);
        setGig(g);
        // Fetch photos
        const { data: photoData } = await supabase
          .from('gig_photos')
          .select('*')
          .eq('gig_id', id);
        if (photoData) setPhotos(photoData);
        // Check own application status
        if (profile?.id) {
          const { data: myApp } = await supabase
            .from('gig_applications')
            .select('id, status')
            .eq('gig_id', id)
            .eq('mover_id', profile.id)
            .maybeSingle();
          if (myApp) {
            setApplied(true);
            setMyApplicationId(myApp.id);
            setMyApplicationStatus(myApp.status);
          }
        }
        // Compute open slots for matched gigs
        if (g?.status === 'matched') {
          const { data: accepted } = await supabase
            .from('gig_applications')
            .select('slots_claimed')
            .eq('gig_id', id)
            .eq('status', 'accepted');
          const filled = (accepted ?? []).reduce((sum: number, a: any) => sum + (a.slots_claimed ?? 1), 0);
          setOpenSlots(Math.max(0, (g.crew_size ?? 1) - filled));
        }
        // Fetch existing review
        if (profile?.id) {
          const { data: reviewData } = await supabase
            .from('reviews')
            .select('*')
            .eq('gig_id', id)
            .eq('reviewer_id', profile.id)
            .maybeSingle();
          if (reviewData) setExistingReview(reviewData);
        }
        // Load customer profile for calendar title
        if (g?.customer_id) {
          const { data: cp } = await supabase.from('profiles').select('full_name, phone').eq('id', g.customer_id).maybeSingle();
          if (cp) setCustomerProfile(cp);
        }
        // Check if customer is blocked
        if (profile?.id && g?.customer_id) {
          const { data: blockRow } = await supabase
            .from('user_blocks')
            .select('id')
            .eq('blocker_id', profile.id)
            .eq('blocked_id', g.customer_id)
            .maybeSingle();
          if (blockRow) setCustomerBlocked(true);
        }
      } catch {}
      setLoading(false);
    }
    load();
  }, [id]);

  function toggleChecklistItem(itemId: string, field: string) {
    setChecklist(prev => ({
      ...prev,
      [itemId]: {
        wrapped: false, padded: false, assembled: false, disassembled: false, waived: false, junkRemoved: false,
        ...prev[itemId],
        [field]: !(prev[itemId]?.[field as keyof typeof prev[typeof itemId]] ?? false),
      },
    }));
  }

  async function handleApply() {
    if (!gig) return;
    setApplying(true);
    try {
      const surcharges = surchargesFromGig(gig);
      let offerCents: number | undefined;
      if (counterOffer && counterPrice) {
        offerCents = Math.round(parseFloat(counterPrice) * 100);
      } else {
        const waivedTotal =
          (waivedSurcharges.stairs ? surcharges.stairsCents : 0) +
          (waivedSurcharges.longCarry ? surcharges.longCarryCents : 0) +
          (waivedSurcharges.heavyItems ? surcharges.heavyItemsCents : 0);
        if (waivedTotal > 0 && gig.quoted_price_cents) {
          offerCents = gig.quoted_price_cents - waivedTotal;
        }
      }
      await applyToGig(gig.id, message || undefined, offerCents);
      setApplied(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to apply');
    } finally {
      setApplying(false);
    }
  }

  async function submitReview() {
    if (!gig?.customer_id || reviewRating === 0) return;
    setSubmittingReview(true);
    try {
      const { error } = await supabase.from('reviews').insert({
        gig_id: id,
        reviewer_id: profile?.id,
        reviewee_id: gig.customer_id,
        rating: reviewRating,
        comment: reviewComment || null,
      });
      if (error) throw error;
      setExistingReview({ rating: reviewRating, comment: reviewComment });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit review');
    } finally {
      setSubmittingReview(false);
    }
  }

  async function handleComplete() {
    if (!gig) return;
    Alert.alert('Mark job complete', 'Confirm the job is fully done and the customer is satisfied?', [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Complete', onPress: async () => {
          setCompleting(true);
          try {
            const { error } = await supabase
              .from('gigs')
              .update({ status: 'completed', completed_at: new Date().toISOString() })
              .eq('id', gig.id);
            if (error) throw error;
            setGig({ ...gig, status: 'completed' });
            if (gig.customer_id) {
              sendToUser(gig.customer_id, 'Job complete! ✅', 'Your move is done. Tap to leave a review.', { gigId: gig.id, role: 'customer' });
            }
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to complete job');
          } finally {
            setCompleting(false);
          }
        },
      },
    ]);
  }

  async function startTracking() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow location access to share your position with the customer.');
      return;
    }

    // Immediate one-time update so the customer sees the mover right away
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    if (profile?.id && gig?.id) {
      await supabase.from('mover_locations').upsert(
        { mover_id: profile.id, gig_id: gig.id, lat: loc.coords.latitude, lng: loc.coords.longitude, updated_at: new Date().toISOString() },
        { onConflict: 'mover_id' }
      );
    }
    setTracking(true);

    // Continuous background updates so the customer keeps seeing the mover
    // approach even when the app is backgrounded. The background task
    // (lib/locationTask.native.ts) upserts each fix to mover_locations.
    if (Platform.OS === 'web') return;
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== 'granted') return; // foreground sharing still works
      const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
      if (!alreadyStarted) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 15000,
          distanceInterval: 30,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Fast Fix Work',
            notificationBody: 'Sharing your location with the customer during this job.',
            notificationColor: '#C98B3F',
          },
        });
      }
    } catch (err) {
      // Background updates are best-effort; foreground sharing already active.
    }
  }

  async function stopTracking() {
    setTracking(false);
    if (Platform.OS !== 'web') {
      try {
        const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
        if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      } catch {
        // ignore — task may not have been started
      }
    }
    if (profile?.id) supabase.from('mover_locations').delete().eq('mover_id', profile.id);
  }


  async function handleCancelJob() {
    if (!gig) return;
    Alert.alert('Leave job', 'Are you sure you want to withdraw from this job?', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Withdraw', style: 'destructive', onPress: async () => {
          setCancelling(true);
          try {
            if (isLead) {
              // Lead mover uses RPC (nulls gig.mover_id, bypasses RLS)
              const { error } = await supabase.rpc('withdraw_from_gig', { p_gig_id: gig.id });
              if (error) throw error;
            } else if (myApplicationId) {
              // Non-lead: just update own application
              const { error } = await supabase
                .from('gig_applications')
                .update({ status: 'withdrawn' })
                .eq('id', myApplicationId);
              if (error) throw error;
            }
            router.back();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to withdraw');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent.base} />
      </View>
    );
  }

  if (!gig) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 80 }}>
        <Text onPress={() => router.back()} style={{ fontSize: 16, color: colors.ink2, fontWeight: '500', marginBottom: 20 }}>← Back</Text>
        <Text style={{ fontSize: 18, color: colors.ink3 }}>Job not found</Text>
      </View>
    );
  }

  const isAsap = gig ? !gig.scheduled_for : true;
  const isMyJob = myApplicationStatus === 'accepted';
  const isLead = isMyJob && gig?.mover_id === profile?.id;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
        {/* Map */}
        <View style={{ height: 220 }}>
          {gig.from_lat && gig.to_lat ? (
            <StaticMap
              fromLat={gig.from_lat}
              fromLng={gig.from_lng!}
              toLat={gig.to_lat}
              toLng={gig.to_lng}
              height={220}
              borderRadius={0}
            />
          ) : (
            <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="map-outline" size={48} color={colors.ink4} />
            </View>
          )}
          <View style={{ position: 'absolute', top: 54, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
            <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={18} color={colors.ink} />
            </TouchableOpacity>
            {gig.distance_miles && (
              <View style={{ paddingHorizontal: 14, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>{gig.distance_miles} mi</Text>
              </View>
            )}
          </View>
        </View>

        {/* Street view buttons */}
        {gig.from_lat && gig.to_lat && (
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => Linking.openURL(`https://maps.google.com/?layer=c&cbll=${gig.from_lat},${gig.from_lng}`)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.9)' }}
            >
              <Ionicons name="eye-outline" size={16} color={colors.ink2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink2 }}>Pickup view</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Linking.openURL(`https://maps.google.com/?layer=c&cbll=${gig.to_lat},${gig.to_lng}`)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.9)' }}
            >
              <Ionicons name="eye-outline" size={16} color={colors.ink2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink2 }}>Dropoff view</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Content */}
        <View style={{ marginTop: -28, backgroundColor: colors.bg, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 18 }}>
          {/* Pay */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase' }}>Job pays</Text>
              <Text style={{ fontSize: 42, fontWeight: '700', color: colors.ink, letterSpacing: -1, marginTop: 4 }}>
                {gig.quoted_price_cents ? formatCents(gig.quoted_price_cents) : 'TBD'}
              </Text>
              {gig.quoted_price_cents ? (
                <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 4 }}>
                  {formatCents(moverPayoutCents(gig.quoted_price_cents))} paid out to you after the job (15% service fee)
                </Text>
              ) : null}
            </View>
            <Tag color={isAsap ? 'warn' : 'neutral'}>{isAsap ? 'ASAP' : 'SCHEDULED'}</Tag>
          </View>

          {/* Payment info */}
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.accent.soft, flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent.deep} />
            <Text style={{ flex: 1, fontSize: 13, color: colors.accent.deep, fontWeight: '500' }}>
              Customers pay in full through the app. You're paid out after the job is complete, minus a 15% service fee.
            </Text>
          </View>

          {/* Route */}
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Route</Text>
          <Card style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ paddingTop: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink }} />
                <View style={{ width: 2, height: 28, backgroundColor: colors.line2, marginVertical: 3, alignSelf: 'center' }} />
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.accent.base }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{gig.from_address}</Text>
                <View style={{ height: 18 }} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{gig.to_address}</Text>
              </View>
            </View>
          </Card>

          {/* Details */}
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Details</Text>
          <Card style={{ marginBottom: 14 }}>
            {gig.home_size && <DetailRow icon="home-outline" label="Size" value={gig.home_size} />}
            <DetailRow
              icon="people-outline"
              label="Crew"
              value={gig.status === 'matched' && !isMyJob
                ? `${openSlots} of ${gig.crew_size || 1} spots open`
                : `${gig.crew_size || 1} needed`}
            />
            {gig.truck_size && gig.truck_size !== 'none' && <DetailRow icon="car-outline" label="Vehicle" value={gig.truck_size} />}
            <DetailRow icon="calendar-outline" label="When" value={isAsap ? 'ASAP' : new Date(gig.scheduled_for!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} />
            <DetailRow icon="trending-up-outline" label="Stairs" value={`${gig.stairs_from} up, ${gig.stairs_to} down`} />
            {gig.staging && <DetailRow icon="color-palette-outline" label="Home staging" value="Arrange & style furniture" />}
            {gig.packing_service && <DetailRow icon="cube-outline" label="Packing service" value="Crew packs everything" />}
            {gig.heavy_items?.length > 0 && <DetailRow icon="barbell-outline" label="Heavy items" value={gig.heavy_items.join(', ')} last />}
          </Card>

          {/* Add to calendar */}
          {gig.scheduled_for && (
            <TouchableOpacity
              onPress={() => {
                const start = new Date(gig.scheduled_for!);
                const durationHours = gig.home_size === 'item' || gig.home_size === 'studio' ? 2 : gig.home_size === '1br' ? 3 : gig.home_size === '2br' ? 4 : 6;
                const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
                const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                const title = [customerProfile?.full_name, customerProfile?.phone].filter(Boolean).join(' — ') || `Moving job — ${gig.home_size || 'Move'}`;
                const photoLines = photos.length
                  ? '\n\n📸 Photos:\n' + photos.map((p: any) => `${p.phase ? p.phase.charAt(0).toUpperCase() + p.phase.slice(1) : 'Photo'}: ${p.url}`).join('\n')
                  : '';
                const details = [
                  `From: ${gig.from_address}`,
                  `To: ${gig.to_address}`,
                  gig.truck_size && gig.truck_size !== 'none' ? `Vehicle: ${gig.truck_size} truck` : '',
                  gig.stairs_from || gig.stairs_to ? `Stairs: ${gig.stairs_from} up / ${gig.stairs_to} down` : '',
                  gig.customer_notes ? `Notes: ${gig.customer_notes}` : '',
                  gig.quoted_price_cents ? `Pay: $${(gig.quoted_price_cents / 100).toFixed(2)}` : '',
                  photoLines,
                ].filter(Boolean).join('\n');
                const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(start)}/${fmt(end)}&location=${encodeURIComponent(gig.from_address)}&details=${encodeURIComponent(details)}`;
                Linking.openURL(url);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: 14, borderRadius: 12,
                backgroundColor: colors.sage.soft, marginBottom: 14,
              }}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.sage.deep} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.sage.deep }}>Add to Google Calendar</Text>
            </TouchableOpacity>
          )}

          {/* Customer notes */}
          {gig.customer_notes && (
            <>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Customer notes</Text>
              <Card style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 14, color: colors.ink, lineHeight: 22 }}>{gig.customer_notes}</Text>
              </Card>
            </>
          )}

          {/* Photos */}
          {photos.length > 0 && (
            <Card style={{ padding: 16, marginBottom: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>
                Job Photos ({photos.length})
              </Text>
              {([
                { phase: 'inspection', label: 'Inspection / Start' },
                { phase: 'loading', label: 'Pickup Location' },
                { phase: 'dropoff', label: 'Dropoff Location' },
              ] as const).map(({ phase, label }) => {
                const pp = photos.filter((p: any) => p.phase === phase);
                if (!pp.length) return null;
                return (
                  <View key={phase} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink }}>{label}</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {pp.map((p: any) => (
                          <Image key={p.id} source={{ uri: p.url }} style={{ width: 100, height: 100, borderRadius: 10, backgroundColor: colors.surface }} />
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                );
              })}
              {photos.filter((p: any) => !p.phase).map((p: any) => (
                <Image key={p.id} source={{ uri: p.url }} style={{ width: 100, height: 100, borderRadius: 10, backgroundColor: colors.surface, marginRight: 8 }} />
              ))}
            </Card>
          )}

          {/* Status banner */}
          {isMyJob ? (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: '#E8F5E9', flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: colors.success, fontWeight: '600' }}>
                  {gig?.status === 'in_progress' ? 'Job in progress' : `You're on this job${isLead ? ' (lead)' : ''}`}
                </Text>
                {!isLead && (
                  <Text style={{ fontSize: 12, color: colors.success, marginTop: 2 }}>Muscle — coordinate with the lead mover</Text>
                )}
              </View>
            </View>
          ) : applied ? (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.accent.soft, flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <Ionicons name="time-outline" size={20} color={colors.accent.deep} />
              <Text style={{ flex: 1, fontSize: 14, color: colors.accent.deep, fontWeight: '600' }}>
                Applied — waiting for customer review
              </Text>
            </View>
          ) : gig?.status === 'matched' && openSlots > 0 ? (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: '#FFF8E7', flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <Ionicons name="people-outline" size={20} color="#B45309" />
              <Text style={{ flex: 1, fontSize: 14, color: '#B45309', fontWeight: '600' }}>
                {openSlots} spot{openSlots > 1 ? 's' : ''} still open — apply to join this crew
              </Text>
            </View>
          ) : null}

          {/* Customer contact — only show when accepted on this job */}
          {isMyJob && (
            <Card style={{ padding: 16, marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>
                Your customer
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar initials={(customerProfile?.full_name || 'C').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{customerProfile?.full_name || 'Customer'}</Text>
                  {customerProfile?.phone ? (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${customerProfile.phone}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Ionicons name="call" size={14} color={colors.accent.base} />
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent.base }}>{customerProfile.phone}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/(mover)/gig/chat', params: { gigId: gig.id, customerName: customerProfile?.full_name || 'Customer' } })}
                style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.accent.soft }}
              >
                <Ionicons name="chatbubble-outline" size={16} color={colors.accent.deep} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent.deep }}>Message {customerProfile?.full_name?.split(' ')[0] || 'Customer'}</Text>
              </TouchableOpacity>
            </Card>
          )}

          {/* Equipment & safety checklist */}
          {isMyJob && ['matched', 'in_progress'].includes(gig?.status || '') && (() => {
            const EQUIPMENT_ITEMS = [
              { key: 'blankets', label: 'Moving blankets / furniture pads', icon: 'layers-outline' },
              { key: 'dolly', label: 'Dolly / hand truck', icon: 'arrow-up-outline' },
              { key: 'straps', label: 'Tie-down straps', icon: 'link-outline' },
              { key: 'tape', label: 'Packing tape', icon: 'cut-outline' },
              { key: 'shrinkWrap', label: 'Shrink wrap', icon: 'repeat-outline' },
              { key: 'toolkit', label: 'Tool kit (for disassembly)', icon: 'construct-outline' },
              { key: 'gloves', label: 'Safety gloves', icon: 'hand-left-outline' },
              { key: 'firstAid', label: 'First aid kit', icon: 'medkit-outline' },
            ] as const;
            return (
              <Card style={{ padding: 16, marginBottom: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
                  Equipment & Safety
                </Text>
                <Text style={{ fontSize: 12, color: colors.ink4, marginBottom: 14, lineHeight: 18 }}>
                  Confirm you have all equipment before heading out. Required to unlock "I'm on my way".
                </Text>
                <View style={{ gap: 4 }}>
                  {EQUIPMENT_ITEMS.map(({ key, label, icon }) => {
                    const checked = !!equipmentChecklist[key];
                    return (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setEquipmentChecklist(prev => ({ ...prev, [key]: !prev[key] }))}
                        activeOpacity={0.7}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 }}
                      >
                        <View style={{
                          width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                          borderColor: checked ? colors.success : colors.line2,
                          backgroundColor: checked ? colors.success : 'transparent',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </View>
                        <Ionicons name={icon as any} size={16} color={colors.ink2} />
                        <Text style={{ fontSize: 14, color: checked ? colors.ink3 : colors.ink, textDecorationLine: checked ? 'line-through' : 'none' }}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Card>
            );
          })()}

          {/* Mover checklist */}
          {isMyJob && (gig?.status === 'in_progress' || gig?.status === 'matched') && (
            <Card style={{ padding: 16, marginBottom: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>
                Item checklist
              </Text>
              {(gig?.heavy_items?.length ? gig.heavy_items : ['General items']).map((item) => {
                const state = checklist[item] || { wrapped: false, padded: false, assembled: false, disassembled: false, waived: false, junkRemoved: false };
                const checks = [
                  { key: 'wrapped', label: 'Wrapped / Protected', icon: 'shield-outline' },
                  { key: 'padded', label: 'Padded', icon: 'layers-outline' },
                  { key: 'assembled', label: 'Assembled', icon: 'construct-outline' },
                  { key: 'disassembled', label: 'Disassembled', icon: 'build-outline' },
                  { key: 'waived', label: 'Waived from protection', icon: 'close-circle-outline' },
                  { key: 'junkRemoved', label: 'Junk removed', icon: 'trash-outline' },
                ];
                return (
                  <View key={item} style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 8, textTransform: 'capitalize' }}>{item}</Text>
                    <View style={{ gap: 6, paddingLeft: 8 }}>
                      {checks.map(({ key, label, icon }) => (
                        <TouchableOpacity
                          key={key}
                          onPress={() => toggleChecklistItem(item, key)}
                          activeOpacity={0.7}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}
                        >
                          <View style={{
                            width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                            borderColor: (state as any)[key] ? colors.success : colors.line2,
                            backgroundColor: (state as any)[key] ? colors.success : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            {(state as any)[key] && <Ionicons name="checkmark" size={14} color="#fff" />}
                          </View>
                          <Ionicons name={icon as any} size={16} color={colors.ink2} />
                          <Text style={{ fontSize: 14, color: (state as any)[key] ? colors.ink3 : colors.ink, textDecorationLine: (state as any)[key] ? 'line-through' : 'none' }}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })}
            </Card>
          )}

          {/* Job phase photos */}
          {isMyJob && (gig?.status === 'in_progress' || gig?.status === 'matched') && (
            <Card style={{ padding: 16, marginBottom: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
                Job Photos
              </Text>
              <Text style={{ fontSize: 12, color: colors.ink4, marginBottom: 14, lineHeight: 18 }}>
                Required: upload photos at pickup and dropoff locations before marking complete.
              </Text>
              {([
                { phase: 'inspection', label: 'Inspection / Start', icon: 'eye-outline', desc: 'Photo before any items are moved' },
                { phase: 'loading', label: 'Pickup Location', icon: 'car-outline', desc: 'Items loaded at the pickup address' },
                { phase: 'dropoff', label: 'Dropoff Location', icon: 'home-outline', desc: 'Items placed at the dropoff address' },
              ] as const).map(({ phase, label, icon, desc }) => {
                const phasePhotos = photos.filter((p: any) => p.phase === phase);
                const isUploading = uploadingPhase === phase;
                return (
                  <View key={phase} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: phasePhotos.length > 0 ? colors.sage.soft : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={phasePhotos.length > 0 ? 'checkmark-circle' : icon} size={16} color={phasePhotos.length > 0 ? colors.sage.deep : colors.ink3} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{label}</Text>
                        <Text style={{ fontSize: 11, color: colors.ink4 }}>{desc}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={async () => {
                          const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.8 });
                          if (result.canceled || !result.assets[0]) return;
                          setUploadingPhase(phase);
                          try {
                            const url = await uploadGigPhoto(result.assets[0].uri, id, label, phase);
                            setPhotos(prev => [...prev, { id: Date.now().toString(), gig_id: id, url, label, phase, position: null, created_at: new Date().toISOString() } as any]);
                          } catch (err: any) {
                            Alert.alert('Upload failed', err.message || 'Could not upload photo');
                          } finally {
                            setUploadingPhase(null);
                          }
                        }}
                        disabled={isUploading}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.accent.soft, borderWidth: 1, borderColor: colors.accent.base }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent.deep }}>
                          {isUploading ? 'Uploading…' : phasePhotos.length > 0 ? '+ Add' : 'Upload'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {phasePhotos.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: 36 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {phasePhotos.map((p: any) => (
                            <Image key={p.id} source={{ uri: p.url }} style={{ width: 80, height: 80, borderRadius: 10, backgroundColor: colors.surface }} />
                          ))}
                        </View>
                      </ScrollView>
                    )}
                  </View>
                );
              })}
            </Card>
          )}

          {/* Review */}
          {isMyJob && gig?.status === 'completed' && (
            <Card style={{ padding: 16, marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
                {existingReview ? 'Your review' : 'Leave a review'}
              </Text>
              {existingReview ? (
                <View>
                  <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
                    {[1,2,3,4,5].map(s => (
                      <Ionicons key={s} name={s <= existingReview.rating ? 'star' : 'star-outline'} size={24} color={colors.accent.base} />
                    ))}
                  </View>
                  {existingReview.comment && (
                    <Text style={{ fontSize: 14, color: colors.ink2, fontStyle: 'italic' }}>"{existingReview.comment}"</Text>
                  )}
                </View>
              ) : (
                <View>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    {[1,2,3,4,5].map(s => (
                      <TouchableOpacity key={s} onPress={() => setReviewRating(s)}>
                        <Ionicons name={s <= reviewRating ? 'star' : 'star-outline'} size={32} color={colors.accent.base} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    value={reviewComment}
                    onChangeText={setReviewComment}
                    placeholder="How was your experience? (optional)"
                    placeholderTextColor={colors.ink4}
                    multiline
                    style={{ minHeight: 60, padding: 12, borderRadius: 12, backgroundColor: colors.surface, fontSize: 14, color: colors.ink, marginBottom: 12 }}
                  />
                  <Button onPress={submitReview} loading={submittingReview} disabled={reviewRating === 0}>
                    Submit review
                  </Button>
                </View>
              )}
            </Card>
          )}

          {/* Waive surcharges — only show if gig has surcharges and worker hasn't applied */}
          {!applied && !isMyJob && gig && (() => {
            const surcharges = surchargesFromGig(gig);
            if (surcharges.totalCents === 0) return null;
            const hasAnyWaived = Object.values(waivedSurcharges).some(Boolean);
            const waivedTotal =
              (waivedSurcharges.stairs ? surcharges.stairsCents : 0) +
              (waivedSurcharges.longCarry ? surcharges.longCarryCents : 0) +
              (waivedSurcharges.heavyItems ? surcharges.heavyItemsCents : 0);

            function toggleSurcharge(key: string) {
              setWaivedSurcharges((prev) => ({ ...prev, [key]: !prev[key] }));
              setCounterOffer(false);
              setCounterPrice('');
            }

            return (
              <Card style={{ padding: 16, marginBottom: 14 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 4 }}>Waive surcharges</Text>
                <Text style={{ fontSize: 13, color: colors.ink3, marginBottom: 12 }}>
                  Select surcharges to waive and be more competitive
                </Text>
                {surcharges.stairsCents > 0 && (
                  <TouchableOpacity
                    onPress={() => toggleSurcharge('stairs')}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
                  >
                    <View style={{
                      width: 24, height: 24, borderRadius: 6, borderWidth: 2,
                      borderColor: waivedSurcharges.stairs ? colors.accent.base : colors.line2,
                      backgroundColor: waivedSurcharges.stairs ? colors.accent.base : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {waivedSurcharges.stairs && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: colors.ink }}>Waive stairs surcharge</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: waivedSurcharges.stairs ? colors.ink3 : colors.ink, textDecorationLine: waivedSurcharges.stairs ? 'line-through' : 'none' }}>
                      {formatCents(surcharges.stairsCents)}
                    </Text>
                  </TouchableOpacity>
                )}
                {surcharges.longCarryCents > 0 && (
                  <TouchableOpacity
                    onPress={() => toggleSurcharge('longCarry')}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
                  >
                    <View style={{
                      width: 24, height: 24, borderRadius: 6, borderWidth: 2,
                      borderColor: waivedSurcharges.longCarry ? colors.accent.base : colors.line2,
                      backgroundColor: waivedSurcharges.longCarry ? colors.accent.base : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {waivedSurcharges.longCarry && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: colors.ink }}>Waive long carry</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: waivedSurcharges.longCarry ? colors.ink3 : colors.ink, textDecorationLine: waivedSurcharges.longCarry ? 'line-through' : 'none' }}>
                      {formatCents(surcharges.longCarryCents)}
                    </Text>
                  </TouchableOpacity>
                )}
                {surcharges.heavyItemsCents > 0 && (
                  <TouchableOpacity
                    onPress={() => toggleSurcharge('heavyItems')}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
                  >
                    <View style={{
                      width: 24, height: 24, borderRadius: 6, borderWidth: 2,
                      borderColor: waivedSurcharges.heavyItems ? colors.accent.base : colors.line2,
                      backgroundColor: waivedSurcharges.heavyItems ? colors.accent.base : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {waivedSurcharges.heavyItems && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: colors.ink }}>Waive heavy items</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: waivedSurcharges.heavyItems ? colors.ink3 : colors.ink, textDecorationLine: waivedSurcharges.heavyItems ? 'line-through' : 'none' }}>
                      {formatCents(surcharges.heavyItemsCents)}
                    </Text>
                  </TouchableOpacity>
                )}
                {hasAnyWaived && (
                  <View style={{ marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent.deep }}>Your offer</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent.deep }}>
                        {gig.quoted_price_cents ? formatCents(gig.quoted_price_cents - waivedTotal) : 'TBD'}
                      </Text>
                    </View>
                  </View>
                )}
              </Card>
            );
          })()}

          {/* Counter offer — only show if not yet applied and not matched */}
          {!applied && !isMyJob && gig.quoted_price_cents && (
            <Card style={{ padding: 16, marginBottom: 14 }}>
              <TouchableOpacity
                onPress={() => {
                  setCounterOffer(!counterOffer);
                  if (!counterOffer) setWaivedSurcharges({});
                }}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <View style={{
                  width: 24, height: 24, borderRadius: 6, borderWidth: 2,
                  borderColor: counterOffer ? colors.accent.base : colors.line2,
                  backgroundColor: counterOffer ? colors.accent.base : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {counterOffer && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>Counter offer</Text>
                  <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>
                    Suggest a different price for this job
                  </Text>
                </View>
              </TouchableOpacity>
              {counterOffer && (
                <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
                    Your price
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink }}>$</Text>
                    <TextInput
                      value={counterPrice}
                      onChangeText={setCounterPrice}
                      placeholder="0.00"
                      placeholderTextColor={colors.ink4}
                      keyboardType="decimal-pad"
                      style={{
                        flex: 1, height: 54, paddingHorizontal: 14,
                        borderRadius: 12, backgroundColor: colors.surface,
                        borderWidth: 1.5, borderColor: colors.line,
                        fontSize: 28, fontWeight: '700', color: colors.ink,
                      }}
                    />
                  </View>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 6 }}>
                    Customer's quote: {formatCents(gig.quoted_price_cents)}
                  </Text>
                </View>
              )}
            </Card>
          )}

          {/* Message to customer — only show if not yet applied and not matched */}
          {!applied && !isMyJob && (
            <>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Message (optional)</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Introduce yourself or ask a question..."
                placeholderTextColor={colors.ink4}
                multiline
                style={{ minHeight: 80, padding: 14, borderRadius: radii.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, fontSize: 14, color: colors.ink, lineHeight: 20 }}
              />
            </>
          )}

          {/* I'm on my way */}
          {isMyJob && ['matched', 'in_progress'].includes(gig?.status || '') && (() => {
            const EQUIPMENT_KEYS = ['blankets', 'dolly', 'straps', 'tape', 'shrinkWrap', 'toolkit', 'gloves', 'firstAid'];
            const equipmentReady = EQUIPMENT_KEYS.every(k => !!equipmentChecklist[k]);
            const isPaid = gig?.status === 'in_progress';
            // Within 1 hour of scheduled start (ASAP jobs are always allowed)
            const withinWindow = !gig?.scheduled_for
              || (new Date(gig.scheduled_for).getTime() - Date.now()) <= 60 * 60 * 1000;

            const blockedReason = !isPaid
              ? 'Waiting for customer to pay'
              : !equipmentReady
              ? 'Complete equipment checklist first'
              : !withinWindow
              ? `Available 1 hour before start (${new Date(new Date(gig!.scheduled_for!).getTime() - 60 * 60 * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})`
              : null;

            const ready = !blockedReason;

            return (
              <TouchableOpacity
                onPress={() => {
                  if (blockedReason) {
                    Alert.alert('Not yet', blockedReason);
                    return;
                  }
                  tracking ? stopTracking() : startTracking();
                }}
                style={{
                  marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 8, paddingVertical: 14, borderRadius: 12,
                  backgroundColor: tracking ? '#2563EB' : colors.surface,
                  borderWidth: tracking ? 0 : 1.5,
                  borderColor: ready ? colors.line : colors.line2,
                  opacity: ready || tracking ? 1 : 0.5,
                }}
              >
                <Ionicons name={tracking ? 'navigate' : 'navigate-outline'} size={18} color={tracking ? '#fff' : ready ? colors.ink2 : colors.ink4} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: tracking ? '#fff' : ready ? colors.ink2 : colors.ink4 }}>
                  {tracking ? 'Sharing location — tap to stop' : blockedReason ?? "I'm on my way"}
                </Text>
                {tracking && (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', opacity: 0.8 }} />
                )}
              </TouchableOpacity>
            );
          })()}

          {/* Mark complete */}
          {isMyJob && gig?.status === 'in_progress' && (() => {
            const hasInspection = photos.some((p: any) => p.phase === 'inspection');
            const hasLoading = photos.some((p: any) => p.phase === 'loading');
            const hasDropoff = photos.some((p: any) => p.phase === 'dropoff');
            const allPhotosUploaded = hasInspection && hasLoading && hasDropoff;
            return (
              <TouchableOpacity
                onPress={() => {
                  if (!allPhotosUploaded) {
                    Alert.alert('Photos required', 'Please upload inspection, loading, and dropoff photos before marking the job complete.');
                    return;
                  }
                  handleComplete();
                }}
                disabled={completing}
                style={{
                  marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 8, paddingVertical: 14, borderRadius: 12,
                  backgroundColor: allPhotosUploaded ? colors.success : colors.surface,
                  borderWidth: allPhotosUploaded ? 0 : 1.5,
                  borderColor: colors.line2,
                }}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={allPhotosUploaded ? '#fff' : colors.ink3} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: allPhotosUploaded ? '#fff' : colors.ink3 }}>
                  {completing ? 'Completing...' : allPhotosUploaded ? 'Mark job complete' : 'Upload all photos to complete'}
                </Text>
              </TouchableOpacity>
            );
          })()}

          {/* Withdraw from job */}
          {isMyJob && ['matched', 'in_progress'].includes(gig?.status || '') && (
            <TouchableOpacity
              onPress={handleCancelJob}
              disabled={cancelling}
              style={{
                marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 14, borderRadius: 12,
                borderWidth: 1.5, borderColor: colors.error,
              }}
            >
              <Ionicons name="close-circle-outline" size={18} color={colors.error} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error }}>
                {cancelling ? 'Withdrawing...' : 'Withdraw from job'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Contact us */}
          <View style={{ marginTop: 24, padding: 16, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase' }}>Need help?</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Ionicons name="call-outline" size={16} color={colors.ink2} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink }}>512-777-1628</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>Mon–Sat, 7 AM – 9 PM</Text>
          </View>

          {/* Block customer */}
          {gig?.customer_id && (
            <TouchableOpacity
              onPress={() => {
                if (customerBlocked) {
                  Alert.alert('Unblock customer', 'This customer will be able to see your profile and you can be matched again.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Unblock', onPress: async () => {
                      await supabase.from('user_blocks').delete().eq('blocker_id', profile?.id).eq('blocked_id', gig.customer_id);
                      setCustomerBlocked(false);
                    }},
                  ]);
                } else {
                  Alert.alert('Block customer', 'This customer will no longer be able to match with you or contact you.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Block', style: 'destructive', onPress: async () => {
                      await supabase.from('user_blocks').insert({ blocker_id: profile?.id, blocked_id: gig.customer_id });
                      setCustomerBlocked(true);
                    }},
                  ]);
                }
              }}
              style={{ marginTop: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8 }}
            >
              <Ionicons name={customerBlocked ? 'checkmark-circle-outline' : 'ban-outline'} size={15} color={customerBlocked ? colors.success : colors.ink4} />
              <Text style={{ fontSize: 13, color: customerBlocked ? colors.success : colors.ink4 }}>
                {customerBlocked ? 'Customer blocked — tap to unblock' : 'Block this customer'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 38, backgroundColor: colors.bg, flexDirection: 'row', gap: 10 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={20} color={colors.ink} onPress={() => router.back()} />
        </View>
        {isMyJob ? (
          <View style={{ flex: 1 }}>
            <Button onPress={() => router.push({
              pathname: '/(mover)/gig/chat',
              params: { gigId: gig.id, customerName: customerProfile?.full_name || 'Customer' },
            })}>
              Message customer
            </Button>
          </View>
        ) : applied ? (
          <View style={{ flex: 1 }}>
            <Button onPress={() => {}} disabled>
              Applied
            </Button>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Button onPress={handleApply} loading={applying}>
              {(() => {
                if (counterOffer && counterPrice) {
                  return `Apply — $${parseFloat(counterPrice).toFixed(2)}`;
                }
                if (!gig.quoted_price_cents) return 'Apply — TBD';
                const surcharges = surchargesFromGig(gig);
                const waivedTotal =
                  (waivedSurcharges.stairs ? surcharges.stairsCents : 0) +
                  (waivedSurcharges.longCarry ? surcharges.longCarryCents : 0) +
                  (waivedSurcharges.heavyItems ? surcharges.heavyItemsCents : 0);
                const price = waivedTotal > 0
                  ? gig.quoted_price_cents - waivedTotal
                  : gig.quoted_price_cents;
                return `Apply — ${formatCents(price)}`;
              })()}
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}

function DetailRow({ icon, label, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.accent.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon as any} size={18} color={colors.accent.deep} />
      </View>
      <Text style={{ flex: 1, fontSize: 13, color: colors.ink3 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink, textAlign: 'right', maxWidth: 200 }}>{value}</Text>
    </View>
  );
}

