# Step 04 — Tests (Sonnet)

**Check:** `email_scoped_content` · **Owner:** Sonnet · **Risk:** low

New `lib/email/__tests__/scoped-content.test.ts` (pure — inject all deps, no DB/network):

1. **`resolveScope`**
   - `scope_kind='zip', scope_value='33904'` → `{ zip:'33904', explicitZip:true }`.
   - `scope_kind='place', scope_value='cape coral'` → resolves to its representative ZIP, `explicitZip:false`.
   - `scope_kind='county', scope_value='lee'` → coarse, `explicitZip:false`.
   - out-of-scope ZIP (not in `fixtures/swfl-zip-county.json`) → `null`.
2. **Topic filter** — `'flood'` keeps only the flood card; `'prices'` only home_value; `'rent'` only rent;
   unknown `'permits'` keeps ALL cards (never empty).
3. **Fact assembly** — stubbed `assembleDossier`+`buildWelcomeAnswer` → cards carry `source` + the assembly
   never injects a number absent from the stub (no-invention assertion).
4. **Regression (load-bearing)** — a `scope_kind=null && topic=null` row through `buildContent` yields the
   **identical** `{subject, body}` as the pre-change global path (snapshot/equality test).
5. **Fallback** — `assembleScopedContent` returning `null` → `buildContent` returns the global digest.

Gates: `bun test lib/email/...` green; `tsc` (touched files) clean; `eslint` clean.
