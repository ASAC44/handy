# Sidebar

**An ambient panel of AI agents that works alongside you in a live meeting.** One keeps a
rolling summary, one turns spoken ideas into running prototypes the moment they're said,
one fact-checks claims against the live web. Everyone in the room watches the same
WebSocket event stream. Built on **Cerebras + Gemma 4** via
[`universal-llm-client`](https://github.com/igorls/universal-llm-client), on **Bun**.

The hero is the **real-time prototype agent**: a spoken idea becomes a working,
screen-aware HTML proof-of-concept in **~1.5s** — fast enough that the artifact appears
*while the idea is still alive in the room*. When the first idea is built, the agent
**fans out three design languages in parallel**; you pick one and Sidebar **learns your
taste** (a "Design DNA" injected into every later build — real preference learning carried
through to inference). When the meeting ends, a closing agent streams a **shareable HTML
recap** in that same learned style.

> **Status: hackathon MVP** (Cerebras × Google DeepMind Gemma 4). Runs end-to-end in
> fixture mode with **no keys**. It also has a real **live shared room**: a host captures
> screen + speech on their machine, mints invite links, and every guest watches the same
> canvas. Flip `AGENTS=live` for real Cerebras inference, add `TAVILY_API_KEY` to ground
> fact-checks on web search, and point `BASELINE_*` at a GPU host for the honest A/B race.

## Why it exists — the idea→artifact cliff

Turning a spoken idea into running code is a token-heavy *chain* (parse → draft → render),
not a single generation. At ~50–200 tok/s that chain is 15–45s and the meeting has moved
on — the artifact is a tombstone. At ~1900 tok/s it's 1–2s, so the working prototype
appears **while the idea is still alive in the room**. That temporal coupling is impossible
at GPU latency and magical at Cerebras latency. It's the whole product.

Our own honest A/B, **same prototype prompt, same Gemma 4 family** (figures from
`apps/server/src/_abbench.ts`, written up in [`docs/positioning.md`](docs/positioning.md)):

| Engine | tok/s | idea→artifact |
|---|---|---|
| **Cerebras `gemma-4-31b`** | ~1588 | **~1.5s** |
| Local GPU `gemma4:31b` — *same model* (Ollama) | ~50 | ~46s |
| Local GPU `gemma4:12b` — smaller (Ollama) | ~100 | ~16.8s |

On the **same 31B model** the local GPU is **~31× slower**. The A/B view races both engines
live and holds on the dual timer — that's the pitch.

## What's in the panel

Four agents, plus a learning loop. A cheap **router** gates everything so the heavy agents
don't fire on every utterance.

- **Router** — strict structured decision per chunk: topic shift, summary update, whether
  to build a prototype (with a one-line `intent` + `uses_screen`), whether to fact-check
  (with the claims). Cold sampling, tiny token budget.
- **Summarizer** — rolling structured summary: TL;DR, decisions, action items (with owners),
  open questions.
- **Prototype ★ (the hero)** — `intent` + transcript (+ the latest screenshot when the
  speaker references the screen) → one self-contained HTML document, streamed token-by-token
  and rendered live in a sandboxed iframe.
- **Fact-check** — retrieve-then-ground: each routed claim is searched via **Tavily**, then
  Gemma judges it against the snippets (verdict / confidence / source / note). Falls back to
  the model's own knowledge when no `TAVILY_API_KEY` is set.
- **Design DNA** — the first build fans out three styles (Midnight / Warm / Neon) in
  parallel; you pick one (or a 4.2s timeout picks the recommended) and that design language
  is injected into the prototype system prompt so **every later build inherits your taste**.
  The closing recap uses it too.

## The live room

Sidebar is multiplayer. There is one in-memory **room** per server; every connection is a
thin session that joins it.

- **Host + guests.** The host captures screen + speech and hosts the shared canvas; guests
  open an invite link and watch the same event stream. Live **presence** (cursors, pings,
  participant bar).
- **Invite gating.** Set `HOST_PASSCODE` and the host authenticates with it; guests each get
  a unique, host-minted invite code carried as `?key=` on their link (revocable, kickable).
  Empty passcode = open (fine for local dev).
- **Bring-your-own transcription.** Per participant, pick a backend:
  **ElevenLabs Scribe v2 Realtime** (the browser streams mic audio straight to ElevenLabs
  using a 15-min single-use token minted server-side — the key never reaches the client), or
  fully **on-device** via **WebGPU Whisper** (`@huggingface/transformers`, base/small/large-v3-turbo
  tiers) or **Gemma 4 E4B on Ollama**, or the free **Web Speech API** fallback. Per-participant
  language picker, noise-floor calibration, and a live VAD latency tuner. Push-to-talk or
  continuous capture.
- **Screen-aware (multimodal).** The host browser samples screen frames, downscales them, and
  sends them **only to the local server** for screen-aware prototype prompts — raw frames are
  never rebroadcast to viewers. "Build it like *this* diagram" works because Gemma 4 sees it.
- **File context.** Drop files into the meeting; the host accepts a bundle into the workspace
  and its summary is fed to the router / summarizer / prototype agents.
- **Meeting recap.** When the host ends the meeting, a closing agent drafts a themed,
  self-contained HTML recap (executive summary, decisions, action items, open questions,
  prototypes built) and streams it to everyone on the same link.
- **Draggable, dockable, resizable panels** over an infinite canvas, with a Paper / Ink
  (light / dark) editorial theme.

## Layout

Bun-workspace monorepo, three packages. `packages/shared` is the contract the other two
compile against.

```
.
├─ packages/shared/   @sidebar/shared — WS event protocol (events.ts), Zod schemas +
│                     inferred types (schemas.ts), agent prompts (prompts.ts), design
│                     languages + mock prototype builders (themes.ts)
├─ apps/server/       Bun.serve WebSocket (/ws) + static host + a shared Room that owns
│                     the Orchestrator and the four agents (router/summarizer/prototype/
│                     factcheck) + the closing finaldoc agent
├─ apps/web/          Vite + React. One useReducer (ws.ts) holds all client state, driven
│                     purely by the inbound WS stream; per-participant capture + ASR
├─ fixtures/          committed 16 kHz audio sets for the ASR benches (audio/, meetings/)
├─ scripts/          asr/meeting fixture generation + WER benches + live-sim
├─ test-transcripts.json   stable meeting fixtures (gold-label `expect` blocks)
├─ sidebar-build-spec.md   design source of truth (prompts + schemas + protocol)
├─ docs/index.html         self-contained landing page — the GitHub Pages site (served from docs/)
└─ docs/positioning.md     Sidebar vs the 2026 AI-meeting landscape + the honest A/B
```

## Run it (Docker is the default)

Sidebar runs in **Docker with a Tailscale sidecar**, so the app comes up as its own
**isolated node on your tailnet** (e.g. `https://sidebar.tail1234.ts.net`) — no host-level
funnel, and the whole thing tears down with one command. The Bun server serves the web app,
`/ws`, and the API on a single port, so one `tailscale serve` carries everything.

```bash
cp .env.example .env
# In .env:
#  - AGENTS=mock works with no keys; set AGENTS=live + CEREBRAS_API_KEY for real inference
#  - add a Tailscale auth key for the sidecar (ephemeral + reusable):
#      https://login.tailscale.com/admin/settings/keys
#    TS_AUTHKEY=tskey-auth-...
#    TS_HOSTNAME=sidebar        # -> https://sidebar.<your-tailnet>.ts.net (tailnet only)

docker compose up              # build + run both containers (logs in foreground)
```

Open `https://<TS_HOSTNAME>.<your-tailnet>.ts.net` from any device on your tailnet (host
login uses `HOST_PASSCODE` / `MEETING_PASSWORD`).

| Command | Does |
|---|---|
| `docker compose up` / `up -d` | build + run, foreground / detached |
| `docker compose logs -f app` | follow the server log (live agent calls show here) |
| `docker compose down` | stop; the tailnet node goes offline |
| `docker compose exec app bun run build` | rebuild the web bundle after web-only edits |

**Hot-reload:** your working tree is bind-mounted and the server runs under `bun --watch`,
so server / orchestrator edits reload live. Web (`apps/web`) edits need a `bun run build`
(command above) then a refresh. Change a `package.json` / lockfile → `docker compose build`
**and** `docker compose down -v` (the anonymous `node_modules` volumes re-seed from the image).

> Files: [`Dockerfile`](Dockerfile), [`docker-compose.yml`](docker-compose.yml),
> [`docker/tailscale/serve.json`](docker/tailscale/serve.json). The sidecar serves
> **tailnet-only** (Tailscale `serve`); to expose publicly, switch the handler to `funnel`.
> If you use local-Gemma ASR or the GPU A/B baseline, the compose file already points
> `OLLAMA_URL` / `BASELINE_BASE_URL` at `host.docker.internal`.

## Quick start without Docker (mock mode, no keys)

Prefer Docker (above). To run directly on the host — handy for quick, key-less local dev —
with [Bun](https://bun.sh) ≥ 1.1:

```bash
bun install
cp .env.example .env          # works as-is in mock mode
bun run dev                   # server on :3001, web on :5173
```

Open <http://localhost:5173>, pick a scenario at the bottom (Q3 Sprint Planning / Growth
Review / Launch Page Jam). It streams the fixture transcript over the WebSocket, the router
fires, the summary updates, and the prototype agent fans out three designs onto the canvas —
pick one and watch the Design DNA lock in.

## Live shared room without Docker (host machine + Tailscale Funnel)

> Legacy host path — **Docker (above) is the default.** Use this only to run on the host
> directly without containers.

One participant hosts Sidebar on their own machine, captures their screen, and serves the
shared UI. Everyone else opens the same URL.

```bash
bun install
cp .env.example .env
bun run host                 # builds web and serves app + /ws on :3001
bun run funnel               # (other terminal) HTTPS Funnel :8443 -> local :3001
```

Open the Funnel HTTPS URL with `?host=1` on the host machine, then press **Live → Screen →
Mic**. Share the same URL (or a per-guest invite link) with viewers. `bun run funnel:off`
stops the public listener. Set `HOST_PASSCODE` before exposing the server publicly.

## Going live (real inference)

```bash
# .env
AGENTS=live
CEREBRAS_API_KEY=sk-...                       # PAYG tier recommended (see spec §6)
CEREBRAS_BASE_URL=https://api.cerebras.ai     # NOTE: no /v1 — the client appends it
MODEL_ID=gemma-4-31b

FACTCHECK_SEARCH=tavily                        # ground verdicts on web search
TAVILY_API_KEY=tvly-...                        # free tier: 1,000 searches/mo

# Honest A/B GPU baseline (race Cerebras vs a GPU host, side by side)
BASELINE_PROVIDER=ollama                       # or openai (Together / Fireworks / vLLM)
BASELINE_BASE_URL=http://localhost:11434
BASELINE_MODEL_ID=gemma4:31b-it-qat
```

In `live` mode the router/summarizer/fact-check use `generateStructured` (strict Zod → JSON
Schema via `fromZod`) and the prototype agent streams real HTML tokens via `chatStream`.
Everything else — transcript source, canvas, learned-style loop, recap — is identical to mock
mode. `assertLiveReady()` warns (doesn't throw) if a needed key is missing.

## Runtime modes

| Env | Values | Meaning |
|---|---|---|
| `AGENTS` | `mock` \| `live` | `mock` replays fixture gold labels (no key); `live` calls Cerebras |
| `SOURCE` | `fixtures` \| `asr` | fixture transcript stream, or live browser/on-device ASR |
| `FIXTURE_SCENARIO` | id | default scenario (`sprint-planning`, `growth-review`, `launch-page`) |
| `FACTCHECK_SEARCH` | `tavily` \| `none` | ground fact-checks on Tavily, or let the model self-report |
| `HOST_PASSCODE` | string | gates the WS/ASR/upload endpoints; empty = open. `MEETING_PASSWORD` is an alias |

## ASR benches

Two committed audio-fixture sets (16 kHz mono WAV, generated once and committed — the bench
never calls the network). `fixtures/audio/` is clean TTS of `test-transcripts.json`;
`fixtures/meetings/` is naturalistic, multilingual (EN/PT-BR), overlapping meetings with true
cross-talk. See `fixtures/meetings/README.md`.

```bash
bun run asr:bench            # WER of local Gemma ASR vs the clean fixtures (needs Ollama)
bun run meetings:bench       # WER on the realism set; --backend both -> Gemma vs ElevenLabs Scribe
bun run asr:livesim          # simulate the live on-device path: energy-VAD over meeting.wav -> Gemma
```

## WebSocket protocol

Discriminated union on `type` (see `packages/shared/src/events.ts`). Add an event by
extending `ServerEvent`/`ClientEvent` and handling it in both the room (emit) and the `ws.ts`
reducer (consume) — the compiler flags missing arms.

**Server → client:** `meeting.start`, `transcript.partial|final`, `capture.status`,
`router.decision`, `summary.update`, `fanout.start`, `prototype.start|token|complete`,
`fanout.resolved`, `dna.update`, `factcheck.result`, `telemetry`, `mode.changed`,
`agents.changed`, `meeting.end`, `meeting.over`, `meeting.clear`, `finaldoc.start|token|complete`,
presence (`presence.snapshot|join|update|leave|cursor|ping`, `kicked`), context
(`context.snapshot|item|updated`), and `invite.list`.

**Client → server:** `start`, `live.start|stop`, `transcript.partial|final`, `screen.frame`,
`capture.status`, `pick` (learn this design language), `resetTaste`, `setAbMode`, `setAgent`,
`presence.hello|cursor|ping`, `host.kick`, `context.accept|reject|clear`, `meeting.clear|end`,
`invite.create|revoke`.

## Architecture notes

- **Mock / live duality (central pattern).** Every agent has two paths selected by
  `config.agents`. `mock` replays the gold-label `expect` blocks in `test-transcripts.json`
  and streams a pre-built themed HTML doc chunked over time to fake token streaming; `live`
  does real Cerebras inference. When adding agent behavior, implement **both** and keep the
  fixture `expect` shape in sync with the Zod schemas.
- **Session → Room → Orchestrator.** `Bun.serve` gives each socket a thin `Session`
  (`session.ts`) that forwards to one shared in-memory `Room` (`room.ts`, implements
  `MeetingRuntime`). The room owns presence, invites, file context, the learned Design DNA,
  and one `Orchestrator` (`orchestrator.ts`) that drives the meeting and the agents. No DB.
- **The fan-out → pick → learn loop.** The first prototype build fans out 3 themes in
  parallel, awaits the user's `pick` (or 4.2s timeout → recommended), then `learn(chosen)`
  locks the Design DNA. Later builds are single-shot in the learned theme (and race the GPU
  baseline when A/B is on).
- **Cancellation.** The orchestrator guards every `await` with `if (my !== this.runId)
  return`; `runId` bumps on a new `start()`/`startLive()`/`clear()`/`stop()`, so in-flight
  async work from a stale run self-cancels. Preserve this when adding awaits.
- **`bun run typecheck` is the only automated check** — there is no test runner and no
  linter. Run it before claiming a change is done. `CEREBRAS_BASE_URL` / `BASELINE_BASE_URL`
  must **not** include `/v1` (the client appends it). All env config is centralized in
  `apps/server/src/config.ts`.

## Scripts

| Command | Does |
|---|---|
| `bun run dev` | server + web together (concurrently) |
| `bun run dev:server` / `dev:web` | just the Bun WS server / just the Vite app |
| `bun run host` | build the web app and serve app + `/ws` from Bun on `:3001` |
| `bun run funnel` / `funnel:off` | publish / stop a Tailscale Funnel `:8443 → :3001` |
| `bun run typecheck` | `tsc --noEmit` across shared + server + web — **the check gate** |
| `bun run build` | production web build |
| `bun run asr:gen` / `meetings:gen` | (re)generate the audio fixture sets (needs an ElevenLabs TTS key) |
| `bun run asr:bench` / `meetings:bench` | WER benches against the committed fixtures |
| `bun run asr:livesim` | simulate the live on-device VAD → Gemma path |

## Roadmap

- **Deepgram** as a managed `SOURCE=asr` backend (the scaffold exists; on-device + ElevenLabs
  are the shipped paths today).
- Screen-capture polish: frame dedup (perceptual hash), preview, user-visible privacy state.
- Prompt caching + an explicit token-bucket rate budget in the orchestrator.
- Prototype **remix** — click a past artifact, speak a change, regenerate.
- CRM / Slack export of the recap and action items.

## License

&copy; 2026 Igor Lins e Silva &amp; Dominique Deschatre. **All rights reserved.**
This repository is **source-available for evaluation, not open source** — see
[LICENSE](LICENSE). No use, modification, or redistribution without written
permission; an open license may follow later. We're not taking external PRs for
now (see [CONTRIBUTING.md](CONTRIBUTING.md)).

---

`sidebar-build-spec.md` is the design source of truth — agent prompts (`prompts.ts`) and
schemas (`schemas.ts`) are copied verbatim from its §4 and the WS protocol from its §7.
Reconcile changes against it. See [`docs/positioning.md`](docs/positioning.md) for how Sidebar
differs from the 2026 AI-meeting landscape — notetakers, live-assist copilots, and platform AI.
</content>
</invoke>
