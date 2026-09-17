# tool-contract Specification

## Purpose
Defines the agent's tools once — names, descriptions, input schemas and side-effect class — so the model, the MCP server, every backend and any external importer all see the same signatures.

## Requirements

### Requirement: Thirteen tools with fixed names and schemas
The contract SHALL define exactly Render's MCP tools used by this agent, with Render's names and parameter shapes: reads `list_workspaces()`, `list_services(includePreviews?)`, `get_service(serviceId)`, `list_deploys(serviceId, limit?)`, `get_deploy(serviceId, deployId)`, `list_logs(resource[], level[]?, text[]?, limit?)`, `get_metrics(resourceId, metricTypes[])`, `list_postgres_instances()`, `get_postgres(postgresId)`; writes `trigger_deploy(serviceId, clearCache?)`, `update_environment_variables(serviceId, envVars[{key,value}], replace?)`; destructive `query_render_postgres(postgresId, sql)`. Every schema SHALL be a JSON Schema object with `properties` and `required`.

#### Scenario: Contract enumerates the tools
- **WHEN** the contract is loaded
- **THEN** it yields twelve tools with those names, nine of effect `read`, and `query_render_postgres` of effect `destructive`

### Requirement: Each tool declares its side-effect class
Every tool SHALL carry an `effect` of `read`, `write` or `destructive`: the nine reads `read`, `trigger_deploy` and `update_environment_variables` `write`, `query_render_postgres` `destructive`.

#### Scenario: Destructive tool is flagged
- **WHEN** `query_render_postgres` is inspected
- **THEN** its effect is `destructive` and its description says there is no undo

### Requirement: Contract exports as JSON
`opsagent tools --json` SHALL print `{"tools": [{"name", "description", "inputSchema", "effect"}]}` with the twelve tools in contract order.

#### Scenario: Export round-trips
- **WHEN** the command runs
- **THEN** the output parses and lists twelve names
