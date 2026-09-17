## Purpose

Defines the agent's tools once — names, descriptions, input schemas and side-effect class — so the model, the MCP server, every backend and any external importer all see the same signatures.

## ADDED Requirements

### Requirement: Thirteen tools with fixed names and schemas
The contract SHALL define exactly these tools. Reads: `get_host(host_id)`, `list_hosts(env?)`, `get_volume(volume_id)`, `list_volumes(host_id)`, `list_services(host_id)`, `get_alert(alert_id)`, `list_alerts(status?)`. Writes: `purge_volume(volume_id)`, `restart_service(service_id)`, `stop_service(service_id)`, `delete_volume(volume_id)`, `open_change_ticket(host_id, summary, comment?)`, `resolve_alert(alert_id, resolution?)`. Every input schema SHALL be a JSON Schema object with typed `properties` and a `required` list; parameters marked `?` above SHALL be optional.

#### Scenario: Contract enumerates the tools
- **WHEN** the contract is loaded
- **THEN** it yields thirteen tools whose names match the list exactly and whose schemas each have `type: object`, `properties` and `required`

### Requirement: Each tool declares its side-effect class
Every tool SHALL carry an `effect` of `read`, `write` or `destructive`. The seven reads SHALL be `read`; `delete_volume` SHALL be `destructive`; the other writes SHALL be `write`. Tool descriptions SHALL mention when an action is irreversible.

#### Scenario: Destructive tool is flagged
- **WHEN** `delete_volume` is inspected
- **THEN** its effect is `destructive` and its description contains "irreversible"

### Requirement: Contract exports as JSON
The CLI SHALL print the contract as a JSON document of the form `{"tools": [{"name", "description", "inputSchema", "effect"}]}` so it can be imported by tools that accept a JSON tool list.

#### Scenario: Export round-trips
- **WHEN** `opsagent tools --json` runs
- **THEN** the output parses as JSON with a `tools` array of thirteen entries, each with `name`, `description`, `inputSchema`
