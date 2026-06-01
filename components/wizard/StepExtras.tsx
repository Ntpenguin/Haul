import React from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Stepper, Toggle } from '../primitives';
import { colors } from '../../lib/theme';
import { useGigDraftStore } from '../../stores/gigDraft';

export function StepExtras() {
  const { draft, updateDraft } = useGigDraftStore();

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 6 }}>
          Access details
        </Text>
        <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22 }}>
          These affect the price. Be accurate — we don't surprise you at the door.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        {/* Pickup */}
        <Card>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            At pickup
          </Text>
          <AccessRow
            icon="trending-up-outline"
            label="Flights of stairs"
            control={<Stepper value={draft.stairs_from} onChange={(v) => updateDraft({ stairs_from: v })} />}
          />
          <AccessRow
            icon="arrow-up-outline"
            label="Elevator available"
            control={<Toggle value={draft.elevator_from} onChange={(v) => updateDraft({ elevator_from: v })} />}
            last
          />
          <TextInput
            style={{
              marginTop: 10,
              padding: 12,
              backgroundColor: colors.surface,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.line,
              fontSize: 14,
              color: colors.ink,
              minHeight: 60,
              textAlignVertical: 'top',
            }}
            placeholder="e.g. Narrow driveway, gated community, unit 204..."
            placeholderTextColor={colors.ink3}
            multiline
            value={draft.pickup_notes ?? ''}
            onChangeText={(v) => updateDraft({ pickup_notes: v })}
          />
        </Card>

        {/* Drop-off */}
        <Card>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            At drop-off
          </Text>
          <AccessRow
            icon="trending-up-outline"
            label="Flights of stairs"
            control={<Stepper value={draft.stairs_to} onChange={(v) => updateDraft({ stairs_to: v })} />}
          />
          <AccessRow
            icon="arrow-up-outline"
            label="Elevator available"
            control={<Toggle value={draft.elevator_to} onChange={(v) => updateDraft({ elevator_to: v })} />}
          />
          <AccessRow
            icon="walk-outline"
            label="Long carry (>50 ft)"
            control={<Toggle value={draft.long_carry} onChange={(v) => updateDraft({ long_carry: v })} />}
            last
          />
          <TextInput
            style={{
              marginTop: 10,
              padding: 12,
              backgroundColor: colors.surface,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.line,
              fontSize: 14,
              color: colors.ink,
              minHeight: 60,
              textAlignVertical: 'top',
            }}
            placeholder="e.g. 3rd floor walkup, street parking only..."
            placeholderTextColor={colors.ink3}
            multiline
            value={draft.dropoff_notes ?? ''}
            onChangeText={(v) => updateDraft({ dropoff_notes: v })}
          />
        </Card>

        {/* Fragile */}
        <Card>
          <AccessRow
            icon="warning-outline"
            label="Handle with extra care"
            sub="Fragile items present"
            control={<Toggle value={draft.has_fragile_items} onChange={(v) => updateDraft({ has_fragile_items: v })} />}
            last
          />
        </Card>

        {/* Staging */}
        <Card>
          <AccessRow
            icon="color-palette-outline"
            label="Home staging"
            sub="Crew arranges & styles your furniture (+30%)"
            control={<Toggle value={draft.staging} onChange={(v) => updateDraft({ staging: v })} />}
            last
          />
        </Card>

        {/* Packing */}
        <Card>
          <AccessRow
            icon="cube-outline"
            label="Packing service"
            sub="Crew brings boxes & materials and packs for you (+25%)"
            control={<Toggle value={draft.packing_service} onChange={(v) => updateDraft({ packing_service: v })} />}
            last
          />
        </Card>
      </View>
    </ScrollView>
  );
}

function AccessRow({ icon, label, sub, control, last }: {
  icon: string;
  label: string;
  sub?: string;
  control: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accent.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon as any} size={20} color={colors.accent.deep} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink }}>{label}</Text>
        {sub && <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{sub}</Text>}
      </View>
      {control}
    </View>
  );
}
