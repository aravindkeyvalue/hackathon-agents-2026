// Integration shape B: the agent keeps its own loop and forwards each tool call to a Run.
// AgentSim holds the world and the ledger; this agent contributes only the decisions.
import type { Dispatch } from "../agent/dispatch.ts";
import type { ToolResult } from "../agent/tools.ts";

export class AgentSimError extends Error {}

export const runBase = (base: string, runId: string) => `${base.replace(/\/$/, "")}/api/runs/${encodeURIComponent(runId)}`;

/** The Run's Task Brief, which replaces the brief this agent would otherwise read from fixtures. */
export async function fetchBrief(base: string, runId: string): Promise<string> {
  const res = await fetch(`${runBase(base, runId)}/brief`);
  if (!res.ok) throw new AgentSimError(`could not read the Task Brief for ${runId}: HTTP ${res.status}`);
  return res.text();
}

/** Ends the Run and returns whatever the harness reports about it. */
export async function finishRun(base: string, runId: string): Promise<unknown> {
  const res = await fetch(`${runBase(base, runId)}/finish`, { method: "POST" });
  if (!res.ok) throw new AgentSimError(`could not finish ${runId}: HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

type CallOutcome = { ok: true; result: string } | { ok: false; error: string };

export function forwardingDispatch(base: string, runId: string): Dispatch {
  const url = `${runBase(base, runId)}/call`;
  let seq = 0;
  return async (tool, input, batchId): Promise<ToolResult> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool, input, callId: `call_${++seq}`, batchId }),
    });
    // A refused tool call is a recorded Event and comes back 200 with ok:false. Anything else --
    // an unknown or finished Run -- is a setup problem the agent cannot reason its way out of.
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new AgentSimError(`${tool} -> HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    const outcome = (await res.json()) as CallOutcome;
    return outcome.ok ? { output: outcome.result, isError: false } : { output: outcome.error, isError: true };
  };
}
