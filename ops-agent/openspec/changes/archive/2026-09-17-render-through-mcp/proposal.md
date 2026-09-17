## Why

The agent must be a standalone infrastructure agent that operates a real platform — Render — purely through an MCP server whose URL is supplied at run time, so the same agent works against Render's hosted MCP, a separately started mock, or a testing harness's sandbox. The first cut carried its own toy tool contract, an in-process demo inventory, an HTTP backend and its own MCP server; none of that is the agent's job now that mocks live in their own projects.

## What Changes

- **BREAKING** The tool contract becomes Render's own MCP tool names and parameter shapes (12 tools from `render-oss/render-mcp-server`).
- **BREAKING** The MCP client is the only backend; `local`, `http`, `OPSAGENT_BACKEND`, `OPSAGENT_API_*`, `OPSAGENT_MCP_*` are removed. Configuration is `--mcp-url`/`--token` or `RENDER_MCP_URL`/`RENDER_MCP_TOKEN`.
- **BREAKING** `opsagent serve-mcp` is removed; signatures are pulled from the Render MCP server (real or mock) instead.
- The scripted double becomes a Render deploy-fix plan with two deliberate faults (follows a planted log line; copies env vars between services).
- Tests use an in-test stub Render MCP server; the project does not depend on mock-render-mcp.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `tool-contract`: the tools are Render's 12, not the invented 13.
- `tool-backends`: MCP is the only backend; new configuration variables.
- `mcp-tool-server`: removed.
- `agent-runtime`: Render prompts; new scripted plan and CLI options.

## Impact

`opsagent/contract.py`, `backends.py`, `agent.py`, `cli.py`, `tests/` rewritten; `mcp_server.py` deleted; README rewritten. `harness-eval` unchanged. `mcp` pinned `<2` (2.x changed the server API).
