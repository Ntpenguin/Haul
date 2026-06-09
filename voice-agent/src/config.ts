import 'dotenv/config';
import { z } from 'zod';

/**
 * Validated, fail-fast configuration. Missing/invalid env aborts boot in production
 * rather than failing mysteriously at request time.
 */
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  PUBLIC_BASE_URL: z.string().url().or(z.literal('')).default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1).default('postgres://postgres:postgres@localhost:5432/openvoice'),

  ADMIN_TOKEN: z.string().default(''),
  JWT_SECRET: z.string().default(''),
  CORS_ORIGIN: z.string().default('*'),

  STT_PROVIDER: z.enum(['deepgram']).default('deepgram'),
  LLM_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  TTS_PROVIDER: z.enum(['elevenlabs', 'deepgram']).default('elevenlabs'),

  DEEPGRAM_API_KEY: z.string().default(''),
  DEEPGRAM_STT_MODEL: z.string().default('nova-2-phonecall'),
  DEEPGRAM_TTS_MODEL: z.string().default('aura-asteria-en'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  ELEVENLABS_API_KEY: z.string().default(''),
  ELEVENLABS_VOICE_ID: z.string().default('21m00Tcm4TlvDq8ikWAM'),
  ELEVENLABS_MODEL: z.string().default('eleven_turbo_v2_5'),

  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_FROM_NUMBER: z.string().default(''),
  TWILIO_VALIDATE_SIGNATURE: z.coerce.boolean().default(true),

  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_PRICE_SUBSCRIPTION: z.string().default(''),
  STRIPE_PRICE_METERED: z.string().default(''),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),

  SENTRY_DSN: z.string().default(''),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const env = parsed.data;

// In production, refuse to boot without the secrets that gate auth/security.
if (env.NODE_ENV === 'production') {
  const missing: string[] = [];
  if (!env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!env.ADMIN_TOKEN) missing.push('ADMIN_TOKEN');
  if (!env.PUBLIC_BASE_URL) missing.push('PUBLIC_BASE_URL');
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error(`Refusing to start in production without: ${missing.join(', ')}`);
    process.exit(1);
  }
}

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/$/, ''),
  logLevel: env.LOG_LEVEL,
  databaseUrl: env.DATABASE_URL,
  adminToken: env.ADMIN_TOKEN,
  jwtSecret: env.JWT_SECRET || 'dev-insecure-secret-change-me',
  corsOrigin: env.CORS_ORIGIN,

  providers: { stt: env.STT_PROVIDER, llm: env.LLM_PROVIDER, tts: env.TTS_PROVIDER },
  deepgram: { apiKey: env.DEEPGRAM_API_KEY, sttModel: env.DEEPGRAM_STT_MODEL, ttsModel: env.DEEPGRAM_TTS_MODEL },
  openai: { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL },
  anthropic: { apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL },
  elevenlabs: { apiKey: env.ELEVENLABS_API_KEY, voiceId: env.ELEVENLABS_VOICE_ID, model: env.ELEVENLABS_MODEL },

  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    fromNumber: env.TWILIO_FROM_NUMBER,
    validateSignature: env.TWILIO_VALIDATE_SIGNATURE,
  },
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    priceSubscription: env.STRIPE_PRICE_SUBSCRIPTION,
    priceMetered: env.STRIPE_PRICE_METERED,
    enabled: Boolean(env.STRIPE_SECRET_KEY),
  },
  google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, enabled: Boolean(env.GOOGLE_CLIENT_ID) },
  sentryDsn: env.SENTRY_DSN,
};

/** Derive the wss:// URL Twilio should stream audio to, from PUBLIC_BASE_URL. */
export function streamWsUrl(): string {
  const base = config.publicBaseUrl || `http://localhost:${config.port}`;
  return base.replace(/^http/, 'ws') + '/twilio/stream';
}
