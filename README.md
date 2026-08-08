# Sidebar

An **ambient panel of AI agents that works alongside you in a live meeting** — one keeps a rolling summary, one turns spoken ideas into running prototypes the moment they're said, one fact-checks claims. Built on **Cerebras + Gemma 4** via [`universal-llm-client`](https://github.com/igorls/universal-llm-client), and **Bun**.

The hero is the **real-time prototype agent**: a spoken idea becomes a working, screen-aware HTML proof-of-concept in ~2s — fast enough that the artifact appears *while the idea is still alive in the room*. When the first idea is built, the agent **fans out three design languages in parallel**; you pick one and Sidebar **learns your taste** (a "Design DNA" that every later build inherits — real preference learning injected into the prototype prompt).

> Status: **hackathon MVP**. Runs end-to-end in fixture mode, and has a local live-room mode where one participant machine captures screen frames + speech/manual transcript while every viewer watches the same WebSocket event stream. Flip `AGENTS=live` for real Cerebras inference. Deepgram-grade ASR, web-search fact-check, and a hosted GPU baseline are TODO.

## Layout

```
.
├─ packages/shared/   @sidebar/shared — WS event protocol, Zod schemas, agent
│                     prompts, design-language themes + prototype builders
├─ apps/server/       Bun.serve WebSocket + orchestrator + agents
│                     (router / summarizer / prototype / fact-check)
├─ apps/web/          Vite + React, WebSocket-driven canvas UI
├─ test-transcripts.json   stable meeting fixtures (gold-label `expect` blocks)
└─ sidebar.html       the original standalone visual mockup (no build step)
```

## Quick start

Requires [Bun](https://bun.sh) ≥ 1.1.

```bash
bun install
cp .env.example .env          # works as-is in mock mode (no keys needed)
bun run dev                   # server on :3001, web on :5173
```

Open http://localhost:5173 and pick a scenario at the bottom. It streams the
fixture transcript over the WebSocket, the router fires, the summary updates,
and the prototype agent fans out three designs onto the canvas — pick one and
watch the Design DNA lock in.

## Fast live-room test (participant machine + Tailscale Funnel)

This is the fastest production-shaped path: one participant opens Sidebar in
host mode on their own machine, captures their screen, and hosts the shared UI.
Everyone else opens the same URL as viewers.

```bash
bun install
cp .env.example .env
bun run host                 # builds web and serves app + /ws on :3001
```

In another terminal:

```bash
bun run funnel               # HTTPS Funnel :8443 -> local :3001
```

Open the Tailscale Funnel HTTPS URL with `?host=1` on the participant machine.
Press **Live**, then **Screen**, then **Mic**. Share the same URL without
`?host=1` with viewers.

To turn off the public Funnel listener:

```bash
bun run funnel:off
```

Notes:
- Screen frames are sampled in the host browser, downscaled, and sent only to the
  local Bun server for screen-aware prototype prompts; raw frames are not
  rebroadcast to viewers.
- Chrome's built-in speech recognition is used when available. The manual
  transcript box is the fallback and still exercises the full agent pipeline.
- In `AGENTS=mock`, live-room transcript chunks use lightweight local routing
  heuristics so the demo works without keys. In `AGENTS=live`, the same chunks
  go through Cerebras/Gemma.

## Going live (real Cerebras inference)

```bash
# .env
CEREBRAS_API_KEY=sk-...          # PAYG tier recommended (see spec §6)
CEREBRAS_BASE_URL=https://api.cerebras.ai   # NOTE: no /v1 — the client appends it
MODEL_ID=gemma-4-31b
AGENTS=live
```

In `live` mode the router/summarizer use `generateStructured` (strict Zod →
JSON Schema via `fromZod`), and the prototype agent streams real HTML tokens via
`chatStream`. Everything else (the transcript source, the canvas, the
learned-style loop) is identical to mock mode.

## Runtime modes

| Env | Values | Meaning |
|---|---|---|
| `AGENTS` | `mock` \| `live` | `mock` replays the fixture gold labels; `live` calls Cerebras |
| `SOURCE` | `fixtures` \| `asr` | transcript source (`asr`/Deepgram is a TODO) |
| `FIXTURE_SCENARIO` | id | default scenario (`sprint-planning`, `growth-review`, `launch-page`) |

## WebSocket protocol

Backend → frontend events (see `packages/shared/src/events.ts`):
`meeting.start`, `transcript.partial|final`, `router.decision`, `summary.update`,
`fanout.start`, `prototype.start|token|complete`, `fanout.resolved`, `dna.update`,
`factcheck.result`, `telemetry`, `mode.changed`, `meeting.end`.

Frontend → backend: `start`, `pick` (learn this design language), `resetTaste`, `setAbMode`.

## Scripts

| Command | Does |
|---|---|
| `bun run dev` | server + web together (concurrently) |
| `bun run dev:server` | just the Bun WebSocket server |
| `bun run dev:web` | just the Vite app |
| `bun run host` | build the web app and serve app + `/ws` from Bun on `:3001` |
| `bun run funnel` | publish `https://<machine>.<tailnet>.ts.net:8443/` to local `:3001` |
| `bun run funnel:off` | turn off the `:8443` Funnel listener |
| `bun run typecheck` | `tsc --noEmit` across all three packages |
| `bun run build` | production web build |

## Roadmap

- Streaming **ASR** (Deepgram) as a real `SOURCE=asr` — browser speech/manual input is the fast MVP path.
- Better screen capture controls: frame dedup, preview, and user-visible privacy state.
- **Fact-check** web-search tool wiring (currently model self-reports).
- **Honest A/B**: point `BASELINE_*` at a GPU-hosted open model and race it.
- Prompt caching + token-bucket rate budget (orchestrator).
