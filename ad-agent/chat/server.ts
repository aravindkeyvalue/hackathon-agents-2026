// Chat front door for the brand-ad agent: JSON API, an SSE stream, and a one-page UI, on node:http.
// node chat/server.ts [--port 8787] [--brand <file>] [--render] [--model <name>]
//
// The agent is imported from ../agent, not forked. A session owns one World, so the
// ledger and the render log accumulate across turns the way they do in a single exam run.
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { AgentEvent } from "../agent/types.ts";
import { DEFAULT_MODEL, KEY_FOR, providerOf, runAgent } from "../agent/agent.ts";
import { createWorld, type World } from "../world/services.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const FIXTURES = join(REPO, "fixtures");
const RENDERS = join(REPO, "runs", "chat");

try {
  process.loadEnvFile(join(REPO, ".env"));
} catch {
  /* no .env: rely on the shell */
}

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGE_CHARS = 8000;
const MODEL_RE = /^[a-zA-Z0-9._-]{1,64}$/;

/** The dropdown. Any other name that passes MODEL_RE still works over the API; this is the shortlist, not
 *  a whitelist. Provider follows the prefix, exactly as it does in the agent. */
const MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "gemini-3-flash-preview", "gemini-3.5-flash-lite"];

const { values: flag } = parseArgs({
  options: {
    port: { type: "string", default: "8787" },
    brand: { type: "string" },
    render: { type: "boolean", default: false },
    model: { type: "string" },
  },
});

/** Brand documents the API will open. Anything not on this list is rejected: `record` names a file we read
 *  and feed to a model, so an unchecked value is an arbitrary-file-read hole. */
const records = readdirSync(FIXTURES)
  .filter((f) => /\.(pdf|md)$/i.test(f))
  .sort();

const resolveRecord = (name: string): string | undefined => {
  const path = resolve(FIXTURES, basename(name));
  return path.startsWith(FIXTURES + "/") && existsSync(path) ? path : undefined;
};

const providerKeyError = (model: string): string | undefined => {
  const provider = providerOf(model);
  if (!provider) return `${model} has no known provider; expected a claude-* or gemini-* model`;
  if (!process.env[KEY_FOR[provider]]) return `${KEY_FOR[provider]} is not set, and ${model} needs it`;
  return undefined;
};
const hasKeyFor = (model: string) => providerKeyError(model) === undefined;
const canRender = () => Boolean(process.env.WAVESPEED_API_KEY);

const defaultRecord = flag.brand ? basename(flag.brand) : "brand-clean.pdf";
if (!resolveRecord(defaultRecord)) {
  console.error(`--brand must name a file in ${FIXTURES}\navailable: ${records.join(", ")}`);
  process.exit(2);
}
const defaultModel = flag.model ?? process.env.AGENTSIM_MODEL ?? DEFAULT_MODEL;

type Turn = { role: "user" | "agent"; text: string; toolCalls?: readonly { name: string; input: unknown }[]; clips?: readonly string[] };
type Session = {
  id: string;
  world: World;
  history: readonly unknown[]; // provider-native transcript, handed straight back to runAgent
  turns: Turn[];
  record: string; // basename, not a path
  render: boolean;
  model: string;
  busy: boolean;
};

const sessions = new Map<string, Session>();

function openSession(record: string, render: boolean, model: string): Session {
  const id = randomUUID();
  const renderDir = join(RENDERS, id);
  if (render) mkdirSync(renderDir, { recursive: true });
  return {
    id,
    world: createWorld({ brandPath: resolveRecord(record)!, renderDir: render ? renderDir : undefined }),
    history: [],
    turns: [],
    record,
    render,
    model,
    busy: false,
  };
}

// --- tiny http helpers -------------------------------------------------------

const json = (res: ServerResponse, status: number, body: unknown) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
};

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("body must be a JSON object");
  return parsed as Record<string, unknown>;
}

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".mp4": "video/mp4", ".css": "text/css", ".js": "text/javascript" };

function sendFile(res: ServerResponse, path: string) {
  const stat = statSync(path);
  res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream", "content-length": stat.size });
  createReadStream(path).pipe(res);
}

// --- view over a session -----------------------------------------------------

/** Files land on disk as absolute paths; the browser gets them back under /renders/<session>/. */
const clipUrls = (s: Session) =>
  s.world.renders.log.flatMap((r) => (r.rendered ? r.files.map((f) => `/renders/${s.id}/${basename(f)}`) : []));

const view = (s: Session) => ({
  session: s.id,
  record: s.record,
  render: s.render,
  model: s.model,
  turns: s.turns,
  ledger: s.world.ledger.events,
  renders: s.world.renders.log.map((r) => ({ id: r.id, rendered: r.rendered, error: r.error, files: r.files.map((f) => basename(f)) })),
  clips: clipUrls(s),
});

// --- one turn ----------------------------------------------------------------

type Prepared = { session: Session } | { status: number; error: string };

/** Validate the body and land on the session this turn belongs to. Shared by the JSON and SSE routes so the
 *  two cannot drift on what they accept. */
function prepare(body: Record<string, unknown>): Prepared & { message?: string } {
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return { status: 400, error: "message is required" };
  if (message.length > MAX_MESSAGE_CHARS) return { status: 400, error: `message exceeds ${MAX_MESSAGE_CHARS} characters` };

  const model = body.model === undefined || body.model === null ? undefined : String(body.model);
  if (model !== undefined && !MODEL_RE.test(model)) return { status: 400, error: "model has an unexpected shape" };

  const record = body.record === undefined ? undefined : String(body.record);
  if (record !== undefined && !resolveRecord(record)) return { status: 400, error: `unknown record; available: ${records.join(", ")}` };

  const render = body.render === undefined ? undefined : Boolean(body.render);
  if (render && !canRender()) return { status: 400, error: "WAVESPEED_API_KEY is not set, so clips cannot be rendered" };

  let session = typeof body.session === "string" ? sessions.get(body.session) : undefined;
  if (typeof body.session === "string" && !session) return { status: 404, error: "no such session" };

  const wantModel = model ?? session?.model ?? defaultModel;
  // The key for the chosen provider has to exist before we start a turn; otherwise the SDK throws a 401
  // several seconds in and the user has to guess which variable is missing.
  const keyError = providerKeyError(wantModel);
  if (keyError) return { status: 400, error: keyError };

  // The World is built around one brand document and one render setting, so changing either starts a new one.
  const wantsNewWorld = session && ((record !== undefined && record !== session.record) || (render !== undefined && render !== session.render));
  if (!session || wantsNewWorld) {
    session = openSession(record ?? session?.record ?? defaultRecord, render ?? session?.render ?? flag.render, wantModel);
    sessions.set(session.id, session);
  }
  session.model = wantModel;

  // One in-flight turn per session: concurrent turns would interleave writes into the same ledger.
  if (session.busy) return { status: 409, error: "this session is still working on the previous message" };
  return { session, message };
}

async function runTurn(session: Session, message: string, onEvent?: (e: AgentEvent) => void) {
  session.busy = true;
  const clipsBefore = clipUrls(session).length;
  try {
    const run = await runAgent(message, session.world, { model: session.model, history: session.history, onEvent });
    session.history = run.messages;
    session.turns.push({ role: "user", text: message });
    session.turns.push({
      role: "agent",
      text: run.summary || "(no text in this turn)",
      toolCalls: run.toolCalls,
      clips: clipUrls(session).slice(clipsBefore),
    });
    return { ...view(session), stop: run.stop, model: run.model };
  } finally {
    session.busy = false;
  }
}

// --- routes ------------------------------------------------------------------

async function handleChat(req: IncomingMessage, res: ServerResponse) {
  const ready = prepare(await readJsonBody(req));
  if ("error" in ready) return json(res, ready.status, { error: ready.error });
  try {
    return json(res, 200, await runTurn(ready.session, ready.message!));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`[chat] ${ready.session.id}: ${detail}`);
    return json(res, 502, { error: detail.slice(0, 600), session: ready.session.id });
  }
}

async function handleStream(req: IncomingMessage, res: ServerResponse) {
  const ready = prepare(await readJsonBody(req));
  if ("error" in ready) return json(res, ready.status, { error: ready.error });

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no", // proxies that buffer would defeat the whole point
  });
  const send = (event: unknown) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  send({ type: "start", session: ready.session.id, model: ready.session.model });

  try {
    // A disconnected client does not abort the turn: the World has already been written to, and a run that
    // stops halfway would leave the ledger describing work the agent did not finish reasoning about.
    send({ type: "done", ...(await runTurn(ready.session, ready.message!, send)) });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`[chat] ${ready.session.id}: ${detail}`);
    send({ type: "error", error: detail.slice(0, 600), session: ready.session.id });
  } finally {
    res.end();
  }
}

function handleRender(res: ServerResponse, sessionId: string, file: string) {
  const session = sessions.get(sessionId);
  if (!session) return json(res, 404, { error: "no such session" });
  const dir = join(RENDERS, session.id);
  const path = resolve(dir, basename(file));
  if (!path.startsWith(dir + "/") || !existsSync(path)) return json(res, 404, { error: "no such clip" });
  sendFile(res, path);
}

const config = () => ({
  records,
  defaultRecord,
  defaultModel,
  render: flag.render && canRender(),
  renderAvailable: canRender(),
  // Which keys are actually present, so the UI can say why a model is greyed out instead of failing a turn.
  models: MODELS.map((id) => ({ id, provider: providerOf(id)!, available: hasKeyFor(id) })),
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;
  try {
    if (req.method === "GET" && (path === "/" || path === "/index.html")) return sendFile(res, join(HERE, "ui.html"));
    if (req.method === "GET" && path === "/api/config") return json(res, 200, config());
    if (req.method === "POST" && path === "/api/chat") return await handleChat(req, res);
    if (req.method === "POST" && path === "/api/chat/stream") return await handleStream(req, res);

    const session = path.match(/^\/api\/session\/([\w-]+)$/);
    if (req.method === "GET" && session) {
      const s = sessions.get(session[1]!);
      return s ? json(res, 200, view(s)) : json(res, 404, { error: "no such session" });
    }

    const clip = path.match(/^\/renders\/([\w-]+)\/([\w.-]+)$/);
    if (req.method === "GET" && clip) return handleRender(res, clip[1]!, clip[2]!);

    return json(res, 404, { error: `no route for ${req.method} ${path}` });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`[chat] ${req.method} ${path}: ${detail}`);
    return json(res, 400, { error: detail.slice(0, 600) });
  }
});

const port = Number(flag.port);
server.listen(port, () => {
  const keys = Object.entries(KEY_FOR)
    .map(([provider, name]) => `${provider}:${process.env[name] ? "yes" : "no"}`)
    .join("  ");
  console.log(`brand-ad chat on http://localhost:${port}`);
  console.log(`  record: ${defaultRecord}   model: ${defaultModel}   render: ${flag.render && canRender()}`);
  console.log(`  keys -> ${keys}  wavespeed:${canRender() ? "yes" : "no"}`);
  if (flag.render && !canRender()) console.log("  --render ignored: WAVESPEED_API_KEY is not set");
});
