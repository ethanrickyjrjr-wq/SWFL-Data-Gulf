import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { createClient } from "@/utils/supabase/server";
import { buildContentDoc, authorDoc, fetchLakeContext } from "@/lib/email/build-doc";
import { toPanelItem, type MediaAssetRow } from "@/lib/email/media-assets";
import type { LibraryAsset } from "@/lib/email/author-doc";
import { resolveEmailModel } from "@/lib/email/model-router";
import type { ChartType } from "@/lib/email/reshape-chart-type";
import { isShowingPrepPrompt } from "@/lib/email/showing-prep-intent";
import { gatherShowingPrepData } from "@/lib/listings/showing-prep-source";
import { assembleShowingPrepDoc } from "@/lib/email/showing-prep-assemble";
import { SHOWING_PREP_INTRO_NOTE } from "@/lib/email/showing-prep-copy";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { seedById } from "@/lib/email/doc/default-docs";
import { loadUserLayout } from "@/lib/email/doc/layout-store";

/** The caller's media library for the author's ASSET MENU (newest 24) plus their
 *  account email (the engine-owned reply-CTA destination — the same address every
 *  blast send already uses as reply-to). Anonymous or failing → empty. */
async function loadCaller(): Promise<{ assets: LibraryAsset[]; email?: string }> {
  try {
    const db = createClient(await cookies());
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return { assets: [] };
    const { data } = await db
      .from("email_media_assets")
      .select()
      .order("created_at", { ascending: false })
      .limit(24);
    return {
      assets: ((data ?? []) as unknown as MediaAssetRow[]).map(toPanelItem),
      email: user.email ?? undefined,
    };
  } catch {
    return { assets: [] };
  }
}

// The content-build pipeline lives in lib/email/build-doc.ts (the ONE root a script
// or test can run identically). This route is a thin HTTP wrapper: block-canvas
// docs go through buildContentDoc; the legacy token path stays here.

// ── Legacy token mode (kept for the transition / structural templates) ───────
function legacyTokenSystem(lakeContext?: string): string {
  const dataBlock = lakeContext
    ? `\n\nREAL LAKE DATA (use these numbers — do not invent):\n${lakeContext}\n`
    : "";
  return `You are an email design assistant for SWFL Data Gulf, a Southwest Florida real estate intelligence platform.

The user will describe the email they want. Return ONLY a valid JSON object with updated token values — no markdown, no explanation.${dataBlock}

Available tokens: COMPANY_NAME, TAGLINE, WEBSITE_URL, CONTACT_EMAIL, HERO_KICKER, HERO_VALUE, HERO_LABEL, HERO_PROSE, STAT1_VALUE, STAT1_LABEL, STAT2_VALUE, STAT2_LABEL, STAT3_VALUE, STAT3_LABEL, SIGNAL_KICKER, SIGNAL_TITLE, SIGNAL_BODY.

Rules:
- Data sourcing — four lanes: (1) LAKE DATA above, verbatim; (2) user's uploaded doc or figure — use exactly what they gave; (3) widely known public figure with source inline (e.g. "per Realtor.com"); (4) write [Need: description] placeholder if you can't source it at all. Never invent. Never leave a field blank because you don't have it.
- Keep prose tight — no fluff
- Return only the tokens you're changing, not all of them`;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { applied: false, message: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  const body = (await req.json()) as {
    prompt?: string;
    doc?: unknown;
    currentTokens?: Record<string, string>;
    scope?: { kind?: string; value?: string; address?: string };
    // "interactive" (default → Haiku) | "quality"/"snicklefritz" (Sonnet) | "max" (Opus).
    mode?: string;
    // Optional chart shape chosen in the lab control: bar | ranked | donut | dotplot.
    chartType?: string;
    // PAID author (build 03): compose the WHOLE doc (blocks + layout) from the data
    // menu, not just re-fill the current skeleton. `build:true` (or mode "author").
    build?: boolean;
    // Explicit deliverable-type recipe pick (M3) — overrides keyword detection.
    recipeId?: string;
    // THE RECIPE KEY (?rkey= — lib/deliverable/recipes.ts). The deliverable's identity,
    // carried from whichever door the user clicked. This is what the builder dispatches
    // on, so the hero pill, the showcase card, the campaign button and the lab pick all
    // produce the SAME thing. Distinct from `recipeId` above, which is the PROSE recipe.
    recipeKey?: string;
    // "Use the layout you built for 326 Shore Dr" — the user said yes at the popup.
    // We load THEIR saved grid for this recipe and reshape the fresh build into it.
    // Absent/false → the standard coded grid, byte-identical to before this shipped.
    useSavedLayout?: boolean;
  };
  const prompt = body.prompt ?? "";

  // New block-canvas mode wins when a doc is present.
  if (body.doc !== undefined) {
    // "Build with AI" → the author engine composes the whole document; the default
    // (re-fill the existing skeleton) stays buildContentDoc. Both validate the doc.
    const isAuthor = body.build === true || body.mode === "author";
    try {
      // Showing Prep Packet — a dedicated build path (not authorDoc). Fires only on the
      // showing-prep recipe carrying a subject address; returns the coded packet doc in
      // the same { applied, doc } shape the canvas already consumes, plus a `note` —
      // it's not obvious from "build a packet" alone that this isn't a marketing email.
      // Never throws — every sourcing lane degrades to an empty cell.
      const spAddress =
        (typeof body.scope?.address === "string" && body.scope.address.trim()) || "";
      if (isShowingPrepPrompt(prompt) && spAddress) {
        const parsed = EmailDocSchema.safeParse(body.doc);
        const base = parsed.success ? parsed.data : seedById("market-spotlight")!.build();
        const data = await gatherShowingPrepData(spAddress);
        const doc = await assembleShowingPrepDoc(data, base);
        return NextResponse.json({ applied: true, doc, note: SHOWING_PREP_INTRO_NOTE });
      }

      const caller = isAuthor ? await loadCaller() : null;
      // THE USER'S OWN GRID. Loaded server-side off the cookie-auth'd session (RLS —
      // "FOR THEM ONLY"), never accepted from the client: a layout posted in the body
      // would let one user shape another's build. Only when they answered yes at the
      // popup, and only for a recipe — an organic typed ask has no saved shape.
      const savedLayout =
        isAuthor && body.useSavedLayout && body.recipeKey
          ? await loadUserLayout(body.recipeKey).catch(() => null)
          : null;
      const { httpStatus, payload } = isAuthor
        ? await authorDoc({
            prompt,
            rawDoc: body.doc,
            scope: body.scope,
            mode: body.mode,
            chartType: body.chartType as ChartType | undefined,
            assets: caller?.assets,
            replyEmail: caller?.email,
            recipeId: body.recipeId,
            recipeKey: body.recipeKey,
            savedLayout,
          })
        : await buildContentDoc({
            prompt,
            rawDoc: body.doc,
            scope: body.scope,
            mode: body.mode,
            chartType: body.chartType as ChartType | undefined,
          });
      return httpStatus
        ? NextResponse.json(payload, { status: httpStatus })
        : NextResponse.json(payload);
    } catch (err) {
      console.error("[email-lab/ai] unhandled error:", err);
      return NextResponse.json(
        { applied: false, message: "Something went wrong on the server — check logs." },
        { status: 500 },
      );
    }
  }

  // ── Legacy token mode ──
  const lakeContext = await fetchLakeContext(body.scope);
  const model = resolveEmailModel(body.mode);
  const userMsg = body.currentTokens
    ? `Current values:\n${JSON.stringify(body.currentTokens, null, 2)}\n\nUser request: ${prompt}`
    : `User request: ${prompt}`;

  const msg = await getAnthropic("other").messages.create({
    model,
    max_tokens: 1024,
    system: legacyTokenSystem(lakeContext || undefined),
    messages: [{ role: "user", content: userMsg }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
  let tokens: Record<string, string> = {};
  try {
    const m = text.match(/\{[\s\S]*\}/);
    tokens = m ? JSON.parse(m[0]) : {};
  } catch {
    // empty update on parse failure
  }
  return NextResponse.json({ tokens });
}
