# Task 02 — Mint the signed `sdg_cid` cookie in middleware

**Context:** `middleware.ts` (verified) has two branches: rate-limited public API (early-returns) and everything else (`return createClient(request)`). The `/r/` pages flow through the second branch. We mint `sdg_cid` on whichever response is returned, **only when the cookie is absent**, and never let a crypto error break the request.

Cookie value = `<randomId>.<hmac16>` where `hmac16 = HMAC_SHA256(randomId, SDG_COOKIE_SECRET)` hex, first 16 chars. Middleware runs on the edge runtime → use **Web Crypto** (`crypto.subtle`). `meter.ts` (Node) verifies with `node:crypto` (Task 04) — both produce the same hex, so they agree.

**Files:**
- Modify: `middleware.ts`
- Env: add `SDG_COOKIE_SECRET` (a long random string) to Vercel (all envs) + local `.env`. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

- [ ] **Step 1: Add the mint helpers to `middleware.ts`** (top of file, after imports):

```ts
const SDG_CID_COOKIE = "sdg_cid";
const SDG_CID_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

async function hmac16(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

/** Returns a fresh signed cid, or null if minting is impossible (no secret / crypto error). */
async function mintCid(): Promise<string | null> {
  const secret = process.env.SDG_COOKIE_SECRET;
  if (!secret) return null;
  try {
    const randomId = crypto.randomUUID(); // dashes only — matches meter.ts charset
    return `${randomId}.${await hmac16(randomId, secret)}`;
  } catch {
    return null;
  }
}

function setCidIfAbsent(request: NextRequest, response: NextResponse): void {
  if (request.cookies.get(SDG_CID_COOKIE)) return;
  // Fire-and-forget mint; attach to the outgoing response when ready.
  // (middleware can be async — see Step 2 wiring.)
}
```

(The helper sketch above is illustrated; the real wiring in Step 2 makes `middleware` async so we can `await mintCid()`.)

- [ ] **Step 2: Make `middleware` async and mint on both response paths.** Replace the body so each returned response gets the cookie when absent:

```ts
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCid = Boolean(request.cookies.get(SDG_CID_COOKIE));
  const freshCid = hasCid ? null : await mintCid();

  const attachCid = (res: NextResponse) => {
    if (freshCid) {
      res.cookies.set(SDG_CID_COOKIE, freshCid, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SDG_CID_MAX_AGE,
      });
    }
    return res;
  };

  if (isRateLimited(pathname)) {
    const ip = clientIpFromHeaders(request.headers);
    const result = checkRateLimit(ip);
    if (result.limited) {
      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "rate limit exceeded" },
        { status: 429, headers: { /* …unchanged… */ } },
      );
    }
    const pass = NextResponse.next();
    pass.headers.set("X-RateLimit-Limit", String(result.limit));
    pass.headers.set("X-RateLimit-Remaining", String(result.remaining));
    pass.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
    return attachCid(pass);
  }

  // Supabase auth-refresh path returns its own NextResponse — attach the cid to it.
  const res = await createClient(request);
  return attachCid(res as NextResponse);
}
```

> Note: keep the existing 429 `headers` object verbatim (omitted above for brevity — do NOT delete it). Confirm `createClient(request)` returns a `NextResponse` (it does — it's the Supabase SSR helper that builds a response to carry refreshed cookies); if its return type isn't `NextResponse`, adapt `attachCid` to mutate the object it does return.

- [ ] **Step 3: Add the env var.** Local `.env`: `SDG_COOKIE_SECRET=<hex>`. Vercel: `vercel env add SDG_COOKIE_SECRET` (Production/Preview/Development) or via dashboard. **Without the secret, `mintCid` returns null and behavior is exactly today's `"anon"`** — the fail-safe.

- [ ] **Step 4: Local smoke.** `bun run dev`, hit `http://localhost:3000/r/master`, check the response `Set-Cookie` carries `sdg_cid=<uuid>.<16hex>; HttpOnly; ...`. Reload → no new `Set-Cookie` (cookie reused). (Live prod verify is Task 05.)

- [ ] **Step 5: Commit.**

```bash
git add middleware.ts
git commit -m "feat(meter): mint signed sdg_cid cookie in middleware (fail-safe to anon)"
```
