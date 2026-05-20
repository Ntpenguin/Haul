import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../lib/theme';
import { useGigDraftStore } from '../../stores/gigDraft';

export type GigCategory = 'moving' | 'cleaning' | 'landscaping' | 'auto' | 'organizing' | 'can-to-curb' | 'junk-removal';

const CATEGORIES: { key: GigCategory; label: string; icon: string; description: string; color: string; available: boolean }[] = [
  { key: 'moving', label: 'Moving', icon: 'cube-outline', description: 'Home, apartment, or item moves', color: '#F59E0B', available: true },
  { key: 'cleaning', label: 'Cleaning', icon: 'sparkles-outline', description: 'Home, office, or move-out clean', color: '#3B82F6', available: false },
  { key: 'junk-removal', label: 'Junk Removal', icon: 'trash-outline', description: 'Haul away furniture, appliances & debris', color: '#EF4444', available: false },
  { key: 'landscaping', label: 'Landscaping', icon: 'leaf-outline', description: 'Lawn, garden, or yard work', color: '#22C55E', available: false },
  { key: 'organizing', label: 'Organizing', icon: 'albums-outline', description: 'Home, garage, or storage organization', color: '#8B5CF6', available: false },
  { key: 'can-to-curb', label: 'Can to Curb', icon: 'refresh-outline', description: 'Trash & recycling bins moved to curb', color: '#14B8A6', available: false },
  { key: 'auto', label: 'Towing', icon: 'car-outline', description: 'Vehicle towing and transport', color: '#F97316', available: false },
];

export function StepCategory() {
  const { draft, updateDraft } = useGigDraftStore();

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 6 }}>
        What type of job?
      </Text>
      <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22, marginBottom: 24 }}>
        Choose the category that best fits your request.
      </Text>

      <View style={{ gap: 10 }}>
        {CATEGORIES.map((cat) => {
          const selected = draft.gig_category === cat.key;
          if (!cat.available) {
            return (
              <View
                key={cat.key}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 16,
                  padding: 18, borderRadius: radii.lg,
                  backgroundColor: colors.card,
                  borderWidth: 2, borderColor: 'transparent',
                  opacity: 0.45,
                }}
              >
                <View style={{
                  width: 52, height: 52, borderRadius: 14,
                  backgroundColor: colors.surface,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name={cat.icon as any} size={26} color={colors.ink4} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink3, letterSpacing: -0.2 }}>{cat.label}</Text>
                  <Text style={{ fontSize: 13, color: colors.ink4, marginTop: 2 }}>{cat.description}</Text>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.surface }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.ink4, letterSpacing: 0.5, textTransform: 'uppercase' }}>Soon</Text>
                </View>
              </View>
            );
          }
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => updateDraft({ gig_category: cat.key })}
              activeOpacity={0.75}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 16,
                padding: 18, borderRadius: radii.lg,
                backgroundColor: colors.card,
                borderWidth: 2,
                borderColor: selected ? cat.color : 'transparent',
              }}
            >
              <View style={{
                width: 52, height: 52, borderRadius: 14,
                backgroundColor: selected ? cat.color + '22' : colors.surface,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name={cat.icon as any} size={26} color={selected ? cat.color : colors.ink3} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 }}>{cat.label}</Text>
                <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>{cat.description}</Text>
              </View>
              {selected && (
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: cat.color, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}
