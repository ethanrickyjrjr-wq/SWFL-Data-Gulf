# HANDOFF — Supabase egress overage + production outage (07/21/2026)

**For:** a fresh Opus session authorized to fan out ~20 Sonnet agents.
**Written by:** the session that found the outage and got four causes wrong before getting one right.
**Operator state:** furious, three days deep, has "fixed" this twice with no durable result.
Do NOT hand him another theory. Hand him a burner with a file path and a number.

---

## RULE ZERO — THE SPEAKING GATE (read this before anything else)

The operator asked tonight, verbatim: *"AND MAKE SURE THEY DON'T GIVE ME SHIT ANSWERS LIKE YOURS.
HOW IS THIS NOT A FUCKING RULE 5 TIMES?"* He is right, and here is why no existing rule caught it.

**Every rule in `CLAUDE.md` governs WHERE YOU LOOK.** Probe the code first (0.5). Read our research
(0.4). Start at the data roots (0.55). Not one governs **HOW YOU SPEAK ONCE YOU'VE LOOKED.** That is
the exact gap five wrong answers fell through tonight: I looked in legitimate places, got real tool
output, and then narrated one step past it in the same confident tone as the evidence itself.

**THE GATE — apply to every sentence you say to the operator:**

Every claim is either (A) something a tool printed, or (B) something you concluded. Say which.
- **(A) gets stated plainly** and names the command that produced it.
- **(B) gets the word "I think" or "unverified" in the same sentence, every time, no exceptions.**

**The tell you are about to invent something:** you write *"which means"*, *"so the cause is"*,
*"that indicates"*, *"this points to"*. At that instant you have left the tool output and started
storytelling. Either go get the artifact that proves the next step, or label it (B).

**Second tell:** you got a partial result and filled the gap with the most plausible continuation.
Tonight I ran a search, got back ten filenames, and told the operator what it "would have shown"
about the nightly pipeline. I had never checked whether any of those ten run nightly. **A list of
filenames is not a finding.**

**A SYMPTOM IS NOT A CAUSE.** A vendor error code tells you which layer broke. Never why. I had
PostgREST's own error string — the strongest possible evidence *of a symptom* — and presented it as
the cause. Verbatim vendor output made me MORE confident and MORE wrong at the same time.

**CHECK THE ACCOUNT, NOT JUST THE CODE.** The answer was on the billing page the entire time. Hours
in logs and source; never opened the one screen that had it. When a system is broken, the account /
quota / billing surface is a first-class place to look, not an afterthought.

If you cannot answer *"what command printed that?"* about something you are about to say — do not
say it.

---

## THE OPERATOR'S ARCHITECTURE QUESTION — the best question in this document

*"Why are we not reading brains???? Why are we reading the fucking lake?"*

**He is right, and it is measurable.** Verified 07/21/2026:
- `lib/desk/loaders.ts` — **54 raw `.from()` / supabase references. ZERO brain reads.**
- `app/desk/`, `app/charts/`, `lib/charts/` — **zero `fetchBrain` / `/api/b/` calls.** The only match
  in the whole sweep is a COMMENT at `lib/charts/hurricane-series.ts:4` reading verbatim:
  *"not a brain read: brains/hurricane-tracks-fl.md is stale"*.
- The `brainId` strings in `app/desk/page.tsx` (:87, :97, :189) are **pin-to-email metadata only** —
  they never feed what the page renders.

**THE PROOF THIS MATTERS, from tonight:** while `/desk` rendered blank and `/charts` showed "Data
unavailable" to real visitors, **`/api/b/master?view=speak&tier=1` returned real content the entire
time.** The brains never went down. They are pre-computed, cheap, and were UP. The pages that broke
are the ones re-deriving everything from raw tables on every render — 13 parallel live queries per
desk render.

**HOW IT HAPPENED (the comment tells you):** a brain went stale, someone bypassed it with a direct
query to get correct data, the bypass shipped, and it became the pattern. Each bypass was locally
reasonable. The accumulation is a product whose showpiece pages cannot survive a database hiccup and
which pays full query cost on every render.

**NOT A CLEANUP TASK — this is the structural finding.** The egress overage is a bill; this is the
architecture. Scope it: which desk/charts zones could read a brain instead of a raw table, what makes
a brain stale enough to justify a bypass, and whether "page reads brain, brain reads lake" should be
an enforced boundary rather than a convention. **Do not let this get buried under the egress work.**
Ask the operator before designing — it is his architecture, and he raised it unprompted at the end of
a nine-hour outage.

## THE MISSION (operator's words)

1. Find the actual egress burner. "WE CAN NOT HAVE EGRESS THIS HIGH."
2. "SHUT DOWN ANY 'EXTRAS' WE HAVE TOUCHING THE FUCKING LAKE EVERY GOD DAMN DAY."
3. His decisive constraint, and the best lead in this document:
   **"WE DON'T EVEN HAVE FUCKING DATA COMING IN DAILY. API IS ABOUT THE ONLY DAILY DATA WE HAVE."**
   → If almost nothing arrives daily, **every daily job that re-reads the lake is pure waste.**
   A nightly job re-reading an unchanged 732 MB bucket bills egress for zero new information.
   **Daily reads against non-daily writes is the asymmetry to hunt.** This is his lead, not mine,
   and it is better than anything I produced.

---

## VERIFIED — reproduce before trusting. Each line names what produced it.

- **`/desk` renders 200 with NO data.** Operator ran:
  `curl -s https://www.swfldatagulf.com/desk | findstr /C:"Median asking price"` → **empty.**
  (200 alone proves nothing — the page always returns 200. I handed him a bare status-code check as
  proof of an outage; it was a worthless test. **Grep the content, never the status.**)
- **`/charts` shows a DB error to real visitors.** Operator ran:
  `curl -s https://www.swfldatagulf.com/charts | findstr /C:"Data unavailable"` → four panels render
  **"Data unavailable — Could not query the database for the schema cache. Retrying."**
  One panel DOES render real data: Hurricane Damage by Storm, FEMA NFIP, as of 07/09/2026.
  **Open question, deliberately NOT theorized: why does that one path work and four don't?**
- **PostgREST is down.** `GET /rest/v1/` → **503**. Every table read → **timeout at 20s**, public AND
  data_lake, including `limit 1` on a 92-row table. Verbatim from `scripts/check.mjs`:
  `PGRST002: Could not query the database for the schema cache. Retrying.`
- **Postgres is fine and THE DATA IS INTACT.** Direct SQL via Supabase MCP answered instantly:
  `daily_truth` = 92 rows, latest 07/19/2026; db 2018 MB; PG 17.6. Later in the session direct SQL
  ALSO began timing out — it was degrading, not stable.
- **What won't finish is PostgREST's schema-cache introspection.** Postgres logs show the
  `pg_class`/`pg_attribute`/`pg_namespace` query at **48.6s, 48.5s, 12.3s**. Should be ~50ms.
- **`canceling statement due to statement timeout` every ~20–60s, continuously, all window.**
  Also 3× `password authentication failed for user "user1"` — not one of our roles. Unexplained.
- **Auth degraded — why login fails.** 24h: **17× HTTP 504, 2× 500**, window 07/20 23:05 UTC →
  07/21 05:55 UTC. Verbatim: `error finding user: failed to connect to host=localhost
  user=supabase_auth_admin database=postgres: dial tcp [::1]:5432: i/o timeout`.
  The red `{}` on the login form is supabase-js stringifying an empty error body. Form is not the bug.
- **Every request in the API log is OUR OWN server** (`node`), all 503, same query repeating in
  milliseconds: `market_details_swfl_latest` 7× in 30s, `zhvi_pivoted` 4× in 5s, three identical
  `listing_price_bands` in 60ms. Concurrent renders + retry with no backoff. **Not users. Us.**
- **Egress 778.592 / 250 GB = 311%** (operator screenshot), notice reads "you may experience
  restrictions, as you are currently not billed for overages." Storage Size 1.5 / 100 GB.
- **Vendor fact** (crawl4ai, supabase.com/docs/guides/platform/billing-on-supabase): 250 GB is the
  **Pro** quota; Pro normally BILLS overage at **$0.09/GB**.
- **`db-max-rows = 1000` is set project-wide** (`refinery/lib/paginate.mts:2-5`, verbatim). **No bare
  `.select()` can pull a full table.** Only `selectAllPaged`, raw SQL/`.rpc()`, Storage bypass it.
  "A cron doing full-table pulls via supabase-js" is structurally impossible. Stop looking there.
- **LIVE bucket sizes** (`storage.objects`, 07/21/2026):
  `lake-tier1` 652 objects / **732 MB** · `raw-tabular-cold` 32 / **349 MB** (avg **11 MB each**) ·
  `raw-geometry` 9 / 63 MB · `email-media` 135 / **9,961 kB** · `project-uploads` 7 / 4,298 kB ·
  `social-media` 2 / 962 kB.
  → **email-media is NOT the burner** (would need ~78,000 full-bucket downloads).
- **The lake tooling reads Storage over the network.** `tools/lake-mcp-server.mts`: DuckDB with
  `INSTALL httpfs`, `s3_endpoint`, `s3://${bucket}/${path}`, `read_parquet(...)`. Every query
  downloads. Compressed CSVs can't be range-read — those come down whole.
  **`refinery/sources/duckdb-source.mts` is the same mechanism**; `tools/lake-mcp-server.mts:264`
  says its S3 block "Mirrors composeQuery" — **so the BUILD PIPELINE uses this path too, not just the
  dev tool.** Ten files reference `duckdb-source`: hurricane-tracks-fl pack, bls-ppi, faf5, franchise,
  housing, market-heat-core, market-heat-hotness, stress-cancellations, stress-delistings.
  **I never checked how often those run or how much they pull. START HERE.**

## ⚠️ LATE-SESSION FINDINGS — THESE OVERRIDE THE LAKE THEORY BELOW. READ FIRST.

**OPERATOR-SUPPLIED RATE (the most important number here):** egress was **~400 GB a day or two ago,
now 778.592 GB**. That is roughly **300 GB/day**, against a 2 GB database and a 732 MB bucket.
Any candidate burner must explain ~300 GB/DAY. Most cannot. Use this as the filter.

**🔴 CORRECTION — STORAGE IS *NOT* RULED OUT. IT IS THE PRIME SUSPECT. READ THIS BEFORE THE
PARAGRAPH BELOW IT, WHICH IS WRONG AND IS KEPT ONLY TO SHOW THE TRAP.**
Operator screenshot of the Supabase 24-hour request breakdown, 07/21/2026 (VERIFIED, his dashboard):
- Total **75,439 requests / 92.4% success**
- **API Gateway 42,527** (32 warnings, **4,216 errors**)
- **STORAGE 30,393** (109 warnings, only **199 errors**) ← second-highest surface, and HEALTHY
- **Postgres 1,307** (**967 errors**, bars solid red toward Jul 21 2am) ← throttled to nearly nothing
- **Auth 1,155** (188 errors) · **Realtime 57** (0 errors) · **Edge Functions 0**

**THE KEY INSIGHT:** Postgres is throttled to a trickle while **Storage is serving 30,393 requests a
day with a 99.3% success rate.** Storage does NOT sit behind PostgREST, so it keeps working — and
keeps billing — straight through the outage. **That is how egress climbed 400 → 778 GB WHILE the
site was down.** The surface still working is the surface still billing.

**ARITHMETIC (conclusion, not measurement):** 30,393 requests × `raw-tabular-cold`'s 11 MB average
≈ **334 GB/day**, against an observed ~300 GB/day. Against `lake-tier1`'s 1,150 kB average it'd be
only ~35 GB/day. **The match points at repeated downloads of the 11 MB cold-storage objects.**
**THE ONE REMAINING QUESTION: which bucket do those 30,393 requests hit, and who issues them?**
Answerable from the storage request logs (`get_logs` service `storage`, or the dashboard's storage
log view). **That is the first thing to run. It likely ends the investigation.**

**⚠️ HOW I GOT THIS WRONG — the trap, preserved deliberately:** I ran
`select ... last_accessed_at from storage.objects order by last_accessed_at desc`, saw nothing newer
than 07/20 19:41, and declared storage ruled out. **`last_accessed_at` is NOT updated on download.**
I had real tool output and misread what the field means. **A column that exists is not a column that
is maintained.** Verify what a field actually tracks before concluding from its absence. The 30,393
number came from the operator's dashboard, not from me — I had already moved on.

**↓↓ THE PARAGRAPH BELOW IS THE WRONG CONCLUSION. Kept as the worked example. Do not act on it. ↓↓**

**~~STORAGE IS RULED OUT — the lake theory is DEAD.~~ (FALSE — see correction above.)** Query run 07/21/2026:
`select bucket_id, name, last_accessed_at, updated_at from storage.objects order by last_accessed_at desc`
→ **most recent read is 07/20 19:41**, a 28 kB email chart. **Nothing read from storage today.**
Every `lake-tier1` row shows `last_accessed_at` == `updated_at` — those are the ingest runs WRITING,
not anything reading. The big objects are not being touched.
→ **Disabling the lake MCP in `.mcp.json` accomplished nothing. It was not the burner.** Re-enable it
if it's useful; it is not the problem. (Left disabled only because nobody has confirmed otherwise.)

**THEREFORE IT IS DATABASE EGRESS.** Note `db-max-rows = 1000` caps **PostgREST only** — a direct
Postgres connection (port 5432 / pooler) has NO such cap. Anything speaking the Postgres wire
protocol bypasses it entirely. `refinery/sources/duckdb-source.mts` uses a `pgAttachment` (DuckDB
ATTACHes Postgres directly) — that path is uncapped and would bill as database egress. Unverified as
the burner, but it is now the leading structural candidate and Wave-1 agent #1 should start there.

**MEASUREMENT (verified, `pg_stat_database`, 07/21/2026):**
`tup_returned` = **2,119,493,309** · `tup_fetched` = **44,615,698** · `stats_reset` = null (lifetime).
**A 47:1 scanned-to-used ratio.** That is the fingerprint of the same tables being sequentially
scanned over and over.
**(CONCLUSION, NOT A MEASUREMENT — label it as such downstream):** 604,362 (the `parcel_subdivision_v`
row count) × ~3,500 requests ≈ 2.1 billion. `app/r/source/[table]/page.tsx` scans exactly that view,
uncached, per request, and is publicly sitemapped and crawler-allowed. The shape matches the
measurement. **NOT proven** — `tup_returned` counts scanned rows, not bytes on the wire. But item 15
in Wave 2 is now promoted to a Wave-1 PRIMARY SUSPECT, not a side cleanup.

**`pg_stat_statements` is the query that would settle it** (`calls`, `rows`, `query`), but it timed
out repeatedly under the throttle. Retry it the moment the restriction lifts — it names the exact
statement and its row count. That single query likely ends this whole investigation.

## ALREADY DONE (uncommitted, NOT pushed)

- `.mcp.json` — `lake` key renamed to `lake_DISABLED_EGRESS_BURN_20260721`. Disables the **dev tool
  only**. `tools/lake-mcp-server.mts` untouched; one rename restores it.
  **This does NOT touch the build pipeline's copy of the same S3 reader. That is still live.**
- `_ASSISTANT/SCRATCHPAD.md` — item 19, full incident with evidence.
- `.claude/agents/second-order.md` — NOT from this session; already modified at session start.

## UNVERIFIED — my guesses. DO NOT INHERIT AS FACT.

Four confident causes tonight. Three wrong, one unproven. Each was me connecting verified dots and
presenting the connection in the same tone as the evidence.

1. **"Restart the project."** Wrong. Never looked at billing before recommending it.
2. **"The schema cache is wedged."** A symptom presented as a cause.
3. **"The spend cap is on."** An INFERENCE from "not billed for overages." Never confirmed in the
   dashboard. Plausible. **Verify before repeating.**
4. **"The lake MCP is the burner."** Never proven. The download path is code-confirmed; the VOLUME
   is not. I disabled it as though I had proof. I did not.

Arithmetic, correct but only as good as its inputs: 778.592 − 250 = 528.592 GB over × $0.09 =
**~$47.57** to lift the cap — IF the spend-cap inference (3) holds.

## THE ONE DATUM THAT ENDS THE GUESSING

**The egress BREAKDOWN — Storage vs Database vs Realtime vs Auth — plus the DAILY RATE chart.**
Not reachable from the API this session; needs the dashboard UI.
`https://supabase.com/dashboard/project/jtkdowmrjaxfvwmemxso/` → org billing / usage.
- Storage dominates → the lake path. Chase `lake-tier1` + `raw-tabular-cold` readers.
- Database dominates → something outside this repo holds the service-role key and is reading.

**THE TRAP THAT BURNED TWO DAYS:** egress is a **cumulative period-to-date counter. It CANNOT go
down.** A correct fix shipped yesterday still shows a rising total. "It went up again" is NOT
evidence a fix failed. **Read the daily-rate chart, never the running total.** He has already
re-fixed this twice off the cumulative number. Do not let it happen a third time.

## SUGGESTED FAN-OUT (~20 agents)

Read-only first. Nothing gets fixed before the burner is named with evidence.

**Wave 1 — find the burner (read-only, parallel)**
1. Every caller of `refinery/sources/duckdb-source.mts` — which cron runs it, how often, which bucket
   objects, estimated bytes/run. **Highest-value agent here.**
2. `.github/workflows/` census — every schedule; READS Supabase (egress) vs only WRITES (ingress).
   Note `nightly-chain.yml:126-234` invokes other workflows via `uses:` even though their own crons
   are commented out. They still run daily at 04:23 UTC.
3. **Test the operator's claim:** for each daily job, when did its target table LAST GAIN ROWS?
   Daily job against a weekly/monthly/never-updated source = pure waste = kill-list. **Primary filter.**
4. Who else holds the service-role key outside this repo (ops repo, Vercel previews, external
   clients). Database-dominant egress would come from there.
5. `lake-tier1` — enumerate all 652 objects and who reads each path.
6. `raw-tabular-cold` — 32 objects at 11 MB avg. Cold storage; who is warm-reading it?
7. Vercel: how often do `/desk`, `/charts`, `/embed/desk/pulse` (all `revalidate = 300`) actually
   regenerate, and what does each pull?
8. The retry storm — what retries without backoff, what renders concurrently. Once the throttle
   lifts these return real rows at $0.09/GB.
9. Any public-bucket `getPublicUrl` served at volume.
10. **Adversarial: try to REFUTE "the lake path is the burner."** Reward killing it.

**Wave 2 — fix, only after wave 1 names the burner**
11-14. Kill/throttle the confirmed burner. Every kill states what breaks if it's wrong.
15. `app/r/source/[table]/page.tsx` — `dynamic = "force-dynamic"` (~:14) + `count: "exact"` (~:76)
    over `parcel_subdivision_v` = lee_parcels 383,487 + collier_parcels 220,875 = **604,362 rows
    scanned per request**, uncached, and `app/sitemap.ts:137` publishes it publicly with
    `robots.ts:110` allowing crawlers. **Likely the statement-timeout-every-30s.** Burns CPU/IO, NOT
    egress — fixing it will not lower the bill. Fix it anyway.
16. `fetchNeighborhoodBySlug` (`app/r/communities-swfl/communities.ts:145-156`) — selects then
    `.find()`s in JS, so `db-max-rows` caps it at 1000 of **31,110** rows. **~97% of neighborhood
    pages silently 404.** Push the match into the query.
17. Same files — double-fetch (`generateMetadata` + body), no `cache()` dedupe.
18. `/desk` renders blank with a green pulsing "Live" badge when everything fails; `/charts` handles
    the SAME outage honestly. **The correct pattern already exists in-repo — copy it, don't invent.**
    Also stop leaking the raw PostgREST string to users: "Data unavailable" yes, `PGRST002` prose no.
19. An egress guardrail so this cannot silently recur.
20. Completeness critic: what modality wasn't run, what claim wasn't verified.

## RULES FOR WHOEVER RUNS THIS

- **Rule Zero above is the one that matters.** Label every sentence (A) tool-printed or (B) concluded.
- **Never a full-table read via supabase-js** — `db-max-rows = 1000` makes it impossible.
- **Nothing commits or pushes without the operator.** Approval is per-push, never carried forward.
- **Do not hand him a plan when he asked for a fix.** One sentence of concern, then execute.
- **He has been fixing this for three days.** If your answer is a theory, you have failed.
