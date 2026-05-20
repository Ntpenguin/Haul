import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChatScreen } from '../../../components/ChatScreen';
import { supabase } from '../../../lib/supabase';

export default function MoverChat() {
  const { gigId, customerName } = useLocalSearchParams<{ gigId: string; customerName: string }>();
  const router = useRouter();
  const [depositPaid, setDepositPaid] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function checkDeposit() {
      if (!gigId) { setChecked(true); return; }
      // Check gig status — if in_progress or completed, deposit was already paid
      const { data: gigData } = await supabase
        .from('gigs')
        .select('status')
        .eq('id', gigId)
        .single();
      if (gigData && ['in_progress', 'completed'].includes(gigData.status)) {
        setDepositPaid(true);
        setChecked(true);
        return;
      }
      // Fallback: check payments table
      const { data } = await supabase
        .from('payments')
        .select('id, status')
        .eq('gig_id', gigId)
        .in('status', ['authorized', 'captured'])
        .limit(1)
        .maybeSingle();
      setDepositPaid(!!data);
      setChecked(true);
    }
    checkDeposit();
  }, [gigId]);

  return (
    <ChatScreen
      gigId={gigId}
      otherName={customerName || 'Customer'}
      onBack={() => router.back()}
      depositPaid={checked ? depositPaid : false}
    />
  );
}
