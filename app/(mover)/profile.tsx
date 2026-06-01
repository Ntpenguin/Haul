import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Avatar } from '../../components/primitives';
import { colors } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { supabase, type Business, type FleetVehicle } from '../../lib/supabase';

export default function MoverProfileScreen() {
  const router = useRouter();
  const { profile, signOut, deleteAccount } = useAuth();

  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('') || '?';
  const rating = profile?.rating ? profile.rating.toFixed(1) : null;
  const totalGigs = profile?.total_gigs ?? 0;

  const [employer, setEmployer] = useState<Business | null>(null);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);

  useEffect(() => {
    if (!profile?.id) return;
    let active = true;
    (async () => {
      const { data: mp } = await supabase.from('mover_profiles').select('business_id').eq('id', profile.id).single();
      if (!active) return;
      if (mp?.business_id) {
        const { data: biz } = await supabase.from('businesses').select('*').eq('id', mp.business_id).single();
        if (active) setEmployer(biz ?? null);
      } else if (active) {
        setEmployer(null);
      }
      const { data: vs } = await supabase.from('fleet_vehicles').select('*').eq('assigned_mover_id', profile.id);
      if (active) setVehicles(vs ?? []);
    })();
    return () => { active = false; };
  }, [profile?.id]);

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: deleteAccount },
      ],
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ paddingTop: 60, paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 24 }}>
          Profile
        </Text>

        <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Avatar initials={initials} size={72} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 12 }}>
            {profile?.full_name || '—'}
          </Text>
          <Text style={{ fontSize: 14, color: colors.ink3, marginTop: 4 }}>
            {profile?.email || ''}
          </Text>

          <View style={{ flexDirection: 'row', gap: 24, marginTop: 16 }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={16} color={colors.accent.base} />
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>
                  {rating ?? '—'}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>Rating</Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.line }} />
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>{totalGigs}</Text>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>Jobs done</Text>
            </View>
          </View>
        </Card>

        {(employer || vehicles.length > 0) && (
          <Card style={{ marginTop: 16, padding: 16 }}>
            {employer && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="business-outline" size={20} color={colors.accent.deep} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.ink3 }}>Employer</Text>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink }}>{employer.name}</Text>
                </View>
              </View>
            )}
            {vehicles.map((v, i) => (
              <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: (employer || i > 0) ? 12 : 0 }}>
                <Ionicons name="car-outline" size={20} color={colors.accent.deep} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.ink3 }}>Assigned vehicle</Text>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink }}>
                    {[v.year, v.make, v.model].filter(Boolean).join(' ') || v.vehicle_type || 'Vehicle'}{v.license_plate ? ` · ${v.license_plate}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        <View style={{ marginTop: 24, gap: 10 }}>
          <Button variant="soft" onPress={() => router.push('/(mover)/earnings')}>View earnings</Button>
          <Button variant="ghost" onPress={handleSignOut}>Sign out</Button>
          <Button variant="ghost" onPress={handleDeleteAccount}>Delete account</Button>
        </View>
      </View>
    </ScrollView>
  );
}
