import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { colors, radii, shadows } from '../../lib/theme';

type ButtonVariant = 'primary' | 'dark' | 'ghost' | 'soft' | 'white';
type ButtonSize = 'lg' | 'md' | 'sm';

interface ButtonProps {
  children: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

const SIZE_MAP = {
  lg: { height: 56, fontSize: 17, px: 24, radius: 28 },
  md: { height: 46, fontSize: 15, px: 20, radius: 23 },
  sm: { height: 36, fontSize: 14, px: 16, radius: 18 },
};

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'lg',
  full = true,
  disabled = false,
  loading = false,
  icon,
}: ButtonProps) {
  const s = SIZE_MAP[size];
  const variantStyles = getVariantStyles(variant, disabled);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        {
          height: s.height,
          paddingHorizontal: s.px,
          borderRadius: s.radius,
          backgroundColor: variantStyles.bg,
          borderWidth: variantStyles.borderWidth,
          borderColor: variantStyles.borderColor,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          width: full ? '100%' : undefined,
        },
        variant === 'primary' && !disabled && shadows.elevated,
      ] as ViewStyle[]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles.fg} />
      ) : (
        <>
          {icon}
          <Text style={{ color: variantStyles.fg, fontSize: s.fontSize, fontWeight: '600' }}>
            {children}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function getVariantStyles(variant: ButtonVariant, disabled: boolean) {
  if (disabled) return { bg: colors.surface, fg: colors.ink4, borderWidth: 0, borderColor: 'transparent' };

  switch (variant) {
    case 'primary':
      return { bg: colors.accent.base, fg: '#fff', borderWidth: 0, borderColor: 'transparent' };
    case 'dark':
      return { bg: colors.ink, fg: '#fff', borderWidth: 0, borderColor: 'transparent' };
    case 'ghost':
      return { bg: 'transparent', fg: colors.ink, borderWidth: 1.5, borderColor: colors.line2 };
    case 'soft':
      return { bg: colors.accent.soft, fg: colors.accent.deep, borderWidth: 0, borderColor: 'transparent' };
    case 'white':
      return { bg: '#fff', fg: colors.ink, borderWidth: 1, borderColor: colors.line };
    default:
      return { bg: colors.accent.base, fg: '#fff', borderWidth: 0, borderColor: 'transparent' };
  }
}
