// VoiceScheduleInput — record a voice message, parse it into schedule + job fields
// Requires: expo install expo-av
import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio, type Recording } from 'expo-av';
import { colors, radii } from '../lib/theme';
import { supabase } from '../lib/supabase';

export interface VoiceParseResult {
  transcript: string;
  scheduled_for: string | null;
  title: string | null;
  description: string | null;
  gig_category: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onResult: (result: VoiceParseResult) => void;
}

type Phase = 'idle' | 'recording' | 'processing' | 'done';

export function VoiceScheduleInput({ visible, onClose, onResult }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const recordingRef = useRef<Recording | null>(null);

  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone access needed', 'Allow microphone access to use voice input.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setPhase('recording');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not start recording');
    }
  }

  async function stopAndProcess() {
    if (!recordingRef.current) return;
    setPhase('processing');

    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) throw new Error('No recording URI');

      // Send audio to edge function as multipart form
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const { data: { session } } = await supabase.auth.getSession();

      const formData = new FormData();
      formData.append('audio', { uri, type: 'audio/m4a', name: 'voice.m4a' } as any);

      const res = await fetch(`${supabaseUrl}/functions/v1/parse-schedule-voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: formData,
      });

      if (!res.ok) throw new Error('Voice processing failed');

      const result: VoiceParseResult = await res.json();
      setTranscript(result.transcript);
      setPhase('done');

      setTimeout(() => {
        onResult(result);
        reset();
      }, 1200);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not process voice input');
      reset();
    }
  }

  function reset() {
    setPhase('idle');
    setTranscript('');
    if (recordingRef.current) {
      recordingRef.current.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 32, paddingBottom: 48, alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 6 }}>
            Voice scheduling
          </Text>
          <Text style={{ fontSize: 14, color: colors.ink3, textAlign: 'center', marginBottom: 28, lineHeight: 20 }}>
            {phase === 'idle' && 'Tap and describe your job — include date, time, and details.'}
            {phase === 'recording' && 'Listening... tap again when done.'}
            {phase === 'processing' && 'Processing your message...'}
            {phase === 'done' && `Got it!`}
          </Text>

          {phase === 'done' && transcript ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 20, width: '100%' }}>
              <Text style={{ fontSize: 13, color: colors.ink2, lineHeight: 19, textAlign: 'center', fontStyle: 'italic' }}>
                "{transcript}"
              </Text>
            </View>
          ) : null}

          {/* Main button */}
          {phase === 'processing' || phase === 'done' ? (
            <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={phase === 'done' ? colors.success : colors.accent.base} />
            </View>
          ) : (
            <TouchableOpacity
              onPress={phase === 'idle' ? startRecording : stopAndProcess}
              activeOpacity={0.8}
              style={{
                width: 88, height: 88, borderRadius: 44,
                backgroundColor: phase === 'recording' ? '#EF4444' : colors.accent.base,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: phase === 'recording' ? '#EF4444' : colors.accent.base,
                shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
              }}
            >
              <Ionicons name={phase === 'recording' ? 'stop' : 'mic'} size={38} color="#fff" />
            </TouchableOpacity>
          )}

          {phase === 'recording' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
              <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>Recording</Text>
            </View>
          )}

          <TouchableOpacity onPress={handleClose} style={{ marginTop: 24, paddingVertical: 10, paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 15, color: colors.ink3, fontWeight: '500' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
