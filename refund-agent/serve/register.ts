// Registers this agent with AgentSim as shape "driven", so it appears in the New Run wizard and
// AgentSim calls it. Idempotent: pass --id to replace an existing record rather than add another.
//
//   node serve/register.ts [--url http://localhost:8788] [--id agt_...] [--aliases '{"theirs":"ours"}']
import { parseArgs } from "node:util";

const { values: opt } = parseArgs({
  options: { url: { type: "string" }, id: { type: "string" }, aliases: { type: "string" }, "agentsim-url": { type: "string" } },
});
const base = opt["agentsim-url"] ?? process.env.AGENTSIM_URL ?? "http://localhost:3000";
const url = opt.url ?? `http://localhost:${process.env.PORT ?? 8788}`;

// Empty by default, and that is the correct default for the World this agent onboards: `npm run
// onboard` drafts a pack carrying `read_ticket` and `escalate_to_human` already, so aliasing them
// onto anything else misroutes every call. A pack that names its tools differently (the older
// `northwind` one does) needs --aliases, in the direction AgentSim reads them: theirs -> ours.
const toolAliases = opt.aliases ? (JSON.parse(opt.aliases) as Record<string, string>) : {};

const body = {
  ...(opt.id ? { id: opt.id } : {}),
  name: "refund-agent",
  version: "0.1.0",
  shape: "driven",
  url,
  toolAliases,
  description: "Northwind Outdoor refund desk. Reads a ticket, checks the order and its payments, refunds or escalates.",
  notes: "Driven: AgentSim POSTs the Task Brief; the agent forwards its tool calls back to the Run.",
};

const res = await fetch(`${base}/api/agents`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.error(`AgentSim refused the registration: HTTP ${res.status} ${text.slice(0, 300)}`);
  process.exit(1);
}

const agent = JSON.parse(text) as { id: string; shape: string; url: string };
console.log(`${res.status === 200 ? "replaced" : "registered"}  ${agent.id}  shape=${agent.shape}  url=${agent.url}`);
console.log(`aliases: ${JSON.stringify(toolAliases)}`);
console.log(`\nStart a Run for it at ${base} — no commands, just the wizard.`);
console.log(`Keep the endpoint up:  npm run serve`);
