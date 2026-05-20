import React from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Avatar } from '../../components/primitives';
import { colors } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';

export default function MoverProfileScreen() {
  const router = useRouter();
  const { profile, signOut, deleteAccount } = useAuth();

  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('') || '?';
  const rating = profile?.rating ? profile.rating.toFixed(1) : null;
  const totalGigs = profile?.total_gigs ?? 0;

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

        <View style={{ marginTop: 24, gap: 10 }}>
          <Button variant="soft" onPress={() => router.push('/(mover)/earnings')}>View earnings</Button>
          <Button variant="ghost" onPress={handleSignOut}>Sign out</Button>
          <Button variant="ghost" onPress={handleDeleteAccount}>Delete account</Button>
        </View>
      </View>
    </ScrollView>
  );
}
