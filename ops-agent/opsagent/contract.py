"""The Render tools this agent is written against — the names and parameter
shapes of Render's own MCP server (render-oss/render-mcp-server, hosted at
https://mcp.render.com/mcp), so the agent works against the real server, a
mock of it, or a testing harness's sandbox by changing one URL. Explicit
schemas: what the model is prompted with is exactly what the server serves.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

Effect = Literal["read", "write", "destructive"]


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    schema: dict[str, Any]
    effect: Effect = "read"

    @property
    def required(self) -> list[str]:
        return list(self.schema.get("required") or [])

    @property
    def params(self) -> dict[str, dict]:
        return dict(self.schema.get("properties") or {})

    def as_json(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "inputSchema": self.schema, "effect": self.effect}


TOOLS: list[Tool] = [
    Tool('list_workspaces',
         'List the workspaces available to this API key.',
         {"type": "object", "properties": {}, "required": []},
         'read'),
    Tool('list_services',
         'List services in the selected workspace.',
         {"type": "object", "properties": {"includePreviews": {"type": "boolean", "description": "Include preview environments."}}, "required": []},
         'read'),
    Tool('get_service',
         'Get a service by id: type, repo, branch, plan, region, status, env vars, URL.',
         {"type": "object", "properties": {"serviceId": {"type": "string", "description": "Service id, e.g. srv-abc123."}}, "required": ["serviceId"]},
         'read'),
    Tool('list_deploys',
         'List recent deploys of a service, newest first.',
         {"type": "object", "properties": {"serviceId": {"type": "string", "description": "Service id."}, "limit": {"type": "integer", "minimum": 1, "maximum": 50}}, "required": ["serviceId"]},
         'read'),
    Tool('get_deploy',
         'Get one deploy: status, commit, timestamps, trigger.',
         {"type": "object", "properties": {"serviceId": {"type": "string", "description": "Service id."}, "deployId": {"type": "string", "description": "Deploy id, e.g. dep-abc123."}}, "required": ["serviceId", "deployId"]},
         'read'),
    Tool('list_logs',
         'Search logs for one or more resources. Returns newest matching lines.',
         {"type": "object", "properties": {"resource": {"type": "array", "items": {"type": "string"}, "description": "Resource ids (service or postgres ids)."}, "level": {"type": "array", "items": {"type": "string"}, "description": "Filter by level: info, warning, error."}, "text": {"type": "array", "items": {"type": "string"}, "description": "Substrings to match."}, "limit": {"type": "integer", "minimum": 1, "maximum": 100}}, "required": ["resource"]},
         'read'),
    Tool('get_metrics',
         'Get metrics for a resource.',
         {"type": "object", "properties": {"resourceId": {"type": "string", "description": "Service or postgres id."}, "metricTypes": {"type": "array", "items": {"type": "string", "enum": ["cpu_usage", "memory_usage", "http_request_count", "http_latency", "active_connections"]}}}, "required": ["resourceId", "metricTypes"]},
         'read'),
    Tool('list_postgres_instances',
         'List Postgres instances in the workspace.',
         {"type": "object", "properties": {}, "required": []},
         'read'),
    Tool('get_postgres',
         'Get a Postgres instance: plan, version, status, database name.',
         {"type": "object", "properties": {"postgresId": {"type": "string", "description": "Postgres id, e.g. dpg-abc123."}}, "required": ["postgresId"]},
         'read'),
    Tool('trigger_deploy',
         'Trigger a new deploy of a service from its configured branch.',
         {"type": "object", "properties": {"serviceId": {"type": "string", "description": "Service id."}, "clearCache": {"type": "boolean", "description": "Clear the build cache first."}}, "required": ["serviceId"]},
         'write'),
    Tool('update_environment_variables',
         'Set environment variables on a service. Triggers a redeploy. With replace=true the whole set is replaced; otherwise given keys are upserted.',
         {"type": "object", "properties": {"serviceId": {"type": "string", "description": "Service id."}, "envVars": {"type": "array", "items": {"type": "object", "properties": {"key": {"type": "string"}, "value": {"type": "string"}}, "required": ["key", "value"]}}, "replace": {"type": "boolean"}}, "required": ["serviceId", "envVars"]},
         'write'),
    Tool('query_render_postgres',
         'Run a SQL statement against a Postgres instance. Writes and DDL execute; there is no undo.',
         {"type": "object", "properties": {"postgresId": {"type": "string", "description": "Postgres id."}, "sql": {"type": "string", "description": "SQL to run."}}, "required": ["postgresId", "sql"]},
         'destructive'),
]

BY_NAME: dict[str, Tool] = {t.name: t for t in TOOLS}
NAMES: list[str] = [t.name for t in TOOLS]


def export() -> dict[str, Any]:
    return {"tools": [t.as_json() for t in TOOLS]}
