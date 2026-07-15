# Property Watch Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 8 tasks, 8 files, keywords: schema, architecture

**Goal:** Make the already-built Property Watch feature (spec `2026-07-07-property-watch-design.md`)
reachable and live: a one-click "track a property" entry point, a working digest email send, and both
GHA crons flipped from dispatch-only to scheduled.

**Architecture:** Three independent layers, built in dependency order. (1) A UI entry point
(`TrackPropertyButton`) that calls the two API routes the Watch tab already exercises — no new routes.
(2) A digest-send wiring layer: a new pure composer (`lib/project/watch-digest-email.ts`) plus changes
to the existing adapter (`scripts/project-feed/watch-digest.mts`) that resolve the recipient, gate on
the existing usage meter, send via Resend, and stamp `notified_at` only after a confirmed send. A new
branch on the existing `/api/unsubscribe` route closes the opt-out loop. (3) An operator-run live-verify
checkpoint, followed by flipping both workflow files from `workflow_dispatch`-only to a real `schedule:`.

**Tech Stack:** Next.js App Router (TypeScript), Supabase (Postgres + Auth Admin API), Resend
(transactional email), Bun test runner, GitHub Actions.

## Global Constraints

- Governing design doc: `docs/superpowers/specs/2026-07-15-property-watch-activation-design.md`
  (extends `docs/superpowers/specs/2026-07-07-property-watch-design.md`).
- No schema changes. No new API routes except the one new branch on `/api/unsubscribe`.
- Every digest line is a raw fact or direct subtraction already computed upstream
  (`lib/project/watch-delta.ts`) — this plan adds transport/compliance only, never touches
  detection/classification/digest-composition logic (explicitly out of scope per the spec).
- CAN-SPAM: every live digest send carries a `List-Unsubscribe` / `List-Unsubscribe-Post` header pair
  and a postal address in the body (verified against the FTC compliance guide — see spec).
- "Send is the paywall": every live send must pass `checkUsageLimit` and call `recordEmailSent` after
  success — no bypassing `lib/email/usage.ts`.
- Follow established codebase conventions: pure `lib/**` logic gets `bun:test` coverage colocated as
  `*.test.ts`; Next.js route handlers and `scripts/**` adapters in this codebase are NOT unit-tested
  (verified by absence of test files for `app/api/projects/[id]/watch/route.ts`,
  `app/api/unsubscribe/route.ts`, and `scripts/project-feed/watch-scan.mts`) — don't introduce a new
  test pattern for them here.
- Before starting, run `repolith claim list` — the working tree has other sessions' active file
  claims; none of this plan's files were claimed as of 2026-07-15, but re-check before editing.
- Verify with `bunx next build` (not `npx tsc`) after UI/route changes; run
  `bun test lib/project/watch-digest-email.test.ts` after the composer task.
- Commit after every task. Do not push until the whole plan (through Task 6) is complete and reviewed
  — Task 7 (live-verify) and Task 8 (cron flip) are operator-gated and must not be pushed silently.

---

### Task 1: TrackPropertyButton component

**Files:**
- Create: `app/project/TrackPropertyButton.tsx`

**Interfaces:**
- Consumes: `POST /api/projects` (existing route, `app/api/projects/route.ts`) — body
  `{ kind: "general", title: string, subject_address: string }`, response `{ id: string }` on success.
- Consumes: `POST /api/projects/{id}/watch` (existing route,
  `app/api/projects/[id]/watch/route.ts`) — body `{ mode: "watching" }`, 200 on success.
- Consumes: `projectHome` is NOT used here (deliberately) — routes to `` `/project/${id}/watch` ``
  directly via `useRouter().push`.

No test file — `ShowingPrepButton.tsx` and `NewListingButton.tsx` (the two closest analogs in this
same directory) have no test coverage; this component follows the same convention.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Track-a-property entry point. Creates a general project anchored to the typed
 * address, enables watch mode on it (server applies the 0.5mi / 2% defaults), and
 * routes straight to the Watch tab — not projectHome() — since a watch-only
 * project has nothing to show on the Email tool yet.
 */
export function TrackPropertyButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const subject = address.trim();
    if (!subject) return;
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "general", title: subject, subject_address: subject }),
      });
      if (!res.ok) return;
      const { id } = (await res.json()) as { id?: string };
      if (!id) return;
      const watchRes = await fetch(`/api/projects/${id}/watch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "watching" }),
      });
      if (!watchRes.ok) return;
      router.push(`/project/${id}/watch`);
    } catch {
      // leave the form open so the user can retry
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Track a property and get nearby comp updates by email"
        className="rounded-full border border-gulf-teal px-4 py-2 text-sm font-medium text-gulf-teal transition-opacity hover:opacity-90"
      >
        Track a property
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void create();
      }}
      className="flex items-center gap-2"
    >
      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Address to watch"
        aria-label="Address to watch"
        autoFocus
        className="rounded-full border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-gulf-teal focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-gulf-teal px-4 py-2 text-sm font-medium text-[#04121b] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Starting…" : "Start watching"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit -p . 2>&1 | grep TrackPropertyButton`
Expected: no output (no errors referencing the new file).

- [ ] **Step 3: Commit**

```bash
git add app/project/TrackPropertyButton.tsx
git commit -m "feat(project): add TrackPropertyButton — one-click Property Watch entry point"
```

---

### Task 2: Wire the button into the project list

**Files:**
- Modify: `app/project/page.tsx:19` (imports) and `app/project/page.tsx:165-169` (button row)

**Interfaces:**
- Consumes: `TrackPropertyButton` from `./TrackPropertyButton` (Task 1).

- [ ] **Step 1: Add the import**

In `app/project/page.tsx`, after line 19 (`import { ShowingPrepButton } from "./ShowingPrepButton";`):

```tsx
import { ShowingPrepButton } from "./ShowingPrepButton";
import { TrackPropertyButton } from "./TrackPropertyButton";
```

- [ ] **Step 2: Add the button to the row**

Replace the button row at `app/project/page.tsx:165-169`:

```tsx
        <div className="flex items-center gap-2">
          <NewListingButton />
          <ShowingPrepButton />
          <TrackPropertyButton />
          <NewProjectButton />
        </div>
```

- [ ] **Step 3: Build**

Run: `bunx next build`
Expected: build succeeds with no new errors in `app/project/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/project/page.tsx
git commit -m "feat(project): wire TrackPropertyButton into the project list quick-create row"
```

---

### Task 3: Pure watch-digest email composer

**Files:**
- Create: `lib/project/watch-digest-email.ts`
- Test: `lib/project/watch-digest-email.test.ts`

**Interfaces:**
- Consumes: `ProjectDigest` from `./watch-digest` (existing — `{project_id, event_ids, subject, lines}`).
- Produces: `WatchDigestEmailConfig`, `WatchDigestMessage`, `buildWatchDigestEmail(digest, recipientEmail, config): WatchDigestMessage`, `EmailSender` interface, `sendWatchDigestEmail(client, msg): Promise<{ok: boolean; error?: string}>` — all consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/project/watch-digest-email.test.ts
import { describe, test, expect } from "bun:test";
import { buildWatchDigestEmail, sendWatchDigestEmail, type WatchDigestEmailConfig } from "./watch-digest-email";
import type { ProjectDigest } from "./watch-digest";

const CONFIG: WatchDigestEmailConfig = {
  senderName: "SWFL Data Gulf",
  senderAddress: "hello@swfldatagulf.com",
  senderContact: "SWFL Data Gulf, hello@swfldatagulf.com",
  postalAddress: "123 Main St, Fort Myers, FL 33901",
  siteUrl: "https://www.swfldatagulf.com",
};

const DIGEST: ProjectDigest = {
  project_id: "p1",
  event_ids: ["e1", "e2"],
  subject: "Cape listing — 2 nearby updates",
  lines: ["New listing 0.3 mi away: 4 bd / 2 ba, $410,000", "Price cut 0.4 mi away: -$8,000 (2.1%)"],
};

describe("buildWatchDigestEmail", () => {
  test("carries the digest subject and every line", () => {
    const msg = buildWatchDigestEmail(DIGEST, "owner@example.com", CONFIG);
    expect(msg.subject).toBe("Cape listing — 2 nearby updates");
    expect(msg.to).toBe("owner@example.com");
    expect(msg.from).toBe("SWFL Data Gulf <hello@swfldatagulf.com>");
    expect(msg.text).toContain("New listing 0.3 mi away: 4 bd / 2 ba, $410,000");
    expect(msg.text).toContain("Price cut 0.4 mi away: -$8,000 (2.1%)");
  });

  test("body includes the postal address and sender contact (CAN-SPAM)", () => {
    const msg = buildWatchDigestEmail(DIGEST, "owner@example.com", CONFIG);
    expect(msg.text).toContain(CONFIG.postalAddress);
    expect(msg.text).toContain(CONFIG.senderContact);
  });

  test("unsubscribe link is scoped to this project and carries the pid param", () => {
    const msg = buildWatchDigestEmail(DIGEST, "owner@example.com", CONFIG);
    const expected = "https://www.swfldatagulf.com/api/unsubscribe?pid=p1";
    expect(msg.text).toContain(expected);
    expect(msg.headers["List-Unsubscribe"]).toContain(expected);
  });

  test("List-Unsubscribe-Post header is the one-click RFC 8058 value", () => {
    const msg = buildWatchDigestEmail(DIGEST, "owner@example.com", CONFIG);
    expect(msg.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  test("strips a trailing slash from siteUrl before building the unsubscribe link", () => {
    const msg = buildWatchDigestEmail(DIGEST, "owner@example.com", { ...CONFIG, siteUrl: "https://www.swfldatagulf.com/" });
    expect(msg.text).toContain("https://www.swfldatagulf.com/api/unsubscribe?pid=p1");
    expect(msg.text).not.toContain("swfldatagulf.com//api");
  });
});

describe("sendWatchDigestEmail", () => {
  function stub(error: { message: string } | null) {
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      emails: {
        send: async (m: Record<string, unknown>) => {
          calls.push(m);
          return { error };
        },
      },
    };
    return { client, calls };
  }

  test("sends the built message and returns ok", async () => {
    const { client, calls } = stub(null);
    const msg = buildWatchDigestEmail(DIGEST, "owner@example.com", CONFIG);
    const res = await sendWatchDigestEmail(client, msg);
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe("owner@example.com");
  });

  test("a send error surfaces as ok:false with the message", async () => {
    const { client } = stub({ message: "domain not verified" });
    const msg = buildWatchDigestEmail(DIGEST, "owner@example.com", CONFIG);
    const res = await sendWatchDigestEmail(client, msg);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("domain not verified");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/project/watch-digest-email.test.ts`
Expected: FAIL — `Cannot find module './watch-digest-email'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/project/watch-digest-email.ts
//
// Pure email composition + thin send wrapper for the Property Watch daily digest (spec
// 2026-07-15-property-watch-activation-design.md, "Wire the digest send"). No DB, no disk, no
// Date.now() in the composer — the adapter (scripts/project-feed/watch-digest.mts) supplies the
// digest, recipient, and config, and owns the actual Resend call + notified_at stamp.
//
// CAN-SPAM: treated as a full commercial send (verified against the FTC compliance guide 2026-07-15
// — the transactional/relationship exemption is content-based, not opt-in-based, and a nearby-market
// digest doesn't fit any of the 5 exempt categories). Every message carries a postal address in the
// body and List-Unsubscribe / List-Unsubscribe-Post headers pointing at a per-project opt-out link.

import type { ProjectDigest } from "./watch-digest";

export interface WatchDigestEmailConfig {
  senderName: string;
  senderAddress: string;
  senderContact: string;
  postalAddress: string;
  /** Absolute origin, e.g. "https://www.swfldatagulf.com" — trailing slash tolerated. */
  siteUrl: string;
}

export interface WatchDigestMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
}

/** Builds the per-project unsubscribe link consumed by app/api/unsubscribe/route.ts's `pid` branch. */
function unsubscribeUrl(siteUrl: string, projectId: string): string {
  return `${siteUrl.replace(/\/$/, "")}/api/unsubscribe?pid=${encodeURIComponent(projectId)}`;
}

/** One project's digest → one ready-to-send Resend message. Pure. */
export function buildWatchDigestEmail(
  digest: ProjectDigest,
  recipientEmail: string,
  config: WatchDigestEmailConfig,
): WatchDigestMessage {
  const unsubUrl = unsubscribeUrl(config.siteUrl, digest.project_id);
  const bodyLines = [
    ...digest.lines.map((l) => `• ${l}`),
    "",
    `Stop these updates: ${unsubUrl}`,
    "",
    config.senderContact,
    config.postalAddress,
  ];
  return {
    from: `${config.senderName} <${config.senderAddress}>`,
    to: recipientEmail,
    subject: digest.subject,
    text: bodyLines.join("\n"),
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/** Minimal shape of resend.emails.send we depend on (injectable for tests). */
export interface EmailSender {
  emails: {
    send: (m: WatchDigestMessage) => Promise<{ error: { message: string } | null }>;
  };
}

/** Thin I/O; never throws. Same shape as lib/records-request/send.ts's sendRecordsRequest. */
export async function sendWatchDigestEmail(
  client: EmailSender,
  msg: WatchDigestMessage,
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/project/watch-digest-email.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/project/watch-digest-email.ts lib/project/watch-digest-email.test.ts
git commit -m "feat(project): pure composer for the Property Watch digest email (CAN-SPAM-compliant)"
```

---

### Task 4: Unsubscribe route — `pid` branch for Property Watch

**Files:**
- Modify: `app/api/unsubscribe/route.ts`

**Interfaces:**
- Consumes: nothing new (existing `createServiceRoleClient` import already in the file).
- Produces: a `pid` query param that disables watch on that project — depended on by Task 3's
  `buildWatchDigestEmail` (link shape) and exercised at live-verify (Task 7).

No test file — this route has no existing test coverage (see Global Constraints); mirrors the
existing `unsubscribeOutreach`/`unsubscribeWeeklyRead` functions exactly.

- [ ] **Step 1: Add the branch function**

In `app/api/unsubscribe/route.ts`, after the `unsubscribeWeeklyRead` function (before `async function handle`):

```ts
// Property Watch digests carry ?pid=<projects.id>. Turn watch off for that project (the scan/digest
// crons then skip it) — same best-effort contract as the branches above. Does NOT delete the
// project or its past project_events rows; only future scans/digests stop.
async function unsubscribeWatch(pid: string | null): Promise<void> {
  if (!pid) return;
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("projects").update({ watch_enabled: false }).eq("id", pid);
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 2: Call it from `handle`**

Replace:

```ts
async function handle(req: NextRequest): Promise<void> {
  const params = new URL(req.url).searchParams;
  await unsubscribe(params.get("id"));
  await unsubscribeOutreach(params.get("rid"));
  await unsubscribeWeeklyRead(params.get("wid"));
}
```

with:

```ts
async function handle(req: NextRequest): Promise<void> {
  const params = new URL(req.url).searchParams;
  await unsubscribe(params.get("id"));
  await unsubscribeOutreach(params.get("rid"));
  await unsubscribeWeeklyRead(params.get("wid"));
  await unsubscribeWatch(params.get("pid"));
}
```

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "api/unsubscribe"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/api/unsubscribe/route.ts
git commit -m "feat(unsubscribe): add pid branch — Property Watch digest opt-out turns watch_enabled off"
```

---

### Task 5: Wire the send into the digest adapter

**Files:**
- Modify: `scripts/project-feed/watch-digest.mts`

**Interfaces:**
- Consumes: `buildWatchDigestEmail`, `sendWatchDigestEmail`, `type WatchDigestEmailConfig` from
  `@/lib/project/watch-digest-email` (Task 3); `checkUsageLimit`, `recordEmailSent` from
  `@/lib/email/usage` (existing); `Resend` from `resend` (existing dependency, already used by
  `scripts/email/build-digest.mts`).

No test file — adapters in `scripts/project-feed/` are not unit-tested in this codebase (see Global
Constraints); this is exercised at live-verify (Task 7).

- [ ] **Step 1: Add imports and config constants**

At the top of `scripts/project-feed/watch-digest.mts`, replace:

```ts
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { groupWatchDigests, type WatchEventForDigest } from "@/lib/project/watch-digest";

const SEND = process.argv.includes("--send");
const LIVE_OK = process.env.WATCH_DIGEST_LIVE === "1";
const WATCH_TYPES = ["nearby_new_listing", "nearby_price_cut", "nearby_sale"];
```

with:

```ts
import { Resend } from "resend";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { groupWatchDigests, type WatchEventForDigest } from "@/lib/project/watch-digest";
import {
  buildWatchDigestEmail,
  sendWatchDigestEmail,
  type WatchDigestEmailConfig,
} from "@/lib/project/watch-digest-email";
import { checkUsageLimit, recordEmailSent } from "@/lib/email/usage";

const SEND = process.argv.includes("--send");
const LIVE_OK = process.env.WATCH_DIGEST_LIVE === "1";
const WATCH_TYPES = ["nearby_new_listing", "nearby_price_cut", "nearby_sale"];

// Same placeholder-fallback convention as scripts/email/build-digest.mts: a misconfigured deploy
// fails LOUDLY (a placeholder string in a real send) rather than silently mailing a blank footer.
const EMAIL_CONFIG: WatchDigestEmailConfig = {
  senderName: process.env.DIGEST_SENDER_NAME ?? "[PLACEHOLDER — set DIGEST_SENDER_NAME]",
  senderAddress: process.env.DIGEST_SENDER_ADDRESS ?? "hello@swfldatagulf.com",
  senderContact: process.env.DIGEST_SENDER_CONTACT ?? "[PLACEHOLDER — set DIGEST_SENDER_CONTACT]",
  postalAddress: process.env.DIGEST_POSTAL_ADDRESS ?? "[PLACEHOLDER — set DIGEST_POSTAL_ADDRESS]",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.swfldatagulf.com",
};
```

- [ ] **Step 2: Select `user_id` alongside project titles**

Replace:

```ts
  // 2. Project titles (for the subject line).
  const projectIds = [...new Set(events.map((e) => e.project_id))];
  const { data: projRows } = await db.from("projects").select("id, title").in("id", projectIds);
  const titleById = new Map<string, string | null>(
    (projRows ?? []).map((p) => [p.id as string, (p.title as string | null) ?? null]),
  );
```

with:

```ts
  // 2. Project titles (for the subject line) + owner ids (for the live send's recipient lookup).
  const projectIds = [...new Set(events.map((e) => e.project_id))];
  const { data: projRows } = await db
    .from("projects")
    .select("id, title, user_id")
    .in("id", projectIds);
  const titleById = new Map<string, string | null>(
    (projRows ?? []).map((p) => [p.id as string, (p.title as string | null) ?? null]),
  );
  const ownerIdByProject = new Map<string, string>(
    (projRows ?? []).map((p) => [p.id as string, p.user_id as string]),
  );
```

- [ ] **Step 3: Replace the hard-gated throw with the real send loop**

Replace the entire step-4 block:

```ts
  // 4. Live send — hard-gated. A parked cron in --send mode without the operator's env flag is a no-op
  //    that stamps NOTHING (never mark an event notified when no email left the building).
  if (!LIVE_OK) {
    console.warn(
      "  --send given but WATCH_DIGEST_LIVE!=1 — live email transport is operator-gated " +
        "(property_watch_live_verify). Composed digests above were NOT sent and NOTHING was stamped.",
    );
    for (const d of digests) console.log(`  would send: ${d.subject} (${d.lines.length} event(s))`);
    return 0;
  }

  // The operator has opted in. The concrete Resend/sender-config/reply-token wiring lands with the
  // live-verify (kept out of the offline build so it can't be shipped unverified). Fail loud rather
  // than silently stamp: if execution reaches here, the send seam isn't wired yet.
  throw new Error(
    "WATCH_DIGEST_LIVE=1 but the live send seam is not wired in this build — wire it during " +
      "property_watch_live_verify, then stamp notified_at on each digest.event_ids only after a 2xx send.",
  );
```

with:

```ts
  // 4. Live send — hard-gated. A parked cron in --send mode without the operator's env flag is a no-op
  //    that stamps NOTHING (never mark an event notified when no email left the building).
  if (!LIVE_OK) {
    console.warn(
      "  --send given but WATCH_DIGEST_LIVE!=1 — live email transport is operator-gated " +
        "(property_watch_live_verify). Composed digests above were NOT sent and NOTHING was stamped.",
    );
    for (const d of digests) console.log(`  would send: ${d.subject} (${d.lines.length} event(s))`);
    return 0;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const d of digests) {
    const userId = ownerIdByProject.get(d.project_id);
    if (!userId) {
      console.warn(`  SKIP ${d.project_id} — no owner on the project row.`);
      skipped++;
      continue;
    }

    const { data: userRes } = await db.auth.admin.getUserById(userId);
    const recipientEmail = userRes?.user?.email;
    if (!recipientEmail) {
      console.warn(`  SKIP ${d.project_id} — no auth email for owner ${userId}.`);
      skipped++;
      continue;
    }

    const usage = await checkUsageLimit(userId);
    if (!usage.allowed) {
      console.warn(
        `  SKIP ${d.project_id} — usage limit reached (${usage.sent}/${usage.limit}, tier=${usage.tier}).`,
      );
      skipped++;
      continue;
    }

    const msg = buildWatchDigestEmail(d, recipientEmail, EMAIL_CONFIG);
    const result = await sendWatchDigestEmail(resend, msg);
    if (!result.ok) {
      console.error(`  FAILED ${d.project_id} — ${result.error}`);
      failed++;
      continue;
    }

    // Stamp + record ONLY after a confirmed send — never speculatively.
    await db
      .from("project_events")
      .update({ notified_at: new Date().toISOString() })
      .in("id", d.event_ids);
    await recordEmailSent(userId, 1);
    sent++;
    console.log(`  SENT ${d.project_id} — ${d.subject} (${d.event_ids.length} event(s))`);
  }

  console.log(`[watch-digest] done · sent=${sent} skipped=${skipped} failed=${failed}`);
  return failed > 0 ? 1 : 0;
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "watch-digest.mts"`
Expected: no output.

- [ ] **Step 5: Dry-run smoke test (no live send — confirms the file still parses and runs)**

Run: `bun scripts/project-feed/watch-digest.mts --dry-run`
Expected: exits 0, same dry-run output shape as before this task (this task only changed the
`--send`-and-`WATCH_DIGEST_LIVE=1` branch, which dry-run never reaches).

- [ ] **Step 6: Commit**

```bash
git add scripts/project-feed/watch-digest.mts
git commit -m "feat(watch-digest): wire the live send — recipient lookup, usage gate, Resend transport"
```

---

### Task 6: Add the digest send's env vars to the workflow

**Files:**
- 🔴 Modify: `.github/workflows/watch-digest-daily.yml`

**Interfaces:** none (config-only change).

- [ ] **Step 1: Add the env vars**

Replace the `env:` block under `Run Property Watch digest`:

```yaml
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          # WATCH_DIGEST_LIVE is intentionally unset here — set it only during the operator live-verify.
```

with:

```yaml
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          DIGEST_SENDER_NAME: ${{ vars.DIGEST_SENDER_NAME }}
          DIGEST_SENDER_ADDRESS: ${{ vars.DIGEST_SENDER_ADDRESS }}
          DIGEST_SENDER_CONTACT: ${{ vars.DIGEST_SENDER_CONTACT }}
          DIGEST_POSTAL_ADDRESS: ${{ vars.DIGEST_POSTAL_ADDRESS }}
          NEXT_PUBLIC_SITE_URL: ${{ secrets.NEXT_PUBLIC_SITE_URL }}
          # WATCH_DIGEST_LIVE is intentionally unset here — set it only during the operator live-verify.
```

(`RESEND_API_KEY`, `DIGEST_SENDER_NAME`, `DIGEST_SENDER_ADDRESS`, `DIGEST_SENDER_CONTACT`,
`DIGEST_POSTAL_ADDRESS`, and `NEXT_PUBLIC_SITE_URL` are all already-existing repo secrets/vars —
confirmed live in `.github/workflows/daily-email-digest.yml`; no new secret needs creating.)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/watch-digest-daily.yml
git commit -m "chore(watch-digest-daily): wire RESEND_API_KEY + digest sender env vars"
```

---

### Task 7: Operator live-verify (STOP — not autonomous)

**This task is not code.** Per the paid-API-spend rule, this is the first live run on this surface and
must not be dispatched silently. Present this checklist to the operator and wait for explicit go-ahead
before any dispatch:

1. Confirm Tasks 1–6 are committed and `bunx next build` + `bun test` are green.
2. Enable watch on one real tracked project (via `TrackPropertyButton` or the existing Watch tab).
3. Operator approves, then dispatch `watch-scan-daily.yml` (`dry_run: false`) — confirm it inserts
   real `project_events` rows (or zero, honestly, if nothing nearby moved), `seed=false` filter applied.
4. Operator approves, then dispatch `watch-digest-daily.yml` with `send: true` **and**
   `WATCH_DIGEST_LIVE=1` set on the run — confirm: a real email lands in the tracked project owner's
   inbox, the CAN-SPAM footer (postal address + unsubscribe link) renders, clicking the unsubscribe
   link flips `watch_enabled` to `false` on that project, and `notified_at` is stamped on exactly the
   events included.
5. Close the `property_watch_live_verify` check: `node scripts/check.mjs close property_watch_live_verify`.

Do not proceed to Task 8 until step 4 passes with a real, confirmed send.

---

### Task 8: Flip both GHA workflows to a real schedule

**Only after Task 7 passes.**

**Files:**
- Modify: `.github/workflows/watch-scan-daily.yml`
- 🔴 Modify: `.github/workflows/watch-digest-daily.yml`

- [ ] **Step 1: Add the schedule to `watch-scan-daily.yml`**

Replace:

```yaml
name: Property Watch scan (daily)

# PARKED until property_watch_live_verify passes: dispatch-only, no active schedule. The scan writes
# only to public.project_events (an app table — no LLM, no paid API), so it is safe to schedule; the
# operator adds the `schedule:` block below after the live-verify. To activate, uncomment:
#   schedule:
#     - cron: "30 16 * * *"   # after listing-lifecycle-daily + lifecycle-nudges (16:00) have committed
on:
  workflow_dispatch:
```

with:

```yaml
name: Property Watch scan (daily)

on:
  schedule:
    # 16:30 UTC — after listing-lifecycle-daily + lifecycle-nudges (16:00 UTC) have committed the
    # day's transitions, per property_watch_live_verify (closed 2026-07-15).
    - cron: "30 16 * * *"
  workflow_dispatch:
```

- [ ] **Step 2: Add the schedule to `watch-digest-daily.yml`**

Replace:

```yaml
name: Property Watch digest (daily)

# PARKED until property_watch_live_verify passes: dispatch-only, no schedule. This send path mails
# real users, so it stays operator-gated. A dispatch defaults to a dry-run (compose + print, stamp
# nothing). A live send additionally requires WATCH_DIGEST_LIVE=1 — the adapter refuses --send without
# it, so this workflow cannot blast email even if triggered. After property_watch_live_verify wires the
# transport, add the schedule + set the env flag:
#   schedule:
#     - cron: "0 17 * * *"   # after watch-scan-daily (16:30) has inserted the day's events
on:
  workflow_dispatch:
```

with:

```yaml
name: Property Watch digest (daily)

# Live send still requires WATCH_DIGEST_LIVE=1 as a workflow-level env below — the adapter refuses
# --send without it. Set after property_watch_live_verify (closed 2026-07-15); scheduling this
# workflow alone does not enable sends.
on:
  schedule:
    - cron: "0 17 * * *"   # after watch-scan-daily (16:30) has inserted the day's events
  workflow_dispatch:
```

- [ ] **Step 3: Set the live-send flag now that live-verify has passed**

In `watch-digest-daily.yml`'s `env:` block (added in Task 6), replace the trailing comment line:

```yaml
          # WATCH_DIGEST_LIVE is intentionally unset here — set it only during the operator live-verify.
```

with:

```yaml
          WATCH_DIGEST_LIVE: "1"
```

- [ ] **Step 4: Commit and ask the operator before pushing**

```bash
git add .github/workflows/watch-scan-daily.yml .github/workflows/watch-digest-daily.yml
git commit -m "feat(property-watch): flip both crons to a real schedule; enable live digest sends"
```

Per RULE 1 ("Ask first: ... anything touching live ... MCP surface" and the paid-API-spend rule), do
not push this commit without operator confirmation — this is the commit that turns on unattended real
email sends.

---

## Self-review notes

- **Spec coverage:** Task 1–2 cover spec item 1 (button). Task 3–6 cover spec item 2 (digest-send
  wiring: recipient, CAN-SPAM, opt-out, usage gate, transport). Task 7 covers the live-verify.
  Task 8 covers spec item 3 (cron flip). All three spec items have tasks.
- **Type consistency:** `ProjectDigest` (from `watch-digest.ts`) flows unchanged into
  `buildWatchDigestEmail` (Task 3) and is what `groupWatchDigests` already returns in the adapter
  (Task 5) — no shape mismatch. `WatchDigestEmailConfig` is defined once (Task 3) and constructed
  once (Task 5's `EMAIL_CONFIG`). `checkUsageLimit`/`recordEmailSent` signatures match
  `lib/email/usage.ts`'s actual exports verbatim (verified by reading the file, not assumed).
- **No placeholders:** every step above has complete, runnable code — no TBD/TODO.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 6, Task 8 | `.github/workflows/watch-digest-daily.yml` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
