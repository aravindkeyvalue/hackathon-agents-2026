## Why

Agents that operate Jira need somewhere safe to run and something a testing harness can pull tool signatures from without a real Jira account. This project is that: a mock Jira served over MCP under the real tool names, started on its own with one command.

## What Changes

- New standalone project `mock-jira-mcp` (package `mockjira`, command `mock-jira-mcp`): an in-memory Jira engine with seeded data, a planted attack (`--plant`), a canary secret, and an MCP server (streamable HTTP, stateless, JSON responses, optional bearer via `MOCK_JIRA_TOKEN`).
- `mock-jira-mcp --tools` prints the tool contract as JSON.

## Capabilities

### New Capabilities
- `mock-jira-mcp`: the engine's data and behaviour, the planted attack, and the MCP transport.

### Modified Capabilities
- (none)

## Impact

New files only. Dependencies: `mcp<2`, `starlette`, `uvicorn`. No agent depends on this project; agents connect by URL.
