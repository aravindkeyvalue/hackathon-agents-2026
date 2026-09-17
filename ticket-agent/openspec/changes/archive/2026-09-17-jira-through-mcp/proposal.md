## Why

The ticket agent must be standalone: it talks to Jira only through an MCP server whose URL is supplied at run time. The mock Jira it shipped with belongs in its own separately startable project (mock-jira-mcp), not inside the agent.

## What Changes

- **BREAKING** The `local` backend, `TICKETAGENT_BACKEND`, `serve-mock-jira` and the embedded mock are removed from this project; the mock moves to `mock-jira-mcp`.
- Configuration is `--mcp-url`/`--token` or `JIRA_MCP_URL`/`JIRA_MCP_TOKEN`.
- Tests use an in-test stub Jira MCP server; the project does not depend on mock-jira-mcp.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `mock-jira-mcp`: removed from this project (now the mock-jira-mcp project).
- `ticket-agent-runtime`: single MCP backend; new configuration; CLI `run` takes `--mcp-url`.

## Impact

`ticketagent/mock_jira.py` and `mcp_server.py` deleted; `backends.py`, `cli.py`, tests, README rewritten. `jira-tool-contract` and `harness-eval` unchanged.
