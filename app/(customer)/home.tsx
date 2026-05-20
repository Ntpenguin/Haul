import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Avatar, Tag } from '../../components/primitives';
import { colors, radii, shadows, spacing } from '../../lib/theme';
import { useGigs } from '../../hooks/useGigs';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import type { Gig } from '../../lib/supabase';
import { formatCents } from '../../lib/pricing';

export default function CustomerHome() {
  const router = useRouter();
  const { profile, session, isLoading, signOut } = useAuth();
  const { fetchMyGigs } = useGigs();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [previousWorkers, setPreviousWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(useCallback(() => { setRefreshKey(k => k + 1); }, []));

  // Real-time: gig status changes for this customer
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`customer-home-${profile.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'gigs',
        filter: `customer_id=eq.${profile.id}`,
      }, (payload) => {
        const updated = payload.new as Gig;
        setGigs(prev => prev.map(g => g.id === updated.id ? updated : g));
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'gig_applications',
      }, () => {
        // Refresh when a mover applies to any gig
        loadGigs();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  // Redirect to welcome on sign out
  useEffect(() => {
    if (!isLoading && !session) {
      router.replace('/(auth)/welcome');
    }
  }, [session, isLoading]);

  // Redirect movers away from customer pages
  useEffect(() => {
    if (profile && profile.role === 'mover') {
      router.replace('/(mover)/home');
    }
  }, [profile]);

  useEffect(() => {
    if (profile) loadGigs();
  }, [profile, refreshKey]);

  async function loadGigs() {
    try {
      const data = await fetchMyGigs();
      setGigs(data);

      // Fetch unique previous workers from matched/completed gigs
      if (profile?.id) {
        const moverIds = [...new Set(data.filter(g => g.mover_id).map(g => g.mover_id!))];
        if (moverIds.length > 0) {
          const { data: workers } = await supabase
            .from('profiles')
            .select('*')
            .in('id', moverIds);
          setPreviousWorkers(workers || []);
        }
      }
    } catch (err) {
      // silently fail — show empty state
    } finally {
      setLoading(false);
    }
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : profile?.email?.[0]?.toUpperCase() || '?';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadGigs} tintColor={colors.accent.base} colors={[colors.accent.base]} />}
    >
      {/* Header */}
      <View style={{ paddingTop: 60, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: colors.accent.base, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: -0.5 }}>FFX</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => router.push('/(customer)/settings')}>
            <Avatar initials={initials} uri={profile?.avatar_url || undefined} size={36} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Hero card */}
      <View style={{ padding: 20 }}>
        <View
          style={[
            {
              backgroundColor: colors.accent.base,
              borderRadius: radii.xxl,
              padding: 24,
              overflow: 'hidden',
            },
            shadows.elevated,
          ]}
        >
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff', lineHeight: 30, letterSpacing: -0.5, marginBottom: 6, maxWidth: 260 }}>
            Ready to{'\n'}move?
          </Text>
          <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 18 }}>
            Estimated wait time: 20min - 1hr
          </Text>

          <TouchableOpacity
            onPress={() => router.push('/(customer)/gig/new')}
            activeOpacity={0.9}
            style={{
              width: '100%',
              height: 58,
              backgroundColor: '#fff',
              borderRadius: radii.xxl,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 18,
              paddingRight: 6,
            }}
          >
            <Ionicons name="location" size={20} color={colors.accent.deep} />
            <Text style={{ flex: 1, marginLeft: 10, fontSize: 16, color: colors.ink3 }}>
              What do you need done?
            </Text>
            <View style={{ height: 46, paddingHorizontal: 16, backgroundColor: colors.ink, borderRadius: 23, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Start</Text>
              <Ionicons name="chevron-forward" size={14} color="#fff" style={{ marginLeft: 4 }} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Active jobs */}
      {loading ? (
        <View style={{ paddingHorizontal: 20 }}>
          <ActivityIndicator color={colors.accent.base} style={{ marginVertical: 20 }} />
        </View>
      ) : gigs.length === 0 ? (
        <View style={{ paddingHorizontal: 20 }}>
          <Card style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, color: colors.ink3, textAlign: 'center' }}>
              No gigs yet. Tap "Start" above to post your first one.
            </Text>
          </Card>
        </View>
      ) : (
        <>
          {gigs.filter(g => ['posted', 'matched', 'in_progress'].includes(g.status)).length > 0 && (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: -0.4, marginBottom: 12 }}>
                Active jobs
              </Text>
              <View style={{ gap: 10 }}>
                {gigs.filter(g => ['posted', 'matched', 'in_progress'].includes(g.status)).map((gig) => (
                  <TouchableOpacity
                    key={gig.id}
                    activeOpacity={0.85}
                    onPress={() => router.push({ pathname: '/(customer)/gig/[id]', params: { id: gig.id } })}
                  >
                    <RecentGigCard
                      from={gig.from_address}
                      to={gig.to_address}
                      status={gigStatusLabel(gig)}
                      price={gig.quoted_price_cents}
                      live={gig.status === 'posted'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {gigs.filter(g => ['completed', 'cancelled'].includes(g.status)).length > 0 && (
            <View style={{ paddingHorizontal: 20, marginTop: gigs.filter(g => ['posted', 'matched', 'in_progress'].includes(g.status)).length > 0 ? 24 : 0 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: -0.4, marginBottom: 12 }}>
                Previous jobs
              </Text>
              <View style={{ gap: 10 }}>
                {gigs.filter(g => ['completed', 'cancelled'].includes(g.status)).map((gig) => (
                  <TouchableOpacity
                    key={gig.id}
                    activeOpacity={0.85}
                    onPress={() => router.push({ pathname: '/(customer)/gig/[id]', params: { id: gig.id } })}
                  >
                    <RecentGigCard
                      from={gig.from_address}
                      to={gig.to_address}
                      status={gigStatusLabel(gig)}
                      price={gig.quoted_price_cents}
                      live={false}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </>
      )}

      {/* My Workers */}
      {previousWorkers.length > 0 && (
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 }}>
              Your crew
            </Text>
            {previousWorkers.length > 3 && (
              <TouchableOpacity onPress={() => router.push('/(customer)/workers')}>
                <Text style={{ fontSize: 13, color: colors.accent.base, fontWeight: '600' }}>See all</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, paddingHorizontal: 20 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {previousWorkers.map((worker) => {
                const workerInitials = worker.full_name
                  ? worker.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                  : '?';
                return (
                  <TouchableOpacity
                    key={worker.id}
                    activeOpacity={0.85}
                    onPress={() => router.push({ pathname: '/(customer)/worker/[id]', params: { id: worker.id } })}
                  >
                    <Card style={{ padding: 16, width: 140, alignItems: 'center' }}>
                      <Avatar initials={workerInitials} size={52} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink, marginTop: 10, textAlign: 'center' }} numberOfLines={1}>
                        {worker.full_name || 'Worker'}
                      </Text>
                      {worker.rating && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <Ionicons name="star" size={12} color={colors.accent.base} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink2 }}>{worker.rating}</Text>
                        </View>
                      )}
                      <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 4 }}>Tap to view</Text>
                    </Card>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Ways to move */}
      <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: -0.4, marginBottom: 12 }}>
          Ways to move
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <QuickCard icon="flash" title="On-demand" sub="In ~30 min" />
          <QuickCard icon="calendar" title="Scheduled" sub="Up to 30 days" />
          <QuickCard icon="cube" title="Single item" sub="Couch, desk, etc." />
          <QuickCard icon="home" title="Full home" sub="Studio to 4+ bdr" />
        </View>
      </View>

    </ScrollView>
  );
}

function gigStatusLabel(gig: Gig): string {
  switch (gig.status) {
    case 'posted': return 'Looking for workers';
    case 'matched': return 'Matched — deposit needed';
    case 'in_progress': return 'Deposit paid — in progress';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    default: return gig.status;
  }
}

function RecentGigCard({ from, to, status, price, live }: { from: string; to: string; status: string; price?: number | null; live?: boolean }) {
  return (
    <Card style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ paddingTop: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink }} />
          <View style={{ width: 2, height: 22, backgroundColor: colors.line2, marginVertical: 3, alignSelf: 'center' }} />
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.accent.base }} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink, letterSpacing: -0.2 }}>{from}</Text>
          <View style={{ height: 14 }} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink, letterSpacing: -0.2 }}>{to}</Text>
        </View>
        {live && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.success }}>LIVE</Text>
          </View>
        )}
      </View>
      <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: colors.ink2, fontWeight: '500' }}>{status}</Text>
        {price ? (
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{formatCents(price)}</Text>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
        )}
      </View>
    </Card>
  );
}

function QuickCard({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <Card style={{ width: '48%', padding: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accent.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
        <Ionicons name={icon as any} size={22} color={colors.accent.deep} />
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 }}>{title}</Text>
      <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{sub}</Text>
    </Card>
  );
}
