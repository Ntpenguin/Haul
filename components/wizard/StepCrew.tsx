import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../lib/theme';
import { useGigDraftStore } from '../../stores/gigDraft';

const TRUCK_OPTIONS = [
  { id: 'none' as const, label: 'No truck needed', sub: "I've got it covered" },
  { id: 'small' as const, label: 'Van', sub: 'Up to studio - 400 cu ft' },
  { id: 'medium' as const, label: '16 ft truck', sub: 'Up to 1BR - 800 cu ft' },
  { id: 'large' as const, label: '26 ft truck', sub: 'Up to 3BR - 1800 cu ft' },
];

export function StepCrew() {
  const { draft, updateDraft } = useGigDraftStore();

  // Studio and single item: max 2 movers. Larger moves: up to 4.
  const isSmallMove = draft.home_size === 'item' || draft.home_size === 'studio';
  const maxCrew = isSmallMove ? 2 : 4;
  const crewOptions = Array.from({ length: maxCrew }, (_, i) => i + 1);

  // If switching to a small move size and crew was > 2, clamp it
  if (isSmallMove && draft.crew_size > 2) {
    updateDraft({ crew_size: 2 });
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 6 }}>
          Crew & truck
        </Text>
        <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22 }}>
          {isSmallMove
            ? 'For a smaller move, 1-2 movers is all you need.'
            : 'Bigger crew = faster move. Bigger truck = fewer trips.'}
        </Text>
      </View>

      {/* Crew size */}
      <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
          Crew size
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {crewOptions.map((n) => {
            const selected = draft.crew_size === n;
            return (
              <TouchableOpacity
                key={n}
                onPress={() => updateDraft({ crew_size: n })}
                style={{
                  flex: 1,
                  aspectRatio: 0.9,
                  backgroundColor: selected ? colors.accent.base : colors.card,
                  borderWidth: 1.5,
                  borderColor: selected ? colors.accent.base : colors.line,
                  borderRadius: radii.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row' }}>
                  {Array.from({ length: n }).map((_, i) => (
                    <View
                      key={i}
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        marginLeft: i > 0 ? -5 : 0,
                        backgroundColor: selected ? '#fff' : colors.accent.base,
                        borderWidth: 1.5,
                        borderColor: selected ? colors.accent.base : '#fff',
                      }}
                    />
                  ))}
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? '#fff' : colors.ink }}>
                  {n} {n === 1 ? 'mover' : 'movers'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Truck size */}
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
          Truck size
        </Text>
        <View style={{ gap: 10 }}>
          {TRUCK_OPTIONS.map((t) => {
            const selected = draft.truck_size === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => updateDraft({ truck_size: t.id })}
                style={{
                  padding: 14,
                  backgroundColor: selected ? colors.accent.soft : colors.card,
                  borderWidth: 1.5,
                  borderColor: selected ? colors.accent.base : colors.line,
                  borderRadius: 18,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <Ionicons name="car-outline" size={24} color={selected ? colors.accent.deep : colors.ink2} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{t.label}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{t.sub}</Text>
                </View>
                {selected && (
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent.base, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="checkmark" size={13} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}
