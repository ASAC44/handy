# Sidebar vs Fathom — Positioning

## TL;DR

[Fathom](https://www.fathom.ai/) is the best-in-class AI **notetaker**: it records your
call and hands you transcripts, summaries, and action items *after* it ends, synced to
your CRM. **Sidebar is a different category** — a **real-time, in-meeting copilot** that
*acts while you talk*: it turns spoken ideas into working prototypes in ~1.5s, reads your
screen, fact-checks claims live, and learns your design taste.

> Fathom helps you **remember** the meeting. Sidebar changes what happens **in** it.

## Comparison matrix

| Capability | Fathom | Sidebar |
|---|---|---|
| **When it works** | After the call (retrospective) | **Live, during the call** |
| Transcription | ✅ mature | ✅ ElevenLabs Scribe v2 + on-device Gemma |
| Rolling summary / action items | ✅ post-call | ✅ live, structured (decisions/owners/Qs) |
| **Build working artifacts from speech** | ❌ | ✅ **HTML prototypes in ~1.5s** (the hero) |
| **Screen-aware / multimodal** ("build it like *this*") | ❌ | ✅ Gemma 4 reads the shared screen |
| **Live fact-checking** | ❌ | ✅ Tavily-grounded verdicts mid-meeting |
| **Learns your taste** (Design DNA) | ❌ | ✅ pick a style once → every later build inherits it |
| Idea→artifact speed as a feature | n/a | ✅ ~1.5s on Cerebras — **~15× a local GPU** |
| On-device / private option | partial ("bot-free") | ✅ fully local via Gemma 4 on Ollama |
| Recording & playback | ✅ | ❌ |
| CRM & integrations (Slack/Salesforce/HubSpot/Notion/Asana) | ✅ mature | ❌ not built |
| Platform bots (Zoom/Meet/Teams) | ✅ | ❌ browser capture only |
| Maturity | Production | Hackathon MVP |

## Where each wins

- **Fathom wins on recall & distribution:** recording, CRM sync, broad integrations,
  coaching scorecards, production polish. If the job is *"never take notes again,"* Fathom
  is excellent — and we don't try to beat it there.
- **Sidebar wins on the live loop:** generating artifacts, reading the screen, fact-checking,
  and adapting *in the moment*. If the job is *"make the meeting more productive while it's
  happening,"* that's a lane notetakers don't play in.

## The wedge: the idea→artifact cliff

Notetakers are a crowded, retrospective category. Sidebar's bet is **temporal coupling**:
turning a spoken idea into running code is a token-heavy chain. At GPU latency the artifact
is a *tombstone* — by the time it renders, the meeting has moved on. At Cerebras latency it
appears **while the idea is still alive in the room**, so the conversation reacts to a real
prototype instead of a promise. That's only possible at this speed — a notetaker can't bolt
it on.

Our own honest A/B benchmark, same prototype prompt, same Gemma 4 family:

| Engine | tok/s | idea→artifact |
|---|---|---|
| Cerebras `gemma-4-31b` | ~1588 | **~1.5s** |
| Local GPU `gemma4:31b` — *same model* (Ollama) | ~50 | ~46s |
| Local GPU `gemma4:12b` — smaller (Ollama) | ~100 | ~16.8s |

On the **same 31B model**, the local GPU is **~31× slower** (~50 vs ~1588 tok/s) — a build
that lands in 1.5s on Cerebras takes ~46s locally, long after the moment has passed. Even
dropping to the smaller 12B only closes the gap to ~15×. That cliff is the product.

---
*Fathom feature set per fathom.ai (June 2026); Sidebar figures from `_abbench.ts`.*
