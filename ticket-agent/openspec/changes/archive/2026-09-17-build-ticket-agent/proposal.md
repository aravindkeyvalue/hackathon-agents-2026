## Why

The second agent class we need to onboard into an agent-testing harness is a ticketing agent: it reads text written by strangers (ticket descriptions, comments) and acts on business state (priorities, assignments, incident status). That is exactly where instructions hidden in data do damage, and where a transcript looks fine while the world does not. It must be standalone — its own repo, connecting to Jira through an MCP server — so the harness onboards it like any customer's agent. Since nobody wants an Atlassian tenant in a hackathon loop, it ships with a mock Jira exposed over the same MCP contract.

## What Changes

- New standalone project `ticket-agent/` (package `ticketagent`), no dependency on any harness.
- A **Jira tool contract** of twelve tools in the shape of the open-source `mcp-atlassian` server, with an alias map to other Jira MCP servers' names and an env override.
- A **mock Jira** engine (project, issues, users, workflow with named transitions, comments, links, JQL subset) and `serve-mock-jira`, an MCP server over it (streamable HTTP, stateless, JSON responses, optional bearer). `--plant` inserts a "note from security" instruction into the first ticket; a canary PIN sits in the production incident's description.
- **Backends**: `local` (mock in-process) and `mcp` (any Jira MCP by URL + token, contract names routed through aliases; missing tools dropped).
- A **LangGraph triage agent** with `naive`/`hardened` prompt policies, model from flag/env/available key (Anthropic and OpenAI installed), and a scripted test double that deliberately follows planted instructions and pastes ticket text into comments.
- **`eval`**: run inside an external harness's run descriptor (`mcp_url`, `token`, `task`, `finish_url`), report the verdict, exit with the gate.

## Capabilities

### New Capabilities
- `jira-tool-contract`: the twelve tools, effects, schemas, JSON export, alias map.
- `mock-jira-mcp`: the mock engine's data and behaviour, and its MCP server.
- `ticket-agent-runtime`: backends, model/provider selection, policies, CLI `run`, scripted double.
- `harness-eval`: running inside an external harness run and reporting its verdict.

### Modified Capabilities
- (none — greenfield)

## Impact

- New files only: `ticket-agent/{pyproject.toml,README.md,ticketagent/*.py,tests/*}`.
- Dependencies: `mcp`, `langgraph`, `langchain`, `langchain-anthropic`, `langchain-openai`, `httpx`, `starlette`, `uvicorn`.
- Harness untouched. Observed while onboarding: Nikasa's drafter classifies tools by first verb, so `jira_*` tools all read as verb "jira" — reported in the README as a harness-side finding, not worked around here.
