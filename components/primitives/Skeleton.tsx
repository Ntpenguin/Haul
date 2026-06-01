import React, { useEffect, useRef } from 'react';
import { Animated, View, ViewStyle } from 'react-native';
import { colors, radii } from '../../lib/theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, radius = 8, style }: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
    return () => shimmer.stopAnimation();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.85] });

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius,
          backgroundColor: colors.surface,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Pre-built skeleton matching a gig card layout */
export function GigCardSkeleton() {
  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      padding: 18,
      gap: 10,
    }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ gap: 6, paddingTop: 4 }}>
          <Skeleton width={10} height={10} radius={5} />
          <Skeleton width={2} height={20} radius={2} />
          <Skeleton width={10} height={10} radius={2} />
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="55%" height={14} />
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: colors.line, marginTop: 4 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Skeleton width="40%" height={12} />
        <Skeleton width={60} height={12} />
      </View>
    </View>
  );
}
