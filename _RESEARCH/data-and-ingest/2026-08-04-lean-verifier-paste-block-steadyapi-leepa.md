# PASTE BLOCK for lean-verifier — steadyapi↔leepa ledger row, 4 facts owed (§4 of the close-out handoff)

**For a lean-verifier session to paste into `LEDGER.md` under the bound row.** Cross-project hook
blocks brain-platform writing lean-verifier directly (correct behavior) — staged here per the
handoff's own instruction. Source: `_RESEARCH/data-and-ingest/2026-08-04-steadyapi-leepa-sale-grain-proportion-call.md`
ADDENDUM (same file, byte-for-byte diff is just the addendum appended — re-copy and re-hash before
citing, the old sha256 `b7d9fb2a969b46ae26a88fa9ad413b0bd388495fea6215b1ca98470fda31595a` no longer
matches this version).

## 1. The 381 triage outcome

Classified live 08/04: vacant/land 61, nominal 0, multi-parcel 3, partial-interest 8, **de-minimis
rounding (≤1% delta) 232** — a 5th class the original method file didn't name, forced by the eyeball
sample — close-but-not-de-minimis (1–10%) 46, TRUE unexplained (>10%) 31. Reconciles: 61+3+8+232+46+31
= 381. **91.86% land in a named class.** Error contract IS asserted on the excluded-class remainder:
price agreement within 10% after excluding vacant/nominal/multi-parcel/partial-interest/de-minimis,
stated residual red-rate 77/6,186 = 1.24%. This changes the row's "no error contract asserted today"
clause — a contract shape is now defined, though building it is separate ingest work.

## 2. The condo-gap decision

**(a) — measured-and-deferred.** Checked live: `data_lake.lee_parcels.phy_addr2` is 0 of 556,083
rows populated (not sparse, empty), no other unit column exists. County roll carries zero unit
information in any form, so (b) attempt-now was impossible per the handoff's own stated condition.
**The 68.57% join floor does NOT move** — this is a close on the existing measurement, not a new one.
The floor decomposition (343 + 73 + 18 + 6,186 = 6,620) stands unchanged; no re-send needed.
Successor check opened: `steadyapi_leepa_condo_unit_matching_subproject` (brain-platform, class task).

## 3. Re-observation on a scheduled cron run

**Not reachable this session — still gated behind §5/Step 5, which is still not landed.** Bind-time
numbers to re-observe once a cron-triggered probe runs: join **68.57%**, and from the two-pass
reproduction **(6186, 4969, 4019)** — all three re-confirmed live 08/04 (identical to bind time,
satisfying two-pass discipline). This fact is unchanged from the original row; restated because the
row explicitly asks for it.

## 4. Confirmation the ordering rule is in the playbook

**Done 08/04.** Added to `docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md` under
STEP 5, verbatim: Step 5 (cron re-enable) must not land before STEP 1's raw-insert is wired into the
nightly path, or the lane resumes parse-and-discard and any contract on
`steadyapi_property_history_raw` goes stale then vacuously green.
