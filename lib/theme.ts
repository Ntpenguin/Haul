// Design tokens — warm, friendly, rounded
// Ported from Claude Design prototype (tokens.jsx)

export const ACCENT_PRESETS = {
  amber: { base: '#C98B3F', deep: '#8B5E2B', soft: '#F5EDE0', ink: '#3a2410' },
  terracotta: { base: '#B85C3A', deep: '#7A3620', soft: '#F3E5DE', ink: '#3a1f15' },
  forest: { base: '#4A8066', deep: '#2E5C47', soft: '#E5F0EA', ink: '#14271d' },
  ocean: { base: '#4A7FA0', deep: '#2E5470', soft: '#E3EEF5', ink: '#10202c' },
} as const;

export type AccentName = keyof typeof ACCENT_PRESETS;

export const DEFAULT_ACCENT: AccentName = 'amber';

export const colors = {
  // Neutrals — warm off-white
  bg: '#FAF7F2',
  card: '#FFFFFF',
  surface: '#F2F0EA',
  line: 'rgba(26,23,20,0.08)',
  line2: 'rgba(26,23,20,0.14)',
  ink: '#1A1714',
  ink2: '#534C44',
  ink3: '#8B8379',
  ink4: '#B8B0A4',

  // Semantic
  success: '#8BA87A',
  warning: '#C98B3F',
  error: '#C84B3A',

  // Sage green — supporting color
  sage: {
    base: '#C8D9BB',
    deep: '#8BA87A',
    soft: '#EFF4EB',
  },

  // Accent
  accent: ACCENT_PRESETS[DEFAULT_ACCENT],
} as const;

export const fonts = {
  system: undefined,
  display: 'Fraunces',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 40,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  full: 9999,
} as const;

export const shadows = {
  card: {
    shadowColor: '#1A1714',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#1A1714',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 4,
  },
} as const;
