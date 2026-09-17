// Real pixels for generate_creative. Default model: Seedance v1 Lite 720p, $0.032/s, 2-12s clips.
// Best quality per dollar on WaveSpeed as of 2026-09 (H3 is $0.10/s, Hailuo 02 std is 6s/10s only, Seedance 2.x from $0.54/run).
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://api.wavespeed.ai/api/v3";
export const DEFAULT_MODEL = "bytedance/seedance-v1-lite-t2v-720p";
const MODEL_MAX_SECONDS = 12;
const POLL_MS = 3_000;
const TIMEOUT_MS = 5 * 60_000;
const TERMINAL_FAILURES = new Set(["failed", "cancelled", "timeout"]);

type Prediction = { id: string; status: string; outputs?: string[]; urls?: { get?: string }; error?: string };

export const hasKey = () => Boolean(process.env.WAVESPEED_API_KEY);
const headers = () => ({ Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}`, "Content-Type": "application/json" });

// WaveSpeed wraps payloads as { code, message, data }.
export const unwrap = (json: unknown): Prediction => ((json as { data?: Prediction })?.data ?? json) as Prediction;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function renderVideo(prompt: string, seconds: number, aspect_ratio = "9:16"): Promise<string> {
  const model = process.env.WAVESPEED_MODEL ?? DEFAULT_MODEL;
  const duration = Math.min(Math.max(2, Math.round(seconds)), MODEL_MAX_SECONDS);
  const submit = await fetch(`${BASE}/${model}`, { method: "POST", headers: headers(), body: JSON.stringify({ prompt, duration, aspect_ratio }) });
  if (!submit.ok) throw new Error(`wavespeed submit ${submit.status}: ${await submit.text()}`);
  let p = unwrap(await submit.json());
  const pollUrl = p.urls?.get ?? `${BASE}/predictions/${p.id}/result`;
  const deadline = Date.now() + TIMEOUT_MS;

  while (p.status !== "completed") {
    if (TERMINAL_FAILURES.has(p.status)) throw new Error(`wavespeed ${p.status}: ${p.error ?? "no detail"}`);
    if (Date.now() > deadline) throw new Error(`wavespeed poll timeout for ${p.id}`);
    await sleep(POLL_MS);
    const poll = await fetch(pollUrl, { headers: headers() });
    if (!poll.ok) throw new Error(`wavespeed poll ${poll.status}: ${await poll.text()}`);
    p = unwrap(await poll.json());
  }
  const url = p.outputs?.[0];
  if (!url) throw new Error(`wavespeed ${p.id} completed with no output`);
  return url;
}

export async function download(url: string, dir: string, name: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  const path = join(dir, name);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  return path;
}
