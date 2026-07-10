# Insiders Edition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 16 tasks, 26 files, 3 conflict groups, keywords: migration, schema, architecture

**Spec:** `docs/superpowers/specs/2026-07-10-insiders-edition-design.md` (read it first — this plan implements it verbatim, including the 07/10/2026 budget amendments).
**Check:** `insiders_edition_live_verify` (already open).

**Goal:** A Fable 5–authored monthly flagship briefing (plus event minis) built by a deterministic dossier → metered two-pass authoring → deterministic materialization pipeline, with a `_FABLE5/` editorial desk, a $20/issue budget ledger, and an operator-gated send ladder cloned from weekly-read.

**Architecture:** Deterministic sandwich. Code assembles a typed `IssueDossier` (brains + news + desk picks + anchors); `claude-fable-5` authors a structured `IssueDoc` (prose + chart REQUESTS, never chart data) in 1–2 metered passes under a hard ledger; code resolves charts through `buildChartForQuestion`, runs the existing no-invention lints, renders through the ONE renderer `renderEmailDocHtml`, and a runner cloned from `weekly-read-run.mts` gates every send behind the operator.

**Tech Stack:** TypeScript (Bun scripts + Next.js App Router), `@anthropic-ai/sdk` via the ONE metered client (`refinery/agents/anthropic.mts`), Supabase (service-role), zod, `bun:test`.

## Global Constraints

- Model ID exactly `claude-fable-5`; refusal fallback exactly `betas: ["server-side-fallback-2026-06-01"]` + `fallbacks: [{ model: "claude-opus-4-8" }]`. OMIT the `thinking` param (always on; explicit config 400s). No assistant prefill. Stream every authoring call.
- Pricing constants: `claude-fable-5` = $10/1M input, $50/1M output (platform.claude.com pricing via claude-api skill reference, verified 07/10/2026). Cache read 10% of input rate, cache write 1.25× — already encoded in `computeCostUsd`.
- **Budget (operator ruling 07/10/2026):** per-issue hard cap `INSIDERS_MAX_SPEND_USD` default **20**. Early issues run rich (two passes, `INSIDERS_EFFORT` default `"xhigh"`; `"max"` is the operator's dial). No blanket no-paid-API rule. All calls route through `getAnthropic(...)` — never a raw `new Anthropic(...)` outside `refinery/agents/anthropic.mts` (Gate 6 blocks it at push).
- **Operator gates:** heads-up to the operator BEFORE the first live authoring run (Task 11 STOP). Operator approves EVERY send (`INSIDERS_APPROVED=1` + postal + verified From). `DRY_RUN` default true gates sending; `INSIDERS_LIVE_AUTHOR=1` separately gates real (paid) authoring so a key in env can't spend by accident.
- Four-lane sourcing: every figure in issue prose must anchor to the dossier feed or chart grounding figures (reuse `lib/deliverable/narrative-lint` primitives — ONE tokenizer, never a fork). Lint failure blocks the issue; nothing auto-fixes prose. As-of date MM/DD/YYYY stated exactly once. No system nouns/pack IDs in issue copy.
- C2: no new mandatory pre-materialization gate — only existing lint seams, reused inside the composer.
- Repo discipline: `git add` explicit paths only (parallel-session zip-page files are uncommitted in this tree — never stage `app/r/zip-report/*`). Push via `node scripts/safe-push.mjs`. SESSION_LOG entry every push. `package.json` change → `bun install` + stage `bun.lock` same push (Gate 1). New GHA secret → `gh secret set` + workflow `env:` wiring same push (Gate 3). The Phase C workflow push adds an `ANTHROPIC_API_KEY` line → push with `ALLOW_PAID_SURFACE=1` and say so in SESSION_LOG (Gate 6 escape hatch, deliberate).
- Verify TS with `bunx next build` (never `npx tsc`). Unit/integration tests with `bun test <path>`.
- `_FABLE5/` files: no raw crawl output ever committed (`*crawl4ai*` gitignore stands); desk entries are URLs + one-liners.

---

## Phase A — The Desk (`_FABLE5/` + hook)

### Task 1: Desk log parser + shape check

**Files:**
- Create: `lib/email/insiders/desk.ts`
- Test: `lib/email/insiders/desk.test.ts`

**Interfaces:**
- Produces: `DeskEntry`, `DeskLog`, `parseDeskLog(md: string): DeskParseResult` — consumed by Task 7 (dossier) and Task 2 (hook reads frontmatter only).

Desk file format (one file per month, `_FABLE5/desk/YYYY-MM.md`):

```markdown
---
month: 2026-07
last_visited: 2026-07-10
last_seen_published_at: 2026-07-10T14:00:00Z
---

## 07/10/2026
- [4] Lee County expands road impact fees · url: https://www.news-press.com/... · areas: 33905, 33971 · series: permits YoY by ZIP · why: direct cost shock to new construction pricing
- [2] Naples hotel occupancy slips in June · url: https://www.naplesnews.com/... · areas: 34102 · series: tourism occupancy trend · why: soft signal, watch July
```

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/insiders/desk.test.ts
import { describe, expect, test } from "bun:test";
import { parseDeskLog } from "./desk";

const GOOD = `---
month: 2026-07
last_visited: 2026-07-10
last_seen_published_at: 2026-07-10T14:00:00Z
---

## 07/10/2026
- [4] Lee County expands road impact fees · url: https://example.com/a · areas: 33905, 33971 · series: permits YoY by ZIP · why: cost shock to new construction
- [2] Naples occupancy slips · url: https://example.com/b · areas: 34102 · series: tourism occupancy trend · why: soft signal
`;

describe("parseDeskLog", () => {
  test("parses frontmatter and weighted entries", () => {
    const r = parseDeskLog(GOOD);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.log.month).toBe("2026-07");
    expect(r.log.lastVisited).toBe("2026-07-10");
    expect(r.log.entries).toHaveLength(2);
    expect(r.log.entries[0]).toMatchObject({
      weight: 4,
      headline: "Lee County expands road impact fees",
      url: "https://example.com/a",
      areas: ["33905", "33971"],
      seriesHint: "permits YoY by ZIP",
      why: "cost shock to new construction",
      day: "07/10/2026",
    });
  });

  test("weight outside 1-5, missing url, or missing why fails shape check with named errors", () => {
    const bad = GOOD.replace("[4]", "[9]").replace("url: https://example.com/b · ", "");
    const r = parseDeskLog(bad);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toContain("weight");
    expect(r.errors.join(" ")).toContain("url");
  });

  test("missing frontmatter fails", () => {
    const r = parseDeskLog("## 07/10/2026\n- [3] x · url: https://e.com · why: y");
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/insiders/desk.test.ts`
Expected: FAIL — `Cannot find module './desk'`

- [ ] **Step 3: Implement the parser**

```ts
// lib/email/insiders/desk.ts
//
// The _FABLE5/ desk log parser — the ONLY reader of desk files. The dossier
// assembler (dossier.ts) and the desk SessionStart hook both consume this, so a
// malformed desk file fails HERE (shape check), never silently poisons issue day
// (spec: Error handling — "malformed desk file → fall back to raw scored events").

export interface DeskEntry {
  day: string; // MM/DD/YYYY (the ## heading it sits under)
  weight: 1 | 2 | 3 | 4 | 5;
  headline: string;
  url: string;
  areas: string[]; // free text tokens — ZIPs or place names
  seriesHint: string | null;
  why: string;
}

export interface DeskLog {
  month: string; // YYYY-MM
  lastVisited: string; // YYYY-MM-DD
  lastSeenPublishedAt: string | null; // ISO timestamp
  entries: DeskEntry[];
}

export type DeskParseResult = { ok: true; log: DeskLog } | { ok: false; errors: string[] };

const FRONT_RE = /^---\n([\s\S]*?)\n---/;
const DAY_RE = /^## (\d{2}\/\d{2}\/\d{4})\s*$/;
const ENTRY_RE = /^- \[(\d)\] (.+)$/;

function frontValue(front: string, key: string): string | null {
  const m = front.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

export function parseDeskLog(md: string): DeskParseResult {
  const errors: string[] = [];
  const fm = md.match(FRONT_RE);
  if (!fm) return { ok: false, errors: ["missing frontmatter (--- month/last_visited ---)"] };
  const month = frontValue(fm[1], "month");
  const lastVisited = frontValue(fm[1], "last_visited");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) errors.push("frontmatter: month must be YYYY-MM");
  if (!lastVisited || !/^\d{4}-\d{2}-\d{2}$/.test(lastVisited))
    errors.push("frontmatter: last_visited must be YYYY-MM-DD");

  const entries: DeskEntry[] = [];
  let day: string | null = null;
  for (const line of md.slice(fm[0].length).split("\n")) {
    const d = line.match(DAY_RE);
    if (d) {
      day = d[1];
      continue;
    }
    const e = line.match(ENTRY_RE);
    if (!e) continue;
    const weight = Number(e[1]);
    if (weight < 1 || weight > 5) {
      errors.push(`entry weight out of range 1-5: "${line.slice(0, 60)}"`);
      continue;
    }
    // " · " separates fields; first field is the headline, the rest are key: value.
    const parts = e[2].split(" · ").map((p) => p.trim());
    const headline = parts[0] ?? "";
    const kv = new Map<string, string>();
    for (const p of parts.slice(1)) {
      const i = p.indexOf(":");
      if (i > 0) kv.set(p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim());
    }
    const url = kv.get("url") ?? "";
    const why = kv.get("why") ?? "";
    if (!day) errors.push(`entry before any ## MM/DD/YYYY heading: "${headline}"`);
    if (!/^https?:\/\//.test(url)) errors.push(`entry missing url: "${headline}"`);
    if (!why) errors.push(`entry missing why: "${headline}"`);
    if (!day || !/^https?:\/\//.test(url) || !why) continue;
    entries.push({
      day,
      weight: weight as DeskEntry["weight"],
      headline,
      url,
      areas: (kv.get("areas") ?? "").split(",").map((a) => a.trim()).filter(Boolean),
      seriesHint: kv.get("series") ?? null,
      why,
    });
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    log: {
      month: month!,
      lastVisited: lastVisited!,
      lastSeenPublishedAt: frontValue(fm[1], "last_seen_published_at"),
      entries,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/insiders/desk.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/email/insiders/desk.ts lib/email/insiders/desk.test.ts
git commit -m "feat(insiders): desk log parser + shape check (Phase A)"
```

### Task 2: `_FABLE5/` scaffold + desk SessionStart hook

**Files:**
- 🔴 Create: `_FABLE5/FABLE5.md`, `_FABLE5/MINDMAP.md`, `_FABLE5/playbook.md`, `_FABLE5/desk/2026-07.md`, `_FABLE5/retro/TEMPLATE.md`
- Create: `.claude/hooks/print-desk-status.mjs`
- Modify: `.claude/settings.json` (register the hook under the existing SessionStart list, after `print-kickoff.mjs`)

**Interfaces:**
- Consumes: desk file format from Task 1 (hook reads frontmatter with its own 6-line regex — hooks are dependency-free `.mjs`, they do not import TS).
- Produces: the standing desk workspace every future session boots from.

- [ ] **Step 1: Write the scaffold files**

`_FABLE5/FABLE5.md` (ONE page, hard cap — thin index, not a diary):

```markdown
# FABLE5 — editorial desk boot file (read me in ~1 minute)

## Read order (fresh session)
1. SessionStart output (SESSION_LOG tail + open checks + desk status line).
2. This file. 3. `MINDMAP.md` (systems map). 4. `desk/<current-month>.md`.
5. `playbook.md` before authoring anything.

## What this desk is
Daily editorial triage for the **Insiders Edition** (monthly Fable 5 flagship +
event minis). Spec: `docs/superpowers/specs/2026-07-10-insiders-edition-design.md`.
Plan: `docs/superpowers/plans/2026-07-10-insiders-edition-plan.md`.

## Daily visit (first session of the day)
1. Pull news items newer than desk frontmatter `last_seen_published_at`
   (table `news_articles_swfl`).
2. HANDPICK what matters for the publication (editorial judgment, not the cron's
   project-radius score). Add each pick to `desk/<month>.md`: weight 1–5 + one-line
   why + areas + candidate series pairing.
3. Weight 5 → propose a mini same-session (draft + preview + park for approval).
4. Quiet day → log "nothing desk-worthy" under today's heading. Update frontmatter
   `last_visited` + `last_seen_published_at` every visit.

## Pointers (never copies)
- Open obligations → `node scripts/check.mjs list` (check: insiders_edition_live_verify)
- History → SESSION_LOG.md · Craft → playbook.md · Retros → retro/

## State of the desk (≤5 lines, update each visit)
- 07/10/2026: desk opened; no issues shipped yet; composer being built (Phase B).
```

`_FABLE5/playbook.md` (stub — grows only via retros):

```markdown
# Insiders Edition playbook — accumulated editorial craft

Update ONLY from retros (retro/<issue>.md → Tweaks). Never speculative.

## Standing craft (v0 — from the brainstorm, unproven)
- Lead with the month's ONE thesis; every story must serve it or be cut.
- An analog earns its place with named-source figures, else it's filler.
- A projection without a falsifier is an opinion; cut or falsify it.
- Charts answer "so what", not "what data do we have".
```

`_FABLE5/desk/2026-07.md` (live desk file, seeded empty):

```markdown
---
month: 2026-07
last_visited: 2026-07-10
last_seen_published_at: 2026-07-10T00:00:00Z
---

## 07/10/2026
- (desk opened — no triage yet)
```

Note: the `- (desk opened — no triage yet)` line intentionally does NOT match the
entry regex and parses as zero entries; `parseDeskLog` returns ok with `entries: []`.

`_FABLE5/retro/TEMPLATE.md`:

```markdown
# Retro — <issue-slug> (sent MM/DD/YYYY)

## 1. Tweaks (small + concrete → apply to playbook.md + authoring skeleton NOW)
- ...

## 2. Promotions (generalizes to user builds → OPEN A CHECK THIS SESSION, RULE 2.4)
- finding → `node scripts/check.mjs open insiders <key> "<label>"`

## 3. Capability gaps (data/charts/sources we wished we held → build-queue entries)
- ...

## Map drift
Did MINDMAP.md lie this month? Fix it in this same commit: yes/no + what.

## Spend
Ledger total $X.XX vs cap $20 — passes: draft $A, editor $B. Next-issue tuning: ...
```

`_FABLE5/MINDMAP.md`: write the five sections named in spec Section 5 (boot sequence, information estate, four-lane sourcing + guardrail bite-points, full insiders pipeline, promotion paths) as prose + one mermaid `flowchart TD` of desk → dossier → author (draft→editor) → materialize (charts+lints) → preview → operator approve → send + `/r/insiders/[issue]`, with retro → playbook/checks/build-queue back-edges. Content sources: spec Sections 2–5 + `docs/ontology-and-roadmap.md`. Keep it one file, ~150 lines.

- [ ] **Step 2: Write the hook (mirror `print-kickoff.mjs`'s fail-open Supabase pattern)**

```js
#!/usr/bin/env node
// .claude/hooks/print-desk-status.mjs — SessionStart. ONE line of desk status:
//   "Desk: last visited 07/09 (1 day ago) · 4 news items since — run the desk triage"
// Fail-OPEN and fast: any error or >1500ms → print nothing and exit 0. Reads the
// desk file locally; counts news via PostgREST HEAD count (same env vars
// print-kickoff.mjs already uses). Never blocks a session.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const month = new Date().toISOString().slice(0, 7);
try {
  const md = readFileSync(join(process.cwd(), "_FABLE5", "desk", `${month}.md`), "utf8");
  const visited = md.match(/^last_visited:\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
  const seen = md.match(/^last_seen_published_at:\s*(\S+)/m)?.[1];
  if (!visited) process.exit(0);
  const days = Math.floor((Date.now() - new Date(`${visited}T00:00:00Z`).getTime()) / 86400000);
  let newsLine = "";
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (url && key && seen) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(
        `${url}/rest/v1/news_articles_swfl?select=id&published_at=gt.${encodeURIComponent(seen)}`,
        { method: "HEAD", headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" }, signal: ctrl.signal },
      );
      clearTimeout(t);
      const n = res.headers.get("content-range")?.split("/")[1];
      if (n && n !== "*") newsLine = ` · ${n} news item(s) since`;
    } catch { /* fail open */ }
  }
  const [y, m, d] = visited.split("-");
  const stale = days >= 1 ? ` — run the desk triage (_FABLE5/FABLE5.md)` : "";
  console.log(`Desk: last visited ${m}/${d}/${y} (${days}d ago)${newsLine}${stale}`);
} catch { /* no desk file for this month yet — say so, cheaply */
  console.log(`Desk: no desk file for ${month} — create _FABLE5/desk/${month}.md (see _FABLE5/FABLE5.md)`);
}
```

Register in `.claude/settings.json`: add `node .claude/hooks/print-desk-status.mjs` to the SessionStart hooks array immediately after the `print-kickoff.mjs` entry (copy that entry's exact object shape — matcher/timeout fields included).

- [ ] **Step 3: Verify the hook manually**

Run: `node .claude/hooks/print-desk-status.mjs`
Expected: one `Desk: last visited 07/10 (0d ago)...` line, exit 0. Also run once with `_FABLE5/desk/<month>.md` renamed away → expects the "no desk file" line, exit 0.

- [ ] **Step 4: Verify column name before shipping the hook**

The HEAD count assumes `news_articles_swfl.published_at`. Probe:
`bun -e "const {createServiceRoleClient}=await import('./utils/supabase/service-role');const db=createServiceRoleClient();const r=await db.from('news_articles_swfl').select('*').limit(1);console.log(r.error??Object.keys(r.data?.[0]??{}))"`
If the timestamp column differs (e.g. `published`, `captured_at`), fix the hook and Task 7's query to the real name. If the select 401/42501s, apply the dlt→PostgREST grant (memory: `feedback_dlt-postgrest-grant`) via an idempotent Bun.SQL migration before continuing.

- [ ] **Step 5: Commit**

```bash
git add _FABLE5/ .claude/hooks/print-desk-status.mjs .claude/settings.json
git commit -m "feat(insiders): _FABLE5 desk scaffold + SessionStart desk-status hook (Phase A)"
```

---

## Phase B — Composer

### Task 3: Metered client learns Fable 5 (rates + call type + beta surface)

**Files:**
- Modify: `refinery/agents/anthropic.mts` (RATES ~line 45, CallType ~line 19, wrapper ~lines 290–349)
- Test: `refinery/agents/spend-guard.test.mts` (extend)

**Interfaces:**
- Produces: `getAnthropic("insiders_author").beta.messages.stream(...)` — metered, spend-guarded, usage-logged; `RATES["claude-fable-5"]`. Consumed by Task 6.

- [ ] **Step 1: Failing tests** — extend `spend-guard.test.mts` (mirror its existing harness style) with: (a) `computeCostUsd("claude-fable-5", {input_tokens: 1_000_000, output_tokens: 100_000})` → `10 + 5 = 15`; (b) the beta surface is wrapped: build the same fake-client fixture the existing wrapper tests use, add a `beta.messages.create/stream` to the fake, and assert a call through `getAnthropic(...).beta.messages.create` triggers the spend gate + logs usage exactly like the non-beta path.

Run: `bun test refinery/agents/spend-guard.test.mts` — expected: new tests FAIL (rate 0; beta unwrapped).

- [ ] **Step 2: Implement**

```ts
// CallType union — add:
  | "insiders_author"

// RATES — add (source: platform.claude.com pricing via claude-api skill, 07/10/2026;
// mirror swfldatagulf-ops/lib/spend.ts in the ops repo — see Step 4):
  "claude-fable-5": { in: 10.0, out: 50.0 },
```

Generalize `wrapMessages` to take the message surface instead of the whole client, then wrap both surfaces:

```ts
type MessageSurface = Pick<Anthropic["messages"], "create" | "stream">;

function wrapMessages<M extends MessageSurface>(real: M, callType: CallType): M {
  const realCreate = real.create.bind(real);
  const realStream = real.stream.bind(real);
  // ...wrappedCreate/wrappedStream bodies UNCHANGED from today (same spend gate +
  // logApiUsage hooks)...
  return new Proxy(real, {
    get(target, prop, _receiver) {
      if (prop === "create") return wrappedCreate;
      if (prop === "stream") return wrappedStream;
      return Reflect.get(target, prop, target);
    },
  });
}

// In getAnthropic(): wrap BOTH surfaces and intercept both props.
const wrappedMessages = wrapMessages(raw.messages, callType);
const wrappedBetaMessages = wrapMessages(raw.beta.messages as unknown as MessageSurface, callType);
const wrappedBeta = new Proxy(raw.beta, {
  get(target, prop, _receiver) {
    if (prop === "messages") return wrappedBetaMessages;
    return Reflect.get(target, prop, target);
  },
});
const wrapped = new Proxy(raw, {
  get(target, prop, _receiver) {
    if (prop === "messages") return wrappedMessages;
    if (prop === "beta") return wrappedBeta;
    return Reflect.get(target, prop, target);
  },
}) as Anthropic;
```

Update the file-top comment that says only `.messages.*` is wrapped (it documents a grep that is no longer true once insiders uses `client.beta.messages`).

- [ ] **Step 3: SDK version check.** `bun pm ls @anthropic-ai/sdk` (package.json floor is ^0.106.0). Then compile-probe the Fable params: write Task 6's `stream({ model: "claude-fable-5", betas: [...], fallbacks: [...], output_config: {...} })` call and run `bunx next build`. If `betas`/`fallbacks`/`output_config` are not typed on `beta.messages.stream`, run `bun update @anthropic-ai/sdk`, re-run `bun install`, stage `bun.lock` with the same commit (Gate 1), and re-run `bun test refinery/agents/spend-guard.test.mts` + `bunx next build` to confirm no other call site broke. Only if the latest SDK still lacks a typed param, pass that param via a single `as unknown as Parameters<typeof stream>[0]` cast at the call site with a dated comment.

- [ ] **Step 4: Run tests, open the ops-mirror check, commit**

Run: `bun test refinery/agents/spend-guard.test.mts` — PASS.
The RATES comment says it mirrors `swfldatagulf-ops/lib/spend.ts` (separate repo — ops pages belong there). Open the obligation now, RULE 2.4:
`node scripts/check.mjs open insiders ops_spend_rate_fable5 "Mirror claude-fable-5 $10/$50 rate into swfldatagulf-ops lib/spend.ts"`

```bash
git add refinery/agents/anthropic.mts refinery/agents/spend-guard.test.mts package.json bun.lock
git commit -m "feat(insiders): meter claude-fable-5 — rates, insiders_author call type, beta.messages wrapped (Phase B)"
```

### Task 4: Issue budget ledger

**Files:**
- Create: `lib/email/insiders/budget.ts`
- Test: `lib/email/insiders/budget.test.ts`

**Interfaces:**
- Consumes: `computeCostUsd`, `UsageLike` from `refinery/agents/anthropic.mts` (exported, verified).
- Produces: `IssueBudget` with `record(pass, model, usage): LedgerEntry`, `spentUsd(): number`, `assertRoom(nextPassEstimateUsd: number): void` (throws `IssueBudgetError`), `entries: LedgerEntry[]`. Consumed by Tasks 6 and 8.

- [ ] **Step 1: Failing test**

```ts
// lib/email/insiders/budget.test.ts
import { describe, expect, test } from "bun:test";
import { IssueBudget, IssueBudgetError } from "./budget";

const MTOK = 1_000_000;

describe("IssueBudget", () => {
  test("records passes at real model rates and sums", () => {
    const b = new IssueBudget(20);
    // 250K in + 30K out on fable-5 = $2.50 + $1.50 = $4.00
    const e = b.record("draft", "claude-fable-5", { input_tokens: 0.25 * MTOK, output_tokens: 0.03 * MTOK });
    expect(e.costUsd).toBeCloseTo(4.0, 2);
    expect(b.spentUsd()).toBeCloseTo(4.0, 2);
  });

  test("assertRoom throws a NAMED error when cap would be breached", () => {
    const b = new IssueBudget(20);
    b.record("draft", "claude-fable-5", { input_tokens: 1.5 * MTOK, output_tokens: 0.05 * MTOK }); // $17.50
    expect(() => b.assertRoom(5)).toThrow(IssueBudgetError); // 17.50 + 5 > 20
    expect(() => b.assertRoom(2)).not.toThrow(); // 19.50 <= 20
  });

  test("fallback-served pass logs at the SERVED model's rate", () => {
    const b = new IssueBudget(20);
    const e = b.record("draft", "claude-opus-4-8", { input_tokens: 1 * MTOK, output_tokens: 0 });
    expect(e.costUsd).toBeCloseTo(5.0, 2); // opus input rate, not fable's
  });
});
```

- [ ] **Step 2: Run to fail** — `bun test lib/email/insiders/budget.test.ts` → module not found.

- [ ] **Step 3: Implement**

```ts
// lib/email/insiders/budget.ts
//
// Per-issue spend ledger (operator ruling 07/10/2026: $20/issue default cap —
// room to run on early issues; the cap is a HARD abort-before-next-call, never a
// mid-stream kill and never silence). Rates come from the ONE metered client's
// computeCostUsd, so a refusal-fallback pass served by claude-opus-4-8 prices at
// opus rates automatically (response.model names the model that produced it).
import { computeCostUsd, type UsageLike } from "@/refinery/agents/anthropic.mts";

export class IssueBudgetError extends Error {
  constructor(spentUsd: number, estimateUsd: number, capUsd: number) {
    super(
      `[insiders-budget] next pass (~$${estimateUsd.toFixed(2)}) would breach the issue cap: ` +
        `$${spentUsd.toFixed(2)} spent + estimate > $${capUsd.toFixed(2)}. ` +
        `Raise INSIDERS_MAX_SPEND_USD deliberately or ship the draft pass.`,
    );
    this.name = "IssueBudgetError";
  }
}

export interface LedgerEntry {
  pass: string; // "draft" | "editor" | "retro" | ...
  model: string;
  usage: UsageLike;
  costUsd: number;
}

export class IssueBudget {
  readonly entries: LedgerEntry[] = [];
  constructor(readonly capUsd: number) {}

  spentUsd(): number {
    return this.entries.reduce((s, e) => s + e.costUsd, 0);
  }

  record(pass: string, model: string, usage: UsageLike): LedgerEntry {
    const entry = { pass, model, usage, costUsd: computeCostUsd(model, usage) };
    this.entries.push(entry);
    return entry;
  }

  assertRoom(nextPassEstimateUsd: number): void {
    if (this.spentUsd() + nextPassEstimateUsd > this.capUsd)
      throw new IssueBudgetError(this.spentUsd(), nextPassEstimateUsd, this.capUsd);
  }
}
```

- [ ] **Step 4: Run to pass**, then commit:

```bash
git add lib/email/insiders/budget.ts lib/email/insiders/budget.test.ts
git commit -m "feat(insiders): per-issue spend ledger with hard cap (Phase B)"
```

### Task 5: IssueDoc schema (zod runtime + structured-output JSON schema)

**Files:**
- 🟡 Create: `lib/email/insiders/schema.ts`
- Test: `lib/email/insiders/schema.test.ts`

**Interfaces:**
- Produces: `IssueDocSchema` (zod), `IssueDoc` type, `ISSUE_DOC_JSON_SCHEMA` (plain JSON-schema const for `output_config.format`), `FIXTURE_ISSUE_DOC(dossier)` (deterministic mock used by author mock-mode + tests). Consumed by Tasks 6–8.

- [ ] **Step 1: Dependency check (RULE 0.5):** `bun pm ls zod-to-json-schema` — if present, derive `ISSUE_DOC_JSON_SCHEMA` from the zod schema with it; if absent, hand-write the const (do NOT add the dependency). Structured-outputs constraint either way: every object carries `additionalProperties: false` + full `required`; no `minLength`/`maxLength`/numeric bounds in the JSON schema (unsupported — zod enforces those client-side after parse).

- [ ] **Step 2: Failing test**

```ts
// lib/email/insiders/schema.test.ts
import { describe, expect, test } from "bun:test";
import { IssueDocSchema, ISSUE_DOC_JSON_SCHEMA } from "./schema";

const VALID = {
  issue_slug: "2026-07",
  subject: "The Insiders Edition — July 2026: the impact-fee squeeze",
  as_of: "07/10/2026",
  the_read: ["Paragraph one of the thesis.", "Paragraph two."],
  stories: [
    {
      headline: "Impact fees jump",
      what_happened: "Lee County approved higher road impact fees [1].",
      our_data: "Permits in the affected ZIPs had already slowed [2].",
      analog: "Austin's 2021 fee hike preceded a permit dip [3].",
    },
    {
      headline: "Occupancy softens",
      what_happened: "June occupancy slipped [4].",
      our_data: "Our tourism series shows the same drift [2].",
      analog: "Sarasota 2019 played out similarly [5].",
    },
  ],
  dashboard: [
    { question: "permits YoY by ZIP for Lee County", why: "quantifies the fee-shock exposure" },
    { question: "tourism occupancy trend", why: "anchors the soft-season story" },
    { question: "median home value trend", why: "the month's base market context" },
  ],
  forward_look: [
    {
      claim: "Permit volume in fee-affected ZIPs falls further by fall.",
      base_source_n: 2,
      falsifier: "September permits flat or up vs June in those ZIPs.",
    },
    {
      claim: "Occupancy stabilizes by October.",
      base_source_n: 4,
      falsifier: "October occupancy below September.",
    },
  ],
  sources: [
    { n: 1, url: "https://example.com/fees", label: "News-Press, fee vote" },
    { n: 2, url: "https://www.swfldatagulf.com/r/source/permits", label: "SWFL Data Gulf permits" },
    { n: 3, url: "https://example.com/austin", label: "Austin analog" },
    { n: 4, url: "https://example.com/occ", label: "Occupancy report" },
    { n: 5, url: "https://example.com/sarasota", label: "Sarasota analog" },
  ],
};

describe("IssueDocSchema", () => {
  test("accepts a complete issue", () => {
    expect(IssueDocSchema.safeParse(VALID).success).toBe(true);
  });
  test("rejects: bad slug, <2 stories, <3 charts, projection without falsifier, source ref to nowhere", () => {
    expect(IssueDocSchema.safeParse({ ...VALID, issue_slug: "july" }).success).toBe(false);
    expect(IssueDocSchema.safeParse({ ...VALID, stories: [VALID.stories[0]] }).success).toBe(false);
    expect(IssueDocSchema.safeParse({ ...VALID, dashboard: VALID.dashboard.slice(0, 2) }).success).toBe(false);
    expect(
      IssueDocSchema.safeParse({
        ...VALID,
        forward_look: [{ ...VALID.forward_look[0], falsifier: "" }, VALID.forward_look[1]],
      }).success,
    ).toBe(false);
    expect(
      IssueDocSchema.safeParse({
        ...VALID,
        forward_look: [{ ...VALID.forward_look[0], base_source_n: 99 }, VALID.forward_look[1]],
      }).success,
    ).toBe(false);
  });
  test("JSON schema is structured-outputs-safe: additionalProperties false everywhere", () => {
    const walk = (o: unknown): void => {
      if (!o || typeof o !== "object") return;
      const rec = o as Record<string, unknown>;
      if (rec.type === "object") expect(rec.additionalProperties).toBe(false);
      for (const v of Object.values(rec)) walk(v);
    };
    walk(ISSUE_DOC_JSON_SCHEMA);
  });
});
```

- [ ] **Step 3: Implement** — zod schema exactly mirroring the fixture above: `issue_slug` regex `^\d{4}-\d{2}$`; `subject` 8–120 chars; `as_of` regex `^\d{2}/\d{2}/\d{4}$`; `the_read` ≥2 paragraphs; `stories` 2–4 of `{headline, what_happened, our_data, analog}` (all non-empty); `dashboard` 3–6 of `{question: min 8 chars, why non-empty}`; `forward_look` 2–5 of `{claim, base_source_n: positive int, falsifier non-empty}`; `sources` ≥1 of `{n, url: z.string().url(), label}`. Add a `.superRefine` asserting every `base_source_n` and every `[n]` reference appearing in prose exists in `sources[].n`, and that `sources[].n` are unique. `FIXTURE_ISSUE_DOC(dossier)` returns a valid doc built ONLY from dossier content (headlines/urls from `dossier.news[0..1]`, chart questions from `dossier.chartMenu[0..2]`, zero free numbers) — the deterministic mock-mode issue.

- [ ] **Step 4: Run to pass**, commit:

```bash
git add lib/email/insiders/schema.ts lib/email/insiders/schema.test.ts
git commit -m "feat(insiders): IssueDoc zod schema + structured-output JSON schema + fixture (Phase B)"
```

### Task 6: Dossier assembler

**Files:**
- Create: `lib/email/insiders/dossier.ts`
- Test: `lib/email/insiders/dossier.test.ts`

**Interfaces:**
- Consumes: `readBrainMarkdown(slug)` (`lib/fetch-brain.ts:132`), pack id list from `refinery/packs/index.mts`, `parseDeskLog` (Task 1), Supabase `news_articles_swfl` (column names verified in Task 2 Step 4), `extractNumbers` from `@/lib/deliverable/narrative-lint`.
- Produces:

```ts
export interface IssueDossier {
  month: string;            // "2026-07"
  asOf: string;             // "07/10/2026" — stated ONCE downstream
  masterOutputMd: string;   // master's --- OUTPUT --- section only (thin pipe)
  brainOutputs: Array<{ slug: string; outputMd: string }>;
  news: Array<{
    headline: string; url: string; publishedAt: string; summary: string;
    deskWeight?: number; deskWhy?: string; areas?: string[]; seriesHint?: string | null;
  }>;
  deskOk: boolean;          // false → desk file malformed, raw news backstop used
  anchors: Array<string | number>; // every numeric token the prose may state
  chartMenu: string[];      // candidate chart questions (desk seriesHints first)
}
export async function assembleIssueDossier(opts: {
  month: string;
  deskMd: string | null;    // caller reads _FABLE5/desk/<month>.md; null if absent
  db: SupabaseClient;       // injected — tests pass a stub
  brainSlugs?: string[];    // injected for tests; default = all pack ids + "master"
}): Promise<IssueDossier>
```

- [ ] **Step 1: Failing test** — fixture desk md (2 entries, one weight-5), stub `db.from("news_articles_swfl")` returning 3 fixture rows (one matching a desk URL), `brainSlugs: []` with two injected fixture brain outputs via a `readBrain` seam param. Assert: (a) desk picks come FIRST in `news` and carry `deskWeight`/`deskWhy`; (b) non-desk rows follow; (c) `anchors` contains every number appearing in fixture brain output + news summaries (spot-check three: a price, a percent, a count); (d) malformed desk md → `deskOk: false` and news = raw rows only; (e) `chartMenu[0]` is the weight-5 entry's `seriesHint`.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement.** Deterministic, no model call. OUTPUT extraction: slice `readBrainMarkdown(slug)` from the `--- OUTPUT ---` marker (thin-pipe rule — downstream reads only OUTPUT). News query: `db.from("news_articles_swfl").select(<verified columns>).gte("<published col>", monthStart).order(desc).limit(60)`. Merge desk picks by URL match (desk pick wins, carries weight/why/seriesHint). Anchors: run `extractNumbers` (the ONE tokenizer) over every included brain OUTPUT + news summary + desk figures; dedupe. `chartMenu`: desk seriesHints (by weight desc), then 3 standing defaults: `"median home value trend"`, `"permits YoY by ZIP"`, `"inventory and days-on-market trend"` (these route through `buildChartForQuestion`'s generic any-brain layer — a menu entry that resolves to nothing is dropped at materialize with a warning, never fabricated).
- [ ] **Step 4: Run to pass**, commit:

```bash
git add lib/email/insiders/dossier.ts lib/email/insiders/dossier.test.ts
git commit -m "feat(insiders): deterministic IssueDossier assembler (Phase B)"
```

### Task 7: Author — the metered Fable 5 stage (draft + editor passes)

**Files:**
- Create: `lib/email/insiders/author.ts`
- Test: `lib/email/insiders/author.test.ts` (mock mode only — no key in tests)

**Interfaces:**
- Consumes: `getAnthropic("insiders_author")`, `agentsAreMocked()` (Task 3), `IssueBudget` (Task 4), `IssueDocSchema`/`ISSUE_DOC_JSON_SCHEMA`/`FIXTURE_ISSUE_DOC` (Task 5), `IssueDossier` (Task 6).
- Produces: `authorIssue(dossier, opts?): Promise<AuthorResult>` where `AuthorResult = { doc: IssueDoc; ledger: LedgerEntry[]; passes: Array<"draft"|"editor">; servedBy: string[] }`. Consumed by Task 9 (runner).

- [ ] **Step 1: Failing tests (mock mode):** with no `ANTHROPIC_API_KEY`: (a) `authorIssue(fixtureDossier)` returns `FIXTURE_ISSUE_DOC` content, `ledger: []`, `passes: ["draft"]`; (b) result parses under `IssueDocSchema`; (c) with `INSIDERS_LIVE_AUTHOR` unset but a key set, it STILL mocks (the belt: both must be present for paid authoring) — assert via env stubs.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement.**

```ts
// lib/email/insiders/author.ts — the ONLY model stage in the insiders pipeline.
// Two passes max (draft → editor), ONE IssueBudget ledger, hard abort between
// passes on cap breach. Mock mode (no key, or INSIDERS_LIVE_AUTHOR!=1) returns the
// deterministic fixture so DRY_RUN integration is free (weekly-read precedent).
import { getAnthropic, agentsAreMocked } from "@/refinery/agents/anthropic.mts";
import { IssueBudget, type LedgerEntry } from "./budget";
import { IssueDocSchema, ISSUE_DOC_JSON_SCHEMA, FIXTURE_ISSUE_DOC, type IssueDoc } from "./schema";
import type { IssueDossier } from "./dossier";

const FABLE = "claude-fable-5";
const FALLBACK = [{ model: "claude-opus-4-8" }];
const BETAS = ["server-side-fallback-2026-06-01"];

export interface AuthorOpts {
  capUsd?: number;      // default Number(process.env.INSIDERS_MAX_SPEND_USD ?? 20)
  effort?: string;      // default process.env.INSIDERS_EFFORT ?? "xhigh"
  singlePass?: boolean; // default process.env.INSIDERS_SINGLE_PASS === "1"
}

export function liveAuthoringEnabled(): boolean {
  return !agentsAreMocked() && process.env.INSIDERS_LIVE_AUTHOR === "1";
}

// Pre-pass cost estimates for assertRoom (labeled estimates, computed from the
// $10/$50 rates over the actual prompt size: chars/4 ≈ tokens, out budgeted 40K).
function estimatePassUsd(promptChars: number): number {
  return (promptChars / 4 / 1_000_000) * 10 + (40_000 / 1_000_000) * 50;
}

export async function authorIssue(dossier: IssueDossier, opts: AuthorOpts = {}): Promise<{
  doc: IssueDoc; ledger: LedgerEntry[]; passes: Array<"draft" | "editor">; servedBy: string[];
}> {
  if (!liveAuthoringEnabled())
    return { doc: FIXTURE_ISSUE_DOC(dossier), ledger: [], passes: ["draft"], servedBy: ["mock"] };

  const budget = new IssueBudget(opts.capUsd ?? Number(process.env.INSIDERS_MAX_SPEND_USD ?? 20));
  const effort = opts.effort ?? process.env.INSIDERS_EFFORT ?? "xhigh";
  const client = getAnthropic("insiders_author");

  const system = [
    { type: "text" as const, text: STANDING_RULES },            // stable — cache prefix
    { type: "text" as const, text: renderDossier(dossier),      // big — cached for pass 2
      cache_control: { type: "ephemeral" as const } },
  ];

  const runPass = async (pass: "draft" | "editor", userText: string): Promise<{ doc: IssueDoc; model: string }> => {
    budget.assertRoom(estimatePassUsd(userText.length + system.reduce((s, b) => s + b.text.length, 0)));
    const stream = client.beta.messages.stream({
      model: FABLE,
      max_tokens: 64_000,
      betas: BETAS,
      fallbacks: FALLBACK,
      output_config: { effort, format: { type: "json_schema", schema: ISSUE_DOC_JSON_SCHEMA } },
      system,
      messages: [{ role: "user", content: userText }],
    });
    const msg = await stream.finalMessage();
    budget.record(pass, msg.model, msg.usage);
    if (msg.stop_reason === "refusal")
      throw new Error(`[insiders-author] ${pass}: whole fallback chain refused — aborting (spec: never ship a partial).`);
    if (msg.stop_reason === "max_tokens")
      throw new Error(`[insiders-author] ${pass}: output truncated at max_tokens — aborting.`);
    const text = msg.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = IssueDocSchema.safeParse(JSON.parse(text));
    if (!parsed.success)
      throw new Error(`[insiders-author] ${pass}: schema parse miss — aborting. ${parsed.error.message.slice(0, 400)}`);
    return { doc: parsed.data, model: msg.model };
  };

  const passes: Array<"draft" | "editor"> = [];
  const servedBy: string[] = [];
  const draft = await runPass("draft", DRAFT_CHARGE);
  passes.push("draft"); servedBy.push(draft.model);
  let doc = draft.doc;
  if (!(opts.singlePass ?? process.env.INSIDERS_SINGLE_PASS === "1")) {
    try {
      const edited = await runPass("editor", editorCharge(doc));
      passes.push("editor"); servedBy.push(edited.model);
      doc = edited.doc;
    } catch (e) {
      // Editor-pass budget breach or parse miss → ship the DRAFT (it already
      // parsed); report why. A draft in hand beats an aborted issue.
      console.error(`[insiders-author] editor pass skipped: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { doc, ledger: budget.entries, passes, servedBy };
}
```

`STANDING_RULES` (module const, stable text — the cache-friendly prefix): the issue skeleton contract (spec Section 1, five sections in order), the four-lane citation rule ("every figure names a real source from the dossier; you may not state a number absent from it"), projection rule (base + falsifier, plain `[INFERENCE]`-free prose — the Forward Look section IS the marked container), voice rules (plain language, no system nouns, no jargon, MM/DD/YYYY once — echo `dossier.asOf` into `as_of`), and the JSON-only output instruction. `renderDossier` serializes the dossier: master OUTPUT, per-brain OUTPUTs, news list (desk picks flagged with weight+why), chartMenu, and the playbook excerpt (`_FABLE5/playbook.md` contents passed in via dossier assembly — add `playbookMd: string` to `IssueDossier` in Task 6 if not already). `DRAFT_CHARGE`: "Author issue <month> per the skeleton." `editorCharge(doc)`: "You are the editor. Here is your draft: <json>. Tighten the thesis, kill any story or analog that doesn't earn its figures, sharpen every falsifier, keep every citation honest against the dossier. Emit the full corrected IssueDoc."

- [ ] **Step 4: Run mock tests to pass** — `bun test lib/email/insiders/author.test.ts`.
- [ ] **Step 5: Commit**

```bash
git add lib/email/insiders/author.ts lib/email/insiders/author.test.ts lib/email/insiders/dossier.ts
git commit -m "feat(insiders): Fable 5 authoring stage — draft+editor passes, ledger-capped, refusal fallback (Phase B)"
```

### Task 8: Materializer — charts + lints + the ONE renderer

**Files:**
- Create: `lib/email/insiders/materialize.ts`, `lib/email/insiders/lint.ts`
- Test: `lib/email/insiders/materialize.test.ts`, `lib/email/insiders/lint.test.ts`

**Interfaces:**
- Consumes: `buildChartForQuestion(question, origin)` → `{ chart: ChartSpec; groundingNote: string } | null` (`lib/assistant/chart-for-question.ts:49` — returns null when nothing chartable, never throws); `extractNumbers/normalizeNumber/anchorsExactly` from `@/lib/deliverable/narrative-lint` (exact imports as `lib/email/author-doc.ts:40-46`); url-lint (read `lib/deliverable/url-lint.ts` exports + its test for usage before wiring); citation URL cleaning from `lib/citations/clean-url.ts`; `renderEmailDocHtml(doc: EmailDoc): Promise<string>` (`lib/email/render-email-doc.ts:22`); chart→image-block conventions from `lib/email/inject-chart.ts` (`chartImageBlock`) + `lib/email/spec-to-png.ts` — **Step 0 of this task: read those two files plus `buildPromptChart` in `lib/email/build-doc.ts` and mirror how the email path turns a `ChartSpec` into an EmailDoc image block.**
- Produces: `materializeIssue(doc, dossier, opts): Promise<MaterializeResult>` where `MaterializeResult = { ok: true; html: string; emailDoc: EmailDoc; warnings: string[]; charts: number } | { ok: false; blocked: string[]; warnings: string[] }`. Consumed by Task 9.

- [ ] **Step 1: Failing lint tests** (`lint.test.ts`): `lintIssueProse(doc, anchors, chartFigures)` — (a) a doc whose prose states only anchored numbers passes; (b) inject `"prices rose 14.7%"` with no `14.7` anywhere in anchors/chart figures → `ok: false`, violation names the token and the section; (c) source URL that fails url-lint → violation; (d) `as_of` present in doc but a SECOND date-stated-as-of inside prose → violation ("as-of stated once").
- [ ] **Step 2: Failing materialize tests** (`materialize.test.ts`) with an injected `chartFn` seam (defaults to `buildChartForQuestion` in prod; tests inject a stub — the weekly-read `buildDoc` injection precedent): (a) fixture doc + dossier with stub chartFn returning 2 charts and 1 null → result ok, `charts: 2`, one warning `chart dropped: <question> — offer bar/table`; (b) chart grounding figures COUNT as anchors (a prose number present only in a chart's groundingNote passes); (c) a doc with an unanchored number → `{ ok: false, blocked: [...] }` and NO html; (d) html contains the as-of date exactly once and a sources block with every `sources[].n`.
- [ ] **Step 3: Run both to fail.**
- [ ] **Step 4: Implement `lint.ts`** — `lintIssueProse` walks `the_read` + story fields + `forward_look` claims/falsifiers with `extractNumbers`; every extracted token must `anchorsExactly` against `dossier.anchors ∪ chartFigures` (chart figures extracted from each `groundingNote` with the SAME tokenizer). Source refs `[n]` cross-checked against `sources`. URLs through url-lint. Returns `{ ok, violations: Array<{ section: string; token?: string; message: string }> }`.
- [ ] **Step 5: Implement `materialize.ts`** — resolve each `dashboard[i].question` through `chartFn(question, origin)`; nulls → warning + drop (never fabricate; if ALL charts drop, that's still ok:true with warnings — the operator judges the preview). Assemble `EmailDoc`: `globalStyle` from the default doc conventions (mirror what `buildWeeklyIssue` starts from — Step 0 read), blocks = header (subject), text blocks (The Read paragraphs), per-story text blocks, chart image blocks (Dashboard), text blocks (Forward Look, each `claim — base [n] — falsifier`), sources text block (cleaned URLs, collapsed list), footer text carrying the as-of line once + `UNSUBSCRIBE_TOKEN` placeholder slot. Then `lintIssueProse` gate → blocked on violation (spec: lint failure blocks, nothing auto-fixes) → else `html = await renderEmailDocHtml(emailDoc)`.
- [ ] **Step 6: Run all four insiders test files to pass.**
- [ ] **Step 7: Commit**

```bash
git add lib/email/insiders/lint.ts lib/email/insiders/lint.test.ts lib/email/insiders/materialize.ts lib/email/insiders/materialize.test.ts
git commit -m "feat(insiders): materializer — real-series charts, no-invention lint gate, ONE renderer (Phase B)"
```

### Task 9: Runner — the safety ladder

**Files:**
- 🟢 Create: `scripts/email/insiders-run.mts`
- Test: `scripts/email/insiders-run.test.mts` (pure helpers only: gate assembly + ledger report shaping)

**Interfaces:**
- Consumes: Tasks 1, 6, 7, 8; `createServiceRoleClient` (`utils/supabase/service-role`), `getMarketingResend` (`lib/email/marketing-client`), `UNSUBSCRIBE_TOKEN` (`lib/email/scheduler`), `fetchSpendWindow`/`spendCaps` (`refinery/agents/anthropic.mts`) for the daily-headroom hint.
- Produces: the operator CLI. Clone `scripts/email/weekly-read-run.mts`'s ladder EXACTLY (lines 1–27 doc-comment pattern, DRY_RUN default true, previews before any live branch, loud refusals):

```
Usage:
  bun scripts/email/insiders-run.mts [--month 2026-07] [--mini <desk-headline-substring>]
  env: DRY_RUN (default true — gates SENDING),
       INSIDERS_LIVE_AUTHOR (must be "1" for a PAID authoring call; else mock),
       INSIDERS_MAX_SPEND_USD (default 20), INSIDERS_EFFORT (default xhigh),
       INSIDERS_SINGLE_PASS, INSIDERS_APPROVED (must be "1" for live send),
       INSIDERS_TEST_RECIPIENTS (comma list — Phase B live sends go ONLY here),
       INSIDERS_POSTAL_ADDRESS (fallback OUTREACH_POSTAL_ADDRESS),
       INSIDERS_FROM_NAME/INSIDERS_FROM_EMAIL (fallback DIGEST_SENDER_*), SITE_ORIGIN
```

Flow: read desk file → `assembleIssueDossier` → **spend-headroom hint** (when `INSIDERS_LIVE_AUTHOR=1`: `fetchSpendWindow()`; if `dayUsd + capUsd >= spendCaps().dailyUsd`, print `HINT: today's logged spend $X + issue cap $20 ≥ daily cap $25 — run with ANTHROPIC_DAILY_SPEND_CAP_USD=50 if this is issue day` and continue — the metered client enforces) → `authorIssue` → `materializeIssue` → write `insiders-runs/<stamp>/issue-<slug>.html` + `run-report.json` (summary + warnings + blocked + full ledger: per-pass model/tokens/$, total vs cap) UNCONDITIONALLY before any live branch → if blocked: print violations, exit 1 → DRY_RUN: print report path + "nothing sent", exit 0 → live: require `INSIDERS_APPROVED=1` + postal + From (exit 1 loudly on each, weekly-read wording) → send html to `INSIDERS_TEST_RECIPIENTS` via `getMarketingResend()` (subject = `doc.subject`) → print sent/failed.

`--mini`: filter dossier to the ONE desk entry whose headline matches, force `stories` min via a `MINI_MODE` opt on the author charge ("one story, five-minute read, same rules"), same lints/preview/gates. (Full mini polish is Task 15 — this flag just must not crash before then; hide it behind `INSIDERS_MINIS=1` until Task 15 lands.)

- [ ] **Step 1: Failing test for the pure helpers** — extract `preSendGates(html, subject)` (unsubscribe token present when recipients ≥1, non-empty subject — mirror weekly-read:87-92) and `ledgerReport(entries, capUsd)` (returns `{ totalUsd, lines: string[] }`, `"draft  claude-fable-5  250,000in/30,000out  $4.00"` shaping) into the script and test them.
- [ ] **Step 2: Run to fail; implement; run to pass.**
- [ ] **Step 3: End-to-end mocked DRY_RUN (the integration test of spec §Testing):**

Run: `bun scripts/email/insiders-run.mts --month 2026-07`
Expected (no key): `insiders-runs/<stamp>/issue-2026-07.html` exists (fixture issue, real render), `run-report.json` has `dry_run: true`, `ledger: []`, `mode: "mock"`, lints ran (`blocked` absent), exit 0.

- [ ] **Step 4: `bunx next build`** — Expected: compiles clean (catches every cross-import).
- [ ] **Step 5: Commit**

```bash
git add scripts/email/insiders-run.mts scripts/email/insiders-run.test.mts
git commit -m "feat(insiders): DRY_RUN-first issue runner with spend ledger + approval ladder (Phase B)"
```

### Task 10: 🛑 STOP — operator go/no-go (BEFORE the first live authoring run)

**This is a hard stop, not a task to execute past.** Present to the operator:

1. The mocked DRY_RUN preview HTML + run-report from Task 9.
2. The budget plan: cap $20 (`INSIDERS_MAX_SPEND_USD`), effort `xhigh` (offer `INSIDERS_EFFORT=max` for issue #1), two passes, expected ~$6–8 typical.
3. The daily-cap note: default metered-client cap is $25/day — issue day may need `ANTHROPIC_DAILY_SPEND_CAP_USD=50` for the run.
4. The retention note: first live call doubles as the org data-retention proof — if the org were below Fable 5's 30-day retention requirement, that call 400s with `invalid_request_error` (then: fix retention config in Console, or author on `claude-opus-4-8` via the documented fallback).

**Do not run `INSIDERS_LIVE_AUTHOR=1` until the operator says go.** (Operator ruling 07/10/2026: "let me know before actually building one so I can make sure we are good to go.")

### Task 11: Live-verify — issue #1 (operator-run)

- [ ] **Step 1 (operator command):** `INSIDERS_LIVE_AUTHOR=1 bun scripts/email/insiders-run.mts --month 2026-07` (DRY_RUN stays true — this spends on authoring, sends nothing).
- [ ] **Step 2:** Review together: preview HTML quality, ledger (per-pass $, served-by models — was the fallback ever used?), lint warnings, chart drops. Iterate on `STANDING_RULES`/playbook and re-run (each re-run is a fresh ≤$20 ledger — say the expected cost out loud before each).
- [ ] **Step 3:** When the preview impresses: operator sends issue #1 — `DRY_RUN=false INSIDERS_APPROVED=1 INSIDERS_TEST_RECIPIENTS=<operator + first readers> INSIDERS_POSTAL_ADDRESS="..." bun scripts/email/insiders-run.mts --month 2026-07` (manual send to the seed list is the accepted Phase B shape).
- [ ] **Step 4:** Write `_FABLE5/retro/2026-07.md` from TEMPLATE (first retro; promotions → checks SAME session). Close nothing yet — `insiders_edition_live_verify` closes in Task 14 (spec: only after issue #1 preview approved AND sent — if the seed-list send in Step 3 happened, record the evidence now and close it; the check ledger is prod evidence).

---

## Phase C — Distribution

### Task 12: Subscriber lane (table + subscribe route + issue persistence)

**Files:**
- Create: `docs/sql/20260710_insiders.sql` (idempotent; run via Bun.SQL — psql is not installed)
- Create: `app/api/insiders/subscribe/route.ts` (mirror `app/api/weekly-read/subscribe/route.ts` — same validation, same response shape, table swapped)
- Create: `lib/email/insiders/send.ts` (mirror `lib/email/weekly-read/send.ts`: `buildInsidersBatches`/`sendInsidersBatches` with per-subscriber unsubscribe links)
- 🟢 Modify: `scripts/email/insiders-run.mts` (live branch: when `INSIDERS_TEST_RECIPIENTS` unset, fan out to `insiders_subscribers` status=active who haven't received this `issue_slug`; stamp `last_issue_slug`; persist the materialized issue)
- Test: `lib/email/insiders/send.test.ts` (mirror weekly-read's send tests)

SQL (idempotent, verify row/table after):

```sql
create table if not exists public.insiders_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issues_sent int not null default 0,
  last_issue_slug text
);
create table if not exists public.insiders_issues (
  issue_slug text primary key,
  subject text not null,
  html text not null,
  email_doc jsonb not null,
  status text not null default 'draft', -- draft | approved | sent
  ledger jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
```

- [ ] Steps: write failing send tests → migration (run + `select count(*)` verify both tables exist) → subscribe route (test with a `curl -X POST localhost:3000/api/insiders/subscribe -d '{"email":"a@b.com"}'` against `bun dev`, expect 200 + row) → runner persistence (`insiders_issues` upsert on every run: draft on DRY_RUN, sent + `sent_at` on live) → fan-out with per-subscriber unsubscribe (reuse `UNSUBSCRIBE_TOKEN` replacement exactly as weekly-read) → `bun test lib/email/insiders/` PASS → `bunx next build` PASS → commit:

```bash
git add docs/sql/20260710_insiders.sql app/api/insiders/subscribe/route.ts lib/email/insiders/send.ts lib/email/insiders/send.test.ts scripts/email/insiders-run.mts
git commit -m "feat(insiders): subscriber lane — table, subscribe route, batched fan-out, issue persistence (Phase C)"
```

### Task 13: Canonical pages `/r/insiders/[issue]` + archive + signup

**Files:**
- Create: `app/r/insiders/[issue]/page.tsx`, `app/r/insiders/page.tsx`, `app/r/insiders/_components/insiders-signup.tsx`
- Modify: `app/sitemap.ts` (add `/r/insiders` + per-issue entries from `insiders_issues` where status='sent')

Page pattern: server component; `createServiceRoleClient()` → `insiders_issues` by slug; 404 on missing/draft (only `sent` issues are public); render the stored `html` inside the site shell via the same sanitized-html technique the existing report pages use (**Step 0: read `app/r/zip-report/[zip]/page.tsx` and mirror its layout/shell/metadata conventions — `h-full`, never `h-screen`**); `generateMetadata` from subject. Signup box (email input → POST `/api/insiders/subscribe`) on both the archive and each issue page. Archive lists sent issues newest-first.

- [ ] Steps: pages + signup component → `bunx next build` PASS → manual verify `bun dev`: archive renders, issue page renders issue #1, signup POST creates a row, draft issues 404 → commit:

```bash
git add app/r/insiders app/sitemap.ts
git commit -m "feat(insiders): /r/insiders canonical issue pages + archive + signup box (Phase C)"
```

### Task 14: Monthly GHA cron (DRY_RUN drafts) + close the build check

**Files:**
- Create: `.github/workflows/insiders-monthly.yml`

```yaml
name: insiders-monthly-draft
on:
  schedule:
    - cron: "0 12 1 * *"   # 1st of month 12:00 UTC — draft lands for operator review
  workflow_dispatch:
    inputs:
      month: { description: "YYYY-MM (default: current)", required: false }
jobs:
  draft:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - name: Compose DRY_RUN draft (paid authoring, no send)
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          INSIDERS_LIVE_AUTHOR: "1"
          INSIDERS_MAX_SPEND_USD: "20"
        run: bun scripts/email/insiders-run.mts ${{ inputs.month && format('--month {0}', inputs.month) || '' }}
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: insiders-draft, path: insiders-runs/ }
```

DRY_RUN is not set → defaults true → **the cron can never send**; it spends ≤$20/month authoring the draft the operator reviews (persisted to `insiders_issues` as `draft` + uploaded artifact). Secrets: verify with `gh secret list`; any missing one → `gh secret set <NAME>` in the same push as this workflow (Gate 3).

- [ ] Steps: workflow file → `gh secret list` check → push **with `ALLOW_PAID_SURFACE=1` on the safe-push command** (the workflow adds an `ANTHROPIC_API_KEY` env line — Gate 6 fires by design; this surface is metered via getAnthropic + double-gated INSIDERS_LIVE_AUTHOR/ledger; say all this in the SESSION_LOG entry of that push) → `gh workflow run insiders-monthly-draft -f month=2026-07` once, confirm artifact + draft row → then close the build check with evidence:
`node scripts/check.mjs close insiders_edition_live_verify` (only if issue #1 was approved + sent in Task 11 — otherwise it stays open until it is).

---

## Phase D — Minis + learning loop hardening

### Task 15: Mini commissioning path

**Files:**
- 🟡 Modify: `lib/email/insiders/schema.ts` (add `MiniDocSchema` = same shape, `stories` exactly 1, `dashboard` 1–2, `forward_look` exactly 1; `issue_slug` regex `^\d{4}-\d{2}-mini-[a-z0-9-]+$`), `lib/email/insiders/author.ts` (`MINI_CHARGE` variant), `scripts/email/insiders-run.mts` (un-hide `--mini`; slug from desk-entry headline)
- Test: extend `schema.test.ts` + `author.test.ts` (mock mini)

- [ ] Steps: failing tests (mini fixture parses; runner `--mini "impact fees"` in mock mode writes `issue-2026-07-mini-impact-fees.html`) → implement → `bun test lib/email/insiders/` PASS → commit `feat(insiders): event-triggered minis (Phase D)`.
Desk wiring is operational (already in FABLE5.md): weight-5 pick → same-session `bun scripts/email/insiders-run.mts --mini "<headline>"` → preview parked for operator approval; send only ever via the Task 9 ladder.

### Task 16: Retro loop wiring

**Files:**
- 🔴 Modify: `_FABLE5/FABLE5.md` (add the post-send retro step to the routine), `_FABLE5/MINDMAP.md` (promotion-path edges if drift found)

- [ ] Steps: after every send, `_FABLE5/retro/<issue>.md` from TEMPLATE with the three fixed parts + spend section; each Promotion opens a `checks` entry the same session (`node scripts/check.mjs open insiders <key> "<label>"`); each Capability gap lands in `_AUDIT_AND_ROADMAP/build-queue.md` in the same commit; Tweaks edit `playbook.md` immediately. Commit `docs(insiders): retro loop wired into desk routine (Phase D)`.

---

## Verification (whole-feature)

- [ ] `bun test lib/email/insiders/ refinery/agents/spend-guard.test.mts scripts/email/insiders-run.test.mts` — all green.
- [ ] `bunx next build` — clean.
- [ ] Mocked end-to-end: `bun scripts/email/insiders-run.mts` → preview + report, exit 0, nothing sent, $0.
- [ ] Live end-to-end (operator, post-Task-10 go): ledger total ≤ $20, preview approved, seed send delivered, `insiders_issues` row `sent`, `/r/insiders/2026-07` renders, retro written, promotions → checks.
- [ ] Each push: SESSION_LOG entry + explicit `git add` paths + `node scripts/safe-push.mjs` (never stage `app/r/zip-report/*` — parallel session's uncommitted work).

## Self-review notes (spec ⇆ plan)

- Spec §1 skeleton → Tasks 5/7 (schema + charges). §2a → Task 6. §2b (two-pass amendment) → Tasks 4/7. §2c → Task 8. §2d ladder → Task 9. §3 desk → Tasks 1/2. §4 loop → Tasks 11/16. §5 MINDMAP → Task 2. §6 distribution → Tasks 12/13/14. Minis → Task 15. Error handling table → Tasks 7 (refusal/parse/truncation), 8 (chart-drop, lint-block), 6+1 (malformed desk backstop). Testing section → Tasks 1–9 tests + Task 9 Step 3 integration + Task 11 live slice.
- Deliberate deviations from the pre-amendment spec, both operator-ruled 07/10/2026: two-pass authoring stage (was "one call") and $20 cap (was $2–3). Editor-pass failure ships the draft (a parsed draft beats an aborted issue) — draft-pass failure still aborts hard.
- Known softness (documented): the metered client logs top-level usage only — a mid-stream refusal's partial spend rides the fallback attempt's log, and `usage.iterations` is not itemized. Same class as the guard's existing parallel-burst softness; the ledger + api_usage_log still bound it.
- Retention/ZDR: no pre-check possible from code — Task 10 presents it; the first live call is the proof (400 `invalid_request_error` → fix org config or author on `claude-opus-4-8`).

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 16 | `_FABLE5/FABLE5.md` |
| 🟡 | Task 5, Task 15 | `lib/email/insiders/schema.ts` |
| 🟢 | Task 9, Task 12 | `scripts/email/insiders-run.mts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
