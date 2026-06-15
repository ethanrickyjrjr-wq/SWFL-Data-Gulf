# C-1 — `BrainOutput.expires` stamp + the hard TTL gate — **OPUS**

## Goal
Build the self-TTL substrate the prime directive needs and does not have: a deterministic per-brain
`expires` on every brain output, and the ONLY primitive that REJECTS (not merely caps/decays) on
staleness. Additive and fail-closed.

## Files
- **MODIFY** `refinery/lib/freshness.mts` — add `expiresFor(refined_at: string, ttl_seconds: number):
  string | undefined` (ISO, or `undefined` if `refined_at` is unparseable — R2 NaN-guard) and
  `freshnessGate(expires: string, now?: string): { fresh: boolean; expired: boolean; expires_at: string;
  days_past?: number }`. Pure, no I/O. (Beside `freshnessToken`/`LAKE_ID`.)
- **MODIFY** `refinery/types/brain-output.mts` — add optional `expires?: string` + `ttl_seconds?: number`
  to `BrainOutput` (engine-owned, alongside `refined_at`). Optional so legacy readers tolerate absence; C
  resolves absence via C-3's derivation fallback / `not_found`.
- **MODIFY** `refinery/stages/4-output.mts` — where `refined_at`/`confidence` are stamped, also assign
  `expires = expiresFor(refined_at, pack.ttl_seconds)` + `ttl_seconds = pack.ttl_seconds`. **Additive only
  — do not touch `applyStalenessCap`/caveat logic.**

## Logic / Hard invariants
- `expiresFor` mirrors `dag.mts:brainStatus` math (`Date.parse(refined_at) + ttl_seconds*1000`) but
  returns a full ISO timestamp and is pure/exported. **R2 NaN-guard:** if `Date.parse(refined_at)` is
  `NaN`, return `undefined` — **never** `new Date(NaN).toISOString()` (it throws `RangeError`). A corrupt
  `refined_at` thus degrades to no-TTL-basis → `not_found` downstream, never a crash.
- `freshnessGate` is the ONLY rejection primitive. **N1 — the NaN-guard runs FIRST, as an explicit
  ordered line, BEFORE any comparison.** The bare `now > Date.parse(expires)` **fail-OPENS** on a NaN
  parse — `now > NaN` evaluates to `false` → `expired:false` → the gate would report the metric FRESH,
  the worst-direction failure. Write it exactly so:
  ```ts
  export function freshnessGate(expires: string, now: string = new Date().toISOString()) {
    const e = Date.parse(expires), n = Date.parse(now);
    if (Number.isNaN(e) || Number.isNaN(n)) return { fresh: false, expired: true, expires_at: expires };
    const expired = n > e;
    return { fresh: !expired, expired, expires_at: expires, days_past: expired ? (n - e) / 86_400_000 : undefined };
  }
  ```
  The `n > e` comparison MUST never run on a NaN parse. Invalid/unparseable `expires` **or** `now` →
  `{ fresh:false, expired:true }` (**fail-closed — never assert on unknown freshness**). NOTE: an ABSENT
  (never-set) `expires` is handled upstream by C-3 (→ derivation or `not_found`), NOT by passing a falsy
  value into `freshnessGate`.
- The Stage-4 STAMP reads the **required** per-brain `ttl_seconds` (`refinery/types/pack.mts:79`) — so the
  stamp itself **never fails** for any brain (master `604800`, cre-swfl `604800`, housing `86400*35`).
- **Daily de-confliction:** `freshness-pulse` (daily file 03) stamps `as_of: r.period`, not `expires`. C
  does not special-case it — its catalog `ttl_seconds: 86400` yields a 1-day `expires` via the same path.
- **REBUILD-ORDER (load-bearing).** This task is the ADDITIVE stamping only. Ship it, then run a FULL
  rebuild (`npm run refinery -- master --force`, or `--target-only` to skip the cre-swfl egress hang) so
  every written output carries `expires`. **No consumer may rely on `output.expires` until that rebuild
  lands;** C-4's gate stays flag-OFF until then.

## Acceptance test
- `expiresFor("2026-05-01T00:00:00Z", 86400*35) === "2026-06-05T00:00:00Z"`;
  `expiresFor("not-a-date", 86400) === undefined` (R2 NaN-guard — no throw).
- `freshnessGate` past → `{expired:true, days_past>0}`; future → `{fresh:true}`; `""`/garbage →
  `{expired:true}`.
- Stage 4 on a fixture brain: emitted `BrainOutput.expires === expiresFor(refined_at, ttl_seconds)`;
  confidence/caveat output byte-identical (additive diff).
- After a full rebuild, every live brain `.md` OUTPUT block carries `expires`.
