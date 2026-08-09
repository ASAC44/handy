# Sidebar vs AI Meeting Tools — Honest Positioning (2026)

## TL;DR

The AI meeting space in 2026 splits into clear categories:

- **Retrospective notetakers** (Fathom, tl;dv, etc.): bot or bot-free recording, excellent post-call transcripts, summaries, action items, clips, and CRM sync. The job-to-be-done is *"never take notes again"* and have perfect recall/distribution.
- **Live-assist copilots** (Fireflies Live Assist, Convo, some platform AI): real-time transcripts + suggestions, coaching, objection handling, or Q&A pulled from your knowledge base and past meetings. They help you *respond* in the moment.
- **Invisible personal notebooks** (Granola and similar): desktop audio capture with no bot visible to others; hybrid (you write rough notes, AI enhances); strong on presence and immediate post-meeting polish.
- **Platform natives** (Gemini in Google Meet, Zoom AI Companion, Teams Copilot): deep integration for summaries, in-meeting questions, and co-creation *inside* their respective platforms (see dedicated section below for Gemini details).

**Sidebar occupies a distinct lane**: a **real-time generative copilot** that *produces working artifacts while you speak*. It turns spoken ideas into interactive HTML prototypes in ~1.5 seconds, reads the shared screen with vision, performs live fact-checking, maintains a rolling structured summary, and learns your design preferences mid-meeting.

> Notetakers help you **remember** what was said. Live assistants help you **respond** better.  
> Sidebar helps the room **build and decide** while the idea is still hot.

No mainstream competitor ships runnable, themed UI/code prototypes from conversation + screen in near real time. That capability, enabled by sub-2s inference, defines the wedge.

## Comparison matrix (honest snapshot, mid-2026)

"Live" means very different things across tools. We distinguish:

- **Live transcript**: words appear as people speak (many have this now).
- **Live assist**: suggestions, coaching, Q&A from KB, or "what to say" prompts (Fireflies Live Assist, Convo).
- **Live generative artifacts**: new runnable output (prototypes, visuals, structured decisions) created and surfaced *during* the discussion.

| Capability                          | Fathom                          | Fireflies (w/ Live Assist)                  | Otter.ai                          | Granola                              | Convo (real-time copilot)             | **Sidebar** |
|-------------------------------------|---------------------------------|---------------------------------------------|-----------------------------------|--------------------------------------|---------------------------------------|-------------|
| **Core timing**                     | Post-call (fast summaries)     | Live transcript + assist + post            | Strong live transcript + post    | Invisible capture; notes ready post | Live suggestions + post automation   | **Live generative + rolling summary** |
| Transcription                       | ✅ mature (bot or bot-free)    | ✅ high accuracy, 100+ langs               | ✅ best-in-class live captions   | ✅ real-time (desktop)              | ✅ local capture                     | ✅ ElevenLabs + on-device Gemma      |
| Rolling / structured summary        | ✅ post-call                   | ✅ live notes + post detailed              | ✅ post + some live collab       | ✅ enhanced post (hybrid)           | ✅ post + context                    | ✅ **live**, structured (decisions/owners/Qs) |
| **Generates working artifacts from speech** | ❌                          | ❌ (notes, suggestions)                    | ❌                               | ❌ (notes only)                     | ❌ (reply suggestions)               | ✅ **HTML prototypes ~1.5s** (hero) |
| **Screen-aware / multimodal** ("build like *this*") | ❌                       | Limited (some OCR for context)            | Limited (OCR on shares)          | No vision                           | No                                  | ✅ **Gemma 4 reads shared screen**  |
| **Live fact-checking of claims**    | ❌                             | ❌ (some AskFred answers)                  | ❌                               | ❌                                  | Context from KB                     | ✅ grounded (Tavily/model)          |
| **Learns user taste / style**       | ❌                             | ❌                                         | ❌                               | ❌                                  | ❌                                  | ✅ Design DNA (pick once, applies)  |
| **Idea → visible runnable output speed** | n/a                        | n/a                                        | n/a                              | n/a                                 | n/a                                 | ✅ ~1.5s on Cerebras (**the cliff**) |
| On-device / private capture         | ✅ bot-free desktop            | Desktop app + bot options                  | Cloud + bot                      | ✅ best-in-class invisible desktop  | ✅ invisible desktop                 | ✅ fully local Gemma/Ollama option  |
| Recording & playback                | ✅ full                        | ✅                                         | ✅                               | Audio not stored long-term          | Local only (no shared recording)    | ❌ (by design)                      |
| CRM & workflow integrations         | ✅ mature (HubSpot, SF, etc.)  | ✅ very strong (50+ , 200+ AI skills)      | ✅ good                          | Limited (MCP to AI tools)           | ✅ strong (CRM, email, Zapier)       | ❌ not built yet                    |
| Platform bots / auto-join           | ✅ bot + bot-free              | ✅ bot + ext + desktop                     | ✅ OtterPilot                      | ❌ none (invisible desktop)         | ❌ none (invisible desktop)          | ❌ browser capture only             |
| Real-time "what to say" / coaching  | ❌                             | ✅ Live Assist (suggestions, coaching)     | Limited (live collab on transcript) | ❌ (enhances *your* notes)         | ✅ strong (objections, next steps)   | Partial (via prototype + summary)   |
| Maturity / production readiness     | Production                     | Production (Fortune 500)                   | Production                       | Production (strong indie following) | Production (focused verticals)       | Hackathon MVP                       |

**Sources for competitor claims**: public sites (fathom.ai, fireflies.ai, granola.ai, otter.ai, itsconvo.com), 2026 reviews and feature announcements. Sidebar from product + internal benchmarks. Features evolve quickly.

## Where each wins (honest)

- **Fathom** wins for individuals and small teams who want the simplest possible "set it and forget it" recall with a generous free tier, clean summaries, and decent CRM hooks. Bot-free mode reduces friction. It does not aim to change the meeting while it happens.

- **Fireflies** (especially with Live Assist) wins for teams that need both deep post-meeting intelligence (CRM, analytics, searchable archive, 200+ skills) *and* some real-time help (live notes, suggestions, Ask Fred answers, sales coaching). Closest of the mature tools to "live copilot," but the live layer is assistance and context retrieval, not creation of new artifacts.

- **Granola** wins when presence matters most. Invisible desktop capture means no one sees a bot; you stay focused and still get excellent personal notes + structure right after. Great if you hate bots and like hybrid (human + AI) notes. Feeds nicely into coding tools via MCP but does not generate UI or prototypes.

- **Otter.ai** remains strong for live shared transcription and in-call collaboration on the transcript itself (live captions, comments, highlights).

- **Convo** and similar dedicated real-time assistants (LiveSuggest, Hedy, etc.) win in high-stakes sales, recruiting, or consulting where having "the right thing to say next" or instant context from your history can directly move the outcome. Invisible, suggestion-focused.

- **Gemini in Google Meet** wins for teams that live entirely inside Google Workspace. It offers seamless native "Take notes for me" (structured Docs with decisions and actions) plus a strong private "Ask Gemini" advisor during calls, excellent translated captions, and zero setup friction. It is primarily a recall + personal assistance tool rather than a generative one.

- **Sidebar wins on generative temporal coupling:** the only tool whose primary output is *new runnable things* (prototypes, structured decisions) that appear fast enough for the room to react to them *while the idea is alive*. Screen vision + preference learning + fact-checking are additional live primitives that don't exist elsewhere in meeting tools today. If the job is *"turn talk into something we can see, click, and argue about right now,"* this is the category.

**Important reality check**: Sidebar currently lacks the distribution, integrations, recording, sales analytics, and production hardening of the mature players. It is earlier-stage. The bet is that the new capability (live idea→artifact) creates a different product, not that it replaces notetakers for recall use cases.

## Gemini in Google Meet

Gemini is Google's built-in AI for Google Meet and represents the strongest **platform-native** offering.

**Key capabilities:**
- **"Take notes for me"**: When enabled (by host or participant), it captures the meeting and generates a structured Google Doc post-call containing a summary, decisions (with statuses like Aligned / Needs further discussion in supported cases), action items / next steps, and details. Optional screenshots of presented content (slides, etc.) can be included for visual context. Notes land in Drive, get emailed, and attach to the Calendar event.
- **"Ask Gemini"** (personal in-meeting advisor): A sidebar (now easily accessible at bottom left on web) that lets individual participants ask for recaps of what was said, summaries of the ongoing discussion, key takeaways, decisions, and action items *during* the meeting. It uses live captions plus the user's accessible Google Workspace content (Docs, Gmail, Drive, etc.) and web search. Queries and answers are private to the user.
- Strong translated and live captions (60+ languages).
- Native, zero-friction experience with no external bot or third-party tool required. Also expanding to in-person meetings via the Meet mobile/desktop app ("Take notes for me" works without a video call).

**Honest limitations vs Sidebar:**
- Primarily focused on **recall and personal assistance**, not creation. It produces text notes and private answers — it does not turn spoken ideas into runnable, interactive HTML prototypes.
- No continuous vision model reading the shared screen to drive generative output ("build it like *this*").
- No session-level preference learning or "Design DNA".
- AI note-taking and Ask features support only ~8 languages (one at a time).
- Strictly tied to the Google Meet + Workspace ecosystem.
- "Live" features excel for individual catch-up and Q&A but do not surface shared, clickable artifacts fast enough for the whole room to react while the idea is still hot.

Gemini is an excellent default for teams that live inside Google Workspace and mainly need reliable documentation plus personal in-meeting help. It does not compete on the generative artifact + real-time creation axis that defines Sidebar.

## The wedge: the idea→artifact cliff

Most tools (even the new live-assist ones) optimize for **capture and retrieval**. They make it cheaper/faster/better to remember or to get a prompt while talking.

Sidebar optimizes for **creation inside the conversation**. Turning a spoken design idea, feature description, or UI direction into a clickable, themed, working prototype is a heavy token + rendering chain. At normal inference speeds the output arrives as a historical artifact — the discussion has moved on. At extreme low latency it can arrive **while the speaker is still explaining the idea**, so the room can point at it, critique it, iterate on it, or kill it in real time.

This temporal coupling is not something a notetaker or suggestion engine can easily add later. It requires both:
1. Vision + speech understanding in one loop (to "build it like the thing on screen").
2. Inference fast enough that the first tokens of a full interactive HTML doc land before the conversational moment expires.

No other meeting product in the 2026 landscape ships this.

### Latency reality (same Gemma 4 family, same prompt)

| Engine                          | Approx. tok/s | End-to-end idea → visible interactive prototype |
|---------------------------------|---------------|-------------------------------------------------|
| Cerebras `gemma-4-31b` (Sidebar) | ~1588        | **~1.5s**                                      |
| Local GPU `gemma4:31b` (Ollama) | ~50          | ~46s                                           |
| Local GPU `gemma4:12b`          | ~100         | ~16–17s                                        |

On the **identical 31B model**, local is ~30× slower for this workload. Dropping model size helps but still leaves a 10×+ gap. That gap is not incremental UX — it is the difference between "here's a prototype we can argue about now" and "here's something we'll look at after the meeting."

Even the fastest "live assist" tools today surface text suggestions or retrieved answers. They do not emit and render new interactive UI while the idea is live.

---

**Honest limitations (Sidebar side)**

- Early-stage / hackathon MVP. Less polished, fewer edge-case handles, less battle-tested transcription than 2026 production notetakers.
- Capture is currently browser-based (screen + audio). Mature competitors offer robust desktop apps + optional platform bots for broader frictionless coverage.
- No deep CRM, Slack automation, or post-meeting workflow distribution yet.
- Recording/playback and searchable archive are not priorities (different product).
- Live fact-checking grounding is improving but not yet at the level of dedicated web-search retrieval systems in some competitors' "Ask" features.
- Multi-language diarization and noisy-room performance lag the leaders today.

We are not claiming to be a better Fathom/Fireflies/Granola. We are claiming a different primitive that only becomes useful at extreme speed + multimodal generation.

*Competitor descriptions synthesized from public sites (fathom.ai, fireflies.ai, granola.ai, otter.ai, itsconvo.com), 2026 reviews/comparisons, and feature announcements (as of late June 2026). No mainstream meeting product was found that generates interactive prototypes or uses vision models to turn screen + speech directly into runnable UI during the call. Sidebar latency and behavior from project internals (`_abbench.ts` etc.). Market moves fast — re-verify before relying on any specific claim.*
