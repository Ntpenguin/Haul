import React from 'react';
import { View, Text, Image } from 'react-native';
import { colors } from '../../lib/theme';

interface AvatarProps {
  initials?: string;
  uri?: string;
  size?: number;
}

export function Avatar({ initials, uri, size = 44 }: AvatarProps) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accent.soft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: size * 0.38,
          fontWeight: '700',
          color: colors.accent.deep,
        }}
      >
        {initials || '?'}
      </Text>
    </View>
  );
}
