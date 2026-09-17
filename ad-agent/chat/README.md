# Chat front door

The same agent from `../agent/`, wrapped in an HTTP API and a one-page UI.
Nothing is forked: `chat/` imports `runAgent` and `createWorld` directly, so whatever the eval
harness runs is what the chat bot runs. Integrating this back into AgentSim later is an import,
not a port.

```bash
npm run chat                 # http://localhost:8787
node chat/server.ts --port 8080 --brand brand-poisoned.pdf --render --model claude-haiku-4-5
```

| Flag | Default | Meaning |
|---|---|---|
| `--port` | `8787` | Listen port |
| `--brand` | `brand-clean.pdf` | Brand document the agent reads, by filename in `fixtures/` |
| `--render` | off | Real clips via WaveSpeed. Without `WAVESPEED_API_KEY` the agent still runs, it just renders nothing |
| `--model` | `AGENTSIM_MODEL`, else `claude-haiku-4-5` | `claude-*` or `gemini-*`; the provider follows the prefix |

Flags set the server default. The UI overrides record, render and model per session.

## Keys are reached only by the path you picked

Having a key in `.env` is not the same as the agent being allowed to spend it.

- **Provider keys follow the model.** `providerOf` maps `gemini-*` to `GEMINI_API_KEY` and `claude-*` to
  `ANTHROPIC_API_KEY`, and each client is constructed inside its own branch. Running Gemini never reads the
  Anthropic key. Anything that is neither prefix resolves to **no** provider and is refused before a client
  exists, rather than falling back to one and spending a key on a model you did not ask any provider for.
- **WaveSpeed is gated on the render tick, not on the key.** A session created without render gets no
  `renderDir`, and `canRender()` in `world/services.ts` requires one. With `WAVESPEED_API_KEY` set and render
  off, `generate_creative` still prices the request into the ledger and still returns placeholder urls — it
  just never calls WaveSpeed. `test/keys.test.ts` asserts exactly this.
- The UI greys out a model whose key is missing and says which variable it wants; the render tick is
  disabled outright when `WAVESPEED_API_KEY` is absent. `GET /api/config` is where that comes from.

## Sessions

A session owns one `World`, so the ledger and the render log accumulate across turns exactly as they
do inside a single exam run — ask a follow-up and the agent remembers what it already spent.

The World is built around one brand document and one render setting, so **changing either starts a new
session**. The UI does this for you and clears the transcript. Sessions live in memory and die with the
process; there is no store yet, because nothing needs to survive a restart.

One turn at a time per session: a second concurrent turn gets `409`, since two runs interleaving writes
into the same ledger would corrupt it.

## API

```
GET  /                        the UI
GET  /api/config              { records, defaultRecord, render, model }
POST /api/chat                { session?, message, record?, render?, model? }   one JSON reply
POST /api/chat/stream         same body, server-sent events
GET  /api/session/:id         current state without sending a message
GET  /renders/:session/:file  a rendered clip
```

`POST /api/chat` returns the whole session view, so the UI never has to stitch state together:

```json
{
  "session": "uuid", "record": "brand-clean.pdf", "render": false, "model": "claude-haiku-4-5",
  "stop": "end_turn",
  "turns": [{ "role": "user", "text": "..." },
            { "role": "agent", "text": "...", "toolCalls": [{ "name": "parse_brand", "input": {} }], "clips": [] }],
  "ledger": [{ "type": "brand_read", "source": "brand-identity.pdf" }],
  "renders": [], "clips": []
}
```

Omit `session` to start one. Provider failures (quota, network, unknown model) come back as `502` with
the message, and the transcript is left untouched so the turn can be retried.

### Streaming

`POST /api/chat/stream` takes the same body and answers `text/event-stream`. Validation failures still answer
JSON *before* the stream opens, so a client checks `res.ok` first and only then reads frames.

```
data: {"type":"start","session":"uuid","model":"claude-haiku-4-5"}
data: {"type":"text","delta":"I'll parse the brand document first"}
data: {"type":"tool","name":"parse_brand","input":{"pdf":"brand-identity.pdf"}}
data: {"type":"tool_result","name":"parse_brand","ok":true,"output":"NORTHWIND OUTDOOR…"}
data: {"type":"done", …the same object POST /api/chat returns}
```

Text and tool frames interleave in the order they happened, which is the point: a run is mostly tool calls,
and the wait only reads as broken when nothing moves. Claude emits narration before each tool batch (~90 text
frames on a typical brief); Gemini tends to stay quiet until the end (~9). `tool_result.output` is truncated
to 400 characters — tool output can be an entire brand document.

The stream does not use `EventSource`, which cannot POST. Read `res.body` and split on `\n\n`; `ui.html` has
a 15-line reader.

A client that disconnects mid-turn does not abort the run. The World has already been written to, and
stopping halfway would leave the ledger describing work the agent never finished reasoning about.

`record` is validated against the fixtures directory rather than opened as a path — it names a file the
server reads and feeds to a model, so an unchecked value would be an arbitrary-file-read hole.

## What it does not do yet

- Streamed text is not replayed. `GET /api/session/:id` returns each agent turn's final summary, not the
  interleaved narration the stream showed, so a page reload loses the in-between text. Storing the frames
  is the fix when someone actually reloads.
- No scoring. The ledger is returned raw; `exam/score.ts` is deliberately not wired in, because grading
  belongs to AgentSim and not to the product surface.
- No auth, no persistence, no rate limit. Local dev tool.
