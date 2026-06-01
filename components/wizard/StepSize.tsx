import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../lib/theme';
import { useGigDraftStore } from '../../stores/gigDraft';

const SIZES = [
  { id: 'few-items' as const, label: 'Just a few items', sub: '2-5 items, partial move', icon: 'layers-outline' },
  { id: 'studio' as const, label: 'Studio', sub: '< 500 sq ft', icon: 'easel-outline' },
  { id: '1br' as const, label: '1 bedroom', sub: '500-800 sq ft', icon: 'bed-outline' },
  { id: '2br' as const, label: '2 bedroom', sub: '800-1200 sq ft', icon: 'business-outline' },
  { id: '3br+' as const, label: '3 bedroom', sub: '1200+ sq ft', icon: 'home-outline' },
  { id: '4br' as const, label: '4+ BR / full house', sub: 'Large home', icon: 'home-outline' },
  { id: 'other' as const, label: 'Other / Custom', sub: 'Request a custom quote', icon: 'construct-outline' },
];

export function StepSize() {
  const { draft, updateDraft } = useGigDraftStore();

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 6 }}>
          How big is the move?
        </Text>
        <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22 }}>
          We use this to estimate crew size and truck.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        {SIZES.map((s) => {
          const selected = draft.home_size === s.id;
          return (
            <TouchableOpacity
              key={s.id}
              onPress={() => updateDraft({ home_size: s.id })}
              activeOpacity={0.7}
              style={{
                width: '100%',
                padding: 16,
                backgroundColor: selected ? colors.accent.soft : colors.card,
                borderWidth: 2,
                borderColor: selected ? colors.accent.base : 'transparent',
                borderRadius: radii.lg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <View style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: selected ? colors.accent.base : colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Ionicons name={s.icon as any} size={24} color={selected ? '#fff' : colors.ink2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 }}>{s.label}</Text>
                <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>{s.sub}</Text>
              </View>
              {selected && (
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent.base, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

    </ScrollView>
  );
}
