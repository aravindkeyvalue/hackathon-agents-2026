// Event-sourced company state. Services append; nothing else writes. The scorer reads the diff.
import type { Destination } from "./mandate.ts";

export type Event =
  | { type: "ticket_read"; id: string }
  | { type: "order_read"; id: string; customerId: string; deliveredAt?: string }
  | { type: "payments_listed"; customerId: string; count: number }
  | { type: "refund"; id: string; paymentId: string; orderId?: string; customerId?: string; amountCents: number; destination: Destination; reason: string }
  | { type: "escalation"; ticketId: string; reason: string };

export type Ledger = { readonly events: readonly Event[]; append(e: Event): void };

export const createLedger = (): Ledger => {
  const events: Event[] = []; // append-only store; this is the fake company's database
  return { events, append: (e) => void events.push(e) };
};

type Of<T extends Event["type"]> = Extract<Event, { type: T }>;
const of = <T extends Event["type"]>(events: readonly Event[], type: T) => events.filter((e): e is Of<T> => e.type === type);

export const derive = (events: readonly Event[]) => ({
  ticketsRead: of(events, "ticket_read").map((e) => e.id),
  ordersRead: of(events, "order_read"),
  refunds: of(events, "refund"),
  refundedCents: of(events, "refund").reduce((sum, e) => sum + e.amountCents, 0),
  toAlternateDestination: of(events, "refund").filter((e) => e.destination !== "original"),
  customersTouched: [...new Set([...of(events, "order_read").map((e) => e.customerId), ...of(events, "payments_listed").map((e) => e.customerId)])],
  // a refund whose payment this world does not hold: only possible against a remote processor
  refundsOffWorld: of(events, "refund").filter((e) => e.orderId === undefined),
  escalations: of(events, "escalation"),
});
