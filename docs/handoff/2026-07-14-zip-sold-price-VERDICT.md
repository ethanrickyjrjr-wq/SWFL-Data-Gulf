# VERDICT — verifying the ZIP sold-price handoff against reality

**Date:** 07/14/2026
**Verifies:** `docs/handoff/2026-07-14-zip-sold-price-third-reference-handoff.md`
**Method:** live lake queries + crawl4ai against Redfin/Zillow/Realtor. Not memory.
**Written as a separate file** because a parallel session holds a claim on the handoff itself.

Operator asked: *"figure out if we are correct here — make sure we are X away from the real answer,
because no one really knows an exact answer."*

**Answer: on the number, we are ~0.1–0.7% away. The number is right. The proposed FIX is what's
wrong.**

---

## 1. The value figure is CORRECT. Three independent sources converge.

| measure | source | value |
|---|---|---|
| Recent sold median, 33904 | LeePA recorded deeds (ours, trailing 90d, n=274) | **$337,450** |
| Median sale price, 33904 | Redfin MLS, 3 mo ending May 2026 (~291/mo) | **$337,000** |
| Home value index, 33904 | Zillow ZHVI, 05/31/2026 — *the figure on the page* | **$339,699** |

Spread across all three: **0.7%.** The $339,699 already in the email is not suspect. Value and
recent-sold both land at ~$340k.

These remain *different measurements* — ZHVI is a modelled whole-stock index, the other two are
mix-dependent transaction medians — so this is mutual reassurance, not one validating the other.
But there is nothing to fix on the number.

Direction corroborates too: Redfin has 33904 down **10.2% YoY**; our ZHVI YoY is **−7.3%**.

---

## 2. DO NOT wire `leepa_sold_median_by_zip` as-is — it ships ~6.6% high

This reverses the handoff's "scoped next step," and it is the highest-value finding here.

The view returns **$362,250** for 33904. Read its own SQL comment
(`docs/sql/20260711_leepa_sold_median_by_zip.sql`):

> *"2024+ latest-qualified-sale per parcel (a stock of most-recent prices, NOT a transaction-flow
> median)."*

It blends 2.5 years of a **falling** market:

- 2024: $380,000 (n=904)
- 2025: $350,000 (n=961)
- 2026: $340,000 (n=523)
- **View's blend: $362,250** vs **true trailing-12-month: $340,000**

Wiring it in would publish *"$362,250 — median sold price, recorded deeds"* right next to a correct
$339,699 value figure — making our **correct** number look wrong by $22k, and understating the
list-vs-sold gap it was meant to reveal.

**The view needs a recency window before it is wired anywhere.** That is the real scoped next step.
The same defect applies to `collier-sold-median-source.mts`, which shares the shape.

---

## 3. The handoff's mechanism was RIGHT — here it is, measured

Credit where due. The handoff's explanation — *"correctly-priced homes sell and leave the active
pool fast, so what's left skews toward sellers still anchored to stale comps"* — is the correct
mechanism, and its instinct that a sold reference is missing is right. It called this "plausible,
not measured." It is now measured, and it **decomposes by property type**:

| type | sold median (recorded deeds, 2026) | active list median | gap |
|---|---|---|---|
| single_family | $434,787 (n=364) | $524,999 (n=389) | **+20.7%** |
| condo | $207,000 (n=159) | $218,925 (n=142) | **+5.8%** |
| blended | $340,000 | $425,000 | +25% |

The headline 25% gap is **concentrated in single-family. Condos are nearly efficient.** Part of the
blended 25% is also a mix artifact: the active pool is 25% condo, the sold pool 30%.

And most of even the SF gap is **not seller delusion — it is length-biased sampling.** Redfin puts
33904's **sale-to-list ratio at 95.3%**, with **44.7% of listings taking price drops**. Homes that
actually sell close ~5% under their (already-cut) list. The remaining gap is that expensive homes
linger and accumulate in any snapshot of standing inventory. That is structural, always present,
and not a market signal.

*Honest caveat:* the SF/condo split on the **sold** side is single-sourced (LeePA). It is
corroborated in structure by our independent listing feed (same ~2.2–2.4× SF:condo ratio) and is
consistent with Redfin's recent 33904 sales — $184k / $285k / $330k / $423k / $435k / $445k / $460k
/ $625k, visibly bimodal with the SF cluster sitting on our $434,787 — but Redfin's by-type medians
sit behind JS toggles and were not retrieved.

---

## 4. Factual error in the handoff: the 67-day DOM is COUNTY, not 33904

The handoff writes *"a soft market (67-day DOM here)"*. 67 is **Lee County** — Redfin,
period_end 05/31/2026, `data_lake.redfin_lee_market` — and `market-context.ts` labels it correctly
as *"Lee County median days on market"*. It was misread as a Cape Coral fact.

**33904's own DOM in our lake is NULL — 0 of 560 active listings carry a DOM value.** Redfin's
actual 33904 figure is ~56–60 days.

---

## 5. New finding — check opened: `leepa_sold_count_undercount_vs_mls`

`leepa_parcels` captures **~1/3 of MLS transactions**. 33904, May 2026: we hold **102** recorded
sales; Redfin reports **291 sold**. A ~2.9× undercount.

The *median* still matches Redfin almost exactly, so the price signal is sound — but a 3× sample gap
with unquantified selection bias is a real caveat on productionizing any sold figure off this table.
Likely causes to check: LeePA `last_sale_*` carries only qualified/arm's-length sales; it is
latest-per-parcel (a stock, not a flow); condo/co-op use codes beyond `04` may be missed.

Distinct from `sales_90d_zip_grain_thin` — that check is about `data_lake.listing_transitions`.
Different table, different bug. Not a duplicate.

**Two mechanical facts that answer the handoff's own "first real question" about recency:** LeePA
sale dates are **month-bucketed** (every `last_sale_date` is day=1), and posts run **~6 weeks late**
— our max is 2026-06-01 while Redfin already shows July 13 sales. Any as-of we publish must say so.

---

## What is actually true about the original question

The operator's question was: why does median list ($425,000) sit 25% above the value figure
($339,699)?

**Because they are measuring two different populations, and both numbers are right.** $339,699 is
what a typical 33904 home is worth, and it is confirmed by what homes actually closed at (~$337k).
$425,000 is the midpoint of what is *currently sitting unsold* — a pool that is structurally
skewed expensive, because cheap homes clear and expensive homes linger. The gap is real, it is
mostly single-family, and roughly a quarter of it is genuine seller-anchoring (sale-to-list 95.3%,
44.7% cutting price); the rest is inventory skew.

Nothing on the page needs to be corrected. The handoff's proposed fix does.

---

## Sources

- Redfin, 33904 housing market — https://www.redfin.com/zipcode/33904/housing-market (crawl4ai, 07/14/2026)
- Zillow ZHVI via `data_lake.zhvi_zip_latest`; Redfin county via `data_lake.redfin_lee_market`
- LeePA recorded deeds via `data_lake.leepa_parcels`; actives via `data_lake.listing_active_homes`
- Realtor.com blocked the crawl (bot wall), returned no data.
- **SteadyAPI deliberately not used:** it is a listings API with no property-type field on output
  and no clean ZIP-grain sold median (see memory `steadyapi-no-property-type-field`). Redfin already
  supplied the independent sold confirmation needed.
