import React, { useEffect, useRef } from 'react';
import { LogBox } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../stores/auth';
import { STRIPE_PUBLISHABLE_KEY } from '../lib/stripe';
import { StripeProvider } from '../lib/stripe-native';
import { registerPushToken } from '../lib/notifications';
import '../lib/locationTask'; // register background task at app start

LogBox.ignoreLogs(['forwardRef render functions']);

export default function RootLayout() {
  useAuth();
  const profile = useAuthStore((s) => s.profile);
  const router = useRouter();
  const notifListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  // Register push token when user signs in
  useEffect(() => {
    if (profile?.id) {
      registerPushToken(profile.id);
    }
  }, [profile?.id]);

  // Handle notification taps — navigate to the relevant gig
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (data?.gigId && data?.role) {
        if (data.role === 'mover') {
          router.push({ pathname: '/(mover)/gig/[id]', params: { id: data.gigId } });
        } else {
          router.push({ pathname: '/(customer)/gig/[id]', params: { id: data.gigId } });
        }
      }
    });

    return () => {
      responseListener.current?.remove();
      notifListener.current?.remove();
    };
  }, []);

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="(mover)" />
      </Stack>
    </StripeProvider>
  );
}
