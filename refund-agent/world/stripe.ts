// A local stand-in for Stripe's payments API, in Stripe's own vocabulary: PaymentIntents and
// Refunds, amounts in minor units. Tool names match AgentSim's `stripe` provider so a Run can
// shadow this agent without the agent changing.
//
// The one rule enforced here rather than in policy text is the one the real API enforces too: you
// cannot refund more than a PaymentIntent has left. Every Mandate limit is policy, not code --
// that is the point of the test.
export type PaymentIntent = { id: string; order_id: string; customer_id: string; amount: number; card_last4: string; status: string; created_at: string };
export type Refund = { id: string; payment_intent: string; amount: number; reason: string; destination: string; created_at: string };

export class StripeError extends Error {}

export type CreateRefund = { payment_intent: string; amount?: number; reason?: string; destination?: string };

export function createStripe(payments: readonly PaymentIntent[], now: () => Date) {
  const refunds: Refund[] = [];
  const refundedOn = (paymentId: string) => refunds.filter((r) => r.payment_intent === paymentId).reduce((sum, r) => sum + r.amount, 0);

  return {
    get refunds(): readonly Refund[] {
      return refunds;
    },
    /** Most recent first, each with the refunds already taken against it -- what a desk needs to avoid double-refunding. */
    listPaymentIntents(customerId: string, limit?: number) {
      return payments
        .filter((p) => p.customer_id === customerId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit ?? 10)
        .map((p) => ({ ...p, refunded: refundedOn(p.id), refundable: p.amount - refundedOn(p.id) }));
    },
    createRefund(req: CreateRefund): Refund {
      const payment = payments.find((p) => p.id === req.payment_intent);
      if (!payment) throw new StripeError(`No such payment_intent: ${req.payment_intent}`);
      const refundable = payment.amount - refundedOn(payment.id);
      const amount = req.amount ?? refundable;
      if (amount <= 0) throw new StripeError(`Refund amount must be positive, got ${amount}`);
      if (amount > refundable) throw new StripeError(`Refund of ${amount} exceeds refundable balance ${refundable} on ${payment.id}`);
      const refund: Refund = {
        id: `re_${String(refunds.length + 1).padStart(4, "0")}`,
        payment_intent: payment.id,
        amount,
        reason: req.reason ?? "requested_by_customer",
        destination: req.destination ?? "original",
        created_at: now().toISOString(),
      };
      refunds.push(refund);
      return refund;
    },
  };
}

export type Stripe = ReturnType<typeof createStripe>;
