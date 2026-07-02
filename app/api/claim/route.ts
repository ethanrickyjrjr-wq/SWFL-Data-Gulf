import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { projectItemsSchema } from "@/lib/project/items";
import { recordUse } from "@/lib/highlighter/meter";
import { applyUserBrandToProject, persistClaimBrandToProfile } from "@/lib/project/apply-brand";
import { deriveProjectName } from "@/lib/project/derive-name";
import {
  consumeClaimToken,
  fetchRawClaimItems,
  attachProjectId,
  deterministicProjectId,
} from "@/lib/claim/claim-store";
import { logClaimed } from "@/lib/prospects/arrival-event";
import { writeFeed } from "@/lib/project/feed";
import { identityKeyForItem, titleForItem } from "@/lib/project/identity-key";

import type { ClaimBrand } from "@/lib/claim/claim-store";

export const runtime = "nodejs";

/**
 * Map a prospect's carried brand (arrival-URL shape) onto the `projects.branding`
 * jsonb keys. `company_name` is intentionally dropped — it feeds the project TITLE
 * (deriveProjectName at mint), not the branding theme. Returns null when nothing
 * maps so the insert omits the column entirely.
 */
function brandToBranding(brand: ClaimBrand | null | undefined): Record<string, string> | null {
  if (!brand) return null;
  const branding: Record<string, string> = {};
  if (brand.primary) branding.primary_color = brand.primary;
  if (brand.secondary) branding.accent_color = brand.secondary;
  if (brand.logo_url) branding.logo_url = brand.logo_url;
  return Object.keys(branding).length ? branding : null;
}

/**
 * POST /api/claim { token } — turn a valid carry-back token + a logged-in user
 * into an owned project (Plan B). Runs ONLY when already authenticated: the OTP
 * login happened in a prior request and bounced back to /claim. We NEVER
 * exchangeCodeForSession here.
 *
 * Race-proofing (load-bearing): the project id is DETERMINISTIC from the token, so
 * two simultaneous claims compute the same PK → the insert is idempotent (PK
 * conflict = no-op) and both responses carry the same id. The loser computes the id
 * directly (step 2) — it NEVER reads claim_tokens.project_id (that column is written
 * AFTER the winner's insert and a concurrent loser may read it null).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // (2) Deterministic id — winner AND loser navigate to this exact value.
  const id = deterministicProjectId(token);

  // (2.5) Pre-validate items BEFORE consuming — if schema parse fails the token stays
  //       unclaimed and the user gets a clean 422 they can retry or report. null means
  //       the token is already gone/consumed; the consume below handles that path.
  const rawItems = await fetchRawClaimItems(token);
  if (rawItems !== null && !projectItemsSchema.safeParse(rawItems).success) {
    return NextResponse.json({ error: "invalid items" }, { status: 422 });
  }

  // (3) The atomic UPDATE-guarded consume.
  const res = await consumeClaimToken(token);

  if (res.status === "expired" || res.status === "missing") {
    return NextResponse.json({ error: "claim_link_expired" }, { status: 410 });
  }

  if (res.status === "consumed") {
    // A loser (concurrent or sequential replay). The winner inserted — or is about
    // to insert — the row at this SAME deterministic id. Land there; do NOT read
    // row.project_id (may be null for a concurrent loser).
    return NextResponse.json({ id });
  }

  // res.status === "won" — items pre-validated above before consume.
  const items = projectItemsSchema.safeParse(res.items);
  if (!items.success) {
    // Unreachable: pre-validated and token is single-use so schema can't change.
    return NextResponse.json({ error: "invalid items" }, { status: 500 });
  }

  // Cookie client + RLS WITH CHECK binds the row to auth.uid() — the DATABASE is the
  // thing that binds it, never a hand-set user_id on a service-role write.
  // §G: a carried-back project keeps its handoff title, else auto-names from items.
  const title = res.title?.trim() ? res.title : deriveProjectName(items.data);
  // Funnel bridge: a prospect carries their scraped brand in the token (no auth.uid
  // brand profile exists yet for applyUserBrandToProject to read), so write it onto
  // the project at birth. A direct-create/MCP claim carries no brand → omitted.
  const branding = brandToBranding(res.brand);
  const { error } = await supabase.from("projects").insert({
    id,
    user_id: user.id,
    title,
    items: items.data,
    ...(branding ? { branding } : {}),
  });
  // 23505 = unique_violation: a racing winner already inserted this exact id →
  // idempotent success. Any other error is a real failure.
  if (error && (error as { code?: string }).code !== "23505") {
    return NextResponse.json({ error: "claim failed" }, { status: 500 });
  }

  // All best-effort, post-insert, independent (each swallows its own errors) — run
  // them concurrently. G2: brand the claimed project on the winner path so a
  // carried-back project starts branded like a direct create. persistClaimBrandToProfile
  // ALSO saves the funnel prospect's carried brand onto their ACCOUNT profile (creating
  // it) so it carries to EVERY future project — brandToBranding above only stamps this
  // first claimed one; without the profile persist, project #2 would land unbranded.
  await Promise.all([
    attachProjectId(token, id), // winner-side observability/cleanup
    recordUse(req, { report_id: id, reach: [], action: "claim" }, user.id),
    persistClaimBrandToProfile(supabase, user.id, res.brand),
    applyUserBrandToProject(supabase, user.id, id),
    // Outreach demo attribution: 'claimed' event + cadence stage → 'converted'
    // (winner only; logClaimed swallows its own errors and no-ops without a ref).
    ...(res.ref ? [logClaimed(res.ref)] : []),
  ]);

  // P3 outside-action birth emit — one feed row per claimed item. The "consumed"
  // loser path returned above without emitting, so only the winner reaches here.
  // writeFeed opens its own service-role client and never throws.
  // dedup_key is namespaced by project_id (here deterministic from the token): the
  // UNIQUE index is GLOBAL and item.id is the client-supplied draft id, so
  // `<projectId>:<item.id>` makes at-most-once per-(project,item) and keeps a replay
  // idempotent without colliding across projects/users.
  await writeFeed(
    items.data.map((item) => ({
      user_id: user.id,
      project_id: id,
      kind: "outside-action",
      title: titleForItem(item),
      ref_url: null,
      dedup_key: `outside-action:${id}:${item.id}`,
      payload: { identityKey: identityKeyForItem(item) },
    })),
  );

  // Echo the seed so ClaimOnLogin can replay the §I `/project/[id]?seed=` mechanism
  // (winner only — a concurrent "consumed" loser returned earlier without it and
  // simply lands on the unseeded project, which already exists branded).
  return NextResponse.json({ id, ...(res.seed ? { seed: res.seed } : {}) });
}
