import { assembleZipReport } from "../zip-report/assemble";
import { asOfFromToken } from "../project/as-of";
import { listZipSurfaceKeys } from "./zip-inputs";
import type { BakeFact, BakeInputs, SourceRef } from "./types";

/**
 * AREA-EMAIL surface adapter — the pre-checked commentary an email recipe reads
 * instead of firing its own model call at build time.
 *
 * Operator, 08/06/2026: *"Has to be a fucking way we can get commentary that is
 * checked before it hits builder and builder can just add a CTA and a little
 * extra commentary."* This is that commentary. The builder stops authoring the
 * area read and becomes a reader of an already-validated row, then adds the CTA
 * and the one subject-specific line — which is the operator's own sentence,
 * implemented. Plan: docs/superpowers/plans/2026-08-06-precomputed-commentary-plan.md
 *
 * ── WHY A SEPARATE SURFACE AND NOT A REUSE OF ('zip', key) ──────────────────
 *
 * Operator decision 08/06/2026 (he chose mint over reuse; the tradeoff is logged
 * in _ASSISTANT/SCRATCHPAD.md). The reuse case was real — one row, zero drift —
 * so this file owes an honest account of what actually differs, or it IS just a
 * second copy of the zip surface and should be collapsed back:
 *
 *   1. LENGTH. A report-page narration targets ~200 words. An email body is
 *      50–125 words (docs/standards/emails.md §0 — the FLOOR bites harder than
 *      the ceiling). Those are different artifacts, not a formatting tweak.
 *   2. FACT COUNT. The page ranks 28–30 signals; an email that leans on 28
 *      numbers is not an email. This takes the top EMAIL_FACT_LIMIT.
 *   3. NO DOSSIER CONTEXT. The page weaves background prose. An email at 125
 *      words has no room for it, and every extra context line is another surface
 *      the writer can drift onto.
 *
 * What is deliberately NOT different: the DATA. This reads `assembleZipReport`,
 * the same ONE assembly root the report page and the zip bake both read (RULE
 * 0.55 — one root per concept). A second data path here would be the drift this
 * repo keeps paying for. The bake can never cite a figure the page doesn't hold.
 *
 * ── THE FORMATTING RULE THIS SURFACE IS BUILT AROUND ────────────────────────
 *
 * Measured 08/06/2026 from the last real bake: 8 of 11 validation failures were
 * the model ROUNDING (93.7% → 93, $399,900 → $400,000) or COMPUTING ($400,000 −
 * $325,000 = $75,000) — not hallucinating. Root cause: the prompt hands raw
 * values and says "never round", and a writer told to produce plain English will
 * round, because that is what readable prose does. The instruction and the
 * material are in conflict.
 *
 * So every fact leaving this adapter must be DISPLAY-READY — already written the
 * way it should appear in the sentence — making "restate verbatim" trivially
 * satisfiable instead of a rule the material fights. `assertDisplayReady` pins
 * that: a bare unformatted ratio never reaches the writer from here.
 */

/** An email leans on a few strong numbers, not a spec sheet. */
export const EMAIL_FACT_LIMIT = 6;

/**
 * A display string is email-ready when a writer can drop it into a sentence
 * unchanged. A bare long decimal ("0.18", "93.7") is the shape that provokes the
 * rounding this surface exists to prevent — it carries no unit telling the writer
 * it is already final, so the writer "helps" by rounding it.
 *
 * Returns the offending displays, or [] when clean. Pure — unit-testable with no
 * DB, which is the point: this is the guard, and a guard that needs live creds
 * never runs.
 */
export function unreadyDisplays(facts: BakeFact[]): string[] {
  return facts
    .filter((f) => {
      const d = f.display.trim();
      if (d === "") return true;
      // Already carries a unit, currency, or scale marker → the writer can copy it.
      if (/[%$/]|[KM]\b|\b(days?|mo|yrs?|years?|sqft|x)\b/i.test(d)) return false;
      // A bare number with 2+ decimal places is a raw value, not a display value.
      return /^\d[\d,]*\.\d{2,}$/.test(d);
    })
    .map((f) => `${f.label}=${f.display}`);
}

/** The bake population — identical to the zip surface's, deliberately.
 *  Core scope only (Lee + Collier); `listZipSurfaceKeys` owns that gate and this
 *  must never grow a second, drifting copy of it. */
export async function listAreaEmailSurfaceKeys(): Promise<string[]> {
  return listZipSurfaceKeys();
}

export async function assembleAreaEmailInputs(zip: string): Promise<BakeInputs | null> {
  const a = await assembleZipReport(zip);
  // Empty-tolerant (RULE 0.7): an area with no ranked signal bakes NOTHING rather
  // than baking an empty read. The recipe then falls back to live generation — a
  // miss and a never-baked key are indistinguishable to the reader on purpose.
  if (!a || a.ranked.length === 0) return null;
  const { ranked, freshnessToken, primaryPlace, res } = a;

  const all: BakeFact[] = ranked.map((s) => ({
    label: s.label,
    display: s.display,
    sub: s.sub ?? null,
    why: s.why ?? null,
    source: s.source?.label ?? "SWFL Data Gulf",
  }));

  // Take the top EMAIL_FACT_LIMIT facts THAT ARE COPY-READY, in rank order —
  // not the top N outright.
  //
  // Measured 08/06/2026 across all 52 live surfaces: 25 of them ranked a bare
  // ratio into the top 6 ("Pending Ratio=0.16", "Average household size=1.63").
  // That is precisely the shape that produced the rounding failures in the last
  // real bake (1.04 → "1.0", 0.18 → "18"). We do NOT rescale or relabel them —
  // whether a "pending ratio" is a proportion that may be shown as a percent is
  // a semantic claim this file has no standing to make, and inventing one would
  // be the exact fabrication the product forbids. We simply pass over them: the
  // ranked pool holds 28–30 signals and an email needs six, so the next
  // well-formed signal costs nothing and every fact the writer sees is one it
  // can drop into a sentence unchanged.
  //
  // A skipped fact is not lost data — the report page still ranks and shows it.
  const ready = all.filter((f) => unreadyDisplays([f]).length === 0);
  const facts = ready.slice(0, EMAIL_FACT_LIMIT);
  // Every ranked signal was unreadable → bake nothing rather than hand the writer
  // material that provokes a round. Falls back to live generation, same as a miss.
  if (facts.length === 0) return null;

  const sources = new Map<string, SourceRef>();
  for (const f of facts) {
    const s = ranked.find((r) => r.label === f.label);
    if (s?.source?.url) sources.set(s.source.url, s.source);
  }

  return {
    surface: "area-email",
    key: zip,
    place: primaryPlace,
    county: res.county_names[0] ?? null,
    asOf: asOfFromToken(freshnessToken) ?? null,
    facts,
    // No dossier context — see the header. An email has no room for background.
    context: [],
    sources: [...sources.values()],
  };
}
