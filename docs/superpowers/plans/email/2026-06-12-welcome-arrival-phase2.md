# Welcome-Arrival Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 12 files, keywords: migration, schema, architecture

**Goal:** Ship three tested, caller-free building blocks for the welcome-arrival flow — `enrichBrand` (Firecrawl `branding` → Haiku selection over the full color map), `buildArrivalUrl` (pure), and an un-grounded `/api/welcome/chat` explainer — and wire the `/welcome` stub to a live chat.

**Architecture:** `enrichBrand` calls Firecrawl's v2 `branding` format (one call), passes the **whole** labeled `colors`/`components`/`images` sub-objects to `claude-haiku-4-5` with a forced `select_brand` tool, and returns a typed `BrandEnrichment` (nulls on any failure — never SWFL-defaults inside the lib). `buildArrivalUrl` turns that into the `/welcome?name=&primary=&secondary=&logo=` URL the page already parses. The chat route mirrors `/api/converse`'s SSE streaming but strips all grounding and uses a fixed explainer system prompt; a fire-and-forget insert into `welcome_chat_usage` gives Phase 3 observability with zero enforcement.

**Tech Stack:** TypeScript, Next.js App Router (nodejs runtime), `@anthropic-ai/sdk` (already in repo), Firecrawl v2 REST, Supabase service-role client, `bun test`.

**Spec:** `docs/superpowers/specs/2026-06-12-welcome-arrival-phase2-design.md` (source of truth). Funnel is **out of scope** — see `docs/superpowers/plans/2026-06-12-welcome-funnel-phase3-notes.md`.

**Conventions:** Work on `main` (no feature branches — operator decree). Commit per task. **Do NOT push** — pushing is operator-gated and needs a `SESSION_LOG.md` entry (handled at the end, on the operator's word). Never `--no-verify`.

---

## File Structure

```
NEW  lib/prospects/enrich-brand.ts          — enrichBrand() + BrandEnrichment type + select_brand tool
NEW  lib/prospects/enrich-brand.test.ts     — injected fetch + Anthropic, spike fixtures
NEW  lib/prospects/build-arrival-url.ts     — buildArrivalUrl() (pure)
NEW  lib/prospects/build-arrival-url.test.ts
NEW  lib/welcome/chat-usage.ts              — recordWelcomeChat() fire-and-forget telemetry
NEW  app/api/welcome/chat/route.ts          — un-grounded SSE explainer + WELCOME_SYSTEM (exported)
NEW  app/api/welcome/chat/route.test.ts     — mirror converse route test
NEW  app/welcome/WelcomeChat.tsx            — 'use client' live chat surface
NEW  docs/sql/20260612_welcome_chat_usage.sql
EDIT refinery/config/env.mts                — + firecrawlApiKey
EDIT lib/highlighter/meter.ts               — export clientIdFrom as clientIdFromRequest
EDIT app/welcome/page.tsx                    — stub → <WelcomeChat/>
```

---

### Task 1: env key + telemetry table

**Files:**
- Modify: `refinery/config/env.mts` (interface ~line 31, snapshot ~line 79)
- Create: `docs/sql/20260612_welcome_chat_usage.sql`

- [ ] **Step 1: Add `firecrawlApiKey` to the env interface**

In `refinery/config/env.mts`, after the `anthropicApiKey: string | undefined;` line in `interface RefineryEnv`, add:

```ts
  firecrawlApiKey: string | undefined;
```

- [ ] **Step 2: Add it to the snapshot**

In the same file, in `readEnvSnapshot()`, after the `anthropicApiKey: process.env.ANTHROPIC_API_KEY,` line, add:

```ts
    firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
```

- [ ] **Step 3: Typecheck the env change**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "env.mts" || echo "env.mts clean"`
Expected: `env.mts clean`

- [ ] **Step 4: Write the migration**

Create `docs/sql/20260612_welcome_chat_usage.sql`:

```sql
-- Insert-only telemetry for the un-grounded welcome chat (Phase 2). No enforcement;
-- Phase 3 reads this to tune the 20-turn / abuse gate against real data.
CREATE TABLE IF NOT EXISTS public.welcome_chat_usage (
  id          bigint generated always as identity primary key,
  cid         text,
  ip          text,
  turn_count  integer,
  created_at  timestamptz not null default now()
);
GRANT INSERT, SELECT ON public.welcome_chat_usage TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 5: Apply the migration directly (RULE 1 — idempotent)**

Run (reads creds from `.dlt/secrets.toml`):

```bash
python - <<'PY'
import tomllib, psycopg, pathlib
s = tomllib.loads(pathlib.Path(".dlt/secrets.toml").read_text())
# adjust the key path if your secrets.toml nests differently:
cfg = s.get("destination", {}).get("postgres", {}).get("credentials", s)
host = cfg.get("host"); pw = cfg.get("password")
uri = f"postgresql://postgres:{pw}@{host}:5432/postgres"
sql = pathlib.Path("docs/sql/20260612_welcome_chat_usage.sql").read_text()
with psycopg.connect(uri, autocommit=True) as c:
    c.execute(sql)
    n = c.execute("select count(*) from public.welcome_chat_usage").fetchone()[0]
    print("welcome_chat_usage rows:", n)
PY
```

Expected: `welcome_chat_usage rows: 0` (table exists, query succeeds). Re-run once to confirm idempotency (no error).

- [ ] **Step 6: Commit**

```bash
git add refinery/config/env.mts docs/sql/20260612_welcome_chat_usage.sql
git commit -m "feat(welcome): firecrawlApiKey env + welcome_chat_usage telemetry table"
```

---

### Task 2: `enrichBrand` — hybrid enrichment

**Files:**
- Create: `lib/prospects/enrich-brand.ts`
- Test: `lib/prospects/enrich-brand.test.ts`

- [ ] **Step 1: Write the implementation**

Create `lib/prospects/enrich-brand.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, TRIAGE_MODEL } from "@/refinery/agents/anthropic.mts";
import { env } from "@/refinery/config/env.mts";

export type BrandEnrichment = {
  primary: string | null;
  secondary: string | null;
  logo_url: string | null;
  confidence: number; // 0..1; 0 on fallback
  source: "firecrawl-branding+haiku" | "fallback";
  company_name?: string | null;
};

export type EnrichDeps = {
  fetchImpl?: typeof fetch;
  anthropic?: Pick<Anthropic, "messages">;
  firecrawlKey?: string;
};

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

const FALLBACK: BrandEnrichment = {
  primary: null,
  secondary: null,
  logo_url: null,
  confidence: 0,
  source: "fallback",
  company_name: null,
};

const SELECT_BRAND_TOOL = {
  name: "select_brand",
  description: "Record the company's real brand identity selected from the labeled signals.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      primary_hex: {
        type: "string",
        description: "Dominant brand color as #RRGGBB. Never a neutral white/black/near-gray or the background.",
      },
      secondary_hex: { type: "string", description: "Complementary brand color #RRGGBB, or empty string." },
      logo_url: {
        type: "string",
        description: "Best logo URL (prefer images.logo, else ogImage, else favicon), or empty string.",
      },
      company_name: {
        type: "string",
        description: "Company/brand name from images.logoAlt or the domain; empty string if unknown.",
      },
      confidence: { type: "number", description: "0..1 confidence the chosen colors are the real brand colors." },
    },
    required: ["primary_hex", "secondary_hex", "logo_url", "company_name", "confidence"],
  },
} as const;

function normDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}
function absUrl(href: string, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}
function hexOrNull(v: unknown): string | null {
  return typeof v === "string" && HEX_RE.test(v) ? v : null;
}

/**
 * Hybrid prospect brand enrichment. Firecrawl v2 `branding` (one call) senses the
 * palette; claude-haiku-4-5 selects the real primary/secondary from the COMPLETE
 * labeled map (the real brand color often hides under colors.link/accent/buttons).
 * Network I/O but no app coupling — deps are injectable for tests. NEVER throws and
 * NEVER applies SWFL defaults: any failure returns nulls + source "fallback" so the
 * CONSUMER decides defaults.
 */
export async function enrichBrand(domain: string, deps: EnrichDeps = {}): Promise<BrandEnrichment> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const key = deps.firecrawlKey ?? env.firecrawlApiKey;
  if (!key) return FALLBACK;

  const d = normDomain(domain);
  const base = `https://${d}`;

  let branding: Record<string, any> | undefined;
  try {
    const res = await fetchImpl("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: base, formats: ["branding"] }),
    });
    if (!res.ok) return FALLBACK;
    const json = await res.json();
    branding = json?.data?.branding;
    if (!branding) return FALLBACK;
  } catch {
    return FALLBACK;
  }

  // Pass the WHOLE labeled sub-objects verbatim — no key whitelist (forward-compatible).
  const candidates = {
    domain: d,
    colorScheme: branding.colorScheme,
    colors: branding.colors,
    components: branding.components,
    images: branding.images,
    firecrawl_confidence: branding.confidence,
  };

  let input: Record<string, unknown> = {};
  try {
    const client = deps.anthropic ?? getAnthropic();
    const msg = await client.messages.create({
      model: TRIAGE_MODEL,
      max_tokens: 300,
      tools: [SELECT_BRAND_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: "select_brand" },
      messages: [
        {
          role: "user",
          content:
            `Select the REAL brand identity for ${d} from these labeled signals Firecrawl extracted. ` +
            `The real brand color is frequently NOT under "primary" — it often hides under "link", "accent", ` +
            `or a components button color (e.g. a real-estate brand's gold under colors.link). Examine EVERY key. ` +
            `Pick the dominant brand color (never a neutral white/black/near-gray or the background) as primary_hex, ` +
            `a complementary secondary_hex, the best logo_url (prefer images.logo, else ogImage, else favicon), ` +
            `the company_name, and a confidence 0..1.\n\n` +
            JSON.stringify(candidates).slice(0, 12_000),
        },
      ],
    });
    const block = msg.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
    input = (block?.input ?? {}) as Record<string, unknown>;
  } catch {
    return FALLBACK;
  }

  // Logo: Haiku's pick, else the explicit images.logo path. NEVER read branding.logo
  // (top-level) — it is null in this API. Then ogImage, then favicon.
  const rawLogo =
    (typeof input.logo_url === "string" && input.logo_url) ||
    branding.images?.logo ||
    branding.images?.ogImage ||
    branding.images?.favicon ||
    "";
  const company =
    typeof input.company_name === "string" && input.company_name.trim() ? input.company_name.trim() : null;

  return {
    primary: hexOrNull(input.primary_hex),
    secondary: hexOrNull(input.secondary_hex),
    logo_url: absUrl(String(rawLogo), base),
    confidence: typeof input.confidence === "number" ? input.confidence : 0,
    source: "firecrawl-branding+haiku",
    company_name: company,
  };
}
```

> **Deviation from spec (intentional):** the spec specified `strict: true` on the tool. This impl
> omits it. Reason: forced `tool_choice` already guarantees the tool is called, the defensive parse
> (`hexOrNull` + `typeof` guards) handles any missing/malformed field, and `strict` tool support on
> the repo's `@anthropic-ai/sdk` v0.69.0 was **not** vendor-verified in-session — and the mocked
> tests below would not exercise it anyway (so we'd be shipping an untested SDK-feature dependency
> straight to production). Add `strict: true` later once verified live. The defensive parse makes it
> non-load-bearing.

- [ ] **Step 2: Write the failing test (spike fixtures)**

Create `lib/prospects/enrich-brand.test.ts`:

```ts
import { test, expect } from "bun:test";
import { enrichBrand } from "./enrich-brand";

// Real branding shapes captured from the 2026-06-12 vendor bake-off.
const C21 = {
  colorScheme: "light",
  colors: { primary: "#6E5E5E", secondary: "#1D4ED8", accent: "#262627", background: "#FDFCFC", textPrimary: "#121212", link: "#BEAF87" },
  images: { logo: "https://www.century21.com/images/logo/c21-logo-white.svg", favicon: "https://www.century21.com/favicon/C21-favicon.ico", ogImage: "https://www.century21.com/images/home/C21/home-image-600.webp", logoAlt: "C21 Logo" },
  logo: null,
  confidence: 0.8,
};

function firecrawlOk(branding: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify({ success: true, data: { branding } }), { status: 200 })) as unknown as typeof fetch;
}
function anthropicReturning(input: Record<string, unknown>) {
  return { messages: { create: async () => ({ content: [{ type: "tool_use", name: "select_brand", input }] }) } } as any;
}

test("promotes the real brand color even when Firecrawl mislabels it (C21 gold under link)", async () => {
  // Simulate Haiku correctly reading colors.link → primary.
  const out = await enrichBrand("century21.com", {
    fetchImpl: firecrawlOk(C21),
    anthropic: anthropicReturning({ primary_hex: "#BEAF87", secondary_hex: "#262627", logo_url: "https://www.century21.com/images/logo/c21-logo-white.svg", company_name: "Century 21", confidence: 0.85 }),
    firecrawlKey: "fc-test",
  });
  expect(out.primary).toBe("#BEAF87");
  expect(out.source).toBe("firecrawl-branding+haiku");
  expect(out.logo_url).toContain("c21-logo-white.svg");
  expect(out.company_name).toBe("Century 21");
});

test("Firecrawl non-2xx → fallback nulls, confidence 0", async () => {
  const out = await enrichBrand("example.com", {
    fetchImpl: (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch,
    anthropic: anthropicReturning({}),
    firecrawlKey: "fc-test",
  });
  expect(out).toMatchObject({ primary: null, secondary: null, logo_url: null, confidence: 0, source: "fallback" });
});

test("empty branding → fallback", async () => {
  const out = await enrichBrand("nobrand.com", { fetchImpl: firecrawlOk(undefined), anthropic: anthropicReturning({}), firecrawlKey: "fc-test" });
  expect(out.source).toBe("fallback");
});

test("missing firecrawl key → fallback without any network call", async () => {
  let called = false;
  const out = await enrichBrand("x.com", { fetchImpl: (async () => { called = true; return new Response("", { status: 200 }); }) as unknown as typeof fetch, firecrawlKey: "" });
  expect(out.source).toBe("fallback");
  expect(called).toBe(false);
});

test("non-hex primary from Haiku → null; relative logo is absolutized", async () => {
  const out = await enrichBrand("sagerealtor.com", {
    fetchImpl: firecrawlOk({ colors: { primary: "#2EA3F2" }, images: { logo: "/wp-content/logo.png" } }),
    anthropic: anthropicReturning({ primary_hex: "teal", secondary_hex: "", logo_url: "", company_name: "", confidence: 0.3 }),
    firecrawlKey: "fc-test",
  });
  expect(out.primary).toBeNull(); // "teal" fails HEX_RE
  expect(out.logo_url).toBe("https://sagerealtor.com/wp-content/logo.png"); // fell back to images.logo, absolutized
  expect(out.company_name).toBeNull();
});
```

- [ ] **Step 3: Run the tests**

Run: `bun test lib/prospects/enrich-brand.test.ts`
Expected: 5 pass.

- [ ] **Step 4: Typecheck + lint**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "prospects" || echo "clean"`
Run: `bunx eslint lib/prospects/enrich-brand.ts`
Expected: `clean`; eslint no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/prospects/enrich-brand.ts lib/prospects/enrich-brand.test.ts
git commit -m "feat(welcome): enrichBrand hybrid (Firecrawl branding -> Haiku select over full color map)"
```

---

### Task 3: `buildArrivalUrl` — pure URL builder

**Files:**
- Create: `lib/prospects/build-arrival-url.ts`
- Test: `lib/prospects/build-arrival-url.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/prospects/build-arrival-url.test.ts`:

```ts
import { test, expect } from "bun:test";
import { buildArrivalUrl } from "./build-arrival-url";
import type { BrandEnrichment } from "./enrich-brand";

const brand = (o: Partial<BrandEnrichment>): BrandEnrichment => ({
  primary: null, secondary: null, logo_url: null, confidence: 0, source: "fallback", company_name: null, ...o,
});

test("full brand → all params, name encoded", () => {
  const url = buildArrivalUrl({ name: "Joe & Co", brand: brand({ primary: "#ff0000", secondary: "#00ff00", logo_url: "https://x.com/l.png" }) });
  expect(url).toBe("/welcome?name=Joe+%26+Co&primary=%23ff0000&secondary=%2300ff00&logo=https%3A%2F%2Fx.com%2Fl.png");
});

test("invalid hex and non-http logo are dropped", () => {
  const url = buildArrivalUrl({ brand: brand({ primary: "rgb(1,2,3)", logo_url: "javascript:alert(1)" }) });
  expect(url).toBe("/welcome");
});

test("name falls back to company_name", () => {
  const url = buildArrivalUrl({ brand: brand({ company_name: "Acme" }) });
  expect(url).toBe("/welcome?name=Acme");
});

test("null brand → bare /welcome", () => {
  expect(buildArrivalUrl({ brand: null })).toBe("/welcome");
});

test("base → absolute url", () => {
  const url = buildArrivalUrl({ name: "Z", base: "https://www.swfldatagulf.com" });
  expect(url).toBe("https://www.swfldatagulf.com/welcome?name=Z");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test lib/prospects/build-arrival-url.test.ts`
Expected: FAIL — "Cannot find module './build-arrival-url'".

- [ ] **Step 3: Write the implementation**

Create `lib/prospects/build-arrival-url.ts`:

```ts
import type { BrandEnrichment } from "./enrich-brand";

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

/**
 * Build the personalized arrival URL the welcome page parses:
 * /welcome?name=&primary=&secondary=&logo=
 * Honors the page's exact validators (HEX_RE, ^https?://) so the page never
 * receives a value it would reject. Pure — no I/O.
 */
export function buildArrivalUrl(input: { name?: string; brand?: BrandEnrichment | null; base?: string }): string {
  const { brand, base = "" } = input;
  const name = input.name ?? brand?.company_name ?? undefined;
  const params = new URLSearchParams();
  if (name) params.set("name", name);
  if (brand?.primary && HEX_RE.test(brand.primary)) params.set("primary", brand.primary);
  if (brand?.secondary && HEX_RE.test(brand.secondary)) params.set("secondary", brand.secondary);
  if (brand?.logo_url && /^https?:\/\//i.test(brand.logo_url)) params.set("logo", brand.logo_url);
  const qs = params.toString();
  const path = qs ? `/welcome?${qs}` : "/welcome";
  return base ? new URL(path, base).href : path;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test lib/prospects/build-arrival-url.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/prospects/build-arrival-url.ts lib/prospects/build-arrival-url.test.ts
git commit -m "feat(welcome): buildArrivalUrl pure builder honoring welcome-page validators"
```

---

### Task 4: `/api/welcome/chat` — un-grounded explainer + telemetry

**Files:**
- Modify: `lib/highlighter/meter.ts` (export the cookie reader)
- Create: `lib/welcome/chat-usage.ts`
- Create: `app/api/welcome/chat/route.ts`
- Test: `app/api/welcome/chat/route.test.ts`

- [ ] **Step 1: Export the signed-cookie reader from meter**

In `lib/highlighter/meter.ts`, directly below the existing line `export const __clientIdFromForTest = clientIdFrom;`, add:

```ts
/** Public alias for reuse outside the highlighter (e.g. welcome-chat telemetry). */
export { clientIdFrom as clientIdFromRequest };
```

- [ ] **Step 2: Write the telemetry helper**

Create `lib/welcome/chat-usage.ts` (mirror meter's import style — the service-role module sits two levels up, same depth as `lib/highlighter`):

```ts
import { createServiceRoleClient } from "../../utils/supabase/service-role";
import { clientIdFromRequest } from "../highlighter/meter";

function ipFrom(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

/**
 * Insert-only telemetry for the welcome chat. Zero enforcement — Phase 3 reads
 * welcome_chat_usage to tune the gate. Never throws (must not break the stream).
 */
export async function recordWelcomeChat(request: Request, turnCount: number): Promise<void> {
  try {
    const db = createServiceRoleClient();
    await db.from("welcome_chat_usage").insert({
      cid: clientIdFromRequest(request),
      ip: ipFrom(request),
      turn_count: turnCount,
    });
  } catch {
    // telemetry must never break the chat
  }
}
```

> If the relative path `../../utils/supabase/service-role` does not resolve, confirm the exact module `lib/highlighter/meter.ts` imports `createServiceRoleClient` from (line 2) and match it.

- [ ] **Step 3: Write the route**

Create `app/api/welcome/chat/route.ts`. The `extractText` helper is copied verbatim from `app/api/converse/route.ts` (lines 27-51) — it iterates the SDK MessageStream:

```ts
import { getAnthropic, TRIAGE_MODEL } from "@/refinery/agents/anthropic.mts";
import { recordWelcomeChat } from "@/lib/welcome/chat-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOKENS = 500;
const MAX_HISTORY = 12;

const FORMAT_RULE =
  "CRITICAL: Respond in plain text ONLY. " +
  "NEVER use markdown — no asterisks (* or **), no # headers, no - bullet lists, no backticks (`), no > blockquotes. " +
  "Plain prose sentences only. If you use any markdown symbol the answer will be unreadable to the user.\n\n";

export const WELCOME_SYSTEM =
  "You are the assistant for SWFL Data Gulf — live, cited intelligence on Southwest Florida " +
  "(Lee, Collier, Charlotte, Glades, Hendry, Sarasota) real estate, building permits, flood risk, " +
  "freight, tourism, and the local economy, down to the ZIP and named-place level. You are talking to a " +
  "visitor who hasn't signed up yet. Explain plainly what the platform can do and how it would help their " +
  "work. Speak in illustrative ranges, never specific current statistics — for example, beachfront and " +
  "barrier-island ZIPs carry the region's steepest flood-loss estimates while inland corridors are far " +
  "lower; never a precise dollar figure. You do NOT have live data in this conversation. If asked for a " +
  "specific number (a flood loss, a sale price, a rate), do NOT make one up and do NOT guess — say that's " +
  "exactly what a project builds (a cited, branded one-pager) and steer them to sign up: \"sign up and you " +
  "can build it\". Inventing a Southwest Florida number is the one thing you must never do. Be a " +
  "knowledgeable, direct local expert, not a salesperson, and never use internal jargon (no \"master\", " +
  "\"brain\", \"payload\", \"grain\", \"dossier\").";

/**
 * Yield text from the SDK MessageStream. Copied verbatim from
 * app/api/converse/route.ts:27-51 (SDK v0.69.0 has no .textStream on the real
 * stream; mocks/future SDKs may — check it first).
 */
async function* extractText(
  ai: AsyncIterable<unknown> & { textStream?: AsyncIterable<string> },
): AsyncIterable<string> {
  if (ai.textStream) {
    yield* ai.textStream;
    return;
  }
  for await (const event of ai) {
    const e = event as { type?: string; delta?: { type?: string; text?: string } };
    if (e.type === "content_block_delta" && e.delta?.type === "text_delta" && typeof e.delta.text === "string") {
      yield e.delta.text;
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: { messages?: { role?: string; content?: string }[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const all = Array.isArray(body.messages) ? body.messages : [];
  const messages = all
    .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
    .slice(-MAX_HISTORY) as { role: "user" | "assistant"; content: string }[];

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "messages required (last must be user)" }, { status: 400 });
  }

  // Fire-and-forget telemetry — zero enforcement.
  void recordWelcomeChat(request, messages.length);

  const system = FORMAT_RULE + WELCOME_SYSTEM;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const client = getAnthropic();
        const ai = client.messages.stream({
          model: TRIAGE_MODEL, // claude-haiku-4-5
          max_tokens: MAX_TOKENS,
          system,
          messages,
        });
        for await (const text of extractText(ai)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (e) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: (e as Error).message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 4: Write the route test (mirror converse)**

Create `app/api/welcome/chat/route.test.ts`:

```ts
import { test, expect, mock } from "bun:test";

mock.module("@/refinery/agents/anthropic.mts", () => ({
  TRIAGE_MODEL: "claude-haiku-4-5",
  getAnthropic: () => ({
    messages: {
      stream: () => ({
        async *[Symbol.asyncIterator]() {},
        textStream: (async function* () {
          yield "We track flood risk, permits, ";
          yield "and prices across Southwest Florida.";
        })(),
      }),
    },
  }),
}));
mock.module("@/lib/welcome/chat-usage", () => ({ recordWelcomeChat: async () => {} }));

const { POST, WELCOME_SYSTEM } = await import("./route");

test("system prompt forbids inventing a SWFL number and steers to sign-up", () => {
  const lc = WELCOME_SYSTEM.toLowerCase();
  expect(lc).toContain("never");
  expect(lc).toContain("sign up");
  expect(lc).not.toContain("freshness_token"); // un-grounded: no payload mechanics leak
});

test("streams the explainer text", async () => {
  const req = new Request("https://x/api/welcome/chat", {
    method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: "what can you do?" }] }),
  });
  const res = await POST(req);
  expect(res.status).toBe(200);
  const body = await res.text();
  expect(body).toContain("Southwest Florida");
  expect(body).toContain('"done":true');
});

test("400 on empty/non-user-last messages", async () => {
  const req = new Request("https://x/api/welcome/chat", { method: "POST", body: JSON.stringify({ messages: [] }) });
  expect((await POST(req)).status).toBe(400);
});

test("400 on bad json", async () => {
  const req = new Request("https://x/api/welcome/chat", { method: "POST", body: "{not json" });
  expect((await POST(req)).status).toBe(400);
});
```

- [ ] **Step 5: Run the tests**

Run: `bun test app/api/welcome/chat/route.test.ts`
Expected: 4 pass.

- [ ] **Step 6: Confirm no grounding leaked in (structural)**

Run: `grep -E "fetchBrain|buildDossier|RULES_OF_ENGAGEMENT|routeChart" app/api/welcome/chat/route.ts && echo "LEAK" || echo "un-grounded OK"`
Expected: `un-grounded OK`.

- [ ] **Step 7: Typecheck + lint + commit**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "welcome|chat-usage|meter" || echo clean`
Run: `bunx eslint app/api/welcome/chat/route.ts lib/welcome/chat-usage.ts lib/highlighter/meter.ts`

```bash
git add lib/highlighter/meter.ts lib/welcome/chat-usage.ts app/api/welcome/chat/route.ts app/api/welcome/chat/route.test.ts
git commit -m "feat(welcome): un-grounded /api/welcome/chat explainer + insert-only usage telemetry"
```

---

### Task 5: Wire the welcome stub → live chat

**Files:**
- Create: `app/welcome/WelcomeChat.tsx`
- Modify: `app/welcome/page.tsx`

- [ ] **Step 1: Write the client chat component**

Create `app/welcome/WelcomeChat.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

/** The four hardcoded arrival prompts. All open the chat; #2 and #4 are conversion prompts. */
const PROMPTS = [
  "What can you do?",
  "Build me a daily market email like the one that brought me here",
  "Create a PDF comparing two ZIP codes in Southwest Florida",
  "Show me how you work inside my own AI tools",
];

export default function WelcomeChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/welcome/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.replace(/^data: /, "").trim();
          if (!line) continue;
          const evt = JSON.parse(line) as { text?: string; done?: boolean; error?: string };
          if (evt.text) {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + evt.text };
              return copy;
            });
          }
        }
        scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
      }
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: "Sorry — something went wrong. Try again." };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      {messages.length === 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              className="rounded-lg border border-gulf-haze bg-gulf-slate px-4 py-3 text-left text-sm text-text-primary transition-colors hover:border-[color:var(--brand-primary)]"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gulf-haze bg-gulf-deep p-5">
        <div ref={scrollRef} className="mb-4 max-h-80 space-y-3 overflow-y-auto">
          {messages.map((m, i) => (
            <p
              key={i}
              className={
                m.role === "user"
                  ? "text-sm font-medium text-text-primary"
                  : "whitespace-pre-wrap text-sm text-text-secondary"
              }
            >
              {m.content || (busy ? "…" : "")}
            </p>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 rounded-lg border border-gulf-haze bg-gulf-slate px-4 py-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="Ask about SWFL real estate, permits, flood risk…"
            className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-text-on-accent disabled:opacity-50"
            style={{ background: "var(--brand-primary)" }}
          >
            Send
          </button>
        </form>
        <p className="mt-3 font-mono text-[11px] text-text-tertiary">
          Building, branded deliverables, and your own AI tools come with a plan.{" "}
          <a href="/pricing" className="text-gulf-teal underline underline-offset-2">
            See pricing →
          </a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the stub in the page**

In `app/welcome/page.tsx`: (a) add the import at the top:

```tsx
import WelcomeChat from "./WelcomeChat";
```

(b) Delete the `PROMPTS` const (lines 8-14) — it now lives in `WelcomeChat.tsx`. (c) Replace the two JSX blocks — the `{/* Four arrival prompts … */}` grid (the `<div className="mt-8 grid …">` … `</div>`) **and** the `{/* Stubbed chat surface … */}` block (the `<div className="mt-8 rounded-xl …">` … `</div>`) — with a single:

```tsx
      <WelcomeChat />
```

Leave the `<main>` wrapper (with the `--brand-primary/secondary` CSS vars), the `<header>` logo block, and the `<h1>`/`<p>` intact. The `PROMPTS`-related code is the only logic removed.

- [ ] **Step 3: Typecheck + lint + build the page route**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "welcome" || echo clean`
Run: `bunx eslint app/welcome/page.tsx app/welcome/WelcomeChat.tsx`
Expected: `clean`; eslint passes (the page keeps its existing `eslint-disable` for the logo `<img>`).

- [ ] **Step 4: Manual browser smoke (NOT headless-verifiable — do not skip, do not fake)**

Run the dev server (`bun run dev` or the repo's start script), then in a browser:
1. Open `http://localhost:3000/welcome` — the 4 prompt buttons render; clicking one streams a plain-text explainer answer.
2. Ask "what's the flood AAL for 33931?" — the answer **refuses to give a number** and steers to sign-up (moat check).
3. Open `http://localhost:3000/welcome?name=Acme&primary=%23ff0000&logo=https://x/l.png` — header shows the logo, "Welcome, Acme", and the Send button is red (`--brand-primary` applied).

Record the outcome in the PR/commit notes. If step 2 ever returns a concrete SWFL figure, that's a moat failure — stop and fix the system prompt before shipping.

- [ ] **Step 5: Commit**

```bash
git add app/welcome/WelcomeChat.tsx app/welcome/page.tsx
git commit -m "feat(welcome): wire welcome stub to live un-grounded chat (all 4 prompts -> chat)"
```

---

## Final verification

- [ ] Run the full new suite: `bun test lib/prospects/ app/api/welcome/`
  Expected: all green (14 tests: 5 enrich + 5 arrival + 4 route).
- [ ] `bunx tsc --noEmit -p tsconfig.json` shows no NEW errors in touched files (the repo has accepted baseline strictness debt elsewhere — compare against `git stash` baseline if unsure).
- [ ] Delete throwaway spikes if any remain: `ls scripts/spike 2>/dev/null` should be empty (already removed during design).
- [ ] **Push is operator-gated.** Before any `git push`: add a top-of-file `SESSION_LOG.md` entry (what shipped + file paths + this plan link), then `node scripts/safe-push.mjs`. Do NOT push autonomously.

## Out of scope (Phase 3 — do NOT build here)

`welcome_sessions`, turn-4 email gate, 20-turn enforcement, the grounded free branded build, `free_build_used` check-and-set, the cold-outreach caller. Tracked: `docs/superpowers/plans/2026-06-12-welcome-funnel-phase3-notes.md` + ledger `phase3_welcome_funnel`.
