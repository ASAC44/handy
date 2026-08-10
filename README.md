<div align="center">
  <img src="apps/web/public/favicon.svg" alt="Handy logo" width="96" height="96" />
  <h1>Handy</h1>
  <p><strong>A shared AI workspace designed to bring DataHub company memory into live meetings.</strong></p>
  <p>
    Company definitions · schemas · lineage · ownership · quality signals · past decisions<br />
    One changing shared context for every agent in the room
  </p>
  <p>
    <a href="https://datahub.devpost.com/"><strong>Build with DataHub: The Agent Hackathon</strong></a>
  </p>
</div>

<!-- README-HACK:NEEDS-OWNER key="demo-video" instruction="Add the public YouTube or Vimeo demo video URL. The hackathon requires a demonstration under three minutes." -->

Most meeting agents work from the transcript alone. They do not know which metric definition
is official, which table owns a field, what depends on a proposed change, or why the company
made a previous decision. Handy is designed to use
[DataHub Agent Context](https://docs.datahub.com/docs/dev-guides/agent-context/agent-context)
as the connected company memory behind the room.

As the topic changes, Handy focuses that memory into a small **shared meeting context**.
Every agent reads the same definitions, data relationships, rules, and history alongside
the live conversation, accepted files, and screen context. The room can then produce
grounded summaries, checked claims, runnable prototypes, and a durable recap without each
agent inventing company meaning independently.

> **Status: hackathon MVP.** The shared room, reviewed file context, routed agents, live
> prototypes, fact-checks, recaps, and export package run end to end. DataHub retrieval,
> lineage-aware impact analysis, and structured knowledge write-back are the planned
> hackathon integration; the repository does not connect to DataHub yet. That connection
> must ship before this project meets the hackathon's DataHub-use requirement.

## Built for “Agents That Do Real Work”

The challenge asks agents to read DataHub, understand what is connected, take useful
action, and write results back so the next person or agent inherits the knowledge. Handy
applies that loop to live meetings:

- **Read:** use the DataHub Agent Context Kit to retrieve the schemas, lineage, ownership,
  governance signals, documents, and decisions relevant to the current topic.
- **Act:** give every Handy agent the same focused context so the room can check a claim,
  assess downstream impact, create a prototype, or record a decision without inventing
  company meaning.
- **Write back:** return structured decisions, changed definitions, findings, prototype
  context, and unresolved questions to DataHub—not the raw meeting transcript.

The secondary Open / Wildcard angle is **live organizational knowledge capture**: DataHub
is not only queried by an agent; its context graph becomes the shared memory for a
multiplayer agent workspace and improves with the useful outcomes of each meeting.

DataHub already connects business definitions, schemas, lineage, ownership, quality
signals, documents, and systems. Handy turns the subset relevant to the current discussion
into live working context, then returns useful decisions and findings to that memory after
the meeting.

![How DataHub company memory and live meeting signals become one shared context for every Handy agent](apps/web/public/graphs/handy-live-context-loop.svg)

Dashed edges and dashed-outline nodes mark the planned DataHub-backed context and
write-back path. The implemented meeting signals, router, agents, and live artifacts are
shown as solid nodes.

### Use cases

- **Build live dashboards:** describe what you need and Handy creates an interactive
  dashboard using the right company data.
- **Review data changes:** see what a metric or schema means, who owns it, and what depends
  on it before making a change.
- **Solve data issues:** bring the issue, affected data, and responsible people into the
  same meeting.
- **Remember decisions:** save decisions, action items, and open questions so the team does
  not lose context after the meeting.

### The shared context loop

1. **Listen.** Conversation, accepted files, screen context, and new decisions reveal what
   the room needs.
2. **Retrieve (planned).** DataHub supplies the relevant company knowledge and
   relationships.
3. **Focus (planned).** Handy keeps one changing DataHub-backed context containing only the
   definitions, sources, rules, owners, and history that matter now.
4. **Create.** Every agent uses that same context to produce checks, summaries, prototypes,
   decisions, and the recap.
5. **Remember (planned).** Structured outcomes flow back into DataHub instead of
   disappearing into a transcript archive.

### What grounding changes

If the room asks for a customer-retention dashboard, DataHub could provide the official
active-customer definition, approved source tables, related dashboards and lineage, data
owners, quality signals, earlier retention decisions, and sensitive-field constraints.
Handy can use that context to build with company terminology, follow the correct data
relationships, shape realistic sample values, and exclude private customer fields.

The planned **Fact and Safety Checker** uses the same relationship map before the room acts.
For example, changing “Active Customer” from 90 days to 60 days could surface affected
dashboards, reports, models, owners, and a conflicting prior decision while the proposal is
still being discussed.

The intended judge demo uses DataHub's official
[`showcase-ecommerce` datapack](https://datahub.devpost.com/resources), whose cross-platform
graph spans datasets, dashboards, dbt, governance, glossary terms, and lineage. It gives
the meeting a realistic company context without requiring private data.

## The live room

Handy is multiplayer. There is one in-memory **room** per server; every connection is a
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
  prototypes built) and streams it to everyone on the same link. Every generated artifact
  is also saved under the host export folder and exposed as download links for participants
  on the final recap screen.
- **Draggable, dockable, resizable panels** over an infinite canvas, with a Paper / Ink
  (light / dark) editorial theme.

## Layout

Bun-workspace monorepo, three packages. `packages/shared` is the contract the other two
compile against.

```
.
├─ packages/shared/   @handy/shared — WS event protocol (events.ts), Zod schemas +
│                     inferred types (schemas.ts), agent prompts (prompts.ts), design
│                     languages + mock builders (themes.ts) + DESIGN.md serializer (designmd.ts)
├─ apps/server/       Bun.serve WebSocket (/ws) + static host + a shared Room that owns
│                     the Orchestrator and the four agents (router/summarizer/prototype/
│                     factcheck) + the closing finaldoc agent
├─ apps/web/          Vite + React. One useReducer (ws.ts) holds all client state, driven
│                     purely by the inbound WS stream; per-participant capture + ASR
├─ fixtures/          committed 16 kHz audio sets for the ASR benches (audio/, meetings/)
├─ scripts/          asr/meeting fixture generation + WER benches + live-sim
├─ test-transcripts.json   stable meeting fixtures (gold-label `expect` blocks)
├─ handy-build-spec.md   design source of truth (prompts + schemas + protocol)
├─ docs/index.html         self-contained landing page — the GitHub Pages site (served from docs/)
└─ docs/positioning.md     Handy vs the 2026 AI-meeting landscape + the honest A/B
```

## Run it (Docker is the default)

Handy runs in **Docker with a Tailscale sidecar**, so the app comes up as its own
**isolated node on your tailnet** (e.g. `https://handy.tail1234.ts.net`) — no host-level
funnel, and the whole thing tears down with one command. The Bun server serves the web app,
`/ws`, and the API on a single port, so one `tailscale serve` carries everything.

```bash
cp .env.example .env
# In .env:
#  - AGENTS=mock works with no keys; set AGENTS=live + CEREBRAS_API_KEY for real inference
#  - add a Tailscale auth key for the sidecar (ephemeral + reusable):
#      https://login.tailscale.com/admin/settings/keys
#    TS_AUTHKEY=tskey-auth-...
#    TS_HOSTNAME=handy        # -> https://handy.<your-tailnet>.ts.net (tailnet only)

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
fires, the summary updates, and the prototype agent fans out four designs onto the canvas —
pick one and watch the Design DNA lock in (then **view / download** its Google `DESIGN.md`
from the DNA panel).

## Add DataHub company memory

Handy talks to DataHub through a small MCP server. Think of the three running pieces like
this:

```text
DataHub Core (:8080 metadata, :9002 UI)
              ↓
official DataHub MCP server (:8000 agent tools)
              ↓
Handy (:3001 server, :5173 dev UI)
```

1. Start DataHub Core. This starts the local catalog and UI; it does not start Handy or
   the MCP bridge.

   ```bash
   datahub docker quickstart --version v1.6.0
   ```

2. Start the official MCP server in another terminal. It translates Handy's simple tool
   calls into authenticated DataHub API calls. Use a DataHub access token; do not put that
   token in Handy or the browser.

   ```bash
   export DATAHUB_GMS_URL=http://127.0.0.1:8080
   export DATAHUB_GMS_TOKEN='<your DataHub access token>'
   export TOOLS_IS_MUTATION_ENABLED=true
   export SAVE_DOCUMENT_PARENT_TITLE='Handy Memory'
   export FASTMCP_HOST=127.0.0.1
   export FASTMCP_PORT=8000
   uvx mcp-server-datahub@0.6.0 --transport http
   ```

   Mutation mode is required because Handy saves accepted files and meeting summaries.
   Handy does not use the other metadata-editing tools.

3. Enable the bridge in Handy's `.env`:

   ```bash
   DATAHUB_ENABLED=true
   DATAHUB_MCP_URL=http://127.0.0.1:8000/mcp
   DATAHUB_FRONTEND_URL=http://localhost:9002
   ```

4. Test the contract before starting a demo:

   ```bash
   bun run datahub:smoke
   DATAHUB_SMOKE_WRITE=1 bun run datahub:smoke
   ```

   The first command proves catalog search, schema reading, and lineage reading. The second
   also saves a disposable document and waits up to ten seconds for search indexing. In our
   local test the document became searchable after about 2.5 seconds. Handy adds new memory
   to the current meeting immediately, so that indexing delay matters only to later search.

Then run Handy normally with `bun run dev`. Use `AGENTS=live` for the real demo: mock
prototype HTML is intentionally fixed and cannot visibly prove that DataHub context changed
the generated prototype.

## Live shared room without Docker (host machine + Tailscale Funnel)

> Legacy host path — **Docker (above) is the default.** Use this only to run on the host
> directly without containers.

One participant hosts Handy on their own machine, captures their screen, and serves the
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

## Runtime modes

| Env | Values | Meaning |
|---|---|---|
| `AGENTS` | `mock` \| `live` | `mock` replays fixture gold labels (no key); `live` calls Cerebras |
| `SOURCE` | `fixtures` \| `asr` | fixture transcript stream, or live browser/on-device ASR |
| `FIXTURE_SCENARIO` | id | default scenario (`sprint-planning`, `growth-review`, `launch-page`) |
| `FACTCHECK_SEARCH` | `tavily` \| `none` | ground fact-checks on Tavily, or let the model self-report |
| `HOST_PASSCODE` | string | gates the WS/ASR/upload endpoints; empty = open. `MEETING_PASSWORD` is an alias |
| `EXPORTS_DIR` | path | host-visible folder for saved meeting artifacts (`./exports` by default; Docker mounts it to `/app/exports`) |

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
(`context.snapshot|item|updated`), exports (`export.snapshot`), and `invite.list`.

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
- **The fan-out → pick → learn loop.** The first prototype build fans out 4 themes in
  parallel, awaits the user's `pick` (or 4.2s timeout → recommended), then `learn(chosen)`
  locks the Design DNA. Later builds are single-shot in the learned theme (and race the GPU
  baseline when A/B is on). The learned DNA is serialized to a Google `DESIGN.md`
  (`packages/shared/src/designmd.ts`) for prompt injection, the DNA-panel download, and the
  recap appendix — `ThemeTokens` stays the internal source of truth.
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

- **Hackathon-critical:** implement relevant-context retrieval, structured meeting
  write-back, and lineage-aware impact analysis through DataHub Agent Context.
- **Deepgram** as a managed `SOURCE=asr` backend (the scaffold exists; on-device + ElevenLabs
  are the shipped paths today).
- Screen-capture polish: frame dedup (perceptual hash), preview, user-visible privacy state.
- Prompt caching + an explicit token-bucket rate budget in the orchestrator.
- Prototype **remix** — click a past artifact, speak a change, regenerate.
- CRM / Slack export of the recap and action items.

## License

Licensed under the [Apache License 2.0](LICENSE).

---
