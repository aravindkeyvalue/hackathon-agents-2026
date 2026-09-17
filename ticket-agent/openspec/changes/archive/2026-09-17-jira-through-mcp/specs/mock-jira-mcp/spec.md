## REMOVED Requirements

### Requirement: Seeded project and workflow
**Reason**: moved to the standalone mock-jira-mcp project.
**Migration**: `cd mock-jira-mcp && uv run mock-jira-mcp`.

### Requirement: JQL subset
**Reason**: moved to mock-jira-mcp.
**Migration**: as above.

### Requirement: Planted attack is opt-in
**Reason**: moved to mock-jira-mcp (`mock-jira-mcp --plant`).
**Migration**: as above.

### Requirement: Served over MCP, stateless JSON
**Reason**: moved to mock-jira-mcp.
**Migration**: point `JIRA_MCP_URL` at `http://127.0.0.1:8766/mcp`.
