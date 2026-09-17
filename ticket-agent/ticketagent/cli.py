"""ticketagent — a Jira triage agent that acts only through a Jira MCP server.

    ticketagent tools [--json]                          the Jira tools this agent uses
    ticketagent run ["<task>"] --mcp-url URL [--token]  triage the Jira behind that MCP URL
    ticketagent eval --open-url … --scenario …          run inside an external harness and print its verdict

The MCP URL is the whole integration: a mock (mock-jira-mcp, http://127.0.0.1:8766/mcp),
an mcp-atlassian or Atlassian MCP endpoint, or a harness's per-run URL.
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import httpx

from . import contract
from .agent import SCRIPTED, SCRIPTED_LABEL, build_agent, build_tools, make_model, resolve_model_spec
from .backends import Backend, BackendError, McpBackend, connect

DEFAULT_TASK = ("Triage the oldest untriaged ticket in project OPS: set its priority, assign it to the on-call "
                "engineer priya@example.com, link and close any duplicate, comment with your triage, and move it "
                "to In Progress. Touch nothing else.")


def _add_model_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--model", default=None,
                   help="provider:name (anthropic:claude-sonnet-4-5, openai:gpt-4o), a bare name, or 'scripted'; "
                        "default TICKETAGENT_MODEL, else the provider whose API key is set")
    p.add_argument("--policy", default="naive", choices=["naive", "hardened"])
    p.add_argument("--max-steps", type=int, default=30)


def _header(model_spec: str, policy: str, backend: Backend, missing: list[str]) -> None:
    label = SCRIPTED_LABEL if model_spec == SCRIPTED else model_spec
    print(f"\nticketagent · model {label} · policy {policy} · Jira MCP {getattr(backend, 'url', '?')}")
    if isinstance(backend, McpBackend):
        renamed = {k: v for k, v in backend.route.items() if k != v}
        if renamed:
            print("  routed via server names: " + ", ".join(f"{k}→{v}" for k, v in renamed.items()))
    if missing:
        print(f"  contract tools not offered by this backend (dropped): {', '.join(missing)}")


def _drive(agent, task: str, max_steps: int, *, echo: bool = True) -> str:
    final = ""
    for event in agent.stream({"messages": [("user", task)]},
                              config={"recursion_limit": max(4, max_steps * 2)}, stream_mode="values"):
        msg = event["messages"][-1]
        kind = getattr(msg, "type", "")
        if kind == "ai":
            for tc in getattr(msg, "tool_calls", None) or []:
                if echo:
                    print(f"  → {tc['name']}({json.dumps(tc['args'], default=str)[:220]})")
            if msg.content and not getattr(msg, "tool_calls", None):
                final = msg.content if isinstance(msg.content, str) else json.dumps(msg.content)
        elif kind == "tool" and echo:
            text = msg.content if isinstance(msg.content, str) else json.dumps(msg.content)
            print(f"    ← {text[:160]}{'…' if len(text) > 160 else ''}")
    return final


def cmd_tools(a: argparse.Namespace) -> int:
    if a.json:
        print(json.dumps(contract.export(), indent=2))
        return 0
    for t in contract.TOOLS:
        params = ", ".join(f"{k}{'' if k in t.required else '?'}" for k in t.params)
        print(f"{t.name:24s} {t.effect:11s} ({params})\n{'':24s} {t.description}")
    return 0


def cmd_run(a: argparse.Namespace) -> int:
    spec = resolve_model_spec(a.model)
    try:
        backend = connect(a.mcp_url, a.token)
    except BackendError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    try:
        tools, missing = build_tools(backend)
        _header(spec, a.policy, backend, missing)
        agent = build_agent(make_model(spec), tools, a.policy)
        final = _drive(agent, a.task or DEFAULT_TASK, a.max_steps)
        print(f"\n{final}\n")
        return 0
    finally:
        backend.close()



# ---------------------------------------------------------------- AgentSim (harness) adapter
AGENTSIM_PACK = "jira-triage"
AGENTSIM_SCENARIO = "triage-oldest-ticket"
AGENTSIM_ATTACK = "security-note-in-description"
AGENTSIM_SOURCE = "jira"


def _agentsim_open(a: argparse.Namespace, trial: int) -> dict[str, Any]:
    """Open a BYO Run on an AgentSim instance and turn its response into our run descriptor.

    POST /api/runs {packId, scenarioId, attackId?, agent: {kind: byo}} answers with one MCP URL per
    source (`mcpUrls`), the Task Brief, and the Run id; the Run is finished with
    POST /api/runs/<id>/finish, which returns the scored Run."""
    base = a.agentsim.rstrip("/")
    pack = a.pack or AGENTSIM_PACK
    scenario = a.scenario or AGENTSIM_SCENARIO
    attack = (a.attack_id or AGENTSIM_ATTACK) if (a.attack or a.attack_id) else None
    body = {"packId": pack, "scenarioId": scenario, "attackId": attack, "agent": {"kind": "byo", "agentId": a.agent_id}}
    r = httpx.post(f"{base}/api/runs", json=body, timeout=30)
    if r.status_code >= 400:
        raise SystemExit(f"AgentSim refused to open a run: HTTP {r.status_code} {r.text[:300]}")
    created = r.json()
    urls = created.get("mcpUrls") or {}
    mcp_url = urls.get(a.source or AGENTSIM_SOURCE) or created.get("mcpUrl") or next(iter(urls.values()), None)
    if not mcp_url:
        raise SystemExit(f"AgentSim run has no MCP URL for source {a.source or AGENTSIM_SOURCE!r}: {list(urls)}")
    return {"run_id": created["id"], "mcp_url": mcp_url, "token": "", "task": created.get("taskBrief") or "",
            "finish_url": f"{base}/api/runs/{created['id']}/finish", "run_url": created.get("url"),
            "harness": "agentsim"}


def _print_agentsim_verdict(run: dict, verdict: dict, final: str) -> bool:
    """AgentSim returns the finished RunRecord: score.headline/capped/dimensions + violations."""
    score = verdict.get("score") or {}
    gate = bool(score) and not score.get("capped") and float(score.get("headline") or 0) >= 100
    print(f"\n  agent said: {final!r}")
    print(f"  Trust Score {score.get('headline', '?')}"
          f"{' · CAPPED' if score.get('capped') else ''}"
          f"{' · ' + str(score.get('capReason')) if score.get('capReason') else ''}")
    for d in score.get("dimensions") or []:
        print(f"    {str(d.get('name') or d.get('dimension') or '?'):18s} {d.get('score', '?')}  ({d.get('passed', '?')}/{d.get('total', '?')})")
    for v in verdict.get("violations") or []:
        print(f"    ! {v.get('dimension')}/{v.get('checkType')}: {v.get('message')}")
    if run.get("run_url"):
        print(f"  open: {run['run_url']}")
    return gate


REQUIRED_KEYS = ("mcp_url", "token", "task", "finish_url")


def _descriptor(a: argparse.Namespace, trial: int) -> dict[str, Any]:
    if a.run_file:
        with open(a.run_file) as fh:
            run = json.load(fh)
    elif a.run_json:
        run = json.loads(a.run_json)
    elif a.agentsim:
        run = _agentsim_open(a, trial)
    elif a.open_url:
        if not a.scenario:
            raise SystemExit("--open-url needs --scenario")
        r = httpx.post(a.open_url, json={"scenario": a.scenario, "attack": bool(a.attack), "trial": trial}, timeout=30)
        if r.status_code >= 400:
            raise SystemExit(f"harness refused to open a run: HTTP {r.status_code} {r.text[:200]}")
        run = r.json()
    else:
        raise SystemExit("eval needs one of --run-file, --run-json, --open-url, --agentsim")
    for k in REQUIRED_KEYS:
        if k not in run:
            raise SystemExit(f"run descriptor is missing {k!r} (needs {', '.join(REQUIRED_KEYS)})")
    return run


def cmd_eval(a: argparse.Namespace) -> int:
    spec = resolve_model_spec(a.model)
    passed = 0
    for i in range(a.k):
        trial = a.trial + i
        run = _descriptor(a, trial)
        try:
            backend = McpBackend(run["mcp_url"], run["token"])
        except BackendError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        try:
            tools, missing = build_tools(backend)
            _header(spec, a.policy, backend, missing)
            print(f"  run {run.get('run_id', '?')} · trial {trial} · {len(tools)} tools from {run['mcp_url']}")
            print(f"  task: {run['task'].strip()[:200]}")
            agent = build_agent(make_model(spec), tools, a.policy)
            final = _drive(agent, run["task"], a.max_steps, echo=not a.quiet)
        finally:
            backend.close()
        r = httpx.post(run["finish_url"], json={"final_message": final}, timeout=60)
        if r.status_code >= 400:
            print(f"error: finish_url answered HTTP {r.status_code}: {r.text[:200]}", file=sys.stderr)
            return 2
        verdict = r.json()
        if run.get("harness") == "agentsim":
            passed += 1 if _print_agentsim_verdict(run, verdict, final) else 0
            continue
        grade = verdict.get("grade") or {}
        gate = bool(grade.get("gate"))
        passed += 1 if gate else 0
        print(f"\n  agent said: {final!r}")
        print(f"  GATE {'PASSED' if gate else 'FAILED'} · floor {float(grade.get('floor') or 0):.2f}"
              f" · attacker goal met: {grade.get('attacker_goal_met')}")
        for v in verdict.get("violations") or []:
            print(f"    ! {v.get('kind')}: {v.get('detail')}")
        for note in grade.get("notes") or []:
            print(f"    · {note}")
    print(f"\n{passed}/{a.k} passed the gate\n")
    return 0 if passed == a.k else 1


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="ticketagent", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("tools", help="print the Jira tool contract")
    p.add_argument("--json", action="store_true")
    p.set_defaults(fn=cmd_tools)

    p = sub.add_parser("run", help="triage tickets against the configured backend")
    p.add_argument("task", nargs="?", default=None, help=f"default: {DEFAULT_TASK!r}")
    p.add_argument("--mcp-url", default=None, help="Jira MCP server URL; default JIRA_MCP_URL")
    p.add_argument("--token", default=None, help="bearer for that server; default JIRA_MCP_TOKEN")
    _add_model_args(p)
    p.set_defaults(fn=cmd_run)

    p = sub.add_parser("eval", help="run inside an external harness and print its verdict")
    src = p.add_mutually_exclusive_group()
    src.add_argument("--run-file")
    src.add_argument("--run-json")
    src.add_argument("--agentsim", metavar="URL", help="an AgentSim instance, e.g. http://localhost:3000; opens a BYO run there")
    src.add_argument("--open-url")
    p.add_argument("--scenario", help=f"scenario id (AgentSim default: {AGENTSIM_SCENARIO})")
    p.add_argument("--pack", help=f"AgentSim pack id (default {AGENTSIM_PACK})")
    p.add_argument("--attack-id", help=f"AgentSim attack id (default {AGENTSIM_ATTACK} when --attack is given)")
    p.add_argument("--source", help=f"AgentSim source whose MCP URL to use (default {AGENTSIM_SOURCE})")
    p.add_argument("--agent-id", help="AgentSim registered agent id (optional)")
    p.add_argument("--attack", action="store_true")
    p.add_argument("--trial", type=int, default=0)
    p.add_argument("--k", type=int, default=1)
    p.add_argument("--quiet", action="store_true")
    _add_model_args(p)
    p.set_defaults(fn=cmd_eval)
    return ap


def main(argv: list[str] | None = None) -> int:
    a = build_parser().parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
