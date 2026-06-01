import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../primitives';
import { colors, radii } from '../../lib/theme';
import { useGigDraftStore } from '../../stores/gigDraft';
import { priceFor, formatCents, estimatedDurationHours } from '../../lib/pricing';
import { difficultyFor, difficultyLabel } from '../../lib/difficulty';

export function StepReview() {
  const { draft } = useGigDraftStore();

  const price = priceFor({
    homeSize: draft.home_size,
    crew: draft.crew_size,
    truck: draft.truck_size,
    stairsFrom: draft.stairs_from,
    stairsTo: draft.stairs_to,
    elevatorFrom: draft.elevator_from,
    elevatorTo: draft.elevator_to,
    longCarry: draft.long_carry,
    heavyItems: draft.heavy_items,
    distanceMiles: draft.distance_miles || undefined,
    staging: draft.staging,
    packing: draft.packing_service,
  }, 'flat');

  const difficulty = difficultyFor({
    home_size: draft.home_size,
    stairs_from: draft.stairs_from,
    stairs_to: draft.stairs_to,
    heavy_items: draft.heavy_items,
    distance_miles: draft.distance_miles,
    staging: draft.staging,
    packing_service: draft.packing_service,
  });
  const durationHrs = estimatedDurationHours(draft.home_size, draft.distance_miles);

  const sizeLabel: Record<string, string> = {
    'few-items': 'Just a few items', studio: 'Studio', '1br': '1 bedroom',
    '2br': '2 bedroom', '3br+': '3 bedroom', '4br': '4+ BR / full house', other: 'Custom',
  };
  const truckLabel: Record<string, string> = {
    none: 'No truck', small: 'Van', medium: '16 ft truck', large: '26 ft truck',
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 }}>
          Review & book
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        {/* Price hero */}
        <View style={{
          backgroundColor: colors.ink,
          borderRadius: 22,
          padding: 22,
          overflow: 'hidden',
        }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
            All-in flat rate
          </Text>
          <Text style={{ fontSize: 52, fontWeight: '700', color: '#fff', letterSpacing: -1.5, marginTop: 6 }}>
            {formatCents(price.totalCents)}
          </Text>
          <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>
            No hourly surprises. Damage protection included.
          </Text>
        </View>

        {/* Summary */}
        <Card>
          <SummaryRow icon="navigate-outline" label="Route" value={`${draft.from_address.split(',')[0] || 'Pickup'} → ${draft.to_address.split(',')[0] || 'Drop-off'}`} />
          <SummaryRow icon="home-outline" label="Move size" value={sizeLabel[draft.home_size] || draft.home_size} />
          <SummaryRow icon="people-outline" label="Crew" value={`${draft.crew_size} ${draft.crew_size === 1 ? 'mover' : 'movers'}`} />
          <SummaryRow icon="car-outline" label="Truck" value={truckLabel[draft.truck_size]} />
          <SummaryRow icon="calendar-outline" label="When" value={draft.scheduled_for ? new Date(draft.scheduled_for).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'ASAP'} />
          {draft.heavy_items.length > 0 && <SummaryRow icon="barbell-outline" label="Heavy items" value={`${draft.heavy_items.length} flagged`} />}
          <SummaryRow icon="trending-up-outline" label="Stairs" value={`${draft.stairs_from + draft.stairs_to} flights total`} />
          <SummaryRow icon="speedometer-outline" label="Difficulty" value={`${difficultyLabel(difficulty)} (${difficulty}/5)`} />
          <SummaryRow icon="time-outline" label="Est. duration" value={`~${durationHrs} hrs`} last />
        </Card>

        {/* Price breakdown */}
        <Card>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Price breakdown
          </Text>
          {price.pricing === 'flat' && (
            <>
              <PriceRow label="Base move" value={formatCents(price.baseCents)} />
              {price.longDistanceCents > 0 && <PriceRow label="Long distance (+50%)" value={`+${formatCents(price.longDistanceCents)}`} />}
              {price.distanceSurchargeCents > 0 && <PriceRow label="Mileage" value={`+${formatCents(price.distanceSurchargeCents)}`} />}
              {price.stairsSurchargeCents > 0 && <PriceRow label="Stairs surcharge" value={`+${formatCents(price.stairsSurchargeCents)}`} />}
              {price.longCarryCents > 0 && <PriceRow label="Long carry" value={`+${formatCents(price.longCarryCents)}`} />}
              {price.heavyItemsCents > 0 && <PriceRow label="Heavy items" value={`+${formatCents(price.heavyItemsCents)}`} />}
              {price.stagingCents > 0 && <PriceRow label="Home staging (+30%)" value={`+${formatCents(price.stagingCents)}`} />}
              {price.packingCents > 0 && <PriceRow label="Packing service (+25%)" value={`+${formatCents(price.packingCents)}`} />}
            </>
          )}
          <PriceRow label="Taxes & fees" value={formatCents(price.taxesCents)} />
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 10 }} />
          <PriceRow label="Total" value={formatCents(price.totalCents)} bold />
        </Card>

        {/* Payment stub */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 28, borderRadius: 6, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>VISA</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }}>**** 4242</Text>
              <Text style={{ fontSize: 12, color: colors.ink3 }}>Default - no charge until done</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent.deep }}>Change</Text>
          </View>
        </Card>

        {/* Protection */}
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 4 }}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent.deep} />
          <Text style={{ flex: 1, fontSize: 12, color: colors.ink2 }}>
            Includes $10,000 damage protection & background-checked crew.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function SummaryRow({ icon, label, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.accent.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon as any} size={18} color={colors.accent.deep} />
      </View>
      <Text style={{ flex: 1, fontSize: 13, color: colors.ink3 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink, maxWidth: 180, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

function PriceRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ fontSize: 14, color: colors.ink2, fontWeight: bold ? '700' : '400' }}>{label}</Text>
      <Text style={{ fontSize: 14, color: bold ? colors.ink : colors.ink2, fontWeight: bold ? '700' : '400' }}>{value}</Text>
    </View>
  );
}
