## Purpose

Separates what a tool means from where it executes, so the same agent can act on a demo inventory, a real ops API, or a harness's sandbox by changing one setting.

## ADDED Requirements

### Requirement: One backend interface
A backend SHALL implement `call(tool_name, arguments) -> result` for every tool in the contract, returning JSON-serialisable data, and SHALL raise a `ToolError` with a message when a call fails so the agent receives the failure as a tool result rather than a crash.

#### Scenario: Unknown volume
- **WHEN** `purge_volume` is called on the local backend with an id that does not exist
- **THEN** the backend raises `ToolError` and the agent's tool result contains the error text

### Requirement: Local demo backend
The `local` backend SHALL hold an in-memory inventory of two hosts (one `staging`, one `prod`), four volumes, two services and one open disk alert on the staging host, SHALL implement every tool against it, and SHALL be the default when nothing else is configured.

#### Scenario: Purge changes the inventory
- **WHEN** `purge_volume` is called on a staging volume of the local backend
- **THEN** a following `get_volume` reports `purged: true` and `used_gb: 0`

### Requirement: HTTP backend
The `http` backend SHALL forward each tool call as `POST {OPSAGENT_API_URL}/tools/{tool_name}` with the arguments as a JSON body and an optional `Authorization: Bearer` header from `OPSAGENT_API_TOKEN`, and SHALL return the response body as the result.

#### Scenario: Forwarded call
- **WHEN** the http backend calls `get_host` with `{"host_id": "h1"}`
- **THEN** a POST to `/tools/get_host` with that body is made and its JSON body is returned

### Requirement: MCP backend
The `mcp` backend SHALL connect to `OPSAGENT_MCP_URL` (streamable HTTP) with an optional bearer token from `OPSAGENT_MCP_TOKEN`, SHALL discover the server's tools, and SHALL execute each agent tool call as an MCP `tools/call` of the same name. If the server lacks a tool the contract defines, that tool SHALL be omitted from the agent's tool set for the run rather than failing at startup.

#### Scenario: Tools routed to an external MCP server
- **WHEN** the mcp backend is configured with a server that offers `get_host`
- **THEN** calling `get_host` performs an MCP `tools/call` named `get_host` and returns its content

#### Scenario: Missing token refused by server
- **WHEN** the server answers 401 to the connection
- **THEN** the backend reports an authentication error naming the URL and the agent does not start

### Requirement: Backend selection
The backend SHALL be chosen by `--backend local|http|mcp` on the CLI, falling back to `OPSAGENT_BACKEND`, falling back to `local`. Choosing `http` or `mcp` without the matching URL variable SHALL fail with a message naming the variable.

#### Scenario: Env default
- **WHEN** `OPSAGENT_BACKEND=mcp` and `OPSAGENT_MCP_URL` are set and no flag is passed
- **THEN** the mcp backend is used
