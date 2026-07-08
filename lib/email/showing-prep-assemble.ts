// lib/email/showing-prep-assemble.ts
//
// The ONE entry both Showing Prep triggers call (the project pill route + the
// assistant branch). Builds the coded grid (buildShowingPrepDoc), authors ONE
// commentary paragraph from ONLY the real numbers already on the packet, drops it
// into the marked block, and gates THAT PARAGRAPH with lintAuthoredProse — the
// block-level no-invention lint (Deviation #1: the structural guarantee, not an
// AI-virtue one; a sentence with any number NOT on the packet is stripped).
//
// FIX vs the plan draft: the lint is applied to the COMMENTARY BLOCK ONLY, not the
// whole doc. `lintAuthoredProse` walks PROSE_FIELDS (body/text/caption/…) over every
// block, and `extractNumbers` tokenizes dates ("07/01/2026" → 07,01,2026). A whole-
// doc lint would therefore strip the DETERMINISTIC data fields the packet builds from
// real, cited facts — the comp-grid rows ("sold $475,000 · 06/01/2026") and the market
// snapshot source line ("…as of 07/01/2026…") — because their dates aren't in the
// anchor set and "sold …" trips RECORDED_CLAIM_RE with no recorded anchors. Those are
// not AI-authored; only the commentary is. So we lint only it. Never throws; an
// offline / no-key build simply ships with the commentary blank.

import { buildShowingPrepDoc, SHOWING_PREP_COMMENTARY_MARKER } from "./showing-prep-doc";
import { lintAuthoredProse } from "./author-doc";
import { getAnthropic, agentsAreMocked } from "@/refinery/agents/anthropic.mts";
import { resolveEmailModel } from "./model-router";
import type { EmailDoc, EmailBlock } from "./doc/types";
import type { ShowingPrepData } from "@/lib/listings/showing-prep-source";

/** True when `b` is the commentary text block (found by its caption marker, not by
 *  position — the builder tags it, so ordering can change freely). A type guard so
 *  callers get the narrowed `text` variant (its props carry `body`). */
function isCommentaryBlock(b: EmailBlock): b is Extract<EmailBlock, { type: "text" }> {
  return (
    b.type === "text" &&
    (b.props as { caption?: string }).caption === SHOWING_PREP_COMMENTARY_MARKER
  );
}

/** Every real number/string on the packet — the anchor set the commentary must not
 *  exceed. Nothing here is invented; each value came from a resolved lane. */
function packetAnchors(data: ShowingPrepData): string[] {
  const out: string[] = [];
  const s = data.subject;
  if (s) {
    if (s.price) out.push(s.price);
    if (s.beds) out.push(s.beds);
    if (s.baths) out.push(s.baths);
    if (s.sqft) out.push(s.sqft);
    if (s.address) out.push(s.address);
  }
  for (const c of data.comps) {
    if (c.price != null) out.push(String(c.price));
    if (c.beds != null) out.push(String(c.beds));
    if (c.baths != null) out.push(String(c.baths));
    if (c.sqft != null) out.push(String(c.sqft));
  }
  const snap = data.snapshot;
  if (snap) {
    out.push(String(snap.monthsOfSupply));
    if (snap.activeInventory != null) out.push(String(snap.activeInventory));
    if (snap.homesSold != null) out.push(String(snap.homesSold));
    if (snap.medianSalePrice != null) out.push(String(snap.medianSalePrice));
    if (snap.medianDom != null) out.push(String(snap.medianDom));
    if (snap.marketType) out.push(snap.marketType);
    out.push(snap.zip);
  }
  return out;
}

/** The RECORDED anchor set — the only figures a "sold for $X" sentence may quote
 *  (recorded sale prices + the snapshot's median sale price). Keeps a legitimate
 *  sold-comp reference from being stripped, while a list price dressed as a sale is. */
function recordedAnchors(data: ShowingPrepData): string[] {
  const out: string[] = [];
  for (const c of data.comps) {
    if (c.priceKind === "sold" && c.price != null) out.push(String(c.price));
  }
  if (data.snapshot?.medianSalePrice != null) out.push(String(data.snapshot.medianSalePrice));
  return out;
}

/** Default commentary author — one Haiku call, facts-only system prompt. Returns
 *  null on no key / mock / any failure (the lint is the hard guard regardless). */
async function defaultAuthorCommentary(data: ShowingPrepData): Promise<string | null> {
  if (agentsAreMocked()) return null;
  const anchors = packetAnchors(data);
  if (anchors.length === 0) return null;
  try {
    const client = getAnthropic("email_build");
    const res = await client.messages.create({
      model: resolveEmailModel("haiku"),
      max_tokens: 300,
      system:
        "You write ONE short paragraph of connective prose for a real-estate agent's " +
        "internal showing-prep document. Use ONLY the facts provided. Do NOT state any " +
        "number, price, or statistic that is not in the facts. No hype, no invented " +
        "claims, no source names, plain text.",
      messages: [
        {
          role: "user",
          content: `Facts you may use (quote numbers verbatim):\n${anchors.join("\n")}\n\nWrite one paragraph tying the subject to the comps and the local market.`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text.trim() : null;
  } catch {
    return null;
  }
}

/** Drop `paragraph` into the marked commentary text block. */
function fillCommentary(doc: EmailDoc, paragraph: string): EmailDoc {
  const blocks = doc.blocks.map((b): EmailBlock => {
    if (isCommentaryBlock(b)) {
      return { ...b, props: { ...b.props, body: paragraph.slice(0, 2000) } };
    }
    return b;
  });
  return { ...doc, blocks };
}

/** Lint the COMMENTARY BLOCK ONLY — never the deterministic data blocks. We isolate
 *  the commentary into a one-block doc, run the block-level no-invention lint on it,
 *  and merge the stripped body back. Reuses lintAuthoredProse without touching the
 *  comp rows / source line the whole-doc form would wrongly gut. */
function lintCommentaryOnly(
  doc: EmailDoc,
  anchors: ReadonlyArray<string>,
  recorded: ReadonlyArray<string>,
): EmailDoc {
  const idx = doc.blocks.findIndex(isCommentaryBlock);
  if (idx === -1) return doc;
  const only: EmailDoc = { ...doc, blocks: [doc.blocks[idx]] };
  const cleanedBlock = lintAuthoredProse(only, anchors, recorded).stripped.blocks[0];
  const blocks = doc.blocks.map((b, i) => (i === idx ? cleanedBlock : b));
  return { ...doc, blocks };
}

export interface AssembleDeps {
  /** Injectable author — tests pass a stub; default is the Haiku call. */
  authorCommentary?: (data: ShowingPrepData) => Promise<string | null>;
}

export async function assembleShowingPrepDoc(
  data: ShowingPrepData,
  current: EmailDoc,
  deps: AssembleDeps = {},
): Promise<EmailDoc> {
  let doc = buildShowingPrepDoc(data, current);

  const author = deps.authorCommentary ?? defaultAuthorCommentary;
  const paragraph = await author(data).catch(() => null);
  if (paragraph) {
    doc = fillCommentary(doc, paragraph);
    // Structural no-invention gate — commentary block ONLY (see file header).
    doc = lintCommentaryOnly(doc, packetAnchors(data), recordedAnchors(data));
  }
  return doc;
}
