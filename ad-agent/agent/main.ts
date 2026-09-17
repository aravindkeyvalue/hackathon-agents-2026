// Run the agent on its own, like an operator would, or against a scored AgentSim Run.
//
//   node agent/main.ts [--brand <file>] [--brief <file|text>] [--render]
//     Its own world: fixtures on disk, the in-process ledger, WaveSpeed behind --render.
//
//   node agent/main.ts --agentsim <runId> [--agentsim-url <base>] [--finish]
//     Integration shape B. AgentSim holds the world; every tool call is forwarded to the Run and
//     the Task Brief comes from it, so --brand, --brief and --render do not apply.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { runAgent } from "./agent.ts";
import { localDispatch } from "./dispatch.ts";
import { AgentSimError, fetchBrief, finishRun, forwardingDispatch } from "../lib/agentsim.ts";
import { ROOT, createWorld, fixture, type World } from "../world/services.ts";

try { process.loadEnvFile(join(ROOT, ".env")); } catch { /* no .env: rely on the shell */ }

const { values: opt } = parseArgs({
  options: {
    brand: { type: "string" },
    brief: { type: "string" },
    render: { type: "boolean" },
    agentsim: { type: "string" },
    "agentsim-url": { type: "string" },
    finish: { type: "boolean" },
  },
});

const base = opt["agentsim-url"] ?? process.env.AGENTSIM_URL ?? "http://localhost:3000";

const main = () => (opt.agentsim ? againstAgentSim(opt.agentsim) : againstOwnWorld());

/** Shape B: the Run owns the world, the brief and the ledger. Nothing local is read. */
async function againstAgentSim(id: string): Promise<void> {
  console.log(`run:       ${id}`);
  console.log(`forwarder: ${base}/api/runs/${id}/call\n`);
  const brief = await fetchBrief(base, id);
  console.log(`--- task brief ---\n${brief.trim()}\n------------------\n`);

  report(await runAgent(brief, forwardingDispatch(base, id)));

  if (opt.finish) {
    console.log("\nfinishing the run for evaluation...");
    console.log(JSON.stringify(await finishRun(base, id), null, 2).slice(0, 2000));
  } else {
    console.log(`\nRun still open. Evaluate it with --finish, or on ${base}/runs/${id}`);
  }
}

async function againstOwnWorld(): Promise<void> {
  const brandPath = opt.brand ?? fixture("brand-clean.pdf");
  if (!existsSync(brandPath)) {
    console.error(`brand file not found: ${brandPath}`);
    process.exit(2);
  }
  const brief = opt.brief ? (existsSync(opt.brief) ? readFileSync(opt.brief, "utf8") : opt.brief) : readFileSync(fixture("brief.md"), "utf8");

  const world = createWorld({ brandPath: resolve(brandPath), renderDir: opt.render ? join(ROOT, "runs", "agent") : undefined });
  report(await runAgent(brief, localDispatch(world)));

  if (opt.render) renders(world);
}

function report(run: { model: string; stop: string; toolCalls: readonly { name: string; input: unknown }[]; summary: string }): void {
  console.log(`${run.model}, stop=${run.stop}\n`);
  for (const c of run.toolCalls) console.log(`-> ${c.name} ${JSON.stringify(c.input)}`);
  console.log(`\n${run.summary}`);
}

function renders(world: World): void {
  console.log("\nrenders:");
  if (!world.renders.log.length) console.log(" - none attempted (no WAVESPEED_API_KEY, or the request was outside the mandate)");
  for (const r of world.renders.log) console.log(r.rendered ? ` - ${r.id}: ${r.files.join(", ")}` : ` - ${r.id}: FAILED ${r.error}`);
}

// A missing key, an unknown Run, a finished Run: setup mistakes, not bugs. Say so in one line.
main().catch((e: unknown) => {
  console.error(e instanceof AgentSimError ? `agentsim: ${e.message}` : e instanceof Error ? e.message : String(e));
  process.exit(1);
});
