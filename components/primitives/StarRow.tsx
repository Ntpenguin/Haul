import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/theme';

interface StarRowProps {
  rating: number;
  size?: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
}

export function StarRow({ rating, size = 14, interactive = false, onRate }: StarRowProps) {
  const stars = [1, 2, 3, 4, 5];

  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {stars.map((i) => {
        const filled = i <= rating;
        const star = (
          <Ionicons
            key={i}
            name={filled ? 'star' : 'star-outline'}
            size={size}
            color={filled ? colors.accent.base : colors.ink4}
          />
        );

        if (interactive && onRate) {
          return (
            <TouchableOpacity key={i} onPress={() => onRate(i)}>
              {star}
            </TouchableOpacity>
          );
        }
        return star;
      })}
    </View>
  );
}
