import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, TouchableOpacity, TextInput, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Tag, Avatar } from '../../../components/primitives';
import { colors } from '../../../lib/theme';
import { useGigs } from '../../../hooks/useGigs';
import { usePayments } from '../../../hooks/usePayments';
import { formatCents } from '../../../lib/pricing';
import { depositCents, remainderCents } from '../../../lib/stripe';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../stores/auth';
import { StaticMap } from '../../../components/StaticMap';
import type { Gig, GigApplication, Payment } from '../../../lib/supabase';

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

  async function loadData() {
    try {
      const [g, apps, pay] = await Promise.all([
        fetchGig(gigId),
        fetchApplicationsForGig(gigId).catch(() => []),
        fetchPaymentForGig(gigId).catch(() => null),
      ]);
      setGig(g);
      setApplications(apps);
      setPayment(pay);
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

  // Subscribe to mover's live location
  useEffect(() => {
    if (!gig?.mover_id || !['matched', 'in_progress'].includes(gig.status)) return;

    // Fetch initial location
    supabase.from('mover_locations').select('lat,lng').eq('mover_id', gig.mover_id).maybeSingle()
      .then(({ data }) => { if (data) setMoverLocation({ lat: data.lat, lng: data.lng }); });

    // Subscribe to updates
    const channel = supabase
      .channel(`mover-loc-${gig.mover_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'mover_locations',
        filter: `mover_id=eq.${gig.mover_id}`,
      }, (payload) => {
        const loc = payload.new as any;
        if (loc?.lat && loc?.lng) setMoverLocation({ lat: loc.lat, lng: loc.lng });
        if (payload.eventType === 'DELETE') setMoverLocation(null);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [gig?.mover_id, gig?.status]);

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

  async function handlePay() {
    if (!gig?.quoted_price_cents) return;
    const deposit = depositCents(gig.quoted_price_cents);
    setPaying(true);
    try {
      const success = await payForGig(gigId, deposit);
      if (success) {
        // Update payment status to captured
        if (payment?.id) {
          await supabase.from('payments').update({ status: 'captured', captured_at: new Date().toISOString() }).eq('id', payment.id);
        }
        // Update gig status to in_progress
        await supabase.from('gigs').update({ status: 'in_progress' }).eq('id', gigId);
        Alert.alert('Deposit paid!', `Your ${formatCents(deposit)} deposit is confirmed. Pay the remaining ${formatCents(remainderCents(gig.quoted_price_cents))} directly to your worker.`);
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
  const hasAccepted = applications.some((a: any) => a.status === 'accepted');
  const acceptedApp = applications.find((a: any) => a.status === 'accepted');

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
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.success }}>Deposit paid — job confirmed</Text>
                <Text style={{ fontSize: 13, color: '#2E5C47', marginTop: 2 }}>
                  Pay the remaining {gig.quoted_price_cents ? formatCents(remainderCents(gig.quoted_price_cents)) : ''} directly to your worker.
                </Text>
              </View>
            </View>
          )}
          {gig.status === 'matched' && !isPaid && (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.accent.soft, flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <Ionicons name="time-outline" size={20} color={colors.accent.deep} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent.deep }}>Worker matched — deposit needed</Text>
                <Text style={{ fontSize: 13, color: colors.accent.deep, marginTop: 2 }}>
                  Pay the {gig.quoted_price_cents ? formatCents(depositCents(gig.quoted_price_cents)) : ''} deposit to confirm your worker.
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
              {moverLocation && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#EFF6FF' }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563EB' }} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#2563EB' }}>Your mover is on the way — live location active</Text>
                </View>
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
            <DetailRow label="Crew" value={`${gig.crew_size || '-'} people`} />
            <DetailRow label="Truck" value={gig.truck_size || '-'} />
            <DetailRow label="Stairs (from)" value={`${gig.stairs_from} flights`} />
            <DetailRow label="Stairs (to)" value={`${gig.stairs_to} flights`} />
            {gig.distance_miles && <DetailRow label="Distance" value={`${gig.distance_miles} mi`} />}
            {gig.customer_notes && <DetailRow label="Notes" value={gig.customer_notes} />}
          </Card>

          {/* Add to calendar */}
          {gig.scheduled_for && (
            <TouchableOpacity
              onPress={() => {
                const date = new Date(gig.scheduled_for!);
                const title = `Moving gig - ${gig.home_size || 'Move'}`;
                const url = Platform.OS === 'web'
                  ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z/${new Date(date.getTime() + 3600000 * 3).toISOString().replace(/[-:]/g, '').split('.')[0]}Z&location=${encodeURIComponent(gig.from_address)}`
                  : '';
                if (Platform.OS === 'web' && url) {
                  window.open(url, '_blank');
                } else {
                  Alert.alert('Add to Calendar', `${title}\n${date.toLocaleString()}\n\nFrom: ${gig.from_address}\nTo: ${gig.to_address}`, [{ text: 'OK' }]);
                }
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: 14, borderRadius: 12,
                backgroundColor: colors.sage.soft, marginBottom: 12,
              }}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.sage.deep} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.sage.deep }}>Add to calendar</Text>
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
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent.deep }}>Deposit (10%) — paid in app</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent.deep }}>{formatCents(depositCents(gig.quoted_price_cents))}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: colors.ink3 }}>Remaining (90%) — pay worker directly</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink }}>{formatCents(remainderCents(gig.quoted_price_cents))}</Text>
                </View>
              </View>
            ) : null}
          </Card>

          {/* Accepted worker */}
          {acceptedApp && (
            <Card style={{ padding: 16, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
                Your worker
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar initials={getInitials(acceptedApp.profiles?.full_name)} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{acceptedApp.profiles?.full_name || 'Worker'}</Text>
                  {acceptedApp.profiles?.phone && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Ionicons name="call-outline" size={12} color={colors.ink3} />
                      <Text style={{ fontSize: 13, color: colors.ink3 }}>{acceptedApp.profiles.phone}</Text>
                    </View>
                  )}
                  {acceptedApp.message && (
                    <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>"{acceptedApp.message}"</Text>
                  )}
                </View>
                <Tag color="good">ACCEPTED</Tag>
              </View>
              <TouchableOpacity
                onPress={() => router.push({
                  pathname: '/(customer)/gig/chat',
                  params: { gigId, workerName: acceptedApp.profiles?.full_name || 'Worker' },
                })}
                style={{
                  marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 8, paddingVertical: 10, borderRadius: 12,
                  backgroundColor: colors.accent.soft,
                }}
              >
                <Ionicons name="chatbubble-outline" size={16} color={colors.accent.deep} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent.deep }}>Message worker</Text>
              </TouchableOpacity>
            </Card>
          )}

          {/* Applications */}
          <Card style={{ padding: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
              Applications ({applications.length})
            </Text>
            {applications.length === 0 ? (
              <Text style={{ fontSize: 14, color: colors.ink3 }}>
                Workers will appear here once they apply to your gig.
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                {applications.map((app: any) => (
                  <View key={app.id} style={{ padding: 14, borderRadius: 12, backgroundColor: colors.surface, gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/(customer)/worker/[id]', params: { id: app.mover_id } })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                      activeOpacity={0.7}
                    >
                      <Avatar initials={getInitials(app.profiles?.full_name)} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{app.profiles?.full_name || 'Worker'}</Text>
                        {app.profiles?.email && (
                          <Text style={{ fontSize: 12, color: colors.ink3 }}>{app.profiles.email}</Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.ink4} />
                    </TouchableOpacity>
                    <Tag color={app.status === 'accepted' ? 'good' : app.status === 'declined' ? 'neutral' : 'warn'}>
                      {app.status.toUpperCase()}
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
                    {app.status === 'pending' && !hasAccepted && (
                      <Button onPress={() => handleAccept(app)} loading={accepting === app.id} size="sm">
                        Accept this worker
                      </Button>
                    )}
                  </View>
                ))}
              </View>
            )}
          </Card>

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
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink }}>737-268-6547</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>Mon–Sat, 7 AM – 9 PM</Text>
          </View>
        </View>
      </ScrollView>

      {/* Payment footer */}
      {hasAccepted && !isPaid && gig.quoted_price_cents && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 38, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Button onPress={handlePay} loading={paying}>
            {`Pay ${formatCents(depositCents(gig.quoted_price_cents))} deposit`}
          </Button>
          <Text style={{ fontSize: 12, color: colors.ink3, textAlign: 'center', marginTop: 8 }}>
            10% deposit — remaining {formatCents(remainderCents(gig.quoted_price_cents))} paid directly to worker
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

