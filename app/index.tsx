import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../stores/auth';
import { colors } from '../lib/theme';

export default function Index() {
  const { session, profile, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent.base} />
      </View>
    );
  }

  if (session) {
    // Route based on role
    if (profile?.role === 'mover') {
      return <Redirect href="/(mover)/home" />;
    }
    // 'customer' or 'both' (admin) go to customer home
    return <Redirect href="/(customer)/home" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}
