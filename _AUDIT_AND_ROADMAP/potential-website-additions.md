# Potential website additions — standing idea backlog

Not a build queue (that's `build-queue.md` — scoped, in-flight work). This is where a vendor scan,
a competitor read, or a stray idea gets parked until it's picked up. Add to it any time; don't
build from it without picking an item with the operator first.

**Ground rule for every idea below:** Carbon Arc's "ask anything" works because it sits on a
nationwide consumer-transaction panel. Ours only works if the question is a SWFL question — Lee +
Collier (+ Hendry) at whatever grain the data supports. Copying their breadth would make us a worse
Carbon Arc. Copying their PACKAGING, applied to our real four-lane SWFL data, is the actual idea.

Source of the first batch: `_RESEARCH/competitor-and-strategy/2026-09-15-carbonarc-scan.md`
(live-crawled 09/15/2026 — carbonarc.co, carbonarc.co/{research,prisms,how-it-works,explore-data,
pricing}, api.carbonarc.co, docs.carbonarc.ai).

---

## NEAR-TERM — buildable from data we already hold, no new vendor, no new spend

1. **A public "index" page (Prisms-shape).** Carbon Arc's Prisms publish daily reference numbers
   that are relative-only — a growth index (100 = same period last year) or a share-of-group
   (sums to 100%) — and never a raw count. That's precisely the move that lets a free, public,
   SEO-able page exist next to a paid product without giving the paid product away. Candidate SWFL
   series: permit filings vs. same month last year, new-listing volume by ZIP as a share of the
   county total, days-on-market index. **Blocker before this is "near-term" for real:** verify
   which of our sources actually have 13+ months of consistent cadence to support a YoY index —
   that's a `docs/standards/data-inventory.md` question, not a guess, and it hasn't been checked
   yet for this specific use.
2. **A public data-catalog page with a scale strip.** `explore-data` leads with "9M GB / 300+
   proprietary data assets / 8 sectors / daily updates" — a credibility strip computed from data
   they already have. `data-inventory.md` already computes our row counts, byte sizes, and cron
   freshness per source; this is presentation, not new measurement. Pair it with Block's other
   habit — **a data dictionary + a small sample (their cap: 1,000 rows) before anyone commits** —
   which is a stronger trust signal than a locked demo.
3. **MCP as a sold surface, not just a wired one.** We already run `/api/mcp`. Carbon Arc treats
   MCP access as a first-class, tiered, priced product with per-client setup docs (Claude, ChatGPT,
   Codex, Perplexity) and their own token-metering page. This same session's `swfl` MCP connection
   hit exactly the shape they charge for: *"Monthly free limit reached (15 keyless requests/month).
   Connect an account… for unlimited access."* The free-metering wall already exists on our side;
   the paid tier and the setup docs on the other side of it do not. That gap is the idea.
4. **The Research-page taxonomy as a content template.** Their research hub sorts everything into
   Sector Spotlight / Economic Spotlight / Company Spotlight / Monthly Reports / vertical tags. We
   don't need their verticals, but "one hub, filterable by SWFL-relevant category (by-county
   spotlight, monthly market recap, permit/listing deep-dive)" is a cheap content-organization
   pattern, not a data product.

## LONG-TERM — needs new data, new pricing infrastructure, or scale we don't have yet

5. **Tiered, consumption-based pricing modeled on theirs** ($20 solo / $200 team / custom
   enterprise, seats + a token allowance + metered overage). Ours is currently "builds free, SEND
   paywall" (locked, do not relitigate without operator sign-off) — this is a possible NEXT
   pricing shape once there's a paid surface worth metering, not a change to make now.
6. **Two separate metering models for two kinds of query — worth copying the STRUCTURE of, not
   the exact mechanics.** Their Framework/API queries are priced up front and free to re-run
   identically; their MCP/Lenses natural-language queries are priced by output size, unpredictable
   in advance, and never free to repeat. That's their version of our own deterministic-math-vs-
   narrative-prose split (`docs/ontology-and-roadmap.md` §1) applied to billing. If we ever meter
   AI-assisted queries separately from canned/deterministic ones, this is the reference shape.
7. **Excel / PowerPoint plug-ins for MCP access.** Meets analysts where they already work. Only
   worth it once there's a paying MCP tier (item 3) to plug in to.
8. **A structured three-part query composer (Entity × Insight × Event), Builder-style**, as an
   alternative to a chat box — e.g. Place × Metric × Time-anchor (a ZIP or community, a metric
   like price/permits/inventory, an anchor like a rate change or a storm). Bar/table-first, no LLM
   required for the base case — fits our existing chart philosophy. Real build, not urgent.
9. **A local expert-interview library**, Transcripts-shaped but SWFL-scaled: short interviews with
   local builders, appraisers, or insurance adjusters on market conditions. Cheap content, real
   differentiation, but a production/ops lift (recording, compliance framing, hosting) with no
   existing owner — parked, not scheduled.

## Explicitly NOT stealable at our volume (RULE 11) — noted so nobody re-derives it

- **Tribes** (their audience-affinity/NPMI scoring) needs a national card-transaction panel we
  don't have and won't buy.
- **Block** (their enterprise bulk-delivery product — Iceberg/Polaris or S3, compliance intake,
  contract funnel) assumes enterprise data-license buyers we don't have yet. The one thing worth
  keeping from it is already folded into item 2 above (dictionary + sample before commit).
