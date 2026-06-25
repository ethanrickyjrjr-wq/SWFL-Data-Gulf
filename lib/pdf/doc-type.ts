// lib/pdf/doc-type.ts — the ONE extraction prompt + sizing knobs for reading
// uploaded PDFs with Claude vision. Centralised so the prompt improves in one
// place for every caller (today: /api/projects/[id]/extract-pdf).
//
// "+ extraction quality" upgrade over the old flat prompt: the model first
// identifies the document type (flyer vs market report vs agreement) and tailors
// what it pulls — a market report wants headline stats + table rows + as-of date;
// a flyer wants address/price/beds/baths/sqft/features. Numbers are quoted
// verbatim; nothing is invented (mirrors the no-invention moat).

/** Max output tokens for extraction. Raised from 4096 so a multi-page market
 *  report's full extraction isn't truncated mid-table (large-PDF handling). */
export const EXTRACTION_MAX_TOKENS = 8192;

/** Page count above which a PDF is "large" — callers may log/treat specially. */
export const LARGE_PDF_PAGES = 12;

/** The doc-type-aware extraction instruction. One Claude call; plain-text out. */
export function buildExtractionPrompt(): string {
  return [
    "You are extracting the full factual content of an uploaded real-estate document so it can be reused to draft marketing emails.",
    "",
    "First, silently identify the document type: property flyer / listing sheet, market or market-trends report, listing agreement / contract, CMA, or other.",
    "Then extract EVERY meaningful fact, tailored to that type:",
    "• Flyer / listing: full address, list price, beds, baths, square footage, lot size, year built, standout features/upgrades, HOA or fees, MLS#, agent & brokerage, and the marketing description.",
    "• Market report: every headline metric (median & average price, inventory, days on market, months of supply, and % changes), the reporting period / as-of date, the geography, and every table row as 'Label: value'.",
    "• Agreement / contract: parties, key dates, term, commission or price, and the material obligations.",
    "",
    "Rules: quote every number, date, and proper noun EXACTLY as printed. Preserve table data as 'Label: value' lines. Do NOT invent, infer, or round anything not in the document. If the document is image-only or blank, say exactly that.",
    "Return clean plain text — short headings and bullet-style lines, no preamble.",
  ].join("\n");
}
