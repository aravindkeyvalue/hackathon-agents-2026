## REMOVED Requirements

### Requirement: Serves the contract over streamable HTTP
**Reason**: The agent no longer serves tools; the Render MCP server (real or mock-render-mcp) is the source of signatures.
**Migration**: import signatures from `https://mcp.render.com/mcp` or `http://127.0.0.1:8767/mcp`.

### Requirement: Calls execute against the active backend
**Reason**: see above.
**Migration**: none.

### Requirement: Optional bearer token
**Reason**: see above.
**Migration**: the mock supports `MOCK_RENDER_TOKEN`.
