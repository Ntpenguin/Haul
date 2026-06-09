/**
 * Agent configuration — the self-hosted equivalent of a GoHighLevel "Voice AI Agent".
 * Everything a non-technical operator would configure in a dashboard lives here.
 */

export type ToolName =
  | 'check_availability'
  | 'book_appointment'
  | 'transfer_call'
  | 'capture_lead'
  | 'trigger_workflow'
  | 'end_call';

export interface BusinessHours {
  /** 0=Sun … 6=Sat → [openHHMM, closeHHMM] in 24h, or null for closed. */
  [day: number]: [string, string] | null;
}

export interface AgentConfig {
  id: string;
  name: string;                 // Agent display name, e.g. "Ava"
  business_name: string;        // "Fast Fix Work"
  /** Free-form persona / role instructions — the heart of the system prompt. */
  persona: string;
  /** What the agent is trying to accomplish on the call (bullet goals). */
  goals: string;
  /** Knowledge base / FAQ the agent can answer from (plain text or markdown). */
  knowledge_base: string;
  /** First thing the agent says when it answers. */
  greeting: string;
  language: string;             // BCP-47, e.g. "en"
  voice_id: string;             // provider voice id (TTS)

  /** Which tools/actions this agent may use. */
  enabled_tools: ToolName[];

  /** Where to transfer to when the agent escalates to a human (E.164). */
  transfer_number: string;

  /** Outbound webhook hit on capture_lead / trigger_workflow (your CRM / n8n / GHL). */
  webhook_url: string;

  /** Business hours; calls outside hours can be handled differently. */
  business_hours: BusinessHours;
  /** What to do outside business hours: 'ai' (answer anyway) | 'voicemail' | 'transfer'. */
  after_hours: 'ai' | 'voicemail' | 'transfer';

  /** Hard limits to keep calls (and your bill) bounded. */
  max_call_seconds: number;

  /** Twilio number routed to this agent (E.164). Stored in its own column. */
  phone_number?: string;

  /** Owning tenant (SaaS sub-account). Stored in its own column; null = platform-owned. */
  tenant_id?: string;

  created_at: string;
  updated_at: string;
}

export type AgentInput = Partial<Omit<AgentConfig, 'id' | 'created_at' | 'updated_at'>> &
  Pick<AgentConfig, 'name'>;

export const DEFAULT_AGENT: Omit<AgentConfig, 'id' | 'name' | 'created_at' | 'updated_at'> = {
  business_name: 'Acme Services',
  persona:
    'You are a warm, concise, professional phone receptionist. You speak naturally, ' +
    'in short sentences, and never sound robotic. You only discuss the business and its services.',
  goals:
    '- Greet the caller and find out how you can help.\n' +
    '- Answer questions using the knowledge base.\n' +
    '- Book an appointment when the caller is ready.\n' +
    '- Capture the caller’s name, phone, and email.\n' +
    '- Transfer to a human if the caller asks or you cannot help.',
  knowledge_base:
    'Hours: Mon–Fri 8am–6pm. We serve the greater metro area. Free estimates. ' +
    'Typical jobs are booked 24–48 hours out.',
  greeting: 'Thanks for calling Acme Services, this is Ava. How can I help you today?',
  language: 'en',
  voice_id: '',
  enabled_tools: [
    'check_availability',
    'book_appointment',
    'transfer_call',
    'capture_lead',
    'end_call',
  ],
  transfer_number: '',
  webhook_url: '',
  business_hours: {
    0: null,
    1: ['08:00', '18:00'],
    2: ['08:00', '18:00'],
    3: ['08:00', '18:00'],
    4: ['08:00', '18:00'],
    5: ['08:00', '18:00'],
    6: null,
  },
  after_hours: 'ai',
  max_call_seconds: 600,
};
