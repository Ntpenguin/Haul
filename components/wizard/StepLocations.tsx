import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Tag } from '../primitives';
import { colors, radii } from '../../lib/theme';
import { useGigDraftStore } from '../../stores/gigDraft';
import { AddressAutocomplete } from '../AddressAutocomplete';
import { StaticMap } from '../StaticMap';

export function StepLocations() {
  const { draft, updateDraft } = useGigDraftStore();

  // Rough distance calc between two lat/lng points
  const distance = draft.from_lat && draft.to_lat
    ? haversine(draft.from_lat, draft.from_lng!, draft.to_lat, draft.to_lng!)
    : null;
  const driveMin = distance ? Math.round(distance * 3) : null; // rough 3 min/mile city driving

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 6 }}>
          Where are you moving?
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <Card padded={false} style={{ padding: 4, zIndex: 20 }}>
          <AddressRow
            kind="start"
            label="Pickup"
            value={draft.from_address}
            onSelect={(r) => updateDraft({
              from_address: r.address,
              from_lat: r.lat,
              from_lng: r.lng,
              from_zip: r.zip,
              distance_miles: draft.to_lat
                ? Math.round(haversine(r.lat, r.lng, draft.to_lat, draft.to_lng!) * 10) / 10
                : null,
            })}
            placeholder="Enter pickup address"
            zIndex={12}
          />
          <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 54 }} />
          <AddressRow
            kind="end"
            label="Drop-off"
            value={draft.to_address}
            onSelect={(r) => updateDraft({
              to_address: r.address,
              to_lat: r.lat,
              to_lng: r.lng,
              to_zip: r.zip,
              distance_miles: draft.from_lat
                ? Math.round(haversine(draft.from_lat, draft.from_lng!, r.lat, r.lng) * 10) / 10
                : null,
            })}
            placeholder="Enter drop-off address"
            zIndex={11}
          />
        </Card>

        {/* Map preview */}
        {draft.from_lat ? (
          <View style={{ marginTop: 14 }}>
            <StaticMap
              fromLat={draft.from_lat}
              fromLng={draft.from_lng!}
              toLat={draft.to_lat}
              toLng={draft.to_lng}
              height={200}
              borderRadius={radii.lg}
            />
          </View>
        ) : (
          <View style={{ marginTop: 14, height: 200, borderRadius: radii.lg, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="map-outline" size={48} color={colors.ink4} />
            <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 8 }}>
              Enter addresses to see map
            </Text>
          </View>
        )}

        {draft.from_address && draft.to_address && distance ? (
          <View style={{ marginTop: 14, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Tag color="accent">{distance.toFixed(1)} mi apart</Tag>
            {driveMin && <Tag>~{driveMin} min drive</Tag>}
            <Tag>Within service area</Tag>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function AddressRow({ kind, label, value, onSelect, placeholder, zIndex }: {
  kind: 'start' | 'end';
  label: string;
  value: string;
  onSelect: (r: { address: string; lat: number; lng: number; zip: string | null }) => void;
  placeholder: string;
  zIndex: number;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, zIndex }}>
      <View style={{
        width: 28,
        height: 28,
        borderRadius: kind === 'start' ? 14 : 6,
        backgroundColor: kind === 'start' ? colors.ink : colors.accent.base,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {kind === 'start' ? (
          <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: '#fff' }} />
        ) : (
          <Ionicons name="location" size={14} color="#fff" />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {label}
        </Text>
        <AddressAutocomplete
          value={value}
          onSelect={onSelect}
          placeholder={placeholder}
          style={{ marginTop: 2 }}
        />
      </View>
    </View>
  );
}

// Haversine formula — returns distance in miles
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
