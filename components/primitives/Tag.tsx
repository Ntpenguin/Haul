import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../../lib/theme';

type TagColor = 'neutral' | 'accent' | 'good' | 'warn';

interface TagProps {
  children: string;
  color?: TagColor;
}

const TAG_COLORS: Record<TagColor, { bg: string; fg: string }> = {
  neutral: { bg: colors.surface, fg: colors.ink2 },
  accent: { bg: colors.accent.soft, fg: colors.accent.deep },
  good: { bg: '#E5F0EA', fg: '#2E5C47' },
  warn: { bg: '#F5EDE0', fg: '#8B5E2B' },
};

export function Tag({ children, color = 'neutral' }: TagProps) {
  const c = TAG_COLORS[color];
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 100,
        backgroundColor: c.bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: c.fg }}>
        {children}
      </Text>
    </View>
  );
}
