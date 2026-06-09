# Research: GoHighLevel Voice AI → self-hosted recreation

This documents what GoHighLevel's (GHL) "Voice AI" actually does, the reference
architecture for building an equivalent, and the cost trade-off of self-hosting.

## 1. What GHL Voice AI is

GHL's **Voice AI Agent** (part of their "AI Employee" suite) is a configurable AI
receptionist attached to a phone number. An operator sets it up in a no-code dashboard;
the agent then answers inbound calls 24/7, holds a natural conversation using speech
recognition + natural-language understanding, and performs **actions** to accomplish
goals. It is billed on a **per-minute** usage basis.

### Configuration surface (what an operator sets up)
- **Agent identity** — name + business name.
- **Persona / tone / instructions** — free-form prompt describing how to behave.
- **Goals** — what the agent should accomplish on the call.
- **Knowledge base / FAQ** — business facts the agent answers from.
- **Greeting** — the opening line.
- **Voice + language** — selectable TTS voice and spoken language.
- **Actions** the agent may take (see below).
- **Call handling** — business hours, and after-hours behavior (voicemail / alternate
  number / workflow). A phone number is assigned to the agent (cannot be one already
  used for IVR, etc.).

### Actions (the important part)
- **Book an appointment** — checks a connected **calendar in real time**, offers open
  slots, confirms date/time, and triggers a confirmation (e.g. SMS via a workflow).
- **Transfer the call** to a human under defined conditions.
- **Collect information** — name, email, address, etc. — and **create/update the contact
  record in the CRM**.
- **Trigger a workflow / automation** based on call content.
- **End the call**.

### Outputs
- Call **logs**, **transcripts**, and **recordings** in the dashboard.

> Sources (accessed June 2026): HighLevel support — "AI Voice Agents Overview" and
> "Complete Guide to Creating Voice AI Agents"; gohighlevel.com "AI call agents";
> third-party setup guides (getautomized, growwstacks, ghlcentral).

## 2. Reference architecture for an equivalent

The well-trodden pattern (documented by Twilio, Deepgram, AssemblyAI, and many build
write-ups) for a real-time phone agent is:

```
Twilio Voice ── Media Streams (WebSocket, μ-law 8kHz) ──┐
                                                        ▼
   streaming STT  ──►  streaming LLM (+ tool calling)  ──►  streaming TTS
   (Deepgram)          (OpenAI / Anthropic)                (ElevenLabs / Aura)
                                                        │
                          audio back to caller  ◄───────┘
```

Latency budget: the whole listen→think→speak loop should land **under ~1.5s** to feel
natural. The standard tricks (all implemented here):

1. **No transcoding** — keep μ-law/8kHz the whole way. Deepgram accepts
   `encoding=mulaw&sample_rate=8000`; ElevenLabs/Aura emit `ulaw_8000`. Twilio speaks
   exactly that, so no resampling.
2. **Stream the LLM and chunk by sentence** — the first finished sentence goes to TTS
   while the model is still generating the rest.
3. **Endpointing for turn-taking** — Deepgram `endpointing` + `UtteranceEnd` decide when
   the caller has finished a turn.
4. **Barge-in** — when the caller speaks over the agent, send Twilio a `clear` event to
   drop buffered audio and stop talking.

This project implements that pipeline in `src/pipeline/` with provider abstractions in
`src/providers/`.

## 3. Cost <a id="cost"></a>

GHL bundles everything and charges a per-minute rate (commonly cited in the low tens of
cents/minute, on top of the GHL subscription). Self-hosting, you pay the underlying
providers directly. Rough per-minute component cost (list prices, mid-2026, USD —
**verify against current pricing**):

| Component | Typical rate | ≈ per call-minute |
|---|---|---|
| Twilio inbound voice | ~$0.0085/min | ~$0.009 |
| Deepgram streaming STT (Nova-2) | ~$0.0043/min | ~$0.004 |
| LLM (gpt-4o-mini / Haiku-class) | per-token | ~$0.005–0.02 |
| TTS — Deepgram Aura | ~$0.015/min-equiv | ~$0.015 |
| TTS — ElevenLabs (Turbo) | per-character | ~$0.03–0.06 |
| **Total** | | **≈ $0.04–0.10 / min** |

So the self-hosted stack typically lands **well under** a bundled SaaS per-minute price,
the savings widening with volume — in exchange for you operating the infrastructure. Pick
**Aura** over ElevenLabs and a small LLM to minimize cost; pick ElevenLabs + a larger LLM
to maximize quality.

## 4. Deliberate scope boundaries

This project recreates the **Voice AI agent** specifically — not the entire GHL platform
(CRM, funnels, email/SMS campaigns, pipelines). It integrates with those via the
`webhook_url` seam (`capture_lead` / `trigger_workflow` POST to any CRM/automation
endpoint — n8n, Activepieces, Mautic, GHL itself, etc.). See the repo README's parent
discussion for how the voice agent slots into a broader self-hosted GHL-style stack.
