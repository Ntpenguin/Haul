import 'dotenv/config';

function str(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}
function num(name: string, fallback: number): number {
  const v = process.env[name];
  return v ? Number(v) : fallback;
}

export const config = {
  port: num('PORT', 3000),
  publicBaseUrl: str('PUBLIC_BASE_URL').replace(/\/$/, ''),
  adminToken: str('ADMIN_TOKEN'),
  dbPath: str('DB_PATH', './data/voice-agent.db'),

  providers: {
    stt: str('STT_PROVIDER', 'deepgram') as 'deepgram',
    llm: str('LLM_PROVIDER', 'openai') as 'openai' | 'anthropic',
    tts: str('TTS_PROVIDER', 'elevenlabs') as 'elevenlabs' | 'deepgram',
  },

  deepgram: {
    apiKey: str('DEEPGRAM_API_KEY'),
    sttModel: str('DEEPGRAM_STT_MODEL', 'nova-2-phonecall'),
    ttsModel: str('DEEPGRAM_TTS_MODEL', 'aura-asteria-en'),
  },
  openai: {
    apiKey: str('OPENAI_API_KEY'),
    model: str('OPENAI_MODEL', 'gpt-4o-mini'),
  },
  anthropic: {
    apiKey: str('ANTHROPIC_API_KEY'),
    model: str('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),
  },
  elevenlabs: {
    apiKey: str('ELEVENLABS_API_KEY'),
    voiceId: str('ELEVENLABS_VOICE_ID', '21m00Tcm4TlvDq8ikWAM'),
    model: str('ELEVENLABS_MODEL', 'eleven_turbo_v2_5'),
  },
  twilio: {
    accountSid: str('TWILIO_ACCOUNT_SID'),
    authToken: str('TWILIO_AUTH_TOKEN'),
    fromNumber: str('TWILIO_FROM_NUMBER'),
  },
};

/** Derive the wss:// URL Twilio should stream audio to, from PUBLIC_BASE_URL. */
export function streamWsUrl(): string {
  const base = config.publicBaseUrl || `http://localhost:${config.port}`;
  return base.replace(/^http/, 'ws') + '/twilio/stream';
}
