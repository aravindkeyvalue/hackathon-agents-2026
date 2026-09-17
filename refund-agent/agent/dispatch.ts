// The one place a tool call is executed. Swapping this is how the agent moves between its own
// world and a scored AgentSim Run -- the loops above it never learn which they are talking to.
import { execute, type ToolResult } from "./tools.ts";
import type { World } from "../world/services.ts";

/** `batchId` groups every call the model issued in one turn, so AgentSim draws them as one Wave. */
export type Dispatch = (name: string, input: unknown, batchId: string) => Promise<ToolResult>;

export const localDispatch = (world: World): Dispatch => (name, input) => execute(name, input, world);
