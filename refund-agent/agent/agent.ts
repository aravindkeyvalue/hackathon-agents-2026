// A plain tool-using agent. Provider picked from the model name; Anthropic loop here, OpenAI in openai.ts.
import Anthropic from "@anthropic-ai/sdk";
import type { AgentRun, RunOptions } from "./types.ts";
import type { Dispatch } from "./dispatch.ts";
import { runOpenAI } from "./openai.ts";
import { systemPrompt } from "./policy.ts";
import { TOOL_DEFS } from "./tools.ts";

export const DEFAULT_MODEL = "claude-haiku-4-5"; // cheapest current Claude; override with AGENTSIM_MODEL
const MAX_TURNS = 12;
const TOOL_RESULT_PREVIEW = 400; // a ticket body can be long; the event stream only needs a look at it

export const KEY_FOR = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY" } as const;
export type Provider = keyof typeof KEY_FOR;

/** Unrecognised prefixes get no provider at all. Falling back to one would mean spending a key on a model
 *  the caller never asked any particular provider for. */
export const providerOf = (model: string): Provider | undefined =>
  model.startsWith("claude") ? "anthropic" : model.startsWith("gpt") || /^o\d/.test(model) ? "openai" : undefined;

/** A model's key is read only on the path that runs it: picking gpt-* never touches ANTHROPIC_API_KEY,
 *  and picking claude-* never touches OPENAI_API_KEY. Named error beats an SDK 401. */
export function requireKey(model: string): string {
  const provider = providerOf(model);
  if (!provider) throw new Error(`${model} has no known provider; expected a claude-*, gpt-* or o-series model`);
  const key = process.env[KEY_FOR[provider]];
  if (!key) throw new Error(`${KEY_FOR[provider]} is not set, and ${model} needs it`);
  return key;
}

/** async so a bad model or missing key rejects: a function typed Promise should not also throw synchronously. */
export async function runAgent(brief: string, dispatch: Dispatch, opts: RunOptions = {}): Promise<AgentRun> {
  const model = opts.model ?? process.env.AGENTSIM_MODEL ?? DEFAULT_MODEL;
  requireKey(model); // fail on an unknown or unkeyed model before any provider is constructed
  return providerOf(model) === "openai" ? runOpenAI(brief, dispatch, model, opts) : runAnthropic(brief, dispatch, model, opts);
}

async function runAnthropic(brief: string, dispatch: Dispatch, model: string, { history = [], onEvent }: RunOptions): Promise<AgentRun> {
  const client = new Anthropic({ apiKey: requireKey(model) });
  const messages: Anthropic.MessageParam[] = [...(history as Anthropic.MessageParam[]), { role: "user", content: brief }];
  const toolCalls: { name: string; input: unknown }[] = [];
  let stop = "max_turns";
  let summary = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.messages.stream({ model, max_tokens: 16000, system: systemPrompt(), tools: TOOL_DEFS, messages });
    if (onEvent) stream.on("text", (delta) => onEvent({ type: "text", delta }));
    const res = await stream.finalMessage();

    messages.push({ role: "assistant", content: res.content });
    stop = res.stop_reason ?? "unknown";
    summary = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n") || summary;
    if (stop === "pause_turn") continue;
    if (stop !== "tool_use") break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      toolCalls.push({ name: block.name, input: block.input });
      onEvent?.({ type: "tool", name: block.name, input: block.input });
      const r = await dispatch(block.name, block.input, res.id);
      onEvent?.({ type: "tool_result", name: block.name, ok: !r.isError, output: r.output.slice(0, TOOL_RESULT_PREVIEW) });
      results.push({ type: "tool_result", tool_use_id: block.id, content: r.output, is_error: r.isError });
    }
    messages.push({ role: "user", content: results });
  }
  return { messages, toolCalls, stop, model, summary };
}
