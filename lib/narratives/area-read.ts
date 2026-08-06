import { loadNarrative } from "./store";
import { inputsHash } from "./hash";
import { assembleAreaEmailInputs } from "./area-email-inputs";
import { assembleZipBakeInputs } from "./zip-inputs";

/**
 * THE EMAIL ↔ NARRATIVE BRIDGE (RULE 0.7b — commentary obeys the ladder).
 *
 * Operator, 08/06/2026: *"we have more than /r/ sites, too!!! why the fuck did we
 * build all of this? to sit around and no one fucking use???"*
 *
 * The `/r/` report pages have served baked, validated, cached prose since 07/2026.
 * The email recipes read exactly ONE of them (`lib/email/zip-seed.ts`) and
 * otherwise call the model live on every build, rewriting from scratch prose we
 * had already written AND already validated. That is the same ladder violation as
 * buying a photo we already own: paid rung first, free rung ignored.
 *
 * This is lane 1 for prose. A live model call is the FALLBACK, not the default.
 *
 * ── WHY THIS CANNOT JUST RETURN THE BAKED ROW ───────────────────────────────
 *
 * The baked narration was written against the REPORT surface's fact set (28-30
 * ranked signals). An email shows far fewer. Dropping report prose into an email
 * unchanged would put numbers in front of a reader that the email itself never
 * shows — an unsourceable figure, which is the one hard block in this system.
 *
 * So the caller passes ITS OWN anchoring guard (every area recipe already has
 * one — `unanchoredNumbers`) and baked prose only ships if it clears that guard
 * against THIS email's facts. Prose that doesn't clear it is dropped and the
 * caller falls through to its live call, exactly as before. The bridge can make
 * an email cheaper and better; it can never make it less sourced.
 *
 * ── SURFACE ORDER ───────────────────────────────────────────────────────────
 *
 * ── AND A BAKE HAS AN AGE (RULE 0.7b) ──────────────────────────────────────
 *
 * "Baked" is NOT a synonym for "current." A row whose bake predates the data it
 * describes is a STALE FALLBACK, not lane 1, and serving it silently is the same
 * class of error as a stale alarm. So this recomputes the surface's `inputsHash`
 * — the SAME delta gate the bake itself uses — and requires it to match the row's
 * stored `inputs_hash`. Data moved since the bake → fall through to the live call.
 * That fall-through IS the fallback the rule demands.
 *
 * This costs one input assembly (no model call) to avoid serving a confident
 * stale read. A live Sonnet call is the thing it replaces; the trade is worth it.
 *
 * 1. `area-email` — the email-tuned surface (50-125 words, 6 copy-ready facts).
 * 2. `zip`        — the report surface. 53 rows baked and live as of 08/06/2026,
 *                   which is why this bridge does real work TODAY instead of
 *                   waiting on a paid bake of a brand-new surface.
 * 3. null         — caller runs its live model call.
 *
 * When `area-email` bakes, every caller upgrades to it with no code change.
 */

/** Report narration runs ~200 words; an email body is 50-125. The honest trim is
 *  the FIRST PARAGRAPH verbatim — never a re-write, never a truncation mid-sentence
 *  (a cut sentence can invert a claim). Returns "" when there is no usable one. */
export function firstParagraph(text: string): string {
  for (const block of text.split(/\n\s*\n/)) {
    const p = block.trim().replace(/\s+/g, " ");
    // Must end on a real sentence boundary to be safe to lift. The 60-char floor
    // skips a stub lead line ("Fort Myers.") without rejecting a short but whole
    // sentence — a real narration runs 300+ chars, so this only guards the edges.
    if (p.length >= 60 && /[.!?]$/.test(p)) return p;
  }
  return "";
}

export interface BakedAreaRead {
  text: string;
  /** Which surface served it — for logging/《why did this email say that》. */
  surface: "area-email" | "zip";
}

/**
 * Baked area prose for an email, or null to fall back to a live call.
 *
 * @param zip        the area key. Null/malformed → null (never guess an area).
 * @param isAnchored the CALLER's own guard, run against this email's fact set.
 *                   Returns true when every number in the text is sourced here.
 *
 * Empty-tolerant by contract: no creds, no row, bad shape, or a failed guard →
 * null. Never throws into a build, never returns unvalidated prose.
 */
export async function bakedAreaRead(
  zip: string | null | undefined,
  isAnchored: (text: string) => boolean,
): Promise<BakedAreaRead | null> {
  if (!zip || !/^\d{5}$/.test(zip)) return null;
  for (const surface of ["area-email", "zip"] as const) {
    try {
      const row = await loadNarrative(surface, zip);
      // Bail on a missing row HERE, not implicitly. The later `row.inputs_hash` staleness
      // gate read `row` un-narrowed and failed type check ("'row' is possibly null") — and
      // the optional-chaining two lines down is what hid it, because a null row only fell
      // out of the narration check by accident. An explicit guard makes the staleness gate
      // provably reachable only with a real row.
      if (!row) continue;
      const narration = row.sections?.narration;
      if (typeof narration !== "string" || narration.trim() === "") continue;
      const text = firstParagraph(narration);
      if (!text) continue;
      if (!isAnchored(text)) continue; // report figure this email doesn't show

      // A BAKE HAS AN AGE. Same delta gate the bake uses: if the inputs moved,
      // this prose describes a market that no longer exists. Stale → live call.
      const current =
        surface === "area-email"
          ? await assembleAreaEmailInputs(zip)
          : await assembleZipBakeInputs(zip);
      if (!current) continue;
      if (!row.inputs_hash || inputsHash(current) !== row.inputs_hash) continue;

      return { text, surface };
    } catch {
      // a bad row on one surface must never block the next, or the live fallback
      continue;
    }
  }
  return null;
}
