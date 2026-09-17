// Northwind's systems as plain APIs: brand docs, asset library, metered render service, ad platform.
// The agent calls these. Every call lands in the ledger.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLedger, derive, type Ledger } from "./ledger.ts";
import { MANDATE, RESOLUTIONS, TIERS, type Resolution, type Tier } from "./mandate.ts";
import { download, hasKey, renderVideo } from "./wavespeed.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const fixture = (name: string) => join(ROOT, "fixtures", name);

export type Asset = { id: string; name: string; released: boolean };
export type RenderRequest = { model: Tier; seconds: number; resolution: Resolution; variations: number; prompt?: string };
export type RenderResult = { id: string; cost_usd: number; urls: string[]; rendered: boolean; render_error?: string };
export type RenderLog = { id: string; rendered: boolean; files: string[]; error?: string };

// USD per output second, scaled by resolution and tier. Demo numbers.
export const PRICE = {
  perSecond: 0.1,
  resolution: { "720p": 0.5, "1080p": 1, "4k": 4 } satisfies Record<Resolution, number>,
  tier: { standard: 1, top: 3 } satisfies Record<Tier, number>,
} as const;

export const renderCost = (r: RenderRequest) =>
  Math.round(PRICE.perSecond * r.seconds * r.variations * PRICE.resolution[r.resolution] * PRICE.tier[r.model] * 100) / 100;

export const isRenderRequest = (i: any): i is RenderRequest =>
  TIERS.includes(i?.model) && RESOLUTIONS.includes(i?.resolution) && i.seconds > 0 && Number.isInteger(i.variations) && i.variations > 0;

// .pdf goes through poppler's pdftotext (brew install poppler); anything else is read as text.
const readDoc = (path: string) =>
  path.toLowerCase().endsWith(".pdf") ? execFileSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8" }) : readFileSync(path, "utf8");

export type WorldOptions = { brandPath: string; assetsPath?: string; renderDir?: string };

export function createWorld(opts: WorldOptions) {
  const ledger: Ledger = createLedger();
  if (opts.renderDir) mkdirSync(opts.renderDir, { recursive: true });
  const assets: Asset[] = JSON.parse(readFileSync(opts.assetsPath ?? fixture("assets.json"), "utf8"));

  const brand = {
    read(source: string) {
      ledger.append({ type: "brand_read", source });
      return readDoc(opts.brandPath);
    },
  };

  const library = {
    fetch(id: string) {
      const asset = assets.find((a) => a.id === id);
      if (asset) ledger.append({ type: "asset_access", id: asset.id, released: asset.released });
      return asset ? { ...asset, url: `s3://northwind-library/${asset.id}` } : undefined;
    },
  };

  // Real pixels only for small, in-mandate jobs: this is our WaveSpeed bill, not the demo ledger.
  const canRender = (r: RenderRequest, usd: number) =>
    Boolean(opts.renderDir) && hasKey() && usd <= MANDATE.maxSpendUsd && r.variations <= MANDATE.maxVariations && r.seconds <= MANDATE.maxSeconds;

  const renderLog: RenderLog[] = []; // what actually happened with real renders, for operators
  const renders = {
    log: renderLog as readonly RenderLog[],
    async generate(r: RenderRequest): Promise<RenderResult> {
      const id = `cr_${derive(ledger.events).creatives.length + 1}`;
      const usd = renderCost(r);
      let urls = Array.from({ length: r.variations }, (_, n) => `s3://northwind-renders/${id}/v${n + 1}.mp4`);
      let rendered = false;
      let render_error: string | undefined;
      if (canRender(r, usd)) {
        try {
          urls = await Promise.all(urls.map((_, n) => renderVideo(r.prompt ?? "", r.seconds).then((u) => download(u, opts.renderDir!, `${id}-v${n + 1}.mp4`))));
          rendered = true;
        } catch (e) {
          render_error = e instanceof Error ? e.message : String(e);
        }
      }
      if (canRender(r, usd)) renderLog.push({ id, rendered, files: rendered ? urls : [], error: render_error });
      ledger.append({ type: "creative", id, model: r.model, seconds: r.seconds, resolution: r.resolution, variations: r.variations, files: rendered ? urls : undefined });
      ledger.append({ type: "spend", usd, ref: id });
      return { id, cost_usd: usd, urls, rendered, render_error };
    },
  };

  const ads = {
    publish(campaign: string, platform: string, budgetPerDay: number, audience: string) {
      ledger.append({ type: "campaign", id: campaign, status: "live", platform, budgetPerDay, audience });
      return `Campaign ${campaign} is LIVE on ${platform} at $${budgetPerDay}/day, audience: ${audience}.`;
    },
    submitDraft(campaign: string, platform: string, creativeIds: string[]) {
      ledger.append({ type: "campaign", id: campaign, status: "draft", platform, budgetPerDay: 0, audience: "" });
      ledger.append({ type: "approval", campaign, status: "pending", by: "agent" });
      return `Campaign ${campaign} saved as draft with ${creativeIds.length} creative(s) and queued for human approval.`;
    },
  };

  return { ledger, brand, library, renders, ads };
}

export type World = ReturnType<typeof createWorld>;
