# How DataHub could fit Handy

> This is an earlier exploration. Read
> [the complete project handoff](./datahub-project-handoff.md) for the chosen direction,
> current architecture, non-goals, and implementation order.

Research date: August 10, 2026

Read [DataHub, explained simply](./datahub-expert-dossier.md) first.

This document does not choose final hackathon idea. It explains possible connection.

## Handy today

Handy listens to a meeting and runs several AI agents:

- router decides what work is needed;
- summarizer tracks decisions and tasks;
- fact-checker checks claims;
- prototype agent builds interactive HTML;
- critic reviews prototype;
- next-step agent suggests improvements;
- final-document agent creates meeting recap.

Meeting state lives in server memory. It disappears when process restarts. Exported files
remain on disk, but Handy has no database or long-term company memory.

## Simple DataHub connection

```text
Before agent answers:
Handy searches DataHub for company meaning and data location.

When real number is needed:
Handy uses separate read-only database connection.

After meeting:
Handy saves approved decisions into DataHub.

Next meeting:
Handy finds those decisions through DataHub.
```

## What each agent gains

### Router

Router notices names of tables, metrics, dashboards, and company terms. It searches DataHub
only when company context is needed.

Do not search DataHub after every sentence. That wastes time and model context.

### Summarizer

Summarizer can use official company names and definitions. It can connect meeting decisions
to exact DataHub items.

It must keep two things separate:

- what participant said;
- what DataHub says.

### Fact-checker

Fact-checker can run several checks:

1. Definition check: does “revenue” match official company meaning?
2. Schema check: do named table and columns exist?
3. Lineage check: does dashboard really use claimed source?
4. Trust check: is source stale, deprecated, failing tests, or under incident?
5. Old-query check: do past queries use claimed calculation?
6. Live-value check: if authorized, does current database result support claim?

Result should say what kind of evidence was used. Old profile result is weaker than live
database query.

### Prototype agent

Prototype can use:

- real column names and data types;
- official metric and field labels;
- known categories and allowed values;
- realistic ranges and missing-value rates;
- company design or policy documents;
- safe example queries.

Best safety rule:

1. Copy structure and meaning from DataHub.
2. Generate fake rows matching that structure.
3. Label rows synthetic.
4. Never expose real personal data in generated HTML.

This makes prototype realistic without leaking customers.

### Critic

Critic can catch:

- fields that do not exist;
- wrong metric meanings;
- invalid joins;
- use of broken or deprecated data;
- accidental display of private fields.

### Final-document agent

After host approval, recap can become a DataHub Decision Log linked to discussed tables,
dashboards, metrics, and models.

## Good meeting memory

Save one reviewed document per meeting. Include:

- meeting title and date;
- short summary;
- decisions;
- tasks and owners;
- open questions;
- DataHub items discussed;
- evidence used;
- proposed changes to company definitions;
- link to Handy artifacts;
- meeting ID and agent version.

Keep raw transcript in Handy's own storage. Do not create one DataHub document per sentence.

## Writeback rules

Safe automatic actions:

- create draft Decision Log;
- attach related DataHub items;
- record source links and agent version.

Require human approval before:

- publishing meeting document;
- changing official description;
- changing owner;
- creating company term;
- adding sensitive tag;
- changing lifecycle stage.

Never store secrets, passwords, customer personal data, or private raw transcript in
DataHub.

## Possible technical designs

### Option 1: Handy calls MCP directly

Bun server calls DataHub MCP server over HTTP.

Good:

- fits current Handy architecture;
- few extra services;
- DataHub tool calls visible in demo.

Hard:

- need MCP client, login, evidence tracking, and approval logic in TypeScript.

### Option 2: Small Python service

Python service calls official DataHub Python tools. Handy calls this service.

Good:

- easiest access to official SDK;
- easy document writeback and Agent Registry setup.

Hard:

- second runtime;
- more deployment work.

### Option 3: Use Analytics Agent for database questions

Handy sends live-data questions to DataHub Analytics Agent.

Good:

- SQL and chart flow already exists;
- supports several databases.

Hard:

- overlaps with Handy agents;
- less original if reused without major new behavior;
- database credentials must be read-only.

### Option 4: No live database

Use local DataHub plus sample metadata. Fact-check structure, meaning, lineage, and quality.
Generate synthetic prototype data. Save meeting Decision Log.

Good:

- easiest reliable demo;
- works with open-source DataHub;
- strong read-and-write story.

Limit:

- cannot claim current business-number verification.

## Powerful extra: register Handy itself

DataHub Agent Registry can record:

- Handy router, summarizer, fact-checker, and prototype agent;
- Cerebras/Gemma model;
- DataHub, Tavily, database, renderer, and file tools;
- table each agent used;
- agent version and owner.

Then DataHub can answer:

- Which agents use customer table?
- Which agents may break if revenue column changes?
- Which model created this decision?
- Who owns fact-check agent?

This makes integration two-way:

- DataHub improves Handy.
- Handy improves DataHub's knowledge of AI usage.

## Best three-minute demo shape

1. Person makes company-data claim and asks for dashboard prototype.
2. Handy shows DataHub items and documents it found.
3. Fact-checker catches wrong definition, broken lineage, or quality issue.
4. Prototype uses real schema and safe synthetic rows.
5. Person approves decision.
6. Handy saves linked Decision Log into DataHub.
7. New meeting retrieves saved decision.
8. DataHub shows Handy agent connected to data it used.

Steps 6 and 7 prove real memory. Without them, integration looks like search decoration.

## Current blockers

- Handy supports one global meeting, not isolated companies or teams.
- Meeting state is not durable.
- No DataHub user login mapping.
- No secret or personal-data filter.
- No shared evidence format across agents.
- No safe database query sandbox.
- No review screen for DataHub writeback.
- Handy license is proprietary while hackathon requires public Apache-2.0 code.
- Hackathon requires newly built work and disclosure of old Handy code.

Synthetic demo can avoid some production blockers. License and submission ownership cannot
be ignored.

## One-sentence product idea

Handy turns live meeting conversation into governed company decisions, uses DataHub to make
fact-checks and prototypes match the real company data model, then saves approved knowledge
for future people and agents.
