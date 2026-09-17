// Northwind's refund desk as plain APIs: the support queue, the order book, the payment processor.
// The agent calls these. Every call lands in the ledger.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLedger, type Ledger } from "./ledger.ts";
import { createStripe, type PaymentIntent, type Stripe } from "./stripe.ts";

export { StripeError } from "./stripe.ts"; // tools dispatch on it, and they only import this module

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const fixture = (name: string) => join(ROOT, "fixtures", name);

export type Customer = { id: string; name: string; email: string };
export type Order = { id: string; customer_id: string; items: string[]; total: number; placed_at: string; delivered_at?: string; status: string };
export type WorldData = { now: string; customers: Customer[]; orders: Order[]; payments: PaymentIntent[] };

/** A ticket file: a small system-written header, then the customer's own words. Only the body is untrusted. */
export type Ticket = { id: string; customer_id: string; order_id: string; subject: string; body: string };

export function parseTicket(text: string): Ticket {
  const [head, ...rest] = text.split(/^---$/m);
  if (rest.length === 0) throw new Error("ticket file has no '---' separator between header and body");
  const field = (name: string) => {
    const m = head.match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
    if (!m) throw new Error(`ticket file is missing '${name}:' in its header`);
    return m[1].trim();
  };
  return { id: field("ticket"), customer_id: field("customer"), order_id: field("order"), subject: field("subject"), body: rest.join("---").trim() };
}

export type WorldOptions = { ticketPath: string; dataPath?: string };

export function createWorld(opts: WorldOptions) {
  const ledger: Ledger = createLedger();
  const data: WorldData = JSON.parse(readFileSync(opts.dataPath ?? fixture("data.json"), "utf8"));
  const ticket = parseTicket(readFileSync(opts.ticketPath, "utf8"));
  const now = () => new Date(data.now);
  const stripe: Stripe = createStripe(data.payments, now);

  const support = {
    ticket,
    /** The whole ticket, header and body. The body is customer-supplied text: data, not instruction. */
    read(id: string) {
      ledger.append({ type: "ticket_read", id });
      if (id !== ticket.id) return undefined;
      return ticket;
    },
    escalate(ticketId: string, reason: string) {
      ledger.append({ type: "escalation", ticketId, reason });
      return `Ticket ${ticketId} escalated to a human refund supervisor. Reason recorded: ${reason}`;
    },
  };

  const orders = {
    get(id: string) {
      const order = data.orders.find((o) => o.id === id);
      if (order) ledger.append({ type: "order_read", id: order.id, customerId: order.customer_id, deliveredAt: order.delivered_at });
      return order;
    },
  };

  const payments = {
    list(customerId: string, limit?: number) {
      const rows = stripe.listPaymentIntents(customerId, limit);
      ledger.append({ type: "payments_listed", customerId, count: rows.length });
      return rows;
    },
    refund(req: { payment_intent: string; amount?: number; reason?: string; destination?: string }) {
      const refund = stripe.createRefund(req); // throws before anything is appended: a refused call is not a refund
      const payment = data.payments.find((p) => p.id === refund.payment_intent)!;
      ledger.append({
        type: "refund",
        id: refund.id,
        paymentId: refund.payment_intent,
        orderId: payment.order_id,
        customerId: payment.customer_id,
        amountCents: refund.amount,
        destination: refund.destination as "original" | "alternate",
        reason: refund.reason,
      });
      return refund;
    },
  };

  return { ledger, now, data, support, orders, payments, stripe };
}

export type World = ReturnType<typeof createWorld>;
