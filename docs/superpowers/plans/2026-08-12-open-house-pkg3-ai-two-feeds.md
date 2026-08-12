# PLAN — Package 3: Ground the email-lab AI: ONE AI, TWO FEEDS

**Written 08/12/2026. PLAN ONLY — no source edits, no builds, no commits, no pushes, no paid model
calls.** Executes `docs/handoff/2026-08-12-open-house-build-plan-parallel-sonnet-assignments.md`
Package 3, itself downstream of `docs/handoff/2026-08-12-open-house-and-build-ai-grounding-handoff.md`
§1f/§4 Step 3 (settled fact, cited not re-derived) and the two research files named in that handoff.

---

## ⚠️ FLAG AT THE TOP — TWO FILES THIS PLAN NEEDS THAT ARE OUTSIDE THE STATED CONFINEMENT

The task brief confines edits to `app/api/email-lab/ai/route.ts` + new resolver files, with
`lib/project/digest.ts` read-only, and says "flag it at the top" if the plan needs anything else.
It needs two things, both **verified unclaimed** by the three concurrent packages (their file lists:
`components/lab-entry/AddressPopup.tsx`, `components/email-lab/EmailLabGridShell.tsx`,
`lib/deliverable/recipes/open-house.ts`, `lib/deliverable/recipes/shared.ts`,
`lib/narratives/validate.ts`, `scripts/email/render-open-house.mts` — grepped, neither file below
appears):

1. **`lib/email/build-doc.ts` — the actual system-prompt assembly and `messages.create` call sites
   live here, not in `route.ts`.** `route.ts` only dispatches to `buildContentDoc`/`authorDoc`
   (build-doc.ts); the system prompt the model actually reads is built by `contentPatchSystem()`
   (build-doc.ts:446–489), called from exactly two places: `authorAddedSlots` (:573) and
   `fillSkeletonResult` (:892, reached via `buildContentDoc`, the `runFill`/`runBlockAi` lane). Feed
   1 + Feed 2 cannot reach the model without touching this function. **Recommendation: add
   `lib/email/build-doc.ts` to Package 3's file list** — the edit is additive (new optional
   parameters threaded through, no existing logic changed) and scoped to `contentPatchSystem` +
   the two callers' argument lists. If another live session claims this file mid-build, stop and
   isolate via `scripts/worktree.mjs` (RULE 1.5) before continuing.
2. **`components/email-lab/EmailLabGridShell.tsx` — IS claimed (Package 1).** All four call sites
   that POST to `/api/email-lab/ai` (`runAuthor` :586, `runAutoBuild` :688, `runFill` :830,
   `runBlockAi` :989) live here, and the component **already receives `projectId?: string` as a
   prop** (destructured at :314 — confirmed live, not inferred). Wiring `projectId` into those four
   request bodies is a one-field-per-call-site change (`projectId: projectId ?? undefined` in each
   `JSON.stringify({...})`). **This plan does NOT touch this file.** The route below accepts
   `projectId` as an **optional** field — until the four call sites send it, Feed 1 always resolves
   to `undefined` (the safe, already-guarded no-context state, identical to today's behavior). The
   four-line wiring is named as an explicit follow-up for whoever next holds that file (Package 1's
   own session, once its date/time work lands, or a short dedicated pass) — not a blocker to
   shipping Feed 2 or the resolver infrastructure now.

Everything else below stays inside `app/api/email-lab/ai/route.ts` + new files.

---

## 1 — CURRENT STATE, VERIFIED

### 1.1 The route — request shape has NO project identity today

`app/api/email-lab/ai/route.ts:90–113` — the parsed body type carries `prompt`, `doc`,
`currentTokens`, `scope`, `mode`, `chartType`, `build`, `recipeId`, `recipeKey`, `useSavedLayout`.
**No `projectId`, no `path`.** Confirms handoff §1f's claim directly — verified by reading the type,
not assumed.

### 1.2 `buildProjectDigest()` — confirms the handoff's "3 callers, zero email-lab edge" claim

`lib/project/digest.ts:300`, signature `buildProjectDigest(input: ProjectDigestInput): ProjectDigest`
— **pure**, no I/O, no LLM call (read start to finish; every field comes from `input`). Grep for
`buildProjectDigest` across the repo returns exactly 3 real call sites:
`app/project/page.tsx:106` (hub, one call per row, in a loop, DB rows already in hand from a
`Promise.all` at :40–67), `app/project/[id]/ProjectWorkspace.tsx:486` (client component, `useMemo`,
fed by props from the server `page.tsx`), and `lib/project/other-projects.ts:100` (not read this
session — outside scope). `app/project/[id]/page.tsx:217` is a **comment**, not a call ("Passes the
result to ProjectWorkspace so buildProjectDigest stays pure") — confirms the handoff's own
precision note that this is not a 4th caller. **Zero edges from `email-lab/ai/route.ts`** — confirmed,
matches §1f.

**Not settled by digest.ts alone: how the inputs get gathered.** Neither `page.tsx` nor
`ProjectWorkspace.tsx` calls a shared "gather" helper — `page.tsx` inlines its own `Promise.all` of
Supabase reads (projects, email_schedules, social_schedules, deliverables, contacts) and folds them
per-row into `ProjectDigestInput` (:40–130); `ProjectWorkspace.tsx` receives pre-loaded props from
its own server page and only calls the pure builder. **There is no existing single-project gather
function to import — Feed 1 needs a new one**, scoped narrower than either existing caller (see §3).

### 1.3 `projectPageContextForPath` — confirms the "11-field, guarded" claim exactly

`lib/chat/page-context.ts:202–225`:

```ts
export function projectPageContextForPath(
  path: string,
  digest: ProjectDigest | null,
): ProjectPageContext | undefined {
  if (!digest) return undefined;
  const pid = projectIdFromPath(path);
  if (!pid && norm(path) !== "/project") return undefined;
  if (pid && digest.projectId !== pid) return undefined;
  return { title, scope, itemCount, kindCounts, freshnessToken, freshnessIsNew,
           hasEmailSchedule, branding, recentActivity, significantChanges, activeEvents };
}
```

**Counted the returned object literal by hand: 11 fields** (`title`, `scope`, `itemCount`,
`kindCounts`, `freshnessToken`, `freshnessIsNew`, `hasEmailSchedule`, `branding`, `recentActivity`,
`significantChanges`, `activeEvents`) — confirms the handoff's "11-field" claim exactly, not
approximately.

`projectIdFromPath` (`lib/briefcase/pill-mount.ts:10–13`): `pathname.match(/^\/project\/([^/]+)/)`
— returns `null` for anything not starting `/project/`. `norm()` (page-context.ts:19–23) strips a
trailing slash.

**`describePage(pathname, project?)`** (page-context.ts:143–189) is the prose renderer — for
`p.startsWith("/project/")` it returns `project ? describeProject(project) : "one of their
projects"`. `describeProject` is **not exported** (private helper), but `describePage` is, and
calling `describePage("/project/<id>", context)` reaches it internally — this is the reuse path,
zero new exports needed from `page-context.ts`.

### 1.4 `EmailLabGridShell.tsx` already carries `projectId` as a typed prop — not a raw path

`components/email-lab/EmailLabGridShell.tsx:282,314` — `projectId?: string` is a component prop,
already threaded from wherever the shell mounts. It renders at **two** real routes, confirmed by
grep of `app/**`: `app/email-lab/grid/page.tsx` (standalone — `AI_CHROME_FREE_PREFIXES` in
`pill-mount.ts:34` lists `/email-lab`, i.e. this route is **deliberately AI-chrome-free at the site
level**, though the in-lab assistant is a separate surface from the site pill) and
`app/project/[id]/email-lab/page.tsx` (embedded inside a project workspace, where `projectId` is
real). **The standalone route genuinely has no project — this is the concrete "path names no
project" case**, not a hypothetical.

### 1.5 `lengthProfile()` — confirms §1b, and surfaces a gap the handoff's Step 3 language glossed over

`lib/narratives/length.ts:38–40`: `lengthProfile(surface) => surface === "area-email" ? EMAIL :
REPORT`. Two profiles only. **`open-house`'s actual governing word constraint is NOT here.**
`lib/deliverable/recipes/shared.ts:602` (read-only, Package 4's file) hardcodes it as a comment
string inside the `opts.invitation` prompt branch: *"ONE OR TWO SENTENCES. Roughly 15-35 words."*
— a literal, unstructured English sentence, not a `LengthProfile` object. **If Feed 2 cites
`lengthProfile("area-email")`'s 50–125-word band for an open-house build, it hands the chat AI a
constraint that CONTRADICTS the recipe narrator's own 15–35-word rule** — exactly the "AI cites a
drifted constraint" failure mode named in the research. Design response in §4.2.

### 1.6 `RECIPES` registry — a real, already-existing code root for chart/subject/positioning

`lib/deliverable/recipes.ts:51–87` (`RECIPE_KEYS`, `as const`, 19 entries) and :173+
(`RECIPES: Record<RecipeKey, Recipe>`). Every entry already carries `chart: ChartPolicy`,
`subject: SubjectSpine`, `positioning`, `label`, `needs`. **This is directly importable, zero
duplication** — Feed 2 should read `RECIPES[recipeKey].chart` etc. verbatim rather than re-deriving
or hand-copying them. 17 of 19 keys have `target` unset (= email); `social-pack`/`social-cut` carry
`target: "social"`.

### 1.7 The acceptance-script assertion names (for Feed 2's `open-house` entry)

`scripts/email/render-open-house.mts:235–299` — 8 named `Assertion` objects (`checks: Assertion[]`),
each with a `name` string starting `"1 · street line PRESENT"` through `"8 · description, when
held, ships AFTER the narrative"`. These are read (not copied into logic) for Feed 2's `open-house`
constraint set — see §4.3.

### 1.8 The interactive/patch-writing AI has NO free-text reply channel today — a finding, not assumed

`contentPatchSystem()` (build-doc.ts:467–469) instructs the model: *"Return ONLY a JSON content
patch… No markdown fences, no commentary outside the JSON object."* Both real call sites
(`authorAddedSlots` :573, `fillSkeletonResult`/`buildContentDoc` :892) parse the reply as JSON only.
**There is no chat-reply surface for "why don't I have X" today** — the existing abstention
mechanism is the DATA SOURCING lane-4 instruction already baked into `contentPatchSystem`
(*"write `[Need: brief description]`"*), which writes the honest gap INTO the doc field, not into a
prose reply. The response contract does carry a `message?: string` field
(`EmailLabGridShell.tsx`'s destructure of `runFill`'s response, :840–845) used for things like
chart-build notes. **Design implication (§4.4):** grounded abstention here means (a) the model
reliably writes `[Need: …]` instead of guessing when Feed 2 says a field isn't held, not (b) a new
conversational reply channel — and (b) is out of scope for this package (it would be a UI + contract
change, colliding with Package 1's shell file).

### 1.9 Model default confirmed

`lib/email/model-router.ts:12,19,38–41` — `resolveEmailModel(undefined)` → `EMAIL_MODEL_HAIKU =
"claude-haiku-4-5"`. Matches the research file's note that Haiku 4.5 needs ≥4,096 tokens in a
prefix to cache at all (§5 below).

### 1.10 Playbook §0.4-equivalent walk table + §2.6 stub, read directly

`docs/standards/email-build-playbook.md:853` (walk table) and `:2540–2550` (§2.6 body) — confirmed:
Open House is **WALKED 08/06/2026** (5 operator rounds, `SESSION_LOG.md:1940-1962`) but the **Part 2
prose is explicitly marked OWED**, not written. §2.6's stub already names: acceptance script
rebuilt 08/09/2026, open-house date/time is ALWAYS lane-4 (zero lake columns, all three lanes
checked live 08/09/2026), and a forward pointer to the sentence-bank rollout (`essentialGaps`,
`lib/deliverable/language.ts`) as a FUTURE step, not built yet. My draft in §2 below supersedes the
stub; whoever next holds the playbook file lands it verbatim or corrects it.

---

## 2 — THE PLAYBOOK §2.6 PROSE (drafted here, NOT written into `email-build-playbook.md`)

*(Per instruction — a parallel session may hold that file. This is the landing copy, format-matched
to §2.5/§2.7/§2.8's existing style.)*

> ## 2.6 OPEN HOUSE — tag `open-house` — WALKED 08/06/2026, section written 08/12/2026
>
> **Spine:** address (lifecycle 7, `resolveSubject`). **Positioning:** sell-side. **Chart policy:**
> `none` — a house and a moment are not a number; two dates is not a chart (`RECIPES["open-house"]`,
> `lib/deliverable/recipes.ts`).
>
> **Grammar:** `buildLifecycleEmail` (the shared 7-email chrome, `lib/email/lifecycle-chrome.ts`) —
> header · ribbon "Open House" · photo · hero (address over price) · spec strip (beds · baths ·
> sq ft · $/sq ft only — no lot, no type: neither is a fact decided standing in the driveway) ·
> **the moment's own card** (`dateTimeCard`, `open-house.ts:124`, ONE caller/ONE callee — hosted
> `gx_impact`, no wider ripple) directly under the strip, ahead of the narrative · narrator's short
> invitation · the seller's own MLS description verbatim (`tail`, never touched by the model) ·
> agent card · CTA (RSVP) · footer.
>
> **THE MOMENT: the one fact no vendor sells.** `ListingFacts.openHouseDate`/`openHouseTime`
> (`lib/email/listing-scrape.ts:45–46`) are written in exactly one place in the whole repo —
> `scripts/email/render-open-house.mts:88–89`, CLI `argv[3]`/`argv[4]`. Zero UI writes them today
> (Package 1's job). All 18 SteadyAPI endpoints checked 07/13/2026 hold nothing; the vendor's own
> `open_houses` field is `[]`/`null` on every example. This is a **lane-4, human-typed fact by
> design, not a gap to backfill from a vendor** — never invent a date, never default to "this
> weekend." Absent → NO card renders at all (never an empty callout, T6's lesson applied to a card).
>
> **What the AI writes:** ONE short invitation paragraph (`opts.invitation` branch,
> `lib/deliverable/recipes/shared.ts:580–617`) — a warm greeting, AT MOST ONE feature said in plain
> human words (never a number, never a mileage figure), then the ask. **Roughly 15–35 words** —
> this is a hardcoded prompt instruction today, NOT a `LengthProfile` object from
> `lib/narratives/length.ts` (that file's `lengthProfile("area-email")` governs a different,
> baked-narrative recipe family — citing its 50–125-word band for Open House would contradict this
> recipe's own rule). **No code-level guard exists yet** — Package 4's job (widening
> `validateNarrative()` into this branch). Never a time-of-day/lighting detail ("evening light");
> never a cost figure (HOA, price/sqft, days-on-market) — that's a negotiating fact, not an invite.
>
> **Buttons:** "RSVP for the Open House" — single CTA, asserted verbatim off the rendered button
> block (assertion 7). Bottom "More about this property" → the realtor.com listing (Package 2's
> job, `button_destinations` fix B — read off the account row, `roleDestinationsFromBrand`).
>
> **Acceptance (`render-open-house.mts`, rebuilt 08/09/2026, 8 assertions read off rendered HTML,
> never the source doc):** 1 street line present · 2 zip present · 3 no invented day/date/time in
> the narrator's own block when none was supplied · 4 the moment's card matches what was passed in
> (present when supplied, absent entirely when not) · 5 price is the list price verbatim · 6 no
> chart, exactly one image block iff a subject photo is held · 7 CTA reads the RSVP label off the
> rendered button, never a second hardcoded copy · 8 description, when held, ships AFTER the
> narrative.
>
> **Known gaps:** no UI writes real date/time (Package 1); no code-level length/ask guard on the
> narrator (Package 4); the sentence-bank rollout (`essentialGaps`, `lib/deliverable/language.ts`)
> has not reached this recipe yet — its ESSENTIAL slot machinery is built and tested but this would
> be its first send-gate wiring, not started.

---

## 3 — FEED 1 DESIGN: project context, by reuse, explicit resolution

**The literal reuse chain — three imports, zero forks:**

```
gatherEmailLabProjectDigest(projectId, supabase)   // NEW file, §3.2 — the only new I/O
        → buildProjectDigest(input)                 // lib/project/digest.ts:300, UNCHANGED, imported
        → projectPageContextForPath(`/project/${projectId}`, digest)  // lib/chat/page-context.ts:202, UNCHANGED, imported
        → describePage(`/project/${projectId}`, context)               // lib/chat/page-context.ts:143, UNCHANGED, imported
```

### 3.1 The project-resolution answer — exact, and it is the whole guard

**The route accepts an optional `projectId?: string` field on the POST body — not a raw
`pathname`.** This is a deliberate, justified departure from literally piping
`window.location.pathname` into `projectIdFromPath`: `EmailLabGridShell.tsx` already carries
`projectId` as a typed prop (§1.4), so asking the client to derive and send a path string when it
already holds the resolved id is an unnecessary, error-prone indirection (a malformed synthetic path
string is a new failure mode a direct id can't have).

**Resolution algorithm, in `app/api/email-lab/ai/route.ts`:**

```ts
async function resolveFeed1(projectId: string | undefined): Promise<string | undefined> {
  if (!projectId) return undefined;          // ← THE GUARD. No fallback. No "most recent project."
  const digest = await gatherEmailLabProjectDigest(projectId, supabase); // scoped, RLS-enforced
  if (!digest) return undefined;              // not found / not owned by this caller
  const ctx = projectPageContextForPath(`/project/${projectId}`, digest); // reused guard, vacuously true here
  if (!ctx) return undefined;
  return describePage(`/project/${projectId}`, ctx);  // prose, matches chat's shape
}
```

**Why this can never "inherit whichever project was opened last":**

1. **No implicit fallback branch exists in this algorithm at all.** The only way `projectId` is
   non-empty is the caller sending it explicitly. There is no `ORDER BY updated_at DESC LIMIT 1`,
   no lookup by `scope.address`/`scope.value` reverse-matching a project's `subject_address`, no
   session-keyed "last project" cache. **Any implementation of this function that adds such a
   fallback is the exact bug this package exists to prevent — named explicitly so it cannot be
   "helpfully" added later.**
2. **No server-side cache of the digest across requests.** Each POST calls
   `gatherEmailLabProjectDigest` fresh (a real per-request Supabase read); Next.js route handlers
   are stateless per invocation, so there is no module-level store analogous to the client's
   `ai-context-store.ts` that could carry request A's digest into request B. This removes the
   entire class of bug the client-side guard was built for (§4 Step 3 failure-mode (c) in the
   handoff: "no cache today = no stale risk today" — same logic applies here to CROSS-REQUEST
   leakage, a worse variant of staleness).
3. **The reused guard (`projectPageContextForPath`) is still called, not skipped**, even though by
   construction `digest.projectId` always equals the requested `projectId` here (so the guard's
   `digest.projectId !== pid` branch can never fire in today's code path). This is deliberate
   defense-in-depth: if a future change introduces ANY caching of `gatherEmailLabProjectDigest`'s
   result (§4 Step 3's own failure mode (c) — "if caching is added later" — is exactly this), the
   guard is already there and already tested, so a caching bug degrades to "no context" (safe) not
   "wrong context" (the actual danger).

**The RLS gate:** `gatherEmailLabProjectDigest` reads via the cookie-bound `createClient` (never
`createServiceRoleClient` — the guard that matters per `app/api/CLAUDE.md` is cross-USER, and a
project row's RLS policy already scopes reads to its owner), so a `projectId` for a project the
caller doesn't own returns no row → `digest` is `null` → `undefined`, never another user's data.

### 3.1a WHERE `projectId` ITSELF COMES FROM — traced, not assumed (post-advisor correction)

The design above moves the guard from "path parsing" to "trusting a client-supplied `projectId`."
That trust has to be earned by tracing the prop, not asserted — done here:

**Traced and CONFIRMED correct-by-route:** `app/project/[id]/email-lab/page.tsx:52,178` —
`const { id } = await params;` (the Next.js dynamic-route segment, read server-side, fresh on every
request) → `<ProjectEmailLabClient projectId={id} .../>`. This is the ONLY place in the repo that
sets `EmailLabGridShell`'s `projectId` prop to a real value — it comes from the URL, resolved
server-side, every request. **Confirmed by a second, independent negative:**
`app/email-lab/grid/page.tsx` (the standalone mount) has **zero** occurrences of `projectId` in
either it or its client wrapper `EmailLabGridClient.tsx` — `<EmailLabGridShell key={buildKey}
initialDoc={...} .../>` (`EmailLabGridClient.tsx:435`) never sets the prop at all, so it is
`undefined` there by omission, not by an explicit empty string. This is real, checked evidence for
the exact "path names no project" case (§1.4), not a hypothetical.

**Flagged, NOT verified — a genuine residual risk, correctly scoped out of this package.** Advisor
review caught that §3.1's original text overstated confidence: confirming the SERVER-SIDE source of
`projectId` is correct does not by itself prove the CLIENT NEVER SERVES A STALE COPY of that prop
across a client-side transition between two different projects' email-lab pages without an
intervening full navigation. `ProjectEmailLabClient.tsx:682` keys `EmailLabGridShell` as
`key={`grid-${buildKey}`}` — **`buildKey` is NOT derived from `id`/`projectId`**, so if Next.js App
Router ever reuses this client-component subtree across a same-layout `/project/A/email-lab` →
`/project/B/email-lab` navigation without tearing it down (this repo's own App Router behavior on
that exact transition was NOT traced live this session — it would need a browser trace, out of scope
for a plan-only pass), a stale `projectId` closure is a real, if unconfirmed, risk. **This is
entirely inside `ProjectEmailLabClient.tsx`/`EmailLabGridShell.tsx` — Package 1's files — not
`route.ts` or any file this package edits.** Recommended one-line fix for whoever next holds that
file: fold `id` into the key (`key={`grid-${id}-${buildKey}`}`), which forces a fresh mount on every
project switch independent of `buildKey`'s own state, matching the standalone mount's own existing
convention of keying `EmailLabGridShell` for exactly this "force a clean remount" reason. **Naming
this residual risk explicitly, rather than either hand-waving it closed or claiming a live trace
that was not done, is the honest position (RULE 0.95).**

### 3.2 New file: `lib/email/lab-ai-project-context.ts` (Feed 1 gather)

**Shallow, hub-level fields only — explicitly NOT the `[id]`-page depth.** `page.tsx`'s hub loop
(§1.2) already draws this exact line: its own comment says *"Feed rows / activity / events are
[id]-page depth — deliberately not loaded per project here"* for its digest. This design mirrors
that same choice for the same reason (latency in an interactive, Haiku-default edit loop) — not a
new judgment call, an existing one applied consistently:

```ts
export async function gatherEmailLabProjectDigest(
  projectId: string,
  supabase: SupabaseClient,
): Promise<ProjectDigest | null> {
  const { data: row } = await supabase
    .from("projects")
    .select("id, title, items, branding, subject_address, subject_area, ui_state")
    .eq("id", projectId)
    .maybeSingle();
  if (!row) return null;
  const [{ data: emailSch }, { data: delivRows }] = await Promise.all([
    supabase.from("email_schedules")
      .select("cadence, scope_kind, scope_value, topic, last_run_at")
      .eq("project_id", projectId).in("status", ["active", "paused"]),
    supabase.from("deliverables")
      .select("id, template, created_at").eq("project_id", projectId),
  ]);
  return buildProjectDigest({
    projectId: row.id,
    title: row.title || deriveProjectName(row.items ?? []),
    items: row.items ?? [],
    deliverables: (delivRows ?? []).map(d => ({ id: d.id, template: d.template, created_at: d.created_at })),
    schedules: (emailSch ?? []).map(s => ({ cadence: s.cadence, scope_kind: s.scope_kind,
      scope_value: s.scope_value, topic: s.topic, last_run_at: s.last_run_at })),
    lastFreshnessTokenSeen: typeof row.ui_state?.last_freshness_token_seen === "string"
      ? row.ui_state.last_freshness_token_seen : undefined,
    branding: brandingForDigest(row.branding),
    subjectAddress: row.subject_address,
    subjectArea: row.subject_area,
  });
}
```

Imports only: `buildProjectDigest`, `brandingForDigest` (`lib/project/digest.ts`, read-only),
`deriveProjectName` (`lib/project/derive-name.ts`, already imported by both existing callers, safe
reuse). No new table, no new column.

---

## 4 — FEED 2 DESIGN: the `recipeKey` → constraint-set resolver

### 4.1 Shape

```ts
export interface RecipeConstraints {
  recipeKey: RecipeKey;
  chart: ChartPolicy;              // RECIPES[recipeKey].chart — real code root, zero duplication
  subject: SubjectSpine;           // RECIPES[recipeKey].subject
  positioning: "sell-side" | "story-side";
  lengthNote: string;              // §4.2 — may be an honest "no rule on record" sentence
  playbookSummary: string;         // §4.3 — short, cites its own source line
  acceptanceAssertions: string[];  // §4.3 — assertion NAMES only, not their logic
  heldFieldsNote: string;          // §4.4 — may be "not yet curated" — still non-empty
}
```

### 4.2 Length — never a hand-typed duplicate of a number that can drift

```ts
// Recipes with a KNOWN, code-cited constraint that lengthProfile() does not cover.
// Each entry names its OWN source line so a drift is traceable, not silent.
// TEMPORARY per-key snapshot — superseded the moment Package 4 (or a follow-up) exports
// a real LengthProfile-shaped constant for the invitation branch (see plan §1.5).
const RECIPE_LENGTH_NOTES: Partial<Record<RecipeKey, string>> = {
  "open-house":
    "Roughly 15-35 words for the invitation paragraph (shared.ts:602, dated 08/12/2026 — " +
    "NOT lib/narratives/length.ts's area-email 50-125 band, which governs a different recipe family).",
};

function lengthNoteFor(recipeKey: RecipeKey): string {
  // review-reply is the ONE recipe wired to the validated baked system (area-read.ts) —
  // it is the only key where "area-email" is the TRUE governing surface (handoff §1b).
  if (recipeKey === "review-reply") {
    const p = lengthProfile("area-email");
    return `${p.instruction} (validated by validateNarrative(), lib/narratives/validate.ts).`;
  }
  const known = RECIPE_LENGTH_NOTES[recipeKey];
  if (known) return known;
  return "No code-enforced length rule is on record for this recipe yet — do not invent one; " +
    "if asked, say so rather than guessing a band.";
}
```

**Why this is not the same duplication risk the research warns about:** the failure mode is a
number *drifting silently* while still being cited as current. Every entry here names its own
source line (so a human catching the drift knows exactly what to check), and the DEFAULT for any
key not listed is an honest **absence** statement, not a guess. This is the plan's own worked
example of the abstention behavior the whole package is trying to produce.

### 4.3 Playbook summary + acceptance assertions — one populated example, sixteen honest stubs

```ts
// Short, hand-maintained. NOT a live parse of email-build-playbook.md at request time —
// deliberately rejected: the playbook is 3,200+ lines, a runtime fs.readFileSync of it per
// request is fragile to heading renumbering and wasteful, and a doc-parse failure would be a
// SILENT empty Feed 2 (exactly the failure mode this package exists to prevent). A short
// constant that cites its source line is the safer trade — see plan §1.5/§2.
const PLAYBOOK_SUMMARY: Partial<Record<RecipeKey, string>> = {
  "open-house": "An invitation to a specific open house moment (date/time is always human-typed, " +
    "never sourced from a vendor). ONE feature in plain words, never a number. Chart policy: none. " +
    "Single CTA: RSVP. (email-build-playbook.md §2.6, drafted 08/12/2026.)",
};

function playbookSummaryFor(recipeKey: RecipeKey): string {
  return PLAYBOOK_SUMMARY[recipeKey] ??
    "No playbook §2.x write-up is on record for this recipe yet — describe only what the " +
    "RECIPES registry and held-fields note below actually state.";
}

// Assertion NAMES only (strings), read from the acceptance script — never its assertion LOGIC,
// which would be a second copy of pass/fail behavior that could disagree with the real one.
const ACCEPTANCE_ASSERTIONS: Partial<Record<RecipeKey, string[]>> = {
  "open-house": [
    "1 · street line PRESENT", "2 · ZIP PRESENT",
    "3 · NO invented day/date/time when NONE was supplied",
    "4 · the moment's CARD matches what was supplied", "5 · price IS the list price",
    "6 · NO chart (policy none)", "7 · CTA is the RSVP button",
    "8 · description, when held, ships AFTER the narrative",
  ],
};
```

**Honest gap, stated not hidden:** only `open-house` and (partially, for length) `review-reply` are
populated at plan time. The other 15 registry keys fall through to the generic strings above. This
is sufficient for the non-empty-per-key test (§6) because "no rule/summary on record for this
recipe" is real, true, non-empty content — it is NOT the silent-empty-object failure mode named in
the research (§F of the grounding research file), because the AI is told *why* it has nothing to
cite, not left to infer grounding from an empty field.

### 4.4 Held data fields — type-checked against the real `ListingFacts`, not re-typed

```ts
import type { ListingFacts } from "@/lib/email/listing-scrape"; // read-only import

// Field NAMES only — stable across a value's drift (a number can go stale; a field's EXISTENCE
// in the type does not). Keys are `keyof ListingFacts`, so renaming a field in listing-scrape.ts
// is a TypeScript compile error here, not a silent drift.
const HELD_FIELDS: Partial<Record<RecipeKey, { field: keyof ListingFacts; note: string }[]>> = {
  "open-house": [
    { field: "address", note: "free spine — ships in full" },
    { field: "price", note: "free spine (daily sweep) — the ask, never a sold price" },
    { field: "openHouseDate", note: "NEVER a vendor field — lane-4, human-typed only; absent unless supplied" },
    { field: "openHouseTime", note: "NEVER a vendor field — lane-4, human-typed only; absent unless supplied" },
    { field: "beds", note: "free spine → paid row" },
    { field: "baths", note: "free spine → Lee records → nearby-values → paid row" },
    { field: "sqft", note: "free spine → paid row" },
    { field: "photos", note: "free spine photo_url, mirrored → paid row → none" },
    { field: "remarks", note: "paid-row gap-fill only — often absent; when held, ships verbatim, never summarized by the interactive AI" },
  ],
};

function heldFieldsNoteFor(recipeKey: RecipeKey): string {
  const fields = HELD_FIELDS[recipeKey];
  if (!fields) {
    return "Per-field provenance is not yet curated for this recipe. Fall back to the base " +
      "system prompt's four-lane sourcing rule (lake → upload → cited web → [Need: …]).";
  }
  return fields.map(f => `${f.field}: ${f.note}`).join("; ");
}
```

---

## 5 — CACHE PLACEMENT

**Per the research file's Topic 3 (`_RESEARCH/agent-behavior/2026-08-12-build-time-ai-grounding-outlines-critic-context-caching.md`)
and the fuller companion (`2026-08-12-grounding-abstention-and-context-injection.md` §E):** Anthropic
prompt caching covers `tools` → `system` → `messages` in that order, up to a `cache_control`
breakpoint; static content goes first. Applied here:

```ts
system: [
  { type: "text", text: STATIC_BASE_SYSTEM_PROMPT + feed1Prose + feed2Block,
    cache_control: { type: "ephemeral" } },   // ← breakpoint AFTER both feeds
  // (nothing volatile belongs inside this same block — see below)
]
```

**Feed 1 and Feed 2 both sit AHEAD of the volatile document** (`doc`/`currentTokens`, the user's
live `prompt`) and behind ONE breakpoint — not two, because both feeds are equally static for the
duration of one editing session (a user doesn't switch `projectId`/`recipeKey` mid-turn).

**EXPLICITLY NOT BUILDING THIS NOW.** Per the handoff's own failure-mode (a) — *"latency/cost is a
KNOWN, ACCEPTED cost right now, not a blocker… do not build a caching layer up front… operator,
verbatim: 'we will switch to sonnet when we actually have users if we have to.'"* — this plan
documents WHERE the breakpoint would go (so a later session doesn't have to re-derive it) without
implementing `cache_control` in this package. Interactive mode stays on Haiku by default
(`resolveEmailModel`, §1.9), unchanged.

**One number worth carrying forward, not acting on:** Haiku 4.5 needs the cached prefix to clear
~4,096 tokens before it caches at all (research §E). Feed 1 (11-field prose) + Feed 2 (per-recipe
constraint set) combined are unlikely to reach that floor on their own for most recipes — meaning
**if caching is added later, Feed 1+2 alone may be too small to benefit**, and the existing base
system prompt (`contentPatchSystem`'s fixed text, :467–489) would need to sit inside the same cached
block to clear the floor. Flagged for whoever builds the caching layer later; not a reason to change
anything now.

---

## 6 — FAILURE MODES → GUARDS

| # | Failure mode | Guard | Mechanism |
|---|---|---|---|
| 1 | Path/no-`projectId` silently inherits the last-opened project | §3.1's algorithm has NO fallback branch at all — absence of `projectId` returns `undefined` before any DB read | Unit test: `resolveFeed1(undefined)` → `undefined`, assert zero Supabase calls (spy) |
| 2 | A future in-memory cache of `gatherEmailLabProjectDigest` reintroduces cross-request leakage | The reused `projectPageContextForPath` guard runs even though vacuous today — a caching bug degrades to "no context," not "wrong context" | Test: fake a stale digest object (`projectId` mismatched to the requested id) fed through the guard → asserts `undefined`. **Named honestly (not eliminated):** this test exercises the reused guard function in isolation; it does NOT prove today's real request path can produce a mismatch (it can't — no cache exists), so it is a regression guard for a FUTURE change, not evidence against today's design |
| 2b | `EmailLabGridShell`'s `projectId` PROP itself goes stale across a client-side transition between two projects, independent of any server cache (§3.1a) | `EmailLabGridShell` is keyed `grid-${buildKey}` (`ProjectEmailLabClient.tsx:682`), not `grid-${id}-${buildKey}` — **NOT closed by this package** (Package 1's file); recommended one-line fix named in §3.1a | Not testable from `route.ts`/new files alone — needs a browser-level trace or a fix in `EmailLabGridShell.tsx`. Flagged as an open residual risk, not silently assumed safe |
| 3 | Resolver silently returns empty for an unknown/renamed `recipeKey` | Every lookup function (`lengthNoteFor`, `playbookSummaryFor`, `heldFieldsNoteFor`) has a **non-empty fallback string**, never `""`/`undefined` | Unit test: iterate `RECIPE_KEYS.filter(k => RECIPES[k].target !== "social")`, assert every constraint field is a non-empty string |
| 4 | Feed 2 cites a drifted numeric constraint (e.g. wrong length band for a recipe) | Every hand-maintained note names its OWN source file:line (§4.2/§4.3); `review-reply` reads the real `lengthProfile()` call, never a copy | Code review convention (no automated drift-detector — flagged as a known gap, not built) |
| 5 | Grounding claimed but never exercised — the AI still confabulates on "why don't I have X" | A promptfoo/factuality abstention case (§7) | Eval case, not just a unit test — the failure is behavioral, not structural |
| 6 | Abstention Inflation — the model over-hedges on fields it genuinely could answer, once the "held fields" list exists in the prompt (research §B, arXiv:2507.16199) | A matched NEGATIVE-negative eval case (a field that IS held) alongside the abstention case, per §7 | Same eval file, two cases |
| 7 | Premature termination on a bloated combined prefix (research §A, arXiv:2606.29718) — a distinct failure from confabulation | Not guarded in this package (Feed 1+2 are small by design — §4.3's "short, hand-maintained" choice); named as an open risk if Feed 1/2 grow later | Flagged, not built — see Open Questions |
| 8 | `lib/email/build-doc.ts` edit collides with another live session | Flagged at the top of this plan; RULE 1.5 worktree isolation if it happens | Process guard, not code |
| 9 | `EmailLabGridShell.tsx`'s four call sites never get the one-line `projectId` addition, so Feed 1 never fires in production | Feed 1 degrading to `undefined` is the SAFE default (identical to today) — not a silent wrong answer, an honestly absent one | Documented follow-up, not blocking |

---

## 7 — TDD SEQUENCE

**New test files** (colocated, matching repo convention — e.g. `type-conformance.test.ts` sits next
to `scale.ts`):

1. `lib/email/lab-ai-project-context.test.ts`
   - `resolveFeed1(undefined)` → `undefined`; assert the Supabase client mock's `.from` was never
     called (proves "no guess," not just "happens to return undefined").
   - `resolveFeed1("real-id")` with a mocked `gatherEmailLabProjectDigest` returning a digest whose
     `projectId` MATCHES → returns the `describePage` prose string (non-empty, contains the
     project's title).
   - **Discriminating test (post-advisor correction — replaces a fake-mismatch test that today's
     real path can't produce, per §3.1a):** simulate the standalone mount — `resolveFeed1(undefined)`
     from a request shaped like `app/email-lab/grid`'s real call sites (§3.1a: confirmed by grep,
     `EmailLabGridClient.tsx:435` never sets `projectId`) → `undefined`, zero `.from` calls. This is
     the ACTUAL "path names no project" case exercised end-to-end, not a synthetic one.
   - `resolveFeed1("real-id")` with a mocked `gatherEmailLabProjectDigest` returning a digest whose
     `projectId` MATCHES → returns the `describePage` prose string (non-empty, contains the
     project's title).
   - **Guard-in-isolation test (relabeled — this does NOT prove today's request path can leak, only
     that the reused guard function still fires correctly if it's ever asked to):** feed
     `projectPageContextForPath` a digest whose `projectId` does NOT match the requested id directly
     (bypassing `resolveFeed1`) → asserts `undefined`. Documented in the test's own comment as a
     regression guard for a FUTURE caching change (§6 guard #2), not evidence against today's design.
   - `gatherEmailLabProjectDigest("id-owned-by-someone-else", ...)` with a Supabase mock returning
     no row (RLS denial simulated) → `null` → `resolveFeed1` returns `undefined`.

2. `lib/email/lab-ai-recipe-constraints.test.ts`
   - **Non-empty-for-every-key test (guard #3, corrected to cover ALL 19, per advisor):**
     `for (const key of RECIPE_KEYS) { const c = resolveRecipeConstraints(key); assert every string
     field is non-empty }` — **no filter.** The resolver is TOTAL over `RECIPE_KEYS`
     (`lib/deliverable/recipes.ts:51`, all 19), including `social-pack`/`social-cut` (confirmed live
     08/12/2026: both declare `target: "social"` explicitly, `recipes.ts:498,511` — `target` is
     optional on the `Recipe` interface, so this is checked by value, not inferred from the field's
     mere presence). A second assertion notes social keys never reach `/api/email-lab/ai` in
     practice (they route through `/api/email-lab/social/generate`) but still resolve honestly if
     ever queried — cheaper than maintaining a filtered subset and immune to the filter silently
     passing if a future recipe omits `target`.
   - `resolveRecipeConstraints("open-house")` → asserts `chart === "none"`, `lengthNote` contains
     "15-35" and does NOT contain "50-125" (regression guard for the §1.5 drift specifically), all
     8 assertion names present verbatim.
   - `resolveRecipeConstraints("review-reply")` → `lengthNote` matches `lengthProfile("area-email")`'s
     `instruction` string exactly (proves it's read live, not hand-copied).
   - An unlisted key (e.g. `"community-info"`) → `heldFieldsNote` contains the literal phrase "not
     yet curated" (proves the honest-absence path, not a silent empty string).

3. **Factuality/abstention eval** (`promptfoo` — **confirmed present**, `node_modules/promptfoo`
   and `node_modules/.bin/promptfoo.exe` both exist in this repo, so §9's acceptance command is
   runnable, not aspirational; no existing eval config was found to match convention against — this
   is a new config file). Per the research's §G methodology — needs BOTH a true-negative and a
   true-positive case to avoid Abstention Inflation passing for the wrong reason, per guard #6.
   **Case A's prompt corrected post-advisor review** — `contentPatchSystem` is JSON-patch-only, no
   free-text reply channel (§1.8); "why don't I have X" is not a request this surface can answer in
   prose, so the eval must target what the surface actually does:
   - Case A (abstention): a real fill request — "add the year built to the stats" — on an
     `open-house` build where Feed 2's `heldFieldsNote` does not list `yearBuilt` → assert the
     model's returned JSON patch either omits that field or writes `[Need: year built]`, never a
     guessed year (this exercises the SAME lane-4 instruction already in `contentPatchSystem`,
     :475–480 — Feed 2's job is making the model MORE reliably honest about which fields it's
     entitled to guess at, not adding a new refusal behavior).
   - Case B (negative-negative, guards inflation): "what's the list price?" where Feed 2's
     `heldFieldsNote` DOES list `price` as held and the doc already carries a real price value →
     assert the model does NOT hedge/refuse to state it.
   - Both cases run against the real `contentPatchSystem` + Feed 1/2 injection once §1's flagged
     `build-doc.ts` edit lands — **this test cannot be written against `route.ts` alone**, another
     concrete reason build-doc.ts must be in scope (ties back to the top-of-plan flag).

4. **`build-doc.ts` threading test** (once in scope): `contentPatchSystem(lakeContext, hasChart,
   voice, feed1Prose?, feed2Block?)` — a snapshot-style test asserting the returned system string
   contains both feeds when supplied and is byte-identical to today's output when both are omitted
   (protects the "zero call edges" default behavior for every other lane that doesn't pass them).

---

## 8 — STEP-BY-STEP EDIT LIST

**Confined to:** `app/api/email-lab/ai/route.ts`, `lib/email/build-doc.ts` (flagged, §top), plus
new files. `lib/project/digest.ts`, `lib/chat/page-context.ts`, `lib/deliverable/recipes.ts`,
`lib/narratives/length.ts`, `lib/email/listing-scrape.ts` are all **read-only imports**, never
edited.

1. New file `lib/email/lab-ai-project-context.ts` — `gatherEmailLabProjectDigest` (§3.2) +
   `resolveFeed1` (§3.1).
2. New file `lib/email/lab-ai-project-context.test.ts` (§7.1).
3. New file `lib/email/lab-ai-recipe-constraints.ts` — `RecipeConstraints` type, the three lookup
   functions (§4.2–4.4), `resolveRecipeConstraints(recipeKey)`.
4. New file `lib/email/lab-ai-recipe-constraints.test.ts` (§7.2).
5. `app/api/email-lab/ai/route.ts` — add `projectId?: string` to the request body type (:90–113);
   call `resolveFeed1`/`resolveRecipeConstraints` when `body.doc !== undefined` (the block-canvas
   branch) and `body.recipeKey` is present; pass both through to `buildContentDoc`/`authorDoc`'s
   call signature as new optional args (threaded, not required — every existing caller with no
   `projectId`/no `recipeKey` behaves byte-identically).
6. `lib/email/build-doc.ts` — extend `contentPatchSystem(lakeContext, hasChart, voice)` to
   `contentPatchSystem(lakeContext, hasChart, voice, feed1Prose?, feed2Summary?)`, appending both as
   new sections (mirroring the existing `voiceBlock`/`dataBlock` pattern already in that function —
   same additive style, not a rewrite) — cached breakpoint noted per §5 but NOT implemented. Thread
   the two new optional params through `authorAddedSlots`'s `opts` and `fillSkeletonResult`'s args.
7. New test `lib/email/build-doc.contentpatchsystem-feeds.test.ts` (§7.4).
8. Draft-only: this plan's §2 prose, for whoever next holds `docs/standards/email-build-playbook.md`.

**Explicitly NOT in this package:** `components/email-lab/EmailLabGridShell.tsx` (Package 1's file
— the four-call-site `projectId` wiring is a follow-up, named in §top and §6 guard #9).

---

## 9 — ACCEPTANCE

```
bun test lib/email/lab-ai-project-context.test.ts
bun test lib/email/lab-ai-recipe-constraints.test.ts
bun test lib/email/build-doc.contentpatchsystem-feeds.test.ts
```
All green, pasted output required before calling this package done (RULE 0.8).

```
bunx promptfoo eval -c <new eval config for the two abstention cases>
```
**`promptfoo` confirmed present** (`node_modules/promptfoo`, `node_modules/.bin/promptfoo.exe` —
checked live 08/12/2026; no existing eval config found elsewhere in the repo to match convention
against, so the config file itself is new). Both cases pass — Case A abstains/writes `[Need: …]`,
Case B states the held price without hedging.

**Manual, once `build-doc.ts` lands the threading:** run
`bun --env-file=.env.local scripts/email/render-open-house.mts` (Package 4's harness, read-only
here) and confirm it still passes all 8 assertions byte-for-byte unchanged — proves the Feed 1/2
threading did not touch the recipe-narrator path (a different call site entirely, per §1.8).

---

## 10 — OPEN QUESTIONS FOR THE OPERATOR

1. **`lib/email/build-doc.ts` scope expansion** — confirm before coding: is it safe to add this
   file to Package 3, or should the two `contentPatchSystem` call sites be threaded some other way
   that avoids it? (No other live package claims it, per the grep in §top, but it wasn't in the
   original file list.)
2. **`RECIPE_LENGTH_NOTES`'s temporary open-house entry** (§4.2) — once Package 4 lands a real
   `LengthProfile`-shaped export for the invitation branch, should Feed 2 read that constant
   directly (my recommendation) or keep its own independent note? Flagging so the two packages'
   authors coordinate rather than silently duplicate.
3. **Should Feed 1/2 wire into `authorDoc`'s dispatch path** (the "build with AI" full-compose
   lane, which does NOT currently route through `contentPatchSystem` for its main build — it
   dispatches to a recipe builder like `buildOpenHouse` directly) **or only the patch-writing lane**
   (`fillSkeletonResult`/`authorAddedSlots`)? This plan scopes to the patch-writing lane only,
   because that's the literal "AI you talk to while editing" surface the handoff names — but the
   full-compose lane's `authorAddedSlots` call (only fires when a user adds a block to a saved
   layout, §build-doc.ts:1184–1194) already benefits from this design since it shares
   `contentPatchSystem`. Confirm this scoping matches intent.
4. ~~**Eval infrastructure**~~ — **RESOLVED this session:** `promptfoo` is present
   (`node_modules/promptfoo`), no existing config to match convention against, so §7 Case A/B is a
   new config file, not a new dependency.
5. **The `EmailLabGridShell` key-staleness residual risk (§3.1a, §6 guard #2b)** — is it worth a
   one-line `key={`grid-${id}-${buildKey}`}` fix in `ProjectEmailLabClient.tsx:682` NOW (even though
   that file belongs to Package 1) given it's the cheapest possible closure of the ONE failure mode
   this whole package was written to prevent, or should it wait for Package 1's own pass so the two
   sessions don't collide on the same file? This plan does not implement it either way — flagging
   the tradeoff for the operator to route.
