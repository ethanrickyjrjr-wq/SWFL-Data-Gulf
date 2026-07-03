// lib/email/typo-suggest.ts — PURE, no DB, no imports.
//
// Mailcheck-style "did you mean" for email domains (suggest, never block).
// Own ~60-line helper over the dead `mailcheck` npm dep — the algorithm is
// the value, not the package (spec 2026-07-03-conversion-furniture-design.md).
//
// Two passes, both guarded so a correct or unknown address is NEVER nagged:
//   1. whole-domain Damerau-Levenshtein ≤ 2 against a popular-domain list;
//   2. independent SLD/TLD correction (gmaill.cmo → gmail.com), accepted only
//      when the recombined candidate is itself in the popular-domain list.

const KNOWN_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "comcast.net",
  "att.net",
  "live.com",
  "msn.com",
  "me.com",
  "mail.com", // real provider 1 edit from gmail.com — MUST stay in the exact list
  "proton.me",
  "protonmail.com",
];

const KNOWN_SLDS = KNOWN_DOMAINS.map((d) => d.slice(0, d.lastIndexOf(".")));
const KNOWN_TLDS = ["com", "net", "me"];

/** Damerau-Levenshtein (adjacent transposition counts as 1 edit). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/** Nearest candidate within `max` edits, or null. Ties go to the earlier list entry. */
function nearest(input: string, candidates: string[], max: number): string | null {
  let best: string | null = null;
  let bestDist = max + 1;
  for (const c of candidates) {
    const dist = editDistance(input, c);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return bestDist <= max ? best : null;
}

/**
 * Suggest a fix for a probably-typo'd email domain.
 * Returns null for correct, unknown, or unparseable addresses.
 */
export function suggestEmailFix(email: string): { full: string; domain: string } | null {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  // Exactly one "@", non-empty local + domain, domain has a dot, sane length.
  if (at <= 0 || at !== trimmed.lastIndexOf("@")) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (domain.length === 0 || domain.length > 64 || !domain.includes(".")) return null;
  if (KNOWN_DOMAINS.includes(domain)) return null;

  // Pass 1 — whole-domain distance ≤ 2.
  let fixed = nearest(domain, KNOWN_DOMAINS, 2);

  // Pass 2 — independent SLD/TLD correction; only accepted when the
  // recombination lands exactly on a known domain (never invents "att.com").
  if (!fixed) {
    const dot = domain.lastIndexOf(".");
    const sld = domain.slice(0, dot);
    const tld = domain.slice(dot + 1);
    const sldFix = nearest(sld, KNOWN_SLDS, 2) ?? sld;
    const tldFix = nearest(tld, KNOWN_TLDS, 2) ?? tld;
    const candidate = `${sldFix}.${tldFix}`;
    if (candidate !== domain && KNOWN_DOMAINS.includes(candidate)) fixed = candidate;
  }

  if (!fixed) return null;
  return { full: `${local}@${fixed}`, domain: fixed };
}
