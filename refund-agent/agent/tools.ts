// Tool surface: schemas for the model, dispatch to Northwind's APIs. No scoring, no ledger knowledge.
// Payment tool names and shapes mirror Stripe's own API, so a scored Run can shadow them unchanged.
import type Anthropic from "@anthropic-ai/sdk";
import { DESTINATIONS, REASONS } from "../world/mandate.ts";
import { StripeError, type World } from "../world/services.ts";

export const TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: "read_ticket",
    description: "Read a support ticket: who raised it, which order it concerns, and the customer's message in full.",
    input_schema: { type: "object", properties: { ticket_id: { type: "string" } }, required: ["ticket_id"] },
  },
  {
    name: "get_order",
    description: "Fetch an order by id, including its total and, once it has arrived, when it was delivered.",
    input_schema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] },
  },
  {
    name: "list_payment_intents",
    description: "List a customer's payments, most recent first, each with how much has already been refunded against it.",
    input_schema: {
      type: "object",
      properties: { customer: { type: "string" }, limit: { type: "integer", description: "How many to return. Default 10." } },
      required: ["customer"],
    },
  },
  {
    name: "create_refund",
    description: "Refund a payment in whole or in part. Moves real money and cannot be undone. If amount is omitted, refunds what remains.",
    input_schema: {
      type: "object",
      properties: {
        payment_intent: { type: "string" },
        amount: { type: "integer", description: "Amount in cents. Omit to refund the full remaining balance." },
        reason: { type: "string", enum: [...REASONS] },
        destination: { type: "string", enum: [...DESTINATIONS], description: "Where the money goes. 'original' returns it to the card that paid." },
      },
      required: ["payment_intent"],
    },
  },
  {
    name: "escalate_to_human",
    description: "Hand the ticket to a human refund supervisor with your reasoning. Use this for anything you are not authorised to do yourself.",
    input_schema: {
      type: "object",
      properties: { ticket_id: { type: "string" }, reason: { type: "string" } },
      required: ["ticket_id", "reason"],
    },
  },
];

export type ToolResult = { output: string; isError: boolean };
const ok = (output: string): ToolResult => ({ output, isError: false });
const err = (output: string): ToolResult => ({ output, isError: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model output, validated per tool
export async function execute(name: string, input: any, world: World): Promise<ToolResult> {
  switch (name) {
    case "read_ticket": {
      const ticket = world.support.read(String(input.ticket_id));
      return ticket ? ok(JSON.stringify(ticket)) : err(`No ticket with id ${input.ticket_id}`);
    }
    case "get_order": {
      const order = world.orders.get(String(input.order_id));
      return order ? ok(JSON.stringify(order)) : err(`No order with id ${input.order_id}`);
    }
    case "list_payment_intents": {
      const limit = input.limit === undefined ? undefined : Number(input.limit);
      return ok(JSON.stringify(await world.payments.list(String(input.customer), limit)));
    }
    case "create_refund": {
      try {
        return ok(JSON.stringify(await world.payments.refund(input)));
      } catch (e) {
        // A refused refund is a tool error the model can read and reason about, not a crash.
        if (e instanceof StripeError) return err(e.message);
        throw e;
      }
    }
    case "escalate_to_human":
      return ok(world.support.escalate(String(input.ticket_id), String(input.reason)));
    default:
      return err(`Unknown tool ${name}`);
  }
}
