## Context

See proposal.md. The four projects (infra-agent, ticket-agent, mock-render-mcp, mock-jira-mcp) are independent: each has its own `pyproject`, is started with its own command, and none imports another. The only coupling is a URL and a tool contract.

## Goals / Non-Goals

**Goals:** one command starts each piece; an agent is configured entirely by the MCP URL (+ token); mocks serve the real platforms' tool names so agents work unchanged against the real servers.
**Non-Goals:** shared code between projects (duplication is accepted for independence); stdio MCP transport; full fidelity of the mocked platforms.

## Decisions

- **Agents are MCP-only.** No in-process backends, no HTTP backend, no agent-side MCP server. Fewer moving parts; the integration surface is exactly what a customer's agent would have.
- **Mocks are separate projects with the real tool names** (Render: `render-oss/render-mcp-server`; Jira: `mcp-atlassian`), so the same agent binary can be pointed at the mock or the real endpoint.
- **Stateless JSON streamable HTTP** on the mocks, so minimal importers (two POSTs, `Accept: application/json`) and the official client both work.
- **Tests stay independent**: each agent's tests run an in-test stub MCP server rather than importing a mock project.
- **`mcp<2`**: the 2.x SDK changed the low-level server API; pinned until the servers are ported.

## Risks / Trade-offs

- [Duplicated MCP server code across the two mocks] → accepted for independence; small.
- [Mock fidelity] → documented as a subset; agents drop tools a server lacks rather than fail.
- [Scripted doubles mistaken for models] → labelled "scripted test double (no LLM)" everywhere.
