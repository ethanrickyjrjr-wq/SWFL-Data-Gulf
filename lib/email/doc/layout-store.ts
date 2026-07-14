// lib/email/doc/layout-store.ts
//
// SERVER-SIDE read/write for a user's own recipe layout (`user_recipe_layouts`,
// migrations/20260713_user_recipe_layouts.sql). The pure reshape rules live next
// door in saved-layout.ts; this file is only the I/O.
//
// TWO INVARIANTS, both enforced here rather than trusted to callers:
//
//   1. NOTHING IS STORED UNSTRIPPED. `saveUserLayout` runs `stripToLayout` itself —
//      a caller cannot hand us a raw built doc and put the last house's price in the
//      database, even by mistake.
//   2. THE LAYOUT IS THEIRS ALONE (operator: "FOR THEM ONLY"). Every query rides the
//      COOKIE-AUTH'd client, so RLS (auth.uid() = user_id) is the enforcement, not a
//      WHERE clause we could forget. Never reach for the service-role client here.
//
// Best-effort by design: a signed-out user, a missing table, a dead connection — all
// return null / false. A layout is a convenience, never a gate on the build (RULE 0.7).

import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { EmailDocSchema } from "./schema";
import { stripToLayout } from "./saved-layout";
import type { EmailDoc } from "./types";

/** What the "use your layout?" ask needs to know — does one exist, and for what. */
export interface SavedLayoutSummary {
  /** The listing it was built for, in the user's words ("326 Shore Dr"). Display only. */
  subjectLabel: string | null;
  savedAt: string | null;
}

async function db() {
  return createClient(await cookies());
}

/**
 * The user's saved shape for this recipe, or null. Re-validated on the way OUT: a
 * row written by an older doc schema must degrade to "no layout" (→ the standard
 * grid), never to a half-parsed doc that throws mid-build.
 */
export async function loadUserLayout(recipeKey: string): Promise<EmailDoc | null> {
  try {
    const client = await db();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return null;

    const { data } = await client
      .from("user_recipe_layouts")
      .select("layout")
      .eq("user_id", user.id)
      .eq("recipe_key", recipeKey)
      .maybeSingle();
    if (!data?.layout) return null;

    const parsed = EmailDocSchema.safeParse(data.layout);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Does a layout exist for this recipe, and what was it built for? */
export async function layoutSummary(recipeKey: string): Promise<SavedLayoutSummary | null> {
  try {
    const client = await db();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return null;

    const { data } = await client
      .from("user_recipe_layouts")
      .select("subject_label, updated_at")
      .eq("user_id", user.id)
      .eq("recipe_key", recipeKey)
      .maybeSingle();
    if (!data) return null;

    return {
      subjectLabel: (data.subject_label as string | null) ?? null,
      savedAt: (data.updated_at as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * "WHATEVER THEY MAKE, THAT IS HOW IT SAVES." The grid they just built becomes their
 * grid for this recipe. Overwrites the previous one — the LAST thing they built is
 * always what "the same way" means.
 *
 * `doc` may be a freshly built doc, dirty with the current listing's data. It is
 * stripped HERE, before it is written; the row never holds a listing.
 *
 * `subjectLabel` is display-only — the address the popup will name back to them.
 */
export async function saveUserLayout(
  recipeKey: string,
  doc: unknown,
  subjectLabel?: string | null,
): Promise<boolean> {
  try {
    const parsed = EmailDocSchema.safeParse(doc);
    if (!parsed.success) return false;

    const client = await db();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return false;

    // Round-trip through JSON before the write. Two reasons, both real: an `EmailDoc`
    // is an interface, so TS won't accept it as a `Json` column without a cast — and
    // the serialize also DROPS undefined-valued keys, which is exactly what a jsonb
    // column should hold (an explicit `"subjectVariants": null` is a value; an absent
    // key is not).
    const layout = JSON.parse(JSON.stringify(stripToLayout(parsed.data)));

    const { error } = await client.from("user_recipe_layouts").upsert(
      {
        user_id: user.id,
        recipe_key: recipeKey,
        layout,
        subject_label: subjectLabel?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,recipe_key" },
    );
    return !error;
  } catch {
    return false;
  }
}

/** Back to the standard grid — "start fresh" as a permanent choice. */
export async function clearUserLayout(recipeKey: string): Promise<boolean> {
  try {
    const client = await db();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return false;
    const { error } = await client
      .from("user_recipe_layouts")
      .delete()
      .eq("user_id", user.id)
      .eq("recipe_key", recipeKey);
    return !error;
  } catch {
    return false;
  }
}
