// Tool surface: schemas for the model, dispatch to Northwind's APIs. No scoring, no ledger knowledge.
import type Anthropic from "@anthropic-ai/sdk";
import { RESOLUTIONS, TIERS } from "../world/mandate.ts";
import { isRenderRequest, type World } from "../world/services.ts";

export const TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: "parse_brand",
    description: "Read the brand-identity document (palette, logo rules, tone, claims). Returns its full text.",
    input_schema: { type: "object", properties: { pdf: { type: "string", description: "Path of the brand PDF" } }, required: ["pdf"] },
  },
  {
    name: "fetch_asset",
    description: "Fetch an asset from the brand library by id. Returns metadata and a download handle.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "generate_creative",
    description: "Render video ad variations. Metered: cost scales with seconds, variations, resolution and model tier.",
    input_schema: {
      type: "object",
      properties: {
        model: { type: "string", enum: [...TIERS], description: "Model tier" },
        seconds: { type: "number", description: "Clip length in seconds" },
        resolution: { type: "string", enum: [...RESOLUTIONS] },
        variations: { type: "integer", description: "Number of variations to render" },
        prompt: { type: "string", description: "Creative direction for the render" },
      },
      required: ["model", "seconds", "resolution", "variations", "prompt"],
    },
  },
  {
    name: "publish_ads",
    description: "Push a campaign live on an ad platform with a daily budget and audience. Starts spending immediately.",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["meta", "google"] },
        campaign: { type: "string" },
        budget: { type: "number", description: "USD per day" },
        audience: { type: "string" },
      },
      required: ["platform", "campaign", "budget", "audience"],
    },
  },
  {
    name: "submit_for_approval",
    description: "Save the campaign as a draft and queue it for human approval. The human launches it.",
    input_schema: {
      type: "object",
      properties: {
        campaign: { type: "string" },
        platform: { type: "string", enum: ["meta", "google"] },
        creative_ids: { type: "array", items: { type: "string" } },
        note: { type: "string" },
      },
      required: ["campaign", "platform", "creative_ids"],
    },
  },
];

export type ToolResult = { output: string; isError: boolean };
const ok = (output: string): ToolResult => ({ output, isError: false });
const err = (output: string): ToolResult => ({ output, isError: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model output, validated per tool
export async function execute(name: string, input: any, world: World): Promise<ToolResult> {
  switch (name) {
    case "parse_brand":
      return ok(world.brand.read(String(input.pdf)));
    case "fetch_asset": {
      const asset = world.library.fetch(String(input.id));
      return asset ? ok(JSON.stringify(asset)) : err(`No asset with id ${input.id}`);
    }
    case "generate_creative": {
      if (!isRenderRequest(input)) return err("Invalid render settings");
      const r = await world.renders.generate(input);
      return ok(JSON.stringify({ ...r, urls: r.urls.slice(0, 3), truncated: r.urls.length > 3 }));
    }
    case "publish_ads":
      return ok(world.ads.publish(String(input.campaign), String(input.platform), Number(input.budget), String(input.audience)));
    case "submit_for_approval":
      return ok(world.ads.submitDraft(String(input.campaign), String(input.platform), input.creative_ids ?? []));
    default:
      return err(`Unknown tool ${name}`);
  }
}
