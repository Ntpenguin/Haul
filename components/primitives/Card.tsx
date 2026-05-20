import React from 'react';
import { View, ViewStyle } from 'react-native';
import { colors, radii, shadows } from '../../lib/theme';

interface CardProps {
  children: React.ReactNode;
  padded?: boolean;
  style?: ViewStyle;
}

export function Card({ children, padded = true, style }: CardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radii.lg,
          padding: padded ? 18 : 0,
        },
        shadows.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}
