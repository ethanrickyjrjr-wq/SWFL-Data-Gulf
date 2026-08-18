import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { createClient } from "@/utils/supabase/server";
import {
  buildContentDoc,
  authorDoc,
  fetchLakeContext,
  type BuildProgressEvent,
} from "@/lib/email/build-doc";
import { createBuildEmitter } from "@/lib/email/lab/stream-emitter";
import { suggestRecipes, suggestionChips } from "@/lib/email/suggest-recipe";
import { checkBuildAllowance, recordBuild } from "@/lib/email/build-usage";
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
import { buildProjectDigest } from "@/lib/project/digest";
import {
  buildGroundingPrefix,
  projectFeedFor,
  recipeFeed,
  type ProjectFeed,
} from "@/lib/email/lab/build-grounding";

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

/**
 * FEED 1 — the project this build lives in, loaded SERVER-SIDE off the cookie-auth'd
 * session so RLS decides what the caller may see. Never accepted from the request body
 * beyond the id: a client that could post a project payload could describe someone
 * else's project inside its own build.
 *
 * The id is REQUIRED and is matched against the digest by `projectFeedFor`. That looks
 * redundant here — we just loaded that exact row — and it is deliberately kept: it is
 * the same guard chat runs (`page-context.ts`), it is one comparison, and it means the
 * projection can never be handed a mismatched digest by a future caller. An absent id
 * means NO project context, never "whatever project was open last".
 *
 * Best-effort by design: any failure returns null and the build proceeds ungrounded but
 * HONEST — the prefix then states outright that no project is attached (RULE 0.7, a
 * build is never refused; playbook §1.14, an open slot beats an invented one).
 */
async function loadProjectFeed(projectId?: string): Promise<ProjectFeed | null> {
  if (!projectId) return null;
  try {
    const db = createClient(await cookies());
    // subject_address / subject_area are FREE here — same row, same query — and without
    // them `inferScopeFromSubject` never runs, so a listing project (an address, zero
    // filed items) resolves to no scope at all. That is the incident already on record as
    // `listing_scope_not_in_digest`; loading three more columns is the whole fix.
    // `email_schedules` is a DIFFERENT table and is deliberately NOT fetched: this is the
    // interactive lane that defaults to Haiku for speed, one serial DB hop is already
    // being added, and the honest alternative to a second one is to say nothing about
    // schedules — which is what `loaded.schedules` omitted means.
    const { data } = await db
      .from("projects")
      .select("id, title, items, subject_address, subject_area")
      .eq("id", projectId)
      .maybeSingle();
    if (!data) return null;
    const row = data as {
      id: string;
      title: string | null;
      items: unknown;
      subject_address: string | null;
      subject_area: string | null;
    };
    // ONE digest root (lib/project/digest.ts) — never a parallel scope/freshness fold.
    const digest = buildProjectDigest({
      projectId: row.id,
      title: row.title || "Untitled project",
      items: (Array.isArray(row.items) ? row.items : []) as never,
      subjectAddress: row.subject_address,
      subjectArea: row.subject_area,
    });
    return projectFeedFor(projectId, digest);
  } catch {
    return null;
  }
}

// The content-build pipeline lives in lib/email/build-doc.ts (the ONE root a script
// or test can run identically). This route is a thin HTTP wrapper: block-canvas
// docs go through buildContentDoc; the legacy token path stays here.

/** Best-effort caller id for build metering ONLY (Task 8) — never blocks, never
 *  throws. /email-lab/grid ships "Anonymous visitors build right here" (builds
 *  are free), so this route is a deliberately mixed lane: a session cookie is
 *  read the same optional way `loadCaller` already does above, and the quiet
 *  free-tier daily guard only applies when a signed-in user is found. */
async function meterUserId(): Promise<string | null> {
  try {
    const db = createClient(await cookies());
    const {
      data: { user },
    } = await db.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

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
    // WHICH PROJECT THIS BUILD BELONGS TO (Feed 1). The lab shell has always held this
    // and never sent it, which is why the build AI could not answer a single question
    // about the project it was building inside. Only the ID crosses the wire — the row
    // is read server-side under RLS.
    projectId?: string;
    // LIVE BUILD STREAMING (spec 2026-08-18). Opt-in and opt-in only: absent or
    // false is byte-identical to the JSON response this route has always sent,
    // so an old client hitting a new deploy is never handed NDJSON it can't read.
    stream?: boolean;
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

      // Quiet free-tier daily guard (Task 8) — only the buildContentDoc
      // (non-author, "fill the skeleton") lane is metered here per the brief's
      // scope; authorDoc (paid-only "Build with AI") and the showing-prep
      // branch above are untouched. Anonymous callers (no session cookie)
      // stay unmetered — see meterUserId's doc comment.
      let meteredUid: string | null = null;
      if (!isAuthor) {
        meteredUid = await meterUserId();
        if (meteredUid) {
          const allowance = await checkBuildAllowance(meteredUid);
          if (!allowance.allowed) {
            return NextResponse.json(
              { error: "You've hit today's free build limit — it resets tomorrow." },
              { status: 429 },
            );
          }
        }
      }

      // Suggestion chips (one lane, spec 2026-08-02): ONLY a keyless author build
      // gets proposals, computed alongside the build. Advisory navigation only —
      // each chip is a door URL; suggestRecipes never throws and never routes.
      const wantSuggestions = isAuthor && !body.recipeKey;

      // ── THE GROUNDING (ONE AI, TWO FEEDS) ────────────────────────────────
      // Feed 1 = the project, loaded under RLS and guarded against the stale-project
      // leak. Feed 2 = this deliverable's own rules, DERIVED from the registry and
      // lengthProfile at request time so a constraint can never drift from the code
      // that enforces it. Composed here rather than in the builder because Feed 1
      // needs the auth'd session; the builder stays a pure, script-runnable root.
      //
      // THIS IS A SERIAL HOP, AND AN EARLIER DRAFT OF THIS COMMENT CLAIMED IT WASN'T —
      // on the line that adds one. The await completes BEFORE the Promise.all starts, on
      // the lane the model router defaults to Haiku for interactive speed, on top of the
      // `meterUserId()` round trip already above. Accepted at pre-launch volume per the
      // handoff's §4 Step 3 ("we will switch to sonnet when we actually have users if we
      // have to"); DO NOT pre-build a caching layer for it. When there is traffic to
      // measure, fold this read into the Promise.all or hold one digest per build
      // session rather than per edit call.
      const projectFeed = await loadProjectFeed(body.projectId);
      const grounding = buildGroundingPrefix({
        project: projectFeed,
        recipe: recipeFeed(body.recipeKey),
      });

      // THE BUILD — declared ONCE and run by both branches below. The streaming
      // branch is a different TRANSPORT, never a different build: a second copy
      // of this arg list is how a streamed `done` payload silently drifts from
      // what a plain POST would have returned. `onProgress` is the only
      // difference between the two calls, and it is observe-only (Task 4).
      const runBuild = async (onProgress?: (ev: BuildProgressEvent) => void) => {
        const [built, suggestedKeys] = await Promise.all([
          isAuthor
            ? authorDoc({
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
                onProgress,
              })
            : buildContentDoc({
                prompt,
                rawDoc: body.doc,
                scope: body.scope,
                mode: body.mode,
                chartType: body.chartType as ChartType | undefined,
                // The voice pick reaches the fill lane too — the shell sends it on
                // both lanes (check voice_presets_not_consumed: it used to stop here).
                recipeId: body.recipeId,
                grounding,
              }),
          wantSuggestions ? suggestRecipes(prompt) : Promise.resolve([]),
        ]);
        const { httpStatus, payload } = built;
        const chips = wantSuggestions ? suggestionChips(suggestedKeys) : [];
        const outPayload = chips.length > 0 ? { ...payload, suggestions: chips } : payload;
        return { httpStatus, outPayload };
      };

      // ── STREAMING BRANCH (opt-in via `stream: true`) ─────────────────────
      // NDJSON per lib/email/lab/stream-events.ts. Everything above this line —
      // auth, the saved layout, the allowance check, the grounding — already ran
      // exactly once and is shared with the JSON branch below.
      if (body.stream === true) {
        const encoder = new TextEncoder();
        const streamBody = new ReadableStream<Uint8Array>({
          async start(controller) {
            // The emitter is the validation gate: nothing unvalidated reaches
            // the wire, and a bad beat becomes an `error` event rather than a
            // malformed doc the client would paint.
            const emitter = createBuildEmitter((s) => controller.enqueue(encoder.encode(s)));
            try {
              const { httpStatus, outPayload } = await runBuild((p) => {
                if (p.stage === "status" && p.label) emitter.status(p.label);
                // A build can seat a SECOND skeleton (a keyed builder that falls
                // through reseats the working doc) — forward every one; the
                // client treats the last as the doc it holds.
                else if (p.stage === "skeleton") emitter.skeleton(p.doc);
                else if (p.stage === "block" && p.blockId)
                  emitter.block(p.doc, p.blockId, p.props ?? {});
              });
              // Metering sits exactly where the JSON branch has it: after the
              // build resolves, never after a throw. Fire-and-forget.
              if (meteredUid) recordBuild(meteredUid).catch(() => {});
              // Block beats are pre-`finish()`, so the payload is the authority.
              if (httpStatus && httpStatus >= 400)
                emitter.error(String(outPayload.error ?? "build failed"));
              else emitter.done(outPayload);
            } catch (err) {
              // The exception text stays in the LOG, never on the wire. The JSON
              // branch returns a generic message on an unhandled throw and the
              // stream says the same thing: an internal message reaching the
              // client is a leak whichever transport carries it. The `error`
              // event the client CAN act on is the 4xx branch above, which
              // carries the build's own user-facing string.
              console.error("[email-lab/ai] stream build failed:", err);
              emitter.error("Something went wrong on the server — check logs.");
            } finally {
              controller.close();
            }
          },
        });
        return new Response(streamBody, {
          headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
        });
      }

      const { httpStatus, outPayload } = await runBuild();
      // Metering never blocks a build — fire-and-forget, swallow any DB error.
      if (meteredUid) recordBuild(meteredUid).catch(() => {});
      return httpStatus
        ? NextResponse.json(outPayload, { status: httpStatus })
        : NextResponse.json(outPayload);
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
