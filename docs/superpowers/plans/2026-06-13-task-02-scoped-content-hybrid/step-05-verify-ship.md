# Step 05 — Verify + ship (Opus)

**Check:** `email_scoped_content` · **Owner:** Opus · **Risk:** medium (live-route-adjacent → diff-review)

## Verify (DRY_RUN — never sends)

1. Seed a scoped schedule (or stub a due row) — e.g. `scope_kind='zip', scope_value='33904', topic='flood'`.
2. `DRY_RUN=true bun scripts/email/run-schedules.mts` → confirm the logged per-row would-send payload:
   - scoped row → subject `"Cape Coral flood — this week"`, body = the flood card cited + freshness token.
   - a `scope=null` row in the same batch → the **unchanged** global digest.
3. Confirm every scoped figure carries a source + the live freshness token; no number appears that isn't on a
   card (the no-invention floor).

## Ship

- **Diff-review before push** (RULE 1 — `/api/email/*`-adjacent content path): pause for operator eyeball of the
  `scoped-content.ts` + `run-schedules.mts` diff.
- Pre-push gates: `bun test` (full) green; `tsc`/eslint clean; no `package.json` change (no lockfile gate); no
  `refinery/packs/**` touched (no vocab/catalog gate). The hooks still run.
- `SESSION_LOG.md` top entry (what changed + file paths + DRY_RUN evidence).
- `node scripts/check.mjs close email_scoped_content "scoped sends live-verified via DRY_RUN; scope=null regression byte-stable"`.
- Reconcile `_AUDIT_AND_ROADMAP/build-queue.md` (Task 02 line → built).
- `node scripts/safe-push.mjs`.

## Done when

- DRY_RUN proves scoped + global both correct; diff reviewed; check closed; build-queue reconciled; pushed green.
