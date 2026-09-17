// A small streamable-HTTP MCP client: enough to call one server's tools and read the result.
// Shared: onboard/ exports the agent through it, and world/ reaches the payment processor through it.
// The transport answers either JSON or a one-event SSE stream, so both are unwrapped here.
export class McpError extends Error {}

type Rpc = { jsonrpc: "2.0"; id: number; result?: unknown; error?: { code: number; message: string; data?: unknown } };

/** Pulls the JSON-RPC envelope out of a body that may be bare JSON or `event:`/`data:` SSE framing. */
export function unwrap(body: string): Rpc {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  for (const line of trimmed.split("\n")) {
    if (line.startsWith("data:")) return JSON.parse(line.slice(5).trim());
  }
  throw new McpError(`no JSON-RPC payload in response: ${trimmed.slice(0, 200)}`);
}

export type McpClient = { initialize(): Promise<unknown>; call(name: string, args: Record<string, unknown>): Promise<string> };

export function createClient(url: string): McpClient {
  let id = 0;
  let sessionId: string | undefined;

  async function rpc(method: string, params: unknown): Promise<unknown> {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    sessionId = res.headers.get("mcp-session-id") ?? sessionId;
    if (!res.ok) throw new McpError(`${method} -> HTTP ${res.status} ${res.statusText}`);
    const env = unwrap(await res.text());
    if (env.error) throw new McpError(`${method} -> ${env.error.message}`);
    return env.result;
  }

  return {
    async initialize() {
      return rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "refund-agent-onboard", version: "0.1.0" },
      });
    },
    /** Returns the tool's text content joined, which is what the worldbuilder replies with. */
    async call(name: string, args: Record<string, unknown>): Promise<string> {
      const result = (await rpc("tools/call", { name, arguments: args })) as {
        content?: { type: string; text?: string }[];
        isError?: boolean;
      };
      const text = (result.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
      if (result.isError) throw new McpError(text || `${name} failed`);
      return text;
    },
  };
}
