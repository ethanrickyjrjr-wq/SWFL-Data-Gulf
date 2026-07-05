# Address Spine (Build 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 8 files, keywords: refactor, schema, architecture

**Goal:** A build that carries an address gets up to 6 nearby SOLD comps as cited figures in the builder's one data feed — inherited automatically by authorDoc, buildContentDoc, the social calendar root, and every scheduled occurrence — per `docs/superpowers/specs/2026-07-05-address-spine-design.md`.

**Architecture:** Extract `compHelper`'s post-parse core into `compsForAddress()` (pure refactor). A new `lib/email/address-context.ts` converts its `CompResult` into `MarketFigure[]`. `BuildScope` gains an `address` enrichment field and `fetchLakeParts` merges the address figures into the feed. The address rides into scope from the hero (`addr=` param → grid shell scope) and from a listing project's `subject_address`.

**Tech Stack:** bun:test with the existing comp-helper DI seams; no new dependencies, no schema change in this build (occurrence-freeze decision is a probe step with a named fallback).

## Global Constraints

- **No subject-property value estimate ever** — comps are neighbors' recorded sales; the subject gets no AVM figure. (Spec hard line.)
- **Vendor never surfaced:** the strings "SteadyAPI", any MLS/property id, must not appear in any figure label/source. Comp sources read "SWFL Data Gulf · realtor.com". Price kind must be honest: a recorded sale is "sold", an AVM is "estimate", a last list price is "last list" — the label wording must never call an estimate a sale.
- **Empty-tolerant everywhere:** no address / geocode miss / out-of-footprint / vendor failure → `[]`, build proceeds exactly as today. ≤3 vendor calls per build (inherited compHelper cap: 1 nearby + ≤2 enrichments).
- `compHelper` chat behavior must remain byte-identical — its existing tests are the regression wall.
- Verify with `bunx next build`. Stage explicit paths only. SESSION_LOG before push; push only on explicit operator approval (`OPERATOR_APPROVED_PUSH=1 node scripts/safe-push.mjs`), never compounded with a commit. `address_spine_live_verify` is operator-closed.
- Live paid-API spend: the ONE allowed live probe is the final dev-server flow check (≤3 SteadyAPI calls + 1 Mapbox session, mirroring build 1's verification). Everything else runs on injected deps.

## File Structure

- Modify `lib/assistant/comp-helper.ts` — extract `compsForAddress(address, deps)`; `compHelper` delegates.
- Create `lib/email/address-context.ts` + `lib/email/address-context.test.ts` — `loadAddressFigures(address, deps?) → MarketFigure[]`.
- Modify `lib/email/build-doc.ts:73-105` — `BuildScope.address?: string`; merge address figures in `fetchLakeParts`.
- Modify `lib/campaigns.ts` + `lib/campaigns.test.ts` — `heroDestination` carries `addr=` for `input:"address"` chips.
- Modify `app/email-lab/grid/page.tsx` + `app/email-lab/grid/EmailLabGridClient.tsx` — thread `?zip=`/`?addr=` into the shell's `scope` prop (fixes the known anonymous-grid empty-scope gap too).
- Modify the project email tab page (locate: `Grep pattern="EmailLabGridShell" path=app/project --output files` — expected `app/project/[id]/email-lab/page.tsx`) — add `address: <project>.subject_address ?? undefined` to the scope it already passes.

---

### Task 1: Extract `compsForAddress` from `compHelper`

**Files:**
- Modify: `lib/assistant/comp-helper.ts:198-300`
- Test: existing comp-helper test file (locate: `Glob lib/assistant/*comp*test*`) — no new tests; the wall is that ALL existing tests pass unchanged.

**Interfaces:**
- Produces: `export async function compsForAddress(address: string, deps?: CompDeps): Promise<CompResult>` — geocode → Lee/Collier gate → nearby sold → ≤2 sale enrichments. Same `CompResult` shape. `compHelper` delegates to it after its gate/extraction/confirm branches.

- [ ] **Step 1: Move the core.** In `compHelper` (comp-helper.ts:198), everything from `const geocode = deps.geocode ?? geocodeAddress;` (line ~228) through the function's final `return done(...)` moves verbatim into the new export placed directly above `compHelper`:

```ts
/**
 * The address-first core of the comp path (shared by chat AND the email builder):
 * geocode → Lee/Collier gate → nearby sold comps → ≤2 exact-sale enrichments.
 * Hard cap ≤3 vendor calls. Same DI seams as compHelper; never throws.
 */
export async function compsForAddress(address: string, deps: CompDeps = {}): Promise<CompResult> {
  const now = deps.now ?? new Date();
  const asOf = fmtMDY(now);
  const done = (comps: RenderComp[], needs: string[], matchedAddress?: string): CompResult => ({
    comps,
    asOf,
    needs,
    ...(matchedAddress ? { matchedAddress } : {}),
  });
  // …moved body: geocode/gate/fetchNearby/enrich/map — verbatim from compHelper…
}
```

`compHelper` keeps: its own `now/asOf/done` header, the `looksLikeCompAsk` no-op branch, the no-address branches (projectAddress confirm + cold ask), then ends with:

```ts
  return compsForAddress(address, deps);
```

Nothing else in the file changes. (The moved body already only references `deps`, `geo`, local helpers — it is self-contained; if a moved line references `question`, that's a move error: only the extraction branches reference `question`.)

- [ ] **Step 2: Run the existing comp-helper tests**

Run: `bun test lib/assistant` (narrow to the comp test file the Glob finds)
Expected: ALL PASS, zero modified tests.

- [ ] **Step 3: Commit**

```bash
git add lib/assistant/comp-helper.ts
git commit -m "refactor(comps): extract compsForAddress core — chat behavior byte-identical (address-spine T1)"
```

---

### Task 2: `lib/email/address-context.ts` — comps as cited figures

**Files:**
- Create: `lib/email/address-context.ts`
- Test: `lib/email/address-context.test.ts`

**Interfaces:**
- Consumes: `compsForAddress`, `CompDeps`, `CompResult`, `RenderComp` from `@/lib/assistant/comp-helper`; `MarketFigure` from `@/lib/email/market-context`.
- Produces: `export async function loadAddressFigures(address: string | null | undefined, deps?: CompDeps): Promise<MarketFigure[]>`.

- [ ] **Step 1: Write the failing tests** — `lib/email/address-context.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { loadAddressFigures } from "./address-context";
import type { CompDeps } from "@/lib/assistant/comp-helper";

const NOW = new Date("2026-07-05T12:00:00Z");

/** Deps that yield two comps: one enriched recorded sale, one estimate. */
const happyDeps: CompDeps = {
  now: NOW,
  geocode: async () => ({
    lat: 26.56,
    lon: -81.95,
    matchedAddress: "123 Main St, Cape Coral",
    zip: "33904",
    county: "Lee",
    countyFips: "12071",
  }),
  fetchNearby: async () => [
    {
      propertyId: "p1",
      addressLine: "125 Main St",
      city: "Cape Coral",
      beds: 3,
      baths: 2,
      sqft: 1800,
      status: "sold",
      lastListPrice: 450000,
      avm: null,
      avmDate: null,
    },
    {
      propertyId: "p2",
      addressLine: "130 Main St",
      city: "Cape Coral",
      beds: 4,
      baths: 3,
      sqft: 2200,
      status: "sold",
      lastListPrice: null,
      avm: 512000,
      avmDate: "2026-06-01",
    },
  ] as never,
  fetchSold: async (pid: string) =>
    pid === "p1" ? ({ price: 462500, soldDate: "2026-05-20" } as never) : null,
};

describe("loadAddressFigures", () => {
  test("comps become cited figures — sold enrichment first, honest price kinds", async () => {
    const figs = await loadAddressFigures("123 Main St, Cape Coral", happyDeps);
    expect(figs.length).toBe(2);
    const sold = figs.find((f) => f.label.includes("125 Main St"))!;
    expect(sold.value).toBe("$462,500");
    expect(sold.label.toLowerCase()).toContain("sold");
    expect(sold.as_of).toBe("05/20/2026");
    expect(sold.source).toBe("SWFL Data Gulf · realtor.com");
    const est = figs.find((f) => f.label.includes("130 Main St"))!;
    expect(est.label.toLowerCase()).toContain("estimate");
    expect(est.label.toLowerCase()).not.toContain("sold for");
  });

  test("never surfaces the vendor or a property id", async () => {
    const figs = await loadAddressFigures("123 Main St, Cape Coral", happyDeps);
    const blob = JSON.stringify(figs).toLowerCase();
    expect(blob).not.toContain("steady");
    expect(blob).not.toContain("p1");
  });

  test("empty-tolerant: no address / geocode miss / vendor error → []", async () => {
    expect(await loadAddressFigures(null, happyDeps)).toEqual([]);
    expect(await loadAddressFigures("", happyDeps)).toEqual([]);
    expect(
      await loadAddressFigures("nowhere", { ...happyDeps, geocode: async () => null }),
    ).toEqual([]);
    expect(
      await loadAddressFigures("123 Main St", {
        ...happyDeps,
        fetchNearby: async () => {
          throw new Error("down");
        },
      }),
    ).toEqual([]);
  });
});
```

(Before finalizing the mock rows, open `lib/listings/steadyapi.ts` and mirror the REAL `NearbyComp` field names — the `as never` casts above are placeholders for whatever the true shape is; use the real fields and drop the casts if they line up.)

- [ ] **Step 2: Run to verify failure** — `bun test lib/email/address-context.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `lib/email/address-context.ts`:

```ts
// lib/email/address-context.ts — the address spine's email-side adapter (spec:
// 2026-07-05-address-spine-design.md). Converts the chat comp engine's result
// into cited MarketFigures for the builder's ONE data feed (fetchLakeParts), so
// authorDoc/buildContentDoc/social-calendar/scheduled occurrences all inherit
// nearby sold comps when a build carries an address. Hard lines: honest price
// kinds (a recorded sale is "sold", an AVM is an "estimate", a last list is a
// "last list" — never conflated); vendor + ids never surfaced; empty-tolerant
// (any failure → [], the build proceeds); no subject-property value estimate.
import { compsForAddress, type CompDeps, type RenderComp } from "@/lib/assistant/comp-helper";
import type { MarketFigure } from "@/lib/email/market-context";

const COMP_SOURCE = "SWFL Data Gulf · realtor.com";

const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function kindWording(c: RenderComp): string {
  if (c.priceKind === "sold") return "sold";
  if (c.priceKind === "estimate") return "current value estimate";
  return "last list price";
}

function specBits(c: RenderComp): string {
  const bits: string[] = [];
  if (c.beds != null) bits.push(`${c.beds}bd`);
  if (c.baths != null) bits.push(`${c.baths}ba`);
  if (c.sqft != null) bits.push(`${c.sqft.toLocaleString("en-US")} sqft`);
  return bits.length ? ` (${bits.join("/")})` : "";
}

/** "2026-05-20" → "05/20/2026"; null-safe. */
function isoToMDY(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : undefined;
}

/**
 * Nearby sold comps for a subject address, as cited figures. Empty-tolerant:
 * missing address, geocode miss, out-of-footprint, or any vendor failure → [].
 */
export async function loadAddressFigures(
  address: string | null | undefined,
  deps: CompDeps = {},
): Promise<MarketFigure[]> {
  const subject = String(address ?? "").trim();
  if (!subject) return [];
  try {
    const result = await compsForAddress(subject, deps);
    return result.comps.flatMap((c, i) => {
      if (c.price == null) return [];
      return [
        {
          key: `comp_${i + 1}`,
          label: `Nearby comp — ${c.addressLine}, ${c.city}${specBits(c)} — ${kindWording(c)}`,
          value: usd(c.price),
          source: COMP_SOURCE,
          as_of: isoToMDY(c.priceDate) ?? result.asOf,
        },
      ];
    });
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run to verify pass** — `bun test lib/email/address-context.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/address-context.ts lib/email/address-context.test.ts
git commit -m "feat(email): loadAddressFigures — nearby sold comps as cited figures, honest price kinds (address-spine T2)"
```

---

### Task 3: `BuildScope.address` + the feed merge

**Files:**
- Modify: `lib/email/build-doc.ts:73-105`

**Interfaces:**
- Produces: `BuildScope` gains `address?: string`; `fetchLakeParts` returns address comp figures merged after the lifecycle figure. Everything downstream (authorDoc, buildContentDoc, social calendar, scheduled occurrence rebuilds) inherits with no further change.

- [ ] **Step 1: Extend the type and the feed** — in `lib/email/build-doc.ts`:

```ts
export interface BuildScope {
  kind?: string;
  value?: string;
  /** Subject listing address (address spine, build 2): when present, the feed
   *  additionally carries nearby sold comps as cited figures. Enrichment only —
   *  kind/value stay the area scope; nothing branches on it besides the feed. */
  address?: string;
}
```

And in `fetchLakeParts` (build-doc.ts:95-105), add the fourth parallel pull:

```ts
export async function fetchLakeParts(
  scope?: BuildScope,
): Promise<{ figures: MarketFigure[]; dossier: string }> {
  const [marketFigures, lifecycleFigure, dossier, addressFigures] = await Promise.all([
    loadMarketFigures(scope).catch(() => []),
    loadLifecycleDigest(scope).catch(() => null),
    fetchMasterDossier(scope).catch(() => ""),
    loadAddressFigures(scope?.address).catch(() => []),
  ]);
  const figures = [
    ...marketFigures,
    ...(lifecycleFigure ? [lifecycleFigure] : []),
    ...addressFigures,
  ];
  return { figures, dossier };
}
```

Import at the top: `import { loadAddressFigures } from "@/lib/email/address-context";`

- [ ] **Step 2: Regression sweep** — `bun test lib/email 2>&1 | tail -4` → all pass (zip-seed, author-doc, build-doc-adjacent suites unchanged: no address in their scopes → `loadAddressFigures` returns `[]` before any fetch).

- [ ] **Step 3: Commit**

```bash
git add lib/email/build-doc.ts
git commit -m "feat(build): BuildScope.address — address comps ride the ONE lake feed, occurrences inherit free (address-spine T3)"
```

---

### Task 4: Carry the address — hero param + anonymous grid scope

**Files:**
- Modify: `lib/campaigns.ts` (heroDestination), `lib/campaigns.test.ts`
- Modify: `app/email-lab/grid/page.tsx`, `app/email-lab/grid/EmailLabGridClient.tsx`
- Reference: `components/email-lab/EmailLabGridShell.tsx:185` (`scope?: { kind?: string; value?: string }` prop — widen its inline type with `address?: string` if TS complains; the shell forwards it verbatim).

**Interfaces:**
- `heroDestination` adds `addr=<filled>` for entries with `input === "address"`.
- `EmailLabGridClient` gains props `zip?: string | null; addr?: string | null` and passes `scope={{ kind: "zip", value: zip, address: addr ?? undefined }}` (only when `zip` present) to the shell — closing the known anonymous-grid empty-scope gap for hero arrivals.

- [ ] **Step 1: Failing test** — append to the `heroDestination` describe in `lib/campaigns.test.ts`:

```ts
  it("listing chips carry addr= for the address spine; market-update does not", () => {
    const listing = HERO_CAMPAIGNS[0];
    const url = heroDestination(listing, { filled: "123 Main St, Cape Coral", zip: "33904" });
    expect(new URLSearchParams(url.split("?")[1]).get("addr")).toBe("123 Main St, Cape Coral");
    const area = HERO_CAMPAIGNS[3];
    const areaUrl = heroDestination(area, { filled: "Cape Coral", zip: null });
    expect(new URLSearchParams(areaUrl.split("?")[1]).get("addr")).toBeNull();
  });
```

- [ ] **Step 2: Verify fail** — `bun test lib/campaigns.test.ts` → the new test fails.

- [ ] **Step 3: Implement.** In `heroDestination` (lib/campaigns.ts), after the `zip` line:

```ts
  if (opts.zip) params.set("zip", opts.zip);
  if (entry.input === "address") params.set("addr", opts.filled);
```

In `app/email-lab/grid/page.tsx`: parse `const addr = (sp.addr ?? "").trim() || null;` beside `zip`, and pass `<EmailLabGridClient seedDoc={seedDoc} zip={zip} addr={addr} />`. (The signed-in `labDestination`/`AutoCreateProject` carry is deferred with Task 6's decision — anonymous-first, same as build 1.)

In `app/email-lab/grid/EmailLabGridClient.tsx`:

```tsx
export function EmailLabGridClient({
  seedDoc,
  zip,
  addr,
}: {
  seedDoc?: EmailDoc | null;
  zip?: string | null;
  addr?: string | null;
}) {
```

and on the shell:

```tsx
    <EmailLabGridShell
      initialDoc={initialDoc}
      initialRecipe={initialRecipe}
      scope={zip ? { kind: "zip", value: zip, address: addr ?? undefined } : undefined}
```

Widen the shell's `scope` prop type (EmailLabGridShell.tsx:185) to `{ kind?: string; value?: string; address?: string }` — or import `BuildScope` if that stays client-safe (build-doc.ts is server-heavy: keep the inline widening).

- [ ] **Step 4: Verify** — `bun test lib/campaigns.test.ts` → PASS; `bunx next build 2>&1 | tail -5` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib/campaigns.ts lib/campaigns.test.ts app/email-lab/grid/page.tsx app/email-lab/grid/EmailLabGridClient.tsx components/email-lab/EmailLabGridShell.tsx
git commit -m "feat(hero+lab): addr= rides the hero handoff into the grid scope — anonymous scope gap closed (address-spine T4)"
```

---

### Task 5: Listing projects — builders read `subject_address`

**Files:**
- Modify: the project email tab page — locate with `Grep pattern="EmailLabGridShell" path=app/project output=files_with_matches` (expected: `app/project/[id]/email-lab/page.tsx` or the tab component it renders).

- [ ] **Step 1: Probe.** Open the located file; find where it builds the `scope` prop it passes to the shell (it does today — the audit confirmed in-project builds are scoped). Confirm the project row fetch already selects `subject_address` (it exists on `projects` — `app/api/projects/route.ts:43-56` writes it); add it to the select if absent.

- [ ] **Step 2: Edit.** Extend that scope construction with:

```ts
  address: (project as { subject_address?: string | null }).subject_address ?? undefined,
```

(using the page's real project variable and typing convention — prefer the typed row over a cast if the generated types already carry the column).

- [ ] **Step 3: Verify** — `bunx next build 2>&1 | tail -5` → clean.

- [ ] **Step 4: Commit**

```bash
git add <the file(s) actually touched>
git commit -m "feat(project): listing project's subject_address rides the email-tab build scope (address-spine T5)"
```

---

### Task 6: Occurrence freeze — probe, decide, never guess

- [ ] **Step 1: Probe the schema + save path.** `Grep pattern="scope_address" path=lib --output files` (expect none), then open `lib/deliverable/schedule-recipe.ts:60-80` (the EmailDoc lane's `ParsedCommand` assembly) and the deliverable-save route (`Grep pattern="scope_kind" path=app/api --output files`) to answer ONE question: does the frozen EmailDoc occurrence lane rebuild from a `deliverables` row that could carry the address without a new DB column (e.g. an existing JSON scope/meta column), and does the occurrence path (`scripts/email/run-schedules.mts` buildEmailDocOccurrence) already re-load the owning project?

- [ ] **Step 2: Decide by the spec's rule.**
  - If an existing JSON column or a project join carries it: wire `scope.address` through that existing seam (small edit, show the diff in the commit), and extend `schedule-signature.ts` ONLY if the address becomes part of the recipe identity (default: it does not — the deliverable id already pins the doc).
  - If it needs a NEW `deliverables`/`email_schedules` column: STOP — do not migrate in this build. Open the follow-up instead:

```bash
node scripts/check.mjs open address-spine scope_address_occurrence_freeze "Freeze scope_address for EmailDoc schedule occurrences (needs column decision)"
```

  In-project scheduled listing emails still refresh comps via Task 5 (the project-tab scope carries the address at build time; the occurrence lane re-runs buildContentDoc with the frozen scope it was saved with).

- [ ] **Step 3: Commit** whatever landed (edit or check-open note in SESSION_LOG at Task 7).

---

### Task 7: Wrap-up — live check, session log, STOP

- [ ] **Step 1: Full gates.** `bun test lib/email lib/assistant lib/campaigns.test.ts 2>&1 | tail -4` → green; `bunx next build 2>&1 | tail -5` → clean.

- [ ] **Step 2: ONE live flow check** (the allowed spend): with the dev server (reuse a running one on :3000 if present — do NOT kill it), hit the hero flow URL for a real Lee/Collier street with the New Listing chip → confirm the grid's AI build (one quality-mode call) can surface a "Nearby comp —" figure in its sources/figure menu. If no dev AI key, verify instead by calling `fetchLakeParts({ kind: "zip", value: "<zip>", address: "<street>" })` via a scratchpad bun script printing figure labels (≤3 vendor calls, zero LLM spend).

- [ ] **Step 3: SESSION_LOG entry** (top): what shipped per task, the Task 6 decision (wired vs deferred + check key), live-check evidence line, `address_spine_live_verify` stays open.

- [ ] **Step 4: Commit the log, run `git log origin/main..HEAD --oneline` (name any foreign commits), then STOP and ask the operator before any push.**

---

## Self-Review (done at write time)

- **Spec coverage:** mechanism 1→T1, 2→T2, 3→T3, 4a→T4, 4b→T5, 5→T6 (probe+rule, never guess); hard lines are Global Constraints + T2 tests (vendor string, price-kind honesty, empty tolerance); success criteria land in T7.
- **Placeholders:** T1 is a verbatim MOVE with named boundaries (safer than retyped code); T2's mock rows carry an explicit mirror-the-real-shape instruction; T5/T6 are probe-first tasks with exact grep patterns and a decision rule — no "TBD".
- **Type consistency:** `CompDeps`/`CompResult`/`RenderComp` (T1) match T2's imports; `MarketFigure` fields match market-context.ts:18-24; `BuildScope.address` (T3) matches T4/T5's scope construction; `loadAddressFigures(address, deps?)` signature consistent across T2/T3.
