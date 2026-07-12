# Email Link Destinations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 12 tasks, 24 files, 2 conflict groups, keywords: schema, architecture

**Goal:** Capture realtor.com listing permalinks from SteadyAPI responses, flip listing-email comps from scraped actives to linked sold comps, add a post-build link audit with a popup ask, and a send-time fallback ladder so no email ever ships a dead click-promising element.

**Architecture:** Permalinks are CAPTURED at the SteadyAPI normalizers (never constructed) and ride existing fields (`Listing.listingUrl`, new `NearbyComp.sourceUrl` → `RenderComp.sourceUrl`). Pure builders turn sold comps into a chart spec + a linked `list` block used by both the pasted-URL flyer lane and the address-spine lane. A pure `link-audit` module (audit + fallback ladder) is wired into the blast/claim-and-send/scheduled-occurrence send paths and a lab modal.

**Tech Stack:** TypeScript, Next.js App Router, bun:test, zod schemas (`lib/email/doc/schema.ts`), react-email blocks.

**Spec:** `docs/superpowers/specs/2026-07-12-email-link-destinations-design.md`

## Global Constraints

- URLs are CAPTURE-ONLY. Never build a URL from an address or id — a constructed URL is an invented fact. The only permalink canonicalization allowed is prefixing a bare SteadyAPI slug with `https://www.realtor.com/realestateandhomes-detail/` (the base observed verbatim in the same API's full-URL responses).
- The AI model NEVER writes a URL. Do not add any link field to `ContentPatchSchema` / authored schemas' allowed keys. All link writes are engine or user writes.
- Citations stay domain-level: "SWFL Data Gulf · realtor.com" with `https://www.realtor.com` — never a listing permalink, never an MLS number, never the string "SteadyAPI".
- Dates in user-visible copy are MM/DD/YYYY. `ChartSpec.asOf` stays ISO (`YYYY-MM-DD`) — the chart renderer formats it.
- `compsForAddress` keeps its hard cap: ≤3 SteadyAPI calls per build (1 nearby + ≤2 sold enrichments). Never call it twice in one build.
- Everything is empty-tolerant: a vendor failure, geocode miss, or missing permalink degrades to fewer links/blocks — a build or send is never blocked (the fallback ladder is the send floor).
- Tests: bun:test (`import { describe, it, expect } from "bun:test"`). Verify builds with `bunx next build`, never `npx tsc`.
- Commit after every task with explicit paths (`git add <paths>`). NEVER `git add -A`. Do NOT push — pushing is operator-approved separately.
- Windows repo: file paths in commands use forward slashes; the Bash tool runs POSIX sh.

---

### Task 1: `canonicalRealtorUrl` — the one permalink canonicalizer

**Files:**
- 🔴 Modify: `lib/listings/steadyapi.ts` (add near the top, after the `HEADERS` const around line 30)
- 🔴 Test: `lib/listings/steadyapi-comps.test.ts` (append a new `describe`)

**Interfaces:**
- Produces: `canonicalRealtorUrl(permalink: unknown): string | undefined` — exported from `lib/listings/steadyapi.ts`. Tasks 2–3 call it.

- [ ] **Step 1: Write the failing tests**

Append to `lib/listings/steadyapi-comps.test.ts`:

```ts
import { canonicalRealtorUrl } from "./steadyapi";

describe("canonicalRealtorUrl", () => {
  it("passes a full realtor.com detail URL through verbatim", () => {
    const u =
      "https://www.realtor.com/realestateandhomes-detail/5604-Creekmore-Dr_Oklahoma-City_OK_73179_M77577-41161";
    expect(canonicalRealtorUrl(u)).toBe(u);
  });

  it("promotes a bare slug to the canonical detail URL", () => {
    expect(canonicalRealtorUrl("765-Geary-St_San-Francisco_CA_94109_M24733-64190")).toBe(
      "https://www.realtor.com/realestateandhomes-detail/765-Geary-St_San-Francisco_CA_94109_M24733-64190",
    );
  });

  it("refuses anything else — no minted URLs", () => {
    expect(canonicalRealtorUrl("")).toBeUndefined();
    expect(canonicalRealtorUrl(undefined)).toBeUndefined();
    expect(canonicalRealtorUrl(42)).toBeUndefined();
    expect(canonicalRealtorUrl("https://example.com/whatever")).toBeUndefined();
    expect(canonicalRealtorUrl("two/segments_M1-2")).toBeUndefined();
    expect(canonicalRealtorUrl("has spaces_M1-2")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/listings/steadyapi-comps.test.ts`
Expected: FAIL — `canonicalRealtorUrl` is not exported.

- [ ] **Step 3: Implement**

Add to `lib/listings/steadyapi.ts` (top-level, after the `HEADERS` const):

```ts
/** realtor.com detail-page base, observed VERBATIM in SteadyAPI /search responses
 *  (docs.steadyapi.com, verified 07/11/2026). Used ONLY to promote a bare slug the
 *  same API returns on the nearby lanes — never to mint a URL from an address. */
const RDC_DETAIL_BASE = "https://www.realtor.com/realestateandhomes-detail/";

/** Canonicalize a SteadyAPI `permalink` into a realtor.com detail URL, or undefined.
 *  Accepts exactly two shapes: the full detail URL (verbatim pass-through) and the
 *  bare slug (one path segment, e.g. "765-Geary-St_San-Francisco_CA_94109_M24733-64190").
 *  Anything else — other hosts, other paths, junk — is refused (capture-only moat). */
export function canonicalRealtorUrl(permalink: unknown): string | undefined {
  if (typeof permalink !== "string") return undefined;
  const p = permalink.trim();
  if (!p) return undefined;
  if (p.startsWith(RDC_DETAIL_BASE) && p.length > RDC_DETAIL_BASE.length) return p;
  if (/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(p)) return RDC_DETAIL_BASE + p;
  return undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/listings/steadyapi-comps.test.ts`
Expected: PASS (all existing tests in the file must stay green too).

- [ ] **Step 5: Commit**

```bash
git add lib/listings/steadyapi.ts lib/listings/steadyapi-comps.test.ts
git commit -m "feat(listings): canonicalRealtorUrl — capture-only permalink canonicalizer" -- lib/listings/steadyapi.ts lib/listings/steadyapi-comps.test.ts
```

---

### Task 2: Search lane keeps the permalink on `Listing.listingUrl`

**Files:**
- 🔴 Modify: `lib/listings/steadyapi.ts` — `normalizeResult` (around lines 60–145)
- Modify: `lib/listings/rentcast.ts:40-43` (comment only)
- Test: `lib/listings/steadyapi.test.ts` if it exists, else append to `lib/listings/steadyapi-comps.test.ts`

**Interfaces:**
- Consumes: `canonicalRealtorUrl` (Task 1).
- Produces: `normalizeResult(...)` now sets `Listing.listingUrl?: string` (the field ALREADY exists on the `Listing` interface in `lib/listings/rentcast.ts:43` with verbatim-URL semantics — do NOT add a new field). `lib/listings/artifact-link.ts` `resolveArtifactLink` already reads `listingUrl` — it starts working for SteadyAPI-sourced listings with zero changes there.

- [ ] **Step 1: Write the failing test**

```ts
import { normalizeResult } from "./steadyapi";

describe("normalizeResult permalink capture", () => {
  const base = {
    property_id: "1234567890",
    price: { amount: 500000 },
    photo_url: "https://cdn.example.com/p.jpg",
  };

  it("carries a slug permalink as the canonical listingUrl", () => {
    const l = normalizeResult(
      { ...base, permalink: "1403-NE-19th-Ter_Cape-Coral_FL_33909_M54931-01642" },
      "Cape Coral",
      "FL",
    );
    expect(l?.listingUrl).toBe(
      "https://www.realtor.com/realestateandhomes-detail/1403-NE-19th-Ter_Cape-Coral_FL_33909_M54931-01642",
    );
  });

  it("leaves listingUrl unset when there is no usable permalink", () => {
    const l = normalizeResult({ ...base, permalink: "" }, "Cape Coral", "FL");
    expect(l?.listingUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/listings/steadyapi-comps.test.ts`
Expected: FAIL — `listingUrl` is undefined in the first case.

- [ ] **Step 3: Implement**

In `normalizeResult` (`lib/listings/steadyapi.ts`), after the existing `const permalink = ...` line (~82), add:

```ts
  const listingUrl = canonicalRealtorUrl(permalink);
```

and in the returned object (after `photoUrl,` at ~143):

```ts
    ...(listingUrl ? { listingUrl } : {}),
```

In `lib/listings/rentcast.ts` update the `listingUrl` doc comment (lines 40–42) to:

```ts
  /** Listing page URL, VERBATIM as captured (broker-site feed, or the realtor.com
   *  detail permalink captured from the SteadyAPI response — operator unlock
   *  07/11/2026). Never constructed from an id (handoff §2.3 — minted URLs 404).
   *  The artifact-link resolver treats absence as "no link". */
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/listings/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/listings/steadyapi.ts lib/listings/steadyapi-comps.test.ts lib/listings/rentcast.ts
git commit -m "feat(listings): search lane captures the realtor.com permalink onto Listing.listingUrl" -- lib/listings/steadyapi.ts lib/listings/steadyapi-comps.test.ts lib/listings/rentcast.ts
```

---

### Task 3: Comp lane carries `NearbyComp.sourceUrl`

**Files:**
- 🔴 Modify: `lib/listings/steadyapi.ts` — `NearbyComp` interface (~line 230), `normalizeNearbyComp` (~line 251), and the scrub comment (~line 226)
- 🔴 Test: `lib/listings/steadyapi-comps.test.ts`

**Interfaces:**
- Consumes: `canonicalRealtorUrl` (Task 1).
- Produces: `NearbyComp.sourceUrl: string | null` — Task 4 maps it onto `RenderComp`.

- [ ] **Step 1: Write the failing test**

Find the existing `normalizeNearbyComp` tests in `lib/listings/steadyapi-comps.test.ts` and add beside them:

```ts
  it("carries the captured permalink as sourceUrl, canonicalized", () => {
    const c = normalizeNearbyComp({
      property_id: "999",
      status: "sold",
      address: { line: "424 28th St", city: "San Francisco", state_code: "CA", postal_code: "94131" },
      permalink: "424-28th-St_San-Francisco_CA_94131_M18748-28523",
    });
    expect(c?.sourceUrl).toBe(
      "https://www.realtor.com/realestateandhomes-detail/424-28th-St_San-Francisco_CA_94131_M18748-28523",
    );
  });

  it("sourceUrl is null when the response has no permalink", () => {
    const c = normalizeNearbyComp({
      property_id: "999",
      address: { line: "424 28th St" },
    });
    expect(c?.sourceUrl).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/listings/steadyapi-comps.test.ts`
Expected: FAIL — `sourceUrl` does not exist on `NearbyComp`.

- [ ] **Step 3: Implement**

In `lib/listings/steadyapi.ts`:

1. Rewrite the scrub comment above `NearbyComp` (~line 226) to:

```ts
/** A nearby comparable. MLS ids stay scrubbed at this boundary: `listing_id` and
 *  `source.id` are dropped and never placed on this object; `propertyId` survives
 *  ONLY as the internal +1 sold-event join key — the render layer never emits it.
 *  `permalink` is CARRIED (canonicalized) as `sourceUrl` since the 07/11/2026
 *  operator unlock: it is the comp's functional click-through link. Citations are
 *  unaffected — they stay domain-level ("SWFL Data Gulf · realtor.com"). */
```

2. Add to the `NearbyComp` interface (after `estimateDate`):

```ts
  /** Captured realtor.com detail URL (canonicalized permalink), or null. A
   *  functional link destination — never a citation, never surfaced as an id. */
  sourceUrl: string | null;
```

3. In `normalizeNearbyComp`'s returned object (after `estimateDate: ...`):

```ts
    sourceUrl: canonicalRealtorUrl(raw.permalink) ?? null,
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/listings/`
Expected: PASS, including every pre-existing scrub assertion (`listing_id`/`href`/`source.id` still never present).

- [ ] **Step 5: Commit**

```bash
git add lib/listings/steadyapi.ts lib/listings/steadyapi-comps.test.ts
git commit -m "feat(listings): comp lane carries captured permalink as NearbyComp.sourceUrl" -- lib/listings/steadyapi.ts lib/listings/steadyapi-comps.test.ts
```

---

### Task 4: `RenderComp.sourceUrl` through the comp core

**Files:**
- Modify: `lib/assistant/comp-helper.ts` — `RenderComp` interface (~line 32) and BOTH `RenderComp` mapping sites: `compsForAddress` (~line 257) and the second mapping inside `compHelper` (grep `priceKind` below line 300; if `compHelper` delegates to `compsForAddress`, there is only one)
- Test: `lib/assistant/comp-helper.test.ts`

**Interfaces:**
- Consumes: `NearbyComp.sourceUrl` (Task 3).
- Produces: `RenderComp.sourceUrl: string | null` — Tasks 6–8 read it. The chat prose renderer and `compSources` MUST NOT change (domain-only citations stand).

- [ ] **Step 1: Write the failing test**

`lib/assistant/comp-helper.test.ts` already builds fake `NearbyComp[]` via injected `fetchNearby`. Locate one existing `compsForAddress` test with injected deps, and add beside it (reusing the file's existing fake-geo/fake-fetch helpers):

```ts
  it("carries each comp's sourceUrl through to the RenderComp", async () => {
    const res = await compsForAddress("123 Main St, Cape Coral", {
      geocode: async () => ({ lat: 26.6, lon: -81.9, countyFips: "12071", matchedAddress: "123 Main St" }),
      fetchNearby: async () => [
        {
          addressLine: "125 Main St", city: "Cape Coral", state: "FL", zip: "33904",
          beds: 3, baths: 2, sqft: 1500, lotSqft: null, status: "sold",
          listPrice: 450000, estimateValue: null, estimateDate: null,
          propertyId: null,
          sourceUrl: "https://www.realtor.com/realestateandhomes-detail/125-Main-St_Cape-Coral_FL_33904_M11111-22222",
        },
      ],
      fetchSold: async () => null,
    });
    expect(res.comps[0]?.sourceUrl).toBe(
      "https://www.realtor.com/realestateandhomes-detail/125-Main-St_Cape-Coral_FL_33904_M11111-22222",
    );
  });
```

(Adjust the injected `GeocodedAddress` literal to the real shape in `lib/geo/geocode-address.ts` — copy the fields the file's existing tests inject.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/assistant/comp-helper.test.ts`
Expected: FAIL — `sourceUrl` missing on `RenderComp` (type error or undefined).

- [ ] **Step 3: Implement**

In `lib/assistant/comp-helper.ts`:

1. Add to `RenderComp` (after `priceDate`):

```ts
  /** Captured realtor.com detail URL for FUNCTIONAL links (email comp rows).
   *  Chat prose + compSources ignore it — citations stay domain-level. */
  sourceUrl: string | null;
```

2. In every `RenderComp` mapping (the `surfaced.map((c) => {...})` in `compsForAddress`, and its twin in `compHelper` if that function has its own), add to the returned object:

```ts
      sourceUrl: c.sourceUrl ?? null,
```

3. Confirm by grep that nothing in the chat render path prints `sourceUrl` (`grep -n "sourceUrl" lib/assistant/` should show only comp-helper's type + mappings and this task's test).

- [ ] **Step 4: Run tests**

Run: `bun test lib/assistant/`
Expected: PASS — including the existing prose/citation tests untouched.

- [ ] **Step 5: Commit**

```bash
git add lib/assistant/comp-helper.ts lib/assistant/comp-helper.test.ts
git commit -m "feat(assistant): RenderComp carries sourceUrl for functional email links" -- lib/assistant/comp-helper.ts lib/assistant/comp-helper.test.ts
```

---

### Task 5: `ListItem.linkUrl` — schema, type, renderer

**Files:**
- Modify: `lib/email/doc/types.ts:190-193` (`ListItem`)
- Modify: `lib/email/doc/schema.ts:151-154` (`ListItemSchema`) — do NOT touch `AuthoredListItemSchema` (~line 426) or any content-patch schema
- Modify: `lib/email/blocks/ListBlock.tsx`
- Test: `lib/email/doc/schema.test.ts`, `lib/email/blocks/` (follow the ink-guards test pattern if a ListBlock render test exists; else add assertions in `schema.test.ts` + a small render test beside `ink-guards.test.ts`)

**Interfaces:**
- Produces: `ListItem.linkUrl?: string` — round-trips through `EmailDocSchema`, is NOT writable by any AI patch, and renders as a trailing "View →" link.

- [ ] **Step 1: Write the failing tests**

In `lib/email/doc/schema.test.ts` (beside the existing round-trip tests):

```ts
  it("ListItem.linkUrl round-trips through EmailDocSchema", () => {
    const doc = {
      globalStyle: HOUSE_STYLE, // reuse the file's existing valid globalStyle fixture
      blocks: [
        {
          type: "list",
          props: {
            title: "Recent sales nearby",
            items: [{ lead: "$450,000 · 05/20/2026", text: "125 Main St, Cape Coral", linkUrl: "https://www.realtor.com/realestateandhomes-detail/x_M1-2" }],
          },
        },
      ],
    };
    const parsed = EmailDocSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    const item = (parsed.data!.blocks[0] as { props: { items: { linkUrl?: string }[] } }).props.items[0];
    expect(item.linkUrl).toBe("https://www.realtor.com/realestateandhomes-detail/x_M1-2");
  });
```

New render test `lib/email/blocks/list-link.test.ts` (mirror the imports/pattern of `ink-guards.test.ts` — `render` from `@react-email/components`, `createElement`, a `HOUSE` globalStyle):

```ts
import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { render } from "@react-email/components";
import { ListBlock } from "./ListBlock";

const HOUSE = {
  primaryColor: "#0f1d24", accentColor: "#3DC9C0", fontFamily: "MODERN_SANS",
  textColor: "#242424", backdropColor: "#F8F8F8",
} as never;

describe("ListBlock row links", () => {
  it("renders View → link when the item carries linkUrl", async () => {
    const html = await render(
      createElement(ListBlock, {
        props: { items: [{ lead: "$450,000", text: "125 Main St", linkUrl: "https://example.com/l" }] },
        globalStyle: HOUSE,
      }),
    );
    expect(html).toContain('href="https://example.com/l"');
    expect(html).toContain("View →");
  });

  it("renders no anchor when linkUrl is absent", async () => {
    const html = await render(
      createElement(ListBlock, { props: { items: [{ text: "125 Main St" }] }, globalStyle: HOUSE }),
    );
    expect(html).not.toContain("<a");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/email/doc/schema.test.ts lib/email/blocks/list-link.test.ts`
Expected: FAIL — `linkUrl` stripped by schema; no anchor rendered.

- [ ] **Step 3: Implement**

`lib/email/doc/types.ts` — extend `ListItem`:

```ts
export interface ListItem {
  lead?: string;
  text: string;
  /** Optional row click-through ("View →"). USER/ENGINE-owned like every link
   *  field — no AI patch path exists for list items' linkUrl. */
  linkUrl?: string;
}
```

`lib/email/doc/schema.ts` — extend `ListItemSchema`:

```ts
const ListItemSchema = z.object({
  lead: z.string().max(24).optional(),
  text: z.string().max(200),
  linkUrl: z.string().optional(),
});
```

`lib/email/blocks/ListBlock.tsx` — import `Link` and `legibleInk`, and render the trailing link inside the text `<td>` (after `{item.text}`):

```tsx
import { Section, Text, Link } from "@react-email/components";
import { legibleInk } from "./on-dark";
```

```tsx
                {item.text}
                {item.linkUrl ? (
                  <>
                    {"  "}
                    <Link
                      href={item.linkUrl}
                      style={{
                        fontFamily: font,
                        fontSize: "13px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        color: onDark
                          ? legibleAccent(globalStyle.accentColor, bg)
                          : legibleInk(globalStyle.accentColor, bg, 4.5),
                      }}
                    >
                      View →
                    </Link>
                  </>
                ) : null}
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/email/doc/ lib/email/blocks/`
Expected: PASS — including `block-contract.test.ts`, `default-props-slots.test.ts`, and the golden fixtures (none contain list `linkUrl`, so goldens are unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/email/doc/types.ts lib/email/doc/schema.ts lib/email/blocks/ListBlock.tsx lib/email/doc/schema.test.ts lib/email/blocks/list-link.test.ts
git commit -m "feat(email): ListItem.linkUrl — engine/user-owned row click-through on list blocks" -- lib/email/doc/types.ts lib/email/doc/schema.ts lib/email/blocks/ListBlock.tsx lib/email/doc/schema.test.ts lib/email/blocks/list-link.test.ts
```

---

### Task 6: Pure sold-comp block builders

**Files:**
- Create: `lib/email/sold-comp-blocks.ts`
- Test: `lib/email/sold-comp-blocks.test.ts`

**Interfaces:**
- Consumes: `RenderComp` (Task 4 shape, incl. `sourceUrl`), `ChartSpec` (`components/charts/registry/chart-spec`), `BlockOf<"list">` / `EmailDoc` (`lib/email/doc/types`), `mintBlockId` (`lib/email/doc/schema`).
- Produces (Tasks 7–8 consume exactly these):
  - `SOLD_COMPS_LIST_TITLE = "Recent sales nearby"`
  - `soldCompsListBlock(comps: RenderComp[]): BlockOf<"list"> | null`
  - `buildSoldCompsSpec(comps: RenderComp[], subject: { street: string; listPrice: number | null }, asOfIso: string): ChartSpec | null`
  - `upsertSoldCompsBlock(doc: EmailDoc, block: BlockOf<"list">): EmailDoc`

- [ ] **Step 1: Write the failing tests**

`lib/email/sold-comp-blocks.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  SOLD_COMPS_LIST_TITLE,
  soldCompsListBlock,
  buildSoldCompsSpec,
  upsertSoldCompsBlock,
} from "./sold-comp-blocks";
import type { RenderComp } from "@/lib/assistant/comp-helper";
import type { EmailDoc } from "./doc/types";

const comp = (over: Partial<RenderComp>): RenderComp => ({
  addressLine: "125 Main St", city: "Cape Coral", beds: 3, baths: 2, sqft: 1500,
  status: "sold", price: 450000, priceKind: "sold", priceDate: "2026-05-20",
  sourceUrl: "https://www.realtor.com/realestateandhomes-detail/x_M1-2",
  ...over,
});

describe("soldCompsListBlock", () => {
  it("builds titled rows: sold lead with MM/DD/YYYY, address text, link", () => {
    const b = soldCompsListBlock([comp({})]);
    expect(b?.type).toBe("list");
    expect(b?.props.title).toBe(SOLD_COMPS_LIST_TITLE);
    expect(b?.props.items[0]).toEqual({
      lead: "$450,000 · 05/20/2026",
      text: "125 Main St, Cape Coral",
      linkUrl: "https://www.realtor.com/realestateandhomes-detail/x_M1-2",
    });
  });

  it("labels estimates and last-lists honestly, omits linkUrl when not captured", () => {
    const b = soldCompsListBlock([
      comp({ priceKind: "estimate", priceDate: null, sourceUrl: null }),
      comp({ priceKind: "last_list", priceDate: null }),
    ]);
    expect(b?.props.items[0].lead).toBe("$450,000 est.");
    expect(b?.props.items[0].linkUrl).toBeUndefined();
    expect(b?.props.items[1].lead).toBe("$450,000 list");
  });

  it("drops price-less comps; null when nothing priced", () => {
    expect(soldCompsListBlock([comp({ price: null })])).toBeNull();
  });
});

describe("buildSoldCompsSpec", () => {
  it("subject asking bar + sold comps, needs >=2 priced comps and a subject price", () => {
    const spec = buildSoldCompsSpec(
      [comp({}), comp({ addressLine: "1409 SE 4th Pl", price: 610000 })],
      { street: "1403 NE 19th Ter", listPrice: 575000 },
      "2026-07-12",
    );
    expect(spec).not.toBeNull();
    expect(spec!.rows[0]).toEqual(["1403 NE 19th Ter (Subject — asking)", 575000]);
    expect(spec!.rows.length).toBe(3);
    expect(spec!.source).toEqual({
      citation: "SWFL Data Gulf · realtor.com",
      url: "https://www.realtor.com",
    });
    expect(buildSoldCompsSpec([comp({})], { street: "x", listPrice: 575000 }, "2026-07-12")).toBeNull();
    expect(
      buildSoldCompsSpec([comp({}), comp({})], { street: "x", listPrice: null }, "2026-07-12"),
    ).toBeNull();
  });
});

describe("upsertSoldCompsBlock", () => {
  const doc: EmailDoc = {
    globalStyle: {
      primaryColor: "#0f1d24", accentColor: "#3DC9C0", fontFamily: "MODERN_SANS",
      textColor: "#242424", backdropColor: "#F8F8F8",
    },
    blocks: [
      { id: "h1", type: "header", props: {} },
      { id: "b1", type: "button", props: { label: "CTA" } },
    ],
  };

  it("inserts before the first button/agent-card/footer", () => {
    const b = soldCompsListBlock([comp({})])!;
    const next = upsertSoldCompsBlock(doc, b);
    expect(next.blocks.map((x) => x.type)).toEqual(["header", "list", "button"]);
  });

  it("replaces in place on re-run (idempotent for scheduled rebuilds)", () => {
    const b = soldCompsListBlock([comp({})])!;
    const once = upsertSoldCompsBlock(doc, b);
    const twice = upsertSoldCompsBlock(once, soldCompsListBlock([comp({ price: 460000 })])!);
    expect(twice.blocks.filter((x) => x.type === "list").length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/email/sold-comp-blocks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/email/sold-comp-blocks.ts`:

```ts
// lib/email/sold-comp-blocks.ts
//
// Pure builders that turn nearby SOLD comps (RenderComp — the comp-helper's
// MLS-scrubbed shape) into email blocks: a bar ChartSpec (subject's asking price
// vs recorded sales) and a linked `list` block ("Recent sales nearby"), one row
// per comp with a "View →" click-through to its CAPTURED realtor.com page.
// Honest price kinds: an estimate or last-list is labeled, never dressed as a
// sale. No I/O, no invention: a comp without a price is dropped; a comp without
// a captured sourceUrl renders without a link.

import { mintBlockId } from "./doc/schema";
import type { BlockOf, EmailDoc, ListItem } from "./doc/types";
import type { RenderComp } from "@/lib/assistant/comp-helper";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";

export const SOLD_COMPS_LIST_TITLE = "Recent sales nearby";

const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** "2026-05-20" → "05/20/2026"; undefined for anything else. */
function isoToMDY(iso: string | null): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : undefined;
}

/** Row lead: "$450,000 · 05/20/2026" (sold) · "$450,000 est." · "$450,000 list". */
function leadFor(c: RenderComp): string {
  const price = usd(c.price as number);
  if (c.priceKind === "sold") {
    const d = isoToMDY(c.priceDate);
    return d ? `${price} · ${d}` : `${price} sold`;
  }
  return c.priceKind === "estimate" ? `${price} est.` : `${price} list`;
}

/** The linked comp rows. Null when no comp carries a price (never an empty shell). */
export function soldCompsListBlock(comps: RenderComp[]): BlockOf<"list"> | null {
  const items: ListItem[] = comps
    .filter((c) => c.price != null)
    .slice(0, 8)
    .map((c) => ({
      lead: leadFor(c),
      text: [c.addressLine, c.city].filter(Boolean).join(", ").slice(0, 200),
      ...(c.sourceUrl ? { linkUrl: c.sourceUrl } : {}),
    }));
  if (items.length === 0) return null;
  return {
    id: mintBlockId(),
    type: "list",
    props: { title: SOLD_COMPS_LIST_TITLE, items },
  };
}

/** Bar spec: subject asking price first, sold/estimate comps sorted desc. Null
 *  unless the subject has a price AND >=2 comps are priced (a 2-bar chart is
 *  not informative — same floor the old actives chart used). */
export function buildSoldCompsSpec(
  comps: RenderComp[],
  subject: { street: string; listPrice: number | null },
  asOfIso: string,
): ChartSpec | null {
  const priced = comps.filter((c) => c.price != null);
  if (!subject.listPrice || priced.length < 2) return null;
  const kindSuffix = (c: RenderComp) =>
    c.priceKind === "sold" ? "" : c.priceKind === "estimate" ? " (est.)" : " (list)";
  const rows: (string | number | null)[][] = [
    [`${subject.street} (Subject — asking)`, subject.listPrice],
    ...[...priced]
      .sort((a, b) => (b.price as number) - (a.price as number))
      .map((c) => [`${c.addressLine}${kindSuffix(c)}`, c.price]),
  ];
  return {
    frameId: "bar-table",
    title: `Recent sales near ${subject.street}`,
    columns: ["Property", "Price"],
    rows,
    value_format: "usd",
    chart_type: "bar",
    asOf: asOfIso,
    source: { citation: "SWFL Data Gulf · realtor.com", url: "https://www.realtor.com" },
  } as ChartSpec;
}

/** Upsert keyed on the reserved title: replace the existing sold-comps list in
 *  place (scheduled rebuilds must never stack), else insert before the first
 *  agent-card/button/footer so the rows sit after the narrative content. */
export function upsertSoldCompsBlock(doc: EmailDoc, block: BlockOf<"list">): EmailDoc {
  const idx = doc.blocks.findIndex(
    (b) => b.type === "list" && b.props.title === SOLD_COMPS_LIST_TITLE,
  );
  if (idx !== -1) {
    const blocks = doc.blocks.map((b, i) =>
      i === idx ? ({ id: b.id, type: "list", props: block.props } as BlockOf<"list">) : b,
    );
    return { ...doc, blocks };
  }
  const anchor = doc.blocks.findIndex(
    (b) => b.type === "agent-card" || b.type === "button" || b.type === "footer",
  );
  const blocks = [...doc.blocks];
  blocks.splice(anchor === -1 ? blocks.length : anchor, 0, block);
  return { ...doc, blocks };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/email/sold-comp-blocks.test.ts`
Expected: PASS. If `ChartSpec`'s required fields differ (open `components/charts/registry/chart-spec.ts` and check), mirror exactly what `buildCompsSpec` in `lib/email/listing-comps.ts` returns today — that shape is proven against the chart renderer.

- [ ] **Step 5: Commit**

```bash
git add lib/email/sold-comp-blocks.ts lib/email/sold-comp-blocks.test.ts
git commit -m "feat(email): pure sold-comp builders — linked rows list + asking-vs-sold chart spec" -- lib/email/sold-comp-blocks.ts lib/email/sold-comp-blocks.test.ts
```

---

### Task 7: Flip the listing-flyer lane to sold comps; retire the actives scrape

**Files:**
- 🟡 Modify: `lib/email/build-doc.ts:44` (imports) and the flyer branch (~lines 476–497)
- Delete: `lib/email/listing-comps.ts`, `lib/email/listing-comps.test.ts`
- Test: existing suites (`bun test lib/email/`) — the flyer branch is exercised through `buildContentDoc` tests if present; the new logic itself is pure and already covered by Task 6

**Interfaces:**
- Consumes: `compsForAddress` (`lib/assistant/comp-helper`), `soldCompsListBlock` / `buildSoldCompsSpec` / `upsertSoldCompsBlock` (Task 6).
- Produces: the flyer path emits the sold-comps chart + linked rows; no code imports `listing-comps` anymore.

- [ ] **Step 1: Verify the retirement is safe**

Run: `grep -rn "listing-comps" --include="*.ts" --include="*.tsx" --include="*.mts" lib app components scripts`
Expected: only `lib/email/build-doc.ts:44` and `lib/email/listing-comps.test.ts`. If ANYTHING else imports it, STOP and report — do not delete.

- [ ] **Step 2: Replace the flyer comps block**

In `lib/email/build-doc.ts`:

1. Replace the import at line 44:

```ts
// OLD
import { fetchAreaComps, buildCompsSpec, deriveAreaUrl } from "@/lib/email/listing-comps";
// NEW
import { compsForAddress } from "@/lib/assistant/comp-helper";
import {
  buildSoldCompsSpec,
  soldCompsListBlock,
  upsertSoldCompsBlock,
} from "@/lib/email/sold-comp-blocks";
```

2. Replace the whole `if (url) { ... }` comps block inside the flyer branch (currently lines ~480–497, the block that calls `fetchAreaComps`/`deriveAreaUrl`/`buildCompsSpec`) with:

```ts
      // Comps — nearby RECORDED SALES (the chat comp lane: geocode → sold comps →
      // ≤2 exact-sale enrichments, ≤3 vendor calls, no LLM). Sold comps justify the
      // asking price without advertising purchasable competitors (operator decision
      // 07/11/2026). Best-effort: any miss ships the flyer without chart/rows.
      const compRes = facts.address
        ? await compsForAddress(facts.address).catch(() => null)
        : null;
      const comps = compRes?.comps ?? [];
      const subjectPrice = Number((facts.price ?? "").replace(/[^0-9]/g, "")) || null;
      const spec = buildSoldCompsSpec(
        comps,
        { street: facts.address?.split(",")[0]?.trim() ?? "This home", listPrice: subjectPrice },
        new Date().toISOString().slice(0, 10),
      );
      if (spec) {
        const accent = doc.globalStyle?.accentColor ?? "#2563eb";
        const chartImg = await chartSpecToEmailImage(
          spec,
          accent,
          `comps-${facts.zip ?? "swfl"}-${Date.now()}`,
        ).catch(() => null);
        if (chartImg) {
          flyer = upsertChartBlock(flyer, chartImageBlock(chartImg));
        }
      }
      const compRows = soldCompsListBlock(comps);
      if (compRows) flyer = upsertSoldCompsBlock(flyer, compRows);
```

(Note: the old block was wrapped in `if (url)`; the new one is NOT — it keys off `facts.address`, so an address-resolved flyer without a pasted URL gets comps too. Keep the surrounding flyer code — photo mirror, `buildListingFlyer`, reparse/return — exactly as it is.)

3. Delete `lib/email/listing-comps.ts` and `lib/email/listing-comps.test.ts`.

- [ ] **Step 3: Run the suites**

Run: `bun test lib/email/ lib/assistant/`
Expected: PASS, and no dangling-import compile errors (`bunx next build` in Task 12 is the final proof).

- [ ] **Step 4: Commit**

```bash
git add lib/email/build-doc.ts
git rm lib/email/listing-comps.ts lib/email/listing-comps.test.ts
git commit -m "feat(email): listing flyer comps flip to linked SOLD comps; retire area-page actives scrape" -- lib/email/build-doc.ts lib/email/listing-comps.ts lib/email/listing-comps.test.ts
```

---

### Task 8: Address-spine lane — one comp fetch feeds figures AND the linked rows

**Files:**
- Modify: `lib/email/address-context.ts`
- 🟡 Modify: `lib/email/build-doc.ts` — `fetchLakeParts` (~lines 130–150) and the newsletter-path return
- Test: `lib/email/address-context.test.ts`

**Interfaces:**
- Consumes: `compsForAddress`, `soldCompsListBlock`, `upsertSoldCompsBlock`.
- Produces: `loadAddressCompContext(address, deps?): Promise<{ figures: MarketFigure[]; comps: RenderComp[] }>`; `loadAddressFigures` becomes a thin wrapper (existing callers unchanged). `buildContentDoc` gains the comp rows on comp-intent builds. HARD RULE: exactly ONE `compsForAddress` call per build.

- [ ] **Step 1: Write the failing test**

In `lib/email/address-context.test.ts`, beside the existing `loadAddressFigures` tests (reuse their injected `CompDeps` fakes):

```ts
  it("loadAddressCompContext returns figures AND the raw comps from ONE fetch", async () => {
    let calls = 0;
    const ctx = await loadAddressCompContext("123 Main St, Cape Coral", {
      geocode: async () => ({ lat: 26.6, lon: -81.9, countyFips: "12071", matchedAddress: "123 Main St" }),
      fetchNearby: async () => {
        calls++;
        return [
          {
            addressLine: "125 Main St", city: "Cape Coral", state: "FL", zip: "33904",
            beds: 3, baths: 2, sqft: 1500, lotSqft: null, status: "sold",
            listPrice: 450000, estimateValue: null, estimateDate: null, propertyId: null,
            sourceUrl: "https://www.realtor.com/realestateandhomes-detail/x_M1-2",
          },
        ];
      },
      fetchSold: async () => null,
    });
    expect(calls).toBe(1);
    expect(ctx.figures.length).toBe(1);
    expect(ctx.comps[0]?.sourceUrl).toBe("https://www.realtor.com/realestateandhomes-detail/x_M1-2");
  });
```

(Match the injected geocode literal to what the file's existing tests use.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/address-context.test.ts`
Expected: FAIL — `loadAddressCompContext` not exported.

- [ ] **Step 3: Implement**

`lib/email/address-context.ts` — restructure so the existing body becomes the context loader, and `loadAddressFigures` delegates:

```ts
export interface AddressCompContext {
  figures: MarketFigure[];
  comps: RenderComp[];
}

/** ONE compsForAddress call → both consumers: cited figures for the AI feed and
 *  the raw comps for the linked rows block. Empty-tolerant like before. */
export async function loadAddressCompContext(
  address: string | null | undefined,
  deps: CompDeps = {},
): Promise<AddressCompContext> {
  const subject = String(address ?? "").trim();
  if (!subject) return { figures: [], comps: [] };
  try {
    const result = await compsForAddress(subject, deps);
    const figures = result.comps.flatMap((c, i) => {
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
    return { figures, comps: result.comps };
  } catch {
    return { figures: [], comps: [] };
  }
}

/** Back-compat wrapper — existing callers keep their shape. */
export async function loadAddressFigures(
  address: string | null | undefined,
  deps: CompDeps = {},
): Promise<MarketFigure[]> {
  return (await loadAddressCompContext(address, deps)).figures;
}
```

(Keep `kindWording`/`specBits`/`isoToMDY`/`usd`/`COMP_SOURCE` as they are; the old `loadAddressFigures` body moves into `loadAddressCompContext`. Export `RenderComp` re-import as needed: `import { compsForAddress, type CompDeps, type RenderComp } from "@/lib/assistant/comp-helper";`.)

`lib/email/build-doc.ts`:

1. In `fetchLakeParts` (~line 134), swap `loadAddressFigures(scope?.address)` for `loadAddressCompContext(scope?.address)` and thread the comps into the return:

```ts
  const [marketFigures, lifecycleFigure, dossier, addressCtx] = await Promise.all([
    loadMarketFigures(scope).catch(() => []),
    loadLifecycleDigest(scope).catch(() => null),
    fetchMasterDossier(scope).catch(() => ""),
    loadAddressCompContext(scope?.address).catch(() => ({ figures: [], comps: [] })),
  ]);
```

Use `addressCtx.figures` where `addressFigures` was used, and add `addressComps: addressCtx.comps` to `fetchLakeParts`'s returned object (extend its return type accordingly — grep the function's return statement and its consumers inside this file; `lakeParts` is consumed at ~line 517).

2. In `buildContentDoc`'s NEWSLETTER path (the non-flyer path that runs `applyPatch` and returns `{ payload: { doc, applied: true } }` — locate the return after the patch is applied), insert the comp rows just before the final doc is validated/returned, gated on comp/listing intent:

```ts
  const wantsCompRows =
    (lakeParts.addressComps?.length ?? 0) > 0 &&
    (isListingIntent(prompt) || /\b(comps?|comparables?|recent sales)\b/i.test(prompt));
  if (wantsCompRows) {
    const compRows = soldCompsListBlock(lakeParts.addressComps);
    if (compRows) patchedDoc = upsertSoldCompsBlock(patchedDoc, compRows);
  }
```

(`patchedDoc` = whatever local name holds the post-patch doc at that point; keep the existing revalidation flow — if the path re-parses with `EmailDocSchema` before returning, insert BEFORE that parse.)

- [ ] **Step 4: Run tests**

Run: `bun test lib/email/`
Expected: PASS, including `emaildoc-occurrence.test.ts` (scheduled rebuilds hit this same path; the upsert keeps them idempotent).

- [ ] **Step 5: Commit**

```bash
git add lib/email/address-context.ts lib/email/address-context.test.ts lib/email/build-doc.ts
git commit -m "feat(email): address-spine builds get linked sold-comp rows from the single comp fetch" -- lib/email/address-context.ts lib/email/address-context.test.ts lib/email/build-doc.ts
```

---

### Task 9: `link-audit` — the audit + fallback ladder (pure)

**Files:**
- Create: `lib/email/link-audit.ts`
- Test: `lib/email/link-audit.test.ts`

**Interfaces:**
- Consumes: `EmailDoc`, `EmailBlock` types; `brandWebsiteUrl` (`lib/email/inject-photo`).
- Produces (Tasks 10–11 consume exactly these):
  - `subjectListingUrl(doc: EmailDoc): string | null`
  - `auditDocLinks(doc: EmailDoc): LinkAsk[]` with `interface LinkAsk { blockId: string; blockType: "button" | "listing" | "multi-column"; label: string; columnIndex?: number }`
  - `applyLinkFallbacks(doc: EmailDoc, ctx: FallbackCtx): { doc: EmailDoc; applied: AppliedFallback[] }` with `interface FallbackCtx { listingUrl?: string | null; brandWebsiteUrl?: string | null; replyMailto?: string | null; hostedUrl?: string | null }` and `interface AppliedFallback { blockId: string; url: string; rung: "listing" | "website" | "reply" | "hosted"; columnIndex?: number }`

- [ ] **Step 1: Write the failing tests**

`lib/email/link-audit.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { auditDocLinks, applyLinkFallbacks, subjectListingUrl } from "./link-audit";
import type { EmailDoc } from "./doc/types";

const style = {
  primaryColor: "#0f1d24", accentColor: "#3DC9C0", fontFamily: "MODERN_SANS" as const,
  textColor: "#242424", backdropColor: "#F8F8F8",
};

const doc = (blocks: EmailDoc["blocks"]): EmailDoc => ({ globalStyle: style, blocks });

describe("auditDocLinks — click-promising slots only", () => {
  it("flags a labeled button with no url; ignores an unlabeled one", () => {
    const asks = auditDocLinks(
      doc([
        { id: "b1", type: "button", props: { label: "View Report", url: "" } },
        { id: "b2", type: "button", props: {} },
        { id: "b3", type: "button", props: { label: "Go", url: "https://x.com" } },
      ]),
    );
    expect(asks).toEqual([{ blockId: "b1", blockType: "button", label: "View Report" }]);
  });

  it("flags a listing card without linkUrl and a column with linkLabel but no linkUrl", () => {
    const asks = auditDocLinks(
      doc([
        { id: "l1", type: "listing", props: { price: "$500,000" } },
        {
          id: "m1", type: "multi-column",
          props: { columns: [{ heading: "A", linkLabel: "See more" }, { heading: "B" }] },
        },
      ]),
    );
    expect(asks).toEqual([
      { blockId: "l1", blockType: "listing", label: "$500,000" },
      { blockId: "m1", blockType: "multi-column", label: "See more", columnIndex: 0 },
    ]);
  });

  it("never flags decorative wrap-link slots", () => {
    const asks = auditDocLinks(
      doc([
        { id: "h1", type: "hero", props: { value: "$500K" } },
        { id: "t1", type: "text", props: { body: "hello" } },
        { id: "i1", type: "image", props: { url: "https://img" } },
      ]),
    );
    expect(asks).toEqual([]);
  });
});

describe("applyLinkFallbacks — ladder order, never dead-ends", () => {
  const needy = doc([{ id: "b1", type: "button", props: { label: "View", url: "" } }]);

  it("listing → website → reply → hosted, first available rung wins", () => {
    const full = applyLinkFallbacks(needy, {
      listingUrl: "https://www.realtor.com/realestateandhomes-detail/x_M1-2",
      brandWebsiteUrl: "https://agent.com",
      replyMailto: "mailto:a@b.com",
      hostedUrl: "https://www.swfldatagulf.com/p/abc",
    });
    expect(full.applied).toEqual([
      { blockId: "b1", url: "https://www.realtor.com/realestateandhomes-detail/x_M1-2", rung: "listing" },
    ]);
    const hostedOnly = applyLinkFallbacks(needy, { hostedUrl: "https://www.swfldatagulf.com/p/abc" });
    expect(hostedOnly.applied[0]).toEqual({
      blockId: "b1", url: "https://www.swfldatagulf.com/p/abc", rung: "hosted",
    });
    const b = hostedOnly.doc.blocks[0] as { props: { url?: string } };
    expect(b.props.url).toBe("https://www.swfldatagulf.com/p/abc");
  });

  it("no rungs at all → doc unchanged, applied empty (cron logs it, send proceeds)", () => {
    const res = applyLinkFallbacks(needy, {});
    expect(res.applied).toEqual([]);
    expect(res.doc).toEqual(needy);
  });

  it("is a no-op on a fully linked doc", () => {
    const linked = doc([{ id: "b1", type: "button", props: { label: "View", url: "https://x.com" } }]);
    expect(applyLinkFallbacks(linked, { hostedUrl: "https://h" }).applied).toEqual([]);
  });
});

describe("subjectListingUrl", () => {
  it("reads the listing card's link, else the hero photo's link", () => {
    expect(
      subjectListingUrl(doc([{ id: "l1", type: "listing", props: { linkUrl: "https://l" } }])),
    ).toBe("https://l");
    expect(
      subjectListingUrl(
        doc([{ id: "i1", type: "image", props: { url: "https://p", kind: "photo", linkUrl: "https://src" } }]),
      ),
    ).toBe("https://src");
    expect(subjectListingUrl(doc([]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/email/link-audit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/email/link-audit.ts`:

```ts
// lib/email/link-audit.ts
//
// The dead-link floor (spec 2026-07-12-email-link-destinations). Two pure halves:
//   auditDocLinks — find CLICK-PROMISING slots with no destination (a labeled
//     button, a listing card, a written link-label). Decorative wrap-links
//     (hero/text/image linkUrl) are OPTIONAL and never flagged — no nagging.
//   applyLinkFallbacks — the send-time ladder: subject listing page → brand
//     website → reply-by-email → hosted report page. First available rung fills
//     each unresolved slot; ladder empty → doc unchanged (callers log it).
// Engine/user writes only — the AI never touches a URL (schema strip mode).

import type { EmailDoc } from "./doc/types";

export interface LinkAsk {
  blockId: string;
  blockType: "button" | "listing" | "multi-column";
  /** What the reader was promised — the button label, card price/address, or link label. */
  label: string;
  /** multi-column only: which column's linkLabel is unresolved. */
  columnIndex?: number;
}

export interface FallbackCtx {
  listingUrl?: string | null;
  brandWebsiteUrl?: string | null;
  replyMailto?: string | null;
  hostedUrl?: string | null;
}

export interface AppliedFallback {
  blockId: string;
  url: string;
  rung: "listing" | "website" | "reply" | "hosted";
  columnIndex?: number;
}

const has = (s: unknown): s is string => typeof s === "string" && s.trim() !== "";

/** The subject property's link as the doc holds it: the listing card's linkUrl,
 *  else the hero photo's click-through (both are captured/preset, never minted). */
export function subjectListingUrl(doc: EmailDoc): string | null {
  for (const b of doc.blocks) {
    if (b.type === "listing" && has(b.props.linkUrl)) return b.props.linkUrl.trim();
  }
  for (const b of doc.blocks) {
    if (b.type === "image" && b.props.kind === "photo" && has(b.props.linkUrl)) {
      return b.props.linkUrl.trim();
    }
  }
  return null;
}

export function auditDocLinks(doc: EmailDoc): LinkAsk[] {
  const asks: LinkAsk[] = [];
  for (const b of doc.blocks) {
    if (b.type === "button" && has(b.props.label) && !has(b.props.url)) {
      asks.push({ blockId: b.id, blockType: "button", label: b.props.label.trim() });
    } else if (b.type === "listing" && !has(b.props.linkUrl)) {
      const label = [b.props.price, b.props.address].find(has) ?? "Listing card";
      asks.push({ blockId: b.id, blockType: "listing", label: label.trim() });
    } else if (b.type === "multi-column") {
      (b.props.columns ?? []).forEach((c, i) => {
        if (has(c.linkLabel) && !has(c.linkUrl)) {
          asks.push({
            blockId: b.id,
            blockType: "multi-column",
            label: c.linkLabel.trim(),
            columnIndex: i,
          });
        }
      });
    }
  }
  return asks;
}

function firstRung(ctx: FallbackCtx): { url: string; rung: AppliedFallback["rung"] } | null {
  if (has(ctx.listingUrl)) return { url: ctx.listingUrl.trim(), rung: "listing" };
  if (has(ctx.brandWebsiteUrl)) return { url: ctx.brandWebsiteUrl.trim(), rung: "website" };
  if (has(ctx.replyMailto)) return { url: ctx.replyMailto.trim(), rung: "reply" };
  if (has(ctx.hostedUrl)) return { url: ctx.hostedUrl.trim(), rung: "hosted" };
  return null;
}

export function applyLinkFallbacks(
  doc: EmailDoc,
  ctx: FallbackCtx,
): { doc: EmailDoc; applied: AppliedFallback[] } {
  const asks = auditDocLinks(doc);
  if (asks.length === 0) return { doc, applied: [] };
  const rung = firstRung(ctx);
  if (!rung) return { doc, applied: [] };

  const applied: AppliedFallback[] = [];
  const byBlock = new Map<string, LinkAsk[]>();
  for (const a of asks) {
    byBlock.set(a.blockId, [...(byBlock.get(a.blockId) ?? []), a]);
  }

  const blocks = doc.blocks.map((b) => {
    const blockAsks = byBlock.get(b.id);
    if (!blockAsks) return b;
    if (b.type === "button") {
      applied.push({ blockId: b.id, url: rung.url, rung: rung.rung });
      return { ...b, props: { ...b.props, url: rung.url } };
    }
    if (b.type === "listing") {
      applied.push({ blockId: b.id, url: rung.url, rung: rung.rung });
      return { ...b, props: { ...b.props, linkUrl: rung.url } };
    }
    if (b.type === "multi-column") {
      const idxs = new Set(blockAsks.map((a) => a.columnIndex));
      const columns = (b.props.columns ?? []).map((c, i) => {
        if (!idxs.has(i)) return c;
        applied.push({ blockId: b.id, url: rung.url, rung: rung.rung, columnIndex: i });
        return { ...c, linkUrl: rung.url };
      });
      return { ...b, props: { ...b.props, columns } };
    }
    return b;
  });
  return { doc: { ...doc, blocks } as EmailDoc, applied };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/email/link-audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/link-audit.ts lib/email/link-audit.test.ts
git commit -m "feat(email): link audit + send-time fallback ladder (pure)" -- lib/email/link-audit.ts lib/email/link-audit.test.ts
```

---

### Task 10: Wire the ladder into every send path

**Files:**
- Modify: `app/api/deliverables/[id]/blast/route.ts`
- Modify: `app/api/lab/claim-and-send/route.ts`
- Modify: `lib/email/emaildoc-occurrence.ts` (+ its caller `scripts/email/run-schedules.mts` for the origin dep)
- Test: `lib/email/emaildoc-occurrence.test.ts` (the occurrence half is DI-pure; the two routes get their logic from Task 9's tested functions — route wiring is verified by `bunx next build` + Task 12's live check)

**Interfaces:**
- Consumes: `applyLinkFallbacks`, `subjectListingUrl` (Task 9), `brandWebsiteUrl` (`lib/email/inject-photo`).
- Produces: every rendered-and-sent EmailDoc has passed through the ladder; blast responses carry `link_fallbacks: AppliedFallback[]`.

- [ ] **Step 1: Blast route**

In `app/api/deliverables/[id]/blast/route.ts`, locate the block-canvas branch where `deliverable.doc` is parsed with `EmailDocSchema` (before `renderEmailDocHtml` / the variant loop). Immediately after the successful parse and BEFORE any render:

```ts
    const ladder = applyLinkFallbacks(parsedDoc, {
      listingUrl: subjectListingUrl(parsedDoc),
      brandWebsiteUrl: brandWebsiteUrl(parsedDoc),
      replyMailto: null, // blast replies ride the reply-to header, not a body CTA
      hostedUrl: webUrl,
    });
    const sendDoc = ladder.doc;
```

Use `sendDoc` everywhere the branch previously used the parsed doc (including the `withCtaLabel` variant renders), and add `link_fallbacks: ladder.applied` to the route's success JSON response. Add the imports:

```ts
import { applyLinkFallbacks, subjectListingUrl } from "@/lib/email/link-audit";
import { brandWebsiteUrl } from "@/lib/email/inject-photo";
```

NOTE: `webUrl` already exists in the route (`${BASE_URL}/p/${id}`, ~line 189). The ladder runs BEFORE the existing `lintCompiledHtml` gate — the lint then sees the laddered HTML, and every ladder URL is doc-held or platform-hosted, so the allowlist admits it.

- [ ] **Step 2: Claim-and-send route**

Same pattern in `app/api/lab/claim-and-send/route.ts`: find where its EmailDoc is parsed before render, apply:

```ts
    const ladder = applyLinkFallbacks(parsedDoc, {
      listingUrl: subjectListingUrl(parsedDoc),
      brandWebsiteUrl: brandWebsiteUrl(parsedDoc),
      replyMailto: null,
      hostedUrl: null, // funnel self-send has no hosted /p page; doc-held rungs only
    });
```

and render `ladder.doc`. (If this route sends pre-rendered HTML with no doc parse, skip it and note that in the commit message — the lab modal in Task 11 covers the funnel's authoring side.)

- [ ] **Step 3: Scheduled occurrences — failing test first**

In `lib/email/emaildoc-occurrence.test.ts` (DI style — copy an existing test's deps shape):

```ts
  it("applies the link ladder before render and logs each applied fallback", async () => {
    const logs: string[] = [];
    const doc = {
      globalStyle: {
        primaryColor: "#0f1d24", accentColor: "#3DC9C0", fontFamily: "MODERN_SANS",
        textColor: "#242424", backdropColor: "#F8F8F8",
      },
      blocks: [
        { id: "f1", type: "footer", props: { websiteUrl: "https://agent.com" } },
        { id: "b1", type: "button", props: { label: "View", url: "" } },
      ],
    };
    let rendered: unknown = null;
    const occ = await buildEmailDocOccurrence("d1", {
      loadDeliverable: async () => ({
        doc, instruction: "market update", scope_kind: null, scope_value: null,
        template: "block-canvas", subject_address: null,
      }),
      buildDoc: async ({ rawDoc }) => rawDoc,
      renderDoc: (d) => { rendered = d; return "<html/>"; },
      log: (l) => logs.push(l),
    });
    expect(occ).not.toBeNull();
    const btn = (rendered as { blocks: { id: string; props: { url?: string } }[] }).blocks
      .find((b) => b.id === "b1");
    expect(btn?.props.url).toBe("https://agent.com");
    expect(logs.some((l) => l.includes("link-fallback"))).toBe(true);
  });
```

(Match `buildEmailDocOccurrence`'s real dep names/shapes — open the file; the deps interface is `EmailDocOccurrenceDeps` at line 33.)

- [ ] **Step 4: Run test to verify it fails, then implement**

Run: `bun test lib/email/emaildoc-occurrence.test.ts` → FAIL.

In `lib/email/emaildoc-occurrence.ts`, after the (re)built doc is final and before `renderDoc` is called:

```ts
  const ladder = applyLinkFallbacks(builtDoc, {
    listingUrl: subjectListingUrl(builtDoc),
    brandWebsiteUrl: brandWebsiteUrl(builtDoc),
    replyMailto: null,
    hostedUrl: deps.hostedUrl ?? null,
  });
  for (const a of ladder.applied) {
    deps.log(`[emaildoc-occurrence] link-fallback applied: block=${a.blockId} rung=${a.rung}`);
  }
  const finalDoc = ladder.doc;
```

Add `hostedUrl?: string | null` to `EmailDocOccurrenceDeps`, and in `scripts/email/run-schedules.mts`'s `emailDocOccurrence` seam pass `hostedUrl: deliverableId ? \`\${SITE_URL}/p/\${deliverableId}\` : null` (the runner already holds a site-URL constant — grep `NEXT_PUBLIC_SITE_URL` in the file and reuse it). Apply the same ladder call inside `lib/email/sequence/frozen-occurrence.ts` if it renders independently of `buildEmailDocOccurrence` (grep `renderDoc(` there; frozen one-shots must get the ladder too).

- [ ] **Step 5: Run tests + build**

Run: `bun test lib/email/` then `bunx next build`
Expected: PASS / build green.

- [ ] **Step 6: Commit**

```bash
git add app/api/deliverables/[id]/blast/route.ts app/api/lab/claim-and-send/route.ts lib/email/emaildoc-occurrence.ts lib/email/emaildoc-occurrence.test.ts scripts/email/run-schedules.mts lib/email/sequence/frozen-occurrence.ts
git commit -m "feat(email): fallback ladder wired into blast, claim-and-send, scheduled + frozen sends" -- app/api/deliverables/[id]/blast/route.ts app/api/lab/claim-and-send/route.ts lib/email/emaildoc-occurrence.ts lib/email/emaildoc-occurrence.test.ts scripts/email/run-schedules.mts lib/email/sequence/frozen-occurrence.ts
```

---

### Task 11: Lab popup — `LinkAskModal`

**Files:**
- Create: `components/email-lab/LinkAskModal.tsx`
- Modify: `components/email-lab/EmailLabGridShell.tsx` (the AI-build response handler + render the modal; the props-write seam is `updateBlock(next: EmailBlock)` at line 603)

**Interfaces:**
- Consumes: `auditDocLinks`, `subjectListingUrl` (`lib/email/link-audit` — pure, client-importable), `brandWebsiteUrl` (`lib/email/inject-photo`), the shell's `updateBlock`.
- Produces: after a build that leaves click-promising slots empty, one dismissible modal collects URLs; each answer writes through `updateBlock` into user-owned sticky fields.

- [ ] **Step 1: Build the modal component**

`components/email-lab/LinkAskModal.tsx` — follow the shell's existing modal styling conventions (grep an existing modal in `components/email-lab/`, e.g. the Filerobot modal, and mirror its overlay/panel classes):

```tsx
"use client";

import { useState } from "react";
import type { LinkAsk } from "@/lib/email/link-audit";

export interface LinkSuggestion {
  label: string;
  url: string;
}

export function LinkAskModal({
  asks,
  suggestions,
  onApply,
  onClose,
}: {
  asks: LinkAsk[];
  /** Ordered chips shown under every row: listing page, website, reply-by-email. */
  suggestions: LinkSuggestion[];
  /** Write one answered URL into its block (columnIndex for multi-column asks). */
  onApply: (ask: LinkAsk, url: string) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const keyOf = (a: LinkAsk) => `${a.blockId}:${a.columnIndex ?? ""}`;

  const applyAll = () => {
    for (const a of asks) {
      const v = (values[keyOf(a)] ?? "").trim();
      if (v) onApply(a, v);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-gray-900">Where should these send readers?</h2>
        <p className="mt-1 text-sm text-gray-500">
          These parts of your email promise a click but have no destination yet. Add a link, tap a
          suggestion, or skip — anything left empty gets a safe destination at send time.
        </p>
        <div className="mt-4 flex flex-col gap-4 max-h-[50dvh] overflow-y-auto">
          {asks.map((a) => (
            <div key={keyOf(a)}>
              <div className="text-sm font-medium text-gray-800">“{a.label}”</div>
              <input
                type="url"
                placeholder="https://…"
                value={values[keyOf(a)] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [keyOf(a)]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.url}
                    type="button"
                    onClick={() => setValues((v) => ({ ...v, [keyOf(a)]: s.url }))}
                    className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-600">
            Skip for now
          </button>
          <button
            type="button"
            onClick={applyAll}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            Save links
          </button>
        </div>
      </div>
    </div>
  );
}
```

(`react-hooks/set-state-in-effect` is a hard ESLint error in this repo — the component above needs no effects; keep it that way.)

- [ ] **Step 2: Wire into the shell**

In `components/email-lab/EmailLabGridShell.tsx`:

1. Locate the AI-build fetch handler (grep `email-lab/ai` in the file) — the spot where the response's new doc lands in state.
2. After the new doc is set, compute the asks and stash them:

```tsx
const asks = auditDocLinks(nextDoc);
setLinkAsks(asks); // new useState<LinkAsk[]>([]) at the top of the shell
```

3. Render the modal near the shell's other modals:

```tsx
{linkAsks.length > 0 ? (
  <LinkAskModal
    asks={linkAsks}
    suggestions={[
      ...(subjectListingUrl(doc) ? [{ label: "The listing page", url: subjectListingUrl(doc)! }] : []),
      ...(brandWebsiteUrl(doc) ? [{ label: "Your website", url: brandWebsiteUrl(doc)! }] : []),
      ...(footerEmail ? [{ label: "Reply by email", url: `mailto:${footerEmail}` }] : []),
    ]}
    onApply={(ask, url) => {
      const block = doc.blocks.find((b) => b.id === ask.blockId);
      if (!block) return;
      if (block.type === "button") updateBlock({ ...block, props: { ...block.props, url } });
      else if (block.type === "listing") updateBlock({ ...block, props: { ...block.props, linkUrl: url } });
      else if (block.type === "multi-column") {
        const columns = (block.props.columns ?? []).map((c, i) =>
          i === ask.columnIndex ? { ...c, linkUrl: url } : c,
        );
        updateBlock({ ...block, props: { ...block.props, columns } });
      }
    }}
    onClose={() => setLinkAsks([])}
  />
) : null}
```

where `footerEmail` is read from the doc's footer block (`doc.blocks.find((b) => b.type === "footer")?.props.email`). Use the shell's real state variable name for the current doc (grep how `updateBlock` reads it at line 603 and mirror).

- [ ] **Step 3: Verify in the running app**

Run: `bunx next build` (must be green), then `bun run dev`, open the Email Lab, run a build whose template has a labeled button with no URL (e.g. the default "View Full Report" seed), and confirm: modal appears listing the button; a chip writes the URL; skip dismisses without writing.

- [ ] **Step 4: Commit**

```bash
git add components/email-lab/LinkAskModal.tsx components/email-lab/EmailLabGridShell.tsx
git commit -m "feat(email-lab): post-build link-ask modal for click-promising slots" -- components/email-lab/LinkAskModal.tsx components/email-lab/EmailLabGridShell.tsx
```

---

### Task 12: Full verify + ledger

- [ ] **Step 1: Full test + build pass**

Run: `bun test lib/listings/ lib/assistant/ lib/email/ && bunx next build`
Expected: all green. Known flake: the proposal-nonce test — if it reddens, loop it locally before blaming the diff (RULE 1).

- [ ] **Step 2: Drive the real flow (verify skill)**

Invoke the project verify flow: build a listing email in the lab from a pasted listing URL (dev server), confirm: hero photo links to the listing; CTA button has the listing URL; "Recent sales nearby" rows appear with View → links to realtor.com sold pages; chart is "Recent sales near …". Then blast to self and confirm the received email's links resolve and `link_fallbacks` is empty (all preset).

- [ ] **Step 3: Ledger + log**

- Append a SESSION_LOG.md entry (what shipped, the 07/11/2026 permalink-unlock decision, crawl4ai evidence citations, PR/commit ids).
- Sync `_AUDIT_AND_ROADMAP/build-queue.md`.
- The `email_link_destinations_live_verify` check stays OPEN until the live blast-send verification (step 2 on production) — close it only after prod verify, per the checks discipline.
- Do NOT push without operator confirmation.

- [ ] **Step 4: url-lint sanity (spec testing bullet)**

In the blast-to-self of step 2, confirm the response has NO `url_violation` (a doc with captured
permalinks passes the allowlist because they live in the doc's own data) — and that the pre-existing
`lib/deliverable/url-lint` tests still pass in the step-1 run (a constructed URL absent from doc
data still strips/fails; that behavior is untouched).

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2, Task 3 | `lib/listings/steadyapi.ts`, `lib/listings/steadyapi-comps.test.ts` |
| 🟡 | Task 7, Task 8 | `lib/email/build-doc.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
