# HANDOFF — Open House gaps + grounding the build-time email AI

**Written 08/12/2026.** Everything in §1 was verified this session with real tool calls — code
reads, hosted-Graphify queries, live `git log`. **Do not re-investigate §1.** A long debugging
conversation produced answers that sounded uncertain and reversed mid-session; this document exists
so the next session executes instead of re-deriving. §3 is new crawl4ai research (08/12/2026). §4
is the build plan with failure modes (RULE 3.5 gate). Note before touching Open House:
`email-build-playbook.md` §2.6 is marked **owed** — it matters to §4 Step 3.

---

## 1 — WHAT IS CONFIRMED (settled; cite, don't re-check)

### 1a. The invitation narrator has no code-level guard at all

`lib/deliverable/recipes/shared.ts` (~lines 580–617, the `opts.invitation` branch) tells the model
to write *"a warm greeting, AT MOST ONE feature… then the ask."* **Nothing checks the output** — no
word count, no check that an ask is even present. Live proof this session: two generations off the
same house, one closing on an invitation (*"…you really have to see it in person"*), one on *"…is
something else"* with no ask at all.

The acceptance script doesn't cover it either. `scripts/email/render-open-house.mts` carries
**eight** assertions read off rendered HTML — street line present · ZIP present · no invented
day/date/time when none supplied · the moment's card matches what was supplied · price is the list
price · no chart (policy none) · CTA is the RSVP button · description ships after the narrative.
**None asserts length or the presence of an ask.**

### 1b. A working length/no-invention validator exists — 1 of 17 email recipes uses it

`lib/narratives/validate.ts` `validateNarrative()` is a real pass/fail gate (min/max chars,
no-invented-numbers, as-of-date-once) — but gates only the **baked** system
(`scripts/bake-narratives.mts`, surfaces `zip` and `area-email`). Only **`review-reply.ts`** is
wired in, via `bakedAreaRead()` (`lib/narratives/area-read.ts`), confirmed by a full-codebase grep
of its callers. Every other recipe, Open House included, makes an unguarded live model call.

`lengthProfile()` (`lib/narratives/length.ts`) applies the EMAIL profile only when
`surface === "area-email"`; everything else gets the REPORT profile (200 words). **Correct scoping,
not a bug** — it first looked like "emails get the report length." The defect is reach: 1 of 17
recipes is inside the validated system. The 50–125 word band is real and email-specific
(`_RESEARCH/email-and-social/2026-08-03-email-length-and-per-type-benchmarks.md`, crawled
08/03/2026, Boomerang response-rate data).

### 1c. There is no way for a real user to set an open-house date/time

`ListingFacts.openHouseDate`/`openHouseTime` (`lib/email/listing-scrape.ts:45-46`) are written in
**exactly one place in the repo**: `scripts/email/render-open-house.mts:88-89`, reading CLI
`argv[3]`/`argv[4]`. Zero UI, zero routes, zero popups write them — only a developer running a
script by hand can set a real one today.

**The pattern to reuse exists for another field.** `AddressPopup`
(`components/lab-entry/AddressPopup.tsx`) + `planSeedStart`/`ArrivalPlan` (spec:
`docs/superpowers/specs/2026-07-16-seed-capture-or-blank-design.md`) already do "ask once before
build, save it, never re-ask," and `EmailLabGridShell.tsx`'s `buildAfterBrand` already drives its
generic brand-gap-fields mode. **Extend that. Do not invent new plumbing.**

### 1d. Moving the RSVP button beside the date/time card is safe

`dateTimeCard()` (`lib/deliverable/recipes/open-house.ts:124`) has exactly **one caller**
(`buildOpenHouse()`, same file, :175) and **one callee** (`createBlock()`,
`lib/email/doc/default-docs.ts:177`) — hosted Graphify-X `gx_impact`, same repository/commit as
§1f. No wider ripple.

### 1e. `button_destinations` was never wired into the profile ledger — it wasn't removed

Operator-decreed 08/03/2026 (*"the agent can change all links and should be able to save that in
their brand"*). Real DB column (`Json`, `docs/sql/20260803_button_destinations.sql`), fully built
role-keyed system (`BUTTON_ROLES`, `lib/email/button-destinations.ts`), read correctly by both send
paths (`app/api/deliverables/[id]/blast/route.ts`, `app/api/lab/claim-and-send/route.ts`) via
`roleDestinationsFromBrand`.

It is **not** in `PROFILE_FIELDS` (`lib/brand/profile-ledger.ts`), so `applyUserBrandToProject`'s
account→project carry (`PROJECT_CARRY_KEYS`) silently drops it. Full git-history search on that
file: **zero hits for `button_destinations` in any commit, ever.** Never removed — never added.

Two legitimate fixes: **(A) ledger** — add it to `PROFILE_FIELDS` + `PROJECT_CARRY_KEYS`; correct
long-term, but touches the carry path every project inherits. **(B) bypass** — read it off the
account row directly (`SELECT *`, then `roleDestinationsFromBrand`), exactly as the send paths do
today; narrower and production-proven.

### 1f. The build-time email AI and the project chat AI are structurally disconnected

`app/api/email-lab/ai/route.ts` (the AI you talk to while editing an email) parses ONLY: `prompt`,
`doc`, `currentTokens`, `scope`, `mode`, `chartType`, `build`, `recipeId`, `recipeKey`,
`useSavedLayout` (request-body type, ~lines 90–113). **It already carries `recipeKey`** (5
references) — it knows which email it is editing. It is never given the data-roots catalog, the
recipe's playbook section, or the recipe's acceptance assertions — so it cannot answer *"why don't
I have X"* or *"add ~100 characters"*.

**It is NOT the same as Project AI — graph evidence, not an assumption.** `buildProjectDigest()`
(`lib/project/digest.ts:300`) has exactly **3 callers**: `ProjectWorkspace.tsx:477`,
`app/project/page.tsx:106`, `lib/project/other-projects.ts:100`. None is the email-lab route — zero
call edges. Verified via `gx_callers` on the **HOSTED** Graphify-X index
(`ethanrickyjrjr-wq/SWFL-Data-Gulf`, commit `658c25ba5aecedade7dfaa1dfb9f79e0e2dd0759`), not the
local gitignored `graphify-out/graph.json`, stale by policy (RULE 0.5).

`ProjectDigestInput` is rich (items, deliverables, schedules, branding, `recentActivity`,
`significantChanges`, `activeEvents`, `feedSignals`) and is a plain data-aggregation function —
**no LLM call inside it** — so a second caller is low-risk. **Operator's chosen direction: reuse it,
don't build a third context mechanism** (§4 Step 3 — digest as one feed, recipe constraints as the
second, into the existing email-build call; "one AI, two feeds," not a merge, RULE 0.9).

*Precision note:* grep of `lib/assistant/` for `buildProjectDigest`/`ProjectDigest` (08/12/2026)
returned **zero hits** — no direct reference there. That does not prove chat never receives the
digest (`ProjectWorkspace.tsx:477` could pass it in); that routing question is open. Don't cite
`converse.ts` as an existing consumer.

**RESOLVED 08/12/2026 (same day, later session) — chat DOES receive project context, and the
zero-hit grep was a NAME collision, not an absence.** The type is renamed twice on the way, which is
why searching for `ProjectDigest` inside `lib/assistant/` finds nothing. The full chain, every hop
read this session:

`ProjectWorkspace.tsx:477` `buildProjectDigest()` → `<ProjectAiContextBridge digest={…}>`
(`app/project/[id]/workspace/ProjectAiContextBridge.tsx`) → `setAiContext()` into the module-level
bus `lib/project/ai-context-store.ts` → `useAiContext()` (`components/briefcase/use-ai-context.ts`,
`useSyncExternalStore`) → `projectPageContextForPath()` (`lib/chat/page-context.ts:202`) → a
**compact 11-field `ProjectPageContext`** → rendered to prose by `describePage` → arrives at
`lib/assistant/converse.ts:42` as **`pageContext?: string`** — a plain-English string, not an object.

**This CHANGES Step 3's Feed 1 — do not inject the raw digest.** The established, shipped pattern
already does three things the naive "call `buildProjectDigest()` and pass it in" does not:

1. **It PROJECTS before it injects.** `ProjectPageContext` carries 11 fields (title, scope,
   itemCount, kindCounts, freshnessToken, freshnessIsNew, hasEmailSchedule, branding,
   recentActivity, and `significantChanges`/`activeEvents` **sliced to 3**). The rich
   `ProjectDigestInput` never reaches the model. That is context-rot discipline (§3) already in
   code — copy the projection, don't bypass it.
2. **It carries a STALE-PROJECT LEAK GUARD, and Step 3 needs an answer for it.**
   `projectPageContextForPath` returns `undefined` when `digest.projectId !== projectIdFromPath(path)`,
   because the module store survives route changes and can still hold project A's digest while the
   path is already project B. **The email lab's path may not name a project at all** — so the
   email-lab caller must resolve which project a build belongs to explicitly, or it inherits
   whatever project was last opened. This failure mode is NOT in §4 Step 3's list and it is the
   one most likely to ship silently: the AI would confidently describe the wrong project's data.
3. **It hands the model prose, not JSON.** Match that shape or justify diverging.

Net: Feed 1 is still REUSE, and still adds the first call edge — but reuse the **projection +
guard**, not just the aggregation function.

`lib/assistant/` DOES have coded no-invention/gap discipline — 11 files (`web-fallback.ts`,
`report-path.ts`, `conversation-path.ts`, `comp-source-lake.ts`, …) grounded in
`refinery/lib/rules-of-engagement.mts`. The email-lab build AI has **no equivalent gate**. Same
failure family, two code paths — one proven, one not.

### 1g. Why the narrator is constrained (asked and answered in-session)

Each constraint traces to a specific bad output caught and corrected: invented "evening light,"
invented golf-course mileage, HOA-leverage coaching inside an invitation. Not arbitrary. Whether
*"at most one feature, 15–35 words"* is still the right band is **open, per-constraint** — revisit
individually, never as a blanket loosen.

---

## 2 — THE ONE OPEN DECISION (blocked on Ricky, do not invent)

**What does the RSVP button actually DO** — for the clicker, and for the agent? Undecided in the
operator's own words; needs his answer before any schema is written. Three shapes to put to him:

1. **Mailto, reply-only (zero build).** Prefilled `mailto:` to the agent. Clicker: their mail
   client. Agent: an email. No DB, no lead record. Ships today.
2. **Lead-capture page (medium build).** Hosted RSVP form (name, email, party size) → writes a row,
   notifies the agent. Clicker: a confirmation. Agent: a logged lead. Needs table + route + send.
3. **Calendar invite (medium build).** Returns an `.ics`. Clicker: it lands on their calendar.
   Agent: nothing, unless paired with (1) or (2).

Decided, not open: the **bottom button links to the realtor.com listing** ("More about this
property").

---

## 3 — RESEARCH (crawl4ai, run 08/12/2026; not in `_RESEARCH/` yet — see §6)

**Topic 1 — grounding a build-time AI in structural constraints.**
- *Outlines* (github.com/dottxt-ai/outlines): most solutions "fix bad outputs **after** generation
  using parsing, regex, or fragile code"; Outlines "**guarantees structured outputs during
  generation**." Constrained decoding fixes *shape* (JSON/schema/grammar) — not prose length or
  "must contain an ask," which are semantic, not grammatical.
- *Self-Refine* (arXiv:2303.17651, Madaan et al., v2 25 May 2023 — title/authors verified in the
  crawled abstract): generate → self-critique → refine, no training; "~20% absolute" average gain
  across 7 tasks. The retry loop with the model as its own critic.
- *CRITIC* (arXiv:2305.11738, Gou et al., ICLR 2024): the model "interacts with appropriate tools to
  evaluate certain aspects of the text, and then revises the output based on the feedback" —
  emphasis on **external** feedback over self-critique. The literature analogue of wiring a
  validator into the loop, and an argument that our deterministic `validateNarrative()` is the
  *stronger* form.
- **Honest gap:** no crawl this session returned a specific, citable write-up of "linters wired into
  AI code-review loops" or "form-filling assistants grounded against a schema." Not researched, not
  invented. If that evidence is wanted, it needs its own crawl pass.

**Topic 2 — anti-hallucination / say what you don't know.** External practice **validates** our
existing doctrine (`refinery/lib/rules-of-engagement.mts`); it does not challenge it.
- Anthropic, *Reduce hallucinations*
  (platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations):
  explicit permission to say "I don't know" ("drastically reduce false information"); ground in
  **direct quotes** pulled before the task; verify with citations — "if it can't find a quote, it
  must retract the claim"; restrict to the provided documents only.
- *Sufficient Context* (arXiv:2411.06037, Joren et al., v3 23 Apr 2025): strong models "excel when
  the context is sufficient, but **often output incorrect answers instead of abstaining when the
  context is not**"; their selective-generation method improves correct-answer fraction 2–10%.
  **Implication:** an unguarded email-lab AI asked "why don't I have X" confabulates by measured
  default — the fix is supplying the sufficiency signal, i.e. §4 Step 3.

**Topic 3 — broad project context + narrow per-task constraints, cheaply.**
- Anthropic, *Effective context engineering for AI agents*
  (anthropic.com/engineering/effective-context-engineering-for-ai-agents): context is "a finite
  resource with diminishing marginal returns," subject to **context rot**; aim for "the **smallest
  possible set of high-signal tokens**." The named pattern is a **hybrid** — "CLAUDE.md files are
  naively dropped into context up front, while primitives like glob and grep allow it to… retrieve
  files just-in-time." Applied here: per-recipe constraints small and always-on; the broad digest
  coarse, not exhaustive.
- Anthropic, *Prompt caching* (platform.claude.com/docs/en/build-with-claude/prompt-caching):
  caching covers `tools`, `system`, `messages` **in that order** up to the `cache_control`
  breakpoint; **5-minute** default TTL refreshed free on each hit, **1-hour** available; **cache
  reads 0.1× base input**, 5-min writes 1.25×, 1-hour writes 2×; put static content first. So both
  feeds belong **ahead** of the volatile doc, behind a breakpoint.

All seven pages crawled 08/12/2026 via crawl4ai.

---

## 4 — BUILD PLAN, IN ORDER (each step: files + failure modes + guard)

**Step 1 — Capture open-house date/time in the UI (unblocks everything else).**
Files: `components/lab-entry/AddressPopup.tsx` (extend its generic gap-fields mode),
`components/email-lab/EmailLabGridShell.tsx` (`buildAfterBrand`), the `ArrivalPlan`/`planSeedStart`
path, then thread into `ListingFacts.openHouseDate`/`openHouseTime`.
*Failure modes → guards:* (a) popup re-asks every build → persist on the project/seed, assert "ask
once" in the arrival test; (b) free text becomes an invented date downstream → validate as a real
date at capture; assertion 3 in `render-open-house.mts` already fails on invented day words, keep it
green; (c) user skips → the card must be omitted, not guessed — assertion 4 covers this today.

**Step 2 — Layout: RSVP button beside the date/time card; bottom button → realtor.com listing.**
Files: `lib/deliverable/recipes/open-house.ts` (`dateTimeCard()` :124, `buildOpenHouse()` :175);
blast radius per §1d. For the bottom button prefer **fix (B)** (§1e) — read `button_destinations`
off the account row via `roleDestinationsFromBrand`, as the two send routes already do: narrow and
production-proven. File fix (A) as the follow-up so the carry ledger stops dropping the column.
*Failure modes → guards:* (a) recipe writes a position (recipes never position) →
`design-system-reachability.test.ts` already fails on a `layout:` literal; express "beside" via
span/order, not coordinates; (b) `applyBrand`'s single global `website_url` override clobbers the
realtor.com URL (`emails.md` §0.1d) → assert the rendered `href`, don't trust the recipe's value;
(c) two buttons read as two CTAs → RSVP stays the single primary, the bottom link is secondary
(same reasoning as the community button, §0.1c).

**Step 3 — Ground the email-lab AI: ONE AI, TWO FEEDS (operator's chosen architecture).**
Files: `app/api/email-lab/ai/route.ts` + `lib/project/digest.ts:300`.

*Feed 1 — project context, by REUSE.* Call the existing `buildProjectDigest()` from `route.ts` —
a second caller of a plain aggregation function, not a new system (§1f). Do **not** build a parallel
context mechanism; do **not** merge the two AI products.

*Feed 2 — this recipe's rules.* One small server-side resolver: `recipeKey` → { length profile
(`lib/narratives/length.ts`), the recipe's playbook section, its acceptance assertion names
(`scripts/email/render-*.mts`), and which data fields it actually holds
(`docs/standards/data-roots.md`) }. Inject as a cached system prefix (§3), carrying the
rules-of-engagement gap language (`refinery/lib/rules-of-engagement.mts`) so the AI says "I don't
have this, here's how to get it" instead of confabulating (Sufficient Context, §3).
**Prerequisite:** playbook §2.6 (Open House) is *"BUILT IN CODE, SECTION OWED"* — writing that prose
section is part of this step, not someone else's precondition.
*Failure modes → guards:* (a) **latency/cost — a KNOWN, ACCEPTED cost right now, not a blocker.**
The digest assembles items, deliverables, schedules, branding and activity, while interactive edit
mode defaults to **Haiku for speed** (`route.ts:95`: *"interactive" (default → Haiku) |
"quality"/"snicklefritz" (Sonnet) | "max" (Opus)*) — so it adds real assembly time. **At pre-launch
volume that is accepted** — operator, verbatim: *"we will switch to sonnet when we actually have
users if we have to."* **Do not build a caching layer up front.** Ship digest reuse + constraint
injection plainly; revisit when there is traffic to measure. Mitigation when volume justifies it:
raise the interactive tier, or cache the digest once per build session instead of per edit call.
(b) injected block bloats every turn → measure tokens, put both feeds behind a `cache_control`
breakpoint ahead of the volatile doc (0.1× reads, §3); (c) if caching is added later, a stale digest
describes a deliverable the user just changed → guard *then*: bound the TTL, invalidate on
build/save (no cache today = no stale risk today); (d) resolver silently returns empty
for an unknown key and the AI is ungrounded again while *appearing* grounded → guard: unit test
asserting every registry key resolves to a non-empty constraint set; (c) the AI cites a constraint
that has drifted from code → guard: derive numbers from the code roots at request time, never
retype them into a prompt string; (d) grounding is claimed but never exercised → guard: a
promptfoo/factuality case asking "why don't I have X" and asserting an abstention, not an answer.

**Step 4 — Give the live narrator the guard it never had (widen the validated system).**
Files: `lib/deliverable/recipes/shared.ts` (invitation branch), `lib/narratives/validate.ts` (reuse
— never write a second validator), `scripts/email/render-open-house.mts` (assertion 9). Pattern:
generate → `validateNarrative()` → on fail, one retry naming the failure → on second fail, the
deterministic fallback. That is CRITIC's external-feedback loop (§3).
*Failure modes → guards:* (a) infinite retry / latency blowup → hard cap of one retry, then
fallback; (b) validator rejects everything and emails silently degrade → log the fail reason and
assert the fallback path in a test; (c) a length check that counts the property description or
community block → the two carve-outs in `emails.md` §0.1, count the agent's own copy only;
(d) 15–35 words collides with the 50–125 band → resolve per-constraint with the operator (§1g)
before coding a number; never average them.

**Step 5 — Only after Ricky answers §2:** build the RSVP behavior.

---

## 5 — WHAT NOT TO RE-DERIVE

- As of commit `658c25ba` the two AI surfaces share **zero** call edges (§1f). Don't re-verify.
  Step 3 deliberately adds the first edge — that is the plan, not a contradiction.
- `button_destinations` was never in the ledger — full git history searched (§1e). Not a
  regression; stop hunting the commit that removed it.
- `lengthProfile()`'s `area-email` scoping is correct, not a bug (§1b).
- `dateTimeCard()`'s blast radius is one caller / one callee (§1d).
- The narrator's constraints each trace to a real caught failure (§1g) — don't relitigate as a block.

## 6 — FILING DEBT (RULE 0.4 step 2, stated not hidden)

The §3 crawl output lives **in this document only**. The `_RESEARCH/email-and-social/` file and its
`_RESEARCH/INDEX.md` line are **NOT written — 0 of 2.** Next session files them (URLs and crawl date
are above) or explicitly decides not to.
