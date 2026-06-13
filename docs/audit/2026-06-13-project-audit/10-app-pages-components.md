# App pages + components (React 19 / charts / highlighter / landing / auth UX)

**Health: mostly-ok.** The highlighter stack, login OTP flow, project/RLS surfaces, and accessibility hygiene are unusually careful — the set-state-in-effect traps are explicitly defused with previous-value-ref patterns, `h-screen` is nowhere (layout standard honored), and tap targets/aria roles are present. The real problems are at the edges: a broken `/pricing` link from the live welcome funnel, an unguarded external `<img src>` on the prospect arrival page, zero code-splitting so every `/r/` report drags echarts+gsap+recharts into the client bundle, and several placeholder/fixture pages (`/map`, `/demo`, `/billing`) shipped as if live. No hard React-hooks eslint violations and no client-shipped secrets were found.

## [HIGH] WelcomeChat "See pricing" link points to a non-existent /pricing route (404)

**Location:** `app/welcome/WelcomeChat.tsx:132` (`<a href="/pricing">`); pricing actually lives at `app/billing/page.tsx`; no `app/pricing/**` route and no `/pricing` rewrite in `next.config.ts`.
**Detail:** The welcome arrival page is the top-of-funnel conversion surface (it leads with the recurring-email hook). Its only pricing CTA links to `/pricing`, which does not exist — the route is `/billing`. Every prospect who clicks "See pricing →" hits a 404. The `WelcomePage` docstring (`app/welcome/page.tsx:28-31`) also still claims "PHASE 1: the chat is a STUB. The four prompt buttons link to /pricing" — stale drift; the buttons now POST to the live `/api/welcome/chat`. Both the dead link and the misleading docstring are live.
**Fix:** Change the href to `/billing` (or add a `/pricing` → `/billing` rewrite in `next.config.ts` if `/pricing` is the intended public URL). Delete/rewrite the stale PHASE-1 docstring in `app/welcome/page.tsx`.
**Model:** sonnet — one-line href fix + a stale-comment delete; unambiguous.

## [HIGH] Prospect arrival page renders an arbitrary external `?logo=` URL into `<img src>` with no host allowlist

**Location:** `app/welcome/page.tsx:13-16` (`safeUrl` only checks `^https?://`), used at line 51 `<img src={logo} …>`.
**Detail:** `buildArrivalUrl` produces personalized links, but the page trusts whatever `?logo=` value arrives and renders it as an image. `safeUrl` validates only the scheme, not the host, so any attacker-crafted welcome link (`/welcome?logo=https://evil.example/track.gif`) makes the victim's browser fetch an arbitrary URL on page load — a tracking-pixel / SSRF-from-client / external-content-injection vector, and a way to deanonymize who opened a sent link. The `name` param is React-escaped (no XSS) but flows unverified into the `alt` and the heading. Same unbounded-host pattern exists for `branding.logo_url`/`photo` on `/p/[id]` (`app/p/[id]/page.tsx:79-94`), though those come from the authenticated owner so the trust boundary differs.
**Fix:** Restrict `?logo=` to an allowlist of known-good hosts (the enrichment source's CDN), or proxy/re-host prospect logos server-side, or drop the param entirely and only show a logo for authenticated brands. At minimum gate to https + a host allowlist.
**Model:** opus — trust-boundary judgment (which hosts are acceptable, proxy vs. allowlist) touches the prospect-enrichment contract.
**web_question:** Does Next.js `<img>` (plain `<img>`, not `next/image`) issue the request from the user's browser at render, and is there a CSP `img-src` directive configured for this app that would already constrain arbitrary external image hosts?

## [MEDIUM] No code-splitting anywhere — every `/r/` report ships echarts + gsap + recharts even when no chart renders

**Location:** `components/charts/registry/registry.ts:4-11` statically imports all frames; `CorridorMarketScatterFrame` → `components/charts/CorridorMarketScatter.tsx:4-6` pulls `echarts` + `gsap` + `gsap/ScrollTrigger`. `DockChart.tsx` and `HighlightPopup.tsx` import `getFrame`/`FrameRenderer` from that registry, and the Highlighter mounts on every `/r/` report. Repo-wide grep for `next/dynamic`/`React.lazy` returns zero matches.
**Detail:** The app uses three competing heavy libraries — echarts (4 charts), recharts (5 charts), gsap, plus motion/react on landing. Because the chart registry barrel-imports every frame statically and the Highlighter→AskAi→DockChart path imports the registry, any report page that mounts the highlighter pulls the full echarts+gsap bundle into the client even when the corridor scatter never appears. That is a large, avoidable first-load JS cost on the core product surface (and a duplicate-library tax: echarts and recharts both ship).
**Fix:** Lazy-load frame components via `next/dynamic(() => import(...), { ssr: false })` keyed by `frameId` so only the rendered frame's library loads. Longer term, consolidate on a single chart library (recharts XOR echarts) to drop one ~1MB dep.
**Model:** opus — cross-cutting bundle architecture + a library-consolidation call; affects the chart registry contract and many frames.
**web_question:** What is the current minified+gzipped bundle size of `echarts` (full import via `import * as echarts`) vs `recharts` as of their latest releases, to size the consolidation win?

## [MEDIUM] PrintButton awaits the meter POST with no catch — a meter/network failure blocks `window.print()`

**Location:** `components/PrintButton.tsx:10-19`.
**Detail:** `handleClick` does `await fetch("/api/meter", …)` with no `try/catch`, then calls `window.print()`. If `/api/meter` is down, slow, or the network drops, the `await` rejects and the function throws before reaching `window.print()` — the user clicks "Save as PDF" and nothing happens, with no error shown. Every other meter call in the codebase is correctly fire-and-forget (`void fetch(...).catch(() => {})` — e.g. `HighlightPopup.tsx:251-255`, `UploadDrop.tsx:101-105`). PrintButton is the outlier and it gates the primary paid-path export action (`/p/[id]`, `/c/[id]`).
**Fix:** Make the meter call non-blocking: `void fetch(...).catch(() => {})` and call `window.print()` unconditionally, matching the established pattern.
**Model:** sonnet — mechanical, the correct pattern already exists three files over.

## [MEDIUM] Landing Header mobile hamburger button is dead and inaccessible

**Location:** `components/landing/Header.tsx:141-150`.
**Detail:** The `md:hidden` hamburger `<button>` has no `onClick` and no `aria-label` (the SVG has no title/role either). On mobile the entire nav — Log In, Get Access, My Projects, Sign out — is hidden (`hidden md:flex` on the nav, line 83) and the only menu trigger does nothing. So mobile visitors to the landing page have no way to log in, sign up, or reach their projects from the header, and screen readers announce an unlabeled button. This silently kills mobile conversion on the primary marketing page.
**Fix:** Wire the button to a mobile menu (or at minimum toggle the existing `LoginModal` / a sheet exposing the same nav links), and add `aria-label="Open menu"` + `aria-expanded`.
**Model:** sonnet — well-scoped: add a mobile menu state + panel; the nav links already exist to reuse.

## [LOW] /map and /demo are hardcoded fixture pages presented as live data

**Location:** `app/map/page.tsx:11-23` (inline hardcoded ZIP→AAL object, "Flood AAL sample data"); `app/demo/page.tsx:15-17,30-124` (static fixture imports, comment "swap these imports for live fetch() calls").
**Detail:** `/map` renders a `ZipChoropleth` from 10 hand-typed ZIP values with no fetch and no "sample" caveat visible to a casual viewer beyond a tiny subhead. `/demo` is entirely fixture-driven. These are reachable routes (not under `/embed` or gated) that look like product. Given the platform's central no-invention / "never label a fixture as live" invariant, a public `/map` showing static numbers as a flood map is a brand/credibility risk if indexed or linked.
**Fix:** Either wire `/map` to the live env-swfl per-ZIP AAL data (the embed charts page already loads it via `loadFloodZips`), gate these behind `/embed`/noindex, or add a prominent "Sample data — not live" banner. Decide whether `/demo` should exist in production at all.
**Model:** sonnet — clear options; mostly a wiring/labeling decision once the call is made.

## [LOW] /data-intel reads docs/*.md synchronously at request time with no runtime config or existence guard

**Location:** `app/data-intel/page.tsx:13-18` — `fs.readFileSync(path.join(process.cwd(), "docs/data-intel.md"))` with no `try/catch`, no `export const runtime`/`dynamic`.
**Detail:** Reading a file from `docs/` inside a Vercel serverless/edge function depends on that file being included in the function's file-trace; `docs/` is not a conventional runtime asset, so if tracing misses it the page throws an uncaught `ENOENT` (500) in production rather than degrading. It also re-reads from disk on every render (no caching) and uses the sync API, blocking the event loop. The file does exist in the repo today, so this is latent, not currently broken.
**Fix:** Switch to `await fs.promises.readFile`, wrap in try/catch with a graceful fallback, add `export const dynamic = "force-static"` (or `revalidate`) so it's read at build, and verify `outputFileTracingIncludes` covers `docs/data-intel.md` if it must be runtime-read.
**Model:** sonnet — small, well-specified hardening; the embed page already shows the correct async+try/catch pattern.

## [LOW] /billing is a "Coming soon" placeholder — no payment rails (free tier only is enforceable)

**Location:** `app/billing/page.tsx:8-13,40-53`.
**Detail:** Three of four tiers say "Coming soon" and the only path to a higher limit is emailing `hello@swfldatagulf.com`. This matches the known S4 Stripe-billing plan task being unbuilt, so it's expected — flagging it as a tracked gap, not a defect: there is currently no self-serve way to monetize the email-send product the welcome funnel pitches. The send-limit enforcement itself lives server-side (out of this lane), but the customer-facing upgrade flow is a dead end.
**Fix:** None required for this lane beyond confirming the gap is tracked (Stripe billing task). Ensure the welcome funnel's pricing CTA (see HIGH finding) lands somewhere coherent until billing ships.
**Model:** sonnet — status confirmation, no code change in this lane.

## [NIT] DigestSubscribe surfaces a generic error for the already-subscribed case

**Location:** `components/email/DigestSubscribe.tsx:35` (`setStatus(res.ok ? "done" : "error")`).
**Detail:** Any non-2xx from `/api/email/subscribe` — including "already subscribed" — shows "Something went wrong. Try again." A returning subscriber re-submitting sees a scary error instead of "You're already on the list." Minor UX papercut on an otherwise clean, CAN-SPAM-aware component (unsubscribe copy + privacy link present).
**Fix:** Branch on the response body / status to show a friendly "already subscribed" confirmation distinct from the error state.
**Model:** sonnet — trivial conditional once the API's already-subscribed response shape is known.
