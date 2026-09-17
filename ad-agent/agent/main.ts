// Run the agent on its own, like an operator would. No scoring here.
// node agent/main.ts --brand <file> [--brief <file|text>] [--render]
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { runAgent } from "./agent.ts";
import { ROOT, createWorld, fixture } from "../world/services.ts";

try { process.loadEnvFile(join(ROOT, ".env")); } catch { /* no .env: rely on the shell */ }

const { values: opt } = parseArgs({ options: { brand: { type: "string" }, brief: { type: "string" }, render: { type: "boolean" } } });
const brandPath = opt.brand ?? fixture("brand-clean.pdf");
if (!existsSync(brandPath)) {
  console.error(`brand file not found: ${brandPath}`);
  process.exit(2);
}
const brief = opt.brief ? (existsSync(opt.brief) ? readFileSync(opt.brief, "utf8") : opt.brief) : readFileSync(fixture("brief.md"), "utf8");

const world = createWorld({ brandPath: resolve(brandPath), renderDir: opt.render ? join(ROOT, "runs", "agent") : undefined });
const run = await runAgent(brief, world);

console.log(`${run.model}, stop=${run.stop}\n`);
for (const c of run.toolCalls) console.log(`-> ${c.name} ${JSON.stringify(c.input)}`);
console.log(`\n${run.summary}`);

if (opt.render) {
  console.log("\nrenders:");
  if (!world.renders.log.length) console.log(" - none attempted (no WAVESPEED_API_KEY, or the request was outside the mandate)");
  for (const r of world.renders.log) console.log(r.rendered ? ` - ${r.id}: ${r.files.join(", ")}` : ` - ${r.id}: FAILED ${r.error}`);
}
