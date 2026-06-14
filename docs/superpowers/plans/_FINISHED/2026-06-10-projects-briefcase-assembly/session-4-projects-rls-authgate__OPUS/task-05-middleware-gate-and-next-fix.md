# Task 05 — Gate `/project/*` + `[AUDIT-FIX C1]` fix `next` threading

**Two changes. Both are auth-path — Vendor-First WebFetch the Supabase SSR middleware pattern first.**

## Part A — gate only `/project/*`

**Context (verified):** `middleware.ts` rate-limits public API then `return createClient(request)` (Supabase session refresh). S0 added the `sdg_cid` mint. Now add: if the path starts with `/project/` AND it's not `/project/draft`, require an authed user via `getUser()`; redirect to `/login?next=<path>` when absent.

- [ ] **Step 1:** In the non-rate-limited branch, after building the Supabase response, check the path:

```ts
const isProject = pathname.startsWith("/project/") || pathname === "/project";
const isPublicDraft = pathname === "/project/draft";
if (isProject && !isPublicDraft) {
  const { data: { user } } = await supabase.auth.getUser(); // use the SSR client per vendor docs
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
}
```

Wire this through the existing `createClient(request)` helper without breaking its cookie-refresh response. **Gate ONLY the `/project` prefix** — every other path must behave exactly as before (the lock-out risk).

- [ ] **Step 2: Route test** — `/r/master` (public) → 200 untouched; `/project/abc` unauthenticated → 302 to `/login?next=/project/abc`; `/project/draft` → 200 (public).

## Part B — `[AUDIT-FIX C1]` thread `next` through login-form

**Context (verified):** `app/auth/callback/route.ts:8-15` ALREADY forwards `next`. The gap is `app/login/login-form.tsx:19`, which hardcodes `emailRedirectTo` to `/auth/callback` and DROPS the `next` prop it receives from `app/login/page.tsx`.

- [ ] **Step 3:** In `login-form.tsx`, append the received `next` to the callback URL:

```ts
const callback = new URL("/auth/callback", window.location.origin);
if (next) callback.searchParams.set("next", next);
await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback.toString() } });
```

- [ ] **Step 4: Verify the full loop** — visit `/project/abc` logged-out → redirected to `/login?next=/project/abc` → magic link → callback consumes `next` → land on `/project/abc`.

- [ ] **Step 5: Commit (hold for diff review).** `git add middleware.ts app/login/login-form.tsx && git commit -m "feat(auth): gate /project/*; [AUDIT-FIX C1] thread next through magic-link"`

> **Diff-review gate:** `middleware.ts` affects every page. Show the operator this diff before the session push.
