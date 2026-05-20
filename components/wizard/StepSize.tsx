import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../lib/theme';
import { useGigDraftStore } from '../../stores/gigDraft';

const SIZES = [
  { id: 'item' as const, label: 'Single item', sub: 'Couch, desk, fridge', icon: 'cube-outline' },
  { id: 'few-items' as const, label: 'Few items', sub: '2-5 items, partial move', icon: 'layers-outline' },
  { id: 'studio' as const, label: 'Studio', sub: '< 500 sq ft', icon: 'easel-outline' },
  { id: '1br' as const, label: '1 bedroom', sub: '500-800 sq ft', icon: 'bed-outline' },
  { id: '2br' as const, label: '2 bedroom', sub: '800-1200 sq ft', icon: 'business-outline' },
  { id: '3br+' as const, label: '3+ bedroom', sub: '1200+ sq ft', icon: 'home-outline' },
  { id: 'other' as const, label: 'Other / Custom', sub: 'Request a custom quote', icon: 'construct-outline' },
];

const SPECIALTY_ITEMS = [
  { id: 'sofa', label: 'Sofa', icon: 'bed-outline' },
  { id: 'bed', label: 'Bed', icon: 'bed-outline' },
  { id: 'appliance', label: 'Appliance', icon: 'flash-outline' },
  { id: 'piano', label: 'Piano', icon: 'musical-notes-outline' },
  { id: 'artwork', label: 'Artwork', icon: 'image-outline' },
  { id: 'pool-table', label: 'Pool table', icon: 'apps-outline' },
  { id: 'hot-tub', label: 'Hot tub', icon: 'flame-outline' },
  { id: 'safe', label: 'Safe', icon: 'lock-closed-outline' },
  { id: 'other', label: 'Other', icon: 'cube-outline' },
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

      {draft.home_size === 'item' && (<>
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink2, marginBottom: 10 }}>
            Specialty item?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {SPECIALTY_ITEMS.map((s) => {
              const selected = draft.specialty_item === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => updateDraft({ specialty_item: selected ? null : s.id })}
                  activeOpacity={0.7}
                  style={{
                    width: '47%',
                    padding: 14,
                    backgroundColor: selected ? colors.accent.soft : colors.card,
                    borderWidth: 1.5,
                    borderColor: selected ? colors.accent.base : colors.line,
                    borderRadius: radii.lg,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: selected ? colors.accent.base : colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Ionicons name={s.icon as any} size={20} color={selected ? '#fff' : colors.ink2} />
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink, flex: 1 }}>{s.label}</Text>
                  {selected && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.accent.base} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

      {/* Item dimensions */}
      <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink2, marginBottom: 10 }}>
          Size
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['small', 'medium', 'large'] as const).map((size) => {
            const selected = draft.item_dimensions === size;
            return (
              <TouchableOpacity
                key={size}
                onPress={() => updateDraft({ item_dimensions: selected ? null : size })}
                activeOpacity={0.7}
                style={{
                  flex: 1, padding: 12, alignItems: 'center',
                  backgroundColor: selected ? colors.accent.soft : colors.card,
                  borderWidth: 1.5,
                  borderColor: selected ? colors.accent.base : colors.line,
                  borderRadius: radii.md,
                }}
              >
                <Ionicons name={size === 'small' ? 'resize-outline' : size === 'medium' ? 'square-outline' : 'expand-outline'} size={20} color={selected ? colors.accent.base : colors.ink2} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink, marginTop: 4, textTransform: 'capitalize' }}>{size}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Condition */}
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink2, marginBottom: 10 }}>
          Condition
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {([
            { id: 'standard', label: 'Standard', icon: 'checkmark-circle-outline' },
            { id: 'fragile', label: 'Fragile', icon: 'warning-outline' },
            { id: 'valuable', label: 'Valuable', icon: 'diamond-outline' },
            { id: 'antique', label: 'Antique', icon: 'time-outline' },
          ] as const).map((cond) => {
            const selected = draft.item_condition === cond.id;
            return (
              <TouchableOpacity
                key={cond.id}
                onPress={() => updateDraft({ item_condition: selected ? null : cond.id })}
                activeOpacity={0.7}
                style={{
                  width: '47%', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: selected ? colors.accent.soft : colors.card,
                  borderWidth: 1.5,
                  borderColor: selected ? colors.accent.base : colors.line,
                  borderRadius: radii.md,
                }}
              >
                <Ionicons name={cond.icon as any} size={18} color={selected ? colors.accent.base : colors.ink2} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink }}>{cond.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Weight */}
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink2, marginBottom: 10 }}>
          Weight estimate
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([
            { id: 'light', label: 'Light', sub: '1-2 people can lift', icon: 'hand-left-outline' },
            { id: 'heavy', label: 'Heavy', sub: 'Dolly / special equipment', icon: 'barbell-outline' },
          ] as const).map((w) => {
            const selected = draft.item_weight === w.id;
            return (
              <TouchableOpacity
                key={w.id}
                onPress={() => updateDraft({ item_weight: selected ? null : w.id })}
                activeOpacity={0.7}
                style={{
                  flex: 1, padding: 12,
                  backgroundColor: selected ? colors.accent.soft : colors.card,
                  borderWidth: 1.5,
                  borderColor: selected ? colors.accent.base : colors.line,
                  borderRadius: radii.md,
                }}
              >
                <Ionicons name={w.icon as any} size={20} color={selected ? colors.accent.base : colors.ink2} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink, marginTop: 4 }}>{w.label}</Text>
                <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>{w.sub}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Handling requirements */}
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink2, marginBottom: 10 }}>
          Handling requirements
        </Text>
        <View style={{ gap: 8 }}>
          {([
            { key: 'disassembly_needed', label: 'Disassembly needed', icon: 'build-outline' },
            { key: 'white_glove', label: 'White-glove handling', icon: 'hand-right-outline' },
            { key: 'packing_required', label: 'Packing required', icon: 'cube-outline' },
          ] as const).map((opt) => {
            const selected = draft[opt.key];
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => updateDraft({ [opt.key]: !selected })}
                activeOpacity={0.7}
                style={{
                  padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
                  backgroundColor: selected ? colors.accent.soft : colors.card,
                  borderWidth: 1.5,
                  borderColor: selected ? colors.accent.base : colors.line,
                  borderRadius: radii.md,
                }}
              >
                <View style={{
                  width: 24, height: 24, borderRadius: 6, borderWidth: 2,
                  borderColor: selected ? colors.accent.base : colors.line2,
                  backgroundColor: selected ? colors.accent.base : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
                <Ionicons name={opt.icon as any} size={18} color={selected ? colors.accent.base : colors.ink2} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink }}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Custom description */}
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink2, marginBottom: 10 }}>
          Description (optional)
        </Text>
        <TextInput
          value={draft.item_description}
          onChangeText={(v) => updateDraft({ item_description: v })}
          placeholder="Describe the item, any special instructions..."
          placeholderTextColor={colors.ink4}
          multiline
          style={{
            minHeight: 80, padding: 14, borderRadius: radii.md,
            backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line,
            fontSize: 14, color: colors.ink, lineHeight: 20,
          }}
        />
      </View>
      </>)}
    </ScrollView>
  );
}
