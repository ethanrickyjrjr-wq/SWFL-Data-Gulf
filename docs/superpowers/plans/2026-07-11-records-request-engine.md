# Chapter 119 Records-Request Outbound Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 9 files, keywords: migration, schema, architecture

**Goal:** Build an operator-approved outbound records-request engine — draft a §119 request from a queue row, email it to the operator to approve, auto-send from our domain on approval, auto-file, then track the response to landing.

**Architecture:** A `public.records_requests` Supabase table holds the request lifecycle (modeled on the `checks` table). Pure, unit-tested TS modules under `lib/records-request/` hold the state machine, the §119 draft template, and a thin transactional Resend send. A `bun`-run CLI `scripts/records-request.mts` (modeled on `scripts/check.mjs`) is the thin shell that talks to Supabase REST and the Resend client and orchestrates those pure modules. Session-kickoff surfaces requests that have gone quiet so a filed request is never forgotten.

**Tech Stack:** TypeScript run via `bun`; Supabase (PostgREST) via `fetch`; Resend SDK (already a dependency) for transactional email; `bun test` for unit tests; `bun scripts/run-migration.ts` for the migration.

## Global Constraints

- **Node/bun tooling only** — CLI is `.mts` run via `bun`; pure logic is `.ts` under `lib/records-request/`; tests are `bun test`.
- **Reuse creds, never hardcode** — Supabase creds via `resolveSupabaseCreds` from `scripts/lib/supabase-creds.mjs` (reads `.dlt/secrets.toml`); `RESEND_API_KEY` from `process.env` first, `.dlt/secrets.toml` fallback. Never print a secret.
- **Transactional, NOT commercial email** — the request send reuses the Resend client via `client.emails.send(...)` (like `app/api/waitlist/route.ts:61`), NOT the marketing batch builders (`buildWeeklyReadBatches` / outreach). No `List-Unsubscribe` header, no `wid`/`rid` tags, no unsubscribe token. A §119 request is not commercial email — CAN-SPAM opt-out/address rules do not apply.
- **Sends stay operator-approved** — bare `send` is the review beat (prints the draft, optionally emails it to `OPERATOR_EMAIL`); only `send --confirm` sends to the agency. Never auto-send to an agency without `--confirm`.
- **`from` address** — `"SWFL Data Gulf <hello@swfldatagulf.com>"` (verbatim, matches `app/api/waitlist/route.ts:62`).
- **Statute values are verbatim** — 15¢/one-sided page and the "special service charge" language come from FL Stat. §119.07(4); "at any reasonable time" / "acknowledge … promptly and respond in good faith" from §119.07(1). No invented deadline — FL has none.
- **The tracker table is operational** — `public.records_requests`, NOT `data_lake.*`; the brain-first gate does not apply to the tracker. Received *data* lands via its own target's ODD pipeline under that target's existing gates.
- **Migration is idempotent** — `CREATE TABLE IF NOT EXISTS`, re-runnable.
- **No new dependency** — `resend` is already in `package.json` (imported by `app/api/waitlist/route.ts`, `lib/email/*`). Adding no deps ⇒ no lockfile pre-push gate.

---

### Task 1: Migration — `public.records_requests`

**Files:**
- Create: `migrations/20260711_records_requests.sql`

**Interfaces:**
- Produces: table `public.records_requests` with columns consumed by the CLI (Task 5) and session-kickoff (Task 6).

- [ ] **Step 1: Write the migration SQL**

Create `migrations/20260711_records_requests.sql`:

```sql
-- Chapter 119 records-request outbound engine — tracker table.
-- Operational metadata (public.*), NOT data_lake.* — brain-first gate does not apply.
-- Modeled on public.checks (lifecycle state + stable key + staleness surfacing).
CREATE TABLE IF NOT EXISTS public.records_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key       text UNIQUE NOT NULL,
  target_agency     text NOT NULL,
  dataset           text NOT NULL,
  statute_basis     text NOT NULL DEFAULT 'Fla. Stat. ch. 119',
  contact_email     text,
  portal_url        text,
  state             text NOT NULL DEFAULT 'drafted'
                      CHECK (state IN ('drafted','filed','acknowledged','cost_quoted',
                                       'cost_approved','fulfilled','landed','denied','withdrawn')),
  follow_up_days    integer NOT NULL DEFAULT 14,
  cost_quoted_usd   numeric,
  cost_approved_usd numeric,
  request_body      text,
  received_ref      text,
  landed_target     text,
  notes             text,
  source_tag        text NOT NULL DEFAULT 'records_request',
  filed_at          timestamptz,
  last_contact_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS records_requests_state_idx ON public.records_requests (state);

GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply the migration**

Run: `bun scripts/run-migration.ts migrations/20260711_records_requests.sql`
Expected: `Running migrations/20260711_records_requests.sql...` then `  ✓ done` then `Migrations complete.`

- [ ] **Step 3: Verify the table exists and is empty**

Run:
```bash
bun -e 'import{readFileSync}from"fs";const s=readFileSync(".dlt/secrets.toml","utf8");const g=k=>s.match(new RegExp(`^${k}\\s*=\\s*"([^"]+)"`,"m"))[1];const sql=new Bun.SQL(`postgres://${g("username")}:${encodeURIComponent(g("password"))}@${g("host")}:${(s.match(/^port\s*=\s*(\d+)/m)||[])[1]||"5432"}/${g("database")}?sslmode=require`);const r=await sql`SELECT count(*)::int AS n FROM public.records_requests`;console.log("rows:",r[0].n);await sql.end();'
```
Expected: `rows: 0`

- [ ] **Step 4: Commit**

```bash
git add migrations/20260711_records_requests.sql
git commit -m "feat(records-request): public.records_requests tracker table"
```

---

### Task 2: State machine — `lib/records-request/state.ts`

**Files:**
- Create: `lib/records-request/state.ts`
- Test: `lib/records-request/state.test.ts`

**Interfaces:**
- Produces: `STATES: string[]`, `TERMINAL: Set<string>`, `ACTIONS: string[]`, `nextState(current: string, action: string): string` (throws on illegal transition or unknown action).

- [ ] **Step 1: Write the failing test**

Create `lib/records-request/state.test.ts`:

```ts
import { test, expect } from "bun:test";
import { nextState, STATES, TERMINAL, ACTIONS } from "./state";

test("legal happy-path transitions advance", () => {
  expect(nextState("drafted", "send")).toBe("filed");
  expect(nextState("filed", "ack")).toBe("acknowledged");
  expect(nextState("acknowledged", "quote")).toBe("cost_quoted");
  expect(nextState("cost_quoted", "approveCost")).toBe("cost_approved");
  expect(nextState("cost_approved", "fulfill")).toBe("fulfilled");
  expect(nextState("fulfilled", "land")).toBe("landed");
});

test("no-charge path: acknowledged -> fulfilled directly", () => {
  expect(nextState("acknowledged", "fulfill")).toBe("fulfilled");
});

test("quote may arrive on the first reply (from filed)", () => {
  expect(nextState("filed", "quote")).toBe("cost_quoted");
});

test("deny and withdraw are reachable from open states", () => {
  expect(nextState("acknowledged", "deny")).toBe("denied");
  expect(nextState("drafted", "withdraw")).toBe("withdrawn");
});

test("illegal transitions throw", () => {
  expect(() => nextState("filed", "land")).toThrow(/illegal transition/);
  expect(() => nextState("acknowledged", "approveCost")).toThrow(/illegal transition/);
  expect(() => nextState("landed", "withdraw")).toThrow(/illegal transition/);
});

test("unknown action throws", () => {
  expect(() => nextState("drafted", "frobnicate")).toThrow(/unknown action/);
});

test("exports are shaped as expected", () => {
  expect(STATES).toContain("cost_approved");
  expect(TERMINAL.has("landed")).toBe(true);
  expect(ACTIONS).toContain("approveCost");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/records-request/state.test.ts`
Expected: FAIL — `Cannot find module './state'`.

- [ ] **Step 3: Write the implementation**

Create `lib/records-request/state.ts`:

```ts
// Pure lifecycle state machine for a records request. No I/O.
// Driven by FL §119: no statutory deadline (no timer here — see follow_up_days
// in the tracker) and a §119.07(4) special-service-charge gate (cost_quoted -> cost_approved).

export const STATES = [
  "drafted", "filed", "acknowledged", "cost_quoted",
  "cost_approved", "fulfilled", "landed", "denied", "withdrawn",
] as const;

export const TERMINAL = new Set<string>(["landed", "denied", "withdrawn"]);

const RULES: Record<string, { from: string[]; to: string }> = {
  send:        { from: ["drafted"],                                                     to: "filed" },
  ack:         { from: ["filed"],                                                       to: "acknowledged" },
  quote:       { from: ["filed", "acknowledged"],                                       to: "cost_quoted" },
  approveCost: { from: ["cost_quoted"],                                                 to: "cost_approved" },
  fulfill:     { from: ["acknowledged", "cost_approved"],                               to: "fulfilled" },
  land:        { from: ["fulfilled"],                                                   to: "landed" },
  deny:        { from: ["filed", "acknowledged", "cost_quoted", "cost_approved"],       to: "denied" },
  withdraw:    { from: ["drafted", "filed", "acknowledged", "cost_quoted",
                        "cost_approved", "fulfilled"],                                   to: "withdrawn" },
};

export const ACTIONS = Object.keys(RULES);

export function nextState(current: string, action: string): string {
  const rule = RULES[action];
  if (!rule) throw new Error(`unknown action: ${action}`);
  if (!rule.from.includes(current))
    throw new Error(`illegal transition: cannot ${action} from ${current}`);
  return rule.to;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/records-request/state.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/records-request/state.ts lib/records-request/state.test.ts
git commit -m "feat(records-request): lifecycle state machine"
```

---

### Task 3: §119 draft template — `lib/records-request/template.ts`

**Files:**
- Create: `lib/records-request/template.ts`
- Test: `lib/records-request/template.test.ts`

**Interfaces:**
- Produces: `draftRequestBody(input: DraftInput): string` and `draftSubject(dataset: string): string`, where `DraftInput = { targetAgency: string; dataset: string; statuteBasis?: string; requesterName?: string; requesterEmail?: string }`.

- [ ] **Step 1: Write the failing test**

Create `lib/records-request/template.test.ts`:

```ts
import { test, expect } from "bun:test";
import { draftRequestBody, draftSubject } from "./template";

const body = draftRequestBody({
  targetAgency: "Florida Department of Business and Professional Regulation",
  dataset: "Email addresses on file for all active Lee and Collier real estate licensees.",
});

test("names the agency and the dataset", () => {
  expect(body).toContain("Florida Department of Business and Professional Regulation");
  expect(body).toContain("Lee and Collier real estate licensees");
});

test("cites Chapter 119 and the specific fee/exemption subsections", () => {
  expect(body).toContain("ch. 119");
  expect(body).toContain("119.07(4)"); // special-service-charge cost-estimate ask
  expect(body).toContain("119.07(1)"); // redact-and-cite-exemption ask
});

test("asks for a cost estimate before fulfillment and for electronic delivery", () => {
  expect(body.toLowerCase()).toContain("cost estimate");
  expect(body.toLowerCase()).toContain("electronic");
});

test("carries NO marketing / unsubscribe text (transactional)", () => {
  expect(body.toLowerCase()).not.toContain("unsubscribe");
  expect(body.toLowerCase()).not.toContain("opt out");
});

test("subject references the dataset succinctly", () => {
  expect(draftSubject("Assessment roll (NAL) for Collier County")).toMatch(/public records request/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/records-request/template.test.ts`
Expected: FAIL — `Cannot find module './template'`.

- [ ] **Step 3: Write the implementation**

Create `lib/records-request/template.ts`:

```ts
// Pure §119 public-records request draft. No I/O, no LLM — a fixed courteous
// request. Statute language verbatim from FL Stat. §119.07 (verified live 07/11/2026).

export interface DraftInput {
  targetAgency: string;
  dataset: string;
  statuteBasis?: string;
  requesterName?: string;
  requesterEmail?: string;
}

export function draftSubject(dataset: string): string {
  const short = dataset.length > 60 ? dataset.slice(0, 57).trimEnd() + "…" : dataset;
  return `Florida Public Records Request — ${short}`;
}

export function draftRequestBody(input: DraftInput): string {
  const {
    targetAgency,
    dataset,
    statuteBasis = "Fla. Stat. ch. 119",
    requesterName = "SWFL Data Gulf",
    requesterEmail = "hello@swfldatagulf.com",
  } = input;

  return [
    `To the Public Records Custodian, ${targetAgency}:`,
    ``,
    `Under Florida's Public Records Act (${statuteBasis}), I request access to and an ` +
      `electronic copy of the following public record:`,
    ``,
    dataset,
    ``,
    `To keep any cost to a minimum, electronic delivery (email, a download link, or a ` +
      `spreadsheet export) is preferred over paper copies.`,
    ``,
    `If fulfilling this request will require a special service charge under s. 119.07(4) ` +
      `(extensive use of information technology resources or extensive clerical or ` +
      `supervisory assistance), please provide a written cost estimate before proceeding ` +
      `so I can authorize it.`,
    ``,
    `If any portion of the requested record is exempt or confidential, please redact only ` +
      `that portion, produce the remainder, and state in writing the specific statutory ` +
      `basis for each exemption, as provided in s. 119.07(1).`,
    ``,
    `Thank you for your assistance.`,
    ``,
    requesterName,
    requesterEmail,
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/records-request/template.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/records-request/template.ts lib/records-request/template.test.ts
git commit -m "feat(records-request): §119 draft template"
```

---

### Task 4: Transactional send — `lib/records-request/send.ts`

**Files:**
- Create: `lib/records-request/send.ts`
- Test: `lib/records-request/send.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `sendRecordsRequest(client: EmailSender, msg: RecordsRequestMessage): Promise<{ ok: boolean; error?: string }>` where `RecordsRequestMessage = { from: string; to: string; subject: string; text: string }` and `EmailSender = { emails: { send: (m: RecordsRequestMessage) => Promise<{ error: { message: string } | null }> } }`. The `EmailSender` shape is exactly `resend.emails.send` (see `app/api/waitlist/route.ts:61`), so a real `new Resend(key)` satisfies it and a stub satisfies it in tests.

- [ ] **Step 1: Write the failing test**

Create `lib/records-request/send.test.ts`:

```ts
import { test, expect } from "bun:test";
import { sendRecordsRequest } from "./send";

function stub(error: { message: string } | null) {
  const calls: any[] = [];
  const client = { emails: { send: async (m: any) => { calls.push(m); return { error }; } } };
  return { client, calls };
}

test("sends a transactional message and returns ok", async () => {
  const { client, calls } = stub(null);
  const res = await sendRecordsRequest(client, {
    from: "SWFL Data Gulf <hello@swfldatagulf.com>",
    to: "records@example.gov",
    subject: "Florida Public Records Request — X",
    text: "body",
  });
  expect(res.ok).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0].to).toBe("records@example.gov");
  expect(calls[0].from).toBe("SWFL Data Gulf <hello@swfldatagulf.com>");
});

test("passes NO commercial-email fields (no headers, tags, or html)", async () => {
  const { client, calls } = stub(null);
  await sendRecordsRequest(client, {
    from: "SWFL Data Gulf <hello@swfldatagulf.com>",
    to: "records@example.gov",
    subject: "s",
    text: "b",
  });
  expect(calls[0].headers).toBeUndefined();
  expect(calls[0].tags).toBeUndefined();
  expect(calls[0].html).toBeUndefined();
});

test("a send error surfaces as ok:false with the message", async () => {
  const { client } = stub({ message: "domain not verified" });
  const res = await sendRecordsRequest(client, { from: "a", to: "b", subject: "s", text: "b" });
  expect(res.ok).toBe(false);
  expect(res.error).toBe("domain not verified");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/records-request/send.test.ts`
Expected: FAIL — `Cannot find module './send'`.

- [ ] **Step 3: Write the implementation**

Create `lib/records-request/send.ts`:

```ts
// Thin transactional send for a §119 request. Reuses the Resend client shape
// (resend.emails.send) but NOT the marketing batch builders — a records request
// is transactional, not commercial: no unsubscribe header, no tags, plain text.

export interface RecordsRequestMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  emails: { send: (m: RecordsRequestMessage) => Promise<{ error: { message: string } | null }> };
}

export async function sendRecordsRequest(
  client: EmailSender,
  msg: RecordsRequestMessage,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await client.emails.send(msg);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/records-request/send.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/records-request/send.ts lib/records-request/send.test.ts
git commit -m "feat(records-request): transactional §119 send"
```

---

### Task 5: CLI — `scripts/records-request.mts`

**Files:**
- Create: `scripts/records-request.mts`

**Interfaces:**
- Consumes: `nextState`/`ACTIONS` (`lib/records-request/state.ts`), `draftRequestBody`/`draftSubject` (`lib/records-request/template.ts`), `sendRecordsRequest` (`lib/records-request/send.ts`), `resolveSupabaseCreds` (`scripts/lib/supabase-creds.mjs`).
- Produces: the operator CLI. Verbs: `add`, `draft`, `send [--confirm]`, `ack`, `quote <usd>`, `approve-cost`, `fulfill [--received <ref>]`, `land <target>`, `deny [note]`, `withdraw [note]`, `list [--quiet N]`.

- [ ] **Step 1: Write the CLI**

Create `scripts/records-request.mts`:

```ts
#!/usr/bin/env bun
// records-request.mts — operator CLI for the Chapter 119 outbound engine.
// Modeled on scripts/check.mjs (same Supabase REST helper + loud-fail discipline).
// Run: bun scripts/records-request.mts <verb> ...
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveSupabaseCreds } from "./lib/supabase-creds.mjs";
import { nextState } from "../lib/records-request/state.ts";
import { draftRequestBody, draftSubject } from "../lib/records-request/template.ts";
import { sendRecordsRequest, type EmailSender } from "../lib/records-request/send.ts";

const SECRETS_PATH = resolve(process.cwd(), ".dlt/secrets.toml");
const FROM = "SWFL Data Gulf <hello@swfldatagulf.com>";

function fail(msg: string): never {
  console.error(`records-request: ${msg}`);
  process.exit(1);
}

function secretsText(): string {
  try { return readFileSync(SECRETS_PATH, "utf8"); } catch { return ""; }
}

function creds() {
  const c = resolveSupabaseCreds({ tomlText: secretsText(), env: process.env });
  if (!c) fail("SUPABASE_URL / SUPABASE_SERVICE_KEY not found in secrets or env");
  return c;
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = creds();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      "Content-Type": "application/json", ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) fail(`Supabase ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function resendKey(): string {
  const fromEnv = process.env.RESEND_API_KEY;
  if (fromEnv) return fromEnv;
  const m = secretsText().match(/^RESEND_API_KEY\s*=\s*"([^"]+)"/m);
  if (m) return m[1];
  fail("RESEND_API_KEY not found in env or .dlt/secrets.toml");
}

async function getRow(key: string) {
  const rows = await rest(`records_requests?request_key=eq.${encodeURIComponent(key)}&select=*`);
  if (!rows.length) fail(`no request with key ${key}`);
  return rows[0];
}

// PATCH a row's state via nextState (loud on illegal transition) + extra fields.
async function transition(key: string, action: string, extra: Record<string, unknown> = {}) {
  const row = await getRow(key);
  const to = nextState(row.state, action); // throws on illegal transition
  const patch = { state: to, last_contact_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(), ...extra };
  await rest(`records_requests?request_key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch),
  });
  console.log(`${key}: ${row.state} -> ${to}`);
}

function parseArgs(args: string[]) {
  const positionals: string[] = []; const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) flags[a.slice(2)] = args[i + 1]?.startsWith("--") || args[i + 1] === undefined ? true : args[++i];
    else positionals.push(a);
  }
  return { positionals, flags };
}

async function add(args: string[]) {
  const { positionals, flags } = parseArgs(args);
  const [request_key, target_agency, dataset] = positionals;
  if (!request_key || !target_agency || !dataset)
    fail('add <request_key> <target_agency> "<dataset>" [--contact <email>] [--portal <url>] [--basis "…"] [--follow-up <days>]');
  const existing = await rest(`records_requests?request_key=eq.${encodeURIComponent(request_key)}&select=request_key`);
  if (existing.length) fail(`already exists: ${request_key} (add creates only)`);
  const row: Record<string, unknown> = { request_key, target_agency, dataset, state: "drafted" };
  if (flags.contact) row.contact_email = flags.contact;
  if (flags.portal) row.portal_url = flags.portal;
  if (flags.basis) row.statute_basis = flags.basis;
  if (flags["follow-up"]) row.follow_up_days = Number(flags["follow-up"]);
  await rest("records_requests", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(row) });
  console.log(`added: ${request_key} [drafted]`);
}

function bodyFor(row: any): string {
  return draftRequestBody({ targetAgency: row.target_agency, dataset: row.dataset, statuteBasis: row.statute_basis });
}

async function draft(args: string[]) {
  const [key] = args;
  if (!key) fail("draft <request_key>");
  const row = await getRow(key);
  const body = bodyFor(row);
  // Persist the drafted body for the audit trail; print for review.
  await rest(`records_requests?request_key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ request_body: body, updated_at: new Date().toISOString() }),
  });
  console.log(`--- ${draftSubject(row.dataset)} ---\n${body}`);
}

async function send(args: string[]) {
  const { positionals, flags } = parseArgs(args);
  const [key] = positionals;
  if (!key) fail("send <request_key> [--confirm]");
  const row = await getRow(key);
  if (row.state !== "drafted") fail(`send only from drafted (state is ${row.state})`);
  const body = bodyFor(row);
  const subject = draftSubject(row.dataset);

  if (!flags.confirm) {
    // Review beat: print the draft; also email it to the operator if OPERATOR_EMAIL is set.
    console.log(`--- REVIEW (not sent) — ${subject} ---\n${body}\n`);
    console.log(`To send: bun scripts/records-request.mts send ${key} --confirm`);
    const operator = process.env.OPERATOR_EMAIL;
    if (operator) {
      const { Resend } = await import("resend");
      const client = new Resend(resendKey()) as unknown as EmailSender;
      const r = await sendRecordsRequest(client, { from: FROM, to: operator, subject: `[REVIEW] ${subject}`, text: body });
      console.log(r.ok ? `emailed draft to ${operator} for review` : `review-email failed: ${r.error}`);
    }
    return;
  }

  // Approved. Portal-only rows print the body + URL and file; email rows send.
  if (!row.contact_email) {
    if (!row.portal_url) fail(`${key} has neither contact_email nor portal_url — cannot file`);
    console.log(`PORTAL FILING — paste the body below into: ${row.portal_url}\n\n${body}`);
  } else {
    const { Resend } = await import("resend");
    const client = new Resend(resendKey()) as unknown as EmailSender;
    const r = await sendRecordsRequest(client, { from: FROM, to: row.contact_email, subject, text: body });
    if (!r.ok) fail(`send failed (state left drafted): ${r.error}`); // a failed send must NOT look filed
    console.log(`sent to ${row.contact_email}`);
  }
  await transition(key, "send", { filed_at: new Date().toISOString(), request_body: body });
}

async function list(args: string[]) {
  const { flags } = parseArgs(args);
  const rows = await rest(`records_requests?state=in.(drafted,filed,acknowledged,cost_quoted,cost_approved,fulfilled)&select=request_key,target_agency,state,follow_up_days,filed_at,last_contact_at&order=last_contact_at.asc.nullsfirst`);
  const now = Date.now();
  const quiet = flags.quiet != null ? Number(flags.quiet) : null;
  const out = rows.filter((r: any) => {
    if (quiet == null) return true;
    const since = r.last_contact_at ?? r.filed_at;
    if (!since) return r.state === "drafted"; // never-filed always shows under --quiet
    return (now - new Date(since).getTime()) / 86400000 >= quiet;
  });
  if (!out.length) { console.log(quiet != null ? `none quiet ≥${quiet}d ✓` : "none open ✓"); return; }
  for (const r of out) {
    const since = r.last_contact_at ?? r.filed_at;
    const days = since ? Math.floor((now - new Date(since).getTime()) / 86400000) : null;
    const age = days != null ? ` [${days}d quiet]` : " [not filed]";
    console.log(`  ${r.request_key}  ·  ${r.target_agency}  ·  ${r.state}${age}`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "add": await add(args); break;
  case "draft": await draft(args); break;
  case "send": await send(args); break;
  case "ack": await transition(args[0], "ack"); break;
  case "quote": await transition(args[0], "quote", { cost_quoted_usd: Number(args[1]) }); break;
  case "approve-cost": await transition(args[0], "approveCost", { cost_approved_usd: (await getRow(args[0])).cost_quoted_usd }); break;
  case "fulfill": { const { positionals, flags } = parseArgs(args); await transition(positionals[0], "fulfill", flags.received ? { received_ref: flags.received } : {}); break; }
  case "land": await transition(args[0], "land", { landed_target: args[1] }); break;
  case "deny": await transition(args[0], "deny", args[1] ? { notes: args.slice(1).join(" ") } : {}); break;
  case "withdraw": await transition(args[0], "withdraw", args[1] ? { notes: args.slice(1).join(" ") } : {}); break;
  case "list": await list(args); break;
  default:
    console.log('usage: bun scripts/records-request.mts <add|draft|send|ack|quote|approve-cost|fulfill|land|deny|withdraw|list>');
    process.exit(cmd ? 1 : 0);
}
```

- [ ] **Step 2: Verify `resolveSupabaseCreds` accepts the `{ tomlText, env }` shape**

Run: `grep -n "export function resolveSupabaseCreds" scripts/lib/supabase-creds.mjs`
Expected: a match. (This is the same call `scripts/check.mjs:50` makes — `resolveSupabaseCreds({ tomlText, env: process.env })`.) If the signature differs, match it exactly.

- [ ] **Step 3: Live smoke — add a throwaway row, draft it, list it, withdraw it (no send)**

Run:
```bash
bun scripts/records-request.mts add __smoke__ "Test Agency" "A throwaway test dataset." --contact records@example.gov
bun scripts/records-request.mts draft __smoke__
bun scripts/records-request.mts list --quiet 0
bun scripts/records-request.mts withdraw __smoke__ "smoke test cleanup"
```
Expected: `added: __smoke__ [drafted]`; then a printed §119 draft naming "Test Agency"; then a list line `__smoke__ · Test Agency · drafted [not filed]`; then `__smoke__: drafted -> withdrawn`. No email is sent (no `send --confirm`).

- [ ] **Step 4: Verify the smoke row is terminal (withdrawn), not lingering open**

Run: `bun scripts/records-request.mts list`
Expected: `__smoke__` does NOT appear (withdrawn is terminal, filtered out of the open list). If any real rows exist they may print; `__smoke__` must not.

- [ ] **Step 5: Commit**

```bash
git add scripts/records-request.mts
git commit -m "feat(records-request): operator CLI (add/draft/approve-send/track)"
```

---

### Task 6: Session-start quiet-request surface

**Files:**
- Modify: `scripts/session-kickoff.mjs` (add a fetch fn after `getOpenChecks` ~line 86; add a summariser; add a fetch + output line in `main`)

**Interfaces:**
- Consumes: `public.records_requests` (Task 1), the existing `sbUrl`/`sbKey` resolved in `main` (`scripts/session-kickoff.mjs:143-147`).
- Produces: a `Records reqs : …` line in the kickoff block, listing requests gone quiet past `follow_up_days` (oldest first).

- [ ] **Step 1: Add the fetch + summariser after `getOpenChecks`**

In `scripts/session-kickoff.mjs`, immediately after the `getOpenChecks` function (after line 86, before the `morningBriefBlock` comment), insert:

```js
async function getOpenRecordsRequests(sbUrl, sbKey) {
  const headers = { apikey: sbKey, Authorization: "Bearer " + sbKey };
  try {
    const res = await fetch(
      `${sbUrl}/rest/v1/records_requests?state=in.(filed,acknowledged,cost_quoted,cost_approved,fulfilled)&select=request_key,target_agency,state,follow_up_days,filed_at,last_contact_at&order=last_contact_at.asc.nullsfirst&limit=200`,
      { headers },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Requests past their follow_up_days with no contact — the "gone quiet" nudge.
function summariseQuietRequests(rows) {
  if (!rows) return "(could not reach Supabase)";
  const now = Date.now();
  const quiet = rows.filter((r) => {
    const since = r.last_contact_at ?? r.filed_at;
    if (!since) return false;
    return (now - new Date(since).getTime()) / 86400000 >= (r.follow_up_days ?? 14);
  });
  if (rows.length === 0) return "none open ✓";
  if (quiet.length === 0) return `${rows.length} open, none quiet ✓`;
  return (
    `${rows.length} open, ${quiet.length} gone quiet:\n    · ` +
    quiet
      .slice(0, 6)
      .map((r) => {
        const since = r.last_contact_at ?? r.filed_at;
        const days = Math.floor((now - new Date(since).getTime()) / 86400000);
        return `${r.request_key} — ${r.target_agency} (${r.state}, ${days}d quiet)`;
      })
      .join("\n    · ")
  );
}
```

- [ ] **Step 2: Fetch + build the line in `main`, after the checks block**

In `main`, immediately after the checks `try/catch` closes (after line 157, before the `// Build queue` comment), insert:

```js
  // Records requests gone quiet — surface so a filed request is never forgotten.
  let requestsLine = "(secrets not found)";
  try {
    const secrets = readFileSync(SECRETS_PATH, "utf8");
    const sbUrl = parseTomlStr(secrets, "SUPABASE_URL") ?? parseTomlStr(secrets, "BRAINS_SUPABASE_URL");
    const sbKey =
      parseTomlStr(secrets, "SUPABASE_SERVICE_KEY") ?? parseTomlStr(secrets, "BRAINS_SUPABASE_SERVICE_KEY");
    if (sbUrl && sbKey) requestsLine = summariseQuietRequests(await getOpenRecordsRequests(sbUrl, sbKey));
  } catch {
    requestsLine = "(secrets read error)";
  }
```

- [ ] **Step 3: Add the output line to the kickoff block**

In the `process.stdout.write(...)` template (line 230-231), add a line after `Open checks`:

```js
      `Open checks  : ${checksLine}\n` +
      `Records reqs : ${requestsLine}\n` +
      `Build queue  : ${queueLine}\n` +
```

- [ ] **Step 4: Run session-kickoff and confirm the line renders**

Run: `node scripts/session-kickoff.mjs`
Expected: the kickoff block prints a `Records reqs : …` line. With the table empty it reads `Records reqs : none open ✓`. It must never throw (the outer `main().catch(() => {})` and per-block try/catch guarantee it never blocks session start).

- [ ] **Step 5: Commit**

```bash
git add scripts/session-kickoff.mjs
git commit -m "feat(records-request): surface quiet requests at session start"
```

---

### Task 7: Seed the triaged targets + close the build check

**Files:**
- No code files. Uses the CLI (Task 5) to seed rows; updates `_AUDIT_AND_ROADMAP/build-queue.md`; opens follow-up checks; closes `records_request_engine_live_verify`.

**Interfaces:**
- Consumes: the CLI and table from Tasks 1 & 5.

- [ ] **Step 1: Seed the two triaged candidate rows (drafted, NOT sent)**

Each seed is a *candidate pending confirmation it has no download path we already reach*. Do NOT send them — they land as `drafted`.

Run:
```bash
bun scripts/records-request.mts add dbpr_re_emails "Florida Department of Business and Professional Regulation" "Email addresses on file for all currently active Lee County and Collier County individual real estate licensees (license code 2501), per s. 455.275 and s. 668.6076." --contact "publicrecordsrequest@myfloridalicense.com" --follow-up 21
bun scripts/records-request.mts add fldor_collier_nal "Florida Department of Revenue" "The most recent Collier County (county 21) real property assessment roll (NAL/Name-Address-Legal) file, in electronic form." --follow-up 21
```
Expected: two `added: … [drafted]` lines.

> **Contact-address caveat:** `publicrecordsrequest@myfloridalicense.com` is a placeholder — confirm the real DBPR records-custodian address before any `send --confirm` (Follow-up check below). `fldor_collier_nal` is left with no `--contact` on purpose (portal/address unconfirmed).

- [ ] **Step 2: Verify both seeds are present and drafted**

Run: `bun scripts/records-request.mts list`
Expected: both `dbpr_re_emails` and `fldor_collier_nal` appear as `drafted [not filed]`.

- [ ] **Step 3: Open the follow-up confirmation checks (RULE 2.4 — no silent deferrals)**

Run:
```bash
node scripts/check.mjs open records-request dbpr_re_emails_confirm_lane "Confirm DBPR licensee email path: records-request vs online-lookup scrape; pin the real records-custodian address before first send" --detail "new-agent-radar deferred this. If the license-detail page renders email, downgrade dbpr_re_emails to a Tier-2 scrape." --due 2026-08-15
node scripts/check.mjs open records-request fldor_collier_nal_confirm_source "Confirm FL DOR Collier NAL roll is not already reachable via the FDOR ArcGIS FeatureServer we ingest for collier_parcels, and pin the filing channel" --detail "If reachable via ArcGIS, this is a Tier-2 miss, not a records request — withdraw the seed." --due 2026-08-15
```
Expected: two `opened: …` lines.

- [ ] **Step 4: Sync the build queue**

Add a done line under the appropriate section of `_AUDIT_AND_ROADMAP/build-queue.md` noting the records-request engine shipped (table + CLI + session surfacing + seeds), with the two confirmation checks as the open follow-ups. (Follow the file's existing format.)

- [ ] **Step 5: Update SESSION_LOG and close the live-verify check**

Append a SESSION_LOG entry (what shipped: migration, three pure modules + tests, CLI, session-kickoff surface, two triaged seeds, two follow-up checks). Then close the build check with evidence:

```bash
node scripts/check.mjs close records_request_engine_live_verify --evidence "public.records_requests live (bun run-migration); scripts/records-request.mts add/draft/list/withdraw smoke passed; session-kickoff prints Records reqs line; seeds dbpr_re_emails + fldor_collier_nal drafted; follow-up checks opened"
```
Expected: `closed: records_request_engine_live_verify … [manual]`.

- [ ] **Step 6: Commit**

```bash
git add SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "docs(records-request): seed targets, follow-up checks, session log"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-11-records-request-engine-design.md`):
- Table `public.records_requests` → Task 1. ✓ (all spec columns present)
- Lifecycle state machine (incl. §119.07(4) cost gate) → Task 2. ✓
- §119 draft template (cost-estimate + exemption asks) → Task 3. ✓
- Transactional send, NOT marketing batch → Task 4 (+ test asserting no headers/tags). ✓
- CLI modeled on check.mjs, all verbs, `--confirm` approval gate → Task 5. ✓
- Landing reuses ODD per-target → `land <target>` records a free-text `landed_target` pointer; no new landing machinery (spec §4 / out-of-scope). ✓
- Session-start surfacing → Task 6. ✓
- Seeds triaged; `collier_parcels` sale price excluded → Task 7 (only the two genuine candidates seeded; exclusion is documented, nothing to seed). ✓
- Out-of-scope (inbound parsing, generic landing bridge) → not built; agency replies recorded via CLI verbs (`ack`/`quote`/`fulfill`). ✓
- Follow-ups (confirm DBPR email path; confirm FL DOR source; pin contact addresses) → Task 7 opens checks for all three. ✓

**Placeholder scan:** no TBD/TODO; every code step carries complete code; every command has expected output. The one intentional placeholder value (the DBPR contact address) is flagged in-line with a guard check before any live send. ✓

**Type consistency:** `EmailSender`/`RecordsRequestMessage` defined in Task 4 and imported unchanged in Task 5; `nextState(current, action)` signature identical in Tasks 2 and 5; `draftRequestBody`/`draftSubject` signatures identical in Tasks 3 and 5; column names in the Task 1 DDL match every `select=`/`PATCH` field in Tasks 5 and 6. ✓

## Notes for the executor

- **Pre-push gates that apply:** none of the pack/vocab/ingest gates apply (no refinery packs, no `data_lake.*` writes, no new deps). The SESSION_LOG gate does — Task 7 Step 5 writes it. Use `node scripts/safe-push.mjs`, stage explicit paths, never `--no-verify`.
- **Do NOT push without operator confirmation** — commit per task; the operator authorizes the push.
- **Never `send --confirm` a seed** until its confirmation check (Task 7 Step 3) is closed and a real records-custodian address is pinned.
