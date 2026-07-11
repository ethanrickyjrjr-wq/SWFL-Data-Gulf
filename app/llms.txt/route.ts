// app/llms.txt/route.ts — curated LLM-readable index of our public cited-data
// pages. Ranked LAST in the discovery plan (summary quality dominates the lift);
// keep it short and differentiated, not an exhaustive brain dump.

// Constant body → statically generate + CDN-cache (plan: "keep it static").
export const dynamic = "force-static";

const SITE = "https://www.swfldatagulf.com";

const BODY = `# SWFL Data Gulf

> Daily-refreshed, explicitly-sourced Southwest Florida (Lee & Collier County)
> housing-market data. Every figure names its source and its own as-of date.

## Live data
- [SWFL Data Desk](${SITE}/desk): daily market terminal — median asking price,
  active inventory, price-cut share, 30-yr mortgage, and daily listing-flow counts.

## Key reports
- [Master read](${SITE}/r/master): the synthesized Southwest Florida market direction.
- [Housing](${SITE}/r/housing-swfl): Lee & Collier housing metrics.
- [Commercial real estate](${SITE}/r/cre-swfl): corridor-level CRE fundamentals.

## About
SWFL Data Gulf publishes cited SWFL market data. Data is free to read; every
number is attributed to a named source.
`;

export function GET() {
  return new Response(BODY, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
