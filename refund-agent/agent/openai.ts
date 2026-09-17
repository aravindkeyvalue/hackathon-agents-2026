// Same agent, OpenAI provider. Manual tool-calling loop over Chat Completions, mirroring agent.ts.
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionFunctionTool } from "openai/resources/chat/completions";
import type { AgentRun, RunOptions } from "./types.ts";
import type { Dispatch } from "./dispatch.ts";
import { requireKey } from "./agent.ts";
import { systemPrompt } from "./policy.ts";
import { TOOL_DEFS } from "./tools.ts";

const MAX_TURNS = 12;
const TOOL_RESULT_PREVIEW = 400;

// Anthropic tool schemas are plain JSON Schema, which OpenAI accepts as a function's `parameters`.
export const tools: ChatCompletionFunctionTool[] = TOOL_DEFS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown> },
}));

/** Tool arguments arrive as a JSON string. A model that emits malformed JSON gets told so as a tool
 *  error, which it can correct on the next turn -- better than aborting the run. */
export function parseArguments(raw: string): { input: Record<string, unknown>; error?: string } {
  if (!raw.trim()) return { input: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { input: {}, error: `arguments must be a JSON object, got ${raw.slice(0, 80)}` };
    return { input: parsed as Record<string, unknown> };
  } catch {
    return { input: {}, error: `arguments were not valid JSON: ${raw.slice(0, 80)}` };
  }
}

export async function runOpenAI(brief: string, dispatch: Dispatch, model: string, { history = [], onEvent }: RunOptions = {}): Promise<AgentRun> {
  const client = new OpenAI({ apiKey: requireKey(model) });
  // The system prompt leads every request; history is the prior turns, so it is spliced in after it.
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt() },
    ...(history as ChatCompletionMessageParam[]),
    { role: "user", content: brief },
  ];
  const toolCalls: { name: string; input: unknown }[] = [];
  let stop = "max_turns";
  let summary = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // No token cap: the parameter that carries it differs across OpenAI model families, and the loop
    // is bounded by MAX_TURNS regardless.
    const res = await client.chat.completions.create({ model, messages, tools });
    const choice = res.choices[0];
    if (!choice) {
      stop = "no_choices";
      break;
    }

    const message = choice.message;
    messages.push(message);
    if (message.content) {
      summary = message.content;
      onEvent?.({ type: "text", delta: message.content });
    }

    const calls = (message.tool_calls ?? []).filter((c) => c.type === "function");
    stop = choice.finish_reason ?? "unknown";
    if (calls.length === 0) break;

    for (const call of calls) {
      const { input, error } = parseArguments(call.function.arguments);
      toolCalls.push({ name: call.function.name, input });
      onEvent?.({ type: "tool", name: call.function.name, input });
      const r = error ? { output: error, isError: true } : await dispatch(call.function.name, input, res.id);
      onEvent?.({ type: "tool_result", name: call.function.name, ok: !r.isError, output: r.output.slice(0, TOOL_RESULT_PREVIEW) });
      // OpenAI has no is_error flag on a tool message, so a failure is marked in the content itself.
      messages.push({ role: "tool", tool_call_id: call.id, content: r.isError ? `ERROR: ${r.output}` : r.output });
    }
  }
  return { messages, toolCalls, stop, model, summary };
}
