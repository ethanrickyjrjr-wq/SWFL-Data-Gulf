# App API routes (non-email) — auth / metering / MCP / converse

Health: mostly-ok. The user-data surfaces (projects, templates, deliverables, mcp-key) are consistently and correctly RLS-gated via the cookie client, and the service-role key is never exposed to the browser. The MCP capability-key binding (`X-Project-Key` header → single project) is sound, and the RESPONSE_CONTRACT correctly rides in text content (not `_meta`). The real exposure is **cost/abuse on the unauthenticated LLM routes**: `/api/converse` and `/api/welcome/chat` call Haiku on every POST with zero rate-limiting, zero enforcement of the metered cap, and no auth — they are not even in the middleware's rate-limit prefix list. The whole MCP + data surface is also intentionally open in prod (`MCP_BEARER_TOKEN` unset), which is a documented beta decision but a live spend/scrape hole.

Model IDs (`claude-haiku-4-5`, `claude-sonnet-4-6` in `refinery/agents/anthropic.mts`) verified current and correctly formatted against the live Anthropic catalog — no drift.

## [HIGH] LLM cost routes /api/converse and /api/welcome/chat have no rate limit, no auth, no cap enforcement

Location: `middleware.ts:11` (`RATE_LIMITED_PREFIXES`), `app/api/converse/route.ts:178-191`, `app/api/welcome/chat/route.ts:84-101`

Detail: Both routes call `getAnthropic().messages.stream({ model: TRIAGE_MODEL, ... })` (Haiku 4.5) on every unauthenticated POST. `RATE_LIMITED_PREFIXES = ["/api/b/", "/api/mcp", "/api/waitlist", "/p/"]` — neither `/api/converse` nor `/api/welcome/chat` is in it, so the per-IP burst limiter in middleware never runs for them. `recordUse` / `recordWelcomeChat` are explicitly fire-and-forget telemetry ("zero enforcement" per the welcome-chat comment), and `capEnabled()` / `weeklyCount()` (the designed cap in `lib/highlighter/meter.ts`) are never called by either route. `welcome/chat` accepts up to `MAX_HISTORY=12` arbitrary user/assistant turns from the body and forwards them straight to the model — an attacker can stuff 12 long messages per request and loop. Net: the two most expensive endpoints in the app (real Anthropic spend per call) are the *least* protected — uncapped, unauthenticated, un-rate-limited. This is a direct billing-DoS vector, worse than the `/api/b` scrape the limiter was built to stop (that one is just reads off disk; this one bills tokens).

Fix: Add `/api/converse` and `/api/welcome/chat` to `RATE_LIMITED_PREFIXES` (or a tighter per-IP/per-cid ceiling for LLM routes). Wire the already-designed `capEnabled()` + `weeklyCount(clientIdFrom(request))` gate into `/api/converse` before the stream, returning a soft-wall response when over `HIGHLIGHTER_FREE_WEEKLY_CAP`. For `/api/welcome/chat`, cap by signed `sdg_cid` cookie + IP (the table already records both) and bound total inbound content length. Confirm against Vercel WAF whether a dashboard rate-limit rule should additionally front these paths.

Model: opus — cross-cutting cost/abuse posture touching middleware, the metering design, and the open-beta tradeoff; needs judgment on where the ceiling lives (code vs WAF) and how hard to gate a top-of-funnel page.

## [HIGH] MCP + entire data surface is unauthenticated in prod (MCP_BEARER_TOKEN unset)

Location: `app/api/mcp/auth.ts:9-25`, `app/api/mcp/route.ts:105-113`, `.env.example:86`, `docs/paywall-moat-gates.md:15`

Detail: `assertAuthorized` returns immediately (open) when `MCP_BEARER_TOKEN` is unset, and `.env.example` ships it blank; `docs/paywall-moat-gates.md` + SESSION_LOG confirm it "stays unset for the beta." So `POST /api/mcp` (`swfl_fetch` + the three `swfl_project_*` write tools), `/api/templates/render` POST (which reuses the same gate), and every public data route run with no bearer. This is a *consciously deferred* locked gate (`[LB-R6a]`), and the write tools are independently protected by the 256-bit `X-Project-Key`, so it is not a data-leak hole. But it is a live, real exposure: the read tool and template-render POST are fully open to anyone on the internet, and `swfl_fetch` triggers `fetchBrain` + `loadWebFacts` (two brain reads + per-metric work) per call with only the per-IP burst limiter as a backstop. The MCP route is in `RATE_LIMITED_PREFIXES`, so it has *some* floor — but the authoritative cross-region ceiling (Vercel WAF rule) is also not yet in place per `lib/rate-limit.ts`.

Fix: This is operator-owned (RULE 1 / paywall-moat-gates). Track via the existing open check; when monetizing, set `MCP_BEARER_TOKEN` in every prod env that serves `/api/mcp` AND note the breaking-change caveat (it gates reads + writes together — existing connector users break). Until then, ensure the Vercel WAF dashboard rate-limit rule (close-condition for `api_b_open_rate_limit`) actually exists, since the in-isolate limiter fails open across cold isolates.

Model: opus — this is the central monetization/security tradeoff for the whole MCP surface; touches a locked gate and a breaking-change decision, not a mechanical edit.

## [MEDIUM] /api/charts/save is an unauthenticated service-role write to saved_charts

Location: `app/api/charts/save/route.ts:6-32`

Detail: This POST takes a `body.block`, runs `lintChartBlock`, then does a `createServiceRoleClient().from("saved_charts").insert(...)` — with **no auth check and no rate-limit prefix** (`/api/charts/save` is not in `RATE_LIMITED_PREFIXES`). Any anonymous caller can write rows into `saved_charts` indefinitely (id is `crypto.randomUUID().slice(0,8)` — 8 hex chars, so collision space is bounded but writes are unbounded). The lint gate only validates chart *shape/provenance*, not authorization. `source_meta` and `freshness_token` are passed through from the body unchecked. This is a public, service-role-backed insert sink — a table-flood / storage-cost vector, and any later surface that renders a `saved_chart` by id trusts attacker-supplied `chart_block` JSON.

Fix: Require an authenticated cookie user (or at minimum gate behind the per-IP limiter + the signed `sdg_cid`) before the service-role insert, mirroring how `swfl_project_add`'s chart path is key-gated. If genuinely meant to be public (charts saved from anonymous report pages), add it to `RATE_LIMITED_PREFIXES` and cap per-cid via the meter, and confirm nothing renders `chart_block` as HTML without escaping.

Model: sonnet — well-specified: add an auth/rate gate to one route; the only ambiguity (public vs authed) is answerable from how the chart-save UI is invoked.

## [MEDIUM] /api/templates/render POST relies solely on the open MCP bearer gate; no body size / token cap and unbounded token map

Location: `app/api/templates/render/route.ts:53-97`

Detail: POST calls `assertAuthorized` (open when `MCP_BEARER_TOKEN` unset — see HIGH above), then renders `renderHtmlTemplate(slug, tokens)` with a caller-supplied `tokens: Record<string,string|number>` of arbitrary size. With the bearer unset this is a fully public HTML-generation endpoint that interpolates attacker-controlled token values into a template and returns `text/html`. There is no length bound on `tokens`, and the route is not in `RATE_LIMITED_PREFIXES`. Whether the token values are safely escaped depends entirely on `renderHtmlTemplate` (not in this lane) — if any token lands unescaped in the returned HTML, this is reflected-content / XSS-adjacent (served same-origin). At minimum it is an unauthenticated compute/echo surface.

Fix: Confirm `renderHtmlTemplate` HTML-escapes every token before interpolation (verify in the templates lane). Add `/api/templates/render` to the rate-limit prefixes and bound the number/size of `tokens`. Long term, when `MCP_BEARER_TOKEN` is set this tightens automatically — but the GET preview path is intentionally public, so the POST should not be the only authed path if reflection is possible.

Model: sonnet — mechanical guard additions; the one cross-lane dependency (escaping) is a specific yes/no to verify.

## [MEDIUM] No zod/structured validation on several JSON bodies; converse trusts free-text fields straight into the LLM system prompt

Location: `app/api/converse/route.ts:54-79,140-158`, `app/api/welcome/chat/route.ts:65-82`, `app/api/deliverables/[id]/revoke/route.ts:34-35`

Detail: The lane is inconsistent on input validation. The project/template routes use `projectItemsSchema.safeParse` properly, and `/api/meter` allowlists `action`. But `/api/converse` validates only that `report_id` and `question` are non-empty strings, then interpolates `fact` and `question` verbatim into the model system/user prompt (`buildPlaceContext(\`${fact ?? ""} ${question}\`)` and `userMsg`). `selection_type` flows into a model directive (`a ${selection_type}`) with only a typeof-string check — no enum bound (the 5-way set exists in `lib/highlighter/suggestions.ts` but isn't enforced here). `welcome/chat` accepts any `{role, content}` shape filtered only by role membership. `revoke`/`restyle` read `body.restore`/`body.template` off an untyped `await req.json().catch(() => ({}))`. None of this is a memory-safety bug, but the unbounded free-text → system-prompt path is a prompt-injection surface on a cost route, and the missing enums let malformed clients waste tokens.

Fix: Add a small zod schema per body (converse: bound `question`/`fact` length, constrain `selection_type` to the known enum, cap `report_id` format; welcome/chat: bound per-message and total content length). Keep the friendly 400s. This pairs naturally with the rate-limit fix.

Model: sonnet — add zod schemas to a handful of handlers; bounds and enums are already defined elsewhere in the repo to copy.

## [LOW] /api/b/[slug] logs full request params to stdout on every call

Location: `app/api/b/[slug]/route.ts:34-36`

Detail: Every hit to the public, high-traffic `/api/b/[slug]` route does `console.log(\`[brain-url] ... slug=${slug} view=${view} tier=${tier} zip=${zip}\`)`. `zip` and `slug` are unvalidated user input echoed into logs. Low severity (no secret leakage, and Vercel log volume is the only real cost), but it is an unbounded per-request log line on the most-scraped endpoint, and it logs caller-supplied `zip` which is PII-adjacent at scale.

Fix: Drop the log or gate it behind a debug flag (`if (process.env.DEBUG_BRAIN_URL)`). Not load-bearing — the route's behavior doesn't depend on it.

Model: sonnet — one-line change behind an env flag.

## [LOW] Error bodies leak raw internal Error.message to clients on the 500 path

Location: `app/api/b/[slug]/route.ts:110-113`, `app/api/where/route.ts:62-65`, `app/api/z/[zip]/route.ts:66-69`, `app/api/converse/route.ts:208-211`

Detail: The catch-all branches return `{ error: (err as Error).message }` (and converse streams `{ error: (e as Error).message }`). For the typed cases (BrainNotFound/BadTier) the messages are clean, but the generic 500 path forwards whatever the underlying error says — which can include resolver internals, file paths, or upstream-fetch URLs (the dossier assembly uses `resolveOrigin()` / internal hostnames). On public, unauthenticated routes this leaks implementation detail to any caller who can trigger an exception (e.g. a malformed location string into `/api/where?q=`).

Fix: Return a generic `{ error: "internal error" }` (or a short stable code) on the catch-all 500 and log the real message server-side instead of returning it. Keep the typed 400/404 messages as-is.

Model: sonnet — mechanical: swap the returned message for a generic one on the 500 branch across four routes.

## [LOW] Project DELETE returns ok even when RLS matched zero rows (silent no-op vs the rest of the surface)

Location: `app/api/projects/[id]/route.ts:71-79`

Detail: `DELETE /api/projects/[id]` does `.delete().eq("id", id)` and returns `{ ok: true }` whenever there's no DB error — it does not `.select()` to check a row was actually deleted. RLS correctly prevents deleting another user's project (the row is invisible, so the delete affects zero rows), so this is **not** a security hole. But it's inconsistent with GET/PATCH on the same file and with mcp-key, which all `.select("id").maybeSingle()` and return 404 when no row matched. A client deleting a non-existent or non-owned id gets a misleading 200/ok. Minor correctness/contract drift, not an auth gap.

Fix: Mirror PATCH — `.delete().eq("id", id).select("id").maybeSingle()` and return 404 when `!data`. Optional but makes the route honest.

Model: sonnet — copy the PATCH pattern into DELETE.

## [LOW] CORS is Access-Control-Allow-Origin: * on every data + MCP route

Location: `app/api/mcp/route.ts:87-91`, `app/api/b/[slug]/route.ts:20-23`, `app/api/where/route.ts:8-11`, `app/api/z/[zip]/route.ts:10-13`, and the 429 path in `middleware.ts:77`

Detail: All public data routes and the MCP route set `Access-Control-Allow-Origin: *`. For genuinely public read APIs this is intended and fine. The note for the record: the MCP route also allows `Authorization` in `Access-Control-Allow-Headers` with a wildcard origin — when `MCP_BEARER_TOKEN` is eventually set, a wildcard-origin + `Authorization`-allowed CORS config lets any web origin attempt bearer-authenticated calls from a browser (the token still has to be known, so it's low risk, but it widens where a leaked token can be replayed from). No credentials cookie is involved, so this is not a CSRF/credential-theft hole today.

Fix: No action needed for the read routes. When the bearer is enabled, consider scoping the MCP route's `Allow-Origin` to known client origins (or drop `Authorization` from the wildcard CORS), since MCP clients send the bearer header server-side, not from a browser origin that needs `*`.

Model: sonnet — config-level tightening, only relevant once the bearer is enabled.
