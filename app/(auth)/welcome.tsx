import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadows } from '../../lib/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(40)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(cardSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={{ paddingTop: 64, paddingHorizontal: 24 }}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {/* Logo */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 48 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 13,
                backgroundColor: colors.accent.base,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: colors.accent.base,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 12,
                elevation: 4,
              }}
            >
              <Ionicons name="car" size={24} color="#fff" />
            </View>
            <Text style={{ fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>
              Fast Fix Work
            </Text>
          </View>

          {/* Badge */}
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 7,
              backgroundColor: colors.accent.soft,
              borderWidth: 1,
              borderColor: 'rgba(201,139,63,0.2)',
              borderRadius: 50,
              marginBottom: 20,
            }}
          >
            <Animated.View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.accent.base,
                transform: [{ scale: pulseAnim }],
              }}
            />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.accent.deep }}>
              Now available in Austin
            </Text>
          </View>

          {/* Headline */}
          <Text style={{ fontSize: 44, fontWeight: '800', color: colors.ink, lineHeight: 48, letterSpacing: -1.5, marginBottom: 14 }}>
            Move anything.{'\n'}
            <Text style={{ color: colors.accent.base }}>Anytime.</Text>
          </Text>
          <Text style={{ fontSize: 17, color: colors.ink2, lineHeight: 26, maxWidth: 320, marginBottom: 32 }}>
            The easiest way to move anything in Austin.
          </Text>
        </Animated.View>
      </View>

      {/* Stats row */}
      <Animated.View style={{ opacity: fadeAnim, paddingHorizontal: 24, marginBottom: 32 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatPill value="Fast" label="Same-day" />
          <StatPill value="Flexible" label="Your schedule" />
          <StatPill value="Trusted" label="Local movers" />
        </View>
      </Animated.View>

      {/* Role cards */}
      <Animated.View style={{ paddingHorizontal: 24, gap: 14, opacity: cardFade, transform: [{ translateY: cardSlide }] }}>
        <TouchableOpacity
          onPress={() => router.push('/(auth)/verify')}
          activeOpacity={0.9}
          style={[
            {
              width: '100%',
              backgroundColor: colors.accent.base,
              borderRadius: 22,
              padding: 22,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
            },
            shadows.elevated,
          ]}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="cube-outline" size={28} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: '700', color: '#fff', letterSpacing: -0.3, marginBottom: 2 }}>
              I need a move
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
              Request movers, truck & crew
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(auth)/mover-signup')}
          activeOpacity={0.9}
          style={[
            {
              width: '100%',
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 22,
              padding: 22,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
            },
            shadows.card,
          ]}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              backgroundColor: colors.accent.soft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="car-outline" size={28} color={colors.accent.deep} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: '700', color: colors.ink, letterSpacing: -0.3, marginBottom: 2 }}>
              I'm a mover
            </Text>
            <Text style={{ fontSize: 14, color: colors.ink2 }}>
              Earn $28-$42/hr on your schedule
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.ink4} />
        </TouchableOpacity>
      </Animated.View>

      {/* How it works */}
      <Animated.View style={{ paddingHorizontal: 24, marginTop: 40, opacity: cardFade }}>
        <Text style={{ fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, color: colors.accent.base, marginBottom: 10 }}>
          How it works
        </Text>
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, marginBottom: 20 }}>
          Three steps. That's it.
        </Text>

        <View style={{ gap: 12 }}>
          <StepRow number="1" title="Tell us what & where" sub="Pickup, drop-off, and a few photos" />
          <StepRow number="2" title="Get matched" sub="Connected with a vetted mover nearby" />
          <StepRow number="3" title="Sit back & move" sub="They handle the heavy lifting" />
        </View>
      </Animated.View>

      {/* Features grid */}
      <Animated.View style={{ paddingHorizontal: 24, marginTop: 40, opacity: cardFade }}>
        <Text style={{ fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, color: colors.accent.base, marginBottom: 10 }}>
          Features
        </Text>
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, marginBottom: 20 }}>
          Moving, reimagined.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <FeatureCard icon="flash" title="On-demand" sub="Movers in ~30 min" />
          <FeatureCard icon="calendar" title="Schedule" sub="Up to 30 days out" />
          <FeatureCard icon="camera" title="Photo quotes" sub="Snap & get pricing" />
          <FeatureCard icon="shield-checkmark" title="Vetted" sub="Background checked" />
        </View>
      </Animated.View>

      {/* Sign in */}
      <View style={{ marginTop: 36, paddingHorizontal: 24 }}>
        <Text style={{ textAlign: 'center', fontSize: 14, color: colors.ink3 }}>
          Have an account?{' '}
          <Text
            style={{ color: colors.accent.deep, fontWeight: '600' }}
            onPress={() => router.push('/(auth)/phone')}
          >
            Sign in
          </Text>
        </Text>
      </View>
    </ScrollView>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 14,
        paddingVertical: 12,
        alignItems: 'center',
        shadowColor: colors.ink,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 2 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.ink3 }}>{label}</Text>
    </View>
  );
}

function StepRow({ number, title, sub }: { number: string; title: string; sub: string }) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 16,
          padding: 16,
        },
        shadows.card,
      ]}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.accent.base,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff' }}>{number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 2 }}>{title}</Text>
        <Text style={{ fontSize: 13, color: colors.ink3 }}>{sub}</Text>
      </View>
    </View>
  );
}

function FeatureCard({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <View
      style={[
        {
          width: '48%',
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 18,
          padding: 16,
        },
        shadows.card,
      ]}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colors.accent.soft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
        }}
      >
        <Ionicons name={icon as any} size={20} color={colors.accent.deep} />
      </View>
      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 3 }}>{title}</Text>
      <Text style={{ fontSize: 12, color: colors.ink3, lineHeight: 16 }}>{sub}</Text>
    </View>
  );
}
