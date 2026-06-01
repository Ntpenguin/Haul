import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Animated, Alert, RefreshControl, FlatList } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chip, Avatar, Tag, GigCardSkeleton } from '../../components/primitives';
import { colors, radii, shadows } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { useGigs } from '../../hooks/useGigs';
import { formatCents, moverPayoutCents } from '../../lib/pricing';
import { supabase } from '../../lib/supabase';
import type { Gig } from '../../lib/supabase';

const NATO = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];

const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  moving: '#F59E0B',
  cleaning: '#3B82F6',
  landscaping: '#22C55E',
  auto: '#F97316',
};

function assignNatoNames(gigs: Gig[]): Record<string, string> {
  const scheduled = gigs.filter((g) => g.scheduled_for).sort(
    (a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime(),
  );
  const groups: Gig[][] = [];
  for (const gig of scheduled) {
    const t = new Date(gig.scheduled_for!).getTime();
    const match = groups.find((g) => Math.abs(t - new Date(g[0].scheduled_for!).getTime()) <= 90 * 60 * 1000);
    if (match) match.push(gig);
    else groups.push([gig]);
  }
  const names: Record<string, string> = {};
  for (const group of groups) {
    if (group.length > 1) group.forEach((g, i) => { names[g.id] = NATO[i] ?? `Gig ${i + 1}`; });
  }
  return names;
}

export default function MoverHome() {
  const router = useRouter();
  const { profile, session, isLoading, signOut } = useAuth();
  const { fetchAvailableGigs } = useGigs();
  const [online, setOnline] = useState(true);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [myJobs, setMyJobs] = useState<Gig[]>([]);
  const [completedJobs, setCompletedJobs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);
  const [moverStatus, setMoverStatus] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [timingFilter, setTimingFilter] = useState<'all' | 'asap' | 'scheduled'>('all');
  const [sizeFilter, setSizeFilter] = useState<'all' | 'small' | 'medium' | 'large'>('all');

  // Redirect to welcome on sign out
  useEffect(() => {
    if (!isLoading && !session) {
      router.replace('/(auth)/welcome');
    }
  }, [session, isLoading]);

  // Redirect customers away from mover pages
  useEffect(() => {
    if (profile && profile.role === 'customer') {
      router.replace('/(customer)/home');
    }
  }, [profile]);

  // Fetch mover approval status + subscribe for real-time approval
  useEffect(() => {
    if (!profile?.id) return;
    async function checkStatus() {
      const { data } = await supabase
        .from('mover_profiles')
        .select('status')
        .eq('id', profile!.id)
        .maybeSingle();
      setMoverStatus(data?.status || 'pending');
    }
    checkStatus();

    const channel = supabase
      .channel(`mover_status_${profile.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mover_profiles', filter: `id=eq.${profile.id}` }, (payload) => {
        const newStatus = (payload.new as any)?.status;
        if (newStatus) setMoverStatus(newStatus);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      setRefreshKey(k => k + 1);
    }, [])
  );

  useEffect(() => {
    if (online && moverStatus === 'approved') loadGigs();
  }, [online, moverStatus, refreshKey]);


  async function loadGigs() {
    setLoading(true);
    try {
      const [available, matched, completed, blocks] = await Promise.all([
        fetchAvailableGigs(),
        profile?.id
          ? supabase
              .from('gigs')
              .select('*')
              .eq('mover_id', profile.id)
              .in('status', ['matched', 'in_progress'])
              .order('created_at', { ascending: false })
              .then(({ data }) => data || [])
          : Promise.resolve([]),
        profile?.id
          ? supabase
              .from('gigs')
              .select('*')
              .eq('mover_id', profile.id)
              .in('status', ['completed'])
              .order('created_at', { ascending: false })
              .then(({ data }) => data || [])
          : Promise.resolve([]),
        profile?.id
          ? supabase.from('user_blocks').select('blocked_id').eq('blocker_id', profile.id).then(({ data }) => (data || []).map((b: any) => b.blocked_id))
          : Promise.resolve([]),
      ]);
      const blockedIds = new Set(blocks as string[]);
      setGigs(available.filter((g: Gig) => !g.customer_id || !blockedIds.has(g.customer_id)));
      setMyJobs(matched);
      setCompletedJobs(completed);
    } catch (err) {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  const name = profile?.full_name?.split(' ')[0] || 'Worker';
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  // Show pending/rejected screen if not approved
  if (moverStatus && moverStatus !== 'approved') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 }}>
        <View style={{ paddingTop: 60, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <TouchableOpacity onPress={() => router.push('/(mover)/settings')}>
            <Avatar initials={initials} uri={profile?.avatar_url || undefined} size={36} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
          <View style={{
            width: 90, height: 90, borderRadius: 45,
            backgroundColor: moverStatus === 'rejected' || moverStatus === 'suspended' ? '#FFEBEE' : colors.accent.soft,
            alignItems: 'center', justifyContent: 'center', marginBottom: 24,
          }}>
            <Ionicons
              name={moverStatus === 'rejected' || moverStatus === 'suspended' ? 'close-circle-outline' : 'time-outline'}
              size={44}
              color={moverStatus === 'rejected' || moverStatus === 'suspended' ? '#D32F2F' : colors.accent.deep}
            />
          </View>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 10 }}>
            {moverStatus === 'rejected' ? 'Application rejected' :
             moverStatus === 'suspended' ? 'Account suspended' :
             'Verification pending'}
          </Text>
          <Text style={{ fontSize: 16, color: colors.ink2, textAlign: 'center', lineHeight: 24, maxWidth: 300 }}>
            {moverStatus === 'rejected' ? 'Unfortunately your application was not approved. Please contact support for more info.' :
             moverStatus === 'suspended' ? 'Your account has been suspended. Please contact support.' :
             'Your account is being reviewed by our team. You\'ll be able to see and apply to jobs once you\'re approved.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadGigs} tintColor={colors.accent.base} colors={[colors.accent.base]} />}
    >
      {/* Header */}
      <View style={{ paddingTop: 60, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.push('/(mover)/settings')}>
          <Avatar initials={initials} uri={profile?.avatar_url || undefined} size={40} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, color: colors.ink3 }}>Welcome back,</Text>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 }}>{name}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(mover)/inbox')}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chatbubbles-outline" size={18} color={colors.ink2} />
        </TouchableOpacity>
        <OnlineToggle online={online} onToggle={() => setOnline(!online)} />
      </View>

      {/* Info card — payment note */}
      <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
        <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.accent.soft, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent.deep} />
          <Text style={{ flex: 1, fontSize: 13, color: colors.accent.deep, fontWeight: '500' }}>
            Customers pay in full through the app. You're paid out after each job, minus a 15% service fee.
          </Text>
        </View>
      </View>

      {/* My active jobs */}
      {myJobs.length > 0 && (
        <>
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 }}>
              My jobs
            </Text>
          </View>
          <View style={{ paddingHorizontal: 20, gap: 10, marginBottom: 8 }}>
            {myJobs.map((gig, index) => (
              <AnimatedJobCard key={gig.id} index={index}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => router.push({ pathname: '/(mover)/gig/[id]', params: { id: gig.id } })}>
                <Card style={{ padding: 16, borderWidth: 2, borderColor: colors.accent.base }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <View>
                      <Text style={{ fontSize: 24, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 }}>
                        {gig.quoted_price_cents ? formatCents(gig.quoted_price_cents) : 'TBD'}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                        {gig.quoted_price_cents ? `${formatCents(moverPayoutCents(gig.quoted_price_cents))} your payout` : 'Total pay'}
                      </Text>
                    </View>
                    <Tag color={gig.status === 'in_progress' ? 'good' : 'accent'}>
                      {gig.status === 'in_progress' ? 'PAID' : 'MATCHED'}
                    </Tag>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                    <View style={{ paddingTop: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink }} />
                      <View style={{ width: 2, height: 16, backgroundColor: colors.line2, marginVertical: 3, alignSelf: 'center' }} />
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.accent.base }} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: colors.ink, fontSize: 14 }}>{gig.from_address}</Text>
                      <View style={{ height: 10 }} />
                      <Text style={{ fontWeight: '600', color: colors.ink, fontSize: 14 }}>{gig.to_address}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/(mover)/gig/chat', params: { gigId: gig.id, customerName: 'Customer' } })}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      gap: 8, paddingVertical: 10, borderRadius: 12,
                      backgroundColor: colors.accent.soft,
                    }}
                  >
                    <Ionicons name="chatbubble-outline" size={16} color={colors.accent.deep} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent.deep }}>Message customer</Text>
                  </TouchableOpacity>
                </Card>
              </TouchableOpacity>
              </AnimatedJobCard>
            ))}
          </View>
        </>
      )}

      {/* Previous jobs */}
      {completedJobs.length > 0 && (
        <>
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 }}>
              Previous jobs
            </Text>
          </View>
          <View style={{ paddingHorizontal: 20, gap: 10, marginBottom: 8 }}>
            {completedJobs.map((gig) => (
              <Card key={gig.id} style={{ padding: 16, borderWidth: 1, borderColor: colors.line }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 }}>
                    {gig.quoted_price_cents ? formatCents(gig.quoted_price_cents) : 'TBD'}
                  </Text>
                  <Tag color="good">COMPLETED</Tag>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <View style={{ paddingTop: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink }} />
                    <View style={{ width: 2, height: 16, backgroundColor: colors.line2, marginVertical: 3, alignSelf: 'center' }} />
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.accent.base }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: colors.ink, fontSize: 14 }}>{gig.from_address}</Text>
                    <View style={{ height: 10 }} />
                    <Text style={{ fontWeight: '600', color: colors.ink, fontSize: 14 }}>{gig.to_address}</Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </>
      )}

      {online ? (
        <>
          {/* Jobs header */}
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 }}>
              Available jobs
            </Text>
            <TouchableOpacity onPress={loadGigs}>
              <Text style={{ fontSize: 13, color: colors.accent.base, fontWeight: '600' }}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 10 }}>
            {(['all', 'asap', 'scheduled'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTimingFilter(t)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                  backgroundColor: timingFilter === t ? colors.ink : colors.surface,
                  borderWidth: 1, borderColor: timingFilter === t ? colors.ink : colors.line,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: timingFilter === t ? '#fff' : colors.ink2 }}>
                  {t === 'all' ? 'All' : t === 'asap' ? 'ASAP' : 'Scheduled'}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={{ width: 1, backgroundColor: colors.line, marginHorizontal: 4 }} />
            {(['all', 'small', 'medium', 'large'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setSizeFilter(s)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                  backgroundColor: sizeFilter === s ? colors.accent.base : colors.surface,
                  borderWidth: 1, borderColor: sizeFilter === s ? colors.accent.base : colors.line,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: sizeFilter === s ? '#fff' : colors.ink2 }}>
                  {s === 'all' ? 'Any size' : s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? (
            <View style={{ paddingHorizontal: 20, gap: 12, marginTop: 4 }}>
              <GigCardSkeleton />
              <GigCardSkeleton />
              <GigCardSkeleton />
            </View>
          ) : (() => {
            const categoryColors = { ...DEFAULT_CATEGORY_COLORS, ...(profile?.category_colors || {}) };
            const filtered = gigs.filter(g => {
              if (timingFilter === 'asap' && g.scheduled_for) return false;
              if (timingFilter === 'scheduled' && !g.scheduled_for) return false;
              const size = g.home_size?.toLowerCase() || '';
              if (sizeFilter === 'small' && !['studio', '1br', '1 bedroom', 'item'].includes(size)) return false;
              if (sizeFilter === 'medium' && !['2br', '2 bedroom', '3br', '3 bedroom'].includes(size)) return false;
              if (sizeFilter === 'large' && !['4br', '4 bedroom', 'house', 'commercial', '5br+'].includes(size)) return false;
              return true;
            });
            const natoNames = assignNatoNames(filtered);
            if (filtered.length === 0) return (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  <Ionicons name="search-outline" size={36} color={colors.ink3} />
                </View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>No jobs right now</Text>
                <Text style={{ fontSize: 15, color: colors.ink2, marginTop: 8, textAlign: 'center', maxWidth: 260 }}>
                  Check back soon — new jobs are posted all the time.
                </Text>
              </View>
            );
            return (
              <View style={{ paddingHorizontal: 20, gap: 12 }}>
                {filtered.map((gig, index) => (
                  <AnimatedJobCard key={gig.id} index={index}>
                    <JobCard
                      gig={gig}
                      natoName={natoNames[gig.id]}
                      categoryColor={categoryColors[gig.gig_category] || categoryColors.moving}
                      onPress={() => router.push({ pathname: '/(mover)/gig/[id]', params: { id: gig.id } })}
                    />
                  </AnimatedJobCard>
                ))}
              </View>
            );
          })()}
        </>
      ) : (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Ionicons name="construct-outline" size={36} color={colors.ink3} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ink }}>You're offline</Text>
          <Text style={{ fontSize: 15, color: colors.ink2, marginTop: 8, textAlign: 'center', maxWidth: 260 }}>
            Go online to see available jobs near you.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function AnimatedJobCard({ children, index }: { children: React.ReactNode; index: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 14,
      bounciness: 5,
      delay: index * 55,
    }).start();
  }, []);
  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
    }}>
      {children}
    </Animated.View>
  );
}

function OnlineToggle({ online, onToggle }: { online: boolean; onToggle: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  return (
    <TouchableOpacity
      onPress={onToggle}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={1}
    >
      <Animated.View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 36, borderRadius: 18,
        backgroundColor: online ? colors.accent.soft : colors.surface,
        borderWidth: 1, borderColor: online ? colors.accent.base : colors.line,
        transform: [{ scale }],
      }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: online ? colors.accent.base : colors.ink4 }} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: online ? colors.accent.deep : colors.ink3 }}>
          {online ? 'Online' : 'Offline'}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

function JobCard({ gig, onPress, natoName, categoryColor }: { gig: Gig; onPress: () => void; natoName?: string; categoryColor?: string }) {
  const isAsap = !gig.scheduled_for;
  const color = categoryColor || '#F59E0B';
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  return (
    <TouchableOpacity onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} activeOpacity={1}>
      <Animated.View style={{ transform: [{ scale }] }}>
      <Card style={{ padding: 18, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, borderLeftColor: color }}>
        {/* NATO name badge */}
        {natoName && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: color + '22' }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color, letterSpacing: 0.8 }}>{natoName.toUpperCase()}</Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.ink4 }}>overlapping time slot</Text>
          </View>
        )}
        {/* Category label */}
        {gig.gig_category && gig.gig_category !== 'moving' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
            <Text style={{ fontSize: 11, fontWeight: '700', color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {gig.gig_category}
            </Text>
          </View>
        )}
        {/* Title if set */}
        {gig.gig_title && (
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 6 }} numberOfLines={1}>
            {gig.gig_title}
          </Text>
        )}
        {/* Pay + tags */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <View>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.6 }}>
              {gig.quoted_price_cents ? formatCents(gig.quoted_price_cents) : 'TBD'}
            </Text>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4 }}>
              {gig.home_size || gig.gig_category || 'Job'} - {gig.crew_size || 1} crew
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Tag color={isAsap ? 'warn' : 'neutral'}>{isAsap ? 'ASAP' : 'SCHEDULED'}</Tag>
          </View>
        </View>

        {/* Route */}
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <View style={{ paddingTop: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink }} />
            <View style={{ width: 2, height: 16, backgroundColor: colors.line2, marginVertical: 3, alignSelf: 'center' }} />
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.accent.base }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: colors.ink, fontSize: 14 }}>{gig.from_address}</Text>
            <View style={{ height: 10 }} />
            <Text style={{ fontWeight: '600', color: colors.ink, fontSize: 14 }}>{gig.to_address}</Text>
          </View>
        </View>

        {/* Meta */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {gig.home_size && <MiniMeta icon="home-outline" label={gig.home_size} />}
          <MiniMeta icon="people-outline" label={`${gig.crew_size || 1} crew`} />
          {gig.truck_size && gig.truck_size !== 'none' && <MiniMeta icon="car-outline" label={gig.truck_size} />}
          {(gig.stairs_from > 0 || gig.stairs_to > 0) && (
            <MiniMeta icon="trending-up-outline" label={`${gig.stairs_from + gig.stairs_to} flights`} />
          )}
        </View>
      </Card>
      </Animated.View>
    </TouchableOpacity>
  );
}

function MiniMeta({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, backgroundColor: colors.surface }}>
      <Ionicons name={icon as any} size={13} color={colors.ink2} />
      <Text style={{ fontSize: 12, fontWeight: '500', color: colors.ink2 }}>{label}</Text>
    </View>
  );
}
