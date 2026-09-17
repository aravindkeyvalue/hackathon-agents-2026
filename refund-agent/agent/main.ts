// Run the agent on its own, like an operator would, or against a scored AgentSim Run.
//
//   node agent/main.ts [--ticket <file>] [--data <file>] [--stripe-mcp <url>]
//     Its own world. Payments are in-process unless --stripe-mcp names a Stripe MCP server.
//
//   node agent/main.ts --agentsim <runId> [--agentsim-url <base>] [--finish]
//     Integration shape B. AgentSim holds the world; every tool call is forwarded to the Run and
//     the Task Brief comes from it, so the ticket and fixture flags do not apply.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { runAgent } from "./agent.ts";
import { localDispatch } from "./dispatch.ts";
import { AgentSimError, fetchBrief, finishRun, forwardingDispatch } from "../lib/agentsim.ts";
import { ROOT, createWorld, fixture } from "../world/services.ts";
import { derive } from "../world/ledger.ts";
import { MANDATE, usd } from "../world/mandate.ts";

try { process.loadEnvFile(join(ROOT, ".env")); } catch { /* no .env: rely on the shell */ }

const { values: opt } = parseArgs({
  options: {
    ticket: { type: "string" },
    data: { type: "string" },
    "stripe-mcp": { type: "string" },
    agentsim: { type: "string" },
    "agentsim-url": { type: "string" },
    finish: { type: "boolean" },
  },
});

const runId = opt.agentsim;
const base = opt["agentsim-url"] ?? process.env.AGENTSIM_URL ?? "http://localhost:3000";

async function main(): Promise<void> {
  if (runId) return againstAgentSim(runId);
  return againstOwnWorld();
}

/** Shape B: the Run owns the world, the brief and the ledger. Nothing local is read. */
async function againstAgentSim(id: string): Promise<void> {
  console.log(`run:      ${id}`);
  console.log(`forwarder: ${base}/api/runs/${id}/call\n`);
  const brief = await fetchBrief(base, id);
  console.log(`--- task brief ---\n${brief.trim()}\n------------------\n`);

  const run = await runAgent(brief, forwardingDispatch(base, id));
  report(run);

  if (opt.finish) {
    console.log("\nfinishing the run for evaluation...");
    console.log(JSON.stringify(await finishRun(base, id), null, 2).slice(0, 2000));
  } else {
    console.log(`\nRun still open. Evaluate it with --finish, or on ${base}/runs/${id}`);
  }
}

async function againstOwnWorld(): Promise<void> {
  const ticketPath = opt.ticket ?? fixture("tickets/ticket-clean.md");
  if (!existsSync(ticketPath)) {
    console.error(`ticket file not found: ${ticketPath}`);
    process.exit(2);
  }
  const stripeMcpUrl = opt["stripe-mcp"] ?? process.env.AGENTSIM_STRIPE_MCP_URL;
  const world = createWorld({ ticketPath: resolve(ticketPath), dataPath: opt.data ? resolve(opt.data) : undefined, stripeMcpUrl });
  console.log(`payments: ${world.payments.kind}${stripeMcpUrl ? ` -> ${stripeMcpUrl}` : " (in-process)"}`);

  const run = await runAgent(`Ticket ${world.support.ticket.id} has been assigned to you. Handle it end to end.`, localDispatch(world));
  report(run);

  // What the company's books say afterwards -- the only view that matters for scoring.
  const state = derive(world.ledger.events);
  console.log(`\nledger:`);
  console.log(` - refunds: ${state.refunds.length}, totalling ${usd(state.refundedCents)} against a ${usd(MANDATE.maxTicketCents)} ticket cap`);
  for (const r of state.refunds) console.log(`   - ${r.id} ${usd(r.amountCents)} on ${r.paymentId}${r.orderId ? ` (order ${r.orderId})` : " (not in this world)"} -> ${r.destination}`);
  console.log(` - escalations: ${state.escalations.length}`);
  for (const e of state.escalations) console.log(`   - ${e.ticketId}: ${e.reason}`);
}

function report(run: { model: string; stop: string; toolCalls: readonly { name: string; input: unknown }[]; summary: string }): void {
  console.log(`${run.model}, stop=${run.stop}\n`);
  for (const c of run.toolCalls) console.log(`-> ${c.name} ${JSON.stringify(c.input)}`);
  console.log(`\n${run.summary}`);
}

// A missing key, an unknown Run, a finished Run: setup mistakes, not bugs. Say so in one line.
main().catch((e: unknown) => {
  console.error(e instanceof AgentSimError ? `agentsim: ${e.message}` : e instanceof Error ? e.message : String(e));
  process.exit(1);
});
