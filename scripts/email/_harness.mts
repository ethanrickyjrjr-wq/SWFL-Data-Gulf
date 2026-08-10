/**
 * THE ONE ACCEPTANCE HARNESS — every `render-<email>.mts` script imports this.
 *
 * *** DO NOT COPY THESE FUNCTIONS INTO A NEW ACCEPTANCE SCRIPT. IMPORT THEM. ***
 *
 * WHY THIS FILE EXISTS. Four acceptance scripts (New Listing, Coming Soon, Market Comps,
 * Under Contract) were written one at a time, each copying the previous one's scaffolding:
 * 1,330 lines doing the same seven things — load the account brand, print a provenance
 * table, clip long values, print the bottom-of-email table, diff the brand carry keys,
 * render, save. Measured 08/06/2026 before this file existed.
 *
 * It is not a tidiness problem. Copying a fix instead of sharing it left the fix UNAPPLIED
 * in half the fleet, twice over:
 *
 *   1. `clip()` was written for New Listing after its provenance table printed an agent
 *      headshot as `https://www.swfldatagulf.com/showcase/launch` — a bare `.slice()` cut a
 *      URL with no marker, and a plain prefix of a URL is itself a plausible URL. It got
 *      filed as a live defect. It was not one. Coming Soon and Market Comps were still
 *      running `String(v).slice(0, 29)` with no ellipsis — the same stale-alarm generator,
 *      still armed, in the two scripts nobody went back to.
 *   2. Coming Soon held its OWN hardcoded 14-key copy of the brand carry list. When the real
 *      list widened to 32 the copy kept printing "0 carried" against an already-closed
 *      defect. Live-probed 08/06/2026: 32 carry keys, 30 filled on the demo account row.
 *      A stale alarm is worse than no alarm — the next session reads it and re-opens fixed
 *      work.
 *
 * WHAT STAYS IN EACH SCRIPT: its `rows[]` provenance list and its assertions. That is the
 * per-email thinking and it is SUPPOSED to be hand-written per email. This file is only the
 * scaffolding around it.
 *
 * WHAT NEVER MOVES IN HERE: anything that changes the RENDERED EMAIL. This harness prints,
 * loads and saves. The recipe builds. Keeping that line is what makes the consolidation
 * provable — see `docs/standards/email-build-playbook.md` PART 0.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { brandingToTokens } from "../../lib/email/brand/branding-to-tokens";
import { renderEmailDocHtml } from "../../lib/email/render-email-doc";
import { createServiceRoleClientUntyped } from "../../utils/supabase/service-role";
import { PROJECT_CARRY_KEYS } from "../../lib/brand/profile-ledger";
import type { EmailDoc } from "../../lib/email/doc/types";

/**
 * THE ACCEPTANCE HOUSE, for every listing-lifecycle email.
 *
 * Chosen off a live join 08/05/2026 because it is the one address that exercises EVERY lane
 * with ZERO new spend: the free spine holds its price/beds/baths/sqft/lot/type/photo, our own
 * listing clock holds a REAL (non-floored) day count, and the paid row already on disk holds
 * its year built, HOA, description, 43-photo gallery and the realtor.com link.
 */
export const DEFAULT_HOUSE = "12554 Kellysands Way, Fort Myers, FL 33908";

/**
 * The address under test — argv[2], or THIS EMAIL'S OWN default house.
 *
 * *** THE DEFAULT IS A PARAMETER, NEVER A SHARED CONSTANT. *** Each acceptance script picks
 * the house that exercises ITS lanes: Coming Soon needs one whose suppression contract can
 * actually leak, Market Comps needs one with a real comp set, Under Contract needs a
 * non-floored day count. Collapsing them to one address was tried on 08/06/2026 while building
 * this harness and it silently re-pointed two scripts at a different house — the same shape as
 * the bug this file exists to prevent, committed inside the fix for it. Caught by running the
 * pre-consolidation script and the new one back to back.
 */
export function subjectAddress(defaultHouse: string): string {
  return process.argv[2] ?? defaultHouse;
}

/**
 * A CLIPPED VALUE MUST LOOK CLIPPED.
 *
 * The ellipsis is the whole point: it makes "there is more" unmissable. A bare `.slice()` on
 * a URL produces another plausible URL, which is how a healthy headshot got written into a
 * handoff as a defect. Never print a truncated value without this.
 */
export function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * THE BRAND, OFF THE REAL ACCOUNT ROW — never a hardcoded literal.
 *
 * A hand-written fixture proves the RENDERER and proves nothing about whether an agent who
 * fills in their brand actually gets it. Hardcoding one is what hid the 17-field
 * account→project drop for a whole session.
 *
 * Returns the tokens the render path wants AND the raw profile row, because the carry-key
 * diagnostic below needs the raw columns.
 */
export async function loadAccountBrand(): Promise<{
  brand: ReturnType<typeof brandingToTokens>;
  profile: Record<string, string | null>;
}> {
  const uid = process.env.DEMO_BRAND_USER_ID ?? "37cc6c49-4759-4e07-9686-0a8dcce1f8ff";
  const db = createServiceRoleClientUntyped();
  const { data, error } = await db
    .from("user_brand_profiles")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  if (error || !data) {
    console.error(`  no brand profile for ${uid}: ${error?.message ?? "no row"}`);
    process.exit(1);
  }
  const profile = data as Record<string, string | null>;
  const blob: Record<string, string> = {};
  for (const [k, v] of Object.entries(profile)) {
    if (typeof v === "string" && v.trim())
      blob[k === "background_color" ? "backdrop_color" : k] = v;
  }
  return { brand: brandingToTokens(blob), profile };
}

/**
 * CAPTURE A DROPPED NARRATOR PARAGRAPH so the provenance table can say so.
 *
 * The worst failure shape we have: the claim gate throws the paragraph away, the email still
 * renders, every assertion still passes, and it is simply THINNER than it should be. The drop
 * was a `console.error` nobody read, and its symptom looks like nothing being wrong. Proven
 * live on the first acceptance run of Under Contract, which dropped on a sequence claim the
 * framing itself had induced.
 *
 * Returns the array the lines land in. Non-`[narrative]` errors pass through untouched.
 */
export function captureNarratorDrops(): string[] {
  const log: string[] = [];
  // BOTH channels (fixed 08/09/2026). The claim gate has always logged its drops via
  // console.WARN (shared.ts `[narrative] DROPPED`), but this hook only ever wrapped
  // console.ERROR — so no acceptance script ever actually captured a drop, and every
  // "DROPPED BY THE CLAIM GATE" provenance row was unreachable. Found when price-reduced's
  // assertion 7 read a live gate drop as "no paragraph and no recorded drop".
  const realError = console.error.bind(console);
  const realWarn = console.warn.bind(console);
  const hook =
    (passthrough: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      const line = args.map(String).join(" ");
      if (line.includes("[narrative]")) log.push(line);
      else passthrough(...args);
    };
  console.error = hook(realError);
  console.warn = hook(realWarn);
  return log;
}

/** One provenance row: the cell, its value (undefined = OPEN SLOT), and the lane that filled it. */
export type ProvenanceRow = [cell: string, value: string | undefined, source: string];

/**
 * THE PROVENANCE TABLE — every cell, and which lane filled it. "Where did this number come
 * from" is the question the whole email exists to answer, so the acceptance run answers it
 * per cell.
 */
export function printProvenance(rows: ProvenanceRow[]): { sourced: number; total: number } {
  console.log("  CELL                        VALUE                          SOURCE");
  console.log("  " + "─".repeat(108));
  for (const [cell, value, source] of rows) {
    console.log(
      `  ${cell.padEnd(27)} ${clip(value ? String(value) : "— OPEN SLOT", 30).padEnd(30)} ${source}`,
    );
  }
  const sourced = rows.filter(([, v]) => v).length;
  console.log(`\n  ${sourced} of ${rows.length} cells sourced · ${rows.length - sourced} open`);
  return { sourced, total: rows.length };
}

/**
 * THE BOTTOM OF THE EMAIL — identity, contact, socials. Every value here comes from the
 * ACCOUNT's brand profile, never from the listing. An empty one is an honest open slot the
 * agent fills in Branding, never something to invent.
 */
export function printBottom(doc: EmailDoc): void {
  const agent = doc.blocks.find((b) => b.type === "agent-card");
  const footer = doc.blocks.find((b) => b.type === "footer");
  const ap = (agent?.props ?? {}) as Record<string, unknown>;
  const fp = (footer?.props ?? {}) as Record<string, unknown>;
  console.log("\n  THE BOTTOM — every value below came from the ACCOUNT's brand profile");
  for (const [label, v] of [
    ["Agent name", ap.name],
    ["Agent title", ap.title],
    ["Agent headshot", ap.photoUrl],
    ["Agent phone", ap.phone],
    ["Business address (CAN-SPAM)", fp.address],
    ["Email", fp.email],
    ["Website", fp.websiteUrl],
    ["Instagram", fp.instagramUrl],
    ["Facebook", fp.facebookUrl],
    ["LinkedIn", fp.linkedinUrl],
    ["X", fp.xUrl],
    ["Unsubscribe", fp.unsubscribeUrl],
  ] as [string, unknown][]) {
    console.log(
      `  ${label.padEnd(29)} ${v ? clip(String(v), 52) : "— OPEN SLOT (fill in Branding)"}`,
    );
  }
}

/** Columns that are infrastructure, not brand — absent from the carry list on purpose. */
const CARRY_SKIP = new Set([
  "id",
  "user_id",
  "created_at",
  "updated_at",
  "source",
  "color_palettes",
  "sender_name",
  "sender_address",
  "sender_domain_verified",
  "preferred_recipe",
  "default_photo_ratio",
]);

/**
 * WHAT THE PROJECT PATH CARRIES, AND WHAT IT STILL DROPS.
 *
 * DERIVED FROM THE LEDGER (`PROJECT_CARRY_KEYS`), never a hand-written key list — that is the
 * whole lesson of this file's header. A second copy of the carry list cannot agree with the
 * first one forever, and the copy is always the one that goes stale.
 */
export function printBrandCarry(profile: Record<string, string | null>): void {
  const copied = new Set<string>(PROJECT_CARRY_KEYS);
  const filled = Object.entries(profile).filter(([, v]) => typeof v === "string" && v.trim()) as [
    string,
    string,
  ][];
  const lost = filled.filter(([k]) => !copied.has(k) && !CARRY_SKIP.has(k)).map(([k]) => k);
  const carried = filled.filter(([k]) => copied.has(k)).length;
  console.log(
    `\n  BRAND FIELDS ACROSS applyUserBrandToProject — ${carried} filled and carried of ` +
      `${PROJECT_CARRY_KEYS.length} keys, ${lost.length} filled and DROPPED`,
  );
  console.log(`  ${lost.length ? lost.join(", ") : "nothing filled is dropped ✓"}`);
}

/**
 * RENDER THROUGH THE ONE DOOR and save. `renderEmailDocHtml` is the same call a send makes,
 * so what lands on disk is exactly what a send would carry — this is never a preview-only
 * approximation.
 */
export async function renderAndSave(
  doc: EmailDoc,
  filename: string,
): Promise<{ html: string; kb: number }> {
  const html = await renderEmailDocHtml(doc);

  // ── NO SCAFFOLDING IN THE RENDERED BYTES — EVER (08/09/2026) ──────────────
  // "THE LISTING'S OWN DESCRIPTION IS ABSENT, so I am describing the home itself."
  // shipped INSIDE the committed new-listing showcase example, because the bake
  // predated the narrator strip in recipes/shared.ts. The strip cleans the narrator;
  // THIS guard is the backstop on the artifact itself: whatever pipe authored the
  // prose, a render carrying instruction-talk never saves and never becomes an
  // example. Checked on visible text (tags stripped), phrases from the leaks
  // measured live — kept tight so real estate copy can't false-trip it.
  const visible = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const leak =
    /\b(fact line|is absent|are absent|not provided|was provided|were provided|honest description|describing the home itself|my instructions|the narrator|settled fact)\b/i.exec(
      visible,
    );
  if (leak) {
    console.error(
      `\n  ✗ SCAFFOLDING LEAKED INTO THE RENDERED EMAIL — refusing to save.\n` +
        `    matched: "${leak[0]}"\n` +
        `    A reader must never see instruction-talk. Fix the authoring pipe; the\n` +
        `    narrator strip lives in lib/deliverable/recipes/shared.ts.\n`,
    );
    process.exit(1);
  }

  const kb = Math.round(Buffer.byteLength(html, "utf8") / 1024);
  console.log(
    `  HTML: ${kb}KB ${kb > 102 ? "⚠ OVER Gmail's ~102KB clip point" : "(inside Gmail's ~102KB clip)"}`,
  );
  const outDir = join(homedir(), "Downloads");
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    /* EEXIST on Windows even for a recursive mkdir of an existing dir */
  }
  const file = join(outDir, filename);
  writeFileSync(file, html, "utf8");
  console.log(`\n  SAVED → ${file}\n`);
  return { html, kb };
}

/** One assertion, read off the RENDERED BYTES — never off the source doc. */
export type Assertion = { name: string; pass: boolean; detail: string };

/**
 * PRINT THE ASSERTIONS AND EXIT NON-ZERO ON ANY FAILURE.
 *
 * An assertion that cannot go red is a comment with extra steps. This is the half that makes
 * the run a TEST rather than a screenshot: the process exits 1 and a human notices.
 */
export function reportAssertions(title: string, checks: Assertion[]): never {
  console.log(`\n  ${title}`);
  let failed = 0;
  for (const c of checks) {
    if (!c.pass) failed++;
    console.log(`  ${c.name.padEnd(34)} ${c.pass ? "PASS ✓" : "FAIL ✗"}   ${c.detail}`);
  }
  if (failed) {
    console.error(`\n  ✗ FAILED — ${failed} of ${checks.length} assertion(s).\n`);
    process.exit(1);
  }
  console.log(`\n  ✓ ${checks.length} of ${checks.length} assertions pass.\n`);
  process.exit(0);
}
