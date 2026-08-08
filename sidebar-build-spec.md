# Sidebar — Build Spec

> **Working title:** Sidebar (alts: Backchannel, Cohost, Aux). Rename freely.
> **One-liner:** A panel of AI agents that works *alongside* you during a live meeting — one keeps a rolling summary, one turns spoken ideas into running prototypes the moment they're said, one fact-checks claims. Built on Cerebras + Gemma 4 31B.
> **Hackathon:** Cerebras × Google DeepMind Gemma 4, 24h. Targets both tracks: **Enterprise** ("an AI panel that works with you in meetings") and **Inference Speed** (the idea→prototype cliff).

---

## 1. The core bet (why this wins)

The hero is the **real-time prototype agent**. Turning a spoken idea into running code is a token-heavy *chain* (parse → draft → render), not a single generation. At ~200 tok/s that chain is 8–12s and the meeting has moved on — the artifact is a tombstone. At ~1900 tok/s it's 1–2s, so **the working prototype appears while the idea is still alive in the room.** That temporal coupling is the cliff: impossible at GPU latency, magical at Cerebras latency. Everything else (summary, fact-check) is supporting cast — useful, but they're gradients, not cliffs. The pitch leads with the prototype.

Two things make Gemma 4 *necessary* rather than incidental:
1. **Multimodal:** agents see the screen share / slides / whiteboard (image input). "Build it like this diagram" works because the prototype agent sees the diagram. Without this, the product runs on any text LLM and doesn't justify the model.
2. **Speed:** the cliff above.

**Constraint fit:** meeting chunks arrive every few seconds, so the agent panel fires ~0.3 req/s — nowhere near the 300 req/min PAYG ceiling. Unlike a video/frame loop, this idea does **not** fight the rate limiter. That's deliberate.

---

## 2. Scope

### MVP (must ship)
- Live audio capture → streaming ASR → transcript on screen.
- Router that decides which agents act per chunk (strict structured output).
- **Summarizer agent** — rolling structured summary (decisions / action items / open questions / TL;DR).
- **Prototype agent (HERO)** — spoken idea (+ optional screenshot) → self-contained HTML POC, streamed and live-rendered in a sandboxed iframe.
- Real-time dashboard with transcript, summary, and live-rendering prototype panels.
- **Idea→artifact latency** metric, displayed prominently.
- **Honest A/B:** same prototype pipeline against a ~200 tok/s GPU-hosted baseline, side by side.

### Stretch (if time)
- **Fact-check agent** — claim extraction → web search → verdict + confidence + source. (Lower priority: I/O-bound on the search round-trip, so it does *not* showcase inference speed.)
- Speaker diarization.
- Action-item export (copy to clipboard / markdown).
- Prototype "remix" — click a past prototype, speak a change, it regenerates.

### Non-goals (explicitly out)
- Persisting meetings to a DB / auth / multi-tenant. In-memory session only.
- A polished prototype agent that handles *any* request perfectly. It produces a *visual, runnable* POC, not production code.
- Audio *output* / voice synthesis. Text + screen in, text + rendered UI out.

---

## 3. Architecture

```
┌────────────┐   ┌──────────────┐   ┌──────────┐
│  Capture   │   │  ASR (ext.)  │   │ Chunker  │
│ audio +    │──▶│  streaming   │──▶│ semantic │
│ screenshot │   │  transcript  │   │ windows  │
└────────────┘   └──────────────┘   └────┬─────┘
                                          │ {transcript chunk + latest screenshot}
                                          ▼
                                  ┌───────────────┐
                                  │    ROUTER     │  Gemma 4, reasoning off,
                                  │ strict JSON   │  strict structured output
                                  └───┬───┬───┬───┘
                        ┌─────────────┘   │   └─────────────┐
                        ▼                 ▼                 ▼
                ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
                │ SUMMARIZER   │  │ PROTOTYPE ★  │  │ FACT-CHECK   │
                │ rolling      │  │ idea→HTML    │  │ (stretch)    │
                │ structured   │  │ screen-aware │  │ web search   │
                │ summary      │  │ streamed     │  │ I/O-bound    │
                └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                       └──────────┬──────┴─────────────────┘
                                  ▼
                        ┌──────────────────┐
                        │   ORCHESTRATOR   │  rate-limit budget (token bucket),
                        │                  │  prompt caching, backpressure
                        └────────┬─────────┘
                                 │ WebSocket events
                                 ▼
                        ┌──────────────────┐
                        │   DASHBOARD (UI) │  transcript / summary / live prototype
                        │                  │  + idea→artifact latency + A/B toggle
                        └──────────────────┘
```

---

## 4. Components

### 4.1 Capture
- **Audio:** browser `getUserMedia` (mic) and/or system/tab audio via `getDisplayMedia({ audio: true })`. For a real call, capture the meeting tab's audio.
- **Screen:** `getDisplayMedia` video track; sample a frame on demand (every ~3–5s, or when the router sets `uses_screen`). Downscale to ~1024px wide, encode PNG, base64. **Dedup** with a perceptual hash — skip the call's image attach if the frame is unchanged, to save input tokens.

### 4.2 ASR — the real bottleneck (NOT Cerebras)
Gemma 4 is **text + image in only — no audio.** ASR is a separate component on the critical path. If it buffers 5s before emitting, downstream speed is wasted.
- **Primary (de-risked):** Deepgram streaming (`nova` family) over WebSocket — ~300ms partials, trivial to wire, no Python sidecar.
- **Alt (local / no cost):** `faster-whisper` (`small`/`distil`) as a sidecar with VAD chunking.
- **Measure ASR latency first, before anything else.** It's the most likely silent killer.
- Emit both `partial` and `final` segments with timestamps.

### 4.3 Chunker
- Buffer `final` segments into semantic chunks: utterance/pause boundaries, or a ~8–12s sliding window, whichever fires first.
- Attach the latest (deduped) screenshot reference to each chunk.
- Emit a `chunk` event to the router.

### 4.4 Router (Gemma 4)
Cheap gatekeeper so the heavy agents don't fire on every chunk.
- **Model params:** `reasoning_effort` off, `temperature` 0.3 (deviates from the 1.0 default *intentionally* for routing determinism), `strict: true` structured output, `max_tokens` ~512.
- **Input:** latest chunk + rolling summary (cached prefix).
- **Output schema** (`router_decision`):

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "topic_shift":   { "type": "boolean" },
    "summary_update":{ "type": "boolean" },
    "prototype": {
      "type": "object", "additionalProperties": false,
      "properties": {
        "trigger":    { "type": "boolean" },
        "intent":     { "type": "string" },
        "uses_screen":{ "type": "boolean" }
      },
      "required": ["trigger", "intent", "uses_screen"]
    },
    "factcheck": {
      "type": "object", "additionalProperties": false,
      "properties": {
        "trigger": { "type": "boolean" },
        "claims":  { "type": "array", "items": { "type": "string" } }
      },
      "required": ["trigger", "claims"]
    }
  },
  "required": ["topic_shift", "summary_update", "prototype", "factcheck"]
}
```

- **System prompt:**
> You are the router for a live meeting copilot. Each turn you receive the latest transcript segment and a rolling summary. Decide which downstream agents should act. Be conservative. Only trigger `prototype` when the speaker describes something buildable — a UI, feature, algorithm, data viz, or flow — and write a one-sentence `intent`; set `uses_screen` true only if they reference something visible on screen ("like this", "this diagram", "the mockup"). Only trigger `factcheck` for specific checkable claims (numbers, dates, named facts) and list them verbatim. Allow `summary_update` on topic shifts or new decisions. Respond ONLY with JSON matching the schema. No prose.

### 4.5 Summarizer agent (Gemma 4)
- **Params:** `reasoning_effort` off, `temperature` 0.5, `strict: true`, `max_tokens` ~1024.
- **Input:** rolling transcript window + previous summary object.
- **Output schema** (`meeting_summary`):

```json
{
  "type": "object", "additionalProperties": false,
  "properties": {
    "tldr":          { "type": "string" },
    "decisions":     { "type": "array", "items": { "type": "string" } },
    "action_items":  { "type": "array", "items": {
        "type": "object", "additionalProperties": false,
        "properties": { "owner": { "type": "string" }, "task": { "type": "string" } },
        "required": ["owner", "task"]
    }},
    "open_questions":{ "type": "array", "items": { "type": "string" } }
  },
  "required": ["tldr", "decisions", "action_items", "open_questions"]
}
```

- **System prompt:**
> You maintain a live, structured summary of an ongoing meeting. You receive the rolling transcript and your previous summary. Update it: capture decisions, action items (with owner if stated, else "unassigned"), open questions, and a one-line TL;DR of the current topic. Be concise and factual. Never invent. Respond ONLY with JSON matching the schema.

### 4.6 Prototype agent ★ (Gemma 4) — the hero
- **Params:** `reasoning_effort` **off** (keep it fast — reasoning tokens burn the latency budget that *is* the demo), `temperature` 1.0, `top_p` 0.95, `max_tokens` ~2500, **streaming on**, Chat Completions endpoint (required for the image).
- **Input:** the router's `intent` + recent transcript + (if `uses_screen`) the latest screenshot as a base64 image.
- **Output:** a single self-contained HTML document. **Stream the raw HTML** (not wrapped in JSON) so the dashboard gets the "watch it type itself" effect; render progressively into a sandboxed iframe.
- **System prompt:**
> You are a real-time prototyping agent in a live meeting. The speaker just described an idea (`intent` + transcript). You may also receive a screenshot of their screen — a diagram, mockup, slide, or whiteboard. When present, treat it as the visual spec. Produce ONE self-contained HTML document (inline CSS and JS, no external deps except scripts from https://cdnjs.cloudflare.com) that is a working, visual proof-of-concept of the idea. Favor something runnable and striking over completeness. Output ONLY the HTML, starting with `<!DOCTYPE html>`. No explanation, no markdown fences.
- **Render safety:** inject into `<iframe sandbox="allow-scripts">` with no `allow-same-origin`. Generated code cannot touch the parent.
- **Optional self-correct (only if latency budget allows):** a second pass — "fix any errors, keep it self-contained" — gated behind a flag; off for the speed demo.

### 4.7 Fact-check agent (stretch, Gemma 4 + web search tool)
- **Params:** `reasoning_effort` off, `temperature` 0.2, tool calling enabled (web search), `strict: true` on the final structured answer.
- **Output schema** (`factcheck_result`):

```json
{
  "type": "object", "additionalProperties": false,
  "properties": {
    "checks": { "type": "array", "items": {
      "type": "object", "additionalProperties": false,
      "properties": {
        "claim":      { "type": "string" },
        "verdict":    { "type": "string", "enum": ["supported", "contradicted", "unverified"] },
        "confidence": { "type": "number" },
        "source":     { "type": "string" }
      },
      "required": ["claim", "verdict", "confidence", "source"]
    }}
  },
  "required": ["checks"]
}
```

- **Note:** critical path is the search round-trip, not generation. Label it as a feature, never as a speed showcase.

### 4.8 Orchestrator
- **Rate-limit budget:** token-bucket limiter sized to **PAYG: 300 req/min (5 req/s) and 500k input tok/min**. Per chunk the worst case is router(1) + summarizer(1) + prototype(1) ≈ 3 req every ~10s ≈ 0.3 req/s — huge headroom. Limiter exists mainly to protect against pathological bursts and to make the budget explicit for judges.
- **Prompt caching:** cache each agent's system prompt + shared rolling context as a stable prefix; each call pays only the delta (new chunk / new screenshot). Reduces latency and input-token spend. (Verify cached-token billing semantics — pricing is "coming soon".)
- **Backpressure:** if the prototype agent is mid-generation when a new trigger arrives, queue or coalesce; never run two prototype generations concurrently for the same session (keeps the UI legible).
- **Concurrency:** summarizer and prototype can run in parallel (different panels). Use `Promise.allSettled`-style fan-out.

### 4.9 Dashboard (UI — your strength, make it the video)
- **Panels:** live transcript (partials greyed, finals solid) · rolling summary (decisions / action items / open questions / TL;DR) · **prototype panel** (streaming code on one side, live iframe preview on the other) · fact-check ticker (stretch).
- **Hero metric:** **idea→artifact latency** — ms from the finalized triggering utterance to prototype render complete. Big, prominent, updates per prototype.
- **A/B toggle:** run the same prototype request through Cerebras (~1900) and a GPU baseline (~200) and show both timers side by side. This *is* the pitch.
- **Telemetry strip:** per-agent tok/s, latency, tokens — drives a small live "speed" viz (your radial/swarm aesthetic fits here).

---

## 5. The demo (don't fake the slow side)

Most teams will fake the GPU comparison by artificially delaying tokens. **Do an honest A/B instead** — it's far more convincing to a speed-company judge and immune to the "you throttled it yourself" critique.

- **Primary:** call the *same* Gemma 4 (or nearest open equivalent) on a GPU provider (Together / Fireworks / Groq-non-Cerebras / local vLLM) as the baseline, real round-trip, real ~200 tok/s.
- **Fallback (only if you can't host a baseline in time):** client-side token-rate throttle clearly labeled "GPU-equivalent latency (simulated)". Disclose it.
- **The metric on screen:** idea→artifact latency, both columns live. Cerebras shows ~1–2s; baseline shows ~8–12s. The prototype renders on the fast side while the slow side is still spilling tokens. That single shot is the submission.

**Demo script (60–90s video):**
1. Two-line intro: "Sidebar is a panel of agents that works while you talk."
2. Speak an idea ("a kanban board with drag-and-drop and a burndown chart") — summary updates, prototype starts streaming, renders live in ~2s.
3. Speak an idea that references the screen ("make it look like *this* mockup", screenshot attached) — prototype reads the image and matches it. (Multimodal proof.)
4. Flip the A/B toggle on the next idea — fast side renders while slow side crawls. Hold on the dual timer.
5. End on the latency number.

Submit to **#showcase** (video + repo + description) and post the A/B clip on X tagging @CerebrasSystems. Multiple submissions allowed — post one framed for Enterprise, one for Speed.

---

## 6. Cerebras / Gemma 4 integration (pin these)

- **Model ID:** `gemma-4-31b` · **Endpoint:** `POST https://api.cerebras.ai/v1/chat/completions` (OpenAI-compatible). Images require Chat Completions.
- **Speed:** ~1500–1900 tok/s (doc lists both).
- **Multimodal rules:** base64 PNG/JPEG **data URI only** (no external URLs) · **max 5 images/request** · **≤10MB total** · images **only** on Chat Completions.
- **Context:** 65k free / 131k paid · **Max output:** 32k / 40k.
- **Reasoning:** OFF by default; enable per-call with `reasoning_effort`. No `raw`/`hidden` formats.
- **Structured outputs / tools:** `strict: true` (constrained decoding) supported · parallel tool calling · prompt caching.
- **Recommended sampling:** `temperature` 1.0, `top_p` 0.95 (override lower for router/fact-check).
- **Rate limits:** Free 5 req/min · 30k input tok/min · 1M/day. **PAYG 300 req/min · 500k input tok/min.** → **You must be on PAYG.** Free tier's 5 req/min makes any live loop impossible and image input eats the 30k tok/min budget in seconds.

**Image attach shape:**
```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "<intent + transcript>" },
    { "type": "image_url",
      "image_url": { "url": "data:image/png;base64,<...>" } }
  ]
}
```

**Streaming prototype call (sketch):**
```ts
const stream = await cerebras.chat.completions.create({
  model: "gemma-4-31b",
  stream: true,
  temperature: 1.0,
  top_p: 0.95,
  max_tokens: 2500,
  messages: [
    { role: "system", content: PROTOTYPE_SYSTEM_PROMPT },
    { role: "user", content: userContent }, // text [+ image]
  ],
});
for await (const part of stream) {
  const delta = part.choices[0]?.delta?.content ?? "";
  ws.send({ type: "prototype.token", data: delta });
}
```

---

## 7. WebSocket event model (backend → frontend)

| Event | Payload |
|---|---|
| `transcript.partial` | `{ text, ts }` |
| `transcript.final` | `{ text, ts, speaker? }` |
| `router.decision` | `router_decision` object |
| `summary.update` | `meeting_summary` object |
| `prototype.start` | `{ id, intent, usesScreen }` |
| `prototype.token` | `{ id, delta }` (streamed HTML) |
| `prototype.complete` | `{ id, html, idea_to_artifact_ms }` |
| `factcheck.result` | `factcheck_result` object |
| `telemetry` | `{ agent, latency_ms, tokens, tok_per_s }` |
| `mode.changed` | `{ baseline: "cerebras" \| "gpu" }` |

---

## 8. Tech stack

- **Backend:** Node + TypeScript, Fastify + `ws`. Single in-memory session.
- **LLM client:** OpenAI-compatible SDK pointed at Cerebras base URL (works because the API is OpenAI-shaped).
- **ASR:** Deepgram streaming (primary) / `faster-whisper` sidecar (alt).
- **Frontend:** React + Vite. Sandboxed `<iframe>` for prototype render. WebSocket client.
- **Baseline (A/B):** second OpenAI-compatible client pointed at a GPU provider hosting Gemma 4 (or nearest open equivalent).
- **No DB.** State in memory.

---

## 9. Config / env

```
CEREBRAS_API_KEY=
CEREBRAS_BASE_URL=https://api.cerebras.ai/v1
MODEL_ID=gemma-4-31b

ASR_PROVIDER=deepgram            # or faster_whisper
DEEPGRAM_API_KEY=

# A/B baseline (honest GPU comparison)
BASELINE_BASE_URL=               # e.g. Together / Fireworks
BASELINE_API_KEY=
BASELINE_MODEL_ID=

CHUNK_WINDOW_MS=10000
SCREENSHOT_INTERVAL_MS=4000
SCREENSHOT_MAX_WIDTH=1024
```

---

## 10. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **ASR latency dominates** and hides Cerebras speed | High | Measure first. Use managed streaming ASR. Show idea→artifact latency *from finalized utterance* so ASR isn't on the measured path. |
| Prototype agent emits broken/non-rendering HTML | Med | Strong system prompt; sandboxed iframe tolerates failures; optional self-correct pass (off for speed demo). |
| Free-tier rate limits throttle everything | High | PAYG, non-negotiable. Token-bucket budget + prompt caching. |
| Image tokens blow input budget | Med | Downscale to 1024px, perceptual-hash dedup, attach image only when `uses_screen`. |
| Judge dismisses it as "any LLM" | High | Lead with multimodal screen-aware prototype; that's the Gemma-4-specific bit. |
| A/B looks rigged | Med | Honest GPU baseline, real round-trip; disclose if simulated. |
| Scope creep (6 agents) | High | Ship 2 great agents (summary + prototype). Fact-check only if H16+. |

---

## 11. 24h build plan

| Window | Goal |
|---|---|
| **H0–H2** | Repo scaffold (Fastify + ws + React/Vite). Cerebras client hello-world. **Stand up streaming ASR and measure its latency.** Transcript renders live. |
| **H2–H5** | Router + summarizer with strict structured outputs. WS event bus. Transcript + summary panels working. |
| **H5–H9** | **Prototype agent (hero):** streaming HTML → sandboxed iframe live render. Screen capture + dedup + image attach. "Speak idea → see it build." |
| **H9–H12** | Orchestrator: rate-limit budget, prompt caching, backpressure, telemetry events. |
| **H12–H16** | **Honest GPU baseline A/B** + idea→artifact latency metric + dual-timer side-by-side view. |
| **H16–H20** | UI polish (your strength — make it photogenic), error/empty states, telemetry viz. Fact-check agent if on schedule. |
| **H20–H23** | Record demo video, dry-run the script, write repo description. Post Enterprise- and Speed-framed submissions to #showcase + X. |
| **H23–H24** | Buffer / bug fixes. |

---

## 12. Definition of done (MVP)

- [ ] Speak an idea → prototype streams and renders in a sandboxed iframe in ~1–2s.
- [ ] Reference something on screen → prototype reads the screenshot and reflects it (multimodal proof).
- [ ] Rolling summary updates with decisions / action items / open questions.
- [ ] Idea→artifact latency shown live.
- [ ] A/B view shows Cerebras vs GPU baseline timers side by side.
- [ ] 60–90s demo video that holds on the dual-timer moment.
