import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Card, Stepper } from '../primitives';
import { colors, radii } from '../../lib/theme';
import { useGigDraftStore } from '../../stores/gigDraft';

const ROOM_TYPES = [
  { key: 'bedroom', label: 'Bedrooms', icon: 'bed-outline' },
  { key: 'living', label: 'Living rooms', icon: 'tv-outline' },
  { key: 'kitchen', label: 'Kitchens', icon: 'restaurant-outline' },
  { key: 'bath', label: 'Bathrooms', icon: 'water-outline' },
];

const HEAVY_ITEMS = [
  { id: 'sofa', label: 'Sofa / Couch', heavy: true },
  { id: 'bed', label: 'Bed / Mattress' },
  { id: 'fridge', label: 'Refrigerator', heavy: true },
  { id: 'washer', label: 'Washer / Dryer', heavy: true },
  { id: 'piano', label: 'Upright piano only', heavy: true },
  { id: 'tv', label: 'TV (55"+)', fragile: true },
  { id: 'artwork', label: 'Artwork / Mirror', fragile: true },
  { id: 'plants', label: 'Large plants' },
];

export function StepInventory() {
  const { draft, updateDraft } = useGigDraftStore();

  // Heavy items are stored as a flat array with repeats (e.g. ['piano','piano'] = 2),
  // so the pricing engine multiplies each item's cost by its quantity — matching the
  // intake form, where special items have a quantity stepper.
  function heavyCount(id: string) {
    return draft.heavy_items.filter((x) => x === id).length;
  }

  function setHeavyCount(id: string, qty: number) {
    const others = draft.heavy_items.filter((x) => x !== id);
    const copies = Array(Math.max(0, qty)).fill(id);
    updateDraft({ heavy_items: [...others, ...copies] });
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const labels = ['Living room', 'Bedroom', 'Kitchen', 'Hallway', 'Heavy item', 'Stairs'];
      const label = labels[draft.photos.length % labels.length];
      updateDraft({ photos: [...draft.photos, { uri: result.assets[0].uri, label }] });
    }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 6 }}>
          Inventory
        </Text>
        <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 22 }}>
          Roughly how much is in each room? Tap to count.
        </Text>
      </View>

      {/* Room counters */}
      <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
        <Card>
          {ROOM_TYPES.map((room, idx) => (
            <View
              key={room.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                borderBottomWidth: idx < ROOM_TYPES.length - 1 ? 1 : 0,
                borderBottomColor: colors.line,
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accent.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={room.icon as any} size={20} color={colors.accent.deep} />
              </View>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink }}>{room.label}</Text>
              <Stepper
                value={draft.rooms[room.key] ?? 0}
                onChange={(v) => updateDraft({ rooms: { ...draft.rooms, [room.key]: v } })}
              />
            </View>
          ))}
        </Card>
      </View>

      {/* Heavy/fragile items */}
      <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink2, marginBottom: 10 }}>
          Flag heavy or fragile items
        </Text>
        <Card>
          {HEAVY_ITEMS.map((item, idx) => {
            const qty = heavyCount(item.id);
            return (
              <View
                key={item.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  borderBottomWidth: idx < HEAVY_ITEMS.length - 1 ? 1 : 0,
                  borderBottomColor: colors.line,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: qty > 0 ? colors.ink : colors.ink2 }}>{item.label}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>
                    {item.heavy && <Text style={{ fontSize: 10, fontWeight: '700', color: colors.ink3 }}>HEAVY</Text>}
                    {item.fragile && <Text style={{ fontSize: 10, fontWeight: '700', color: colors.error }}>FRAGILE</Text>}
                  </View>
                </View>
                <Stepper value={qty} onChange={(v) => setHeavyCount(item.id, v)} />
              </View>
            );
          })}
        </Card>
      </View>

      {/* Photos */}
      <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
          Photos {draft.photos.length > 0 && `- ${draft.photos.length} added`}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {draft.photos.map((photo, i) => (
            <View key={i} style={{ width: '30%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden' }}>
              <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} />
              <TouchableOpacity
                onPress={() => updateDraft({ photos: draft.photos.filter((_, j) => j !== i) })}
                style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            onPress={pickPhoto}
            style={{
              width: '30%',
              aspectRatio: 1,
              borderRadius: 14,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: colors.line2,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Ionicons name="camera-outline" size={22} color={colors.ink2} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink2 }}>Add photo</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 10, lineHeight: 18 }}>
          Helps movers prep with the right gear. Capture rooms, big items, stairs, and parking access.
        </Text>
      </View>
    </ScrollView>
  );
}
