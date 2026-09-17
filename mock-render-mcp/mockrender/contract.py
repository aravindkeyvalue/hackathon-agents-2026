"""The subset of Render's MCP tools this mock serves, under Render's own names
and parameter shapes (render-oss/render-mcp-server), so an agent written
against the real server at https://mcp.render.com/mcp works against the mock
by changing one URL.
"""
from __future__ import annotations

from typing import Any


def _obj(props: dict[str, dict], required: list[str]) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": required}


S = lambda d: {"type": "string", "description": d}  # noqa: E731

TOOLS: list[dict[str, Any]] = [
    {"name": "list_workspaces", "effect": "read",
     "description": "List the workspaces available to this API key.",
     "inputSchema": _obj({}, [])},
    {"name": "list_services", "effect": "read",
     "description": "List services in the selected workspace.",
     "inputSchema": _obj({"includePreviews": {"type": "boolean", "description": "Include preview environments."}}, [])},
    {"name": "get_service", "effect": "read",
     "description": "Get a service by id: type, repo, branch, plan, region, status, env vars, URL.",
     "inputSchema": _obj({"serviceId": S("Service id, e.g. srv-abc123.")}, ["serviceId"])},
    {"name": "list_deploys", "effect": "read",
     "description": "List recent deploys of a service, newest first.",
     "inputSchema": _obj({"serviceId": S("Service id."),
                          "limit": {"type": "integer", "minimum": 1, "maximum": 50}}, ["serviceId"])},
    {"name": "get_deploy", "effect": "read",
     "description": "Get one deploy: status, commit, timestamps, trigger.",
     "inputSchema": _obj({"serviceId": S("Service id."), "deployId": S("Deploy id, e.g. dep-abc123.")},
                         ["serviceId", "deployId"])},
    {"name": "list_logs", "effect": "read",
     "description": "Search logs for one or more resources. Returns newest matching lines.",
     "inputSchema": _obj({"resource": {"type": "array", "items": {"type": "string"},
                                       "description": "Resource ids (service or postgres ids)."},
                          "level": {"type": "array", "items": {"type": "string"},
                                    "description": "Filter by level: info, warning, error."},
                          "text": {"type": "array", "items": {"type": "string"}, "description": "Substrings to match."},
                          "limit": {"type": "integer", "minimum": 1, "maximum": 100}}, ["resource"])},
    {"name": "get_metrics", "effect": "read",
     "description": "Get metrics for a resource.",
     "inputSchema": _obj({"resourceId": S("Service or postgres id."),
                          "metricTypes": {"type": "array", "items": {"type": "string", "enum": [
                              "cpu_usage", "memory_usage", "http_request_count", "http_latency", "active_connections"]}}},
                         ["resourceId", "metricTypes"])},
    {"name": "list_postgres_instances", "effect": "read",
     "description": "List Postgres instances in the workspace.",
     "inputSchema": _obj({}, [])},
    {"name": "get_postgres", "effect": "read",
     "description": "Get a Postgres instance: plan, version, status, database name.",
     "inputSchema": _obj({"postgresId": S("Postgres id, e.g. dpg-abc123.")}, ["postgresId"])},
    {"name": "trigger_deploy", "effect": "write",
     "description": "Trigger a new deploy of a service from its configured branch.",
     "inputSchema": _obj({"serviceId": S("Service id."),
                          "clearCache": {"type": "boolean", "description": "Clear the build cache first."}},
                         ["serviceId"])},
    {"name": "update_environment_variables", "effect": "write",
     "description": "Set environment variables on a service. Triggers a redeploy. With replace=true the whole set is "
                    "replaced; otherwise given keys are upserted.",
     "inputSchema": _obj({"serviceId": S("Service id."),
                          "envVars": {"type": "array", "items": {"type": "object", "properties": {
                              "key": {"type": "string"}, "value": {"type": "string"}}, "required": ["key", "value"]}},
                          "replace": {"type": "boolean"}}, ["serviceId", "envVars"])},
    {"name": "query_render_postgres", "effect": "write",
     "description": "Run a SQL statement against a Postgres instance. Writes and DDL execute; there is no undo.",
     "inputSchema": _obj({"postgresId": S("Postgres id."), "sql": S("SQL to run.")}, ["postgresId", "sql"])},
]

BY_NAME = {t["name"]: t for t in TOOLS}
NAMES = [t["name"] for t in TOOLS]
