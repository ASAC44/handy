# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Sidebar** — an ambient panel of AI agents for a live meeting: one keeps a rolling
summary, one turns spoken ideas into running HTML prototypes in ~2s, one fact-checks
claims. Built on **Cerebras + Gemma 4** via [`universal-llm-client`](https://github.com/igorls/universal-llm-client), on **Bun**. The hero is the
real-time prototype agent and its fan-out → pick → learn loop.

`sidebar-build-spec.md` is the design source of truth — agent prompts (`prompts.ts`)
and schemas (`schemas.ts`) are copied verbatim from its section 4, and the WS protocol
from section 7. Reconcile changes against it.

## Commands

Requires Bun ≥ 1.1. Run from repo root unless noted.

```bash
bun install
cp .env.example .env     # works as-is in mock mode (no API key needed)
bun run dev              # server :3001 + web :5173 together (concurrently)
bun run dev:server       # just the Bun WebSocket server (bun --watch)
bun run dev:web          # just the Vite app
bun run typecheck        # tsc --noEmit across shared + server + web — THE check gate
bun run build            # production web build
bun run asr:gen          # (re)generate fixtures/audio/* from transcripts via ElevenLabs TTS
bun run asr:bench        # score local Gemma ASR against those fixtures (WER) — needs Ollama
bun run meetings:gen     # (re)generate fixtures/meetings/* — naturalistic v3 meetings
bun run meetings:bench   # WER on the realism-set clips (asr-bench --set meetings)
                         #   --backend both -> Gemma local vs ElevenLabs Scribe head-to-head
bun run asr:livesim      # simulate the live on-device path: app's energy-VAD over meeting.wav -> Gemma
```

There is **no test runner and no linter**. `bun run typecheck` is the only automated
check — run it before claiming a change is done. `test-transcripts.json` is *not* a
test suite; it is the fixture stream (see below). To check a single scenario, set
`FIXTURE_SCENARIO` and run the app.

Two committed audio-fixture sets feed ASR work (16 kHz mono WAV, generated once and
committed — the bench never calls the network; needs an ElevenLabs key with
`text_to_speech` to *re*generate):
- **`fixtures/audio/`** — clean TTS of `test-transcripts.json` (canonical), `eleven_multilingual_v2`.
- **`fixtures/meetings/`** — naturalistic, multilingual (EN/PT-BR), overlapping meetings
  authored in `fixtures/meetings/scripts.json` and rendered with **`eleven_v3`** (audio
  tags + emotion). Separate from the agent gold labels on purpose. Per scenario: clean
  per-utterance clips (WER) + a `meeting.wav` mix with true cross-talk (not WER-scored).
  See `fixtures/meetings/README.md`.

## Architecture

Bun-workspace monorepo, three packages. The shared package is the contract both other
packages compile against.

- **`packages/shared`** (`@sidebar/shared`) — the single source of cross-cutting truth:
  the WebSocket event protocol (`events.ts`), Zod schemas + inferred types
  (`schemas.ts`), agent system prompts (`prompts.ts`), and design-language themes +
  the mock prototype HTML builders (`themes.ts`). Imported via the `@sidebar/shared`
  path alias (`tsconfig.base.json`) and as a `workspace:*` dependency. Change a type
  here and both server and web see it.
- **`apps/server`** — `Bun.serve` WebSocket at `/ws` (+ `/health`). One `Session`
  per connection (`session.ts`), each owning one `Orchestrator` (`orchestrator.ts`).
  No DB; all state is in-memory per session.
- **`apps/web`** — Vite + React. A single `useReducer` in `ws.ts` holds the entire
  client state, driven purely by the inbound WS event stream; components just render
  it. Auto-reconnects every 1s.

### The mock/live duality (central pattern)

Every agent has two code paths selected by `config.agents`:
- **`mock`** (default, no API key): the orchestrator replays the gold-label `expect`
  blocks baked into `test-transcripts.json`. The prototype agent streams a pre-built
  themed HTML doc (`buildPrototype` in `themes.ts`) chunked over time to fake token
  streaming.
- **`live`**: real Cerebras inference. Router/summarizer/factcheck use
  `generateStructured` with `fromZod(...)` (strict Zod → JSON Schema); the prototype
  agent uses `chatStream` for real token streaming.

`orchestrator.ts` methods (`router`, `summarize`, `factcheck`, `streamOne`) each branch
on `config.agents`. When adding agent behavior, implement **both** paths and keep the
fixture `expect` shape in sync with the Zod schemas.

### Meeting flow (`orchestrator.ts`)

`start()` streams a scenario's transcript segments. For each segment with an `expect`
block: the **router** decides which downstream agents fire, then summarizer / factcheck /
prototype run conditionally. The **prototype build** is the hero: the *first* build
fans out 3 themes in parallel (`FANOUT`), waits for the user's `pick` (or 4.2s timeout
→ `RECOMMENDED`), then `session.learn(chosen)` locks in a "Design DNA". Every later
build is single-shot in the learned theme, whose tokens are injected into the prototype
system prompt by `prototypeSystemFor()` — this is the "preference learning becomes real
inference" mechanism.

**Cancellation:** the orchestrator guards every `await` with `if (my !== this.runId)
return`. `runId` is bumped on a new `start()` or `dispose()`, so in-flight async work
from a stale run self-cancels. Preserve this guard when adding awaits.

### Meeting lifecycle & access (`room.ts`)

One global `room` singleton = one meeting per server process. Lifecycle verbs:
- **End for everyone** (host): client `meeting.end` → `room.endMeeting()` sets `ended`,
  stops in-flight work (keeping transcript + summary), broadcasts `meeting.over`, and
  fires `orchestrator.finalizeDocument()` — the **closing agent** that streams a themed
  HTML **final recap** (`finaldoc.start/token/complete`, mock + live like the prototype
  agent, styled by the learned DNA). All clients lock to the read-only `RecapView`.
- **Clear / new meeting** (host): `meeting.clear` resets to a blank meeting, lifting the
  recap lock; presence + invites are preserved.
- **Exit** (guest): client-only `leave()` (no protocol event) — stops auto-reconnect and
  shows the "you left" screen, mirroring the `kicked` flow.

**Access model:** the host authenticates with `HOST_PASSCODE`; each guest gets a unique,
host-minted invite code (`invite.create`/`invite.revoke` → `invite.list`; one `?key=`
per guest). Role is **server-authoritative** — `room.authenticate(key)` returns the role
from the matched credential and it's captured onto `WsData.auth` at WS upgrade; the
client `?host` flag only decides role in open mode (no passcode set). Kicking a guest
revokes their invite. Add privileged client events host-gated in `onEvent` (`isHost`).

### LLM layer (`apps/server/src/llm.ts`)

One `AIModel` factory per agent, each with its own sampling defaults (router cold +
tiny budget, prototype hot + streamed). All target Cerebras via the OpenAI-compatible
provider. `thinking: false` is deliberate — reasoning tokens would blow the latency
budget that is the whole demo.

## Conventions & gotchas

- **`CEREBRAS_BASE_URL` must NOT include `/v1`** — `universal-llm-client` appends it.
  Same for `BASELINE_BASE_URL`.
- All env config is centralized in `apps/server/src/config.ts`. Read config there, not
  via `process.env` scattered through the code. `assertLiveReady()` warns (not throws)
  if `AGENTS=live` without a key.
- Runtime modes via env: `AGENTS` (`mock`|`live`), `SOURCE` (`fixtures`|`asr`),
  `FIXTURE_SCENARIO` (`sprint-planning`|`growth-review`|`launch-page`).
- The WS protocol is a discriminated union on `type` in `events.ts`. Add an event by
  extending `ServerEvent`/`ClientEvent`, then handle it in both the orchestrator/session
  (emit) and the `ws.ts` reducer (consume) — the compiler will flag missing arms.
- **TODO stubs** (scaffold, not wired): `SOURCE=asr` (Deepgram), real web-search in the
  factcheck agent (currently model self-reports), and the `BASELINE_*` GPU A/B race.
