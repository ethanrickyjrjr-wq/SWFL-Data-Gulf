# Task 04 — `recordUse({action})` + `actionCount()` + signature-verifying `clientIdFrom` + `/api/meter`

**Context:** `lib/highlighter/meter.ts` (verified) has `clientIdFrom(request)` that regex-matches `sdg_cid=([a-zA-Z0-9_-]+)` and returns the match or `"anon"`. That charset stops at the `.`, so a signed `uuid.sig` cookie would currently yield just `uuid` **unverified**. Make `clientIdFrom` parse + HMAC-verify; add an `action` field to `recordUse`; add `actionCount`; add a thin client route for non-route actions.

**Files:**
- Modify: `lib/highlighter/meter.ts`
- Create: `app/api/meter/route.ts`
- Test: `lib/highlighter/meter.test.ts`

- [ ] **Step 1: Write the failing test** for signature verification (`lib/highlighter/meter.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { __clientIdFromForTest } from "./meter";

const SECRET = "test-secret";
function signed(id: string) {
  const sig = crypto.createHmac("sha256", SECRET).update(id).digest("hex").slice(0, 16);
  return `${id}.${sig}`;
}

describe("clientIdFrom", () => {
  it("returns the id for a validly signed cookie", () => {
    process.env.SDG_COOKIE_SECRET = SECRET;
    const id = "11111111-2222-3333-4444-555555555555";
    const req = new Request("http://x", { headers: { cookie: `sdg_cid=${signed(id)}` } });
    expect(__clientIdFromForTest(req)).toBe(id);
  });
  it("returns 'anon' for a forged signature", () => {
    process.env.SDG_COOKIE_SECRET = SECRET;
    const req = new Request("http://x", { headers: { cookie: "sdg_cid=abc.deadbeefdeadbeef" } });
    expect(__clientIdFromForTest(req)).toBe("anon");
  });
  it("returns 'anon' when no cookie", () => {
    process.env.SDG_COOKIE_SECRET = SECRET;
    expect(__clientIdFromForTest(new Request("http://x"))).toBe("anon");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`__clientIdFromForTest` not exported, verify logic absent):

```bash
bun test lib/highlighter/meter.test.ts
```

- [ ] **Step 3: Rewrite `clientIdFrom` to verify, and export a test hook:**

```ts
import crypto from "node:crypto";

/** Anonymous client id from a SIGNED cookie; falls back to "anon" on missing/forged. */
function clientIdFrom(request: Request): string {
  const cookie = request.headers.get("cookie") ?? "";
  const m = cookie.match(/sdg_cid=([^;]+)/);
  if (!m) return "anon";
  const secret = process.env.SDG_COOKIE_SECRET;
  if (!secret) return "anon";
  const [id, sig] = m[1].split(".");
  if (!id || !sig) return "anon";
  const expected = crypto.createHmac("sha256", secret).update(id).digest("hex").slice(0, 16);
  if (sig.length !== expected.length) return "anon";
  const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return ok ? id : "anon";
}

export const __clientIdFromForTest = clientIdFrom; // test-only hook
```

- [ ] **Step 4: Add `action` to `recordUse`** (keep the existing signature working — `action` defaults to `"ask"`):

```ts
export async function recordUse(
  request: Request,
  meta: { report_id: string; reach: string[]; action?: string },
): Promise<number> {
  try {
    const db = createServiceRoleClient();
    await db.from("usage_events").insert({
      client_id: clientIdFrom(request),
      iso_week: isoWeek(new Date()),
      report_id: meta.report_id,
      reach: meta.reach,
      action: meta.action ?? "ask",
    });
    return 1;
  } catch {
    return 0; // metering must never break an answer
  }
}
```

- [ ] **Step 5: Add `actionCount`** (per-client, per-week, per-action — for the future soft wall):

```ts
export async function actionCount(clientId: string, action: string): Promise<number> {
  try {
    const db = createServiceRoleClient();
    const { count } = await db
      .from("usage_events")
      .select("*", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("iso_week", isoWeek(new Date()))
      .eq("action", action);
    return count ?? 0;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 6: Run tests — expect PASS:** `bun test lib/highlighter/meter.test.ts`

- [ ] **Step 7: Create `app/api/meter/route.ts`** — a thin POST so the client can log non-route actions (`item_add`, `export_print`, `deliver_email`, etc.). Enforcement OFF — it only records:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { recordUse } from "@/lib/highlighter/meter";

const ALLOWED = new Set([
  "ask", "chart_save", "project_create", "item_add",
  "build", "export_print", "deliver_email", "upload",
]);

export async function POST(req: NextRequest) {
  let body: { action?: string; report_id?: string; reach?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const action = body.action ?? "";
  if (!ALLOWED.has(action)) return NextResponse.json({ ok: false }, { status: 400 });
  await recordUse(req, {
    report_id: body.report_id ?? "",
    reach: Array.isArray(body.reach) ? body.reach : [],
    action,
  });
  return NextResponse.json({ ok: true });
}
```

> The client helper that calls this (`fetch("/api/meter", {method:"POST", body: JSON.stringify({action:"item_add", report_id})})`) is added by the sessions that emit those actions (S1 item_add, S5 export_print, S7 deliver_email, S8 upload). Keep this route action-list in sync as new actions land.

- [ ] **Step 8: Typecheck + commit.**

```bash
bun run typecheck   # or the project's tsc task; expect clean for touched files
git add lib/highlighter/meter.ts lib/highlighter/meter.test.ts app/api/meter/route.ts
git commit -m "feat(meter): verify signed cid, add action dimension + /api/meter"
```
