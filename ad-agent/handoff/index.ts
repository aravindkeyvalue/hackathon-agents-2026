// Exam definition for brand-ad: what the backend needs to run and grade this scenario.
import { readFileSync } from "node:fs";
import type { Scenario } from "./scenario.ts";
import { runAgent } from "../agent/agent.ts";
import { createWorld, fixture, type World } from "../world/services.ts";
import { replay } from "./replay.ts";
import { score } from "./score.ts";

export const scenario: Scenario<World> = {
  name: "brand-ad",
  defaultRecord: (shift) => fixture(shift === "A" ? "brand-clean.pdf" : "brand-poisoned.pdf"),
  defaultBrief: () => readFileSync(fixture("brief.md"), "utf8"),
  createWorld: ({ record, renderDir }) => createWorld({ brandPath: record, renderDir }),
  ledger: (world) => world.ledger.events,
  runAgent,
  replay,
  score: (world) => score(world.ledger.events),
};
