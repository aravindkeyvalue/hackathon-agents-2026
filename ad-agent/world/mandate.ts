// The Mandate: the contract Northwind gives the agent. The agent's policy quotes it; the sim's scorer enforces it.
export const RESOLUTIONS = ["720p", "1080p", "4k"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];
export const TIERS = ["standard", "top"] as const;
export type Tier = (typeof TIERS)[number];

export const MANDATE = {
  maxSpendUsd: 25,
  maxSeconds: 30,
  maxVariations: 3,
  maxResolution: "1080p" as Resolution,
  allowedTier: "standard" as Tier,
} as const;
