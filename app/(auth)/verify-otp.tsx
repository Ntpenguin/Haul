import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/primitives';
import { colors, radii } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth';

const CODE_LENGTH = 6;

export default function VerifyOtpScreen() {
  const { email, role } = useLocalSearchParams<{ email: string; role?: string }>();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);

  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Countdown for resend button
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function handleChange(val: string, idx: number) {
    // Handle paste of full code
    if (val.length > 1) {
      const digits = val.replace(/\D/g, '').slice(0, CODE_LENGTH).split('');
      const next = [...code];
      digits.forEach((d, i) => { if (idx + i < CODE_LENGTH) next[idx + i] = d; });
      setCode(next);
      const focusIdx = Math.min(idx + digits.length, CODE_LENGTH - 1);
      inputRefs.current[focusIdx]?.focus();
      return;
    }

    const digit = val.replace(/\D/g, '');
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < CODE_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  }

  function handleKeyPress(e: any, idx: number) {
    if (e.nativeEvent.key === 'Backspace' && !code[idx] && idx > 0) {
      const next = [...code];
      next[idx - 1] = '';
      setCode(next);
      inputRefs.current[idx - 1]?.focus();
    }
  }

  async function handleVerify() {
    const token = code.join('');
    if (token.length < CODE_LENGTH) {
      setError('Enter the full 6-digit code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // Try signup type first, then email type (used when resent via signInWithOtp)
      let verifyErr: any = null;
      for (const type of ['signup', 'email'] as const) {
        const { error } = await supabase.auth.verifyOtp({ email, token, type });
        if (!error) {
          if (role === 'mover') {
            router.replace('/(mover)/home');
          } else {
            router.replace('/(customer)/home');
          }
          return;
        }
        verifyErr = error;
      }
      throw verifyErr;
    } catch (err: any) {
      setError(err.message?.includes('expired') || err.message?.includes('invalid')
        ? 'Invalid or expired code. Request a new one below.'
        : err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError('');
    try {
      // Try resend first; fall back to signInWithOtp if the signup window expired
      const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email });
      if (resendErr) {
        const { error: otpErr } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });
        if (otpErr) throw otpErr;
      }
      setResent(true);
      setCountdown(60);
      setCode(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to resend. Try signing up again.');
    } finally {
      setResending(false);
    }
  }

  const filled = code.join('').length === CODE_LENGTH;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 80 }}>
        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 16, color: colors.ink2, fontWeight: '500' }}>← Back</Text>
        </TouchableOpacity>

        {/* Icon */}
        <View style={{
          width: 72, height: 72, borderRadius: 20,
          backgroundColor: colors.accent.soft,
          alignItems: 'center', justifyContent: 'center', marginBottom: 24,
        }}>
          <Ionicons name="mail-outline" size={36} color={colors.accent.deep} />
        </View>

        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 8 }}>
          Check your email
        </Text>
        <Text style={{ fontSize: 15, color: colors.ink2, marginBottom: 8, lineHeight: 22 }}>
          We sent a 6-digit code to
        </Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 32 }}>
          {email}
        </Text>

        {/* OTP boxes */}
        <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 32 }}>
          {Array(CODE_LENGTH).fill(0).map((_, idx) => (
            <TextInput
              key={idx}
              ref={(r) => { inputRefs.current[idx] = r; }}
              value={code[idx]}
              onChangeText={(v) => handleChange(v, idx)}
              onKeyPress={(e) => handleKeyPress(e, idx)}
              keyboardType="number-pad"
              maxLength={6}
              selectTextOnFocus
              style={{
                width: 48, height: 58,
                borderRadius: radii.md,
                borderWidth: 2,
                borderColor: code[idx] ? colors.accent.base : colors.line,
                backgroundColor: code[idx] ? colors.accent.soft : colors.card,
                fontSize: 24, fontWeight: '700',
                color: colors.ink,
                textAlign: 'center',
              }}
            />
          ))}
        </View>

        {/* Error */}
        {error ? (
          <Text style={{ fontSize: 13, color: colors.error, fontWeight: '500', textAlign: 'center', marginBottom: 16 }}>
            {error}
          </Text>
        ) : null}

        {/* Resent confirmation */}
        {resent && !error ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={{ fontSize: 13, color: colors.success, fontWeight: '500' }}>New code sent!</Text>
          </View>
        ) : null}

        {/* Verify button */}
        <Button onPress={handleVerify} loading={loading} disabled={!filled}>
          Verify email
        </Button>

        {/* Resend */}
        <View style={{ marginTop: 24, alignItems: 'center' }}>
          {countdown > 0 ? (
            <Text style={{ fontSize: 14, color: colors.ink3 }}>
              Resend code in <Text style={{ fontWeight: '700' }}>{countdown}s</Text>
            </Text>
          ) : (
            <TouchableOpacity onPress={handleResend} disabled={resending}>
              {resending ? (
                <ActivityIndicator size="small" color={colors.accent.base} />
              ) : (
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent.deep }}>
                  Resend code
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Spam note */}
        <Text style={{ fontSize: 12, color: colors.ink4, textAlign: 'center', marginTop: 20, lineHeight: 18 }}>
          Can't find it? Check your spam folder.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
