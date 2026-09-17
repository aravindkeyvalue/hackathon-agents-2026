## 1. Build

- [x] 1.1 `contract.py`, `engine.py` (seed, writes, --plant, canary), `server.py` (stateless JSON MCP, bearer), `cli.py` — verified by the project's pytest suite
- [x] 1.2 Start with `mock-jira-mcp` and list tools with a minimal JSON client and the official client — verified by the transport tests

## 2. Verify

- [x] 2.1 Agent run against this mock by URL from its own project — verified in the agent's README example
- [x] 2.2 README written; `openspec validate --strict` clean
