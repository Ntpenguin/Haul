import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { colors } from '../../lib/theme';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

export function Stepper({ value, onChange, min = 0, max = 20 }: StepperProps) {
  const canDecrement = value > min;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <TouchableOpacity
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={!canDecrement}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: canDecrement ? colors.ink : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: canDecrement ? '#fff' : colors.ink4, fontSize: 18, fontWeight: '700', marginTop: -2 }}>
          -
        </Text>
      </TouchableOpacity>
      <View style={{ minWidth: 36, alignItems: 'center' }}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.ink }}>
          {value}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onChange(Math.min(max, value + 1))}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: -2 }}>+</Text>
      </TouchableOpacity>
    </View>
  );
}
