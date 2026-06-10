import type { WebSocket } from 'ws';
import { AgentConfig } from '../agent/types.js';
import { Conversation } from './conversation.js';
import { ToolContext } from '../agent/tools.js';
import { makeStt, makeLlm, makeTts } from '../providers/index.js';
import { SttStream } from '../providers/types.js';
import { attachCallSid, finishCall, recentContactByPhone } from '../db/index.js';
import { emailCallSummary } from '../integrations/email.js';
import { updateCallTwiml, transferTwiml, hangupTwiml, startRecording, isE164 } from '../server/twilioRest.js';
import { logger } from '../logger.js';

const log = logger('session');
const FRAME_BYTES = 160; // 20ms of 8kHz μ-law

/**
 * One live phone call. Bridges the Twilio Media Stream websocket to the
 * STT → brain → TTS pipeline, with barge-in (the caller can interrupt the agent).
 */
export class CallSession {
  private stt!: SttStream;
  private conv!: Conversation;
  private tts = makeTts();

  private streamSid = '';
  private callSid = '';
  private finalBuffer = '';     // accumulates STT finals until end-of-turn
  private processing = false;   // a turn is currently being generated/spoken
  private interrupted = false;  // caller barged in; abort current speech
  private queuedUtterance: string | null = null;
  private outstandingMarks = new Set<string>();
  private markSeq = 0;
  private residual = Buffer.alloc(0);
  private closed = false;
  private maxCallTimer?: NodeJS.Timeout;

  constructor(
    private ws: WebSocket,
    private agent: AgentConfig,
    private callId: string,
    private callerNumber?: string,
  ) {}

  // ── Twilio media-stream message handling ──
  async onTwilioMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.event) {
      case 'start':
        this.streamSid = msg.start.streamSid;
        this.callSid = msg.start.callSid;
        await attachCallSid(this.callId, this.callSid);
        await this.begin();
        break;
      case 'media':
        // base64 μ-law from the caller → STT
        this.stt?.sendAudio(Buffer.from(msg.media.payload, 'base64'));
        break;
      case 'mark':
        this.outstandingMarks.delete(msg.mark?.name);
        break;
      case 'stop':
        this.cleanup('completed');
        break;
    }
  }

  private get agentSpeaking() {
    return this.outstandingMarks.size > 0;
  }

  private async begin() {
    const ctx: ToolContext = {
      agent: this.agent,
      callId: this.callId,
      contact: {},
      callerNumber: this.callerNumber,
    };
    // Returning-caller recognition: greet known callers by name.
    if (isE164(this.callerNumber)) {
      const prior: any = await recentContactByPhone(
        this.agent.tenant_id ? { tenantId: this.agent.tenant_id } : { agentId: this.agent.id },
        this.callerNumber!,
      ).catch(() => null);
      if (prior?.name) {
        ctx.returningContact = { name: prior.name, lastNotes: prior.notes, lastSeen: new Date(prior.created_at).toLocaleDateString() };
        ctx.contact.name = prior.name;
        if (prior.email) ctx.contact.email = prior.email;
      }
    }
    this.conv = new Conversation(makeLlm(), this.agent, ctx);

    this.stt = await makeStt().open({
      onFinal: (text, endOfTurn) => this.onSttFinal(text, endOfTurn),
      onError: (e) => log.error('stt error', e),
    });

    // Optional call recording (off unless the agent enables it).
    if (this.agent.record_calls && this.callSid) startRecording(this.callSid).catch(() => {});

    // Hard cap on call length to bound cost.
    this.maxCallTimer = setTimeout(
      () => this.applyControl({ type: 'hangup' }),
      this.agent.max_call_seconds * 1000,
    );

    // Speak the greeting immediately.
    await this.speak(await this.conv.greeting());
  }

  private onSttFinal(text: string, endOfTurn: boolean) {
    const t = text.trim();
    if (t) {
      // Barge-in: caller spoke while the agent was talking → cut the agent off.
      if (this.agentSpeaking) this.bargeIn();
      this.finalBuffer += (this.finalBuffer ? ' ' : '') + t;
    }
    if (endOfTurn && this.finalBuffer.trim()) {
      const utterance = this.finalBuffer.trim();
      this.finalBuffer = '';
      this.handleUtterance(utterance);
    }
  }

  private bargeIn() {
    if (this.interrupted) return;
    this.interrupted = true;
    this.sendClear();
    this.outstandingMarks.clear();
  }

  private handleUtterance(text: string) {
    if (this.processing) {
      // Already mid-turn: interrupt and queue the newest utterance.
      this.queuedUtterance = text;
      this.bargeIn();
      return;
    }
    void this.processTurn(text);
  }

  private async processTurn(text: string) {
    this.processing = true;
    this.interrupted = false;
    log.info(`caller: ${text}`);
    try {
      for await (const ev of this.conv.respondTo(text)) {
        if (this.interrupted || this.closed) break;
        if (ev.type === 'say') {
          await this.speak(ev.text);
        } else if (ev.type === 'control') {
          await this.applyControl(ev.action);
          return;
        }
      }
    } catch (e) {
      log.error('turn failed', e);
    } finally {
      this.processing = false;
      if (this.queuedUtterance && !this.closed) {
        const next = this.queuedUtterance;
        this.queuedUtterance = null;
        this.interrupted = false;
        void this.processTurn(next);
      }
    }
  }

  /** Synthesize `text` and stream μ-law frames to Twilio, then a mark to track playback. */
  private async speak(text: string) {
    if (this.interrupted || this.closed || !text) return;
    log.info(`agent: ${text}`);
    const mark = `m${++this.markSeq}`;
    this.outstandingMarks.add(mark);
    try {
      for await (const chunk of this.tts.synthesize(text, this.agent.voice_id || undefined)) {
        if (this.interrupted || this.closed) break;
        this.residual = Buffer.concat([this.residual, chunk]);
        while (this.residual.length >= FRAME_BYTES) {
          const frame = this.residual.subarray(0, FRAME_BYTES);
          this.residual = this.residual.subarray(FRAME_BYTES);
          this.sendMedia(frame);
        }
      }
      if (!this.interrupted && this.residual.length) {
        this.sendMedia(this.residual);
        this.residual = Buffer.alloc(0);
      }
    } catch (e) {
      log.error('tts failed', e);
    }
    if (this.interrupted) {
      this.outstandingMarks.delete(mark);
      this.residual = Buffer.alloc(0);
      return;
    }
    this.sendMark(mark); // Twilio echoes this back when playback completes
  }

  private async applyControl(action: { type: 'transfer'; number: string } | { type: 'hangup' }) {
    if (!this.callSid) return;
    // Let any in-flight audio drain briefly so the closing line is heard.
    await new Promise((r) => setTimeout(r, 600));
    if (action.type === 'transfer') {
      log.info(`transferring to ${action.number}`);
      await updateCallTwiml(this.callSid, transferTwiml(action.number));
      this.cleanup('transferred');
    } else {
      log.info('hanging up');
      await updateCallTwiml(this.callSid, hangupTwiml());
      this.cleanup('completed');
    }
  }

  // ── Twilio outbound frames ──
  private sendMedia(mulaw: Buffer) {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify({ event: 'media', streamSid: this.streamSid, media: { payload: mulaw.toString('base64') } }));
  }
  private sendMark(name: string) {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify({ event: 'mark', streamSid: this.streamSid, mark: { name } }));
  }
  private sendClear() {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
  }

  cleanup(status: string) {
    if (this.closed) return;
    this.closed = true;
    if (this.maxCallTimer) clearTimeout(this.maxCallTimer);
    try {
      this.stt?.close();
    } catch {
      /* ignore */
    }
    try {
      if (this.ws.readyState === this.ws.OPEN) this.ws.close();
    } catch {
      /* ignore */
    }
    finishCall(this.callId, status)
      .then(() => emailCallSummary(this.agent, this.callId))
      .catch((e) => log.error('finishCall/summary failed', e));
    log.info(`call ${this.callId} ${status}`);
  }
}
