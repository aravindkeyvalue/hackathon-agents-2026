// Export this agent to AgentSim over MCP, and drive the World it drafts back.
//
//   node onboard/main.ts                                  register, print the draft
//   node onboard/main.ts --draft <id>                     re-read a draft
//   node onboard/main.ts --draft <id> --refine "<note>"   change it in plain language
//   node onboard/main.ts --draft <id> --create <worldId>  persist it as a World
//   node onboard/main.ts --dry-run                        print what would be sent, call nothing
import { join } from "node:path";
import { parseArgs } from "node:util";
import { McpError, createClient } from "./mcp.ts";
import { registerAgentArgs, toolList } from "./payload.ts";
import { ROOT } from "../world/services.ts";

try { process.loadEnvFile(join(ROOT, ".env")); } catch { /* no .env: rely on the shell */ }

const { values: opt } = parseArgs({
  options: {
    url: { type: "string" },
    draft: { type: "string" },
    refine: { type: "string" },
    create: { type: "string" },
    "dry-run": { type: "boolean" },
  },
});

const url = opt.url ?? process.env.AGENTSIM_WORLDS_URL ?? "http://localhost:3000/mcp/worlds";
const args = registerAgentArgs();

if (opt["dry-run"]) {
  console.log(`would POST to ${url}\n`);
  console.log(`name       : ${args.name}`);
  console.log(`domain     : ${args.domain}`);
  console.log(`tools      : ${toolList().map((t) => t.name).join(", ")}`);
  console.log(`schema     : ${args.schema.length} chars`);
  console.log(`description: ${args.description.length} chars\n`);
  console.log(args.description);
  process.exit(0);
}

async function main(): Promise<void> {
const client = createClient(url);
await client.initialize();

// A draft id short-circuits registration: the agent is already known to this server.
let draftId = opt.draft;
if (!draftId) {
  console.log(`registering ${args.name} with ${url}`);
  console.log(`  ${args.tools.length} tools, ${args.schema.length} chars of schema\n`);
  const registered = await client.call("register_agent", { ...args });
  console.log(registered);
  draftId = registered.match(/\b(draft[_-][A-Za-z0-9-]+)\b/)?.[1] ?? undefined;
  if (!draftId) {
    console.error("\nCould not find a draft id in that reply. Pass it back with --draft <id>.");
    process.exit(1);
  }
  console.log(`\ndraft: ${draftId}`);
}

if (opt.refine) {
  console.log(`\nrefining ${draftId}: ${opt.refine}`);
  console.log(await client.call("refine_world", { draftId, note: opt.refine }));
}

console.log(`\n--- draft ${draftId} ---`);
console.log(await client.call("get_world_draft", { draftId }));

if (opt.create) {
  console.log(`\ncreating world ${opt.create} from ${draftId}`);
  console.log(await client.call("create_world", { draftId, worldId: opt.create }));
} else {
  console.log(`\nNot persisted. To create the World:  npm run onboard -- --draft ${draftId} --create <worldId>`);
}
}

// The worldbuilder's own refusals (no key, bad draft id) are answers, not crashes: print and exit 1.
main().catch((e: unknown) => {
  if (e instanceof McpError) {
    console.error(`\nagentsim-worldbuilder: ${e.message}`);
    process.exit(1);
  }
  throw e;
});
