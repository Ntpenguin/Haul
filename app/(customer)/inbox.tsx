import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Card } from '../../components/primitives';
import { colors } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth';

export default function CustomerInbox() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const [convos, setConvos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!profile?.id) return;
    setLoading(true);

    // Gigs where customer has a matched/active/completed crew
    const { data: gigs } = await supabase
      .from('gigs')
      .select('id, from_address, to_address, status, mover_id, gig_title, mover:mover_id(full_name, avatar_url)')
      .eq('customer_id', profile.id)
      .in('status', ['matched', 'in_progress', 'completed'])
      .not('mover_id', 'is', null);

    if (!gigs?.length) { setConvos([]); setLoading(false); return; }

    // Latest message per gig
    const gigIds = gigs.map((g) => g.id);
    const { data: msgs } = await supabase
      .from('messages')
      .select('gig_id, body, created_at, sender_id')
      .in('gig_id', gigIds)
      .order('created_at', { ascending: false });

    const latestByGig: Record<string, any> = {};
    for (const m of msgs ?? []) {
      if (!latestByGig[m.gig_id]) latestByGig[m.gig_id] = m;
    }

    const list = gigs
      .map((g) => ({ ...g, latestMessage: latestByGig[g.id] ?? null }))
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
            Chat opens once a worker is accepted and payment is made.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          <View style={{ gap: 8 }}>
            {convos.map((c) => {
              const name = (c.mover as any)?.full_name || 'Worker';
              const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
              const lastMsg = c.latestMessage;
              const isUnread = lastMsg && lastMsg.sender_id !== profile?.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  activeOpacity={0.8}
                  onPress={() => router.push({
                    pathname: '/(customer)/gig/chat',
                    params: { gigId: c.id, workerName: name },
                  })}
                >
                  <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Avatar
                      initials={initials}
                      uri={(c.mover as any)?.avatar_url || undefined}
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
                        {(c as any).gig_title || `${c.from_address.split(',')[0]} → ${c.to_address.split(',')[0]}`}
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
