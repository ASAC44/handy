# Handy + DataHub: earlier winning plan

> This is an earlier, fact-check-first implementation plan. It contains useful technical
> research, but its product framing and some UI choices are no longer current. Read
> [the complete project handoff](./datahub-project-handoff.md) as the source of truth.

Research date: August 10, 2026

## Verdict

The abstract idea is promising but not yet a winning product description.

“Add memory, improve fact-checking, and make prototypes realistic” sounds like three
separate features. The stronger product is one closed loop:

> Handy turns live discussion into governed data decisions. It reads DataHub before an
> agent acts, shows the evidence used, generates a safe grounded artifact, then saves the
> human-approved decision back to DataHub for the next meeting.

This can be a serious Open / Wildcard contender. It cannot be called likely to win until
the full read, act, write, and recall loop works on camera.

## Why the loop fits the judging criteria

| Criterion | Current abstract idea | Sharpened implementation |
|---|---|---|
| Use of DataHub | Metadata may look like extra prompt text | MCP search, documents, schemas, lineage, trust signals, and approved `save_document` writeback |
| Technical execution | Existing Handy app is strong, integration absent | One retrieval result shared across agents, typed evidence, timeouts, cache, graceful fallback, end-to-end fixture |
| Originality | “Agent with memory” is common | Company-data mistakes are caught during a live meeting before they enter a prototype or decision |
| Real-world usefulness | Broad and hard to evaluate | Prevents incorrect metrics, wrong tables, unsafe fields, and lost decisions |
| Submission quality | Existing UI and demo quality are strong | A single three-minute story with visible before/after evidence |

The hackathon explicitly says strong entries use DataHub meaningfully and contribute back
to the graph where appropriate. The writeback and next-meeting recall are therefore core,
not optional decoration.

## Product name and claim

Working feature name: **Handy Grounded Decisions**.

One-line claim:

> The live meeting agent that checks company data meaning before building, and remembers
> approved decisions where every future human and agent can find them.

Do not call DataHub a general chat memory database. Here it is a governed company-knowledge
memory. Raw transcripts and temporary conversational details stay in Handy.

## The exact demo

Use the official `showcase-ecommerce` datapack already loaded locally.

### Meeting dialogue

1. A participant says: “Use `orders.order_total` as net revenue, include customer emails,
   and build a revenue dashboard.”
2. Handy searches DataHub through the MCP server.
3. A DataHub evidence card appears before the prototype:
   - `order_total` is GMV, not net revenue;
   - net revenue must use item price and quantity, excluding returned items;
   - cancelled and on-hold orders must be excluded;
   - customer email is classified as personal information;
   - `analytics.order_details` is the recommended dashboard source.
4. The fact-check is marked contradicted, with the exact DataHub documents and assets.
5. The prototype still appears quickly, but it is corrected:
   - title says Net Revenue;
   - fields match `order_details`;
   - customer email is absent;
   - rows are clearly labelled synthetic;
   - a small “Grounded by DataHub” evidence section lists the sources and rules used.
6. At meeting end, Handy drafts a Decision document:
   - use `order_details` for the revenue dashboard;
   - define net revenue using non-returned item value;
   - exclude cancelled and on-hold orders;
   - do not expose customer personal information.
7. The host sees the exact draft and clicks **Approve and save to DataHub**.
8. DataHub shows the new Decision document linked to the orders, order-items,
   order-details, and customers assets.
9. A fresh meeting asks about the revenue dashboard. Handy retrieves the saved decision.

The last two steps prove that this is a knowledge loop rather than retrieval decoration.

## What DataHub proves and what it does not

DataHub can support claims about:

- official metric definitions;
- whether a table or column exists;
- data types and allowed categories;
- which source is recommended;
- owners, tags, glossary terms, and personal-data classification;
- lineage and downstream impact;
- quality failures, incidents, freshness, and old query patterns when available.

DataHub alone cannot prove a live numeric claim such as “revenue today is $4.2 million.”
That requires a separate read-only warehouse query. The hackathon MVP should mark live
value claims unverified instead of pretending metadata contains current business rows.

Tavily remains useful for public-world claims. DataHub handles company-world claims.

## Architecture

```text
meeting transcript
       |
       v
Handy router ---- company-data work? ---- no ---> existing agents
       |
      yes
       v
DataHub grounding agent
       |
       +--> search / search_documents
       +--> get_entities / list_schema_fields
       +--> get_lineage / get_dataset_queries when useful
       |
       v
one typed EvidenceBundle
       |
       +--> fact-check agent
       +--> prototype agent
       +--> critic agent
       +--> final decision draft
                         |
                   human approval
                         |
                         v
                 save_document
                         |
                         v
                 next meeting recall
```

One retrieval should feed all downstream agents. Do not let each agent search DataHub
independently. That would add latency, cost, and conflicting context.

## Running the MCP layer

DataHub Core and the MCP server are two processes:

1. DataHub GMS stores and serves metadata on port 8080.
2. The official `mcp-server-datahub` process connects to GMS using a DataHub access token
   and exposes agent tools.

The MCP server supports HTTP transport. Run it as a local sidecar with:

- `DATAHUB_GMS_URL=http://host.docker.internal:8080`;
- `DATAHUB_GMS_TOKEN=<service-account-or-personal-token>`;
- `TOOLS_IS_MUTATION_ENABLED=true`;
- `SAVE_DOCUMENT_PARENT_TITLE=Handy Decisions`;
- `FASTMCP_HOST=0.0.0.0`;
- `FASTMCP_PORT=8000`;
- command `mcp-server-datahub --transport http`.

Handy connects to `http://localhost:8000/mcp` when both services share the same Docker
network namespace. Pin the tested MCP package version in the submitted project.

The MCP sidecar must not be publicly exposed. Only Handy should reach it. The DataHub token
must stay server-side.

## Server implementation

### 1. MCP client

Add the official TypeScript MCP SDK to `apps/server` and create
`apps/server/src/datahub/client.ts`.

Responsibilities:

- connect lazily using streamable HTTP;
- list tools once at startup and verify required tools exist;
- allow only the tools Handy uses;
- apply an 8-second timeout;
- retry connection once, never repeat a write automatically;
- parse tool text into typed values;
- expose health as connected, degraded, or disabled;
- close cleanly when the server stops.

Configuration:

```text
DATAHUB_ENABLED=true
DATAHUB_MCP_URL=http://localhost:8000/mcp
DATAHUB_FRONTEND_URL=http://localhost:9002
```

The DataHub token belongs to the MCP sidecar, not Handy's browser or WebSocket messages.

### 2. Typed evidence

Add shared schemas similar to:

```ts
type EvidenceKind =
  | "definition"
  | "schema"
  | "privacy"
  | "quality"
  | "lineage"
  | "query"
  | "decision";

interface DataHubEvidence {
  kind: EvidenceKind;
  urn: string;
  title: string;
  statement: string;
  field?: string;
}

interface EvidenceBundle {
  query: string;
  assets: Array<{ urn: string; name: string; type: string }>;
  evidence: DataHubEvidence[];
  constraints: string[];
  retrievedAt: number;
}
```

Keep this bundle small. Store URNs for proof, but send only useful evidence text to the
language model.

### 3. Grounding workflow

Create `apps/server/src/datahub/grounding.ts`:

1. Convert meeting intent into a narrow search phrase.
2. Search catalog items and documents in parallel.
3. Select at most three assets and three documents.
4. Fetch entity details and schema fields for selected datasets.
5. Fetch lineage or query history only when the question needs it.
6. Extract rules, warnings, definitions, sensitive fields, and source URNs.
7. Cache by normalized query for five minutes.
8. Return an empty degraded bundle on failure; never stop the meeting.

Do not ask for the whole catalog. MCP responses have size limits and large schemas waste
model context.

### 4. Orchestrator integration

After the router decides to fact-check or prototype a company-data idea:

- start DataHub retrieval once;
- run the rolling summary concurrently;
- wait for the evidence before fact-check or prototype generation;
- attach the same bundle to both agents;
- emit visible lookup start and completion events.

Suggested WebSocket events:

```ts
{ type: "datahub.lookup.start"; id: string; query: string }
{ type: "datahub.lookup.complete"; id: string; bundle: EvidenceBundle }
{ type: "datahub.lookup.error"; id: string; message: string }
{ type: "datahub.decision.draft"; draft: DecisionDraft }
{ type: "datahub.decision.saved"; urn: string; title: string }
```

The browser sends a host-only approval event:

```ts
{ type: "datahub.decision.approve"; draftId: string }
```

### 5. Fact-check changes

Current Handy fact-checking uses Tavily evidence. Extend it to carry evidence origin:

- public claim -> Tavily;
- company schema, metric, lineage, quality, or policy claim -> DataHub;
- mixed claim -> both;
- current company value without warehouse access -> unverified.

Each verdict should show the evidence kind and DataHub asset or document. A DataHub
description is evidence of company definition, not proof that the underlying rows are
correct.

### 6. Prototype changes

Add the bundle to the prototype and critic prompts. Require:

- exact available field names;
- metric formula and required filters;
- sensitive fields excluded;
- synthetic sample rows only;
- “Synthetic data shaped by DataHub metadata” label;
- source URNs retained outside generated HTML for the evidence UI.

The critic checks the completed HTML against the same constraints. This gives DataHub a
second visible role: it both informs generation and reviews the result.

### 7. Human-approved writeback

At meeting end, create a deterministic markdown Decision draft from the rolling summary
and used evidence. Show the complete draft and related assets in the recap UI.

Only after host approval call:

```json
{
  "document_type": "Decision",
  "title": "Decision: Revenue dashboard definition",
  "content": "<reviewed markdown>",
  "topics": ["handy", "meeting-decision", "revenue"],
  "related_assets": ["<asset URNs used in the meeting>"]
}
```

This matches the official `save_document` safety guidance: show the title, summary, and
related assets, then obtain approval before writing.

Store the returned document URN in the meeting export manifest.

### 8. Recall

At the beginning of a later related meeting, `search_documents` includes decisions tagged
`handy` and matching the topic. Retrieved decisions appear as evidence with kind
`decision`. Do not silently treat every old meeting statement as policy; only approved
DataHub Decision documents qualify.

## UI changes

Keep them small and visible:

1. Connection badge: `DataHub connected` / `degraded`.
2. Lookup activity in the existing activity stream.
3. Evidence card showing the correction and exact sources.
4. Prototype badge: `Grounded by DataHub · 4 rules · synthetic rows`.
5. Recap approval card showing the full Decision draft and related assets.
6. Saved state with returned DataHub document URN.

Do not build a second DataHub browser inside Handy. DataHub already has the good catalog UI.

## Build order for the remaining hackathon time

### Must ship

1. Resolve licensing and prior-work disclosure.
2. Start and test the official MCP server against local DataHub.
3. Implement MCP client plus one `search` call and one document search.
4. Build the EvidenceBundle for the revenue scenario.
5. Feed it into fact-check and prototype prompts.
6. Show evidence and grounded status in Handy.
7. Add approved `save_document` writeback.
8. Prove recall in a fresh meeting.
9. Add the exact fixture, expected outputs, README, example artifacts, and video.

### Only if the loop is stable

- register Handy agents in DataHub Agent Registry;
- add lineage visualization;
- open an upstream DataHub Skill or documentation contribution;
- add warehouse SQL execution;
- generalize to many industries.

## Hard blockers and risks

### License

The repository currently says proprietary and lists two copyright holders. The submission
requires a visible Apache-2.0 license. Do not replace the license unless every rights holder
authorizes it. If that permission is unavailable, submit a newly created Apache-2.0 project
containing only code the entrant is authorized to license.

### Prior work

The rules require a new project during the submission period and disclosure of pre-existing
work. The submission must clearly identify Handy as the earlier base and identify the
DataHub integration, evidence model, writeback, recall, and demo scenario as hackathon work.

### Deadline

The deadline is August 10, 2026 at 5:00 PM EDT, which is August 11 at 2:30 AM IST. At the
time of this plan, only hours remain. Cut anything that does not strengthen the complete
read -> act -> approve -> write -> recall demo.

### Reliability

- DataHub must degrade gracefully instead of stopping the live meeting.
- Cache reads, but never cache or auto-retry writes.
- Every write requires host approval.
- Keep a deterministic fixture so the video does not depend on improvised speech.
- Show synthetic versus live data honestly.

## Submission framing

Category: **Open / Wildcard**.

DataHub technologies used:

- DataHub OSS / Core Platform;
- DataHub MCP Server;
- Agent Context Kit concepts and tools;
- optionally DataHub Skills if a real skill is contributed.

Suggested video structure:

1. 0:00-0:20 — problem: meetings turn ambiguous company claims into wrong artifacts.
2. 0:20-1:20 — live claim, DataHub correction, grounded prototype.
3. 1:20-2:15 — evidence, privacy protection, human-approved Decision writeback.
4. 2:15-2:40 — fresh meeting recalls the decision; show it inside DataHub.
5. 2:40-2:58 — architecture and honest boundary: DataHub context, synthetic rows, no fake
   live-value claim.

## Sources

- [Hackathon overview and judging criteria](https://datahub.devpost.com/)
- [Official rules](https://datahub.devpost.com/rules)
- [Hackathon resources and showcase datapack](https://datahub.devpost.com/resources)
- [Agent Context Kit](https://docs.datahub.com/docs/dev-guides/agent-context/agent-context)
- [DataHub MCP server guide](https://docs.datahub.com/docs/features/feature-guides/mcp)
- [Official MCP server](https://github.com/acryldata/mcp-server-datahub)
- [Official `save_document` implementation and approval guidance](https://github.com/acryldata/mcp-server-datahub/blob/main/src/mcp_server_datahub/tools/save_document.py)
