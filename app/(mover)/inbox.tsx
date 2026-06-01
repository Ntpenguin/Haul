import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Card } from '../../components/primitives';
import { colors } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth';

export default function MoverInbox() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const [convos, setConvos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!profile?.id) return;
    setLoading(true);

    // All gigs where this mover has an accepted application
    const { data: apps } = await supabase
      .from('gig_applications')
      .select('gig_id, gigs:gig_id(id, from_address, to_address, status, customer_id, gig_title, customer:customer_id(full_name, avatar_url))')
      .eq('mover_id', profile.id)
      .eq('status', 'accepted');

    if (!apps?.length) { setConvos([]); setLoading(false); return; }

    const gigIds = apps.map((a) => a.gig_id);

    // Latest message per gig
    const { data: msgs } = await supabase
      .from('messages')
      .select('gig_id, body, created_at, sender_id')
      .in('gig_id', gigIds)
      .order('created_at', { ascending: false });

    const latestByGig: Record<string, any> = {};
    for (const m of msgs ?? []) {
      if (!latestByGig[m.gig_id]) latestByGig[m.gig_id] = m;
    }

    const list = apps
      .map((a) => {
        const gig = a.gigs as any;
        return {
          gigId: a.gig_id,
          fromAddress: gig?.from_address ?? '',
          toAddress: gig?.to_address ?? '',
          gigTitle: gig?.gig_title ?? null,
          status: gig?.status ?? '',
          customer: gig?.customer ?? null,
          latestMessage: latestByGig[a.gig_id] ?? null,
        };
      })
      .filter((c) => ['matched', 'in_progress', 'completed'].includes(c.status))
      .sort((a, b) => {
        const ta = a.latestMessage?.created_at ?? '';
        const tb = b.latestMessage?.created_at ?? '';
        return tb > ta ? 1 : -1;
      });

    setConvos(list);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, [profile?.id]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 16, color: colors.ink2, fontWeight: '500' }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 }}>Messages</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent.base} style={{ marginTop: 40 }} />
      ) : convos.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Ionicons name="chatbubbles-outline" size={52} color={colors.ink4} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink3, marginTop: 14, textAlign: 'center' }}>
            No conversations yet
          </Text>
          <Text style={{ fontSize: 13, color: colors.ink4, marginTop: 6, textAlign: 'center' }}>
            You'll see chats here once a customer accepts you for a job.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          <View style={{ gap: 8 }}>
            {convos.map((c) => {
              const name = c.customer?.full_name || 'Customer';
              const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
              const lastMsg = c.latestMessage;
              const isUnread = lastMsg && lastMsg.sender_id !== profile?.id;
              return (
                <TouchableOpacity
                  key={c.gigId}
                  activeOpacity={0.8}
                  onPress={() => router.push({
                    pathname: '/(mover)/gig/chat',
                    params: { gigId: c.gigId, customerName: name },
                  })}
                >
                  <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Avatar
                      initials={initials}
                      uri={c.customer?.avatar_url || undefined}
                      size={46}
                    />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <Text style={{ fontSize: 15, fontWeight: isUnread ? '700' : '600', color: colors.ink }}>
                          {name}
                        </Text>
                        {lastMsg && (
                          <Text style={{ fontSize: 11, color: colors.ink4 }}>
                            {formatTime(lastMsg.created_at)}
                          </Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 12, color: colors.ink3, marginBottom: 4 }} numberOfLines={1}>
                        {c.gigTitle || `${c.fromAddress.split(',')[0]} → ${c.toAddress.split(',')[0]}`}
                      </Text>
                      {lastMsg ? (
                        <Text
                          style={{ fontSize: 13, color: isUnread ? colors.ink : colors.ink3, fontWeight: isUnread ? '600' : '400' }}
                          numberOfLines={1}
                        >
                          {lastMsg.sender_id === profile?.id ? 'You: ' : ''}{lastMsg.body}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 13, color: colors.ink4, fontStyle: 'italic' }}>
                          No messages yet — tap to say hi
                        </Text>
                      )}
                    </View>
                    {isUnread && (
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent.base, flexShrink: 0 }} />
                    )}
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
