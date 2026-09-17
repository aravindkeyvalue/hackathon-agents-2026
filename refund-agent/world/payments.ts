// The payment processor, behind one interface with two backings.
//
//   local  an in-process Stripe stand-in (world/stripe.ts). Offline, deterministic, for development.
//   mcp    a Stripe MCP server. AgentSim mocks one per Run at /mcp/runs/<id>/payments, and the
//          tool names it serves are Stripe's own -- the same names this agent already calls.
//
// That is the whole seam: the same agent points at a local mock, at a scored Run, or one day at
// Stripe's real MCP endpoint, by changing a URL and nothing else.
import { createClient, type McpClient } from "../lib/mcp.ts";
import { StripeError, type CreateRefund, type Stripe } from "./stripe.ts";

/** What a refund looks like coming back, from either backing. Fields beyond these are passed through. */
export type RefundResult = { id: string; payment_intent: string; amount: number; destination?: string; reason?: string };

export type Payments = {
  readonly kind: "local" | "mcp";
  list(customerId: string, limit?: number): Promise<unknown>;
  refund(req: CreateRefund): Promise<RefundResult>;
};

export const localPayments = (stripe: Stripe): Payments => ({
  kind: "local",
  list: async (customerId, limit) => stripe.listPaymentIntents(customerId, limit),
  refund: async (req) => stripe.createRefund(req),
});

/** Parses a tool's text content as JSON. An MCP server that answers with prose rather than a value
 *  is a broken server, and saying so beats handing the model an unparsed blob. */
function asJson(tool: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new StripeError(`${tool} did not return JSON: ${text.slice(0, 200)}`);
  }
}

export function mcpPayments(url: string, connect: (u: string) => McpClient = createClient): Payments {
  const client = connect(url);
  let ready: Promise<unknown> | undefined; // one handshake per process, on first use
  const initialized = () => (ready ??= client.initialize());

  return {
    kind: "mcp",
    async list(customerId, limit) {
      await initialized();
      const args: Record<string, unknown> = { customer: customerId };
      if (limit !== undefined) args.limit = limit;
      return asJson("list_payment_intents", await client.call("list_payment_intents", args));
    },
    async refund(req) {
      await initialized();
      // The server's refusals (over-refund, unknown payment) arrive as tool errors. They are the
      // same class of answer the local backing throws, so they are re-thrown as StripeError and the
      // dispatch layer hands them to the model either way.
      try {
        const value = asJson("create_refund", await client.call("create_refund", { ...req })) as RefundResult;
        return value;
      } catch (e) {
        throw e instanceof StripeError ? e : new StripeError(e instanceof Error ? e.message : String(e));
      }
    },
  };
}
