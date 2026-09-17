// Same agent, Gemini provider. Manual function-calling loop mirroring agent.ts.
import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import type { AgentRun, RunOptions } from "./types.ts";
import type { World } from "../world/services.ts";
import { requireKey } from "./agent.ts";
import { systemPrompt } from "./policy.ts";
import { TOOL_DEFS, execute } from "./tools.ts";

const MAX_TURNS = 12;
const TOOL_RESULT_PREVIEW = 400;

// Anthropic tool schemas are plain JSON Schema, which Gemini accepts as-is.
const declarations: FunctionDeclaration[] = TOOL_DEFS.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema }));

// Free-tier quota is a few requests per minute and one run makes several sequential calls, so a sweep
// hits 429 constantly. @google/genai does not retry on its own (the Anthropic SDK does). 2s, 4s ... 32s
// covers a per-minute window. A per-day cap will not clear in that time, so fail fast on it instead of
// burning a minute per run: the fix there is a different model or a paid tier, not waiting.
export async function withRetry<T>(fn: () => Promise<T>, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      const perDay = (e as { message?: string }).message?.includes("PerDay") ?? false;
      if (perDay || (status !== 429 && status !== 503) || attempt >= 5) throw e;
      await sleep(2000 * 2 ** attempt);
    }
  }
}

type Turn = { content: Content; text: string; calls: Part[]; finish?: string };

/** Drain one streamed turn. Text arrives as deltas and function calls arrive whole, so the visible text is
 *  re-joined into a single part and the call parts are kept in order -- that is the shape the next request
 *  has to send back as history. Thought parts are neither shown nor replayed. */
async function drain(stream: AsyncGenerator<{ candidates?: unknown[]; promptFeedback?: unknown }>, onEvent: RunOptions["onEvent"]): Promise<Turn> {
  let text = "";
  let finish: string | undefined;
  const calls: Part[] = [];

  for await (const chunk of stream as AsyncGenerator<import("@google/genai").GenerateContentResponse>) {
    const candidate = chunk.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      if (part.thought) continue;
      if (part.text) {
        text += part.text;
        onEvent?.({ type: "text", delta: part.text });
      } else if (part.functionCall) {
        calls.push(part);
      }
    }
    finish = (candidate?.finishReason ?? chunk.promptFeedback?.blockReason ?? finish) as string | undefined;
  }

  return { content: { role: "model", parts: [...(text ? [{ text }] : []), ...calls] }, text, calls, finish };
}

export async function runGemini(brief: string, world: World, model: string, { history = [], onEvent }: RunOptions = {}): Promise<AgentRun> {
  const ai = new GoogleGenAI({ apiKey: requireKey(model) });
  const contents: Content[] = [...(history as Content[]), { role: "user", parts: [{ text: brief }] }];
  const toolCalls: { name: string; input: unknown }[] = [];
  let stop = "max_turns";
  let summary = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = await withRetry(() =>
      ai.models.generateContentStream({
        model,
        contents,
        config: { systemInstruction: systemPrompt(), tools: [{ functionDeclarations: declarations }] },
      }),
    );
    const { content, text, calls, finish } = await drain(stream, onEvent);

    if (!text && calls.length === 0) {
      stop = String(finish ?? "no_candidates");
      break;
    }
    contents.push(content);
    summary = text || summary;
    if (calls.length === 0) {
      stop = String(finish ?? "end_turn");
      break;
    }

    const parts: Part[] = [];
    for (const part of calls) {
      const call = part.functionCall!;
      const name = call.name ?? "";
      toolCalls.push({ name, input: call.args });
      onEvent?.({ type: "tool", name, input: call.args });
      const r = await execute(name, call.args ?? {}, world);
      onEvent?.({ type: "tool_result", name, ok: !r.isError, output: r.output.slice(0, TOOL_RESULT_PREVIEW) });
      parts.push({ functionResponse: { id: call.id, name, response: r.isError ? { error: r.output } : { output: r.output } } });
    }
    contents.push({ role: "user", parts });
  }
  return { messages: contents, toolCalls, stop, model, summary };
}
