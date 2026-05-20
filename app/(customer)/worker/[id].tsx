import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Avatar, Tag } from '../../../components/primitives';
import { colors } from '../../../lib/theme';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../stores/auth';
import { formatCents } from '../../../lib/pricing';
import type { Profile, MoverProfile, Gig } from '../../../lib/supabase';

export default function WorkerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const myProfile = useAuthStore((s) => s.profile);
  const [worker, setWorker] = useState<Profile | null>(null);
  const [moverProfile, setMoverProfile] = useState<MoverProfile | null>(null);
  const [pastGigs, setPastGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [{ data: w }, { data: mp }, { data: gigs }] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', id).single(),
          supabase.from('mover_profiles').select('*').eq('id', id).single(),
          supabase
            .from('gigs')
            .select('*')
            .eq('mover_id', id)
            .eq('customer_id', myProfile?.id || '')
            .order('created_at', { ascending: false }),
        ]);
        setWorker(w);
        setMoverProfile(mp);
        setPastGigs(gigs || []);
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent.base} />
      </View>
    );
  }

  if (!worker) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 80 }}>
        <Text onPress={() => router.back()} style={{ fontSize: 16, color: colors.ink2, fontWeight: '500', marginBottom: 20 }}>← Back</Text>
        <Text style={{ fontSize: 18, color: colors.ink3 }}>Worker not found</Text>
      </View>
    );
  }

  function handleReport() {
    Alert.alert('Report Worker', 'Why are you reporting this worker?', [
      { text: 'Inappropriate behavior', onPress: () => submitReport('Inappropriate behavior') },
      { text: 'No-show / ghosted', onPress: () => submitReport('No-show / ghosted') },
      { text: 'Scam or fraud', onPress: () => submitReport('Scam or fraud') },
      { text: 'Harassment', onPress: () => submitReport('Harassment') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function submitReport(reason: string) {
    if (!myProfile?.id) return;
    setReporting(true);
    try {
      await supabase.from('reports').insert({ reporter_id: myProfile.id, reported_id: id, reason });
      Alert.alert('Report submitted', 'Thank you. Our team will review this within 24 hours.');
    } catch {
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      setReporting(false);
    }
  }

  const initials = worker.full_name
    ? worker.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const completedGigs = pastGigs.filter(g => g.status === 'completed' || g.status === 'in_progress');

  // Find an active gig with this worker (for messaging)
  const activeGig = pastGigs.find(g => g.mover_id === id && ['matched', 'in_progress'].includes(g.status));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ paddingTop: 60, paddingHorizontal: 20 }}>
          <Text onPress={() => router.back()} style={{ fontSize: 16, color: colors.ink2, fontWeight: '500', marginBottom: 24 }}>← Back</Text>

          {/* Worker header */}
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Avatar initials={initials} uri={worker.avatar_url || undefined} size={80} />
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.ink, marginTop: 14, letterSpacing: -0.5 }}>
              {worker.full_name || 'Worker'}
            </Text>
            {worker.rating && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Ionicons name="star" size={16} color={colors.accent.base} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{worker.rating}</Text>
                <Text style={{ fontSize: 14, color: colors.ink3 }}>rating</Text>
              </View>
            )}
            {worker.total_gigs > 0 && (
              <Text style={{ fontSize: 14, color: colors.ink3, marginTop: 4 }}>
                {worker.total_gigs} gig{worker.total_gigs !== 1 ? 's' : ''} completed
              </Text>
            )}
          </View>

          {/* Bio */}
          {moverProfile?.bio && (
            <Card style={{ padding: 16, marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
                About
              </Text>
              <Text style={{ fontSize: 15, color: colors.ink, lineHeight: 22 }}>{moverProfile.bio}</Text>
            </Card>
          )}

          {/* Details */}
          <Card style={{ padding: 16, marginBottom: 14 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
              Details
            </Text>
            {moverProfile?.vehicle_type && (
              <DetailRow icon="car-outline" label="Vehicle" value={moverProfile.vehicle_type} />
            )}
            {moverProfile?.service_area_zip && moverProfile.service_area_zip.length > 0 && (
              <DetailRow icon="location-outline" label="Service area" value={moverProfile.service_area_zip.join(', ')} />
            )}
            {worker.email && (
              <DetailRow icon="mail-outline" label="Email" value={worker.email} />
            )}
            <DetailRow icon="calendar-outline" label="Member since" value={new Date(worker.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} last />
          </Card>

          {/* Past gigs together */}
          <Card style={{ padding: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
              Your history together ({completedGigs.length})
            </Text>
            {completedGigs.length === 0 ? (
              <Text style={{ fontSize: 14, color: colors.ink3 }}>No completed gigs yet.</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {completedGigs.map((gig) => (
                  <TouchableOpacity
                    key={gig.id}
                    onPress={() => router.push({ pathname: '/(customer)/gig/[id]', params: { id: gig.id } })}
                    style={{ padding: 12, borderRadius: 10, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }} numberOfLines={1}>{gig.from_address}</Text>
                      <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                        {new Date(gig.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </View>
                    {gig.quoted_price_cents && (
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{formatCents(gig.quoted_price_cents)}</Text>
                    )}
                    <Tag color={gig.status === 'completed' ? 'good' : 'accent'}>{gig.status === 'completed' ? 'DONE' : 'ACTIVE'}</Tag>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Card>
        </View>
      </ScrollView>

      {/* Footer buttons */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 38, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line, gap: 10 }}>
        <TouchableOpacity onPress={handleReport} disabled={reporting} style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 4 }}>
          <Ionicons name="flag-outline" size={15} color={colors.ink4} />
          <Text style={{ fontSize: 13, color: colors.ink4 }}>Report this worker</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 10 }}>
        {activeGig && (
          <View style={{ flex: 1 }}>
            <Button
              variant="ghost"
              onPress={() => router.push({
                pathname: '/(customer)/gig/chat',
                params: { gigId: activeGig.id, workerName: worker.full_name || 'Worker' },
              })}
            >
              Message
            </Button>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Button onPress={() => router.push('/(customer)/gig/new')}>
            Book again
          </Button>
        </View>
        </View>
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
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink, textAlign: 'right', maxWidth: 180 }}>{value}</Text>
    </View>
  );
}
