import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../lib/theme';
import { useGigDraftStore } from '../../stores/gigDraft';
import { properCase } from '../../lib/nameFormat';
import { filterName, formatPhone, isValidEmail } from '../../lib/validate';

export function StepContact() {
  const { draft, updateDraft } = useGigDraftStore();
  const [emailTouched, setEmailTouched] = useState(false);
  const emailError = emailTouched && draft.contact_email && !isValidEmail(draft.contact_email);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 6 }}>
          Your contact info
        </Text>
        <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22, maxWidth: 340 }}>
          Your mover will use this to reach you on the day of the move. We never share it publicly.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field
              label="First name"
              value={draft.contact_first_name}
              onChangeText={(v) => updateDraft({ contact_first_name: properCase(filterName(v)) })}
              placeholder="Alex"
              autoCapitalize="words"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Last name"
              value={draft.contact_last_name}
              onChangeText={(v) => updateDraft({ contact_last_name: properCase(filterName(v)) })}
              placeholder="Chen"
              autoCapitalize="words"
            />
          </View>
        </View>
        <Field
          label="Phone number"
          value={draft.contact_phone}
          onChangeText={(v) => updateDraft({ contact_phone: formatPhone(v) })}
          placeholder="(555) 555-5555"
          keyboardType="phone-pad"
        />
        <Field
          label="Email"
          value={draft.contact_email}
          onChangeText={(v) => updateDraft({ contact_email: v.trim() })}
          onBlur={() => setEmailTouched(true)}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          error={emailError ? 'Enter a valid email' : undefined}
        />

        <View style={{ marginTop: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
            Notes for the mover (optional)
          </Text>
          <TextInput
            value={draft.customer_notes}
            onChangeText={(v) => updateDraft({ customer_notes: v })}
            placeholder="Anything else they should know? Parking, gate codes, fragile items, pets..."
            placeholderTextColor={colors.ink4}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={{
              minHeight: 100,
              padding: 14,
              borderRadius: radii.md,
              backgroundColor: colors.card,
              borderWidth: 1.5,
              borderColor: colors.line,
              fontSize: 15,
              color: colors.ink,
            }}
          />
        </View>

        {/* Privacy notice */}
        <View style={{ marginTop: 6, padding: 14, borderRadius: 14, backgroundColor: colors.accent.soft, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent.deep} />
          <Text style={{ flex: 1, fontSize: 12, color: colors.accent.deep, lineHeight: 18 }}>
            Your contact info is shared only with the mover you book. We don't sell or share it with third parties.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function Field({ label, value, onChangeText, onBlur, placeholder, keyboardType, autoCapitalize, error }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
  placeholder: string;
  keyboardType?: any;
  autoCapitalize?: any;
  error?: string;
}) {
  return (
    <View>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.ink4}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={{
          height: 54,
          paddingHorizontal: 16,
          borderRadius: radii.md,
          backgroundColor: colors.card,
          borderWidth: 1.5,
          borderColor: error ? colors.error : colors.line,
          fontSize: 17,
          fontWeight: '600',
          color: colors.ink,
        }}
      />
      {error ? <Text style={{ fontSize: 12, color: colors.error, marginTop: 4 }}>{error}</Text> : null}
    </View>
  );
}
