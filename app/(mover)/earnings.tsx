import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/primitives';
import { colors } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth';
import { formatCents, remainderCents } from '../../lib/pricing';
import type { Gig } from '../../lib/supabase';

export default function EarningsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('gigs')
      .select('*')
      .eq('mover_id', profile.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .then(({ data }) => {
        if (data) setGigs(data);
        setLoading(false);
      });
  }, [profile?.id]);

  const totalDirectCents = gigs.reduce((sum, g) => sum + (g.quoted_price_cents ? remainderCents(g.quoted_price_cents) : 0), 0);
  const totalDepositCents = gigs.reduce((sum, g) => sum + (g.quoted_price_cents ? g.quoted_price_cents - remainderCents(g.quoted_price_cents) : 0), 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ paddingTop: 60, paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginBottom: 20 }}>
          Earnings
        </Text>

        {/* Payment model note */}
        <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.accent.soft, flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 20 }}>
          <Ionicons name="card-outline" size={18} color={colors.accent.deep} />
          <Text style={{ flex: 1, fontSize: 13, color: colors.accent.deep, fontWeight: '500' }}>
            90% paid to you directly by customers. 10% deposit goes through the app.
          </Text>
        </View>

        {/* Summary */}
        {gigs.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            <Card style={{ flex: 1, padding: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
                Direct pay
              </Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ink }}>{formatCents(totalDirectCents)}</Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>from customers</Text>
            </Card>
            <Card style={{ flex: 1, padding: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
                Via app
              </Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ink }}>{formatCents(totalDepositCents)}</Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>deposits</Text>
            </Card>
          </View>
        )}

        {/* Job list */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
          Completed jobs ({gigs.length})
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.accent.base} style={{ marginTop: 40 }} />
        ) : gigs.length === 0 ? (
          <Card style={{ padding: 20 }}>
            <Text style={{ fontSize: 14, color: colors.ink3, textAlign: 'center', lineHeight: 22 }}>
              Completed jobs will appear here as you finish gigs.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {gigs.map((gig) => {
              const direct = gig.quoted_price_cents ? remainderCents(gig.quoted_price_cents) : null;
              const date = gig.completed_at ? new Date(gig.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
              return (
                <Card key={gig.id} style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }} numberOfLines={1}>
                        {gig.from_address?.split(',')[0]} → {gig.to_address?.split(',')[0]}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <Ionicons name="calendar-outline" size={12} color={colors.ink3} />
                        <Text style={{ fontSize: 12, color: colors.ink3 }}>{date}</Text>
                        {gig.home_size && (
                          <>
                            <Text style={{ fontSize: 12, color: colors.ink4 }}>·</Text>
                            <Text style={{ fontSize: 12, color: colors.ink3 }}>{gig.home_size}</Text>
                          </>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
                        {direct ? formatCents(direct) : '—'}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>direct pay</Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
