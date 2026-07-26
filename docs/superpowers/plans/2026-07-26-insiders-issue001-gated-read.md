# Issue 001 On-Site Gated Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 15 files, keywords: architecture

**Goal:** Publish Issue 001 at `/insiders/001` behind a hard server-side email gate: anonymous readers get masthead + Tape + two Lead paragraphs, subscribers (signed cookie) get the full fact-checked artifact.

**Architecture:** One committed byte-identical artifact in `content/insiders/`; a pure tested splitter cuts the teaser at request time; an HMAC-signed cookie (set by the existing subscribe endpoint on success) flips a GET route handler between teaser and full. Spec: `docs/superpowers/specs/2026-07-26-insiders-issue001-gated-read-design.md`.

**Tech Stack:** Next.js App Router route handler (nodejs runtime, plain `Response`), `node:crypto` HMAC, `bun:test`, no new dependencies.

## Global Constraints

- Artifact body bytes NEVER change — only `<head>` additions allowed (OG/canonical), per spec §1.
- Full issue HTML must never reach an anonymous browser; splitter failure serves LESS, never more (fail closed).
- Every route response: `Cache-Control: private, no-store` + `Content-Type: text/html; charset=utf-8`.
- Cookie: name `ins_reader`, HttpOnly, Secure, SameSite=Lax, Max-Age 31536000, Path=/; secret env `INSIDERS_READER_SECRET`; missing secret = gate closed.
- Subscribe form source string at the gate: `issue-001-gate`.
- Commits: explicit paths only (`git add <paths>`), never `-A`; no push without operator approval.
- Tests are `bun:test`; run with `bun test <file>`.

**Artifact structure facts (verified 07/26/2026 against the pressed file):**
- Wrapper: `<body>` → `<div class="sheet">` → sections → `<footer class="colophon">` → `</div></body></html>`.
- The Tape: `<section class="tape">` containing `<h2>Fifteen numbers, cold.` (line ~230).
- The Lead: the next `<section>` with `<div class="lead-body">` (line ~257) whose children are `<p>` tags.
- Gated-section sentinel strings (must NOT appear in teaser): `Dated. Graded next issue.` (Watch), `Every call above, preregistered.` (falsifier ledger), `Count what you just read.` (Receipts), `colophon`.
- Free sentinel (must appear in teaser): `Fifteen numbers, cold.`

---

### Task 1: Commit the artifact + thumbnail into `content/` and `public/`

**Files:**
- Create: `content/insiders/issue-2026-07.html` (copy of `runs/insiders-runs/2026-07-26-rebuild/issue-2026-07.html` + head-only OG block)
- Create: `public/insiders/issue-001-thumb.png` (copy of `runs/insiders-runs/2026-07-26-rebuild/sec-masthead.png`, 149 KB — masthead only, free content, safe to expose)

**Interfaces:**
- Produces: `content/insiders/issue-2026-07.html` — read by Task 3 tests and Task 4 route. `public/insiders/issue-001-thumb.png` — referenced by Task 6 ledger row and the OG tag.

- [ ] **Step 1: Copy files**

```bash
mkdir -p content/insiders public/insiders
cp runs/insiders-runs/2026-07-26-rebuild/issue-2026-07.html content/insiders/issue-2026-07.html
cp runs/insiders-runs/2026-07-26-rebuild/sec-masthead.png public/insiders/issue-001-thumb.png
```

- [ ] **Step 2: Verify git will take them (gitignore check — `runs/` is ignored, `content/` must not be)**

```bash
git check-ignore -v content/insiders/issue-2026-07.html public/insiders/issue-001-thumb.png; echo "exit=$? (1 = not ignored, good)"
```

Expected: no output, exit 1.

- [ ] **Step 3: Head-only OG addition** — in `content/insiders/issue-2026-07.html`, immediately after the `<title>…</title>` line, insert (Edit tool, nothing else changes):

```html
<link rel="canonical" href="https://www.swfldatagulf.com/insiders/001">
<meta property="og:title" content="The Insiders Edition — Issue No. 001 · July 2026">
<meta property="og:description" content="Southwest Florida market intelligence. 126 figures, 23 named sources, zero invented numbers. Read the opening free.">
<meta property="og:url" content="https://www.swfldatagulf.com/insiders/001">
<meta property="og:image" content="https://www.swfldatagulf.com/insiders/issue-001-thumb.png">
<meta property="og:type" content="article">
<meta property="og:site_name" content="SWFL Data Gulf">
```

- [ ] **Step 4: Verify body untouched** — diff must show ONLY the head insertion:

```bash
diff runs/insiders-runs/2026-07-26-rebuild/issue-2026-07.html content/insiders/issue-2026-07.html
```

Expected: exactly one added hunk of the 7 head lines, zero removed lines.

- [ ] **Step 5: Commit**

```bash
git add content/insiders/issue-2026-07.html public/insiders/issue-001-thumb.png
git commit -m "feat(insiders): commit Issue 001 press artifact + thumbnail for on-site read" -- content/insiders/issue-2026-07.html public/insiders/issue-001-thumb.png
```

---

### Task 2: Reader cookie — sign/verify/parse (`lib/insiders/reader-cookie.ts`)

**Files:**
- Create: `lib/insiders/reader-cookie.ts`
- Test: `lib/insiders/reader-cookie.test.ts`

**Interfaces:**
- Produces (exact signatures, consumed by Tasks 4 & 5):
  - `signReader(email: string, secret: string): string` — returns cookie VALUE `b64url(email) + "." + b64url(hmacSha256(secret, email))`.
  - `verifyReader(value: string | undefined, secret: string | undefined): boolean` — false on missing secret, missing/malformed value, bad signature (timing-safe compare).
  - `buildReaderSetCookie(email: string, secret: string): string` — full `Set-Cookie` header value: `ins_reader=<signed>; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`.
  - `readerCookieFromHeader(cookieHeader: string | null): string | undefined` — extracts the `ins_reader` value from a raw `Cookie` header.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/insiders/reader-cookie.test.ts
// Failure modes covered (spec §Failure modes #3, #4): forged cookie, missing secret.
import { describe, expect, test } from "bun:test";
import {
  signReader,
  verifyReader,
  buildReaderSetCookie,
  readerCookieFromHeader,
} from "./reader-cookie";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";

describe("reader-cookie", () => {
  test("sign → verify round-trip passes", () => {
    const v = signReader("reader@example.com", SECRET);
    expect(verifyReader(v, SECRET)).toBe(true);
  });

  test("tampered value is rejected (forged-cookie failure mode)", () => {
    const v = signReader("reader@example.com", SECRET);
    const [email, sig] = v.split(".");
    expect(verifyReader(`${email}.AAAA${sig!.slice(4)}`, SECRET)).toBe(false);
    expect(verifyReader("ins=1", SECRET)).toBe(false);
    expect(verifyReader("just-a-flag", SECRET)).toBe(false);
  });

  test("wrong secret is rejected", () => {
    const v = signReader("reader@example.com", SECRET);
    expect(verifyReader(v, "another-secret")).toBe(false);
  });

  test("missing secret NEVER opens the gate (missing-env failure mode)", () => {
    const v = signReader("reader@example.com", SECRET);
    expect(verifyReader(v, undefined)).toBe(false);
    expect(verifyReader(v, "")).toBe(false);
  });

  test("missing value is rejected", () => {
    expect(verifyReader(undefined, SECRET)).toBe(false);
  });

  test("Set-Cookie header carries the hard attributes", () => {
    const h = buildReaderSetCookie("reader@example.com", SECRET);
    expect(h.startsWith("ins_reader=")).toBe(true);
    for (const attr of ["Path=/", "Max-Age=31536000", "HttpOnly", "Secure", "SameSite=Lax"]) {
      expect(h).toContain(attr);
    }
  });

  test("readerCookieFromHeader finds ins_reader among other cookies", () => {
    const v = signReader("reader@example.com", SECRET);
    expect(readerCookieFromHeader(`a=b; ins_reader=${v}; c=d`)).toBe(v);
    expect(readerCookieFromHeader("a=b; c=d")).toBeUndefined();
    expect(readerCookieFromHeader(null)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/insiders/reader-cookie.test.ts`
Expected: FAIL — module `./reader-cookie` not found.

- [ ] **Step 3: Implement**

```typescript
// lib/insiders/reader-cookie.ts
//
// Signed reader cookie for the Insiders gated read (spec:
// docs/superpowers/specs/2026-07-26-insiders-issue001-gated-read-design.md).
// HMAC-SHA256 over the normalized email — forgeable only with the server
// secret. verifyReader fails CLOSED: missing secret, malformed value, or bad
// signature all read as "not a subscriber".
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "ins_reader";

const b64url = (buf: Buffer): string => buf.toString("base64url");

function hmac(email: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(email, "utf8").digest();
}

export function signReader(email: string, secret: string): string {
  return `${b64url(Buffer.from(email, "utf8"))}.${b64url(hmac(email, secret))}`;
}

export function verifyReader(
  value: string | undefined,
  secret: string | undefined,
): boolean {
  if (!value || !secret) return false;
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) return false;
  let email: string;
  let sig: Buffer;
  try {
    email = Buffer.from(value.slice(0, dot), "base64url").toString("utf8");
    sig = Buffer.from(value.slice(dot + 1), "base64url");
  } catch {
    return false;
  }
  const expected = hmac(email, secret);
  return sig.length === expected.length && timingSafeEqual(sig, expected);
}

export function buildReaderSetCookie(email: string, secret: string): string {
  return `${COOKIE_NAME}=${signReader(email, secret)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
}

export function readerCookieFromHeader(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === COOKIE_NAME) {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/insiders/reader-cookie.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/insiders/reader-cookie.ts lib/insiders/reader-cookie.test.ts
git commit -m "feat(insiders): signed reader cookie, fails closed on missing secret" -- lib/insiders/reader-cookie.ts lib/insiders/reader-cookie.test.ts
```

---

### Task 3: Teaser splitter (`lib/insiders/teaser-split.ts`)

**Files:**
- Create: `lib/insiders/teaser-split.ts`
- Test: `lib/insiders/teaser-split.test.ts`

**Interfaces:**
- Consumes: `content/insiders/issue-2026-07.html` (Task 1) — the test reads the REAL committed artifact.
- Produces (consumed by Task 4):
  - `splitTeaser(fullHtml: string): string | null` — teaser HTML or null when structure unmatched.
  - `lastResortTeaser(): string` — minimal standalone gate page (no issue content), for the null branch.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/insiders/teaser-split.test.ts
// Failure modes covered (spec §Failure modes #1, #6): full-issue leak,
// re-press structure drift. Leak sentinels run against the REAL artifact.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitTeaser, lastResortTeaser } from "./teaser-split";

const artifact = readFileSync(
  join(process.cwd(), "content", "insiders", "issue-2026-07.html"),
  "utf8",
);

const GATED_SENTINELS = [
  "Dated. Graded next issue.", // The Watch
  "Every call above, preregistered.", // falsifier ledger
  "Count what you just read.", // Receipts closer
  "colophon",
];

describe("splitTeaser on the real committed artifact", () => {
  const teaser = splitTeaser(artifact);

  test("splits successfully", () => {
    expect(teaser).not.toBeNull();
  });

  test("free content survives: masthead + full Tape + Lead opening", () => {
    expect(teaser!).toContain("Fifteen numbers, cold.");
    expect(teaser!).toContain("The bottom is falling twice as fast as the top.");
    expect(teaser!).toContain("starter-tier homes is down");
  });

  test("LEAK SENTINELS: no gated section reaches the teaser", () => {
    for (const s of GATED_SENTINELS) {
      expect(teaser!).not.toContain(s);
    }
  });

  test("cut is after exactly two lead paragraphs", () => {
    const leadBodyStart = teaser!.indexOf('<div class="lead-body">');
    expect(leadBodyStart).toBeGreaterThan(-1);
    // Count only up to the gate — the gate block has its own </p> tags.
    const gateStart = teaser!.indexOf('id="continue"');
    expect(gateStart).toBeGreaterThan(leadBodyStart);
    const leadRegion = teaser!.slice(leadBodyStart, gateStart);
    expect(leadRegion.split("</p>").length - 1).toBe(2);
  });

  test("gate block present: capture form posts to subscribe with gate source", () => {
    expect(teaser!).toContain("/api/insiders/subscribe");
    expect(teaser!).toContain("issue-001-gate");
    expect(teaser!).toContain('id="continue"');
    expect(teaser!).toContain("<noscript>");
  });

  test("document is re-closed", () => {
    expect(teaser!.trimEnd().endsWith("</html>")).toBe(true);
  });
});

describe("splitTeaser structure drift (fail closed)", () => {
  test("returns null when the tape/lead structure is missing", () => {
    expect(splitTeaser("<html><body><p>not the issue</p></body></html>")).toBeNull();
    expect(splitTeaser("")).toBeNull();
  });

  test("returns null when lead-body has fewer than two paragraphs", () => {
    const stub =
      '<html><body><div class="sheet"><section class="tape"><h2>t</h2></section>' +
      '<section><div class="lead-body"><p>only one</p></div></section></div></body></html>';
    expect(splitTeaser(stub)).toBeNull();
  });
});

describe("lastResortTeaser", () => {
  test("contains the gate, no issue content", () => {
    const t = lastResortTeaser();
    expect(t).toContain("/api/insiders/subscribe");
    expect(t).not.toContain("Fifteen numbers, cold.");
    expect(t.trimEnd().endsWith("</html>")).toBe(true);
  });
});
```

Note on the drift test's `<p>only one</p>` stub: there is no second `</p>` anywhere after the first, so the second-paragraph search returns −1 → null. The section-boundary guard covers the other drift shape (a second `</p>` that exists but lives beyond the lead section).

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/insiders/teaser-split.test.ts`
Expected: FAIL — module `./teaser-split` not found.

- [ ] **Step 3: Implement**

```typescript
// lib/insiders/teaser-split.ts
//
// Cuts the Issue 001 press artifact into the free teaser (spec:
// docs/superpowers/specs/2026-07-26-insiders-issue001-gated-read-design.md).
// Free read = masthead + The Tape + first two Lead paragraphs, then the gate.
// Structure contract (pressed 07/26/2026): <div class="sheet"> wraps the issue;
// <section class="tape"> is The Tape; the following <section> holds
// <div class="lead-body"> whose children are <p> tags. On ANY mismatch this
// returns null — the route then serves lastResortTeaser(). Fail closed: a
// wrong guess here could leak the gated issue, so there are no heuristics.

const GATE_BLOCK = `
<div id="continue" class="gate" style="position:relative;margin-top:-140px;padding-top:180px;background:linear-gradient(to bottom, rgba(10,20,25,0) 0%, #0a1419 140px);">
  <div style="max-width:520px;margin:0 auto;text-align:center;border:1px solid rgba(255,255,255,0.10);border-radius:12px;padding:36px 28px;background:#0e1b21;">
    <p style="font-family:'Geist Mono',Consolas,monospace;font-size:12px;letter-spacing:0.34em;text-transform:uppercase;color:#3DC9C0;">The rest is for readers</p>
    <h2 style="font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:34px;line-height:1.1;margin:12px 0 8px;">Keep reading &mdash; free.</h2>
    <p style="color:rgba(237,242,241,0.72);font-size:15px;margin-bottom:20px;">The rest of Issue 001 unlocks with your email. One issue a month, every number sourced.</p>
    <form id="ins-gate-form" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
      <input type="email" required name="email" placeholder="you@example.com" aria-label="Email address"
        style="flex:1;min-width:220px;padding:12px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:#0a1419;color:#EDF2F1;font-size:15px;">
      <button type="submit"
        style="padding:12px 20px;border-radius:8px;border:0;background:#3DC9C0;color:#0a1419;font-weight:600;font-size:15px;cursor:pointer;">Unlock the issue</button>
    </form>
    <p id="ins-gate-err" hidden style="color:#FF8A70;font-size:13px;margin-top:10px;">Something went wrong. Try again in a moment.</p>
    <p style="color:rgba(237,242,241,0.45);font-size:12px;margin-top:14px;">Free &middot; monthly &middot; unsubscribe anytime. Your email stays on our infrastructure only.</p>
    <noscript><p style="color:rgba(237,242,241,0.72);font-size:13px;margin-top:10px;">JavaScript is off &mdash; subscribe at <a href="/insiders" style="color:#3DC9C0;">swfldatagulf.com/insiders</a> and reload this page.</p></noscript>
  </div>
</div>
<script>
document.getElementById("ins-gate-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  var err = document.getElementById("ins-gate-err");
  err.hidden = true;
  var email = new FormData(e.target).get("email");
  try {
    var res = await fetch("/api/insiders/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, source: "issue-001-gate" }),
    });
    if (res.ok) { location.reload(); }
    else { err.hidden = false; }
  } catch (_) { err.hidden = false; }
});
</script>
`;

const CLOSE = "\n</div>\n</section>\n" + GATE_BLOCK + "\n</div>\n</body>\n</html>\n";

export function splitTeaser(fullHtml: string): string | null {
  const tape = fullHtml.indexOf('<section class="tape">');
  if (tape < 0) return null;
  const leadBody = fullHtml.indexOf('<div class="lead-body">', tape);
  if (leadBody < 0) return null;
  // End of the SECOND paragraph inside the lead body.
  const firstP = fullHtml.indexOf("</p>", leadBody);
  if (firstP < 0) return null;
  const secondP = fullHtml.indexOf("</p>", firstP + 4);
  if (secondP < 0) return null;
  const cut = secondP + 4;
  // The cut must land before the lead-body's section closes — if the second
  // </p> we found lives outside this section, the structure has drifted.
  const sectionClose = fullHtml.indexOf("</section>", leadBody);
  if (sectionClose >= 0 && cut > sectionClose) return null;
  return fullHtml.slice(0, cut) + CLOSE;
}

export function lastResortTeaser(): string {
  // Degraded branch: structure drifted, serve the gate with zero issue
  // content rather than risk a leak (spec failure mode #6).
  return (
    "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n" +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    "<title>The Insiders Edition — Issue No. 001 · SWFL Data Gulf</title>\n" +
    "</head>\n<body style=\"background:#0a1419;color:#EDF2F1;font-family:-apple-system,'Segoe UI',sans-serif;padding:60px 20px;\">\n" +
    GATE_BLOCK +
    "\n</body>\n</html>\n"
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/insiders/teaser-split.test.ts`
Expected: PASS. If the "exactly two lead paragraphs" test fails, fix the implementation, not the sentinel list.

- [ ] **Step 5: Commit**

```bash
git add lib/insiders/teaser-split.ts lib/insiders/teaser-split.test.ts
git commit -m "feat(insiders): teaser splitter with leak sentinels, fails closed on drift" -- lib/insiders/teaser-split.ts lib/insiders/teaser-split.test.ts
```

---

### Task 4: Gated route `/insiders/001` + lambda file tracing

**Files:**
- Create: `app/insiders/001/route.ts`
- Modify: `next.config.ts` (~line 14, inside the existing `outputFileTracingIncludes` object)
- Test: `app/insiders/001/route.test.ts`

**Interfaces:**
- Consumes: `verifyReader`, `readerCookieFromHeader` (Task 2); `splitTeaser`, `lastResortTeaser` (Task 3); `content/insiders/issue-2026-07.html` (Task 1).
- Produces: `GET(request: Request): Promise<Response>` at `/insiders/001`.

- [ ] **Step 1: Write the failing test**

```typescript
// app/insiders/001/route.test.ts
// Failure modes covered (spec §Failure modes #1, #2, #3): anonymous leak,
// CDN cache cross-contamination, forged cookie. Uses plain Request/Response —
// the route deliberately avoids next/headers so it stays unit-testable.
import { describe, expect, test } from "bun:test";
import { signReader } from "@/lib/insiders/reader-cookie";
import { GET } from "./route";

const SECRET = "route-test-secret-0123456789abcdef";
process.env.INSIDERS_READER_SECRET = SECRET;

const req = (cookie?: string) =>
  new Request("https://www.swfldatagulf.com/insiders/001", {
    headers: cookie ? { cookie } : {},
  });

describe("GET /insiders/001", () => {
  test("anonymous gets teaser: Tape present, Watch absent", async () => {
    const res = await GET(req());
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("Fifteen numbers, cold.");
    expect(html).not.toContain("Dated. Graded next issue.");
    expect(html).toContain("issue-001-gate");
  });

  test("valid signed cookie gets the full issue", async () => {
    const v = signReader("reader@example.com", SECRET);
    const res = await GET(req(`ins_reader=${v}`));
    const html = await res.text();
    expect(html).toContain("Dated. Graded next issue.");
    expect(html).toContain("Count what you just read.");
  });

  test("forged cookie gets the teaser", async () => {
    const res = await GET(req("ins_reader=forged.value"));
    const html = await res.text();
    expect(html).not.toContain("Dated. Graded next issue.");
  });

  test("both branches are uncacheable text/html", async () => {
    const v = signReader("reader@example.com", SECRET);
    for (const r of [await GET(req()), await GET(req(`ins_reader=${v}`))]) {
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test app/insiders/001/route.test.ts`
Expected: FAIL — module `./route` not found.

- [ ] **Step 3: Implement the route**

```typescript
// app/insiders/001/route.ts
//
// Issue 001 gated read (spec: docs/superpowers/specs/
// 2026-07-26-insiders-issue001-gated-read-design.md). Hard server gate: the
// full artifact leaves this handler ONLY with a valid signed reader cookie.
// Anonymous → teaser from splitTeaser; splitter null → lastResortTeaser
// (gate page with zero issue content — degraded, never leaking). Plain
// Request/Response (no next/headers) keeps the handler unit-testable.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyReader, readerCookieFromHeader } from "@/lib/insiders/reader-cookie";
import { splitTeaser, lastResortTeaser } from "@/lib/insiders/teaser-split";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ARTIFACT = join(process.cwd(), "content", "insiders", "issue-2026-07.html");

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  // Never let the CDN serve one reader's variant to everyone (failure mode #2).
  "Cache-Control": "private, no-store",
};

export async function GET(request: Request): Promise<Response> {
  let full: string;
  try {
    full = await readFile(ARTIFACT, "utf8");
  } catch (e) {
    console.error("[insiders/001] artifact read failed:", e);
    return new Response(lastResortTeaser(), { status: 200, headers: HEADERS });
  }

  const cookie = readerCookieFromHeader(request.headers.get("cookie"));
  if (verifyReader(cookie, process.env.INSIDERS_READER_SECRET)) {
    return new Response(full, { status: 200, headers: HEADERS });
  }

  return new Response(splitTeaser(full) ?? lastResortTeaser(), {
    status: 200,
    headers: HEADERS,
  });
}
```

- [ ] **Step 4: Add the tracing entry** — in `next.config.ts`, inside the existing `outputFileTracingIncludes` object (after the `"/api/templates/render"` entry), add:

```typescript
    // The Issue 001 gated read serves the committed press artifact from disk —
    // bundle it into the serverless function (otherwise the route degrades to
    // the last-resort teaser in prod: gate closed, issue unreadable).
    "/insiders/001": ["./content/insiders/**/*.html"],
```

- [ ] **Step 5: Run to verify it passes**

Run: `bun test app/insiders/001/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add app/insiders/001/route.ts app/insiders/001/route.test.ts next.config.ts
git commit -m "feat(insiders): /insiders/001 gated route — signed cookie flips teaser/full" -- app/insiders/001/route.ts app/insiders/001/route.test.ts next.config.ts
```

---

### Task 5: Subscribe route sets the reader cookie on success

**Files:**
- Modify: `app/api/insiders/subscribe/route.ts` (success return, line ~60)

**Interfaces:**
- Consumes: `buildReaderSetCookie` (Task 2).
- Produces: `POST /api/insiders/subscribe` 200 response now carries `Set-Cookie: ins_reader=…` — subscribing anywhere (hero, footer, gate) unlocks `/insiders/001`.

- [ ] **Step 1: Add the import** — top of `app/api/insiders/subscribe/route.ts`, with the other `@/` imports:

```typescript
import { buildReaderSetCookie } from "@/lib/insiders/reader-cookie";
```

- [ ] **Step 2: Replace the success return** — the file ends with `return NextResponse.json({ ok: true });`. Replace with:

```typescript
  // Unlock the on-site gated read (spec: 2026-07-26-insiders-issue001-gated-
  // read-design.md). Cookie ONLY on this success path — a failed upsert must
  // not mint a reader (failure mode #7). Missing secret: subscription still
  // succeeds, gate simply stays closed (fails safe).
  const res = NextResponse.json({ ok: true });
  const secret = process.env.INSIDERS_READER_SECRET;
  if (secret) {
    res.headers.append("Set-Cookie", buildReaderSetCookie(email, secret));
  }
  return res;
```

- [ ] **Step 3: Verify the error paths return NO cookie** — read the file end-to-end: both 400s and both `subscribe_failed` 500s must be untouched (no Set-Cookie anywhere but the success return).

- [ ] **Step 4: Regression run** (route itself is supabase-bound; the cookie string is covered by Task 2):

Run: `bun test lib/insiders/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/insiders/subscribe/route.ts
git commit -m "feat(insiders): subscribe success sets signed reader cookie (gate unlock)" -- app/api/insiders/subscribe/route.ts
```

---

### Task 6: Ledger row becomes the thumbnail link + sitemap entry

**Files:**
- Modify: `app/insiders/page.tsx` (ledger section, lines ~380–397; metadata untouched)
- Modify: `app/insiders/insiders.css` (append ledger-link styles)
- Modify: `app/sitemap.ts` (add `/insiders/001`)

**Interfaces:**
- Consumes: `/insiders/001` route (Task 4), `public/insiders/issue-001-thumb.png` (Task 1).

- [ ] **Step 1: Replace the ledger row** — in `app/insiders/page.tsx` the current row is:

```tsx
        <div className="ins-ledger-row">
          <span className="ins-ledger-num">001</span>
          <span className="ins-ledger-date">July 2026</span>
          <span className="ins-ledger-status">
            <span className="ins-pulse" aria-hidden="true" />
            in production
          </span>
        </div>
```

Replace with (plain `<img>` is deliberate — one fixed 149 KB below-the-fold asset; `next/image` buys nothing here):

```tsx
        <Link href="/insiders/001" className="ins-ledger-row ins-ledger-link">
          <img
            src="/insiders/issue-001-thumb.png"
            alt="Issue 001 masthead — The Insiders Edition, July 2026"
            className="ins-ledger-thumb"
            width={320}
            height={180}
            loading="lazy"
          />
          <span className="ins-ledger-num">001</span>
          <span className="ins-ledger-date">July 2026</span>
          <span className="ins-ledger-status">Read the opening — free</span>
        </Link>
```

First read the surrounding `.ins-ledger-row` CSS rule in `app/insiders/insiders.css`; if the row is a flex/grid whose cells would squash a 320px image, put the thumb on its own line by letting it span (`flex-basis: 100%` / `grid-column: 1 / -1`) in the new rules below.

- [ ] **Step 2: Append styles** — end of `app/insiders/insiders.css`:

```css
/* ── Issue 001 ledger link (gated read entry) ─────────────────────────── */
.ins-ledger-link {
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease;
}
.ins-ledger-link:hover {
  border-color: rgba(61, 201, 192, 0.5);
}
.ins-ledger-thumb {
  width: 100%;
  max-width: 320px;
  height: auto;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: block;
}
```

- [ ] **Step 3: Sitemap** — read `app/sitemap.ts`, find the entry for `/insiders`, and add a sibling entry for `/insiders/001` mirroring its exact shape (same base-URL constant, same optional fields).

- [ ] **Step 4: Static regression check**

Run: `bun test lib/landing/home-spine.static.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/insiders/page.tsx app/insiders/insiders.css app/sitemap.ts
git commit -m "feat(insiders): ledger row links to the Issue 001 gated read; sitemap entry" -- app/insiders/page.tsx app/insiders/insiders.css app/sitemap.ts
```

---

### Task 7: Build, secret, verify drive, ship gate

**Files:**
- Modify: `SESSION_LOG.md` (new top entry before push)
- Env: `INSIDERS_READER_SECRET` in `.env.local` + Vercel production env

- [ ] **Step 1: Full test pass + production build**

```bash
bun test lib/insiders/ app/insiders/001/
bunx next build
```

Expected: all tests PASS; build green (verify with `bunx next build`, never `npx tsc` alone).

- [ ] **Step 2: Generate + set the secret locally**

```bash
node -e "console.log('INSIDERS_READER_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env.local
```

Then add the SAME value to Vercel production env (dashboard → Settings → Environment Variables, or `npx vercel env add INSIDERS_READER_SECRET production`). Gate fails closed without it — teaser still serves, unlock won't. Set BEFORE the deploy that ships this build (spec failure mode #8).

- [ ] **Step 3: Verify drive on the production build** (superpowers `verify` skill or manual against `next start`):
  - Anonymous GET `/insiders/001` → teaser: Tape visible, story stops mid-Lead, gate card present; view-source contains NO Watch/falsifier/Receipts content.
  - Submit a test email at the gate → 200 + cookie; reload shows the full issue.
  - `/insiders` ledger row shows the thumbnail and links through.
  - Screenshot both states.

- [ ] **Step 4: SESSION_LOG entry, then STOP for the operator** — append the entry (what shipped, spec/plan paths, test counts, verify evidence), then ask the operator to approve the push (approval is per-push, never carried). Push via `node scripts/safe-push.mjs` after approval. Remind the operator of the launch-order choice: page live before vs after the Issue 001 email send.

- [ ] **Step 5: After prod deploy — close the live check with prod evidence only**

Evidence required: live `https://www.swfldatagulf.com/insiders/001` returns 200 containing "Fifteen numbers, cold." AND its view-source lacks "Dated. Graded next issue.". Then:

```bash
node scripts/check.mjs close insiders_issue001_gated_read_live_verify
```

(checks = prod evidence, not dev attestation; read the check-signal skill before attaching an auto-verify signal.)
