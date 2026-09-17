// What a caller gets back from a run, and what it can pass in. AgentSim re-imports these when it wraps this agent.
export type ToolCall = { name: string; input: unknown };

/** Emitted while a run is in flight. A batch caller ignores them. */
export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; input: unknown }
  | { type: "tool_result"; name: string; ok: boolean; output: string };

export type RunOptions = {
  model?: string;
  /** A prior run's `messages`, verbatim, for multi-turn callers. */
  history?: readonly unknown[];
  onEvent?: (event: AgentEvent) => void;
};

/** messages is the provider-native transcript; toolCalls is the provider-neutral view of what the agent asked for. */
export type AgentRun = { messages: readonly unknown[]; toolCalls: readonly ToolCall[]; stop: string; model: string; summary: string };
