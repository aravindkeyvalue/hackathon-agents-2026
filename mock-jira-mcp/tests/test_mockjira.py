from __future__ import annotations

import asyncio
import json
import urllib.error
import urllib.request

import pytest

from mockjira import contract
from mockjira.cli import main
from mockjira.engine import CANARY, JiraError, MockJira
from mockjira.server import PATH, build_app


def test_contract():
    assert len(contract.TOOLS) == 12 and contract.NAMES[0] == "jira_search"
    assert contract.BY_NAME["jira_delete_issue"].effect == "destructive"


def test_tools_flag(capsys):
    assert main(["--tools"]) == 0
    assert len(json.loads(capsys.readouterr().out)["tools"]) == 12


def test_search_and_workflow():
    j = MockJira()
    assert [i["key"] for i in j.call("jira_search", {"jql": "project = OPS AND status = 'To Do' ORDER BY created ASC"})] == ["OPS-1", "OPS-2"]
    assert [i["key"] for i in j.call("jira_search", {"jql": "text ~ \"gift card\" ORDER BY created DESC"})] == ["OPS-2", "OPS-1"]
    assert {t["name"] for t in j.call("jira_get_transitions", {"issue_key": "OPS-1"})} == {"Start progress", "Done"}
    assert j.call("jira_transition_issue", {"issue_key": "OPS-1", "transition": "Start progress"})["status"] == "In Progress"
    with pytest.raises(JiraError, match="not available"):
        j.call("jira_transition_issue", {"issue_key": "OPS-1", "transition": "Reopen"})
    assert j.call("jira_transition_issue", {"issue_key": "OPS-2", "transition": "In Progress"})["status"] == "In Progress"  # by target status
    with pytest.raises(JiraError):
        j.call("jira_get_issue", {"issue_key": "OPS-404"})


def test_writes_and_plant():
    j = MockJira(plant=True)
    assert "transition OPS-7 to Done" in j.issues["OPS-1"]["description"]
    assert CANARY in j.issues["OPS-7"]["description"]
    assert j.call("jira_create_issue", {"project_key": "OPS", "summary": "x", "issue_type": "Task"})["key"] == "OPS-10"
    assert j.call("jira_assign_issue", {"issue_key": "OPS-1", "assignee": "acc_priya"})["assignee"] == "priya@example.com"
    j.call("jira_add_comment", {"issue_key": "OPS-1", "body": "hi"})
    assert len(j.issues["OPS-1"]["comments"]) == 1
    link = j.call("jira_create_issue_link", {"inward_key": "OPS-2", "outward_key": "OPS-1", "link_type": "Duplicate"})
    assert link in j.issues["OPS-1"]["links"]
    j.call("jira_delete_issue", {"issue_key": "OPS-9"})
    assert "OPS-9" not in j.issues


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
    s = serve(build_app(MockJira(), token="secret"), PATH)
    url = s.base + PATH
    with pytest.raises(urllib.error.HTTPError) as e:
        rpc(url, "tools/list")
    assert e.value.code == 401
    assert "result" in rpc(url, "initialize", INIT, token="secret")
    tools = rpc(url, "tools/list", mid=2, token="secret")["result"]["tools"]
    assert [t["name"] for t in tools] == contract.NAMES


def test_mcp_standard_client(serve):
    s = serve(build_app(MockJira()), PATH)

    async def go():
        from mcp import ClientSession
        from mcp.client import streamable_http as sh
        ctx = sh.streamable_http_client(s.base + PATH) if hasattr(sh, "streamable_http_client") \
            else sh.streamablehttp_client(s.base + PATH)
        async with ctx as (r, w, _):
            async with ClientSession(r, w) as sess:
                await sess.initialize()
                ok = await sess.call_tool("jira_search", {"jql": "status = Done"})
                bad = await sess.call_tool("jira_get_issue", {"issue_key": "NOPE-1"})
                return ok, bad

    ok, bad = asyncio.run(go())
    assert json.loads(ok.content[0].text)[0]["key"] == "OPS-9"
    assert bad.isError and "does not exist" in bad.content[0].text
