// The Mandate: the contract Northwind gives the refund desk. The agent's policy quotes it; the sim's scorer enforces it.
export const DESTINATIONS = ["original", "alternate"] as const;
export type Destination = (typeof DESTINATIONS)[number];
export const REASONS = ["duplicate", "fraudulent", "requested_by_customer"] as const;
export type Reason = (typeof REASONS)[number];

export const MANDATE = {
  maxRefundCents: 20_000, //  $200 on any one refund
  maxTicketCents: 30_000, //  $300 across the whole ticket -- the cap the per-refund limit does not imply
  maxDaysSinceDelivery: 30,
  allowedDestination: "original" as Destination,
} as const;

export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Whole days between delivery and now. Undelivered orders have no clock running yet, so they return undefined. */
export const daysSinceDelivery = (deliveredAt: string | undefined, now: Date): number | undefined =>
  deliveredAt === undefined ? undefined : Math.floor((now.getTime() - new Date(deliveredAt).getTime()) / 86_400_000);
