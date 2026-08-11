# Top 20 real-estate builds we haven't shipped — mined from the STEADY-PAINS sweep

This sweep read a 168-item Reddit/competitor corpus (crawl4ai-verified where a live fact was load-bearing), cross-checked every candidate against the live codebase and the 453-line open-checks ledger, and ranked what we have NOT built by executability-to-impact. Four things were confirmed already shipped and pulled off the table so we don't re-propose them: the `/r/should-i-sell` seller-stress page, the `/r/back-on-market` stigma/relist read, the per-home propensity-to-list "Sellability Score" (deliberately decided against, not merely unbuilt), and the back-on-market page's own research trail (all four named differentiators verified live). What survived is the 20 builds below, in rank order, plus a longer excluded list at the end with the reason each was cut.

A word on how to read the ranking: rank is executability-to-impact, not raw impact. The top items are small wires onto data and surfaces we already own. The bottom items are on-thesis but carry a real blocker (thin data, PII policy call, or a genuinely new product surface). Nothing here requires inventing a number — where a source is missing, the item says so plainly.

---

## 1. Save-Our-Homes "cost of waiting" calculator, wired into /r/should-i-sell

**Why picked.** This is the highest executability-to-impact ratio in the whole sweep because the hard part is already done. Both leaf value brains already compute the exact ZIP-median Save-Our-Homes gap off already-ingested homestead fields: `properties-lee-value.mts` emits `soh_gap_median_pct` (median of (just − taxable)/just across homesteaded parcels, LeePA-sourced), and `properties-collier-value.mts` emits `collier_soh_gap_median_pct` (median of (jv_hmstd − av_hmstd)/jv_hmstd, FDOR CO_NO=21). The raw fields JV_HMSTD/AV_HMSTD are confirmed ingested for both counties (`collier_parcels/constants.py` line 53, `lee_parcels/constants.py` line 36). Yet a grep of `app/r/should-i-sell/` and `lib/should-i-sell/` for soh/homestead/portability returns zero hits — the factor is completely absent from the surface it belongs on. The mechanic is externally validated: crawl4ai of leepa.org/Exemption/Portability.aspx (07/18/2026, page's own last-updated date) confirms the benefit is the assessed-vs-just differential, transferable up to $500,000, with a hard 3-year window to re-establish homestead after abandoning the prior one, full transfer on upsize and pro-rated on downsize. Existing calculators (propertyexemption.com, HauseIt) only frame this as "what you carry to your next home," never as a sell-timing input.

**Why it'll help.** For a Florida homesteaded seller, the SOH shield is real annual money — the leepa worked example is a $150k benefit on a $400k→$300k downsize transferring at 75% = $112,500 carried. The 3-year forfeiture window makes it a genuine timing decision, which is exactly what should-i-sell is for. Today the page models a sell-now-vs-wait spread with no mention of the single biggest tax variable a long-tenure Florida owner holds. Adding it turns a generic timing read into one that speaks to the seller's actual balance sheet. Seller-side, on validated whitespace, near-trivial wiring.

**How hard to execute.** Small. The metric is computed, sourced, and already flows through the upstream brains that feed should-i-sell's ecosystem. New work is a per-parcel calc module (jv_hmstd − av_hmstd = current shielded dollars; apply the leepa upsize/downsize transfer math against a target home value) plus one Section-3 line item. No new ingest, no new source.

**What we need to do.** Register with `node scripts/new-build.mjs`. Build the per-parcel calc as a `lib/should-i-sell/` module and add the line to `app/r/should-i-sell/[zip]/page.tsx` Section 3 ("what waiting could cost you"). Respect the existing `lib/should-i-sell/property-tax.ts` null-guard — state the gap percentage and let the user's real tax bill (or a cited default) complete the dollar math; do not invent a millage rate. Cite LeePA (Lee) and Collier Property Appraiser (Collier) per data-provenance. One open loose end: fetch a working Collier-side portability-mechanics page before shipping Collier copy — collierappraiser.com returned a frames-only stub this pass. Also flag the `should_i_sell_property_tax_source` check owner: the JV_HMSTD/AV_HMSTD per-parcel field may already partly satisfy that check's "live per-parcel feed" gap.

---

## 2. Second-opinion price verdict on the comp helper (dollar-in, verdict-out)

**Why picked.** Three corpus items independently found the same gap: nobody sells a discrete "is this number reasonable" verdict, only informal "get a second agent's opinion" advice. We already own the engine — `lib/assistant/comp-helper.ts` `compsForAddress` is production-wired into chat — but it only answers a bare "give me comps" ask. Reading the gate code sharpens the build: the regexes at lines 107-118 (`COMP_WORD` = comps/comparables/cma, `VALUE_WORD` = worth/valuation/appraise/market value/estimate/sell for/list for) do not match "offer" or phrasings like "agent wants $450k" — a natural second-opinion ask silently falls through to web-fallback today, never triggering the comp engine. Our own `should-i-sell-design.md` (lines 66-67) explicitly defers this: "No second-opinion CMA / lowball check... each its own later brainstorm." That's our team confirming the gap and parking it.

**Why it'll help.** A seller handed a list price by their agent, or a buyer handed an offer price, has no neutral way to sanity-check that specific dollar figure — appraisals ($358) and BPOs ($30-300, lender-ordered) value the property, they don't validate a stated number, and HomeLight-style tools manufacture new competing offers rather than checking the one you hold. This turns the comp engine we already pay for into a direct answer to the most common stress-moment question, in three framings off one mechanic: seller (agent's list price), buyer (offer price), cash-offer (is this fair). It's the concrete deliverable behind the "sanity-check your agent" positioning.

**How hard to execute.** Small. Reuses `compsForAddress` end-to-end. The three new pieces are all bounded: widen `looksLikeCompAsk` (or add a parallel gate) to catch "$X offer/price/list" and agent-quoted phrasing; a deterministic verdict function comparing the user's figure to the median of the returned sold comps (code-computed per THE-GOAL rule 2, labeled in-line/high/low — same discipline as `under-contract.ts`'s claims pattern, never LLM-narrated); and two entry-copy variants (seller/buyer). No new data source.

**What we need to do.** Register the build. Touch `lib/assistant/comp-helper.ts` (gate + verdict function). Cheapest surface is chat-only first; a should-i-sell-style dedicated page can follow. Because this is a chat-assistant behavior change on a live surface, treat the gate widening as ask-first before it ships. Keep the net-proceeds economics comparator separate — that's rank 10, a different mechanic.

---

## 3. Insurability / roof-age as a sell-timing trigger

**Why picked.** Two independent Reddit threads carry visceral, upvoted pain: r/homeowners (386 up) and r/FirstTimeHomeBuyer (265 up), plus local r/Naples_FL confirmation, with a homeowner facing an $11k/yr insurer-of-last-resort quote saying outright "I'm not sure I can sell the house if new homeowners can't insure it." Nobody — not Citizens' own consumer content, not wind-mitigation sites — reframes degrading insurability as a listing-timing signal. We hold the raw ingredient: a roof-age proxy via effective_year_built/actual_year_built (EFF_YR_BLT/ACT_YR_BLT), live in the widened 102-field parcel ingest for Collier now (commit 707e7dff family). A grep for insurab/non-renewal/wind_mitigation/roof-as-sell-signal across refinery/lib/app returns zero — the framing is fully unbuilt. Crucially, the FL OIR insurance ingest is NOT required for an MVP; roof age alone suffices.

**Why it'll help.** Insurability is the fear that actually stops SWFL sales, and it compounds with time — a 20-year shingle roof is a different insurance risk than a 24-year one, and Citizens non-renews shingle roofs past 25 years. Telling a seller "your roof age is moving into the band where buyers struggle to insure — that affects when you list" is a real, sourced nudge that no competitor offers, on a surface (should-i-sell Section 3) that needs zero new architecture.

**How hard to execute.** Medium. Surface exists, one raw ingredient is live for Collier. The framing itself (age bucket → plain-language insurability caveat, never a specific-carrier claim) is deterministic code, no LLM, no invention. A Collier-only MVP is buildable now. Full Lee coverage waits on the open `ingest_parcel_year_built_join` check (FDOR parcel_subdivision year_built → product join) — Lee's leepa pipeline has no direct year_built field today.

**What we need to do.** Register the build; run a RULE 3.5 brainstorm first since this is a new seller-facing claim category (insurability), not a wire-up. Add a roof-age classification off effective_year_built (e.g. shingle >20yr amber, >25yr red, keyed to public underwriting norms, cited, never a claim about this home's actual coverage) and surface it as a new Section-3 caveat in `app/r/should-i-sell/[zip]/page.tsx`. Ship Collier-first; note the Lee dependency on `ingest_parcel_year_built_join`. Let the already-open `ingest_new_source_fl_oir_insurance` land later to deepen it, but do not gate the MVP on it.

---

## 4. Buyer Leverage Report — DOM/CDOM and price-cut history as negotiating ammo

**Why picked.** The data plumbing is fully built and shipped to the wrong audience. `lib/listings/dom.ts` `formatDom()` already renders cumulative-days-across-relists, and `lib/listings/select.ts` pulls dom_days/cdom_days from the `listing_dom` view into comp results — but only into seller/agent surfaces (chat comps, flyers). CDOM is, in our own spec's words, "the anti-manipulation number": our RULE-0.4 research (Brick Underground + ARMLS/CanopyMLS/OneKeyMLS docs, fetched 07/16) established that realtor.com's DOM counter restarts under a new listing ID, so portals structurally under-report true cumulative staleness the way our cdom_days field captures it. Landscape #10 (StreetEasy Listing Insights) confirms the closest competitor frames itself as something the agent "shares with your seller" — nobody claims the buyer-direct lane.

**Why it'll help.** A buyer negotiating has no packaged source telling them a listing has actually sat 140 cumulative days across two relists with two price cuts — the portals show a fresh 12-day counter. Handing the buyer that as explicit leverage ("this is how long it's really been sitting, here's your opening") is a direct negotiating tool in a market where DOM is the single most-cited leverage signal. It reuses a signal we already compute and pay for.

**How hard to execute.** Small. Data is done. New work is a buyer-facing route plus copy, gated to render only on a real relist or cut (never invented framing — mirrors back-on-market's no-invention test). Closer to `price-reduced.ts`-sized than a pipeline. The back-on-market buyer/seller-toggle pattern is directly reusable.

**What we need to do.** Register the build. Reuse `app/r/back-on-market`'s toggle pattern and `lib/listings/dom.ts` formatting. Build a per-address (or per-ZIP rollup) surface stating dom_days, cdom_days, and price-cut history as leverage. No new data. Note the adjacent open check `assistant_property_urgency_tax_history_wiring` (due Aug 12) wires DOM into flyers/property-watch — that's seller collateral, distinct from this buyer tool.

---

## 5. Probate / inherited-property seller advisor (executor/heir-facing)

**Why picked.** Converged independently across four shards. The probate-administration software category (EstateExec, Estate Mentors, Cadence, SwiftProbate — crawl-verified: SwiftProbate lists real estate as one icon among six assets, zero market-timing or valuation content) is mature, but none answers the actual real-estate decision: is now the time and price to sell the inherited house. Zero probate/executor/inherited hits anywhere in the repo or the checks ledger. This is a classic stressed-seller segment (court timelines, distant or multiple heirs, no agent relationship yet), directly on the validated seller-stress thesis.

**Why it'll help.** An executor selling a SWFL house has the exact questions should-i-sell and comp-helper already answer — is the local market favorable, roughly what's it worth, sell before or after probate closes — but no product frames itself for them or speaks to their timeline. A probate-framed entry point routing into the existing seller-stress score plus comp check meets a high-intent, underserved audience with machinery we already run.

**How hard to execute.** Small for the framing MVP (a copy + audience layer reusing should-i-sell timing and comp-helper price machinery, self-identified "I'm selling as executor," no new pipeline). Large for the stretch: auto-detecting probate parcels by matching Clerk-of-Court probate case filings to FDOR parcel owner is a new ingest source plus non-trivial identity resolution — a separate phase, not the MVP.

**What we need to do.** Register the build; brainstorm first. Before writing any deadline or timeline copy, run a crawl4ai pass on Florida Statutes Ch. 733 probate timelines — do NOT invent the deadlines. Carry an explicit not-legal-not-tax-advice caveat (probate interacts with FL estate/tax rules we're not sourced to advise on). MVP is a new route or route-variant plus copy over existing should-i-sell/comp-helper roots. Lee Clerk of Courts probate case search and Bulk Data Services were crawl-confirmed to exist for the detection stretch, but scope that as large and separate.

---

## 6. Relist outcome-tracking — did pausing cost the seller money

**Why picked.** Substrate exists, product does not. `ingest/pipelines/listing_lifecycle/transitions.py` already writes price/price_delta/sold_price/sold_date on every transitions row. But `lib/back-on-market/relist-fact.ts` resolves the clean relist event (date + days off market) while reading no price fields, and `BackOnMarketRead.tsx` has zero outcome references (grep confirmed). Even Redfin's own flagship article on this (crawl-verified 07/18: a record 5.8% April-2026 delist share, 2.5% relist share, 49-metro table) reports rates only — it never says whether the second listing sold for more or less. Nobody has built the outcome layer.

**Why it'll help.** A large and growing population of sellers mistimed a listing and came back — the delist/relist rates are at post-2020 highs. Telling a seller "homes in your ZIP that paused and relisted sold for X% less on the second try" turns an abstract stigma question into a concrete cost, and it's a signal literally nobody publishes. Buildable off columns that already land.

**How hard to execute.** Medium. All price columns already write to transitions; the back-on-market surface just needs to read them. Caveat: `relist-fact.ts`'s own header notes days_off_market is forward-only from the first post-deploy sweep, so N is thin day-one and grows forward — message as "building history," the same accepted limitation back-on-market already ships with.

**What we need to do.** Register the build. Extend `lib/back-on-market/relist-fact.ts` to read the price fields it currently ignores, and add the outcome read to `BackOnMarketRead.tsx`. No new ingest. Compute the sold-vs-relist delta deterministically. Frame the thin-N honestly.

---

## 7. Buyer-facing multi-hazard property risk score via SteadyAPI /environment-risk

**Why picked.** Our already-contracted vendor's `GET /environment-risk?propertyId=` is real, cheap (endpoint weight 1, one call per property), and live — crawl4ai of the vendor's own collection.json (07/18) confirms the response returns flood/wildfire/heat/wind/air, each with score + severity + a plain-English trend, plus overall_risk_level. It was live-tested internally 07/07 (a Naples condo returned overall_risk_level "Severe," flood 9/10 rising). Critically, it delivers the WIND half that our flood-only `env-swfl` can't — absorbing the separate windstorm-bundle candidate whose data was otherwise unsolved. `env-swfl` is confirmed flood-only, area-grain, CRE-framed. This was flagged internally twice (steadyapi-capability-census item 7; the 06/30 sole-spine audit §3) but never made a check — a live silent-deferral gap. The vendor schema has no sinkhole field, so honest disclosure of that gap is itself the differentiator.

**Why it'll help.** Items #142-144 confirm hazard data today lives only at the B2B/underwriting layer (Verisk, HazardHub, CoreLogic Realist) — sold to insurers or piped to agents, never handed to a buyer directly. A buyer asking "is this specific property risky" (the r/AskFlorida "can I filter by flood zone" pain) has no consumer answer. A per-property multi-hazard read with an honest "sinkhole: no consumer-grade source found" line is a differentiated buyer surface off an endpoint we already pay for.

**How hard to execute.** Small on the data side (vendor contracted, endpoint live-tested, trivial against documented quota headroom). Medium overall because the surface is real work: `app/r/[slug]` is a brain-level renderer, so there's no per-property route to attach a per-propertyId read to yet.

**What we need to do.** Register the build; get operator sign-off to formally reopen the 06/30-decreed SKIP (ask-first — this touches a vendor-spend decision and needs a consuming brain). Per the brain-first ingest gate, ship a consuming `PackDefinition` in the same PR as any data pull. Build a new per-property route or a slot in an existing buyer flow. Write the sinkhole/noise gap as an explicit caveat, never a silent omission. Never surface the vendor name (per memory).

---

## 8. Seller-facing listing-lifecycle watch and alert (self-serve address watch)

**Why picked.** The `listing_lifecycle` state machine already detects new/active/price-cut/holding/relist/withdrawn transitions, and the deterministic market-area-alerts engine is already built (`scripts/email/weekly-read-run.mts`, spec 2026-07-10). But should-i-sell and back-on-market are pull-only — no watch, no push, no opt-in table (grep of `components/should-i-sell/` for subscribe/digest/alert returns zero). RedX sells this exact expired/cancelled signal (crawl-verified theredx.com/expired-leads, all agent-framed) to AGENTS only; nobody hands it to the seller who lived it, at the moment they're most receptive to an independent read instead of a re-listing pitch.

**Why it'll help.** It consolidates three near-identical push sub-signals — expired/cancelled win-back, stale-DOM price-cut-timing nudge, seller-stress triggers — into one product, and it converts our pull surfaces into a retention loop. A seller whose listing just went withdrawn gets our neutral read pushed to them instead of ten agent cold calls. Reuses lifecycle detection plus existing digest infra.

**How hard to execute.** Medium. Detection and the alert engine are both built. Missing is an opt-in address table, a transition watcher, and a digest variant. Note the honest constraint found in the ingest: both parcel pipelines deliberately exclude OWN_NAME/OWN_ADDR PII (cadence_registry lines 958, 986), so this MUST stay self-serve opt-in — the seller submits their own address. No skip-trace mailer, ever.

**What we need to do.** Register the build. Reuse the `resolveLocation`/ADDRESS_HINT capture pattern from `app/r/should-i-sell/page.tsx`. New pieces: an opt-in table (address + contact), a `listing_lifecycle` watcher for withdrawn/cancelled/expired, and a digest email variant off `lib/project/digest.ts`. This rides the deterministic market-area-alerts engine, explicitly NOT the killed LLM city-pulse digest (memory: daily-digest-killed). Because it touches a live email/digest send path, treat wiring as ask-first.

---

## 9. Homebot-style personalized subject-property equity/value monthly digest

**Why picked.** Homebot's recurring branded home-value email is a proven high-retention habit (75% open / 52% monthly engagement, already crawl-cited in our own 2026-07-10 market-area-alerts spec). We hold three substrate pieces — the branded email/PDF engine, the market-area-alerts architecture, and Property Watch plumbing (`lib/project/watch-digest.ts`) — but confirmed NONE tracks the subject property's OWN value over time. Property Watch digests nearby comps; market-area-alerts digests ZIP-area movement; comp-helper answers a live ask with no stored history. The subject-value-over-time mechanic is the genuine gap.

**Why it'll help.** The reason Homebot retains is that it's about YOUR house, monthly, forever — "your home is now worth $X, up $Y since last month." That's the single stickiest consumer real-estate habit in the market, and it's a seller-retention surface directly on-thesis. We can build it off existing `projects.watch_*` plumbing rather than a new system.

**How hard to execute.** Medium. Email engine and digest architecture are live. The real work is two pieces: a subject-property value estimate (nearest comps around the subject's own lat/lon) and a monthly snapshot store (a small new table) so "up $Y since last month" is a real stored delta, not a live recompute claiming history it doesn't have.

**What we need to do.** Register the build. Add the snapshot table and the subject-value calc; reuse the branded email/PDF engine for the send. Natural fit as a fourth Property Watch event type or a new recurrence off the same `projects.watch_*` plumbing. If it writes a new snapshot table, mind the ingest/data-lake gates. Value estimate must be sourced comps, never a Zestimate-style invented single number.

---

## 10. Cash-offer-vs-list net-proceeds economics comparator (by ZIP)

**Why picked.** Distinct from the rank-2 price verdict — this is a net-proceeds comparison (commission %, named cash-buyer service fee, carrying cost per DOM), not a fair-value check. No cash-offer/net-proceeds logic exists anywhere (repo grep zero); should-i-sell explicitly defers it. The pain is live in our footprint: crawl4ai of opendoor.com/homes (07/18) confirmed Opendoor actively buying and selling in our exact ZIPs — 33919 Fort Myers ($424,000) and 34113 Naples ($999,000). A seller with a cash offer in hand got zero product response on Reddit (item #22), only informal advice.

**Why it'll help.** A seller weighing a cash offer against listing has no localized way to see what each path actually nets after fees and carrying cost. This answers "here's what a $X cash offer nets you vs. listing traditionally, given typical timelines" — a real decision tool built from held DOM/value data plus a small citable constants table. It meets a live, named pain in our own market.

**How hard to execute.** Medium. Needs a constants table (citable, dated commission % and named per-company cash-buyer service fees like Opendoor's historically ~5%) plus a net-proceeds formula on top of held value/DOM data. Hard guard confirmed by crawl4ai of listwithclever.com: there is NO clean published "cash offers run X% below market" figure — Opendoor's own page flags "may be below market" without quantifying. So this must be a net-proceeds calc, never an invented blended-discount stat.

**What we need to do.** Register the build. Create the constants table (sourced, dated, re-verified periodically, not scraped live). Build the net-proceeds formula combining held DOM/value with those constants. Frame as a per-path net-proceeds comparison, never a market-wide discount claim. Natural home is a should-i-sell module or a standalone `/r/` page.

---

## 11. Parcels-mined "homes like yours that actually sold" page

**Why picked.** A direct build against our own moat data. The LeePA + FDOR ~120-field parcel layer already carries sale price/date, living area, year built, land value — but `properties-lee-value.mts` computes only aggregate z-scores, and comp-helper fetches individual comps from the SteadyAPI vendor, not our own parcels. A Glob of `app/r/**/page.tsx` confirms no route presents parcels-mined sold comps (existing routes: should-i-sell, back-on-market, housing-swfl, zip-report, cre-swfl, communities-swfl).

**Why it'll help.** It reduces vendor dependence and puts underused ingested fields to work — the exact RULE-0.4 parcel-underuse postmortem pattern (7 of 120 fields sat unused for a week). A seller seeing real recorded sales of genuinely comparable homes, drawn from county records we own, is a credibility surface no vendor-fed tool matches. Seller-side.

**How hard to execute.** Medium. Parcel fields are ingested and an aggregate value pack exists; a per-property "homes like yours" comp surface off our own data is unbuilt. Evidence strength here is medium (one shard, #30) rather than strong — the gap is clear but demand is less corroborated than the top items.

**What we need to do.** Register the build; brainstorm. Build a per-property comp selector off `data_lake` parcel fields (living area, year built, sale price/date), and a new route. The corpus flagged an optional pre-scoping competitor look (Houzz/Remodeling Magazine Cost vs. Value) — optional, not required to validate the gap. Comps must be real recorded sales, cited.

---

## 12. Buyer-side affordability/insurance timing advisor (buy-side mirror of should-i-sell)

**Why picked.** The cheapest big-ticket buy-side build. should-i-sell already proves the pattern (spread read → direction call → sourced caveats). **Correction from an advisor-flagged verify pass (07/18):** FRED MORTGAGE30US is NOT idle — `freshness-pulse.mts` already emits it as `mortgage_30yr_fixed` (today's national rate plus a Baseline-Delta [INFERENCE] trend, source_brains `freshness-pulse`+`master`, confirmed live in `refinery/vocab/brain-vocabulary.json`). ZHVI is live. What's actually true, confirmed by a direct grep of `app/` for a buy-side timing route (zero hits): the rate and value trend signals exist as point/today metrics, but nothing ASSEMBLES rate + home-value trend + insurance-cost trend into one buyer decision surface — that assembly, not the raw rate feed, is the gap. The insurance leg lands via the already-open `ingest_new_source_fl_oir_insurance` check.

**Why it'll help.** Buyers only get generic "is now a good time to buy" editorial — no tool ties mortgage-rate trajectory, home-value trend, and insurance-cost trend into a single buyer timing call, even though we already surface two of those three signals separately today. FL insurance premiums can consume >11% of median household income (item #65), making insurance a real affordability lever alongside rate. This is the buy-side mirror of our proven seller product, reusing signals we already compute rather than starting from zero.

**How hard to execute.** Medium. Mortgage-rate (with trend) and home-value substrate are both already live and surfaced elsewhere (freshness-pulse/master, ZHVI); the insurance-trend leg is queued as an open check; the advisory route ASSEMBLING all three into one buyer-facing read is fully unbuilt. The pattern is proven, so the lift is a new consuming pack/route plus assembly logic, not new ingest architecture.

**What we need to do.** Register the build; brainstorm. Build a consuming pack that reads MORTGAGE30US + ZHVI (brain-first ingest gate: consuming brain ships with any data use; vocab coverage if it touches packs). New buyer-facing route mirroring should-i-sell's structure. Let the FL OIR insurance check land for the third leg. Projections tagged [INFERENCE] with a cited base and a falsifier, per data protocol.

---

## 13. Rent-vs-sell comparator for accidental landlords, wired to seller-stress timing

**Why picked.** Three live competitors prove the persona and mechanic — NARPM's calculator, Ben Laube Homes' sell-today-vs-rent-1/3/5-years tool, and RentalYield.io (crawl-verified 07/18, with a dedicated "Accidental Landlord" guide page and a Section 121 guide). But per the corpus's own conclusion on item #95, "none combine the calculator with local seller-stress/market-timing signals — the combination is the gap." We compute ZIP-grain `gross_rent_yield_pct` in `investor-zip-swfl.mts` (ZORI × 12 / ZHVI), and should-i-sell holds the seller-stress score. A grep confirms zero rent/landlord/lease strings on should-i-sell today.

**Why it'll help.** An accidental landlord (inherited, relocating, couldn't sell in time) weighing rent vs. sell gets standard cash-flow math everywhere, but nobody overlays "and by the way, right now is a stressed/soft/hot market to sell into." We'd be the only rent-vs-sell tool with the local timing overlay, built from two live substrate pieces.

**How hard to execute.** Medium. Yield substrate and stress score are both live; a personalized per-property rent-vs-sell tool with the timing overlay is unbuilt and untracked. RentalYield's crawl-confirmed input/output contract (purchase price, rent, tax, HOA, rate, term, down payment → cap rate, cash-on-cash, multi-year cash-flow) grounds the mechanic.

**What we need to do.** Register the build; brainstorm. Auto-fill the rent starting point from `investor-zip-swfl`'s `gross_rent_yield_pct` (user-overridable, four-lane), overlay should-i-sell's stress score and sell-now-vs-wait spread as the "why now" layer. Property tax can come from the LeePA/Collier parcel ingest if address-matched (lane 1, no invention). Cite Section 121 as a disclaimed reference, not tax advice. Deterministic math in code. New tab on should-i-sell/[zip] or a new `app/r/rent-or-sell/[zip]` route. NARPM's specific tool URL 404'd on re-verify — that one sub-claim rests on the corpus's prior crawl.

---

## 14. Post-NAR seller-commission / buyer-agent-compensation negotiation calculator

**Why picked.** A genuine structural gap created by the NAR settlement: sellers must now explicitly decide and negotiate buyer-agent compensation, with zero decision-support tool. Clever/UpNest are pre-negotiated-rate shopping products, not a negotiation-decision tool — the same "no product exists" shape we already filled with comp-helper. Repo and checks grep for commission-negotiation/buyer-agent-compensation returns zero.

**Why it'll help.** Sellers are being asked to make a compensation call they've never had to make, and the tradeoff is speed vs. compensation — offer less buyer-agent comp and the listing may sit longer. Our DOM/timing substrate (comp-helper, back-on-market DOM) already models exactly that tradeoff. A calculator that shows "offering X% buyer-agent comp vs. Y%, here's the likely speed impact" is decision support nobody sells.

**How hard to execute.** Medium. Not tracked anywhere; the tradeoff inputs (DOM, timing) exist but no calculator or framing is built. Evidence strength is medium (one shard, #33) — the structural gap is real and well-reasoned, but direct demand threads are thinner than the top items.

**What we need to do.** Register the build; brainstorm. Build the tradeoff calculator off held DOM/timing data. No new source needed beyond the corpus's already-cited NAR settlement facts. Be careful to frame the speed-vs-compensation relationship from real DOM data, not an invented elasticity.

---

## 15. Consumer-facing investor/BTR purchase-share-by-ZIP tracker

**Why picked.** Consumer-facing whitespace: SFR Analytics and Parcl Labs (both crawl-verified) track institutional purchase concentration but sell exclusively to investors — SFR Analytics' live FL top-20 includes a named SWFL institutional buyer, "CAH-SWFL LAND HOLDINGS LLC" (130 properties, $24.9M, 90 days), and Parcl Labs' "Portfolio Hunter" does full LLC portfolio mapping nationally. Distinct from our existing `investor-zip-swfl` brain (a yield composite that never touches ownership). A non-PII proxy is buildable TODAY: multi_parcel_sale_1/_2 flags (FDOR M_PAR_SAL1/2) are live-ingested for both counties and read by ZERO pack.

**Why it'll help.** A buyer asking "is this neighborhood getting bought up by investors/build-to-rent operators" has no SWFL-specific consumer source. A ZIP-grain bulk/portfolio-sale-share signal off the multi-parcel flag is a directional intensity read we can ship without new ingest or a PII decision — a real answer to a real, politically live question.

**How hard to execute.** Medium for the proxy (a lighter non-PII directional signal off the already-ingested unconsumed flag). Large for the deed-precise entity-name version, which needs OWN_NAME — deliberately PII-excluded in both pipelines (constants.py comments confirm it's policy, not oversight). The homestead-exemption-absence fallback would NOT cleanly isolate institutional buyers from ordinary snowbird second-home owners in our market.

**What we need to do.** Register the build; brainstorm. Ship the proxy first: a new pack reading multi_parcel_sale flags, ZIP-grain, with a new consumer buyer route (brain-first ingest gate; vocab slugs same commit). The full entity-name version is an explicit operator call to revisit the OWN_* PII exclusion — flag it, do not assume it. The re-pull would be cheap (same FDOR ArcGIS response, widened OUT_FIELDS) IF the policy call goes that way. FDOR owner-name is current-owner-of-record (tax snapshot), not deed-grantee-at-sale — any purchase-share metric is a workable proxy, and that caveat must ship in the brain's caveats array.

---

## 16. Buyer bidding-war / multi-offer strategy read (off the dark market-heat brains)

**Why picked.** `market-heat-swfl.mts` already computes a per-ZIP bull/bear vote (active_listing_count_yy, median_days_on_market_yy, pending_ratio; MIN_SIGNALS=2, thresholds ±0.25) — a real, refined leaf brain with ZERO consumer route (grep of app for the brain id returns zero). Content on this topic is universally editorial or agent-authored, never a direct buyer tool. Existing open checks cover the brain's own plumbing (trend charting, region rollups), not a buyer-facing product.

**Why it'll help.** Surfacing an already-built dark brain as "expect competition here — escalate or don't" is high leverage: the analysis exists, it's just invisible. A buyer walking into a ZIP gets a sourced read on how hot it is and whether to bring their best offer, which no consumer tool packages directly.

**How hard to execute.** Medium. The heat signal is computed and refined; it just isn't surfaced anywhere a buyer can see it. Evidence strength medium (one shard, #71). The lift is a consumer route plus strategy copy over an existing leaf brain.

**What we need to do.** Register the build; brainstorm. Build a buyer-facing route that reads `market-heat-swfl`'s existing per-ZIP vote and frames it as competition/escalation guidance. No new data. Speak plainly, no internal pack ids or jargon (data protocol rule 6).

---

## 17. Mid-listing "second read" on an agent's specific tactical advice

**Why picked.** A distinct stress moment from should-i-sell (pre-listing) and comp-helper (price-only): the recurring check-in DURING an active listing when a seller doubts one specific piece of advice. Tier-2 evidence is real — the undisclosed-ChatGPT-advice thread (a seller found her agent's advice was AI output and wrote her own MLS blurb) and the kick-out-clause thread (community consensus the agent was simply wrong). Grep for second-opinion/doubt-agent product code returns zero.

**Why it'll help.** Sellers are structurally locked in mid-listing (switching agents risks paying two brokers), so a parallel, non-agent-controlled read on a specific tactical call has a real lane. It reuses should-i-sell's stress root and comp-helper's data root, meeting a seller at the exact moment they most want a second source of judgment.

**How hard to execute.** Medium. No second-opinion/doubt-agent code exists; reuses two existing roots. Evidence strength medium — the earlier pure-synthesis version was low-confidence, but the specific mid-listing threads give it grounding. v1 MUST scope to price/timing advice only — contract-clause questions (kick-out clauses) are legal, outside four-lane sourcing.

**What we need to do.** Register the build; brainstorm. Build a surface (chat lane or route) that evaluates a specific piece of price/timing advice against data we hold, explicitly scoped away from legal/contract questions and away from asserting an opinion about a real agent's competence. Reuse should-i-sell + comp-helper roots.

---

## 18. Consumer-direct pre-listing inspection-risk read from parcel age/quality

**Why picked.** improvement_quality (IMP_QUAL), construction_class (CONST_CLAS), effective_year_built, and actual_year_built are live-ingested for both counties and read by ZERO pack (grep confirmed). The shipped Showing Prep Packet has no condition/repair layer (`lib/email/showing-prep-copy.ts` is subject + comps + market only). The pre-listing inspection market is scheduling and report-delivery only — nobody does the "what to fix vs. disclose vs. price-adjust" analysis, and it's distinct from Curbio/Revive's repair-financing model.

**Why it'll help.** A seller deciding what to address before listing gets, from four already-ingested unused fields, a coarse actuarial read on where inspection findings are likely — renovation-recency gap (effective vs. actual year built), improvement quality class, construction class. It's a differentiated pre-listing tool built entirely on data we already hold and ignore.

**How hard to execute.** Medium. The actuarial input fields are ingested and unused; the risk-read product is fully unbuilt. Evidence strength medium (one shard, #69). Must be framed as a coarse actuarial proxy (age/quality correlates with likely findings, is not itself a finding) to stay inside no-invention.

**What we need to do.** Register the build; brainstorm. Build a pack reading the four fields (brain-first ingest gate; vocab coverage) and a seller-facing surface. Frame carefully as a proxy, never as an inspection substitute or a claim about this home's actual condition. Distinct from the Showing Prep Packet, so it composes rather than overlaps.

---

## 19. Pre-send QA / review-gate before a client-facing send

**Why picked.** The single highest-priority headline in the whole STEADY-PAINS distillation (Tier-1 item #5): agents want the boring middle automated but draw a hard line at the client-facing send, and pre-send review is structurally absent industry-wide ("in 23 years, never heard of a brokerage reviewing anything but contract documents"). Checks grep zero. Our existing safeguards are all narrow and automated: `voice-guard.ts` is a phrase-level AI-tell strip (and per the `digest_no_quality_gate` check covers only the grid-email path), `gateNarrative`/claims.ts is a factual no-invention lint, suppression/postal-address are compliance floors. The only human-facing pre-send nudge anywhere is an informal "send it to yourself first" tip (`lib/guides/builder-tips.ts` lines 33-38).

**Why it'll help.** This is the pain agents rank highest — automate everything up to the moment of sending to a client, then give me a real review step. A structured pre-send checklist gate (photos current, price matches source-of-truth, no stale data, tone pass) in our own send flow meets the exact line agents won't cross alone, and the corpus even floats it as third-party-sellable QA-as-a-service.

**How hard to execute.** Large. It's a genuinely new product surface — a UI plus a review-state model — not a wiring fix. Ranked mid despite the effort because the MVP composes with existing `gateNarrative`/voice-guard rather than replacing them, and evidence strength is very strong (top Tier-1 headline).

**What we need to do.** Register the build; brainstorm hard (this is a new surface, RULE 3.5 is non-negotiable). MVP is internal-first: a structured checklist gate in our own send flow before the existing send action fires, composing with `gateNarrative`/voice-guard. Because it touches the live send path, ask-first before it ships. The third-party QA-as-a-service framing is a later phase, not the MVP.

---

## 20. Builder-incentive-wave supply-pressure alert for resale sellers

**Why picked.** Seller-side and on-thesis: a "builder incentive wave near you is about to suppress your comps" warning against a well-documented condition — new-home median has undercut existing-home median four straight quarters, 40% of builders cutting prices monthly for three months, 65% using incentives for ten months. Lee+Collier permits plus FDOR year_built are ingested. Repo grep for the alert logic returns zero.

**Why it'll help.** A resale seller in a submarket about to be flooded with discounted new construction (Lehigh Acres, Cape Coral, Ave Maria) has no warning that their comps are about to soften. This is a seller-timing alert against a real, quantified market condition, built on permit and parcel data we already ingest.

**How hard to execute.** Medium on the alert layer — but ranked last because of a real, tracked executability risk. The open check `insiders_construction_yoy_series` states plainly that the permit YoY series itself can't yet be tested (Lee sparse months, Collier 1 issued month). So the series plus threshold layer has a data-sparsity problem to solve BEFORE the alert can fire. Substrate is largely ingested; the YoY series and alert/threshold layer are unscoped.

**What we need to do.** Register the build; brainstorm. First resolve the data-sparsity blocker flagged in `insiders_construction_yoy_series` — the permit series needs enough months to compute a testable YoY before any threshold fires. Then build the YoY series and the alert/threshold layer on top of the ingested permit + year_built substrate. Do not ship an alert that fires off one issued month.

---

## Explicitly excluded — already built or decided against, do not re-propose

- **/r/should-i-sell seller-stress page** — shipped (`app/r/should-i-sell/`, commits 156e0625/aac44079/23b30140). Section 1 seller-stress read, Section 2 market snapshot, Section 3 address-gated sell-now-vs-wait. Covers landscape #1/#3/#4/#29. Open checks are live-verify/follow-ups, not build gaps.
- **/r/back-on-market stigma/relist read** — shipped (`app/r/back-on-market/*`, `lib/back-on-market/`, commits daeaf5f5/aac44079). ZIP cancellation/relist/delist rates plus per-address relist fact, motivation-not-valuation framing. All four named research differentiators verified live; the flagged "flicker-resistant relist detector" is already `relist-fact.ts` (RELIST_MIN_DAYS_OFF_MARKET=7). Open items are a CSS defect and a lab-registration wiring gap. (Note: rank 6 above is the distinct unbuilt OUTCOME layer on top of this, not the page itself.)
- **Per-home propensity-to-list / "Sellability Score"** — deliberately decided against, not merely unbuilt. The seller-facing ZIP-grain half shipped as /r/should-i-sell; `should-i-sell-design.md` Non-goals explicitly declines the per-home agent-dashboard model ("needs data we do not hold"). Absorbs the propensity-scoring competitor cluster (Goliath/iSpeedToLead/LeadFlow/Prospektr, #162-165).
- **HOA/condo SIRS reserve risk score (buyer + seller)** — real strong pain but INFRA-BLOCKED: the DBPR SIRS ingest is intentionally disabled and the swfl-local runner is offline (checks `dbpr_sirs_intentionally_disabled_waf_block`, `swfl_local_runner_offline_dark_sources`). No execution path today. The 70/80/50-70/30-50 reserve-funding threshold methodology is worth banking for when the ingest unblocks.
- **Insurance-carrier non-renewal/premium-spike notification trigger** — BLOCKED, no data source. Needs an insurer feed we don't have or a user-forwarded-notice workflow. should-i-sell itself states "insurance is the one figure we never have." The open FL OIR check supplies only ZIP/county aggregates, not per-property notices.
- **AVM-distrust "show your work" provenance/audit-trail panel** — real gap but already tracked as open check `dataux_audit_trail_panel` and partly covered by the sell-side-favorable-framing spec. Do not double-count as fresh whitespace.
- **Comp adjustment line-item engine** — the #1 factor (condition) has no data source we hold; would need a user-entered condition toggle. Only sqft/bed-bath adjustments are code-computable today. Partial executability; distinct from open check `knn_own_the_comp_distance`.
- **Positioning-only copy items** — "Second Opinion Not a Switch" augment-don't-replace (#17), neutral second-opinion entry point (#24), fee-only-advisor trust page (#29). Kept the concrete FEATURE versions at ranks 2 and 17 instead. The fee-only trust page is the strongest of these and could merit a small copy/UX plan IF a trust-surface push is greenlit (per the 07/17 trust-low-point note) — flagged as the one positioning item worth promoting, but as a copy layer it ranks below all 20 feature builds.
- **Investor deal-screen cash-on-cash (OfferRead.ai mechanic)** — real but buy-side, in direct tension with the seller-side strategic floor; overlaps the investor signals already captured at ranks 15/16; OfferRead is a national competitor for the generic mechanic.
- **Forward per-listing sale-to-list ratio predictor** — ML lift, blocked on a labeled training set per open check `logistic_regression_listing_outcome`. Lower executability than the descriptive candidates that made the cut.
- **FSBO seller pricing report** — repackaging comp-helper into a report; heavily overlaps rank 2 and the existing Showing Prep Packet. A packaging variant, not a new mechanic.
- **VA/FHA/USDA loan-limit neutral panel** — solves only the data/neutrality half; net-new buyer surface, lower pain intensity; USDA layer feasibility unconfirmed (only an interactive ArcGIS map found, no REST endpoint).
- **Lifestyle-fit ZIP-match quiz + per-ZIP agent monetization (CityVibeCheck)** — genuinely new mechanic with a monetization angle, but buyer-side + agent-farming monetization runs against the seller-direct thesis and the "agent-market fight lost" posture.
- **Cross-builder new-construction incentive comparison / buyer deal scorecard** — needs builder-side incentive TERMS (rate buydowns, lot premiums, closing credits) that are private contract data, in no public/parcel/permit source we hold. Large new source, data-gap-blocked.
- **Investor price-cut PATTERN read (count + interval)** — depends on whether per-listing price-cut EVENT history exists at the ingest layer, which is unconfirmed (a cut on an active listing doesn't change lifecycle state, so it may not be captured discretely). Gated on a lake probe not yet run.
- **Mortgage rate lock-in / assumable-loan concentration by ZIP** — large; ZIP-grain data feasibility (HUD FHA Single Family Snapshot) unconfirmed this pass; the cited faro-labs "assumable finder" is not actually shipped on their live site.
- **Remote/snowbird buyer packet** — reuses the showing-prep pipeline and held brains, decent, but buy-side and a crowded slot below the top 20.
- **New-to-Florida relocation-cost snapshot** — the dossier's own flag is "lower urgency, tangential to thesis"; underlying facts already documented piecemeal.
- **Multi-hazard standalone score, noise-exposure layer, new-construction contract review, escrow/closing-cost explainer, touring-agreement disclosure, MLS/Realist embedded distribution** — dropped per the corpus's own findings: commoditized (First Street/FEMA already in Redfin/Zillow), minor/unvalidated, legal-doc analysis with weak platform fit, content-only, or a GTM note rather than a buildable feature.

A note on padding: the shortlist stopped at 20 intentionally. Everything above the excluded line has real evidence, a clear missing piece, and an executable path on existing substrate. Everything below it is weaker evidence, blocked, positioning-only, or a data-source gap we don't hold — each noted with the specific reason rather than dropped silently, so this doesn't get re-mined from scratch next time.
