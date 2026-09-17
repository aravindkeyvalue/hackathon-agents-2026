// Integration shape "driven": AgentSim calls this agent, rather than waiting to be called.
//
// Shape B (`lib/agentsim.ts`) still carries every tool call, so a Run scores exactly as it does
// from the CLI. The only thing that changes is who starts it: AgentSim POSTs the Task Brief here
// when someone presses Run, and finishes the Run itself once this answers. Nothing is typed.
//
//   node serve/driven.ts [--port 8788] [--agentsim-url http://localhost:3000]
import { createServer, type IncomingMessage } from "node:http";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { runAgent } from "../agent/agent.ts";
import { forwardingDispatch } from "../lib/agentsim.ts";
import { ROOT } from "../world/services.ts";

try { process.loadEnvFile(join(ROOT, ".env")); } catch { /* no .env: rely on the shell */ }

const { values: opt } = parseArgs({ options: { port: { type: "string" }, "agentsim-url": { type: "string" } } });
const port = Number(opt.port ?? process.env.PORT ?? 8788);
const base = opt["agentsim-url"] ?? process.env.AGENTSIM_URL ?? "http://localhost:3000";

/** What AgentSim POSTs. `messages` is the exchange so far on a Scenario with a counterpart. */
type Drive = { runId?: string; taskBrief?: string; messages?: { role: "counterpart" | "agent"; content: string }[] };

// A counterpart Scenario calls this endpoint once per turn with a growing `messages`. Keeping the
// provider-native transcript per Run is what makes turn 2 a continuation rather than a fresh agent
// that has forgotten it already refunded something.
const history = new Map<string, readonly unknown[]>();

const readBody = async (req: IncomingMessage): Promise<string> => {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
};

/** The brief on the opening turn; afterwards whatever the counterpart just said. */
function prompt(body: Drive): string {
  const said = (body.messages ?? []).filter((m) => m.role === "counterpart");
  return said.length > 0 ? said[said.length - 1]!.content : (body.taskBrief ?? "");
}

const server = createServer(async (req, res) => {
  const reply = (status: number, payload: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  };

  if (req.method !== "POST") return reply(405, { error: "POST the Task Brief here" });

  let body: Drive;
  try {
    body = JSON.parse((await readBody(req)) || "{}") as Drive;
  } catch {
    return reply(400, { error: "body is not JSON" });
  }

  const runId = body.runId;
  // Without a runId there is nowhere to forward to, and a run that answered anyway would score as
  // an agent that touched nothing. Saying so is more useful than a confident empty reply.
  if (!runId) return reply(400, { error: "no runId: this endpoint answers AgentSim driven Runs" });

  const turn = (body.messages ?? []).length;
  console.log(`[driven] ${runId} turn ${turn} -> forwarding to ${base}`);

  try {
    const run = await runAgent(prompt(body), forwardingDispatch(base, runId), { history: history.get(runId) ?? [] });
    history.set(runId, run.messages);
    console.log(`[driven] ${runId} ${run.toolCalls.length} tool calls, stop=${run.stop}`);
    // AgentSim calls finishRun itself once this response lands; finishing it here would race that.
    return reply(200, { reply: run.summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[driven] ${runId} failed: ${message}`);
    return reply(500, { error: message });
  }
});

server.listen(port, () => {
  console.log(`refund-agent driven endpoint on http://localhost:${port}`);
  console.log(`forwarding tool calls to ${base}/api/runs/<runId>/call`);
  console.log(`register it:  npm run register -- --url http://localhost:${port}`);
});
