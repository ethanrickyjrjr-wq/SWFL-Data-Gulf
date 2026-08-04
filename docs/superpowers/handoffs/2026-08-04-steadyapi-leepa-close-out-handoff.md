# HANDOFF — SteadyAPI↔LeePA close-out (brain-platform, 08/04/2026)

**Written from a lean-verifier session.** The ledger half of the 08/04 sale-grain call is DONE and
pushed. This handoff exists to (1) close the checks that are now closeable, (2) do the two triages
blocking the rest, and (3) send four specific facts back to lean-verifier so the watch can move off
`bound-with-evidence`.

**Read first:** `_RESEARCH/data-and-ingest/2026-08-04-steadyapi-leepa-sale-grain-proportion-call.md`
(the evidence doc). Method file lives in the sibling repo:
`lean-verifier/research/2026-08-03-steadyapi-sale-grain-proportion-call.sql` — **corrected 08/04**,
re-read it rather than working from memory of the version you ran.

**Check CLI (verified against `scripts/check.mjs`):**
```
node scripts/check.mjs list
node scripts/check.mjs close <check_key> "<note>"
node scripts/check.mjs update <check_key> --detail "..."
node scripts/check.mjs open <project> <check_key> "<label>" [--detail "..."] [--due YYYY-MM-DD]
```
`open` fails loud if the key exists. Change state with `close`, metadata with `update`.

---

## 0. HONEST SCOPE — "close all checks" is not achievable in one session, and here is exactly why

Read this before planning the session. Four checks in this family **cannot** close on the evidence
available, and closing them anyway would be the exact lie this apparatus exists to prevent.

| Check | Can it close today? | Why |
|---|---|---|
| `steadyapi_leepa_ledger_row_not_yet_applied` | **YES — close first, §1** | Done. Evidence below. |
| `steadyapi_leepa_381_same_month_price_disagreements_untriaged` | **YES, after §2 triage** | Zero-cost SQL, no blockers |
| `steadyapi_leepa_condo_unit_grain_match_gap` | **YES, after §3 decision** | Already measured; needs a written call, not more querying |
| `steadyapi_step3_typed_families_spec` | **NO** | Family C (`steadyapi_property_permits`) has not shipped. Closes when it does. |
| `should_i_sell_property_tax_source` | **NO** | Needs family B `tax_amount` validated against a real county tax bill first. Vendor annual tax ≠ county bill; asserting before that comparison asserts an unshown claim. |
| `permits_spine_thin_collier_missing` | **NO — by design** | Family C serves per-property permits; it does not fix the area-wide Collier spine. Stays open deliberately. |
| `engine_enabled_kill_switch_owed` | **NO — operator-owed** | Ricky's decision, not an agent's. Do not close it on his behalf. |

**Three close today. Four do not.** If the session ends with seven closed, something was closed
falsely — go back and find it.

---

## 1. CLOSE IMMEDIATELY — the ledger row landed

`steadyapi_leepa_ledger_row_not_yet_applied` is satisfied. The cross-project hook did its job; a
lean-verifier session applied it.

- Repo `ethanrickyjrjr-wq/lean-verifier` (**private**), branch `steadyapi-leepa-sale-grain-call-0804`,
  commit **`563c8a7`**, pushed. Not merged to `main` — Ricky's call.
- Ledger now carries: the bound row under a new **BOUND WITH EVIDENCE — live-verify pending**
  section, the floor decomposition, the sub-monthly self-correction, the day-grain near-miss, and
  the condo-gap finding. The old OPEN row was **transitioned, not deleted** (append-mostly rule).
- The evidence doc was copied to
  `lean-verifier/research/2026-08-04-steadyapi-leepa-sale-grain-proportion-call.md`,
  **byte-identical**, sha256 `b7d9fb2a969b46ae26a88fa9ad413b0bd388495fea6215b1ca98470fda31595a`.
  It lives there because **lean-verifier is private and this repo is public**, and because a ledger
  citing evidence that exists only inside one machine's gitignored folder cannot satisfy its own
  "the evidence wins" rule.

```
node scripts/check.mjs close steadyapi_leepa_ledger_row_not_yet_applied \
  "Applied from a lean-verifier session 08/04: branch steadyapi-leepa-sale-grain-call-0804, commit 563c8a7, pushed. Row bound as definitional watch, live-verify pending. Evidence copied byte-identical (sha256 b7d9fb2a…95a) to lean-verifier/research/, which is private; NOT pushed here because this repo is public."
```

**Then, before anything else — the pointer edit.** Both remaining checks cite an evidence path that
resolves only on this machine. Fix that now so it is not rediscovered:

```
node scripts/check.mjs update steadyapi_leepa_381_same_month_price_disagreements_untriaged \
  --detail "Evidence: lean-verifier/research/2026-08-04-steadyapi-leepa-sale-grain-proportion-call.md (private repo, byte-identical copy of _RESEARCH/data-and-ingest/…). Method: lean-verifier/research/2026-08-03-…sql."
node scripts/check.mjs update steadyapi_leepa_condo_unit_grain_match_gap \
  --detail "Evidence: lean-verifier/research/2026-08-04-steadyapi-leepa-sale-grain-proportion-call.md (private repo). 2,196 of 2,271 marked-unit misses (96.70%) reach a parcel once the unit is stripped."
```

---

## 2. TRIAGE THE 381 — the check that decides whether an error contract is assertable

**The question:** 381 pairs agree on month but disagree on price (8.66% of same-month pairs; 75 are
>10% apart). The watch was bound without an error contract because a mismatch contract would be red
on day one. Triage asks: **is there a named, testable class that explains the 381?** If yes, exclude
that class and a mismatch contract may become assertable on the remainder. If no, the watch stands
alone and that is the finding.

### 2.0 Rebuild `sale_pairs`

Re-run STEP 0b + STEP 2's `CREATE TEMP TABLE sale_pairs` from the **corrected** method file. It now
emits `leepa_sale_month` / `steady_sale_month`; compare on those, never the raw dates.

### 2.1 Resolve the use-code column BEFORE using it — and resolve its SEMANTICS, not just its name

This is the lesson that nearly cost us the whole call. `leepa_parcels.last_sale_date` passed a
name-and-type preflight and was still a month stamp wearing a `date`. Do not repeat the shape of
that mistake with the use code.

```sql
-- (a) does a use-code column exist, and what is it called?
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'data_lake'
  AND table_name IN ('lee_parcels', 'leepa_parcels')
  AND (column_name ~* 'use|dor|uc|class|type|land|improve|bldg');

-- (b) what does it actually CONTAIN? A code column with 3 distinct values is not a use code.
SELECT <col>, count(*) FROM data_lake.lee_parcels GROUP BY 1 ORDER BY 2 DESC LIMIT 40;
```

FDOR NAL use codes put vacant residential at `00` and improved single-family at `01`, but **verify
against the actual distribution** — do not assume the encoding.

### 2.2 Classify all 381 against four hypotheses

Each hypothesis is falsifiable and each has a different consequence. Run them as one classification
so every pair lands in exactly one bucket, and report the counts:

1. **Vacant / land parcel** — county records raw-land value while Steady prices a lot sale, or vice
   versa. Test: the use code from 2.1. The eyeball sample's Lehigh lot (steady $18,000 vs county
   $10,128) is the archetype.
2. **Nominal / non-arms-length transfer** — quitclaim, family transfer, $100 or $10 deeds. Test:
   `leepa_price` below a nominal threshold (≤ $1,000, and separately `= 0`) while `steady_price` is
   a market number.
3. **Multi-parcel deed** — one sale covering N parcels; the county splits the consideration, Steady
   reports the whole. Test: `steady_price / leepa_price` clustering near small integers (2, 3, 4),
   or several `parcel_id`s sharing one `steady_sale_month` and one `steady_price`.
4. **Partial interest** — a fractional conveyance. Test: the ratio clustering near 0.5 / 0.25 / 0.75.

```sql
SELECT bucket, count(*) AS pairs,
       round(avg(steady_price::numeric / nullif(leepa_price, 0)), 3) AS avg_ratio
FROM (
  SELECT CASE
           WHEN leepa_price <= 1000                                   THEN '2 nominal'
           WHEN <use_code_col> IN (<vacant codes from 2.1>)           THEN '1 vacant/land'
           WHEN round(steady_price::numeric / nullif(leepa_price,0), 2)
                  IN (2.00, 3.00, 4.00)                               THEN '3 multi-parcel'
           WHEN round(steady_price::numeric / nullif(leepa_price,0), 2)
                  IN (0.25, 0.50, 0.75, 1.33)                         THEN '4 partial-interest'
           ELSE                                                            '5 UNEXPLAINED'
         END AS bucket,
         steady_price, leepa_price
  FROM sale_pairs
  WHERE NOT key_ambiguous
    AND leepa_sale_month = steady_sale_month
    AND leepa_price <> steady_price
) q
GROUP BY bucket ORDER BY bucket;
```

Then **read 25 rows of bucket 5 by eye.** The unexplained residue is the number that matters.

### 2.3 The decision, written either way

- **If bucket 5 is small** (say <50) and the other buckets are named, testable classes: an error
  contract becomes assertable *on the excluded-class remainder*, with the exclusions stated in the
  contract itself. That is a real strengthening of the surface.
- **If bucket 5 is large or heterogeneous:** the watch stands alone, no error contract, and the
  reason is "residual disagreement is not attributable to a named class." Equally a finding — write
  it, do not leave it as an open check.

Close with the bucket table inline:
```
node scripts/check.mjs close steadyapi_leepa_381_same_month_price_disagreements_untriaged \
  "Triaged 08/04: vacant/land N, nominal N, multi-parcel N, partial-interest N, unexplained N. Decision: <error contract asserted on the remainder after excluding X | no error contract, watch stands alone>. Evidence appended to _RESEARCH/…-proportion-call.md."
```

---

## 3. CLOSE THE CONDO GAP — this one needs a DECISION, not more querying

The measurement is done and unusually clean: of 3,034 unmatched Lee properties, **85.00% carry a
unit**, and **2,196 of the 2,271 marked-unit misses (96.70%) reach a parcel the moment the unit is
stripped.** The property is on the county roll; only the unit grain is missing. That is a
condo-grain gap — not an absent parcel, not normalizer drift.

**Do not re-measure it. Decide it.** Two honest options:

- **(a) Close as measured-and-deferred.** The 68.57% match rate is a *stated ceiling with a known
  cause*, not an unknown. Lifting it is a condo-unit-matching sub-project with its own brainstorm,
  tests, and failure modes — not a normalizer tweak. Close this check and open a successor with real
  scope (`steadyapi_leepa_condo_unit_matching_subproject`) so the finding is tracked as work rather
  than as an unresolved question.
- **(b) Attempt the unit match now.** Only if the county side actually carries unit information —
  check whether `lee_parcels` has a unit/suffix column, or whether unit appears inside `phy_addr1`
  in parseable form. **If the county roll has no unit field at all, (b) is impossible and (a) is the
  only honest close** — say that explicitly rather than leaving it ambiguous.

Note the family: Marco Island 0/360 (06/30), `listing_state.property_type` (07/06–07), and the
DEFERRED unmarked-trailing-unit smush named in `address_key.py`'s own docstring. This is the fourth
appearance. That recurrence belongs in the close note — a defect appearing four times in five weeks
is a design gap, not four incidents.

**Also worth 10 minutes:** `marco_condo_price_cluster_unverified` is open and is plausibly the same
root cause. Check whether this finding closes or reframes it. If it does, say so; if it doesn't, say
that too.

---

## 4. WHAT LEAN-VERIFIER NEEDS BACK — four facts, nothing else

The ledger row is bound but **cannot reach PROVEN** until these arrive. Send them as a paste block
under `_RESEARCH/` (same pattern as last time — the cross-project hook will block a direct write,
which is correct behavior, not a bug):

1. **The 381 triage outcome** — bucket counts, and whether an error contract was asserted. This
   changes the row's "no error contract asserted today" clause.
2. **The condo-gap decision** — (a) or (b), and whether the 68.57% floor moves. If it moves, the
   floor decomposition (343 + 73 + 18 + 6,186 = 6,620) must be recomputed and re-sent; that
   arithmetic is in the ledger and would silently stop reconciling.
3. **Re-observation on a scheduled cron run** — the live-verify bar. Bind-time numbers to
   re-observe: **68.57%** join, and **(6186, 4969, 4019)** from 2.1. Needs a cron-triggered probe
   with a linkable run ID — not a dispatch, not a manual run. This is the single thing standing
   between the row and PROVEN, and it is gated behind §5.
4. **Confirmation the ordering rule is in the playbook** (§5) — the row explicitly depends on it
   holding.

---

## 5. THE ORDERING RULE — put it in the playbook; it currently lives only in ledgers

**Step 5 (cron re-enable) must NOT land before raw-insert is wired into the nightly path.**

Re-enable first and the lane resumes parse-and-discard: the `artifact` half of
`check(claim, artifact)` stops being retained, any contract bound on
`steadyapi_property_history_raw` goes stale, then **vacuously green** — precisely the failure
adoption item 2 exists to prevent. A contract that cannot fail is worse than no contract, because it
reports success.

It is recorded in `lean-verifier/LEDGER.md` under Known cross-repo issues. It is **not** in
`docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md`, which is the document someone
will actually read before flipping the crons back on. Add it to §STEP 5 there.

---

## 6. TRAPS — every one of these has already bitten this lane once

1. **The JSON envelope.** Family arrays live at `body->'body'->'<family>'`, never top-level.
   `body->'property_history'` returns NULL on all 17,875 rows and a naive parser reads the table as
   empty *with no error*.
2. **Month grain.** `leepa_parcels.last_sale_date` has one distinct day-of-month across 528,505
   rows. Day-grain equality scores 1.60% — pure calendar artifact. Always `date_trunc('month', …)`.
3. **Name ≠ semantics.** The generalization of trap 2, and the most valuable thing to come out of
   this call. For any date column entering a contract:
   `SELECT count(DISTINCT extract(day FROM <col>)) FROM <t> WHERE <col> IS NOT NULL;` — if it
   returns 1, you have a month stamp wearing a `date`. Query 0.1b in the method file.
4. **Address fan-out.** 10,158 ambiguous county keys, worst = 2,862 parcels behind one key. A plain
   JOIN silently multiplies rows. The `key_ambiguous` guard is load-bearing.
5. **`_ENRICH_ONLY_COLS`** — fired twice (wiped `listed_date` 07/19, `baths` 07/26). Step 4's
   problem, not this session's, but do not drift into it casually.
6. **Cross-project writes are blocked and that is correct.** Stage anything bound for lean-verifier
   as a paste block; do not try to defeat `check-project-path.mjs`.
7. **Provenance:** user-facing `source_tag` / citations say **"realtor.com"**, never "SteadyAPI".

---

## 7. SHIP DISCIPLINE

SESSION_LOG entry before push · `node scripts/safe-push.mjs` · explicit paths only · close/open
checks in the same session (RULE 0.8).

**This file arrived as an untracked write from a lean-verifier session** — it is not committed here.
Commit it with explicit paths as part of the close-out, or delete it once the work is done; do not
leave it dangling in the working tree where a future `git add -A` sweeps it in unreviewed.

Triage evidence appends to
`_RESEARCH/data-and-ingest/2026-08-04-steadyapi-leepa-sale-grain-proportion-call.md` — and if that
file changes, **the lean-verifier copy's sha256 no longer matches**, which is by design: send the
new hash with the paste block so the ledger citation is updated rather than silently drifting.
