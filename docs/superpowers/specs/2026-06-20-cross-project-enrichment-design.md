# Cross-project AI knowledge — enrichment design (expands Approach A)

**Date:** 2026-06-20
**Status:** Approved (operator "good to go" 2026-06-20). Brainstormed under RULE 3.5.
**Tracking check:** `cross_project_ai_knowledge`
**Expands:** the inline "Cross-project AI knowledge — spec (Approach A)" in
`docs/superpowers/specs/2026-06-20-ai-surface-audit-and-handoff.md` (lines 71–89). That
section is the seed; this doc is the built design and supersedes it on any conflict.

---

## Problem (verified against code, not memory)

The in-project AI is hard-scoped to the current project, so it cannot answer the
operator's #1 ask — *"did I already pull flood AAL for 33931 anywhere?"* — or use prior
work to make the current build better. Confirmed in code:

- `lib/chat/page-context.ts:198` — `projectPageContextForPath` returns `undefined` when
  `digest.projectId !== projectIdFromPath(path)` (the deliberate "stale-leak defense").
- `lib/project/cross-project-index.ts` (`buildCrossProjectIndex` / `findOverlap`) is fully
  built + unit-tested but **dead-wired** — zero non-test callers.
- `app/api/welcome/chat/route.ts` (the route the in-project `BriefcaseChat` POSTs to in
  `mode:"analyst"`) has no `projects`-table query.
- RLS already permits the read: `projects_owner_all` is per-row (`auth.uid() = user_id`);
  `app/api/projects/assemble/route.ts:35` already does `from("projects").select("id, title, items")`
  cookie-scoped. No new table, no new policy.

## What this feature is (operator's reframing)

Not "AI can recall other projects" but **"AI uses other projects to make THIS build
better, without ever destabilizing it."** The operator's constraints, verbatim intent:

1. Keep the cross-project view **shallow by default**; let the AI **offer to investigate**
   what fits once it understands the current project.
2. **Projects are frozen** (every `ProjectItem` is a snapshot pinned at save time). The AI
   must not get confused by stale cross-project data, must not start saying "this project
   is wrong" / "that project is wrong", and must not lose focus on the current task.
3. Value sources named: information that *fits well here*, prior *successes* (e.g. email
   clicks), and *user-uploaded data that fits*.

## Capability reality (probed 2026-06-20 — record so we don't re-promise it)

| Value source | v1 | Why |
|---|---|---|
| **Information that fits** (filed metric/qa/report/table_slice from other projects) | ✅ **IN** | `buildCrossProjectIndex`/`findOverlap` already built; RLS read is free. |
| **User-uploaded data that fits** | 🟡 **Shallow only** | Uploads are `{kind:"file"}` items with mime/size/caption + PDF `extracted_text`; **no original filename, no image OCR, no scope tag**; files keyed by random `storage_path` UUID so the same file never matches across projects. Content-fit for images needs OCR we don't have. **Cheap win folded in:** feed PDF `extracted_text` into scope inference so PDFs become scope-bearing. |
| **"Success on email clicks"** | 🔴 **OUT (deferred)** | Project email is **send-only** — `email_sends` has no opens/clicks and no `project_id`; project mail ships as untaggable Resend *broadcasts*. The only opens/clicks ledger (`outreach_events`) is the operator's cold-outreach drip, keyed by `campaign_id`/`recipient_id` with **no `project_id`**. Social engagement is schema-only, poller unbuilt, and `social_schedules` has no `project_id`. Delivering this needs new click instrumentation + a `project_id` on the events — a separate build, not a wiring job. |

## Design — "deep on current, advisory on the rest"

The safety requirement is solved by a **hard wall + a prompt contract**, not by data
access (access is free under RLS).

### Two tiers, never mixed
- **TIER A — current project (deep, authoritative).** Unchanged. The `page-context.ts:198`
  guard **stays** — the current project is the only thing the AI treats as "what we're
  building." TIER A continues to ride the existing `pageContext` field.
- **TIER B — other projects (shallow, advisory, frozen).** A clearly-separated system-prompt
  block, appended once in the analyst path:

  ```
  === YOUR OTHER PROJECTS (read-only · frozen snapshots · advisory only) ===
  <contract lines>
  • Cape Coral 33904 — 6 filed items (3 metrics, 2 answers, 1 file) · frozen as of 06/10/2026
  • Naples retail corridor — 3 filed items (3 metrics) · frozen as of 05/28/2026
  <optional OVERLAP lines for confirmed scope+identity matches>
  ```

  Per-project line = title · scope · item-count + kind breakdown · **"frozen as of <date>"**.
  The as-of comes from `max(item freshness_token)` (the honest data vintage, via
  `buildProjectDigest().freshnessToken → asOfFromToken`), **never** `projects.updated_at`
  (which is bumped by a rename/branding edit and would mislabel a project as fresh). A
  project whose items carry no token (note/file/source-only) shows **"no dated data — pinned
  at save"**, never a synthesized vintage.

### The anti-mess-up contract (TIER B prompt rules)
1. TIER B may be used **only** to *suggest* reusing a relevant prior finding, *flag* a
   fitting upload, or *answer* "have I looked at X before". It is background awareness.
2. It **must not** contradict, critique, or "fix" the current project using other-project
   data; **must not** call any project right or wrong; **must not** present frozen data as
   current; **must not** drift into managing other projects.
3. On any conflict between a TIER B fact and the current project, say *"you filed this in
   {project}, as of {date} — worth a fresh check,"* never *"this is wrong."*
4. **Nothing auto-injects.** The AI *offers*; the user acts. (Matches the established
   passive-trigger pattern.) v1 has no silent cross-project write.

### Confirmed-overlap awareness (the "offer to investigate")
`findOverlap` (already built; fires only on an **exact identity-key match AND a shared
ZIP/place** — topic alone never fires, dismissed keys suppressed) decides *when* a real fit
exists. It naturally won't fire on a brand-new scopeless project — matching the operator's
"once we have enough context to what this project is." For each confirmed `reuse` hit (a
scope-matching other project has a data point this one lacks), TIER B appends one line
carrying the matched item's `summarizeItem` label (which already includes the value, e.g.
`"Flood AAL: $30,074/yr"`) + the source project + its frozen-as-of, so the AI can offer:
*"Your Cape Coral 33904 project already has Flood AAL: $30,074/yr filed (as of 06/10) — want
me to bring that in?"* This is the only place TIER B carries an item **value**, and only for
a confirmed, scope-anchored match — the general index stays shallow.

## Guardrails / invariants (do not break)
- **Keep** the `page-context.ts:198` `projectId===path` guard. TIER A stays single-project.
- **Own-files only.** The read is the cookie-authed `from("projects").select(...)` — RLS
  scopes it to `auth.uid()`. No cross-*user* reach. (Consistent with the "client data can be
  used by a client, not the police" decree — within one user's own projects there is no
  leak; the no-invention MOAT is about inventing SWFL numbers, enforced by the grounding
  blocks, not by hiding the user's own filed data from themselves.)
- **Grounded-only values.** Only confirmed-overlap lines carry a value, and that value is a
  snapshot the user themselves filed with its own citation. The free-text `note` kind (and
  any non-token kind) is never surfaced as a sourced fact.
- **Public route stays graceful.** `/api/welcome/chat` is public + unauthenticated. The
  cross-project read runs **only** in `mode:"analyst"`, only when `getUser()` resolves a
  session AND a `currentProjectId` is supplied, and is wrapped so any failure falls open to
  *no TIER B block* (mirrors the existing cre-swfl nested failsafe). Anon `/welcome` is
  unaffected.
- **Bounded.** Cap **8** other projects, newest-first by `updated_at`. Items live inline in
  one jsonb column, so a title/scope/count/as-of digest is cheap (~the existing 600-char
  `pageContext` budget). No `selectAllPaged` needed at v1 volumes; if a power user exceeds
  the PostgREST 1000-row default the cap still bounds the prompt — flagged, not silently
  truncated.

## Build surface (ordered; reuse over rebuild)

1. **`lib/project/other-projects.ts`** (NEW, pure — TDD first):
   - `otherProjectEntries(rows, currentProjectId, cap=8)` → `OtherProjectEntry[]` excluding
     current, newest-first. Per entry derives `{ projectId, title, scope, itemCount,
     kindCounts, frozenAsOf|null }` by calling `buildProjectDigest({projectId,title,items})`
     (pure; reuses the one scope/freshness root) + `asOfFromToken`.
   - `renderOtherProjectsBlock(entries, overlap?)` → the TIER B string: contract lines, one
     line per entry (via the existing `describeContents`-style kind summary), then optional
     confirmed-overlap offer lines from `findOverlap`'s `reuse` hits. Returns `""` for no
     entries (no empty block).
2. **`app/api/welcome/chat/route.ts`** — in the analyst paths only (both the no-location
   `buildAnalystSystem` branch and the located-analyst branch), assemble TIER B server-side:
   cookie `createClient` → `getUser()` → if user + `currentProjectId`: `select id, title,
   items, updated_at` (RLS), `buildCrossProjectIndex` + `findOverlap(currentProjectId, …,
   {dismissed})`, `otherProjectEntries`, `renderOtherProjectsBlock` → append after
   `clientContext`. All in a `try/catch` that yields `""` on any failure. Add
   `currentProjectId?: string` to the body type.
3. **`components/briefcase/BriefcaseChat.tsx`** — add `currentProjectId: projectId ?? undefined`
   to `getExtraBody`'s returned body (the only client change; `projectId` is already in scope).
4. **`lib/project/derive-name.ts`** — the PDF cheap win: `itemText` `case "file"` returns
   `[item.caption, item.extracted_text].filter(Boolean).join(" ") || item.storage_path`
   (capped to keep scope inference cheap). Makes PDFs scope-bearing across deriveName/digest/
   assemble. Behavior change to a load-bearing pure fn → covered by a dedicated test.

## v1 scope vs. follow-ons

**IN v1:** TIER B shallow advisory index + confirmed-overlap awareness + the safety
contract + the PDF→scope win, wired into the in-project analyst chat. This delivers the #1
ask (the AI now *knows* all your projects and *offers* fits) end-to-end.

**Fast-follow (flagged, NOT built here):**
- **One-click cross-project pull** — `POST /api/projects/[id]/pull {fromProjectId,
  identityKey}` copying that exact item (snapshot, citation+freshness intact) into the
  current project + a "Bring this in?" affordance. v1's AI can *offer*; the mechanical
  one-click copy is the obvious next cut. → open check.
- **Email-clicks / "what worked"** engagement instrumentation (🔴 the heavy one: per-recipient
  click tracking + `project_id` on events; project mail is on untaggable broadcasts today).
  → open check.
- **Upload content-fit** — image OCR / filename capture so an upload matches another
  project's scope by content. → open check.
- **Approach C** — `swfl_project_list_all` MCP tool (parity for the MCP surface). → defer.

## Testing strategy (TDD)
- `other-projects.test.ts`: entries exclude current; newest-first + cap 8; kind summary;
  frozen-as-of from max token; "no dated data" for note/file-only; block is `""` when no
  others; overlap offer line carries the matched value + source + as-of; dismissed keys
  suppressed (delegated to `findOverlap`, asserted at the render boundary).
- `derive-name` test: a file item with `extracted_text` naming a ZIP/place now contributes
  scope; an uncaptioned non-PDF file still contributes nothing.
- Route-level: analyst + session + `currentProjectId` → block present & current excluded;
  anon → no block; read failure → no block (chat still answers).
- Gate: real-tsc 0, eslint clean, `next build` ✓, full `bun test` green.

## Risks
- **Prompt confusion across projects** — mitigated by the hard TIER A/B wall, the explicit
  "advisory only / never call a project wrong" contract, and frozen-as-of stamping on every
  line. Verified by the adversarial review lens "does TIER B ever read as authoritative".
- **Over-conservative `findOverlap`** (exact-key + shared ZIP/place) may miss fuzzy fits —
  acceptable for v1 ("don't nag" beats "over-pull"); semantic pairing stays deferred.
- **Public-route auth coupling** — contained: read only in analyst mode, fail-open, anon
  unaffected; no change to the public funnel behavior.
