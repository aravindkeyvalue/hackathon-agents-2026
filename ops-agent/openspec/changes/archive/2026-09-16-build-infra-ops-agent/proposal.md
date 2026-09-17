## Why

We need an infrastructure-operations agent that exists on its own — its own repo, its own tools, its own MCP server — so that an agent-testing platform built by someone else (Nikasa) can onboard it the way it would onboard any customer's agent: pull the tool signatures from the agent's MCP endpoint, build a world, and then run the agent against that world by pointing its tool backend at a URL. Today the only agents wired to Nikasa live inside Nikasa's repo and read Nikasa's own scenario files, which proves nothing about onboarding a real, independently built agent.

## What Changes

- New standalone Python project `infra-agent/` (package `opsagent`), no dependency on Nikasa's code.
- A **tool contract**: thirteen infra-ops tools (host, volume, service and alert reads; purge/restart/stop/delete/change-ticket/resolve writes) defined once with JSON schemas and a side-effect class, exportable as JSON.
- **Pluggable tool backends** selected by environment or flag: an in-memory demo inventory (default), a REST ops API, or any external MCP server. The MCP backend is what lets a harness substitute its sandbox for the real infrastructure without touching agent code.
- The agent's own **MCP server** exposing the contract over streamable HTTP with JSON responses and no session requirement, so a minimal JSON-RPC client can `initialize` + `tools/list` and get every signature. Optional bearer token.
- A **LangGraph ReAct agent** with the model chosen from the environment, two prompt policies (`naive`, `hardened`), a CLI to run a task, and a scripted stand-in model for keyless smoke tests (clearly labelled a test double).
- A **harness-eval command** that accepts an external run descriptor (`mcp_url`, `token`, `task`, `finish_url`), routes the agent's tools to that MCP URL, runs the task, posts the final message and prints the returned grade. Nikasa's per-run protocol is the first harness; the command is not Nikasa-specific.
- README: how to run standalone, how to expose the MCP server, and the exact onboarding sequence for a harness.

## Capabilities

### New Capabilities
- `tool-contract`: the single definition of the agent's tools — names, descriptions, input schemas, side-effect class — and its JSON export.
- `tool-backends`: the backend abstraction and the three implementations (local demo inventory, HTTP ops API, external MCP), plus how one is selected.
- `mcp-tool-server`: the agent's MCP endpoint that serves the contract and executes calls against the active backend.
- `agent-runtime`: the LangGraph agent, model selection, policies, CLI run command and the scripted test double.
- `harness-eval`: running the agent against an external harness run and reporting its verdict.

### Modified Capabilities
- (none — greenfield project)

## Impact

- New project only: `infra-agent/pyproject.toml`, `infra-agent/opsagent/{contract,backends,tools,mcp_server,agent,cli}.py`, `infra-agent/tests/`, `infra-agent/README.md`.
- Dependencies: `mcp` (FastMCP + client), `langgraph`, `langchain`, `langchain-mcp-adapters`, `httpx`; optional `langchain-anthropic` / `langchain-openai`.
- Nikasa is untouched. Its importer (`initialize` + `tools/list` over JSON POST with `Accept: application/json`) must work against the agent's MCP server as-is; that is the integration test.
- Constraint: the scripted model is a wiring check, never a result; real-model numbers require a key in the environment.
