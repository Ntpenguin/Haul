// Shared chat component used by both customer and mover chat screens

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../lib/theme';
import { useMessages, type Message } from '../hooks/useMessages';

interface ChatScreenProps {
  gigId: string;
  otherName: string;
  onBack: () => void;
  depositPaid?: boolean;
}

export function ChatScreen({ gigId, otherName, onBack, depositPaid = true }: ChatScreenProps) {
  const { messages, loading, sendMessage, myId } = useMessages(gigId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(text);
      setText('');
    } catch {} finally {
      setSending(false);
    }
  }

  function renderMessage({ item }: { item: Message }) {
    const isMe = item.sender_id === myId;
    return (
      <View style={{
        alignSelf: isMe ? 'flex-end' : 'flex-start',
        maxWidth: '78%',
        marginBottom: 8,
      }}>
        <View style={{
          padding: 12,
          paddingHorizontal: 16,
          borderRadius: 20,
          borderBottomRightRadius: isMe ? 6 : 20,
          borderBottomLeftRadius: isMe ? 20 : 6,
          backgroundColor: isMe ? colors.accent.base : colors.card,
          borderWidth: isMe ? 0 : 1,
          borderColor: colors.line,
        }}>
          <Text style={{ fontSize: 15, color: isMe ? '#fff' : colors.ink, lineHeight: 21 }}>
            {item.body}
          </Text>
        </View>
        <Text style={{
          fontSize: 11,
          color: colors.ink4,
          marginTop: 3,
          marginHorizontal: 4,
          alignSelf: isMe ? 'flex-end' : 'flex-start',
        }}>
          {formatTime(item.created_at)}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={{
        paddingTop: 54, paddingBottom: 12, paddingHorizontal: 20,
        backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.line,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <TouchableOpacity
          onPress={onBack}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="chevron-back" size={18} color={colors.ink} />
        </TouchableOpacity>
        <View style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: colors.accent.soft, alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent.deep }}>
            {otherName?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{otherName || 'Chat'}</Text>
          <Text style={{ fontSize: 12, color: colors.ink3 }}>Messages about this gig</Text>
        </View>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent.base} />
        </View>
      ) : messages.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <View style={{
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <Ionicons name="chatbubbles-outline" size={28} color={colors.ink3} />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 4 }}>
            No messages yet
          </Text>
          <Text style={{ fontSize: 14, color: colors.ink3, textAlign: 'center', lineHeight: 20 }}>
            Send a message to coordinate details about the gig.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Input */}
      {depositPaid ? (
        <View style={{
          paddingHorizontal: 16, paddingTop: 10, paddingBottom: 34,
          backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line,
          flexDirection: 'row', alignItems: 'flex-end', gap: 10,
        }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type a message..."
            placeholderTextColor={colors.ink4}
            multiline
            style={{
              flex: 1,
              minHeight: 42,
              maxHeight: 120,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 22,
              backgroundColor: colors.surface,
              fontSize: 15,
              color: colors.ink,
              lineHeight: 20,
            }}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim() || sending}
            style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: text.trim() ? colors.accent.base : colors.surface,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="send" size={18} color={text.trim() ? '#fff' : colors.ink4} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{
          paddingHorizontal: 16, paddingTop: 14, paddingBottom: 34,
          backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line,
          alignItems: 'center', gap: 6,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="lock-closed" size={16} color={colors.ink3} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink3 }}>
              Messaging unlocked after payment
            </Text>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return time;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + time;
}
