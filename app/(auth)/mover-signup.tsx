import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card } from '../../components/primitives';
import { colors, radii } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { properCase } from '../../lib/nameFormat';
import { filterName, formatPhone, isValidEmail, isValidPhone, isValidPassword } from '../../lib/validate';

const VEHICLE_OPTIONS = [
  { id: 'own-truck', label: 'I own a truck', sub: 'Bring your own - higher earnings' },
  { id: 'own-van', label: 'I own a van', sub: 'Great for small moves' },
  { id: 'muscle', label: 'Muscle-only (no vehicle)', sub: 'No vehicle, no problem' },
  { id: 'rent', label: 'I rent trucks as needed', sub: "We'll help find one" },
];

const STEPS = ['intro', 'name', 'phone', 'vehicle', 'license', 'insurance', 'service-area', 'account', 'bio', 'done'] as const;

export default function MoverSignupScreen() {
  const router = useRouter();
  const { session, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    vehicleType: '',
    licenseFront: null as string | null,
    licenseBack: null as string | null,
    insuranceDoc: null as string | null,
    serviceZips: '',
    bio: '',
  });

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  function update(key: keyof typeof form, value: string | null) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validateMoverStep(): string | null {
    switch (current) {
      case 'name':
        if (!form.firstName.trim()) return 'Enter your first name';
        if (!/^[a-zA-Z\s\-']+$/.test(form.firstName.trim())) return 'First name can only contain letters';
        if (!form.lastName.trim()) return 'Enter your last name';
        if (!/^[a-zA-Z\s\-']+$/.test(form.lastName.trim())) return 'Last name can only contain letters';
        return null;
      case 'phone':
        if (!form.phone.trim()) return 'Enter your phone number';
        if (!isValidPhone(form.phone)) return 'Enter a valid 10-digit phone number';
        return null;
      case 'vehicle':
        if (!form.vehicleType) return 'Select a vehicle option';
        return null;
      case 'service-area':
        if (!form.serviceZips.trim()) return 'Enter at least one ZIP code';
        return null;
      case 'account':
        if (!form.email.trim()) return 'Enter your email';
        if (!isValidEmail(form.email)) return 'Enter a valid email address';
        if (!form.password) return 'Enter a password';
        if (!isValidPassword(form.password)) return 'Password must be at least 6 characters';
        return null;
      // intro, license, insurance, bio, done — optional or no input
      default:
        return null;
    }
  }

  async function handleNext() {
    const validationError = validateMoverStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');

    if (current === 'account') {
      // Create account or sign in
      setSubmitting(true);
      try {
        let needsConfirmation = false;
        try {
          const { data, error: signUpErr } = await supabase.auth.signUp({
            email: form.email,
            password: form.password,
          });
          if (signUpErr) {
            if (signUpErr.message?.includes('already registered')) {
              const { error: signInErr } = await supabase.auth.signInWithPassword({
                email: form.email,
                password: form.password,
              });
              if (signInErr) throw signInErr;
            } else {
              throw signUpErr;
            }
          } else {
            needsConfirmation = !data.session;
          }
        } catch (e) {
          throw e;
        }
        if (needsConfirmation) {
          router.replace({ pathname: '/(auth)/verify-otp', params: { email: form.email, role: 'mover' } });
        } else {
          setStep(step + 1);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to create account');
      } finally {
        setSubmitting(false);
      }
    } else if (current === 'bio') {
      // Submit profile to Supabase
      setSubmitting(true);
      setError('');
      try {
        // Re-read session in case it just got set from the account step
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        const userId = currentSession?.user?.id;
        if (!userId) throw new Error('Not signed in — go back and create your account');

        // Update profile to mover role
        const { error: profileErr } = await supabase
          .from('profiles')
          .update({
            role: 'mover',
            full_name: `${form.firstName} ${form.lastName}`.trim() || null,
            phone: form.phone || null,
            email: form.email || null,
          })
          .eq('id', userId);
        if (profileErr) throw profileErr;

        // Create mover profile
        const zips = form.serviceZips
          .split(',')
          .map(z => z.trim())
          .filter(Boolean);

        const { error: moverErr } = await supabase
          .from('mover_profiles')
          .upsert({
            id: userId,
            vehicle_type: form.vehicleType || null,
            service_area_zip: zips,
            bio: form.bio || null,
          });
        if (moverErr) throw moverErr;

        await refreshProfile();
        router.replace({ pathname: '/(auth)/verify-otp', params: { email: form.email, role: 'mover' } });
      } catch (err: any) {
        setError(err.message || 'Failed to save profile');
      } finally {
        setSubmitting(false);
      }
    } else if (isLast) {
      router.replace('/(mover)/home');
    } else {
      setStep(step + 1);
    }
  }

  function handleBack() {
    if (step === 0) {
      router.back();
    } else {
      setStep(step - 1);
    }
  }

  async function pickImage(key: 'licenseFront' | 'licenseBack' | 'insuranceDoc') {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      update(key, result.assets[0].uri);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header with progress */}
      <View style={{ paddingTop: 54, paddingHorizontal: 20, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            onPress={handleBack}
            style={{
              width: 40, height: 40, borderRadius: 20,
              borderWidth: 1, borderColor: colors.line,
              backgroundColor: colors.card,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
          </TouchableOpacity>
          <View style={{ flex: 1, height: 4, backgroundColor: colors.surface, borderRadius: 2, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${progress}%`, backgroundColor: colors.accent.base }} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink2 }}>
            {step + 1}/{STEPS.length}
          </Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
        {current === 'intro' && <StepIntro />}
        {current === 'name' && (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 8 }}>What's your name?</Text>
            <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22, marginBottom: 28 }}>This shows on your profile to customers.</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>First name</Text>
                <TextInput
                  value={form.firstName}
                  onChangeText={(v) => update('firstName', properCase(filterName(v)))}
                  placeholder="Marcus"
                  placeholderTextColor={colors.ink4}
                  autoCapitalize="words"
                  style={{ height: 64, paddingHorizontal: 18, borderRadius: radii.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, fontSize: 20, fontWeight: '600', color: colors.ink }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>Last name</Text>
                <TextInput
                  value={form.lastName}
                  onChangeText={(v) => update('lastName', properCase(filterName(v)))}
                  placeholder="Johnson"
                  placeholderTextColor={colors.ink4}
                  autoCapitalize="words"
                  style={{ height: 64, paddingHorizontal: 18, borderRadius: radii.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, fontSize: 20, fontWeight: '600', color: colors.ink }}
                />
              </View>
            </View>
          </View>
        )}
        {current === 'phone' && (
          <View>
            <StepField
              title="Contact info"
              sub="Customers use this to reach you on job day. We never share it publicly."
              label="Phone number"
              placeholder="(555) 555-5555"
              value={form.phone}
              onChangeText={(v) => update('phone', formatPhone(v))}
              keyboardType="phone-pad"
            />
            <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
                Email
              </Text>
              <TextInput
                value={form.email}
                onChangeText={(v) => update('email', v)}
                placeholder="you@example.com"
                placeholderTextColor={colors.ink4}
                keyboardType="email-address"
                autoCapitalize="none"
                style={{
                  height: 54, paddingHorizontal: 16, borderRadius: radii.md,
                  backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line,
                  fontSize: 17, fontWeight: '600', color: colors.ink,
                }}
              />
            </View>
          </View>
        )}
        {current === 'vehicle' && (
          <StepVehicle selected={form.vehicleType} onSelect={(v) => update('vehicleType', v)} />
        )}
        {current === 'license' && (
          <StepDocument
            title="Upload your driver's license"
            sub="We need front and back to verify your identity. CDL not required for most jobs."
            frontUri={form.licenseFront}
            backUri={form.licenseBack}
            onPickFront={() => pickImage('licenseFront')}
            onPickBack={() => pickImage('licenseBack')}
          />
        )}
        {current === 'insurance' && (
          <StepInsurance uri={form.insuranceDoc} onPick={() => pickImage('insuranceDoc')} />
        )}
        {current === 'service-area' && (
          <StepField
            title="Service area"
            sub="Enter ZIP codes you're willing to work in (comma-separated). You can change these later."
            label="ZIP codes"
            placeholder="94114, 94110, 94103, 94618"
            value={form.serviceZips}
            onChangeText={(v) => update('serviceZips', v)}
            keyboardType="number-pad"
          />
        )}
        {current === 'account' && (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 8 }}>
              Create your account
            </Text>
            <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22, marginBottom: 28 }}>
              Almost done! Create an account so customers can find and contact you.
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
              Email
            </Text>
            <TextInput
              value={form.email}
              onChangeText={(v) => update('email', v)}
              placeholder="you@example.com"
              placeholderTextColor={colors.ink4}
              keyboardType="email-address"
              autoCapitalize="none"
              style={{
                height: 54, paddingHorizontal: 16, borderRadius: radii.md,
                backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line,
                fontSize: 17, fontWeight: '600', color: colors.ink, marginBottom: 16,
              }}
            />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
              Password
            </Text>
            <TextInput
              value={form.password}
              onChangeText={(v) => update('password', v)}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.ink4}
              secureTextEntry
              style={{
                height: 54, paddingHorizontal: 16, borderRadius: radii.md,
                backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line,
                fontSize: 17, fontWeight: '600', color: colors.ink,
              }}
            />
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 10, lineHeight: 18 }}>
              Already have an account? Enter the same email and password to sign in.
            </Text>
          </View>
        )}
        {current === 'bio' && (
          <StepBio value={form.bio} onChange={(v) => update('bio', v)} />
        )}
        {current === 'done' && <StepDone />}
      </ScrollView>

      {/* Error */}
      {error ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: 4 }}>
          <Text style={{ fontSize: 13, color: colors.error, fontWeight: '500' }}>{error}</Text>
        </View>
      ) : null}

      {/* Footer */}
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 38, backgroundColor: colors.bg }}>
        <Button onPress={handleNext} loading={submitting}>
          {isLast ? 'Start earning' : 'Continue'}
        </Button>
      </View>
    </View>
  );
}

function StepIntro() {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 8 }}>
        Welcome aboard.
      </Text>
      <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22, marginBottom: 28 }}>
        Let's get you set up to earn. This takes about 3 minutes.
      </Text>
      <View style={{ gap: 16 }}>
        {[
          { icon: 'cash-outline', title: 'Earn $28-$42/hr avg', sub: 'Get paid directly by customers' },
          { icon: 'calendar-outline', title: 'Set your own schedule', sub: 'Work when you want' },
          { icon: 'shield-checkmark-outline', title: 'Insured & protected', sub: 'We cover you on every job' },
          { icon: 'wallet-outline', title: 'Get paid directly by customers', sub: '90% paid to you directly, 10% deposit through app' },
        ].map((item, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accent.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={item.icon as any} size={22} color={colors.accent.deep} />
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{item.title}</Text>
              <Text style={{ fontSize: 13, color: colors.ink3 }}>{item.sub}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function StepField({ title, sub, label, placeholder, value, onChangeText, keyboardType, autoCapitalize }: {
  title: string; sub: string; label: string; placeholder: string;
  value: string; onChangeText: (v: string) => void; keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 8 }}>{title}</Text>
      <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22, marginBottom: 28 }}>{sub}</Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={colors.ink4} keyboardType={keyboardType} autoCapitalize={autoCapitalize}
        style={{ height: 64, paddingHorizontal: 18, borderRadius: radii.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, fontSize: 20, fontWeight: '600', color: colors.ink }}
      />
    </View>
  );
}

function StepVehicle({ selected, onSelect }: { selected: string; onSelect: (v: string) => void }) {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 8 }}>Tell us about your vehicle</Text>
      <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22, marginBottom: 28 }}>You can add more later. This helps us match you with the right jobs.</Text>
      <View style={{ gap: 10 }}>
        {VEHICLE_OPTIONS.map((o) => {
          const active = selected === o.id;
          return (
            <TouchableOpacity key={o.id} onPress={() => onSelect(o.id)} activeOpacity={0.7}
              style={{ padding: 16, borderRadius: radii.md, backgroundColor: active ? colors.accent.soft : colors.card, borderWidth: 1.5, borderColor: active ? colors.accent.base : colors.line }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{o.label}</Text>
              <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>{o.sub}</Text>
              {active && (
                <View style={{ position: 'absolute', top: 14, right: 14, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent.base, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function StepDocument({ title, sub, frontUri, backUri, onPickFront, onPickBack }: {
  title: string; sub: string; frontUri: string | null; backUri: string | null; onPickFront: () => void; onPickBack: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 8 }}>{title}</Text>
      <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22, marginBottom: 28 }}>{sub}</Text>
      <View style={{ gap: 14 }}>
        <DocUploadBox label="Front of license" uri={frontUri} onPress={onPickFront} />
        <DocUploadBox label="Back of license" uri={backUri} onPress={onPickBack} />
      </View>
      <View style={{ marginTop: 20, padding: 14, borderRadius: 14, backgroundColor: colors.accent.soft, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.accent.deep} />
        <Text style={{ flex: 1, fontSize: 12, color: colors.accent.deep, lineHeight: 18 }}>We encrypt your documents and never share them. Used only for identity verification.</Text>
      </View>
    </View>
  );
}

function DocUploadBox({ label, uri, onPress }: { label: string; uri: string | null; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ height: 140, borderRadius: 18, borderWidth: uri ? 0 : 1.5, borderStyle: uri ? undefined : 'dashed', borderColor: colors.line2, backgroundColor: uri ? undefined : colors.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.accent.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <Ionicons name="camera-outline" size={28} color={colors.accent.deep} />
          </View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{label}</Text>
          <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4 }}>Tap to upload photo</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function StepInsurance({ uri, onPick }: { uri: string | null; onPick: () => void }) {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 8 }}>Insurance (optional)</Text>
      <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22, marginBottom: 28 }}>If you have your own vehicle insurance or liability coverage, upload it here. Not required — we provide coverage on every job.</Text>
      <DocUploadBox label="Insurance document" uri={uri} onPress={onPick} />
      <View style={{ marginTop: 20, padding: 14, borderRadius: 14, backgroundColor: colors.surface, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Ionicons name="information-circle-outline" size={18} color={colors.ink2} />
        <Text style={{ flex: 1, fontSize: 12, color: colors.ink2, lineHeight: 18 }}>You can skip this step and add it later from your profile.</Text>
      </View>
    </View>
  );
}

function StepBio({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 8 }}>Tell customers about yourself</Text>
      <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22, marginBottom: 28 }}>A short bio helps customers pick you. Mention your experience, equipment, or why you're great at this.</Text>
      <TextInput value={value} onChangeText={onChange}
        placeholder="5 years of moving experience, own a 16ft box truck. Licensed, insured, and always on time."
        placeholderTextColor={colors.ink4} multiline numberOfLines={6} textAlignVertical="top"
        style={{ minHeight: 140, padding: 16, borderRadius: radii.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, fontSize: 15, color: colors.ink, lineHeight: 22 }}
      />
      <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 8 }}>{value.length}/500 characters</Text>
    </View>
  );
}

function StepDone() {
  return (
    <View style={{ paddingHorizontal: 24, alignItems: 'center', paddingTop: 40 }}>
      <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: colors.accent.base, alignItems: 'center', justifyContent: 'center', shadowColor: colors.accent.base, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.3, shadowRadius: 36 }}>
        <Ionicons name="checkmark" size={52} color="#fff" />
      </View>
      <Text style={{ marginTop: 24, fontSize: 28, fontWeight: '700', color: colors.ink, textAlign: 'center', letterSpacing: -0.5 }}>You're all set!</Text>
      <Text style={{ fontSize: 15, color: colors.ink2, marginTop: 10, textAlign: 'center', lineHeight: 22, maxWidth: 300 }}>Your profile is live. You can start browsing and applying to jobs right away.</Text>
      <Card style={{ marginTop: 28, width: '100%' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>How payment works</Text>
        {[
          { icon: 'card-outline', text: 'Customer pays a 10% deposit through the app' },
          { icon: 'shield-checkmark-outline', text: 'You collect 90% directly from the customer' },
          { icon: 'cash-outline', text: 'Full job price shown upfront — no hidden fees' },
        ].map((item, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={item.icon as any} size={16} color={colors.ink2} />
            </View>
            <Text style={{ flex: 1, fontSize: 14, color: colors.ink, fontWeight: '500' }}>{item.text}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}
