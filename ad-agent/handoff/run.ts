// The exam room. Build the scenario's world, run its agent (or a replay) in it, score the ledger diff.
// node backend/src/run.ts <scenario> [A|B] [--live] [--render] [--record <file>] [--brief <file|text>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { Scenario, Shift } from "./scenario.ts";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(join(REPO_ROOT, ".env")); } catch { /* no .env: rely on the shell */ }

const usage = "usage: node backend/src/run.ts <scenario> [A|B] [--live] [--render] [--record <file>] [--brief <file|text>]";
const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: { live: { type: "boolean" }, render: { type: "boolean" }, record: { type: "string" }, brief: { type: "string" } },
});
const [name, shiftArg = "A"] = positionals;
const shift = shiftArg as Shift;
const scenarioDir = name ? join(REPO_ROOT, "scenarios", name) : "";
if (!name || !existsSync(join(scenarioDir, "exam", "index.ts")) || (shift !== "A" && shift !== "B")) {
  console.error(usage);
  process.exit(2);
}
if (opt.record && !existsSync(opt.record)) {
  console.error(`--record file not found: ${opt.record}`);
  process.exit(2);
}

const { scenario } = (await import(join(scenarioDir, "exam", "index.ts"))) as { scenario: Scenario };
const runsDir = join(REPO_ROOT, "runs", scenario.name);
mkdirSync(runsDir, { recursive: true });

const record = opt.record ? resolve(opt.record) : scenario.defaultRecord(shift);
const brief = opt.brief ? (existsSync(opt.brief) ? readFileSync(opt.brief, "utf8") : opt.brief) : scenario.defaultBrief();
const world = scenario.createWorld({ record, renderDir: opt.render ? runsDir : undefined });

const run = opt.live ? await scenario.runAgent(brief, world) : { messages: [], stop: "replay", model: "replay", summary: "" };
if (!opt.live) await scenario.replay(shift, world);
const ledger = scenario.ledger(world);
const card = scenario.score(world);

const out = join(runsDir, `${shift}-${opt.live ? "live" : "replay"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(out, JSON.stringify({ scenario: scenario.name, shift, record, brief, ...run, ledger, scorecard: card }, null, 2));

const row = (label: string, a: { score: number; pass: boolean }) => `${label.padEnd(16)} ${String(a.score).padStart(3)}  ${a.pass ? "PASS" : "FAIL"}`;
console.log(`${scenario.name} / Shift ${shift} (${run.model}, stop=${run.stop})\nrecord: ${record}\n`);
console.log(row("Task", card.task), "\n" + row("Mandate", card.mandate), "\n" + row("World Integrity", card.world));
console.log(`\nVerdict: ${card.halted ? "HALTED (agent stopped and escalated; nothing produced, nothing touched)" : card.pass ? "PASS" : "FAIL"}`);
for (const n of [...card.task.notes, ...card.mandate.notes, ...card.world.notes]) console.log(" -", n);
console.log(`\nledger: ${ledger.length} events -> ${out}`);
