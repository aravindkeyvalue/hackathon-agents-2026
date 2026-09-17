## Purpose

Defines the agent's twelve Jira tools once — names, schemas, effects — plus the alias map that lets the same agent talk to Jira MCP servers that name the same operations differently.

## ADDED Requirements

### Requirement: Twelve tools in the mcp-atlassian shape
The contract SHALL define exactly: reads `jira_search(jql, max_results?)`, `jira_get_issue(issue_key)`, `jira_get_transitions(issue_key)`, `jira_get_all_projects()`, `jira_get_user_profile(user_identifier)`; writes `jira_create_issue(project_key, summary, issue_type, description?, priority?, assignee?)`, `jira_update_issue(issue_key, summary?, description?, priority?, labels?)`, `jira_assign_issue(issue_key, assignee)`, `jira_add_comment(issue_key, body)`, `jira_transition_issue(issue_key, transition, comment?)`, `jira_create_issue_link(inward_key, outward_key, link_type)`; destructive `jira_delete_issue(issue_key)`. Each schema SHALL be a JSON Schema object with `properties` and `required`.

#### Scenario: Contract enumerates the tools
- **WHEN** the contract is loaded
- **THEN** it yields twelve tools with those names, five of effect `read`, one `destructive` whose description says "Irreversible"

### Requirement: JSON export
`ticketagent tools --json` SHALL print `{"tools": [{"name", "description", "inputSchema", "effect"}]}`.

#### Scenario: Export round-trips
- **WHEN** the command runs
- **THEN** the output parses and lists the twelve names in contract order

### Requirement: Alias map with override
Every contract tool SHALL have a list of alternative server names. `TICKETAGENT_TOOL_MAP` (JSON `{"contract": "server"}`) SHALL take precedence over the built-in aliases; invalid JSON SHALL fail with a message naming the variable.

#### Scenario: Override wins
- **WHEN** `TICKETAGENT_TOOL_MAP='{"jira_search":"my_search"}'` is set
- **THEN** the first candidate for `jira_search` is `my_search`
