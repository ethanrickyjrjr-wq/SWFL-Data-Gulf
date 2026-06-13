# Step 02 — Scope resolver + fact assembly (Opus; the no-invention spine)

**Check:** `email_scoped_content` · **Owner:** Opus · **Risk:** medium (MOAT/grain correctness)

## Goal

Turn a scoped `ScheduleRow` into cited `WelcomeMetric` cards via `buildWelcomeAnswer`, gated to the 6-county
grain, filtered by topic. Pure + DI-seamed so it unit-tests with no DB/network.

## `resolveScope(row)` — in `lib/email/scoped-content.ts`

- `scope_kind==='zip'` → `{ zip: scope_value, explicitZip: true, topic }`.
- `scope_kind==='place'` → `buildPlaceContext(scope_value)` → representative ZIP → `{ zip, explicitZip: false, topic }`
  (a town spans ZIPs → `explicitZip:false` self-suppresses the flood card, mirroring the welcome path).
- `scope_kind==='county'` → coarse path (`explicitZip:false`; `buildWelcomeAnswer` picks coarse metrics).
- **MOAT gate:** resolved ZIP must be in `fixtures/swfl-zip-county.json`. Not resolvable / not in set → return
  `null` (caller falls back to the global digest + logs; never invent).
- `scope_kind==NULL && topic==NULL` is handled by the CALLER (global path) — `resolveScope` is only invoked when
  a scope is present.

## `assembleScopedContent(row, deps)` — pure, DI

```ts
interface ScopedDeps {
  assembleDossier: (zip: string) => Promise<LocationDossier | null>; // confirmed signature from step-01
  identityForLocation: (...) => PlaceEcho;                            // confirmed from step-01
  buildWelcomeAnswer: typeof import("@/lib/welcome/answer").buildWelcomeAnswer;
  log: (line: string) => void;
}
```
1. `const r = resolveScope(row); if (!r) return null;`
2. `const dossier = await deps.assembleDossier(r.zip); if (!dossier) return null;`
3. `const answer = await deps.buildWelcomeAnswer({ dossier, explicitZip: r.explicitZip, place })`
4. `if (!answer) return null;` → `let cards = answer.metrics`
5. **Topic filter** (this lane owns topic→card; HERO_CARDS keys = `home_value`/`rent`/`flood_aal`):
   - `'flood'` → `flood_aal`; `'price'|'prices'|'value'|'home'` → `home_value`; `'rent'|'rents'` → `rent`.
   - Known topic → keep matching card(s). **Unknown topic** (e.g. `'permits'` — no card yet) → keep ALL
     geography-scoped cards (never empty-out the send).
6. Return `{ cards, scope_kind: row.scope_kind!, scope_value: row.scope_value!, topic: row.topic ?? null }`.

## Correctness flags

- Cards come ONLY from `buildWelcomeAnswer` — already cited + gated + grain-consistent. Do not add a second
  source, do not regex prose, do not recompute.
- An empty `cards` after a *known* topic filter that matched nothing → fall back to all cards (geography still
  narrows it), never send a blank body.

## Done when

- `resolveScope` covers zip/place/county/out-of-scope; `assembleScopedContent` returns gated cards or `null`.
- Topic filter maps correctly; unknown topic keeps all cards. `tsc`/eslint clean. (Tests in step-04.)
