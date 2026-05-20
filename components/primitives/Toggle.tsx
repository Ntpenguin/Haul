import React from 'react';
import { Switch } from 'react-native';
import { colors } from '../../lib/theme';

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

export function Toggle({ value, onChange }: ToggleProps) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: colors.line2, true: colors.accent.base }}
      thumbColor="#fff"
    />
  );
}
