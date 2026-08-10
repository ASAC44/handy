# DataHub, explained simply

Research date: August 10, 2026

## Start here

DataHub is a map of a company's data.

It tells an agent:

- what data exists;
- where it lives;
- what each table and field means;
- who owns it;
- where it came from;
- what depends on it;
- whether it has known quality problems;
- how people have used it before.

DataHub usually does not contain the real business rows. A separate database connection
reads those rows.

```text
Agent asks DataHub: Which table contains revenue?
DataHub answers: Use this table, this field, and this definition.
Agent writes SQL.
Database runs SQL and returns real values.
```

SQL is the language used to ask a database for data.

## Important words

These words appear throughout DataHub documentation.

### Database

A system that stores real records. Examples: customers, orders, payments, and inventory.

### Data warehouse

A database built mainly for reporting and analysis. Snowflake, BigQuery, and Redshift are
common examples. This guide sometimes says “warehouse” for short.

### Table, row, and column

A table is like a spreadsheet. Each row is one record. Each column is one property, such as
`customer_name` or `order_total`.

### Schema

A schema describes a table's structure: column names, data types, and whether values may be
missing. It describes data without being the data itself.

### Metadata

Metadata means information about data. Table names, schemas, descriptions, owners, and
quality status are metadata.

### Data catalog

A searchable library of metadata. DataHub is a data catalog plus several governance and AI
features.

### Lineage

Lineage shows how data moves and changes.

Example: raw orders feed a cleaned orders table; that table feeds a revenue dashboard.
Lineage can show this full path and what may break if raw orders change.

### Knowledge graph

A knowledge graph stores things and their connections. In DataHub, tables, dashboards,
people, documents, metrics, and AI agents are things. Ownership, lineage, and “uses this
table” are connections.

### Ingestion

Ingestion means copying metadata from another system into DataHub. It does not usually copy
all business rows. An ingestion job may run every hour or every day, so DataHub can be
behind the source system.

### Connector

A connector knows how to ingest metadata from one product. DataHub has connectors for
Snowflake, BigQuery, dbt, Looker, Tableau, Power BI, Postgres, and many more.

### Business glossary

A shared dictionary for company terms. It can define exactly what “active customer” or
“net revenue” means.

### Data quality check

A test that decides whether data meets an expectation. Examples: table updated in last
24 hours, row count above 1,000, or email column contains no null values.

### Data contract

A named group of important quality checks for one data asset. It describes what consumers
can expect from that asset.

### Incident

A recorded data problem, such as stale data, broken schema, wrong values, or failed SQL.

### MCP

MCP means Model Context Protocol. It is a standard way for an AI agent to call external
tools. DataHub's MCP server gives agents tools for searching DataHub, reading lineage, and
updating approved metadata.

DataHub also uses the letters MCP for “Metadata Change Proposal” inside its lower-level
metadata system. Same letters, different meaning. In this guide, “MCP server” means the AI
tool protocol.

### SDK and API

An API is an interface software can call. An SDK is a library that makes those calls easier
from a programming language. DataHub offers Python and Java SDKs plus GraphQL, REST, Kafka,
and MCP interfaces.

### Semantic model

“Semantic” here means business meaning. A semantic model defines trusted dimensions,
measures, joins, and metrics above physical tables. It can teach an agent that `SUM(amount)`
means company revenue and which customer table is safe to join.

## What DataHub stores

DataHub can describe:

- databases, tables, views, streams, and files;
- columns and their data types;
- dashboards and charts;
- data pipelines and jobs;
- machine-learning models and features;
- business metrics and semantic models;
- APIs, services, applications, and code repositories;
- users, teams, owners, and domains;
- company terms, tags, descriptions, and custom properties;
- quality checks, contracts, and incidents;
- company documents;
- AI agents, their tools, models, and data dependencies.

Every item gets a unique DataHub ID called a URN. A URN is similar to a full address for
one item in the catalog.

## What DataHub can do

### 1. Search

Agents can search by name, description, tag, owner, company term, platform, or domain.
Search supports filters, wildcards, Boolean words such as AND/OR, sorting, and pagination.

Pagination means returning results in pages instead of returning everything at once.

DataHub can also search company documents. Full meaning-based search is strongest for
documents. Search over tables and columns is still mainly keyword and filter based.

### 2. Inspect a table

An agent can read:

- schema and column descriptions;
- table and column owners;
- tags and company terms;
- usage statistics;
- data profiles;
- quality status and incidents;
- related documents;
- sample SQL queries.

A data profile is a summary such as row count, missing-value count, value range, or number
of unique values. Profiles can be sampled and old. They are not guaranteed live truth.

### 3. Follow lineage

An agent can move upstream to find where data came from or downstream to find what uses it.
It can inspect multiple steps, table-level paths, and column-level paths.

Lineage can be incomplete. Dynamic SQL, missing permissions, and unsupported tools may hide
real dependencies.

### 4. Learn from old SQL

When query-history ingestion is enabled, DataHub can show real SQL that used a table. This
helps an agent learn common joins, filters, and calculations.

Old SQL may contain sensitive values. Access and redaction still matter.

### 5. Understand trust

An agent can see ownership, deprecation, incidents, quality checks, contracts, freshness,
and profile timestamps. These signals help it judge whether an asset is trustworthy.

A failed quality check does not automatically prove a meeting statement is false. It means
the source may be unsafe or uncertain.

### 6. Store company knowledge

DataHub Documents can store:

- runbooks;
- FAQs;
- policies;
- process guides;
- analyses;
- decision logs;
- meeting knowledge.

Documents can be linked to tables and dashboards. They support owners, folders, tags,
domains, version history, and draft/published status.

Notion and Confluence imports are one-way. GitHub writeback requires DataHub Cloud.

### 7. Update DataHub

With permission, an agent can:

- add or remove tags;
- add or remove glossary terms;
- change owners;
- set domains;
- update table or column descriptions;
- add typed custom properties;
- change lifecycle stages;
- save documents;
- create and version glossary terms;
- suggest some changes for human approval.

Write tools are off by default in the self-hosted MCP server. They must be enabled with
`TOOLS_IS_MUTATION_ENABLED=true`.

“Mutation” means a tool that changes stored information.

### 8. React to changes

DataHub produces events when metadata changes. DataHub Actions can listen for these events
and run custom code.

Example: a table becomes deprecated. An action could notify Handy or clear its cached
context.

## Exact MCP tools

Read-only tools:

- `search`: find catalog items;
- `get_entities`: get full details for known IDs;
- `list_schema_fields`: inspect large table schemas page by page;
- `get_me`: identify current DataHub user;
- `get_lineage`: find upstream or downstream dependencies;
- `get_lineage_paths_between`: find exact path between two items;
- `search_documents`: find documents;
- `grep_documents`: search inside document text;
- `list_lifecycle_stages`: list allowed stages;
- `get_glossary_term_versions`: inspect term history;
- `compare_glossary_term_versions`: compare term versions;
- `get_dataset_queries`: find old SQL using a table;
- `find_sql_context`: find tables and examples needed for new SQL;
- `draft_sql_for_tables`: create SQL using DataHub context;
- `list_pending_proposals`: find changes waiting for approval.

Write tools:

- `add_tags` and `remove_tags`;
- `add_terms` and `remove_terms`;
- `add_owners` and `remove_owners`;
- `set_domains` and `remove_domains`;
- `update_description`;
- `add_structured_properties` and `remove_structured_properties`;
- `set_lifecycle_stage`;
- `save_document`;
- `create_glossary_term`;
- `create_glossary_term_version`;
- `add_related_terms`;
- `propose_create_glossary_term`;
- `propose_lifecycle_stage`;
- `accept_or_reject_proposals`.

DataHub can draft SQL. Its MCP server does not run SQL against the warehouse.

## DataHub products around agents

### Agent Context Kit

Agent Context Kit is the overall toolbox for connecting agents to DataHub. It includes:

- MCP server;
- Python helpers for LangChain and Google ADK;
- DataHub Skills;
- setup guides for several agent platforms.

LangChain and Google ADK are frameworks for building AI agents.

### DataHub Skills

Skills are written instructions teaching an agent how to complete a multi-step job. Tools
perform individual actions.

Example:

- Tool: search for tables.
- Skill: search, compare descriptions and owners, check quality, inspect lineage, then pick
  best table.

Official skills cover setup, search, lineage, enrichment, and quality investigation.

### Analytics Agent

Analytics Agent is a separate open-source application. It:

- accepts a question in plain English;
- reads DataHub context;
- writes SQL;
- runs SQL on a configured database;
- returns rows and a chart;
- remembers follow-up questions.

It supports Snowflake, BigQuery, Postgres, MySQL, DuckDB, and other SQLAlchemy databases.
SQLAlchemy is a Python library that connects to many database types.

Important warning: its generic SQLAlchemy executor can run non-read SQL and commit it. A
500-row output limit does not stop writes. Database credentials must have read-only
permission.

### Agent Registry

Agent Registry is a catalog for AI systems. It can record:

- agent name and instructions;
- owner and team;
- model used;
- tools used;
- reusable skills;
- agent versions;
- data read by that agent;
- run count, speed, and evaluation scores when supplied.

This creates AI lineage. AI lineage means seeing which company data feeds which agent, and
which agents may break when a table changes.

The data model can be written through Core or Cloud APIs. Richer Registry screens and
automatic governance may need a newer Cloud setup or feature enablement.

## DataHub Core versus DataHub Cloud

DataHub Core means free open-source DataHub that we run ourselves.

DataHub Cloud means DataHub's hosted paid product. It includes Core features plus managed
and enterprise features.

Core provides:

- metadata graph and search;
- 140+ connectors;
- table and column lineage;
- Documents;
- glossary, ownership, domains, and tags;
- data contracts and external quality results;
- SDKs and APIs;
- self-hosted MCP server.

Cloud adds:

- hosted MCP server;
- per-user OAuth login;
- Ask DataHub chat agent;
- stronger search ranking;
- search results filtered by user permission;
- automatic quality monitoring and anomaly detection;
- notifications and health dashboards;
- approval and compliance workflows;
- automatic tag/term propagation through lineage;
- stronger security, support, and uptime promises;
- some private-beta agent and scoped-MCP features.

OAuth is a login system that lets each user connect without sharing one permanent token.

## Main limits and dangers

### DataHub is not live company data

It can tell an agent what to query. It usually cannot answer “What was today's revenue?”
without a separate warehouse query.

### Ingested information can be old

DataHub is only as current as its last successful ingestion job.

### Search can leak metadata in Core

DataHub Core does not filter search at query time. Even when a user cannot open an item,
its name or columns may appear in search. Use synthetic demo data. Do not claim the Core
demo provides safe company-wide multi-tenant isolation.

### Profiles and examples can expose private information

Sample values, SQL text, column names, documents, and lineage may reveal personal or secret
information. “Only metadata” does not mean “not sensitive.”

### Context has size limits

Large responses and schemas are cut off. Agents must search narrowly, use pages, and fetch
specific columns instead of asking for the whole graph.

### Writeback can damage trusted knowledge

One meeting should not silently replace official definitions or ownership. Save a reviewed
Decision Log first. Promote repeated, approved knowledge later.

### Agent output still needs evidence

DataHub provides context, not guaranteed truth. Good output must show:

- which DataHub item or document was used;
- when metadata was collected;
- whether a value came from a profile or a live query;
- whether quality checks were passing;
- where sources disagree.

## Local test setup

Requirements:

- Docker Compose v2;
- Python 3.10 or newer;
- 2 CPU cores;
- 8 GB RAM;
- 2 GB swap;
- about 13 GB disk.

```bash
python3 -m pip install --upgrade acryl-datahub
datahub docker quickstart --version v1.6.0
datahub init --username datahub --password datahub
datahub datapack load showcase-ecommerce
```

Open `http://localhost:9002`. Development login: `datahub` / `datahub`.

Quickstart is for local testing, not production. It has default passwords, exposed ports,
one-machine limits, and no easy horizontal scaling.

Useful hackathon sample data:

- Showcase ecommerce: about 1,050 connected catalog items;
- Fiction retail: customers, orders, and ten tables for realistic demos;
- Healthcare: synthetic data with planted quality problems;
- NYC taxi: larger data with freshness problems;
- Bootstrap: small and fast catalog.

## Hackathon rules that matter

- Deadline: August 10, 2026 at 5:00 PM EDT; August 11 at 2:30 AM IST.
- App must use open-source DataHub plus MCP Server, Agent Context Kit, DataHub Skills, or
  Analytics Agent.
- Open/Wildcard allows knowledge-capture projects.
- Submitted work must be newly built during the hackathon period.
- Pre-existing code must be disclosed.
- Public repository must use Apache-2.0.
- Entrant must own or have permission to use submitted code and data.
- Demo video must be public and under three minutes.
- Judges favor meaningful read and write use of DataHub.

Current Handy license is proprietary. Do not change it without permission from both named
copyright owners. Options are authorized relicensing or a separate new Apache-2.0 project
that uses only code the entrant may legally submit.

## Sources

- [Hackathon rules](https://datahub.devpost.com/rules)
- [Hackathon resources](https://datahub.devpost.com/resources)
- [DataHub quickstart](https://docs.datahub.com/docs/quickstart)
- [Agent Context Kit](https://docs.datahub.com/docs/dev-guides/agent-context/agent-context)
- [MCP server guide](https://docs.datahub.com/docs/features/feature-guides/mcp)
- [DataHub Skills](https://docs.datahub.com/docs/dev-guides/agent-context/skills)
- [Analytics Agent](https://docs.datahub.com/docs/features/feature-guides/analytics-agent)
- [Analytics Agent source](https://github.com/datahub-project/analytics-agent)
- [Agent Registry](https://docs.datahub.com/docs/features/feature-guides/agent-registry)
- [Context Documents](https://docs.datahub.com/docs/features/feature-guides/context/context-documents)
- [Metadata model](https://docs.datahub.com/docs/metadata-modeling/metadata-model)
- [DataHub APIs](https://docs.datahub.com/docs/api/datahub-apis)
- [DataHub Actions](https://docs.datahub.com/docs/actions/)
- [Core versus Cloud](https://docs.datahub.com/docs/managed-datahub/managed-datahub-overview)
- [Search access controls](https://docs.datahub.com/docs/features/feature-guides/search-access-controls)
- [Connector list](https://docs.datahub.com/docs/generated/ingestion/sources/)

