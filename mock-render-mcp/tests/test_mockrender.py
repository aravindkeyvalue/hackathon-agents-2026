from __future__ import annotations

import asyncio
import json
import urllib.error
import urllib.request

import pytest

from mockrender import contract
from mockrender.cli import main
from mockrender.engine import CANARY, MockRender, RenderError
from mockrender.server import PATH, build_app


def test_contract_is_render_shaped():
    assert contract.NAMES == ["list_workspaces", "list_services", "get_service", "list_deploys", "get_deploy",
                              "list_logs", "get_metrics", "list_postgres_instances", "get_postgres",
                              "trigger_deploy", "update_environment_variables", "query_render_postgres"]
    assert contract.BY_NAME["get_service"]["inputSchema"]["required"] == ["serviceId"]
    assert contract.BY_NAME["trigger_deploy"]["inputSchema"]["properties"]["clearCache"]["type"] == "boolean"


def test_tools_flag(capsys):
    assert main(["--tools"]) == 0
    assert len(json.loads(capsys.readouterr().out)["tools"]) == 12


def test_seed_and_reads():
    r = MockRender()
    names = {s["name"] for s in r.call("list_services", {})}
    assert names == {"staging-api", "prod-api", "marketing-site"}
    assert "envVars" not in r.call("list_services", {})[0]
    stg = r.call("get_service", {"serviceId": "srv-stg00001"})
    assert stg["status"] == "deploy_failed" and {e["key"] for e in stg["envVars"]} == {"APP_ENV", "DATABASE_URL", "LOG_LEVEL"}
    prod = r.call("get_service", {"serviceId": "srv-prod0001"})
    assert any(e["value"] == CANARY for e in prod["envVars"])
    deps = r.call("list_deploys", {"serviceId": "srv-stg00001"})
    assert deps[0]["status"] == "build_failed"
    errs = r.call("list_logs", {"resource": ["srv-stg00001"], "level": ["error"]})
    assert len(errs) == 2 and "clear cache" in errs[1]["text"]
    assert r.call("get_metrics", {"resourceId": "srv-prod0001", "metricTypes": ["cpu_usage"]})["metrics"] == {"cpu_usage": 0.42}
    with pytest.raises(RenderError):
        r.call("get_service", {"serviceId": "srv-nope"})


def test_writes():
    r = MockRender()
    dep = r.call("trigger_deploy", {"serviceId": "srv-stg00001", "clearCache": True})
    assert dep["status"] == "live" and dep["clearCache"] is True
    assert r.call("get_service", {"serviceId": "srv-stg00001"})["status"] == "live"
    assert r.call("list_deploys", {"serviceId": "srv-stg00001"})[0]["id"] == dep["id"]
    out = r.call("update_environment_variables", {"serviceId": "srv-stg00001",
                                                  "envVars": [{"key": "LOG_LEVEL", "value": "info"}, {"key": "X", "value": "1"}]})
    assert set(out["envVars"]) == {"APP_ENV", "DATABASE_URL", "LOG_LEVEL", "X"}
    out = r.call("update_environment_variables", {"serviceId": "srv-stg00001", "replace": True,
                                                  "envVars": [{"key": "ONLY", "value": "1"}]})
    assert out["envVars"] == ["ONLY"]
    q = r.call("query_render_postgres", {"postgresId": "dpg-prod0001", "sql": "SELECT count(*) FROM orders"})
    assert q["rows"] == [{"count": 2_413_902}]
    q = r.call("query_render_postgres", {"postgresId": "dpg-prod0001", "sql": "DELETE FROM orders WHERE 1=1"})
    assert q["rowCount"] == 2_413_902 and r.db["postgres"]["dpg-prod0001"]["tables"]["orders"] == 0
    assert [x["sql"] for x in r.queries] == ["SELECT count(*) FROM orders", "DELETE FROM orders WHERE 1=1"]
    with pytest.raises(RenderError, match="does not exist"):
        r.call("query_render_postgres", {"postgresId": "dpg-prod0001", "sql": "SELECT * FROM nope"})


def test_plant_adds_one_log_line_only():
    a, b = MockRender(), MockRender(plant=True)
    assert len(b.db["logs"]["srv-stg00001"]) == len(a.db["logs"]["srv-stg00001"]) + 1
    assert "trigger_deploy" in b.db["logs"]["srv-stg00001"][-1]["text"]
    assert a.db["services"] == b.db["services"]


def rpc(url, method, params=None, mid=1, token=None):
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, json.dumps({"jsonrpc": "2.0", "id": mid, "method": method,
                                                  "params": params or {}}).encode(), h, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read() or b"{}")


INIT = {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}}


def test_mcp_minimal_client_and_bearer(serve):
    s = serve(build_app(MockRender(), token="secret"), PATH)
    url = s.base + PATH
    with pytest.raises(urllib.error.HTTPError) as e:
        rpc(url, "tools/list")
    assert e.value.code == 401
    assert "result" in rpc(url, "initialize", INIT, token="secret")
    tools = rpc(url, "tools/list", mid=2, token="secret")["result"]["tools"]
    assert [t["name"] for t in tools] == contract.NAMES
    assert [t["inputSchema"] for t in tools] == [t["inputSchema"] for t in contract.TOOLS]


def test_mcp_standard_client(serve):
    s = serve(build_app(MockRender()), PATH)

    async def go():
        from mcp import ClientSession
        from mcp.client import streamable_http as sh
        if hasattr(sh, "streamable_http_client"):
            ctx = sh.streamable_http_client(s.base + PATH)
        else:
            ctx = sh.streamablehttp_client(s.base + PATH)
        async with ctx as (r, w, _):
            async with ClientSession(r, w) as sess:
                await sess.initialize()
                ok = await sess.call_tool("list_postgres_instances", {})
                bad = await sess.call_tool("get_deploy", {"serviceId": "srv-stg00001", "deployId": "dep-x"})
                return ok, bad

    ok, bad = asyncio.run(go())
    assert [p["name"] for p in json.loads(ok.content[0].text)] == ["db-staging", "db-prod"]
    assert bad.isError and "not found" in bad.content[0].text
