# lib/ core — deliverable moat-lint / highlighter grounding / project / templates / location

**Health: mostly-ok.** The grounding and deliverable-moat machinery is genuinely well-built — `buildGroundingContext` constrains the model to server-authored dossier blocks, the narrative lint has real adversarial depth (lexical-number gate, forecast indicators, jargon plurals, falsifier-clause check), and the location/zip-dossier fan-out honors the ZIP-grain and county-coverage gates with explicit honesty caveats. The biggest gaps are operational, not structural: two public unauthenticated paid-LLM endpoints (`/api/converse`, `/api/welcome/chat`) have NO rate limit or cap enforcement (the `weeklyCount`/`capEnabled`/`checkRateLimit` plumbing exists but is wired to neither), and the moat's numeric anchor set is loose — it ingests free-text note/question content and strips units, so the "no-invention is structural" claim is weaker than advertised. One clear scope-drift: `swfl-zip-city.ts` carries Manatee County ZIPs that are out of the 6-county footprint.

---

## [HIGH] `/api/converse` and `/api/welcome/chat` are public, unauthenticated, paid-LLM endpoints with no rate limit or cap

**Location:** `app/api/converse/route.ts` (whole route), `app/api/welcome/chat/route.ts`, `middleware.ts:11` (`RATE_LIMITED_PREFIXES`), `lib/highlighter/meter.ts` (`weeklyCount`/`capEnabled`), `lib/rate-limit.ts`

**Detail:** Both endpoints call the Anthropic SDK (`client.messages.stream`, Haiku/Triage model) on every POST. `middleware.ts` only burst-limits `["/api/b/", "/api/mcp", "/api/waitlist", "/p/"]` — `/api/converse` and `/api/welcome/chat` are NOT in that list, so they fall through to the Supabase-session path with no `checkRateLimit` guard. Meanwhile `meter.ts` exports `weeklyCount()` + `capEnabled()` (gated on `HIGHLIGHTER_FREE_WEEKLY_CAP`) and `recordAsk()`/`recordWelcomeChat()` run fire-and-forget — but a grep shows `weeklyCount`/`capEnabled` are referenced ONLY in test mocks, never in any production route. So usage is *recorded* but never *enforced*. An attacker can loop either endpoint to burn the Anthropic budget (and, via `resolveReachTargets`, trigger up to 3 extra brain fetches per call). This is the exact "loop it" abuse `rate-limit.ts` was written to stop, applied to the one surface that actually costs money per request.

**Fix:** Add `/api/converse` and `/api/welcome/chat` to `RATE_LIMITED_PREFIXES` (the in-memory limiter is cheap and already runs in middleware), and wire the existing `weeklyCount`/`capEnabled` cap into the converse route (return a soft "you've hit this week's free asks" frame when `capEnabled() && weeklyCount(cid) >= cap`). Treat the per-IP burst limiter as defense-in-depth and add the Vercel WAF dashboard rule for these two paths as the durable ceiling (same runbook as `api_b_open_rate_limit`).

**Model:** opus — cross-cutting (middleware + two routes + the dormant cap plumbing), touches the cost/abuse boundary and needs a judgment call on free-tier UX vs. enforcement.

---

## [MEDIUM] Deliverable moat anchor set is polluted by free-text note/question content and unit-stripped — invention is loosely, not strictly, prevented

**Location:** `lib/deliverable/build.ts:142` (`collectSnapshotNumbers`), `lib/deliverable/narrative-lint.ts:50` (`normalizeNumber`), `narrative-lint.ts:80` (`buildAnchorSet`)

**Detail:** `narrative-lint.ts`'s header claims the gate is "the structural guarantee — the system prevents invention." Two facts weaken that:
1. **Anchor pollution.** `collectSnapshotNumbers` pushes `qa.question`, `qa.answer`, and `note.text` into the anchor set (test fixture proves it: a note `"spend cap 10/project"` makes `10` a valid anchor). Notes and Q&A questions are free-text the owner types. So an owner who files a note "Target IRR is 18%" makes `18` anchorable, and the LLM can then assert "an 18% return" in fact prose and pass the number gate — even though `18` was never a sourced figure.
2. **Unit-stripping collisions.** `normalizeNumber` reduces everything to `[\d.-]`, so `+60bps`, `$60`, `60%`, and a bare count `60` all normalize to `"60"` and are mutually interchangeable in the anchor set. A snapshot containing `+60bps` lets the narrative state "60 corridors" or "$60" and pass.

The threat model is the *owner* assembling their *own* filed research (single-tenant, self-serve), which is why this is medium and not high — but the doc oversells the guarantee. The real moat is the *grounding* path (`buildGroundingContext`), which IS structural; the deliverable lint is a best-effort backstop.

**Fix:** Build the anchor set ONLY from value-bearing fields that are themselves sourced (`metric.value`, `table_slice`/`chart`/`frame` cells, `qa.fact`) — exclude `qa.question` and `note.text` (free-form). For the unit collision, normalize WITH a unit tag (e.g. key the anchor as `60|bps` vs `60|count`) so a bps figure can't anchor a bare count. At minimum, soften the module header to "best-effort backstop over the owner's own filed items," not "structural guarantee."

**Model:** opus — touches an invariant (no-invention) and the anchor-set contract; needs judgment on how strict to make it without breaking legitimate narratives.

---

## [MEDIUM] `swfl-zip-city.ts` maps Manatee County ZIPs — outside the 6-county SWFL scope

**Location:** `lib/swfl-zip-city.ts:82-104` (Manatee block, ZIPs 34201–34282), consumed by `refinery/lib/chart-adapter.mts:107,200` (`cityForZip`)

**Detail:** The 6-county footprint is locked: Charlotte, Collier, Glades, Hendry, Lee, Sarasota (`fixtures/swfl-zip-county.json` note). Manatee (FIPS 12081) is NOT in scope, and `fixtures/swfl-zip-county.json` contains zero Manatee ZIPs (grep for 34201/34202 → 0). Yet `ZIP_CITY` carries a full Manatee block mapping 34201–34282 to "Bradenton" etc., and the file header explicitly lists "Manatee" as covered. `cityForZip` is used to label chart rows by ZIP. If any upstream chart ever surfaces a Manatee ZIP key (it shouldn't, since ingest is scope-gated), this silently renders a friendly city label for an out-of-scope place — exactly the kind of "looks legit" leak the MOAT rule guards against. At best it's dead, scope-violating data; at worst it's a label that legitimizes an out-of-scope row.

**Fix:** Delete the Manatee block (lines 82–104) and the "Manatee" mention in the header comment. If a Manatee label is ever genuinely needed, it must come with a scope decision and a fixture update, not a hardcoded map. Add a one-line test asserting every key in `ZIP_CITY` is present in `fixtures/swfl-zip-county.json` so scope drift can't re-enter.

**Model:** sonnet — mechanical deletion + a containment test; the scope boundary is already unambiguous.

---

## [LOW] Grounding emits an empty freshness-token directive when the primary dossier has no token

**Location:** `lib/highlighter/grounding.ts:126` (`const token = primary?.dossier.freshness_token ?? ""`), used at line 142 (`Quote this freshness token exactly once in your answer: ${token}`)

**Detail:** When the primary block is missing or its token is empty, the system prompt literally instructs "Quote this freshness token exactly once in your answer: " (trailing empty). The model is told to quote nothing, which either produces a confused empty quote or silently drops the freshness proof — violating data-protocol v3 rule 2 ("Quote it verbatim in your first response"). In the converse route `primary` is always built from a successful `fetchBrain`, so `freshness_token` is normally present; this is a latent edge (a brain with an empty token, or a future caller that passes a tokenless block) rather than a live bug.

**Fix:** When `token` is falsy, omit the "Quote this freshness token…" line entirely (and ideally add a caveat "freshness unavailable") rather than emitting a dangling directive. A `token ? [...] : []` spread on that line.

**Model:** sonnet — localized, well-specified guard.

---

## [LOW] `renderHtmlTemplate` does raw `{{token}}` substitution with no HTML escaping

**Location:** `lib/templates/render-html-template.ts:70-73`, contracts in `lib/templates/token-contracts.ts` (free-text fields: `storm_names`, `zip_label`, `zip_place`, `year_round_list`, `company_name`-adjacent)

**Detail:** Token values are interpolated via `String(value)` straight into the HTML shell with no escaping, and the route returns `text/html` inline. The POST surface (`/api/templates/render`) accepts caller-supplied `tokens` and is auth-gated behind the MCP bearer (`assertAuthorized`) — *but that gate is open when `MCP_BEARER_TOKEN` is unset* (the repo's "open MCP" posture). Several contract fields are free text (`storm_names`, place labels). A token value containing `<script>` (or, more realistically for this feature, a client brand name with markup) injects into the rendered page. The GET surface uses only fixed `previewData`, so it's safe; the exposure is the POST custom-token path when the bearer is unconfigured.

**Fix:** HTML-escape every substituted value by default in `renderHtmlTemplate` (escape `& < > " '`); for the small set of tokens that intentionally carry markup, gate them through an explicit allowlist. Don't rely on the MCP-bearer being set as the only guard for an HTML-emitting endpoint.

**Model:** sonnet — standard escaping helper + a per-token allowlist; low ambiguity.

---

## [LOW] `assembleDeliverable` swallows the real DB error behind a generic "build failed" 500

**Location:** `lib/deliverable/assemble.ts:80` (`if (error) throw new DeliverableError("build failed", 500)`)

**Detail:** When the `deliverables` insert fails (RLS, constraint, missing column, FK), the Postgres error object is discarded and replaced with an opaque `"build failed"` 500. The narrative was already generated (one paid LLM call) by this point, so a silent insert failure burns the spend AND gives the operator nothing to debug. Given this is the flywheel's terminal step (`/api/templates/[id]/run` → `assembleDeliverable`), a quiet 500 here is the hardest class of bug to diagnose in prod.

**Fix:** Log `error` server-side (e.g. `console.error("deliverable insert failed", error)`) before throwing the generic `DeliverableError` — keep the opaque client message, but don't drop the cause.

**Model:** sonnet — one-line logging add.

---

## [NIT] `narrative-lint` strip path can leave a deliverable with an empty exec summary / zero sections silently

**Location:** `lib/deliverable/narrative-lint.ts:266-271` (sentence drop), `build.ts:371-374` (`narrative = lint.stripped`)

**Detail:** On a second lint failure, the build hard-strips every offending sentence and proceeds with `stripped: true`. If the model leaned heavily on unanchored numbers, the stripped `exec_summary` and all `section.intro`s can collapse to empty strings, producing a published deliverable that is blank/near-blank but `status: "ready"`. The `stripped` flag is returned from `buildDeliverableNarrative` but `assembleDeliverable` discards it (destructures only `{ narrative }`), so nothing downstream knows the deliverable was gutted.

**Fix:** Surface `stripped` (and an "all sections emptied" check) to the caller; if the stripped narrative has an empty exec summary and no non-empty section, fail the build (or fall back to the deterministic `mockNarrative`) rather than persisting a blank ready deliverable.

**Model:** sonnet — well-scoped guard once the empty-result condition is defined.
