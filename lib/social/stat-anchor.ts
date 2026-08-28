// lib/social/stat-anchor.ts
//
// THE SOCIAL STAT GATE — the no-invention backstop the social path never had.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// `lib/deliverable/claims.ts:53-54` has named this hole in its own header since the
// 07/13/2026 postmortem, verbatim:
//
//   "Liftable on purpose: the SOCIAL path has NO no-invention gate of any kind today
//    (`stat.value` is a free-text field the model writes), and it is the same hole."
//
// It was not one file's omission. Two more places said the same thing in their own words:
//   lib/email/social-calendar/build-canvas-fill.ts:5-6
//     "The no-invention moat lives in the prompt; nothing is scrubbed here."
//   lib/deliverable/recipes/index.ts:121
//     "…and `stat.value` is a free-text field the model writes."
//
// Three self-documented absences, one shape (RULE 0.5c): a model writes a number into a
// social artifact and nothing stands between it and the feed.
//
// ── WHY *STATS* AND NOT CAPTIONS ────────────────────────────────────────────
//
// The four-lane sourcing rule (RULE 0.7, printed into every social prompt as
// SOCIAL_SOURCING_RULES) deliberately permits lane 3 — a publicly known figure, "noted
// inline (e.g. 'per Realtor.com')". A CAPTION can carry that citation. A STAT TILE cannot:
// it is two or three words rendered at ~12% of the canvas width, baked into a PNG. So a
// number in a stat that no supplied source holds is unattributable BY CONSTRUCTION — that
// is the discriminator, not a general distrust of the model. Captions stay ungated here.
//
// ── THE MECHANISM ───────────────────────────────────────────────────────────
//
// Deliberately NOT a second gate. The anchoring primitive is `numeralsIn` from
// `lib/deliverable/claims.ts` — the same normalisation ("2,847" and "2847" are ONE anchor)
// the email path has used since its own separator bug. The source text becomes
// `SettledClaim[]` exactly the way the reference caller builds it
// (`lib/deliverable/recipes/shared.ts:829`), and membership is set equality on numerals.
//
// NO rounding tolerance and NO magnitude-suffix expansion. A tolerance is a SECOND, more
// permissive anchoring semantics, and the code that decides whether a lie ships is the
// last place to invent one. The prompts were put in LOCKSTEP with the lint instead — the
// discipline claims.ts states for CLAIM_PROHIBITION — so all three social prompts now
// require the figure exactly as the data prints it (they used to ask for "$412K").
//
// FAIL-CLOSED, AND THE BUILD NEVER BLOCKS. On a hit the VALUE is blanked to an open slot
// and everything else ships — the same semantics as the deliverable path, where a failing
// claim drops the paragraph and the build proceeds. A missing figure is honest; a
// confident false one is not.
import { numeralsIn, type SettledClaim } from "@/lib/deliverable/claims";
import type { SocialDesign } from "@/lib/social/design/types";

/**
 * The supplied source facts → the anchor allow-set, ONE claim per line.
 *
 * Mirrors `lib/deliverable/recipes/shared.ts:829` in shape. Callers pass what they
 * actually handed the model: the lake context block, the listings block, the user's
 * uploaded files, a featured listing's own cited figure. Nothing else may anchor a number.
 */
export function sourceClaims(...texts: (string | null | undefined)[]): SettledClaim[] {
  const out: SettledClaim[] = [];
  for (const t of texts) {
    if (!t) continue;
    for (const line of String(t).split(/\r?\n/)) {
      const s = line.trim();
      if (s) out.push({ sentence: s, anchors: numeralsIn(s) });
    }
  }
  return out;
}

/** Every numeral in `value` that no supplied source holds. Empty = anchored. */
export function unanchoredNumerals(
  value: string | null | undefined,
  settled: readonly SettledClaim[],
): string[] {
  const allowed = new Set(settled.flatMap((s) => s.anchors));
  return numeralsIn(String(value ?? "")).filter((n) => !allowed.has(n));
}

/** A stat value ships only when every numeral in it came from a source. A value carrying
 *  NO numerals is never blocked — "Gulf access", or lane 4's "[Need: …]" placeholder. */
export function statValueIsAnchored(
  value: string | null | undefined,
  settled: readonly SettledClaim[],
): boolean {
  return unanchoredNumerals(value, settled).length === 0;
}

export interface DroppedStat {
  /** The element / block id the value was blanked on. */
  id: string;
  /** What the model wrote — kept for the log, never for the artifact. */
  value: string;
  /** The numerals no source held. */
  numerals: string[];
}

/** One drop, logged the way `shared.ts` logs its own: named, never silent. */
export function warnDropped(where: string, dropped: readonly DroppedStat[]): void {
  if (!dropped.length) return;
  console.warn(
    `[social-stat] BLANKED ${dropped.length} stat value(s) to an open slot — ${where}: ` +
      dropped.map((d) => `${d.id}="${d.value}" (unsourced: ${d.numerals.join(", ")})`).join("; "),
  );
}

/**
 * SITE 1 — the canvas AUTHOR (`lib/social/design/author.ts`).
 *
 * Runs on the DESIGN, after `applyDesignPatch`, because the patch route cannot express
 * this: `applyDesignPatch` skips an empty string, so blanking via the patch would leave
 * the template's `value: "$0"` default standing — a worse lie than the one being removed.
 *
 * `touched` is the set of element ids the model's patch actually addressed. An element it
 * never wrote is not this gate's business (that `"$0"` default is a code-authored defect
 * of its own — `lib/social/design/templates.ts:142/289/326` — reported, not fixed here).
 */
export function gateDesignStats(
  design: SocialDesign,
  touched: Iterable<string>,
  settled: readonly SettledClaim[],
): { design: SocialDesign; dropped: DroppedStat[] } {
  const ids = new Set(touched);
  const dropped: DroppedStat[] = [];
  const elements = design.elements.map((el) => {
    if (el.type !== "stat" || !ids.has(el.id)) return el;
    const bad = unanchoredNumerals(el.value, settled);
    if (!bad.length) return el;
    dropped.push({ id: el.id, value: el.value, numerals: bad });
    return { ...el, value: "" }; // OPEN SLOT — the renderer omits an empty stat by design
  });
  return { design: dropped.length ? { ...design, elements } : design, dropped };
}

/**
 * SITE 2 — the canvas FILL (`lib/email/social-calendar/build-canvas-fill.ts`).
 *
 * Runs on the PATCH, server-side of the wire, because the route hands `payload.patch`
 * straight to the client for BOTH the JSON and the NDJSON branches
 * (`app/api/email-lab/social/generate/route.ts`) and the CLIENT applies it. Gating the
 * patch is the one point both branches — and an out-of-date client — pass through.
 *
 * The offending `value` is DELETED rather than blanked: this skeleton is the USER's own
 * hand-built canvas, so refusing the model's write leaves the value the user typed, which
 * is honest by provenance. `label` is untouched — the defect is the figure.
 */
export function gateCanvasFillPatch(
  patch: Record<string, Record<string, unknown>>,
  skeleton: Record<string, Record<string, string>>,
  settled: readonly SettledClaim[],
): { patch: Record<string, Record<string, unknown>>; dropped: DroppedStat[] } {
  const dropped: DroppedStat[] = [];
  const out: Record<string, Record<string, unknown>> = {};
  for (const [id, fields] of Object.entries(patch ?? {})) {
    if (skeleton[id]?.type !== "stat" || typeof fields?.value !== "string") {
      out[id] = fields;
      continue;
    }
    const bad = unanchoredNumerals(fields.value, settled);
    if (!bad.length) {
      out[id] = fields;
      continue;
    }
    dropped.push({ id, value: fields.value, numerals: bad });
    const rest: Record<string, unknown> = { ...fields };
    delete rest.value;
    out[id] = rest;
  }
  return { patch: out, dropped };
}

/**
 * SITE 3 — Generate Week (`lib/email/social-calendar/build-week.ts`).
 *
 * The social calendar composes its cards as `EmailDoc`s, so the model's write lands in an
 * email CONTENT PATCH (block id -> fields) rather than a canvas patch. Two numeric cells
 * are model-writable there: a block's own `value` (hero / signal — the biggest type on the
 * card) and each cell of `stats[]`.
 *
 * BLANKED, not deleted: `seedSocialCard`'s unfilled cells hold literal authoring-instruction
 * placeholder text (`lib/email/doc/default-docs.ts`, and the 07/13 postmortem quoted in
 * `assembleDraft`), so falling back to them is not reader-safe. An empty value is the open
 * slot the block renderers already understand (`lib/email/blocks/StatsBlock.tsx:74`).
 *
 * Typed structurally rather than against `ContentPatch` on purpose — this file stays free
 * of email-doc imports, and the shape is the same either way.
 */
export function gateContentPatchStats(
  patch: Record<string, Record<string, unknown>>,
  settled: readonly SettledClaim[],
): { patch: Record<string, Record<string, unknown>>; dropped: DroppedStat[] } {
  const dropped: DroppedStat[] = [];
  const out: Record<string, Record<string, unknown>> = {};
  for (const [id, fields] of Object.entries(patch ?? {})) {
    const next: Record<string, unknown> = { ...fields };

    if (typeof next.value === "string") {
      const bad = unanchoredNumerals(next.value, settled);
      if (bad.length) {
        dropped.push({ id, value: next.value, numerals: bad });
        next.value = "";
      }
    }

    if (Array.isArray(next.stats)) {
      next.stats = next.stats.map((cell, i) => {
        if (!cell || typeof cell !== "object") return cell;
        const c = cell as Record<string, unknown>;
        if (typeof c.value !== "string") return cell;
        const bad = unanchoredNumerals(c.value, settled);
        if (!bad.length) return cell;
        dropped.push({ id: `${id}.stats[${i}]`, value: c.value, numerals: bad });
        return { ...c, value: "" };
      });
    }

    out[id] = next;
  }
  return { patch: out, dropped };
}
