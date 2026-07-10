// lib/email/insiders/lint.ts
//
// The no-invention gate for issue prose — Stage 2c's blocking lint. Reuses the
// ONE numeric tokenizer/normalizer from lib/deliverable/narrative-lint (never a
// fork; author-doc.ts sets the precedent). Four checks:
//   1. Every numeric token in reader-facing prose anchors verbatim to the
//      dossier's anchor set or a chart grounding note. Bare years exempt
//      (calendar references, not data figures — same policy as author-doc).
//   2. No system nouns in reader-facing prose (speaker hygiene).
//   3. The as-of date is stated ONCE, by the renderer — prose restating it blocks.
//   4. Source URLs must come from the dossier (or the site) — the model cannot
//      mint a URL. This is the structural "every source is real" guarantee.
//
// A violation BLOCKS the issue. Nothing here auto-fixes prose (spec: the failure
// is reported to the operator; the fix is editorial, not mechanical).

import { anchorsExactly, extractNumbers, normalizeNumber } from "@/lib/deliverable/narrative-lint";
import type { IssueDoc } from "./schema";

export interface IssueLintViolation {
  section: string;
  token?: string;
  message: string;
}

export interface IssueLintResult {
  ok: boolean;
  violations: IssueLintViolation[];
}

const REF_RE = /\[\d+\]/g; // [n] source references are citations, not figures

/** Same predicate author-doc applies (narrative-lint keeps its copy private):
 *  a bare 4-digit year with no unit is a calendar reference, not a figure. */
function isBareYear(token: string): boolean {
  if (/[$%]|bps|basis points/i.test(token)) return false;
  return /^(?:19|20)\d{2}$/.test(normalizeNumber(token));
}

// Speaker hygiene — mirrors narrative-lint's jargon gate word list, plus "pack".
const JARGON_RE = /\b(master|brain|payload|grain|dossier|pack)(?:s|'s|’s)?\b/i;

function buildAnchorSet(
  dossierAnchors: readonly string[],
  chartGroundingNotes: readonly string[],
): Set<string> {
  const set = new Set<string>();
  const add = (tok: string) => {
    const n = normalizeNumber(tok);
    if (n) set.add(n);
  };
  for (const a of dossierAnchors) add(a);
  for (const note of chartGroundingNotes) for (const tok of extractNumbers(note)) add(tok);
  return set;
}

export function lintIssueProse(
  doc: IssueDoc,
  dossierAnchors: readonly string[],
  chartGroundingNotes: readonly string[],
  allowedSourceUrls: ReadonlySet<string>,
): IssueLintResult {
  const anchors = buildAnchorSet(dossierAnchors, chartGroundingNotes);
  const violations: IssueLintViolation[] = [];

  const fields: Array<[string, string]> = [
    ["subject", doc.subject],
    ...doc.the_read.map((p, i) => [`the_read[${i}]`, p] as [string, string]),
    ...doc.stories.flatMap(
      (s, i) =>
        [
          [`stories[${i}].headline`, s.headline],
          [`stories[${i}].what_happened`, s.what_happened],
          [`stories[${i}].our_data`, s.our_data],
          [`stories[${i}].analog`, s.analog],
        ] as Array<[string, string]>,
    ),
    ...doc.forward_look.flatMap(
      (f, i) =>
        [
          [`forward_look[${i}].claim`, f.claim],
          [`forward_look[${i}].falsifier`, f.falsifier],
        ] as Array<[string, string]>,
    ),
  ];

  for (const [section, text] of fields) {
    const stripped = text.replace(REF_RE, " ");
    for (const tok of extractNumbers(stripped)) {
      if (isBareYear(tok)) continue;
      if (!anchorsExactly(tok, anchors))
        violations.push({
          section,
          token: tok,
          message: `figure "${tok}" does not anchor to the dossier feed or a chart`,
        });
    }
    const j = text.match(JARGON_RE);
    if (j)
      violations.push({
        section,
        token: j[0],
        message: `system noun "${j[0]}" in reader-facing prose`,
      });
    if (text.includes(doc.as_of) || /\bas of \d{2}\/\d{2}\/\d{4}/i.test(text))
      violations.push({
        section,
        message: "as-of date restated in prose — the issue states it exactly once",
      });
  }

  for (const s of doc.sources) {
    if (!allowedSourceUrls.has(s.url))
      violations.push({
        section: `sources[n=${s.n}]`,
        token: s.url,
        message: "source url is not in the dossier — a citable source must be real and held",
      });
  }

  return { ok: violations.length === 0, violations };
}
