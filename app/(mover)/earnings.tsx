import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/primitives';
import { colors } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth';
import { formatCents, moverPayoutCents, platformFeeCents } from '../../lib/pricing';
import { usePayouts, type ConnectStatus } from '../../hooks/usePayouts';
import type { Gig } from '../../lib/supabase';

export default function EarningsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const { startOnboarding, refreshStatus, cashOut } = usePayouts();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [payingOut, setPayingOut] = useState<string | null>(null);

  const loadGigs = useCallback(() => {
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

  useEffect(() => { loadGigs(); }, [loadGigs]);

  // Pull the latest Connect status on mount (and when returning from onboarding).
  useEffect(() => {
    if (!profile?.id) return;
    refreshStatus().then(setStatus).catch(() => {});
  }, [profile?.id]);

  async function handleConnect() {
    setConnecting(true);
    try {
      await startOnboarding();
    } catch (e: any) {
      Alert.alert('Payout setup', e.message || 'Could not start payout setup.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleRefreshStatus() {
    setConnecting(true);
    try {
      setStatus(await refreshStatus());
    } catch (e: any) {
      Alert.alert('Payout status', e.message || 'Could not refresh status.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleCashOut(gig: Gig) {
    if (!status?.payouts_enabled) {
      Alert.alert('Set up payouts first', 'Connect your bank with Stripe to receive payouts.');
      return;
    }
    setPayingOut(gig.id);
    try {
      const res = await cashOut(gig.id);
      Alert.alert('Payout sent', res.already ? 'This job was already paid out.' : 'Your payout is on the way.');
      loadGigs();
    } catch (e: any) {
      Alert.alert('Payout failed', e.message || 'Could not process payout.');
    } finally {
      setPayingOut(null);
    }
  }

  const totalPayoutCents = gigs.reduce((sum, g) => sum + (g.quoted_price_cents ? moverPayoutCents(g.quoted_price_cents) : 0), 0);
  const totalFeeCents = gigs.reduce((sum, g) => sum + (g.quoted_price_cents ? platformFeeCents(g.quoted_price_cents) : 0), 0);

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
            Customers pay in full through the app. You're paid out after each job, minus a 15% service fee.
          </Text>
        </View>

        {/* Payout setup (Stripe Connect) */}
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Ionicons
              name={status?.payouts_enabled ? 'checkmark-circle' : 'alert-circle-outline'}
              size={18}
              color={status?.payouts_enabled ? colors.success : colors.accent.deep}
            />
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
              {status?.payouts_enabled ? 'Payouts enabled' : 'Set up payouts'}
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.ink3, lineHeight: 19, marginBottom: 12 }}>
            {status?.payouts_enabled
              ? 'Your bank is connected. Cash out completed jobs below.'
              : 'Connect your bank securely with Stripe to receive payouts after each job.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {!status?.payouts_enabled && (
              <TouchableOpacity
                onPress={handleConnect}
                disabled={connecting}
                style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: colors.accent.base, alignItems: 'center', opacity: connecting ? 0.6 : 1 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                  {status?.details_submitted ? 'Finish setup' : 'Connect bank'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleRefreshStatus}
              disabled={connecting}
              style={{ flex: status?.payouts_enabled ? 1 : 0, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.line, alignItems: 'center', opacity: connecting ? 0.6 : 1 }}
            >
              <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 14 }}>Refresh status</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Summary */}
        {gigs.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            <Card style={{ flex: 1, padding: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
                Earnings
              </Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ink }}>{formatCents(totalPayoutCents)}</Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>paid to you</Text>
            </Card>
            <Card style={{ flex: 1, padding: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
                Service fees
              </Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ink }}>{formatCents(totalFeeCents)}</Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>15% to app</Text>
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
              const direct = gig.quoted_price_cents ? moverPayoutCents(gig.quoted_price_cents) : null;
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
                      <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>your payout</Text>
                    </View>
                  </View>

                  {/* Payout state / cash-out */}
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
                    {gig.payout_status === 'paid' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                        <Text style={{ fontSize: 13, color: colors.success, fontWeight: '600' }}>Paid out{gig.payout_at ? ` · ${new Date(gig.payout_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</Text>
                      </View>
                    ) : gig.payout_status === 'pending' ? (
                      <Text style={{ fontSize: 13, color: colors.ink3, fontWeight: '600' }}>Payout processing…</Text>
                    ) : !gig.paid_at ? (
                      <Text style={{ fontSize: 13, color: colors.ink3 }}>Waiting on customer payment</Text>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleCashOut(gig)}
                        disabled={payingOut === gig.id}
                        style={{ paddingVertical: 10, borderRadius: 10, backgroundColor: colors.accent.base, alignItems: 'center', opacity: payingOut === gig.id ? 0.6 : 1 }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                          {payingOut === gig.id ? 'Sending…' : `Cash out ${direct ? formatCents(direct) : ''}`}
                        </Text>
                      </TouchableOpacity>
                    )}
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
