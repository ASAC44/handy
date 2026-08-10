# Handy + DataHub: one-hour implementation plan

Last updated: August 10, 2026

Status: reviewed by the saved code-reviewer, QA expert, and consistency auditor. This is
the only technical source of truth. The product direction remains in
[the project handoff](./datahub-project-handoff.md).

## The deadline rule

We have one hour. Build the complete hackathon story, not production infrastructure.

Every task must directly prove one of these claims:

1. DataHub knowledge follows the live conversation into one shared context.
2. That context changes what Handy's agents and prototype produce.
3. Accepted files enter DataHub memory.
4. Meeting knowledge returns to DataHub and is recalled later.
5. If the closed loop is stable, real lineage warns about one proposed change.

Anything else waits. This is not permission to fake the loop: every DataHub read, write,
schema field, source URN, and lineage result shown in the demo must be real.

## Final product behavior

```text
conversation + accepted file
             ↓
     one DataHub lookup
             ↓
   one frozen context string
             ↓
router / summary / fact check / prototype / critic / next steps / recap
             ↓
   End Meeting saves Summary
             ↓
next meeting retrieves the decision from DataHub
```

The prototype is the visible hero. It must use one unmistakable rule from the dropped
file plus real DataHub field names or definitions. Its example values remain synthetic.

The Fact & Safety panel uses the same company context for company claims. The lineage
safety moment is attempted after the read -> build -> write -> recall loop works.

## The Ponytail cut

The previous plan created nine DataHub modules, a new router contract, caches, revisions,
fixtures, Docker packaging, a broad file parser, and a large test matrix. None is needed
to prove the product.

Handy already has the key abstraction: `runtime.contextSummary()`. Router, summarizer,
prototype, critic, next steps, and recap already receive it. We extend that existing path
instead of adding a parallel agent architecture.

Create only one new application file:

```text
apps/server/src/datahub.ts       NEW: MCP client + current context + save + lineage
```

Modify only the existing files needed to wire and show it:

```text
apps/server/src/config.ts
apps/server/src/context.ts
apps/server/src/runtime.ts
apps/server/src/room.ts
apps/server/src/orchestrator.ts
apps/server/src/agents/factcheck.ts
packages/shared/src/schemas.ts   only if the safety result needs a distinct shape
packages/shared/src/events.ts
packages/shared/src/prompts.ts
apps/web/src/ws.ts
apps/web/src/App.tsx or the existing status area
apps/web/src/components/ContextStrip.tsx
apps/web/src/components/Rail.tsx
apps/web/src/components/Canvas.tsx
apps/web/src/components/RecapView.tsx
apps/server/package.json
.env.example
```

Do not modify a listed file unless the working flow actually needs it.

## Before app code: prove the real DataHub contract

The DataHub UI, GMS, and MCP endpoints were not reachable during the QA check. This is the
first blocker, so do it before editing Handy.

Run DataHub Core and the official MCP server, then use the real MCP tool list to record the
exact input and output shapes. Verify only:

1. `search` finds the chosen showcase dataset.
2. `search_documents` works.
3. `save_document` saves one temporary Markdown document.
4. A later document search finds that saved text.
5. `list_schema_fields` returns fields for the chosen dataset.
6. `get_lineage` returns a known downstream asset for one preselected change.

Do not build a generic response normalizer before seeing these responses. Parse only the
real shapes needed by the demo.

Demo runtime is `AGENTS=live`. Current mock prototypes are hard-coded and ignore context;
pretending a mocked MCP response grounds them would not prove the product.

## One new server object

`apps/server/src/datahub.ts` owns the entire DataHub integration for this sprint.

Minimal state:

```ts
type CompanySource = { urn: string; title: string };

type CompanyContext = {
  prompt: string;
  sources: CompanySource[];
};
```

Minimal public behavior:

```ts
class DataHubMemory {
  status(): "connected" | "unavailable";
  refresh(query: string): Promise<CompanyContext>;
  saveFile(input: { title: string; content: string; meetingId: string }): Promise<CompanySource>;
  saveMeeting(input: MeetingMemory): Promise<CompanySource>;
  impact(query: string): Promise<ImpactResult>;
}
```

Implementation rules:

- Use the official TypeScript MCP SDK and Streamable HTTP transport.
- Keep the DataHub token in the MCP process, never the browser.
- Call only the tools verified by the contract smoke.
- For `refresh`, call catalog search and document search, then fetch schema only for the
  selected demo dataset.
- Turn results into one bounded plain-text prompt plus source title/URN pairs.
- If a read fails, return the last successful context or an empty context so the meeting
  can continue. Do not build retries, generations, or a cache system.
- Do not retry writes automatically.

## Exact read path

Do not change `RouterDecisionSchema`.

The old plan added required router fields, which would force changes to fixtures,
heuristics, fallback decisions, UI types, and structured output. Instead:

1. A final transcript segment enters `Orchestrator.playSegment()`.
2. Build a short query from the current summary topic and the latest segment.
3. Refresh once when the existing decision shows a topic shift, prototype, or fact check.
   A first lookup may run before routing so the router can learn company terms.
4. Store the returned `CompanyContext` in one local variable for that turn.
5. Combine its prompt with accepted local file context once.
6. Pass that exact frozen string to every agent acting on that turn.

The important rule is not “every agent calls DataHub.” It is the opposite: DataHub is
called once, then all agents share the result.

### Delayed prototype work

Critic and next-step calls may happen after the conversation has moved. Store the frozen
context and sources on `BuiltArtifact` when the prototype starts. Critic, evolution, next
steps, render repair, and recap must use the artifact's stored context, not a later call to
`runtime.contextSummary()`.

This small field is the whole snapshot mechanism. Do not add context revisions or a
snapshot registry.

### Fact checking

`factcheckLive()` currently receives only public web evidence. Add the frozen company
context as an argument.

- Public-world claim: keep Tavily behavior.
- Company definition/schema/policy claim: let DataHub context settle it.
- Current live company number: remain unverified because metadata is not warehouse rows.
- Mixed claim: show both evidence origins if available.

The UI label becomes **Fact & Safety**, but fact verdicts keep the existing schema unless
a real need appears.

## Exact file-memory path

Use one Markdown file in the demo. That is a deliberate sprint ceiling, not a claim of
general file ingestion.

`ContextStore.upload()` already has the complete bytes. For readable text files:

1. Decode and retain the full text, not only the 3,200-byte prompt preview.
2. Expose `acceptedText(id)` for accepted items.
3. Save one DataHub Context Document containing the complete text, title, meeting ID, and
   source note.
4. Refresh shared context after saving so the current meeting can use it.

There are two acceptance paths and both must call the same helper:

- host upload: already accepted inside `uploadContext()`;
- guest upload: becomes accepted later inside `acceptContext()`.

The existing accept action is consent. Do not add another toggle or approval screen.

Skipped for this hour: PDF/OCR, binary extraction, chunking, every extension, secret
scanning, huge-file behavior, and a file-format framework. The public demo uses synthetic,
non-sensitive Markdown.

## Exact meeting-memory path

Do not scrape generated recap HTML. The structured summary already exists inside
`Orchestrator`.

Add one small `meetingMemory()` getter or one runtime callback carrying:

- meeting title;
- TL;DR;
- decisions;
- action items;
- open questions;
- prototype titles/intents;
- DataHub sources used.

When `finaldoc.complete` settles:

1. Deterministically format that object as Markdown.
2. Call `save_document` once with document type `Summary`.
3. Emit a saved event with returned title and URN.
4. Show `Saved to DataHub` in the recap.

End Meeting is the commit action. There is no second approval UI in this sprint.

To prove recall, clear the local meeting and file context, start a new meeting, discuss the
same topic, and retrieve the saved Summary via `search_documents`. The remembered unique
decision must appear without the original file remaining in local context.

## Exact safety path

Safety is valuable, but it must not endanger the closed loop.

After file save, shared read, grounded prototype, meeting save, and recall work:

1. Detect the scripted change phrase with a small server-side pattern such as remove,
   rename, replace, expose, or change plus a known asset/field.
2. Resolve the preselected real asset/field from the current DataHub sources.
3. Call real `get_lineage` downstream.
4. Display the named dependent asset(s).
5. Say **known impact found** when dependencies exist, or **low known impact** when none
   are returned. Never say guaranteed safe.

No separate safety LLM, general policy engine, multi-hop graph UI, or approval workflow.
One honest lineage-backed warning is enough.

## Minimal browser proof

Reuse existing surfaces. Do not build a DataHub browser.

Show only:

1. Small `DataHub connected` / `unavailable` status.
2. File item state: `saving` then `saved`.
3. One activity item when shared company context changes, with source titles.
4. Prototype badge: `Grounded by DataHub · N sources · synthetic values`.
5. Existing Fact-check panel renamed `Fact & Safety`, with a lineage warning if added.
6. Recap state: `Saved to DataHub`, linked by returned URN if the verified response makes
   a reliable URL possible.

The actual generated HTML must contain the unique file rule and real schema names. A badge
without changed output proves nothing.

## Configuration

Add only:

```text
DATAHUB_ENABLED=true
DATAHUB_MCP_URL=http://localhost:8000/mcp
DATAHUB_FRONTEND_URL=http://localhost:9002
```

The MCP process separately receives its DataHub GMS URL, token, and mutation-enabled flag.
Do not put those secrets into browser events.

Run the installed MCP process directly for the demo. Dockerfile and Compose packaging wait
until the product loop works.

## Build order with stop gates

### 0. Real contract

- Start Core and MCP.
- Verify search, document save/search, schema, and the chosen lineage.
- Pick exact demo dataset, field, and downstream asset from the results.

Stop if this is not real. App UI cannot repair a broken contract.

### 1. Shared read context

- Add SDK dependency and `datahub.ts`.
- Wire config and runtime.
- Refresh once and freeze one context per turn.
- Pass it to live router, summary, fact check, prototype, critic, and next steps.
- Store it on built artifacts for delayed work.

Stop when a live prototype visibly uses real DataHub schema/definitions.

### 2. File write

- Retain full Markdown text.
- Hook both host-upload and guest-accept paths.
- Save it, show saved state, and refresh context.

Stop when the unique file token appears in DataHub and in a live prototype.

### 3. Meeting write and recall

- Expose structured meeting memory.
- Save one Summary on End Meeting.
- Clear local state and retrieve it in a fresh meeting.

Stop when the remembered unique decision returns from DataHub.

### 4. Tiny UI proof

- Status, activity, saved states, prototype source badge, recap link.
- No new pages, browsers, graphs, or settings.

### 5. Lineage safety

- Add the single scripted impact check only if steps 0-4 are stable.

### 6. Verify and record

- `bun run typecheck`.
- `bun run build`.
- Run the complete browser journey once.
- Record the demo while the exact dataset and lineage are known-good.

## Deterministic demo script

Use one synthetic `brief.md` with a unique rule that cannot come from model memory, for
example:

> Name the workspace “Fulfillment Pulse.” Never display customer email. The final status
> label must be “Ready for Dispatch — FP-731.”

Then:

1. Drop the file; show it saved in Handy and DataHub.
2. Say: “Build a Fulfillment Pulse order operations dashboard using our company data.”
3. Show `FP-731`, real DataHub schema fields, no customer email, synthetic values, and
   source titles in the prototype.
4. If lineage is stable, say the pretested field-removal phrase and show the named
   downstream asset.
5. End the meeting; show the Summary saved in DataHub.
6. Clear local meeting/file context and start fresh.
7. Ask to continue the dashboard using the previous decision; show DataHub recalling
   `FP-731`.

## Definition of done

The build is done when one recording proves:

- real DataHub search changed one shared context;
- the same frozen context reached all relevant live agents;
- the prototype visibly obeyed the file and catalog knowledge;
- the complete demo Markdown entered DataHub;
- End Meeting saved structured knowledge;
- a clean later meeting recalled it from DataHub;
- the UI named the DataHub sources;
- typecheck and build passed;
- optionally, real lineage produced the safety warning.

## Explicitly deferred

- router schema expansion;
- per-agent DataHub calls;
- nine-module DataHub architecture;
- cache, single-flight, revisions, stale-result rules, retry framework;
- broad normalization and fixture libraries;
- Docker/Compose MCP packaging;
- mock-mode DataHub claims;
- PDF/OCR/binary/general file ingestion;
- full secret scanner and large-file policy;
- multi-user and late-joiner DataHub synchronization;
- rich catalog or relationship UI;
- general safety/policy engine;
- warehouse row queries;
- Agent Registry, Actions, Analytics Agent, Skills contribution;
- exhaustive unit, failure, performance, cross-browser, and accessibility matrices;
- meeting-ID ownership refactor;
- separate write approval flow.

Add these only after the recorded closed loop works.

## Review findings that changed this plan

The saved reviewers were suggestions, not authorities. We accepted only findings that
directly protected the one-hour demo:

- mock prototypes ignore context, so use live mode;
- router schema expansion creates work without visible value;
- host and guest files take different acceptance paths;
- full file text is currently discarded;
- delayed prototype agents can read a different context unless it is stored on the
  artifact;
- fact checking currently has no company context input;
- the structured summary needs an explicit writeback handoff;
- the real MCP contract and chosen lineage must be verified first.

We rejected production-level requests for exhaustive edge cases, infrastructure, and test
coverage. Ponytail remains active during implementation: reuse the existing context route,
write the shortest correct diff, and leave one runnable real smoke check for the
non-trivial MCP logic.
