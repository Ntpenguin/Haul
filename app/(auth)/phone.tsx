import React, { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../components/primitives';
import { colors, radii } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignIn() {
    if (!email || !password) {
      setError('Please fill in both fields');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profile?.role === 'mover') {
          router.replace('/(mover)/home');
          return;
        }
      }
      router.replace('/(customer)/home');
    } catch (err: any) {
      const msg: string = err.message || '';
      if (msg.toLowerCase().includes('email not confirmed') || msg.toLowerCase().includes('not verified')) {
        // Resend confirmation and redirect to OTP screen
        await supabase.auth.resend({ type: 'signup', email });
        router.replace({ pathname: '/(auth)/verify-otp', params: { email, role: 'customer' } });
        return;
      }
      setError(msg || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 80 }}>
        <View style={{ marginBottom: 32 }}>
          <Text
            onPress={() => router.back()}
            style={{ fontSize: 16, color: colors.ink2, fontWeight: '500' }}
          >
            ← Back
          </Text>
        </View>

        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 8 }}>
          Welcome back
        </Text>
        <Text style={{ fontSize: 15, color: colors.ink2, marginBottom: 28, lineHeight: 22 }}>
          Sign in to your account.
        </Text>

        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
          Email
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.ink4}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          style={{
            height: 54,
            paddingHorizontal: 18,
            borderRadius: radii.md,
            backgroundColor: colors.card,
            borderWidth: 1.5,
            borderColor: error ? colors.error : colors.line,
            fontSize: 17,
            fontWeight: '600',
            color: colors.ink,
          }}
        />

        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6, marginTop: 16 }}>
          Password
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          placeholderTextColor={colors.ink4}
          secureTextEntry
          style={{
            height: 54,
            paddingHorizontal: 18,
            borderRadius: radii.md,
            backgroundColor: colors.card,
            borderWidth: 1.5,
            borderColor: error ? colors.error : colors.line,
            fontSize: 17,
            fontWeight: '600',
            color: colors.ink,
          }}
        />

        {error ? (
          <Text style={{ fontSize: 13, color: colors.error, marginTop: 8, fontWeight: '500' }}>
            {error}
          </Text>
        ) : null}

        <View style={{ marginTop: 28 }}>
          <Button onPress={handleSignIn} loading={loading}>
            Sign in
          </Button>
        </View>

        <Text style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: colors.ink3 }}>
          Don't have an account?{' '}
          <Text
            style={{ color: colors.accent.deep, fontWeight: '600' }}
            onPress={() => router.push('/(auth)/verify')}
          >
            Sign up
          </Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
