import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { colors } from '../../lib/theme';

interface ChipProps {
  children: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
}

export function Chip({ children, selected = false, onPress, icon }: ChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        height: 40,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: selected ? colors.accent.base : colors.card,
        borderWidth: selected ? 0 : 1,
        borderColor: colors.line,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {icon}
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: selected ? '#fff' : colors.ink,
        }}
      >
        {children}
      </Text>
    </TouchableOpacity>
  );
}
