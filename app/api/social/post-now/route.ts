// app/api/social/post-now/route.ts
//
// POST /api/social/post-now — the operator-only "Post to Bluesky" button (spec
// docs/superpowers/specs/2026-07-26-bluesky-post-now-design.md, plan
// docs/superpowers/plans/2026-07-26-bluesky-post-now.md, Task 4). Posts the
// composed canvas card + caption to @swfldatagulf.com via an env app-password
// credential — NOT OAuth, NOT the cron/schedule lane (SOCIAL_PUBLISH_ENABLED
// guards only that unattended lane; this route calls postToBluesky directly).
//
// Auth: cookie-bound `@/utils/supabase/server` client for session identity
// ONLY (auth.getUser()). `public.social_posts` grants SELECT/INSERT to
// `service_role` alone (verified live 07/26/2026 via
// information_schema.role_table_grants — `authenticated`/`anon` have zero
// privileges on this table), so the dedupe SELECT and the publish INSERT both
// go through `@/utils/supabase/service-role` per app/api/CLAUDE.md's
// escalation rule ("only for tables whose RLS policies grant to
// service_role"). The operator gate itself is what authorizes the call, not
// per-user RLS.
//
// Gate order (exact, per the brief):
//   session → operator email → env presence → validatePostNow → empty-post →
//   contentHash → dedupe (10 min) → postToBluesky → insert (best-effort) → 200.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { validatePostNow, contentHash } from "@/lib/social/post-now-validate";
import { postToBluesky } from "@/lib/social/channels/bluesky";

export const runtime = "nodejs";

const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_ALT = "SWFL Data Gulf market card";

/**
 * Optional `{width, height}` pass-through for the image embed's aspectRatio
 * hint (lib/social/channels/bluesky.ts's BlueskyPostInput.image.aspectRatio).
 * Malformed or missing input is NOT an error — it's just dropped, since the
 * card still posts fine without the hint. Only two positive integers count.
 */
function parseAspectRatio(body: unknown): { width: number; height: number } | undefined {
  const raw = (body as { aspectRatio?: unknown } | null)?.aspectRatio;
  if (!raw || typeof raw !== "object") return undefined;
  const { width, height } = raw as { width?: unknown; height?: unknown };
  const isPositiveInt = (n: unknown): n is number =>
    typeof n === "number" && Number.isInteger(n) && n > 0;
  if (!isPositiveInt(width) || !isPositiveInt(height)) return undefined;
  return { width, height };
}

export async function POST(req: NextRequest) {
  // 1. Session — cookie-bound client, auth only.
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2. Operator gate — fail CLOSED. Missing OPERATOR_EMAIL, no session email,
  // or a mismatch are all 403; never treat "both absent" as a pass. Compared
  // trimmed + lower-cased on both sides so a stray space or a differently-cased
  // email (Supabase sessions, a hand-typed Vercel env var) doesn't false-403 —
  // an empty string on either side after trim is still falsy, so it stays
  // fail-closed, never an accidental "" === "" pass.
  const operatorEmail = process.env.OPERATOR_EMAIL?.trim().toLowerCase();
  const sessionEmail = user?.email?.trim().toLowerCase();
  if (!operatorEmail || !sessionEmail || sessionEmail !== operatorEmail) {
    return NextResponse.json({ error: "Only the site operator can post." }, { status: 403 });
  }

  // 3. Env presence — the app-password credential, checked BEFORE validation
  // so a misconfigured environment never leaks caption/image validation detail.
  const identifier = process.env.BSKY_IDENTIFIER;
  const appPassword = process.env.BSKY_APP_PASSWORD;
  if (!identifier || !appPassword) {
    return NextResponse.json({ error: "Bluesky not configured" }, { status: 503 });
  }

  // Parse defensively — a malformed/missing body must 400, never throw into a 500
  // (Intl.Segmenter.segment(undefined) would throw inside validatePostNow).
  const body = await req.json().catch(() => null);
  const caption = typeof body?.caption === "string" ? body.caption : "";
  const imageDataUrl = typeof body?.imageDataUrl === "string" ? body.imageDataUrl : undefined;
  const alt = typeof body?.alt === "string" ? body.alt : "";

  // 4. Validate — grapheme cap, image byte cap / decode.
  const result = validatePostNow({ caption, imageDataUrl });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // 5. Empty-post guard — validatePostNow passes an empty caption BY DESIGN
  // (an image-only post is valid); reject only when there is truly nothing to post.
  if (!caption.trim() && result.bytes === null) {
    return NextResponse.json({ error: "nothing to post" }, { status: 400 });
  }

  // 6/7. Dedupe — same content within the last 10 minutes → 409, no adapter call.
  const hash = await contentHash(caption, result.bytes);
  const idempotencyKey = `postnow:${hash.slice(0, 32)}`;
  const db = createServiceRoleClient();
  const tenMinAgoIso = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const { data: dupes } = await db
    .from("social_posts")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .gte("created_at", tenMinAgoIso)
    .limit(1);
  if (dupes && dupes.length > 0) {
    return NextResponse.json(
      { error: "Same caption and image were already posted in the last 10 minutes." },
      { status: 409 },
    );
  }

  // 8. Publish. aspectRatio is optional pass-through — malformed/missing input
  // is silently ignored (never a 400) since the composer's export ladder
  // already renders a correct card without it; Bluesky just skips the hint.
  const aspectRatio = parseAspectRatio(body);
  const publishResult = await postToBluesky(
    {
      caption,
      image: result.bytes
        ? {
            bytes: result.bytes,
            mime: result.mime!,
            alt: alt || DEFAULT_ALT,
            ...(aspectRatio ? { aspectRatio } : {}),
          }
        : undefined,
    },
    { identifier, appPassword },
  );

  // 9. Platform failure → 502, error verbatim. Never persisted.
  if (!publishResult.ok) {
    return NextResponse.json({ ok: false, error: publishResult.error }, { status: 502 });
  }

  // 10. Best-effort history row — insert failure does NOT fail the response.
  const nowIso = new Date().toISOString();
  const { error: insertErr } = await db.from("social_posts").insert({
    platform: "bluesky",
    post_schedule_id: null,
    social_account_id: null,
    platform_post_id: publishResult.uri,
    caption,
    media_url: null,
    status: "published",
    idempotency_key: idempotencyKey,
    published_at: nowIso,
  });
  if (insertErr) {
    console.error("[post-now] posted but social_posts insert failed", publishResult.uri, insertErr);
  }

  return NextResponse.json({ ok: true, url: publishResult.url, uri: publishResult.uri });
}
