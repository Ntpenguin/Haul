import React, { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../components/primitives';
import { colors, radii } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { isValidEmail, isValidPassword } from '../../lib/validate';

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignUp() {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Enter a valid email address');
      return;
    }
    if (!isValidPassword(password)) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { requiresConfirmation } = await signUp(email, password);
      if (requiresConfirmation) {
        router.replace({ pathname: '/(auth)/verify-otp', params: { email, role: 'customer' } });
      } else {
        router.replace('/(customer)/home');
      }
    } catch (err: any) {
      setError(err.message || 'Sign up failed');
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
          Create an account
        </Text>
        <Text style={{ fontSize: 15, color: colors.ink2, marginBottom: 28, lineHeight: 22 }}>
          Sign up to get started.
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
          placeholder="At least 6 characters"
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

        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6, marginTop: 16 }}>
          Confirm password
        </Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Repeat your password"
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
          <Button onPress={handleSignUp} loading={loading}>
            Create account
          </Button>
        </View>

        <Text style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: colors.ink3 }}>
          Already have an account?{' '}
          <Text
            style={{ color: colors.accent.deep, fontWeight: '600' }}
            onPress={() => router.push('/(auth)/phone')}
          >
            Sign in
          </Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
