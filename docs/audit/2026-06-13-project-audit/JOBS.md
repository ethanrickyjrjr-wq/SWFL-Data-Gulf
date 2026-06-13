# Audit Jobs — broken out by Sonnet vs Claude/Opus

**Legend.** **Sonnet** = mechanical, well-specified, low-ambiguity, single-file-ish edits with a clear success condition (copy an existing pattern, add an ignore line, rename a constant, add a test). **Claude/Opus** = architectural, ambiguous, cross-cutting, invariant-touching, or requiring a judgment/design call (where a number lives, what "verified" means, how strict to gate, vendor-spec decisions, multi-tenant isolation).

A job may bundle a few tightly-related findings. Source lane in parentheses. The **Email funnel** block is at the end because a parallel session is mid-build there.

---

## P0 / P1 — do first

### Sonnet jobs

- [ ] **Fix BRAIN_CATALOG drift (CI is RED on main)** — `refinery/packs/catalog.mts` — add `BrainCatalogEntry` rows for `home-values-swfl` + `investor-zip-swfl` copying domain/scope/ttl verbatim; verify `bun test refinery/packs/catalog.test.mts`. Unblocks CI and `bun test` summary. (lanes 07, 12)
- [ ] **Fix WelcomeChat dead pricing link + stale docstring** — `app/welcome/WelcomeChat.tsx:132` (`/pricing`→`/billing`), delete the PHASE-1 docstring in `app/welcome/page.tsx:28-31`. Every prospect currently 404s on the only pricing CTA. (lane 10)
- [ ] **Stabilize LeePA tier-2 freshness probe** — `ingest/pipelines/leepa/resources.py:107-120` — replace the per-chunk randomized `leepa_t2_<hex>` pipeline name with ONE stable `leepa_parcels_tier2` (mirror collier_parcels); verify `_dlt_loads.schema_name`. (lane 01)
- [ ] **Route Crexi + fgcu_reri through the spider-fallback wrapper** — `ingest/pipelines/crexi_listings/extract.py:17,79,92-95` (use `extract_client.extract`, stop swallowing `FirecrawlError`, add `SPIDER_API_KEY` to the workflow) and `ingest/pipelines/fgcu_reri_indicators/pipeline.py:32,266-270` (use `scrape_with_fallback`, drop `V1FirecrawlApp`). (lane 02)
- [ ] **Add the sector-credit chargeoff-rate slug pattern** — `refinery/vocab/brain-vocabulary.json` — add one `sector_*_chargeoff_rate` `raw_slug_patterns` entry (mirror the permits-corridor pattern) so the ~10 unregistered NAICS prefixes can't orphan master; verify `check-vocab-coverage.mts --all`. (lane 06)
- [ ] **Fix daily-email-digest push** — `.github/workflows/daily-email-digest.yml:50-57` — replace `git push || true` with the proven `fetch → rebase --autostash → push` retry loop from `daily-rebuild.yml`; do not mask the final failure. (lane 12)
- [ ] **Un-pollute local lint** — `eslint.config.mjs:18-31` — add `".claude/**"` and `"awesome-claude-code-toolkit/**"` to `globalIgnores`; confirm `eslint` is 0-error locally. (lane 12)

### Claude/Opus jobs

- [ ] **Cap the paid-LLM routes** — `middleware.ts:11`, `app/api/converse/route.ts`, `app/api/welcome/chat/route.ts`, `lib/highlighter/meter.ts` — add both to `RATE_LIMITED_PREFIXES`, wire the existing `capEnabled`/`weeklyCount` gate before the stream, bound inbound content length, add the Vercel WAF rule. The top billing-DoS hole; enforcement plumbing already exists, just unwired. (lanes 09, 11)
- [ ] **Resolve FDOT `year_`/`yearx` drift** — `ingest/pipelines/fdot/resources.py:18,48` + tests vs `refinery/sources/fdot-source.mts`, `fdot-freight-source.mts`, `docs/sql/fdot_aadt_swfl_yearly.sql` — confirm the live column, pick ONE canonical name across ingest/read/view/tests, add a post-load existence assertion. Next annual re-ingest silently zeroes traffic until fixed. (lane 01)
- [ ] **Un-freeze Census CBP + harden the wipe path** — `ingest/pipelines/census_cbp/resources.py:8,11,38,44` + `pipeline.py` — dynamic vintage discovery (or bump to 2023, **NAICS2017** per web-verify), plus `raise_on_failed_jobs()` + a pre-replace min-row floor so an all-years failure can't truncate the 255k-row table. (lane 01)
- [ ] **Un-orphan lee_associates** — `ingest/pipelines/lee_associates_swfl/extract.py:138` + `refinery/sources/marketbeat-swfl-source.mts:168-194` — decide what "verified" means for a 3rd broker, make its rows reach a fragment, add `multifamily` to `SURFACED_SECTORS`, add a test that a lee_associates row surfaces. Restores Fort Myers Office/Retail/MF coverage. (lane 02)
- [ ] **Stop seed pipelines self-refreshing the freshness timestamp** — `ingest/pipelines/estero_edc/pipeline.py:148-179`, `ingest/pipelines/fmb_recovery/pipeline.py` — only bump `_ingested_at` on real content change (`IS DISTINCT FROM`) so the ODD probe can detect a frozen snapshot. (lane 02)
- [ ] **Unify master headline confidence** — `refinery/packs/master.mts:136-157`, `refinery/stages/4-output.mts:427-437`, `refinery/lib/synth.mts:310-312` — compute the headline once in the engine and inject it into the conclusion prose; delete the legacy `computeConfidence`. Kills the "prose says 0.39, field says 0.81" contradiction. (lane 03)
- [ ] **Make the binding reply contract testable** — `app/api/mcp/server.ts:86-116`, `refinery/lib/rules-of-engagement.mts` — derive RESPONSE_CONTRACT's invariant clauses from shared constants, fold in the missing `[INFERENCE]`/NNN/below-ZIP guards, and add it to the four-mirror drift test. (lane 04)
- [ ] **Close the dual slug-inversion gap** — `refinery/vocab/loader.mts:50-71`, `refinery/stages/2.5-normalize.mts:213-260` — add a consistency lint (every `slug_index` entry ∈ its concept's `raw_slugs` ∪ patterns) and make `resolveConceptSlugs` honor `raw_slug_patterns`; register in the pre-push gate. (lane 05)
- [ ] **Wire the retrodicted-corpus refresh** — `refinery/tools/flywheel-backtest.mts:112` — add a monthly workflow downstream of `fred-laus-alfred-monthly` that resolves the latest snapshot (not the pinned `2026-06`), idempotent, service-role-gated. (lane 08)
- [ ] **Get the live grading loop banking outcomes** — `refinery/grade/grade-predictions.mts`, `refinery/lib/predictions-log.mts`, `refinery/stages/4-output.mts:697` — confirm the daily rebuild refreshes the sign-slug leaves and `logSlugPredictions` inserts `kind='slug'` rows; add a health signal when 0 gradeable predictions open in N days; filter the 29 legacy pending husks from Pane-2 reads. (lane 08)
- [ ] **Cover the unwatched crons** — `.github/workflows/log-cron-incident.yml`, `heal-cron-failure.yml`, `.github/scripts/trigger-list-drift.test.mjs` — reconcile both watch-lists with the full 50-cron scheduled set (add the 26 missing, incl. Daily Email Digest), and strengthen the drift test to enumerate every `schedule:` block vs an explicit allowlist. (lane 12)
- [ ] **Make safe-push merge-safe** — `scripts/safe-push.mjs:30-44` — detect a local merge commit before rebasing; use `--rebase-merges` or FF-push directly when origin hasn't advanced; warn on detection. Web-verify `--rebase-merges` behavior first. (lane 12)
- [ ] **Allowlist the prospect `?logo=` host** — `app/welcome/page.tsx:13-16,51` — restrict to a known-good CDN allowlist or server-side proxy; same pattern review for `/p/[id]` branding URLs. Client-SSRF / tracking-pixel / deanonymization vector. (lane 10)

---

## P2+ — backlog

### Sonnet jobs

- [ ] **Gate `/api/charts/save` + `/api/templates/render` POST** — `app/api/charts/save/route.ts:6-32`, `app/api/templates/render/route.ts:53-97` — require auth or per-cid meter + rate-limit prefix; bound token map size; confirm template tokens are HTML-escaped. (lane 09)
- [ ] **HTML-escape template token substitution** — `lib/templates/render-html-template.ts:70-73` — escape `& < > " '` by default; allowlist the few markup-bearing tokens. (lane 11)
- [ ] **Add zod validation + length bounds to LLM/untyped bodies** — `app/api/converse/route.ts:54-79`, `app/api/welcome/chat/route.ts:65-82`, `deliverables/[id]/revoke` — bound `question`/`fact`/per-message content, constrain `selection_type` to the known enum. (lane 09)
- [ ] **Generic 500 bodies + drop the per-request brain-url log** — `app/api/b/[slug]/route.ts:34-36,110-113`, `where`, `z/[zip]`, `converse` — return `{error:"internal error"}` on the catch-all, log server-side; gate the slug/zip log behind a debug flag. (lane 09)
- [ ] **Project DELETE 404 parity** — `app/api/projects/[id]/route.ts:71-79` — `.select("id").maybeSingle()` and 404 on no match, mirroring PATCH. (lane 09)
- [ ] **PrintButton: don't block print on the meter POST** — `components/PrintButton.tsx:10-19` — `void fetch(...).catch(()=>{})` then `window.print()` unconditionally (pattern exists in HighlightPopup). (lane 10)
- [ ] **Wire the landing mobile hamburger** — `components/landing/Header.tsx:141-150` — add menu state/panel + `aria-label`/`aria-expanded`; mobile nav is currently dead. (lane 10)
- [ ] **Delete the Manatee ZIP block (scope drift)** — `lib/swfl-zip-city.ts:82-104` + header — remove out-of-footprint Manatee ZIPs; add a test asserting every `ZIP_CITY` key ∈ `fixtures/swfl-zip-county.json`. (lane 11)
- [ ] **De-dup per-ZIP slugs on thin corpora** — `refinery/packs/home-values-swfl.mts:343-407`, `refinery/packs/rentals-swfl.mts:345-410` — `[...new Set(...)]` before the per-ZIP loop; fires on every fixture run. (lane 07)
- [ ] **Move dead stubs out of the active probe** — `ingest/cadence_registry.yaml:593-613` — relocate `premier_commercial_swfl` + `svn_florida_swfl` to `not_yet_running:` (precedent: airdna). (lane 02)
- [ ] **Add city_pulse Tier-2 recency watchdog** — `ingest/cadence_registry.yaml` — mirror `city_pulse_corridors_tier2` for `data_lake.city_pulse`. (lane 02)
- [ ] **storm_history zero-row guard** — `ingest/duckdb_pipelines/storm_history_swfl/pipeline.py:109-127` — `COUNT(*)` on the filtered set, exit/raise if zero (copy the zori/redfin guard). (lane 01)
- [ ] **Single CONSTITUTIONS export + comment cleanup** — `refinery/constitution/index.mts`, `refinery/tools/semantic-ledger.mts` — collapse the two hand-edited import lists to one; delete stale "un-called" comments; derive the ledger footer from the list. (lane 05)
- [ ] **Re-categorize safety crime slugs' grade window** — `refinery/vocab/brain-vocabulary.json` — give `safety_property_crime_yoy_pct_*` a crime/safety category or explicit `grade.window_days` grounded in FDLE/CDE cadence (verify the calendar). (lane 08)
- [ ] **Fix logistics-nowcast docstring drift** — `refinery/packs/logistics-swfl-nowcast.mts:88-109` — rewrite docstrings to the real 6/24 values, drop the "set equal by design" claim, note escalation is unreachable from current cadence. (lane 06)
- [ ] **Reconcile rsw-airport PGD contradiction** — `refinery/packs/rsw-airport.mts:277-279` vs `:123-221` — per web-verify (LCPA does NOT publish PGD): either re-source PGD from flypgd.com/BTS or remove the PGD emission and keep the not-available caveat. (lane 06)
- [ ] **Percent metrics → `display_format:"percent"`** — `refinery/packs/rsw-airport.mts:155-220`, `refinery/packs/fgcu-reri.mts:120-144` — stop tagging YoY % as `raw` (drops the "%"). (lane 06)
- [ ] **safety-swfl SWFL fallback honesty** — `refinery/packs/safety-swfl.mts:206-248,322` — when population is missing, suppress the combined rate/YoY or relabel (it's Lee-only / unweighted, not "population-weighted"). (lane 06)
- [ ] **licenses-swfl threshold verification** — `refinery/packs/licenses-swfl.mts:16-26` — WebFetch the DBPR Construction Industry Annual Report, anchor the lapse-rate thresholds to a real figure + URL, resolve the `[CITATION_NEEDED]`. (lane 06)
- [ ] **master sources/input_brains parity test** — `refinery/packs/master.mts:225-286` — assert the two lists agree (cheap insurance against silent upstream omission). (lane 07)
- [ ] **Skip placeholder-0 metrics from the grader substrate** — `refinery/stages/4-output.mts:279-315,684` + `metric-observations-log.mts` — flag default-producer `value:0` metrics so they never reach `metric_observations`; add a load-time check requiring `outputProducer` on metric-emitting packs. (lanes 03, 04)
- [ ] **paginate 416/EOF hardening** — `refinery/lib/paginate.mts:78-83` — try/catch the `.range()` and treat a thrown 416 as clean EOF; add a test. (lane 03)
- [ ] **citation-table pipe-collision guard** — `refinery/render/citation-table.mts` / `spec-validator.mts:160-180` — sanitize `|` in the `source` field at render time. (lane 04)
- [ ] **grain-guard multi-token grain** — `refinery/validate/grain-guard-lint.mts:33` — allow `place-month`/`tract-month`; add positive tests. (lane 04)
- [ ] **`/map` + `/demo` fixture labeling** — `app/map/page.tsx`, `app/demo/page.tsx` — wire to live data, gate behind `/embed`/noindex, or add a prominent "sample data" banner. (lane 10)
- [ ] **`/data-intel` runtime read hardening** — `app/data-intel/page.tsx:13-18` — async readFile + try/catch + `force-static`; verify file tracing. (lane 10)
- [ ] **Grounding empty-token guard** — `lib/highlighter/grounding.ts:126,142` — omit the "quote this token" line when the token is falsy. (lane 11)
- [ ] **assembleDeliverable: log the real DB error** — `lib/deliverable/assemble.ts:80` — `console.error` the cause before the opaque 500. (lane 11)
- [ ] **noaa_ghcn_rainfall: dispatch + verify** — trigger one run, confirm `env_rainfall_swfl_annual_in` lands, stamp the registry. (lane 02)
- [ ] **Backtest reporting adds** — `refinery/lib/backtest/grid.mts`, `skill-baseline.mts` — relabel/exclude `signalConfidence` from the calibration pane; add a deadband-sensitivity line (N + lift at 0.5×/1×/2× ε); add a golden-fixture SQL-vs-TS skill reconciliation test. (lane 08)
- [ ] **FEMA absolute floor comment/coupling** — `ingest/pipelines/fema/resources.py:215-218` — note the 0.95 dynamic guard is the real protection; fail loud if `_current_tier2_count()` returns None on a populated table. (lane 01)
- [ ] **Cleanup: stray file + plan-doc form** — delete repo-root `.audit-scan.mjs`; resolve the email-funnel plan to ONE form (folder vs single file) and reconcile the build-queue path. (lane 12)

### Claude/Opus jobs

- [ ] **Degraded-upstream confidence cap semantics** — `refinery/stages/4-output.mts:208-216,247-254,433` — decide whether a degraded (last-good) upstream caps the headline; either gate `applyStalenessCap` on degradation caveats too (+ rename the var) or remove the dead floor; add a test. (lane 03)
- [ ] **Scope the smoothing figure-qualifier carve-out** — `refinery/validate/smoothing-lint.mts:81-95` — gate the "approximately $X" exemption behind `isQuotedSourceLine` so a brain can't soften its own deterministic number. (lane 04)
- [ ] **Narrow facts-only-lint's second-person scan** — `refinery/validate/facts-only-lint.mts:22-87`, consumed at `4-output.mts:544` — exclude user-facing OUTPUT fields (`grain_boundary.routes`, conclusion) from the imperative/`your` scan so a natural route invitation can't abort the nightly write. (lane 04)
- [ ] **signal_* topic enum parity** — vocab `city_pulse_signal.raw_slug_patterns` ↔ `ingest/pipelines/city_pulse/distill.py:37-43` — add a test asserting the vocab pattern set == the Python `VALID_TOPICS`, or collapse to one `signal_**` pattern. A 6th topic currently aborts the nightly rebuild. (lane 05)
- [ ] **fgcu-reri direction logic** — `refinery/packs/fgcu-reri.mts:201-216` — stop reading "mixed" by construction and triple-counting per-county home-price rows; restrict the tally to swfl aggregates or use a net-signal threshold. (lane 06)
- [ ] **safety-swfl threshold calibration** — `refinery/packs/safety-swfl.mts:77-100` — derive `DIRECTION_THRESHOLD_PCT` from the real Lee/Collier UCR YoY noise band; document in SOURCED.md. (lane 06)
- [ ] **master rollup-cap contract** — `refinery/packs/master.mts:129`, `refinery/lib/synth.mts:765-810` — reconcile the `t1Count+1` cap with the documented "≤8" contract (raise the cap or correct the comment); verify against the v3-synthesis-spec. (lane 07)
- [ ] **Rename the investor "flood-adjusted cap rate"** — `refinery/packs/investor-zip-swfl.mts:218-221,425,549` + citation — it's a risk-discounted gross yield, not a cap rate; rename the customer-facing moat metric + fix the citation prose. (lane 07)
- [ ] **Live grader initial-vintage guard** — `refinery/grade/grade-predictions.mts:290-300` — for revision-prone slugs, grade only on initial-vintage tables or refuse a vintage post-dating the window; at minimum record first-print-vs-revision. Mirrors the PIT invariant the backtest layer enforces. (lane 08)
- [ ] **Land a second backtestable family** — `refinery/tools/flywheel-backtest.mts:59-70`, `grade-config-sweep.mts:54-66` — wire the SBA (immutable) and/or TDT clean grids so the moat's effective N > 1; surface `n_families` in The Glass. (lane 08)
- [ ] **Tighten the deliverable moat anchor set** — `lib/deliverable/build.ts:142`, `narrative-lint.ts:50,80` — build anchors only from sourced value-bearing fields (exclude free-text note/question), key by unit; or soften the "structural guarantee" doc claim. (lane 11)
- [ ] **caveat-scrub corpus test** — `refinery/render/speaker.mts:301-338` — add a property/corpus test asserting no `data_lake.*`/`refinery/`/commit-hash/`T[1-4]` survives across all shipped packs' real caveats. (lane 04)
- [ ] **Decide the dead build-context gate** — `.claude/hooks/check-build-context.mjs`, `.claude/settings.json` — remove it or move enforcement to a PreToolUse gate / auto-stamp; it has failed every session for 12 days. (lane 12)
- [ ] **Fix the live-DB vitest in `bun test`** — `refinery/packs/zhvi-zip-latest-gate-a-parity.test.mts:320-328` — gate on reachability (opt-in env or pooler probe), not just creds presence, so local `bun test` stops timing out. (lane 12)
- [ ] **active-listings decay** — `refinery/sources/active-listings-source.mts:67-138`, `ingest/pipelines/crexi_listings/distill.py:124-134` — window the aggregation to the latest scrape cohort + give URL-less rows a stable dedup key, so listing_count/available_sqft stop inflating. (lane 02)
- [ ] **Code-split + consolidate the chart bundle** — `components/charts/registry/registry.ts`, `CorridorMarketScatter.tsx`, DockChart/HighlightPopup — lazy-load frames per `frameId` via `next/dynamic`; consolidate on one chart library (echarts XOR recharts). (lane 10)

---

## Email funnel (parallel session mid-build — keep separate)

### Sonnet jobs

- [ ] **Contact re-upload: preserve existing name** — `app/api/email/contacts/upload/route.ts:155-179` — `name: incoming.name ?? ex.name`; add a regression test. Silent data loss on the "add a tag" flow. (lane 13)
- [ ] **schedule-command project-ownership check** — `app/api/email/schedule-command/route.ts:62-63` — validate `projectId` belongs to the caller before propose/confirm, 404 on miss. (lane 13)
- [ ] **Go-live verification probe** — `scripts/email/run-schedules.mts`, `email-scheduler.yml` — one-shot prod check (migrations applied + `claim_due_email_schedules` exists + two-account RLS 404) before flipping the cron; worker startup probe that fails loud if the RPC is missing. (lane 13)
- [ ] **domain-verify refresh fix** — `app/api/email/domain-verify/route.ts:167-216` — when the submitted domain differs from `existing.domain`, create a new Resend domain (or reject) instead of writing the new string against the old `resend_domain_id`. (lane 13)
- [ ] **Move scope tests under `__tests__`** — `lib/email/schedule-command.test.ts` → `lib/email/__tests__/`. (lane 13)

### Claude/Opus jobs

- [ ] **[CRITICAL] Namespace Resend segments per tenant** — `lib/email/audience-sync.ts:148-182`, `app/api/email/contacts/sync/route.ts` — key segment names by `${userId}:${slug}` for both list-match and create; back-migrate existing rows; make the `email_audiences` cache authoritative. Gates go-live. (lane 13)
- [ ] **[HIGH] Usage-cap send-size headroom** — `lib/email/scheduler.ts:235-242,303`, `lib/email/usage.ts:126-167` — move the audience lookup before the gate; gate on `sent + expectedRecipients <= limit`; decide block-vs-partial; add an at-cap large-audience test. (lane 13)
- [ ] **[HIGH] Scope consumer or gate the promise** — `scripts/email/run-schedules.mts:223-228`, `lib/email/schedule-command.ts:231-260` — land Task 02 (scoped content via the grounded `lib/deliverable/*` engine) OR strip the scope clause from the confirmation until the consumer exists. Never ship parser+summary without the consumer. (lane 13)
- [ ] **Physical-sender provenance** — `lib/email/sender-config.ts:52-74`, `lib/email/templates/token-defaults.ts` — add an ADDRESS / "sent on behalf of {tenant}" token on the unverified-domain path; vendor-verify Gmail/Yahoo bulk-sender + Resend "send on behalf of" guidance in-session. (lane 13)
- [ ] **Idempotency for confirm + per-recipient-per-step** — `app/api/email/schedule-command/route.ts:66-72,179-217`; welcome→delta activation — issue a signed proposal nonce that CONFIRM must echo; add a per-`(recipient, sequence_step)` send-ledger key. The inbound reply path will reuse this seam — settle it now. (lane 13)
- [ ] **Build the inbound reply sensor safely** — net-new `app/api/email/inbound/route.ts` — live Resend webhook signature verification (vendor-verify, don't trust remembered payload), sender→`user_id` resolution via `email_sender_config` with reject-before-parse for unknown senders, REUSE the `schedule-command` parser, and a deterministic/auditable intent label that never auto-acts without the two-step confirm. (lane 13)
- [ ] **Chronically-failing schedule escalation** — `lib/email/scheduler.ts:227-345`, `lib/email/usage.ts` — add a `consecutive_failures` counter → `status='errored'` after N, surface on the ops board, wire a real notify sink. (lane 13)
- [ ] **Stripe billing (Task 04)** — `lib/email/usage.ts:53-67,157` — no `stripe` import exists anywhere; build the tier-elevation path so a paid tenant's `email_usage.tier` is set from a subscription (every tenant is permanently free-capped today). (lane 13)

---

**Tally:** 44 Sonnet jobs, 37 Claude/Opus jobs (81 total, of which 13 are the email-funnel block: 5 Sonnet + 8 Opus).
