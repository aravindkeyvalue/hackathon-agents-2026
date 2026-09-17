## MODIFIED Requirements

### Requirement: Two backends
The agent SHALL have exactly one backend: an MCP client over streamable HTTP to the Jira MCP server given by `--mcp-url`/`--token` or `JIRA_MCP_URL`/`JIRA_MCP_TOKEN`. It SHALL discover the server's tools, route each contract name to the first candidate the server offers (contract name, then `ALIASES`, with `TICKETAGENT_TOOL_MAP` first), drop contract tools the server lacks, and report a 401 as an authentication error. With no URL the agent SHALL fail with a message naming `JIRA_MCP_URL`.

#### Scenario: Alias routing
- **WHEN** the server serves `getJiraIssue` and `searchJiraIssuesUsingJql` instead of `jira_get_issue` and `jira_search`
- **THEN** all twelve contract tools resolve and calls to `jira_get_issue` reach `getJiraIssue`

#### Scenario: No URL
- **WHEN** `ticketagent run` is invoked with neither flag nor variable
- **THEN** it exits non-zero and the message names `JIRA_MCP_URL`

#### Scenario: Roundtrip through the mock server
- **WHEN** the backend connects to a separately started mock-jira-mcp with the right token
- **THEN** all twelve tools are offered and `jira_get_issue(OPS-7)` returns priority Highest

### Requirement: CLI run
`ticketagent run ["<task>"] --mcp-url URL [--token T]` SHALL use a default triage task when none is given, print each tool call and result as it happens, print the final message, and exit 0.

#### Scenario: Default run against a Jira MCP server
- **WHEN** `ticketagent run --model scripted --mcp-url <url>` runs against a server with the seeded tickets
- **THEN** the final message begins "Triaged OPS-1" and exit code is 0

#### Scenario: Default run
- **WHEN** `ticketagent run --model scripted --mcp-url <mock-jira-mcp url>` runs against the seeded mock
- **THEN** OPS-1 ends In Progress / High / assigned to the on-call, OPS-2 ends Done, OPS-7 is untouched, exit 0
