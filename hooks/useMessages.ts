// Hook for gig messaging — real-time via Supabase

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';

export interface Message {
  id: string;
  gig_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export function useMessages(gigId: string) {
  const profile = useAuthStore((s) => s.profile);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch messages
  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('gig_id', gigId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoading(false);
  }, [gigId]);

  useEffect(() => {
    loadMessages();

    // Subscribe to new messages in real-time
    const channel = supabase
      .channel(`messages:${gigId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `gig_id=eq.${gigId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gigId, loadMessages]);

  async function sendMessage(body: string) {
    if (!profile || !body.trim()) return;
    const { error } = await supabase.from('messages').insert({
      gig_id: gigId,
      sender_id: profile.id,
      body: body.trim(),
    });
    if (error) throw error;
  }

  return { messages, loading, sendMessage, myId: profile?.id };
}
