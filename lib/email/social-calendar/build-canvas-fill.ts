// lib/email/social-calendar/build-canvas-fill.ts
//
// AI fill for the canvas composer. Reuses the shipped four-lane social prompt + parser
// (socialPostSystem / tryParseSocial) — the patch keyed by element id maps 1:1 onto canvas
// element ids via applyDesignPatch.
//
// CORRECTED 08/27/2026 — this header said "The no-invention moat lives in the prompt;
// nothing is scrubbed here," and that was the hole `lib/deliverable/claims.ts:53-54`
// named ("the SOCIAL path has NO no-invention gate of any kind today"). STAT values are
// now anchored against the facts the model was handed before the patch leaves this
// function (`lib/social/stat-anchor.ts`) — server-side of the wire, because the route
// hands `payload.patch` to the CLIENT on both the JSON and NDJSON branches. Captions are
// still unscrubbed, deliberately: a caption can carry the inline citation four-lane's
// lane 3 requires, and a stat tile cannot.
//
// Note: chart elements render a placeholder today (no v1 chart-from-brain flow exists);
// full chart support in the canvas is a follow-up task.
import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import {
  socialPostSystem,
  tryParseSocial,
  buildVariants,
} from "@/lib/email/social-calendar/build-week";
import { fetchLakeParts, refreshStaleLakeContext, type BuildScope } from "@/lib/email/build-doc";
import { resolveEmailModel } from "@/lib/email/model-router";
import type { GoalTone } from "@/lib/email/social-calendar/types";
import { sourceClaims, gateCanvasFillPatch, warnDropped } from "@/lib/social/stat-anchor";
import type { Platform } from "@/lib/social/types";

// ADDENDUM pins the exact field names the patch must use — load-bearing because
// socialPostSystem's allowed-fields list (prose/body/title/caption/kicker/…) does NOT
// include "text", and applyDesignPatch's whitelist is text→["text"], stat→["value","label"],
// cta→["text"]. Without the pin, the model writes body/caption and the patch is silently
// dropped, leaving elements unfilled.
const ADDENDUM =
  "A single social post. Fill the listed ELEMENTS with cited SWFL figures. " +
  'A stat value must be the figure EXACTLY as the data above prints it ("$412,000", not "$412K") — never rounded, never abbreviated, never a figure the data does not contain. A stat tile has no room for a citation, so an unsourced number in one is dropped to an empty slot. Keep the value to a few words.' +
  ' In your patch, key by the EXACT element ids shown and use ONLY the field names each element lists: text and button elements use "text"; stat elements use "value" and "label". Do NOT use any other field names (no prose, body, title, caption, kicker).';

/** The user message: element id -> current text fields (mirrors docSkeleton's shape for the email path). */
export function canvasFillPrompt(skeleton: Record<string, Record<string, string>>): string {
  const lines = Object.entries(skeleton).map(([id, fields]) => `${id}: ${JSON.stringify(fields)}`);
  return `ELEMENTS (id -> current text fields):\n${lines.join("\n")}`;
}

export interface CanvasFillResult {
  caption: string;
  hashtags: string[];
  patch: Record<string, Record<string, unknown>>;
  variants: Partial<Record<Platform, string>>;
  webSources: { label: string; value: string; url: string }[];
}

export async function buildSocialCanvasFill(
  scope: BuildScope | undefined,
  skeleton: Record<string, Record<string, string>>,
  opts?: {
    platforms?: Platform[];
    goalTone?: GoalTone;
    /** Observe-only progress for the streaming lane (spec 2026-08-18), mirroring
     *  `authorDoc`'s `onProgress`: never awaited, never alters what the build
     *  computes, and absent = byte-identical to the pre-streaming build. */
    onStatus?: (label: string) => void;
  },
): Promise<CanvasFillResult | null> {
  const status = (label: string): void => {
    try {
      opts?.onStatus?.(label);
    } catch {
      /* a broken observer never breaks the build it is watching */
    }
  };
  status("reading the lake");
  const { figures, dossier } = await fetchLakeParts(scope);
  status("checking sources");
  const fresh = await refreshStaleLakeContext({
    scope,
    figures,
    dossier,
    prompt: scope?.value
      ? `${scope.value} Southwest Florida real estate market`
      : "Southwest Florida real estate market",
    today: new Date(),
    includeGapProbe: false,
  });
  try {
    status("writing the post");
    const msg = await getAnthropic("other").messages.create({
      model: resolveEmailModel("interactive"),
      max_tokens: opts?.platforms?.length ? Math.min(512 + opts.platforms.length * 320, 2048) : 700,
      system: socialPostSystem(fresh.lakeContext, ADDENDUM, opts),
      messages: [{ role: "user", content: canvasFillPrompt(skeleton) }],
    });
    const txt = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const parsed = tryParseSocial(txt);
    if (!parsed) return null;
    // THE STAT GATE — on the PATCH, because the route ships `payload.patch` to the client
    // and the CLIENT calls applyDesignPatch. Gating here is the one point both the JSON
    // and the NDJSON branch (and an out-of-date client) pass through.
    const gated = gateCanvasFillPatch(
      (parsed.patch as Record<string, Record<string, unknown>>) ?? {},
      skeleton,
      sourceClaims(fresh.lakeContext),
    );
    warnDropped("social canvas fill", gated.dropped);
    return {
      caption: parsed.caption,
      hashtags: parsed.hashtags,
      patch: gated.patch,
      variants: opts?.platforms?.length
        ? buildVariants(parsed.caption, parsed.variants, opts.platforms)
        : parsed.variants,
      webSources: fresh.web.verified.map((v) => ({
        label: v.label,
        value: String(v.value),
        url: v.url,
      })),
    };
  } catch {
    return null;
  }
}
