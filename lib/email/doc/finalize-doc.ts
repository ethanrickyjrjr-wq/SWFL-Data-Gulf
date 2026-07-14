// lib/email/doc/finalize-doc.ts — THE LAYOUT ROOT.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// The fences (blessed spans, zone order, the block cap) lived at the TAIL of
// `assembleAuthoredDoc`, which had exactly ONE production caller — the AI author.
// Every other builder hand-positioned its own blocks with a private `push()`/`at()`
// closure, so the layout research bound the one path that was already conformant and
// nothing else. The design doc was law for the model and a suggestion for us.
//
// This is that tail, extracted. It is the ONLY place in the codebase that turns
// content into positions.
//
// ── THE CAPABILITY REMOVAL ──────────────────────────────────────────────────
//
// A builder returns a **Plan** — WHAT the email says, and how wide each thing is.
// It cannot return an `EmailDoc`, because it has no way to make one: `x`/`y` are not
// its to write. `finalizeDoc` is the only function that mints them.
//
// Bypass is not forbidden — it is USELESS. A hand-written block with no `layout`
// sinks to `y = 1_000_000` in `row-grouping.ts` (below the footer, in both the HTML
// and PDF engines), so a builder that skips this seam ships a visibly broken email.
// And `finalizeDoc` stamps every doc it returns with the SEAM marker, so
// `design-system-reachability.test.ts` can tell a doc that went through the fences
// from a flat `w:12` stack that merely LOOKS conformant. That distinction is the whole
// point: conformance is trivial to fake, provenance is not.
//
// ── THE HEIGHT POLICY (there is exactly one) ────────────────────────────────
//
// `row-grouping.ts` groups by BAND OVERLAP — blocks join a row when `y < rowBottom`.
// So the ONE invariant that must hold is: a row's band may never overlap the next
// row's band. Two schemes satisfied it before this file existed, and mixing them
// would have silently merged the header and the ribbon into a two-column row:
//
//   the AI author   y = row index, h = 1 (uniform advisory — email height is content-driven)
//   lifecycle       y accumulates by a real 1–6 height
//
// Both are the same rule. `height` is OPTIONAL on a plan entry and defaults to 1, and
// `y` advances by the row's TALLEST entry. A plan with no heights reproduces the
// author's scheme exactly; a plan carrying real heights reproduces lifecycle's exactly.
// Neither path changes. Do not add a second policy.

import { BLESSED_ROW_SPANS, BLOCK_CONTRACT, ZONE_RANK } from "./block-contract";
import { mintBlockId } from "./schema";
import type { BlockLayout, BlockType, EmailBlock, EmailDoc, EmailGlobalStyle } from "./types";
import { GRID_COLS } from "../grid-schema";

/** One thing an email says, and how wide it is. A builder's whole vocabulary.
 *  Note what is ABSENT: `x` and `y`. Those are the seam's to write, never a caller's. */
export interface PlanEntry {
  type: BlockType;
  /** 1..12. Snapped to the nearest blessed row multiset (Fence 1) — a row always sums to 12. */
  span: number;
  /** Force a row break before this entry. */
  newRow: boolean;
  props: Record<string, unknown>;
  /** Locked on the canvas (the footer, so a drag can't move the unsubscribe). */
  isStatic?: boolean;
  /** Row height. Omitted → 1. `y` advances by the row's tallest entry (see the header). */
  height?: number;
  /** Keep an existing block's id — the sticky header/footer/agent-card carry theirs
   *  through a rebuild. Omitted → minted. */
  id?: string;
}

/** What a builder returns. Content and intent; no positions. */
export interface DocPlan {
  globalStyle: EmailGlobalStyle;
  entries: PlanEntry[];
  subjectVariants?: string[];
  ctaVariants?: string[];
}

/** Stamped on every doc that came out of `finalizeDoc`. A Symbol, so it is dropped by
 *  `JSON.stringify` (it never reaches the database or the schema) but SURVIVES the
 *  `{...doc}` spreads that `applyBrand` / `upsertChartBlock` / the recipes do. That is
 *  what lets the reachability test prove PROVENANCE rather than mere shape. */
const SEAM = Symbol.for("swfl.email.finalizeDoc");

/** Did this doc come out of the layout root, or was it hand-positioned? */
export function wentThroughSeam(doc: EmailDoc): boolean {
  return (doc as unknown as Record<symbol, unknown>)[SEAM] === true;
}

/** Header/footer/divider always own their row — they can never be a column. */
function isStructural(t: BlockType): boolean {
  return t === "header" || t === "footer" || t === "divider";
}

/** Fence 1 — snap a row's spans onto the nearest blessed multiset. Orientation is
 *  preserved: whichever side was bigger stays bigger. Every blessed set sums to 12, so a
 *  snapped row butts edge-to-edge with no separate pad/trim. A row length outside the
 *  registry falls back to clamp-and-pad so the engine stays total. */
export function snapRowSpans(spans: number[]): number[] {
  const clamped = spans.map((s) => Math.max(1, Math.min(GRID_COLS, Math.round(s))));
  const blessed = BLESSED_ROW_SPANS[clamped.length];
  if (!blessed) return padTrimToGrid(clamped);
  const byRank = clamped.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s || a.i - b.i);
  const vals = byRank.map((x) => x.s);
  let best = blessed[0];
  let bestCost = Infinity;
  for (const cand of blessed) {
    const cost = cand.reduce((acc, v, k) => acc + Math.abs(v - vals[k]), 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = cand;
    }
  }
  const out = new Array<number>(clamped.length);
  byRank.forEach((x, rank) => {
    out[x.i] = best[rank];
  });
  return out;
}

/** The >3-column fallback: trim the largest down, then pad round-robin, until the row
 *  sums to exactly 12. */
function padTrimToGrid(spans: number[]): number[] {
  const out = [...spans];
  while (out.reduce((a, b) => a + b, 0) > GRID_COLS) {
    const idx = out.indexOf(Math.max(...out));
    out[idx] = Math.max(1, out[idx] - 1);
    if (out[idx] === 1 && out.every((s) => s === 1)) break;
  }
  let rem = GRID_COLS - out.reduce((a, b) => a + b, 0);
  let i = 0;
  while (rem > 0) {
    out[i % out.length] += 1;
    rem -= 1;
    i += 1;
  }
  return out;
}

/** Fence 2 — stable sort into zone order (open leads, close trails); the footer is forced
 *  absolute-last so a CLOSE sibling (a sources list, a social row) can never sit under it.
 *  Stable, so within-zone order and every `newRow` grouping survives. */
function sortEntriesByZone(entries: PlanEntry[]): PlanEntry[] {
  const rank = (e: PlanEntry) =>
    e.type === "footer" ? ZONE_RANK.close + 1 : ZONE_RANK[BLOCK_CONTRACT[e.type].zone];
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i)
    .map((x) => x.e);
}

const MAX_BLOCKS = 20; // mirrors EmailDocSchema blocks .max(20)

/** Fence 3 — trim to the schema's block cap, ALWAYS preserving the footer (CAN-SPAM). */
function capBlocks(entries: PlanEntry[]): PlanEntry[] {
  if (entries.length <= MAX_BLOCKS) return entries;
  const footer = entries.find((e) => e.type === "footer");
  const rest = entries.filter((e) => e !== footer);
  const kept = rest.slice(0, footer ? MAX_BLOCKS - 1 : MAX_BLOCKS);
  return footer ? [...kept, footer] : kept;
}

/** Group entries into rows: structural blocks and `newRow` force a break; ≤3 per row. */
function groupIntoRows(entries: PlanEntry[]): PlanEntry[][] {
  const rows: PlanEntry[][] = [];
  let cur: PlanEntry[] = [];
  const flush = () => {
    if (cur.length) {
      rows.push(cur);
      cur = [];
    }
  };
  for (const e of entries) {
    if (isStructural(e.type)) {
      flush();
      rows.push([e]);
      continue;
    }
    if (e.newRow) flush();
    cur.push(e);
    if (cur.length >= 3) flush();
  }
  flush();
  return rows;
}

/** The only code in the repo that writes an `x` or a `y`. */
function positionRows(rows: PlanEntry[][]): EmailBlock[] {
  const out: EmailBlock[] = [];
  let y = 0;
  for (const row of rows) {
    const spans = snapRowSpans(row.map((e) => e.span));
    let x = 0;
    let rowHeight = 1;
    row.forEach((e, i) => {
      const w = spans[i];
      const h = e.height ?? 1;
      rowHeight = Math.max(rowHeight, h);
      const layout: BlockLayout = { x, y, w, h, ...(e.isStatic ? { static: true } : {}) };
      out.push({
        id: e.id ?? mintBlockId(),
        type: e.type,
        props: e.props,
        layout,
      } as unknown as EmailBlock);
      x += w;
    });
    y += rowHeight;
  }
  return out;
}

/**
 * THE SEAM. Content in, positioned email out. Every builder ends here.
 *
 * Fences applied, in this order — cap (CAN-SPAM footer survives) → zone sort (open leads,
 * close trails, footer last) → row grouping → blessed spans → positions.
 *
 * PURE. Brand is never derived here: `globalStyle` rides through untouched.
 */
export function finalizeDoc(plan: DocPlan): EmailDoc {
  const entries = sortEntriesByZone(capBlocks(plan.entries));
  const doc: EmailDoc = {
    globalStyle: plan.globalStyle,
    blocks: positionRows(groupIntoRows(entries)),
    ...(plan.subjectVariants?.length ? { subjectVariants: plan.subjectVariants } : {}),
    ...(plan.ctaVariants?.length ? { ctaVariants: plan.ctaVariants } : {}),
  };
  return { ...doc, [SEAM]: true } as EmailDoc;
}
