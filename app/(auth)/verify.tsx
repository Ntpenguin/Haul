import React, { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../components/primitives';
import { colors, radii } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { isValidEmail, isValidPassword, isValidPhone, formatPhone, passwordRequirements } from '../../lib/validate';
import { supabase } from '../../lib/supabase';
import { properCase } from '../../lib/nameFormat';

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignUp() {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name');
      return;
    }
    if (!isValidPhone(phone)) {
      setError('Enter a valid 10-digit phone number');
      return;
    }
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Enter a valid email address');
      return;
    }
    if (!isValidPassword(password)) {
      setError('Password does not meet all requirements');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // Check phone uniqueness before creating account
      const { data: existingPhone } = await supabase.from('profiles').select('id').eq('phone', phone).maybeSingle();
      if (existingPhone) {
        setError('An account with this phone number already exists. Try signing in instead.');
        setLoading(false);
        return;
      }
      const { requiresConfirmation } = await signUp(email, password);
      // Save name + phone to profile (works immediately if no confirmation needed)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await supabase.from('profiles').update({
          full_name: `${properCase(firstName)} ${properCase(lastName)}`.trim(),
          phone,
        }).eq('id', session.user.id);
      }
      if (requiresConfirmation) {
        router.replace({ pathname: '/(auth)/verify-otp', params: { email, role: 'customer', firstName: properCase(firstName), lastName: properCase(lastName), phone } });
      } else {
        router.replace('/(customer)/home');
      }
    } catch (err: any) {
      setError(err.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  const reqs = passwordRequirements(password);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 80, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
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

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 0 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>First name</Text>
            <TextInput
              value={firstName}
              onChangeText={(v) => setFirstName(v.replace(/[^a-zA-Z\s\-']/g, ''))}
              placeholder="Jane"
              placeholderTextColor={colors.ink4}
              autoCapitalize="words"
              style={{ height: 54, paddingHorizontal: 18, borderRadius: radii.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: error ? colors.error : colors.line, fontSize: 17, fontWeight: '600', color: colors.ink }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>Last name</Text>
            <TextInput
              value={lastName}
              onChangeText={(v) => setLastName(v.replace(/[^a-zA-Z\s\-']/g, ''))}
              placeholder="Smith"
              placeholderTextColor={colors.ink4}
              autoCapitalize="words"
              style={{ height: 54, paddingHorizontal: 18, borderRadius: radii.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: error ? colors.error : colors.line, fontSize: 17, fontWeight: '600', color: colors.ink }}
            />
          </View>
        </View>

        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6, marginTop: 16 }}>
          Phone number
        </Text>
        <TextInput
          value={phone}
          onChangeText={(v) => setPhone(formatPhone(v))}
          placeholder="(512) 555-0100"
          placeholderTextColor={colors.ink4}
          keyboardType="phone-pad"
          style={{ height: 54, paddingHorizontal: 18, borderRadius: radii.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: error ? colors.error : colors.line, fontSize: 17, fontWeight: '600', color: colors.ink, marginBottom: 16 }}
        />

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
          placeholder="Password"
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
        {password.length > 0 && (
          <View style={{ marginTop: 10, gap: 5 }}>
            {([
              { key: 'length', label: 'At least 8 characters' },
              { key: 'uppercase', label: 'One uppercase letter (A–Z)' },
              { key: 'lowercase', label: 'One lowercase letter (a–z)' },
              { key: 'digit', label: 'One number (0–9)' },
              { key: 'symbol', label: 'One symbol (!@#$…)' },
            ] as const).map(({ key, label }) => (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{
                  width: 16, height: 16, borderRadius: 8,
                  backgroundColor: reqs[key] ? colors.success : colors.surface,
                  borderWidth: 1.5,
                  borderColor: reqs[key] ? colors.success : colors.line2,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {reqs[key] && <Text style={{ fontSize: 10, color: '#fff', fontWeight: '800' }}>✓</Text>}
                </View>
                <Text style={{ fontSize: 13, color: reqs[key] ? colors.success : colors.ink3 }}>{label}</Text>
              </View>
            ))}
          </View>
        )}

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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
