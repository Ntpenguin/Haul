import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, TouchableOpacity, TextInput, Platform, Image, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Tag, Avatar } from '../../../components/primitives';
import { colors } from '../../../lib/theme';
import { useGigs } from '../../../hooks/useGigs';
import { usePayments } from '../../../hooks/usePayments';
import { formatCents } from '../../../lib/pricing';
import { difficultyLabel } from '../../../lib/difficulty';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../stores/auth';
import { StaticMap } from '../../../components/StaticMap';
import type { Gig, GigApplication, Payment, GigPhoto } from '../../../lib/supabase';
import { hasVehicle, vehicleDisplay } from '../../../lib/vehicleTypes';

export default function GigDetailScreen() {
  const { id, justPosted } = useLocalSearchParams<{ id: string; justPosted?: string }>();
  const router = useRouter();

  if (justPosted === '1') {
    return <GigPostedConfirmation gigId={id} onDone={() => router.replace('/(customer)/home')} />;
  }

  return <GigDetail gigId={id} />;
}

function GigDetail({ gigId }: { gigId: string }) {
  const router = useRouter();
  const { fetchGig, fetchApplicationsForGig, acceptApplication } = useGigs();
  const { payForGig, fetchPaymentForGig } = usePayments();
  const profile = useAuthStore((s) => s.profile);
  const [gig, setGig] = useState<Gig | null>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState('');
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [moverLocation, setMoverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [existingReview, setExistingReview] = useState<any>(null);
  const [photos, setPhotos] = useState<GigPhoto[]>([]);

  async function loadData() {
    try {
      const [g, apps, pay, photoRes] = await Promise.all([
        fetchGig(gigId),
        fetchApplicationsForGig(gigId).catch(() => []),
        fetchPaymentForGig(gigId).catch(() => null),
        supabase.from('gig_photos').select('*').eq('gig_id', gigId),
      ]);
      setGig(g);
      setApplications(apps);
      setPayment(pay);
      if (photoRes.data) setPhotos(photoRes.data);
      if (profile?.id) {
        const { data: reviewData } = await supabase
          .from('reviews')
          .select('*')
          .eq('gig_id', gigId)
          .eq('reviewer_id', profile.id)
          .maybeSingle();
        if (reviewData) setExistingReview(reviewData);
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [gigId]);

  // Fetch mover's last known location
  function refreshMoverLocation() {
    if (!gig?.mover_id || !['matched', 'in_progress'].includes(gig.status)) return;
    supabase.from('mover_locations').select('lat,lng').eq('mover_id', gig.mover_id).maybeSingle()
      .then(({ data }) => { if (data) setMoverLocation({ lat: data.lat, lng: data.lng }); });
  }
  useEffect(() => { refreshMoverLocation(); }, [gig?.mover_id, gig?.status]);

  async function handleAccept(app: any) {
    setAccepting(app.id);
    try {
      await acceptApplication(app.id, gigId);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to accept');
    } finally {
      setAccepting('');
    }
  }

  async function handleDecline(appId: string) {
    try {
      await supabase.from('gig_applications').update({ status: 'declined' }).eq('id', appId);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to decline');
    }
  }

  async function handlePay() {
    if (!gig?.quoted_price_cents) return;
    const total = gig.quoted_price_cents;
    setPaying(true);
    try {
      const success = await payForGig(gigId);
      if (success) {
        // Update payment status to captured
        if (payment?.id) {
          await supabase.from('payments').update({ status: 'captured', captured_at: new Date().toISOString() }).eq('id', payment.id);
        }
        // Update gig status to in_progress
        await supabase.from('gigs').update({ status: 'in_progress' }).eq('id', gigId);
        Alert.alert('Payment confirmed!', `Your ${formatCents(total)} payment is confirmed. Your worker is all set — you're good to go.`);
        await loadData();
      }
    } catch (err: any) {
      Alert.alert('Payment failed', err.message || 'Something went wrong');
    } finally {
      setPaying(false);
    }
  }

  async function submitReview() {
    if (!gig?.mover_id || reviewRating === 0) return;
    setSubmittingReview(true);
    try {
      const { error } = await supabase.from('reviews').insert({
        gig_id: gigId,
        reviewer_id: profile?.id,
        reviewee_id: gig.mover_id,
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

  async function handleCancel() {
    Alert.alert('Cancel gig', 'Are you sure you want to cancel this gig?', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel gig', style: 'destructive', onPress: async () => {
          setCancelling(true);
          try {
            await supabase.from('gigs').update({ status: 'cancelled' }).eq('id', gigId);
            await loadData();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to cancel');
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
        <Text onPress={() => router.back()} style={{ fontSize: 16, color: colors.ink2, fontWeight: '500', marginBottom: 20 }}>
          ← Back
        </Text>
        <Text style={{ fontSize: 18, color: colors.ink3 }}>Gig not found</Text>
      </View>
    );
  }

  const isPaid = payment?.status === 'captured' || payment?.status === 'authorized'
    || gig.status === 'in_progress' || gig.status === 'completed';
  const acceptedApps = applications.filter((a: any) => a.status === 'accepted');
  const acceptedSlots = acceptedApps.reduce((sum: number, a: any) => sum + (a.slots_claimed ?? 1), 0);
  const crewSize = gig.crew_size ?? 1;
  const crewFull = acceptedSlots >= crewSize;
  const hasLead = acceptedApps.some((a: any) => a.is_lead);
  const requiresVehicle = !!(gig.truck_size && gig.truck_size !== 'none');

  // Determine display status
  const statusLabel = isPaid ? 'PAID' : gig.status === 'matched' ? 'MATCHED' : gig.status.toUpperCase();
  const statusColor = isPaid ? 'good' : gig.status === 'matched' ? 'accent' : gig.status === 'posted' ? 'warn' : gig.status === 'completed' ? 'good' : 'neutral';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ paddingTop: 60, paddingHorizontal: 20 }}>
          <Text onPress={() => router.back()} style={{ fontSize: 16, color: colors.ink2, fontWeight: '500', marginBottom: 20 }}>
            ← Back
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.ink }}>Gig details</Text>
            <Tag color={statusColor}>{statusLabel}</Tag>
          </View>

          {/* Status banner */}
          {isPaid && (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: '#E5F0EA', flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.success }}>Paid in full — job confirmed</Text>
                <Text style={{ fontSize: 13, color: '#2E5C47', marginTop: 2 }}>
                  You're all set. Your worker will be paid after the job is complete.
                </Text>
              </View>
            </View>
          )}
          {gig.status === 'matched' && !isPaid && (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.accent.soft, flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <Ionicons name="time-outline" size={20} color={colors.accent.deep} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent.deep }}>Worker matched — payment needed</Text>
                <Text style={{ fontSize: 13, color: colors.accent.deep, marginTop: 2 }}>
                  Pay {gig.quoted_price_cents ? formatCents(gig.quoted_price_cents) : ''} now to confirm your worker.
                </Text>
              </View>
            </View>
          )}
          {gig.status === 'posted' && applications.length === 0 && (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.surface, flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <Ionicons name="search-outline" size={20} color={colors.ink3} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink2 }}>Looking for workers</Text>
                <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>Workers nearby are reviewing your gig. You'll see applications here soon.</Text>
              </View>
            </View>
          )}

          {/* Map */}
          {gig.from_lat && gig.to_lat && (
            <View style={{ marginBottom: 12 }}>
              <StaticMap
                fromLat={gig.from_lat}
                fromLng={gig.from_lng!}
                toLat={gig.to_lat}
                toLng={gig.to_lng}
                moverLat={moverLocation?.lat}
                moverLng={moverLocation?.lng}
                height={180}
                borderRadius={16}
              />
              {['matched', 'in_progress'].includes(gig.status) && (
                <TouchableOpacity
                  onPress={refreshMoverLocation}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: moverLocation ? '#EFF6FF' : colors.surface }}
                >
                  {moverLocation ? (
                    <>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563EB' }} />
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#2563EB' }}>Mover is on the way</Text>
                      <Text style={{ fontSize: 12, color: '#2563EB' }}>Tap to refresh</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="location-outline" size={14} color={colors.ink3} />
                      <Text style={{ flex: 1, fontSize: 13, color: colors.ink3 }}>No location shared yet</Text>
                      <Text style={{ fontSize: 12, color: colors.accent.base }}>Tap to refresh</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {gig.distance_miles && (
                <View style={{ position: 'absolute', top: 10, right: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.9)' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink }}>{gig.distance_miles} mi</Text>
                </View>
              )}
            </View>
          )}

          {/* Route */}
          <Card style={{ padding: 16, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ paddingTop: 4 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink }} />
                <View style={{ width: 2, height: 22, backgroundColor: colors.line2, marginVertical: 3, alignSelf: 'center' }} />
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.accent.base }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink }}>{gig.from_address}</Text>
                <View style={{ height: 14 }} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink }}>{gig.to_address}</Text>
              </View>
            </View>
          </Card>

          {/* Details */}
          <Card style={{ padding: 16, marginBottom: 12 }}>
            <DetailRow label="Size" value={gig.home_size || '-'} />
            {gig.difficulty != null && <DetailRow label="Difficulty" value={`${difficultyLabel(gig.difficulty)} (${gig.difficulty}/5)`} />}
            {gig.estimated_duration_hours != null && <DetailRow label="Est. duration" value={`~${gig.estimated_duration_hours} hrs`} />}
            <DetailRow label="Crew" value={`${gig.crew_size || '-'} people`} />
            <DetailRow label="Truck" value={gig.truck_size || '-'} />
            <DetailRow label="Stairs (from)" value={`${gig.stairs_from} flights`} />
            <DetailRow label="Stairs (to)" value={`${gig.stairs_to} flights`} />
            {gig.distance_miles && <DetailRow label="Distance" value={`${gig.distance_miles} mi`} />}
            {gig.staging && <DetailRow label="Home staging" value="Yes (+30%)" />}
            {gig.packing_service && <DetailRow label="Packing service" value="Yes (+25%)" />}
            {gig.customer_notes && <DetailRow label="Notes" value={gig.customer_notes} />}
          </Card>

          {/* Add to calendar */}
          {gig.scheduled_for && (
            <TouchableOpacity
              onPress={() => {
                const start = new Date(gig.scheduled_for!);
                const durationHours = gig.home_size === 'item' || gig.home_size === 'studio' ? 2 : gig.home_size === '1br' ? 3 : gig.home_size === '2br' ? 4 : 6;
                const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
                const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                const title = [profile?.full_name, profile?.phone].filter(Boolean).join(' — ') || `My move — ${gig.home_size || 'Move'}`;
                const photoLines = photos.length
                  ? '\n\n📸 Job Photos:\n' + photos.map((p: any) => `${p.phase ? p.phase.charAt(0).toUpperCase() + p.phase.slice(1) : 'Photo'}: ${p.url}`).join('\n')
                  : '';
                const details = [
                  `From: ${gig.from_address}`,
                  `To: ${gig.to_address}`,
                  gig.crew_size ? `Crew: ${gig.crew_size} mover${gig.crew_size > 1 ? 's' : ''}` : '',
                  gig.truck_size && gig.truck_size !== 'none' ? `Truck: ${gig.truck_size}` : '',
                  gig.quoted_price_cents ? `Total: $${(gig.quoted_price_cents / 100).toFixed(2)}` : '',
                  gig.customer_notes ? `Notes: ${gig.customer_notes}` : '',
                  photoLines,
                ].filter(Boolean).join('\n');
                const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(start)}/${fmt(end)}&location=${encodeURIComponent(gig.from_address)}&details=${encodeURIComponent(details)}`;
                Linking.openURL(url);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: 14, borderRadius: 12,
                backgroundColor: colors.sage.soft, marginBottom: 12,
              }}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.sage.deep} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.sage.deep }}>Add to Google Calendar</Text>
            </TouchableOpacity>
          )}

          {/* Price breakdown */}
          <Card style={{ padding: 16, marginBottom: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
              Estimated total
            </Text>
            <Text style={{ fontSize: 32, fontWeight: '700', color: colors.ink }}>
              {gig.quoted_price_cents ? formatCents(gig.quoted_price_cents) : 'TBD'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>
              {gig.pricing_model === 'hourly' ? 'Hourly rate estimate' : 'Flat rate'}
            </Text>
            {gig.quoted_price_cents ? (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent.deep }}>Paid in full — in app</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent.deep }}>{formatCents(gig.quoted_price_cents)}</Text>
                </View>
              </View>
            ) : null}
          </Card>

          {/* Accepted crew */}
          {acceptedApps.length > 0 && (
            <Card style={{ padding: 16, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Your crew
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: crewFull ? colors.success : colors.accent.base }}>
                  {acceptedSlots}/{crewSize} movers
                </Text>
              </View>
              <View style={{ gap: 12 }}>
                {acceptedApps.map((app: any) => (
                  <View key={app.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Avatar initials={getInitials(app.profiles?.full_name)} size={44} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{app.profiles?.full_name || 'Worker'}</Text>
                          {app.is_lead && (
                            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.accent.soft }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: colors.accent.deep }}>LEAD</Text>
                            </View>
                          )}
                        </View>
                        {app.profiles?.phone && (
                          <TouchableOpacity onPress={() => Linking.openURL(`tel:${app.profiles.phone}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Ionicons name="call" size={12} color={colors.accent.base} />
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.accent.base }}>{app.profiles.phone}</Text>
                          </TouchableOpacity>
                        )}
                        {hasVehicle(app.vehicle_type) && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Ionicons name="car-outline" size={12} color={colors.ink3} />
                            <Text style={{ fontSize: 12, color: colors.ink3 }}>{vehicleDisplay(app.vehicle_type, app.vehicle_make_model)}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => router.push({
                        pathname: '/(customer)/gig/chat',
                        params: { gigId, workerName: app.profiles?.full_name || 'Worker' },
                      })}
                      style={{
                        marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                        gap: 8, paddingVertical: 8, borderRadius: 10,
                        backgroundColor: colors.accent.soft,
                      }}
                    >
                      <Ionicons name="chatbubble-outline" size={14} color={colors.accent.deep} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.accent.deep }}>Message</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Applications */}
          <Card style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Applications ({applications.length})
              </Text>
              {crewFull && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#E5F0EA' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.success }}>CREW FULL</Text>
                </View>
              )}
            </View>
            {requiresVehicle && !hasLead && acceptedApps.length === 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: '#FFF8E7', marginBottom: 10 }}>
                <Ionicons name="car-outline" size={15} color="#B45309" />
                <Text style={{ flex: 1, fontSize: 12, color: '#B45309', fontWeight: '500' }}>
                  This job requires a truck. Accept a mover with a vehicle first — others can join as extra help after.
                </Text>
              </View>
            )}
            {applications.length === 0 ? (
              <Text style={{ fontSize: 14, color: colors.ink3 }}>
                Workers will appear here once they apply to your gig.
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                {applications.map((app: any) => {
                  const appHasVehicle = hasVehicle(app.vehicle_type);
                  const canAcceptAsLead = !hasLead && (!requiresVehicle || appHasVehicle);
                  const canAcceptAsMuscle = hasLead && !crewFull;
                  const canAccept = app.status === 'pending' && !crewFull && (canAcceptAsLead || canAcceptAsMuscle);
                  const blockedByVehicle = app.status === 'pending' && !crewFull && !hasLead && requiresVehicle && !appHasVehicle;
                  return (
                    <View key={app.id} style={{ padding: 14, borderRadius: 12, backgroundColor: colors.surface, gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/(customer)/worker/[id]', params: { id: app.mover_id } })}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                        activeOpacity={0.7}
                      >
                        <Avatar initials={getInitials(app.profiles?.full_name)} size={36} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{app.profiles?.full_name || 'Worker'}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            {appHasVehicle ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Ionicons name="car" size={11} color={colors.success} />
                                <Text style={{ fontSize: 11, color: colors.success, fontWeight: '600' }}>{vehicleDisplay(app.vehicle_type, app.vehicle_make_model)}</Text>
                              </View>
                            ) : (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Ionicons name="body-outline" size={11} color={colors.ink3} />
                                <Text style={{ fontSize: 11, color: colors.ink3 }}>Muscle only</Text>
                              </View>
                            )}
                            {app.profiles?.rating && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Ionicons name="star" size={11} color={colors.accent.base} />
                                <Text style={{ fontSize: 11, color: colors.ink2, fontWeight: '600' }}>{app.profiles.rating}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.ink4} />
                      </TouchableOpacity>
                      <Tag color={app.status === 'accepted' ? 'good' : app.status === 'declined' ? 'neutral' : 'warn'}>
                        {app.status === 'accepted' && app.is_lead ? 'LEAD' : app.status.toUpperCase()}
                      </Tag>
                      {app.quoted_price_cents && gig.quoted_price_cents && app.quoted_price_cents !== gig.quoted_price_cents && (
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          backgroundColor: app.quoted_price_cents < gig.quoted_price_cents ? '#E8F5E9' : '#FFF3E0',
                          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                        }}>
                          <Ionicons name="pricetag" size={14} color={app.quoted_price_cents < gig.quoted_price_cents ? colors.success : '#E65100'} />
                          <Text style={{ fontSize: 13, fontWeight: '600', color: app.quoted_price_cents < gig.quoted_price_cents ? colors.success : '#E65100' }}>
                            {app.quoted_price_cents < gig.quoted_price_cents
                              ? `Offered ${formatCents(app.quoted_price_cents)} — saves you ${formatCents(gig.quoted_price_cents - app.quoted_price_cents)}`
                              : `Counter offer: ${formatCents(app.quoted_price_cents)} (${formatCents(app.quoted_price_cents - gig.quoted_price_cents)} more)`
                            }
                          </Text>
                        </View>
                      )}
                      {app.message && (
                        <Text style={{ fontSize: 13, color: colors.ink2, fontStyle: 'italic' }}>"{app.message}"</Text>
                      )}
                      {app.status === 'pending' && (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {canAccept && (
                            <View style={{ flex: 1 }}>
                              <Button onPress={() => handleAccept(app)} loading={accepting === app.id} size="sm">
                                {canAcceptAsLead ? 'Accept as lead' : 'Add to crew'}
                              </Button>
                            </View>
                          )}
                          <TouchableOpacity
                            onPress={() => handleDecline(app.id)}
                            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: colors.error, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.error }}>Decline</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {blockedByVehicle && (
                        <Text style={{ fontSize: 12, color: '#B45309', fontStyle: 'italic' }}>
                          Accept a mover with a vehicle first before adding muscle-only workers.
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </Card>

          {/* Job photos */}
          {photos.length > 0 && (
            <Card style={{ padding: 16, marginTop: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>
                Job Photos
              </Text>
              {([
                { phase: 'inspection', label: 'Inspection / Start' },
                { phase: 'loading', label: 'Pickup Location' },
                { phase: 'dropoff', label: 'Dropoff Location' },
              ] as const).map(({ phase, label }) => {
                const phasePhotos = photos.filter((p: any) => p.phase === phase);
                if (!phasePhotos.length) return null;
                return (
                  <View key={phase} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>{label}</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {phasePhotos.map((p: any) => (
                          <Image key={p.id} source={{ uri: p.url }} style={{ width: 110, height: 110, borderRadius: 10, backgroundColor: colors.surface }} />
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                );
              })}
              {photos.filter((p: any) => !p.phase).map((p: any) => (
                <Image key={p.id} source={{ uri: p.url }} style={{ width: 110, height: 110, borderRadius: 10, backgroundColor: colors.surface, marginRight: 8 }} />
              ))}
            </Card>
          )}

          {/* Review */}
          {gig.status === 'completed' && (
            <Card style={{ padding: 16, marginTop: 12 }}>
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
          {/* Cancel gig */}
          {['posted', 'matched'].includes(gig.status) && (
            <TouchableOpacity
              onPress={handleCancel}
              disabled={cancelling}
              style={{
                marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 14, borderRadius: 12,
                borderWidth: 1.5, borderColor: colors.error,
              }}
            >
              <Ionicons name="close-circle-outline" size={18} color={colors.error} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error }}>
                {cancelling ? 'Cancelling...' : 'Cancel gig'}
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
        </View>
      </ScrollView>

      {/* Payment footer */}
      {acceptedApps.length > 0 && !isPaid && gig.quoted_price_cents && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 38, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Button onPress={handlePay} loading={paying}>
            {`Pay ${formatCents(gig.quoted_price_cents)}`}
          </Button>
          <Text style={{ fontSize: 12, color: colors.ink3, textAlign: 'center', marginTop: 8 }}>
            Paid in full now — your worker is paid after the job is complete
          </Text>
        </View>
      )}
    </View>
  );
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <Text style={{ fontSize: 14, color: colors.ink3 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }}>{value}</Text>
    </View>
  );
}

function GigPostedConfirmation({ gigId, onDone }: { gigId: string; onDone: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 80 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          width: 110, height: 110, borderRadius: 55, backgroundColor: colors.accent.base,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: colors.accent.base, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.32, shadowRadius: 36,
        }}>
          <Ionicons name="checkmark" size={52} color="#fff" />
        </View>

        <Text style={{ marginTop: 24, fontSize: 28, fontWeight: '700', color: colors.ink, textAlign: 'center', letterSpacing: -0.5 }}>
          Your gig is posted.
        </Text>
        <Text style={{ fontSize: 15, color: colors.ink2, marginTop: 10, maxWidth: 300, textAlign: 'center', lineHeight: 22 }}>
          Workers nearby are reviewing your request now. You'll get notified when someone applies.
        </Text>

        <Card style={{ marginTop: 28, width: '100%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase' }}>Gig ID</Text>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 2 }}>{gigId?.slice(0, 8)}</Text>
            </View>
            <Tag color="good">Live</Tag>
          </View>
        </Card>

        <Card style={{ marginTop: 14, width: '100%' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            What happens next
          </Text>
          <NextStep n="1" title="Workers review your gig" sub="Vetted workers nearby see the details and photos." />
          <NextStep n="2" title="You get notified when matched" sub="Usually within 5-15 min." />
          <NextStep n="3" title="Confirm and they're on the way" sub="See live ETA in the app." last />
        </Card>
      </View>

      <View style={{ paddingBottom: 38, gap: 8 }}>
        <Button onPress={onDone}>Done</Button>
        <Button variant="ghost" onPress={onDone}>Post another gig</Button>
      </View>
    </View>
  );
}

function NextStep({ n, title, sub, last }: { n: string; title: string; sub: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.accent.deep }}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{title}</Text>
        <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 2, lineHeight: 18 }}>{sub}</Text>
      </View>
    </View>
  );
}

