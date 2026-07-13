// lib/brand/bio-tokens.ts
//
// THE BIO THAT UPDATES ITSELF.
//
// Spec: docs/superpowers/specs/2026-07-13-agent-profile-design.md
//
// ── WHY TOKENS AND NOT TEXT ─────────────────────────────────────────────────
//
// A bio is made of exactly two lanes:
//
//   LANE 2 — the agent's own words. "I bought my own first place on a canal here."
//            NEVER goes stale. Saved verbatim.
//   LANE 1 — our market data. "Cape Coral's typical home is $339,699."
//            GOES STALE IN MONTHS.
//
// **A market figure frozen into saved text is a lie with a delay.** $339,699 is true
// today and false by winter, and the agent will never go back and edit it — so the
// number rots inside the signature block on every email they send, under their name.
//
// So the figure is never SAVED. What is saved is a TOKEN. It resolves at BUILD time,
// carrying its own source and as-of date, on every single send:
//
//   SAVED : "The typical home here runs {{farm.home_value}}, {{farm.yoy}} over the year."
//   SENT  : "The typical home here runs $339,699, down 7.3% over the year."
//           + "Zillow Home Value Index, as of 05/31/2026" in the source list
//   IN SIX MONTHS: the same sentence, a different true number. No edit by the agent.
//
// That is the flywheel — a self-updating deliverable factory — applied to the one piece
// of copy that rides in every email.
//
// ── THE RULES (each one already paid for) ───────────────────────────────────
//
//   1. RESOLVE LATE. At build, never at save. Saving a resolved number recreates the
//      staleness bug in a place nobody will ever look again.
//   2. THE CITATION TRAVELS WITH THE FIGURE. A number without its source is exactly the
//      thing this product exists not to ship.
//   3. UNRESOLVED → DROP THE CLAUSE, at a sentence boundary. Never a stray "{{...}}",
//      never a half-sentence, never a stale figure, never a zero. Same rule as an
//      unsourced cell (playbook Part 4).
//   4. THE TOKEN SET IS CLOSED. The AI may only emit what is in TOKENS below. An
//      invented token resolves to nothing and its clause is dropped — it can never
//      become a fabricated number.

import { loadMarketFigures, type MarketFigure } from "@/lib/email/market-context";
import type { EmailDoc } from "@/lib/email/doc/types";

/** The CLOSED set of tokens a bio may carry. Each maps to a figure key the lake
 *  actually produces (lib/email/market-context.ts). Adding a token here is the ONLY
 *  way to add one — an unknown token is dropped, never guessed at. */
export const TOKENS: Record<string, { figureKey: string; what: string }> = {
  "farm.home_value": { figureKey: "home_value", what: "the area's typical home value" },
  "farm.yoy": { figureKey: "home_value_yoy", what: "how home values moved over the year" },
  "farm.dom": { figureKey: "dom", what: "how long homes take to sell" },
  "farm.active": { figureKey: "active", what: "how many homes are for sale" },
};

export type BioToken = keyof typeof TOKENS;

const TOKEN_RE = /\{\{\s*([a-z_.]+)\s*\}\}/gi;

export interface ResolvedBio {
  /** The bio as the RECIPIENT reads it — every token replaced with a real figure, and
   *  every clause we could not source removed. */
  text: string;
  /** The figures that actually landed, so their citations ride into the source list. */
  citations: MarketFigure[];
  /** Tokens we could not resolve. Their clauses were DROPPED — reported, not hidden,
   *  so the Brand panel can tell the agent which of their sentences went quiet. */
  dropped: string[];
}

/** Every token a template carries, in order. Pure — used by the editor to preview. */
export function tokensIn(template: string): string[] {
  return [...(template ?? "").matchAll(TOKEN_RE)].map((m) => m[1].toLowerCase());
}

/** True iff every token in the template is one we can actually resolve. The AI drafter
 *  is held to this: a bio quoting an invented token is rejected before it is ever shown. */
export function tokensAreKnown(template: string): boolean {
  return tokensIn(template).every((t) => t in TOKENS);
}

/**
 * Split into sentences, keeping their terminators. A clause we cannot source is dropped
 * WHOLE — dropping only the token would leave "The typical home here runs , over the
 * year.", which is worse than saying nothing.
 */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
}

/**
 * THE RESOLVER. Template + area → the bio a recipient actually reads.
 *
 * Never throws, never refuses, never invents. An area we cannot resolve figures for
 * yields the agent's own words with every data-bearing sentence removed — which is
 * still a true bio, just a shorter one.
 */
export async function resolveBio(
  template: string,
  scope: { kind?: string; value?: string } | undefined,
): Promise<ResolvedBio> {
  const raw = (template ?? "").trim();
  if (!raw) return { text: "", citations: [], dropped: [] };
  if (tokensIn(raw).length === 0) return { text: raw, citations: [], dropped: [] };

  // The SAME figure feed the email body already uses. No second data path, so a bio can
  // never disagree with the email it rides in.
  const figures = await loadMarketFigures(scope).catch((): MarketFigure[] => []);
  const byKey = new Map(figures.map((f) => [f.key, f]));

  const citations: MarketFigure[] = [];
  const dropped: string[] = [];

  const kept = sentences(raw).filter((sentence) => {
    const inSentence = tokensIn(sentence);
    if (inSentence.length === 0) return true; // the agent's own words — always keep

    // A sentence survives only if EVERY token in it resolves. One missing figure makes
    // the whole claim unsupportable, and half a sourced sentence is not a sourced one.
    const resolvable = inSentence.every((t) => {
      const spec = TOKENS[t];
      return spec ? byKey.has(spec.figureKey) : false;
    });
    if (!resolvable) {
      dropped.push(...inSentence.filter((t) => !TOKENS[t] || !byKey.has(TOKENS[t].figureKey)));
      return false;
    }
    for (const t of inSentence) {
      const fig = byKey.get(TOKENS[t].figureKey)!;
      if (!citations.some((c) => c.key === fig.key)) citations.push(fig);
    }
    return true;
  });

  const text = kept
    .join(" ")
    .replace(TOKEN_RE, (_m, name: string) => {
      const spec = TOKENS[String(name).toLowerCase()];
      // Unreachable for a kept sentence (we just proved every token resolves), but a
      // resolver that could ever emit a raw "{{...}}" to a recipient is not a resolver.
      return spec ? (byKey.get(spec.figureKey)?.value ?? "") : "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();

  return { text, citations, dropped: [...new Set(dropped)] };
}

/**
 * THE ONE INTEGRATION POINT — resolve the bio on the built document, at BUILD time.
 *
 * `applyBrand` puts the SAVED bio (the template, tokens and all) onto the agent card.
 * This replaces it with the RESOLVED bio, on the server, on every build. That is what
 * "resolve late" means in practice: the agent's signature block carries a figure that
 * is true the day it is sent, not the day it was written.
 *
 * Returns the citations so the caller can put them in the deliverable's source list —
 * a number without its source is exactly what this product exists not to ship.
 *
 * Never throws. A doc with no agent card, or a bio with no tokens, comes back untouched.
 */
export async function resolveDocBio(
  doc: EmailDoc,
  scope: { kind?: string; value?: string } | undefined,
): Promise<{ doc: EmailDoc; citations: MarketFigure[] }> {
  const needsWork = doc.blocks.some(
    (b) => b.type === "agent-card" && tokensIn(String(b.props.bio ?? "")).length > 0,
  );
  if (!needsWork) return { doc, citations: [] };

  const citations: MarketFigure[] = [];
  const blocks = await Promise.all(
    doc.blocks.map(async (b) => {
      if (b.type !== "agent-card") return b;
      const template = String(b.props.bio ?? "");
      if (tokensIn(template).length === 0) return b;
      const out = await resolveBio(template, scope);
      for (const c of out.citations) {
        if (!citations.some((x) => x.key === c.key)) citations.push(c);
      }
      // An unresolvable bio collapses to the agent's own words. If that leaves nothing at
      // all, the bio is EMPTY — and an empty bio is omitted from the sent email entirely
      // (AgentCardBlock), which is the open-slot contract. Never a stray token.
      return { ...b, props: { ...b.props, bio: out.text } };
    }),
  );

  return { doc: { ...doc, blocks }, citations };
}
