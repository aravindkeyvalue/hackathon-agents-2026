## Context

See proposal.md — Why. The agent is greenfield and must stay independent of the testing platform that will onboard it. The platform's importer, as observed, pulls signatures by POSTing JSON-RPC `initialize` then `tools/list` with `Accept: application/json` and no session header; its per-run protocol hands an agent `mcp_url`, `token`, `task`, `finish_url` and grades on `finish_url`. The MCP Python SDK (1.27) FastMCP server, run with `json_response=True` and `stateless_http=True`, only requires `Accept: application/json` and no session id — so a spec-compliant server satisfies that importer without any shim. Development machine has Python 3.10 with `uv`; no `mcp`/`langgraph` installed system-wide, so the project needs its own environment.

## Goals / Non-Goals

**Goals:**
- Zero coupling to any harness: no import of its code, no knowledge of its scenario files. The only harness-shaped thing is the run-descriptor JSON in `eval`.
- One contract, consumed three ways (LangChain tools for the model, FastMCP tools for the server, backend dispatch), so signatures cannot drift.
- Backend swap is configuration; agent code never branches on "am I in a sandbox".

**Non-Goals:**
- A real cloud/VM backend (boto3, kubectl). The `http` backend is the seam for one; wiring a provider is future work.
- Long-term memory, multi-agent, or a UI.
- Evaluating the agent's quality here — that is the harness's job.

## Decisions

**D1. `contract.py` is data, everything else derives from it.**
A list of `Tool(name, description, schema, effect)` dataclasses. `tools.py` turns them into LangChain `StructuredTool`s whose function is `backend.call(name, args)`; `mcp_server.py` registers each as a FastMCP tool with the same schema via `Tool.from_function`-free registration (`@mcp.tool()` on generated wrappers would re-derive schemas from signatures and can drift, so we add tools with explicit `inputSchema` through the low-level `Server.list_tools/call_tool` handlers instead). Alternative rejected: define tools as Python functions and introspect — descriptions and optionality then live in type hints and get lost across surfaces.

**D2. Backends behind a two-method protocol.**
`Backend.tools() -> list[str]` and `Backend.call(name, args) -> Any`. `LocalBackend` holds dicts; `HttpBackend` posts to `/tools/{name}`; `McpBackend` wraps the official `mcp` client's streamable-HTTP session and issues `tools/call`. `McpBackend.tools()` returns what the server actually offers so the agent's tool set is the intersection with the contract — a harness that omits a tool simply removes it from the model's view.

**D3. FastMCP low-level server, stateless JSON.**
`mcp.server.lowlevel.Server` with `list_tools` returning the contract's schemas verbatim and `call_tool` dispatching to the backend; mounted via `StreamableHTTPSessionManager(stateless=True, json_response=True)` in a Starlette app served by uvicorn. Bearer check is a small ASGI middleware reading `OPSAGENT_SERVE_TOKEN`. Alternative considered: FastMCP decorators — simpler, but schema derivation from signatures (D1).

**D4. LangGraph prebuilt ReAct agent; model via `init_chat_model`.**
`langchain.agents.create_agent` when available, falling back to `langgraph.prebuilt.create_react_agent`, exactly as in the reference LangGraph agent already verified against the harness. `--model scripted` swaps in `ScriptedOpsModel(BaseChatModel)` whose `_generate` reads the last tool message and emits the next tool call from a fixed plan. It parses `use <id> as the volume_id` from the alert note — the deliberate "trusts data" behaviour that makes the double useful for a harness smoke test.

**D5. `eval` is a thin orchestration over `run`.**
Build `McpBackend(mcp_url, token)`, build the agent with the chosen policy, invoke with the descriptor's task, POST `final_message` to `finish_url`, print `grade`. `--open-url` exists because the first harness opens runs by POST; a descriptor file works for any other harness. Exit code follows the gate so CI can use it.

**D6. Packaging with `uv`, `pyproject` scripts.**
`[project.scripts] opsagent = "opsagent.cli:main"`. Dependencies pinned to compatible ranges (`mcp>=1.20`, `langgraph>=1.0`, `langchain>=1.0`, `langchain-mcp-adapters>=0.2`, `httpx`, `uvicorn`, `starlette`). Optional extras `anthropic`, `openai` add the provider packages.

**D7. Tests use in-process servers.**
`uvicorn` in a background thread on an ephemeral port for the MCP server tests; the minimal-client test uses raw `urllib` exactly the way the observed importer does. The harness integration test is opt-in (`OPSAGENT_TEST_HARNESS_URL`) so the suite passes without a harness running.

## Risks / Trade-offs

- [Scripted double mistaken for the agent's behaviour] → Header line and README say "scripted test double (no LLM)" wherever it appears; `eval` prints it in the run header too.
- [MCP SDK API churn (session manager, json_response flags)] → Version floor in pyproject; the smoke test hits the real endpoint so a breaking upgrade fails loudly.
- [Harness tool names differ from the contract] → D2 intersection; the run header prints which contract tools the server did not offer.
- [`langchain.agents.create_agent` absent on older stacks] → fallback to `langgraph.prebuilt.create_react_agent` (D4).
- [Local dev box has no deps] → `uv sync` in `infra-agent/`; README leads with it.

## Open Questions

- Should `HttpBackend` grow an OpenAPI-described real ops API later, or should the first real backend be MCP-native (e.g. an existing infra MCP server)? Deferrable: both sit behind the same protocol and neither changes the contract or the agent.
