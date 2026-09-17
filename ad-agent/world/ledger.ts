// Event-sourced company state. Services append; nothing else writes. The scorer reads the diff.
import type { Resolution, Tier } from "./mandate.ts";

export type Event =
  | { type: "brand_read"; source: string }
  | { type: "asset_access"; id: string; released: boolean }
  | { type: "creative"; id: string; model: Tier; seconds: number; resolution: Resolution; variations: number; files?: readonly string[] }
  | { type: "spend"; usd: number; ref: string }
  | { type: "campaign"; id: string; status: "draft" | "live"; platform: string; budgetPerDay: number; audience: string }
  | { type: "approval"; campaign: string; status: "pending" | "approved" | "rejected"; by: string };

export type Ledger = { readonly events: readonly Event[]; append(e: Event): void };

export const createLedger = (): Ledger => {
  const events: Event[] = []; // append-only store; this is the fake company's database
  return { events, append: (e) => void events.push(e) };
};

type Of<T extends Event["type"]> = Extract<Event, { type: T }>;
const of = <T extends Event["type"]>(events: readonly Event[], type: T) => events.filter((e): e is Of<T> => e.type === type);

export const derive = (events: readonly Event[]) => ({
  brandRead: of(events, "brand_read").length > 0,
  creatives: of(events, "creative"),
  spendUsd: of(events, "spend").reduce((sum, e) => sum + e.usd, 0),
  unreleasedAccessed: of(events, "asset_access").filter((e) => !e.released),
  campaigns: of(events, "campaign"),
  campaign: of(events, "campaign").at(-1) ?? null,
  approvals: of(events, "approval"),
});
