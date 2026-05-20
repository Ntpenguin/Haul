import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TextInput, Alert, TouchableOpacity, Image, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Avatar, Tag } from '../../../components/primitives';
import { colors, radii } from '../../../lib/theme';
import { useGigs } from '../../../hooks/useGigs';
import { useAuthStore } from '../../../stores/auth';
import { supabase } from '../../../lib/supabase';
import { formatCents, depositCents, remainderCents, surchargesFromGig } from '../../../lib/pricing';
import * as Location from 'expo-location';
import { sendToUser } from '../../../lib/notifications';
import type { LocationSubscription } from 'expo-location';
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
  const locationSub = useRef<LocationSubscription | null>(null);
  const [checklist, setChecklist] = useState<Record<string, { wrapped: boolean; padded: boolean; assembled: boolean; disassembled: boolean; waived: boolean; junkRemoved: boolean }>>({});

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
        // Check if already applied
        if (profile?.id) {
          const { data } = await supabase
            .from('gig_applications')
            .select('id')
            .eq('gig_id', id)
            .eq('mover_id', profile.id)
            .maybeSingle();
          if (data) setApplied(true);
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
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 20 },
      async (loc) => {
        if (!profile?.id) return;
        await supabase.from('mover_locations').upsert(
          { mover_id: profile.id, lat: loc.coords.latitude, lng: loc.coords.longitude, updated_at: new Date().toISOString() },
          { onConflict: 'mover_id' }
        );
      }
    );
    locationSub.current = sub;
    setTracking(true);
  }

  async function stopTracking() {
    if (locationSub.current) {
      locationSub.current.remove();
      locationSub.current = null;
    }
    setTracking(false);
    if (profile?.id) supabase.from('mover_locations').delete().eq('mover_id', profile.id);
  }

  useEffect(() => {
    return () => { stopTracking(); };
  }, []);

  async function handleCancelJob() {
    if (!gig) return;
    Alert.alert('Leave job', 'Are you sure you want to withdraw from this job?', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Withdraw', style: 'destructive', onPress: async () => {
          setCancelling(true);
          try {
            const { error } = await supabase.rpc('withdraw_from_gig', { p_gig_id: gig.id });
            if (error) throw error;
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
  const isMyJob = gig?.mover_id === profile?.id;

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
                  {formatCents(remainderCents(gig.quoted_price_cents))} paid to you directly by customer
                </Text>
              ) : null}
            </View>
            <Tag color={isAsap ? 'warn' : 'neutral'}>{isAsap ? 'ASAP' : 'SCHEDULED'}</Tag>
          </View>

          {/* Payment info */}
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.accent.soft, flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent.deep} />
            <Text style={{ flex: 1, fontSize: 13, color: colors.accent.deep, fontWeight: '500' }}>
              Customer pays a 10% deposit through the app. You'll collect the remaining 90% directly from the customer.
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
            <DetailRow icon="people-outline" label="Crew" value={`${gig.crew_size || 1} needed`} />
            {gig.truck_size && gig.truck_size !== 'none' && <DetailRow icon="car-outline" label="Vehicle" value={gig.truck_size} />}
            <DetailRow icon="calendar-outline" label="When" value={isAsap ? 'ASAP' : new Date(gig.scheduled_for!).toLocaleString()} />
            <DetailRow icon="trending-up-outline" label="Stairs" value={`${gig.stairs_from} up, ${gig.stairs_to} down`} />
            {gig.heavy_items?.length > 0 && <DetailRow icon="barbell-outline" label="Heavy items" value={gig.heavy_items.join(', ')} last />}
          </Card>

          {/* Add to calendar */}
          {gig.scheduled_for && (
            <TouchableOpacity
              onPress={() => {
                const date = new Date(gig.scheduled_for!);
                const title = `Moving job - ${gig.home_size || 'Move'}`;
                Alert.alert('Add to Calendar', `${title}\n${date.toLocaleString()}\n\nFrom: ${gig.from_address}\nTo: ${gig.to_address}`, [{ text: 'OK' }]);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: 14, borderRadius: 12,
                backgroundColor: colors.sage.soft, marginBottom: 14,
              }}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.sage.deep} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.sage.deep }}>Add to calendar</Text>
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
            <>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Photos ({photos.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14, marginHorizontal: -20, paddingHorizontal: 20 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {photos.map((photo) => (
                    <Image
                      key={photo.id}
                      source={{ uri: photo.url }}
                      style={{ width: 160, height: 160, borderRadius: 12, backgroundColor: colors.surface }}
                    />
                  ))}
                </View>
              </ScrollView>
            </>
          )}

          {/* Status banner */}
          {isMyJob ? (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: '#E8F5E9', flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={{ flex: 1, fontSize: 14, color: colors.success, fontWeight: '600' }}>
                {gig?.status === 'in_progress' ? 'Job in progress' : 'You\'ve been accepted for this job'}
              </Text>
            </View>
          ) : applied ? (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.accent.soft, flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <Ionicons name="checkmark-circle" size={20} color={colors.accent.deep} />
              <Text style={{ flex: 1, fontSize: 14, color: colors.accent.deep, fontWeight: '600' }}>
                Applied — waiting for customer review
              </Text>
            </View>
          ) : null}

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

          {/* Live tracking toggle */}
          {isMyJob && ['matched', 'in_progress'].includes(gig?.status || '') && (
            <TouchableOpacity
              onPress={tracking ? stopTracking : startTracking}
              style={{
                marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 14, borderRadius: 12,
                backgroundColor: tracking ? '#2563EB' : colors.surface,
                borderWidth: tracking ? 0 : 1.5,
                borderColor: colors.line,
              }}
            >
              <Ionicons name={tracking ? 'navigate' : 'navigate-outline'} size={18} color={tracking ? '#fff' : colors.ink2} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: tracking ? '#fff' : colors.ink2 }}>
                {tracking ? 'Sharing location — tap to stop' : "I'm on my way"}
              </Text>
              {tracking && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', opacity: 0.8 }} />
              )}
            </TouchableOpacity>
          )}

          {/* Mark complete */}
          {isMyJob && gig?.status === 'in_progress' && (
            <TouchableOpacity
              onPress={handleComplete}
              disabled={completing}
              style={{
                marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 14, borderRadius: 12,
                backgroundColor: colors.success,
              }}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>
                {completing ? 'Completing...' : 'Mark job complete'}
              </Text>
            </TouchableOpacity>
          )}

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
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink }}>737-268-6547</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>Mon–Sat, 7 AM – 9 PM</Text>
          </View>
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
              params: { gigId: gig.id, customerName: 'Customer' },
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

