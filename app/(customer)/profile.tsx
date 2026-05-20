import React from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Avatar } from '../../components/primitives';
import { colors } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, signOut, deleteAccount } = useAuth();

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
          <Avatar initials={profile?.full_name?.split(' ').map(n => n[0]).join('') || '?'} size={72} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 12 }}>
            {profile?.full_name || 'Your Name'}
          </Text>
          <Text style={{ fontSize: 14, color: colors.ink3, marginTop: 4 }}>
            {profile?.phone || 'Phone not set'}
          </Text>
        </Card>

        <View style={{ marginTop: 24, gap: 10 }}>
          <Button variant="ghost" onPress={handleSignOut}>Sign out</Button>
          <Button variant="ghost" onPress={handleDeleteAccount}>Delete account</Button>
        </View>
      </View>
    </ScrollView>
  );
}
