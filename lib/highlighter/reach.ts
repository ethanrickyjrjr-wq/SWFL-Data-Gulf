import { buildReportIdSet } from "@/app/api/mcp/inventory";

const ALLOWED = buildReportIdSet();

/** Topic → brain slug. Order = priority; first hits win when capping. */
const TOPIC_TO_SLUG: Array<{ keywords: RegExp; slug: string }> = [
  {
    keywords: /\b(flood|insurance|aal|nfip|storm|surge|hurricane)\b/i,
    slug: "env-swfl",
  },
  {
    keywords:
      /\b(commercial|office|retail|industrial|cap rate|cre|absorption|vacancy)\b/i,
    slug: "cre-swfl",
  },
  {
    keywords: /\b(permit|construction|build(ing|s)?\b|new homes?)\b/i,
    slug: "permits-swfl",
  },
  {
    keywords: /\b(rent|rental|lease|asking rent|zori)\b/i,
    slug: "rentals-swfl",
  },
  {
    keywords: /\b(job|jobs|wage|wages|employ|labor|workforce)\b/i,
    slug: "labor-demand-swfl",
  },
  {
    keywords: /\b(tourism|tourist|hotel|hospitality|tdt|visitor)\b/i,
    slug: "tourism-tdt",
  },
];

const SYNTHESIS =
  /\b(overall|big picture|whole market|everything|compare everything|outlook for the (whole|entire))\b/i;

const MAX_REACH = 3;

/**
 * Decide which OTHER reports to pull for a question asked on `currentSlug`.
 * Deterministic and allowlist-bounded (runs before the model). Same-vertical
 * cross-area comparison is intentionally NOT here — the current dossier's
 * detail_tables already hold every area (R0).
 */
export function resolveReachTargets(
  question: string,
  currentSlug: string,
): string[] {
  if (!question) return [];
  const out: string[] = [];
  for (const { keywords, slug } of TOPIC_TO_SLUG) {
    if (
      keywords.test(question) &&
      slug !== currentSlug &&
      ALLOWED.has(slug) &&
      !out.includes(slug)
    ) {
      out.push(slug);
    }
  }
  if (
    SYNTHESIS.test(question) &&
    currentSlug !== "master" &&
    ALLOWED.has("master") &&
    !out.includes("master")
  ) {
    out.push("master");
  }
  return out.slice(0, MAX_REACH);
}
