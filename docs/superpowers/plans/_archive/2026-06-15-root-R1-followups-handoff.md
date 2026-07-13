# Root 1 — handoff + follow-ups (post-build)

**Status: SHIPPED (steps 1–7) on `main` this session. Prod live-verify pending.**
Plan executed: `docs/superpowers/plans/2026-06-15-root-R1-unify-ai-project.md`.

Verification at ship: **`bun test` 2569 pass / 0 fail**, eslint clean on all touched
files, `next build` green (route manifest emitted; `/welcome` + `/project/[id]`
stay dynamic as before, static pages unchanged). The runtime claims below are
**not** verified in prod yet — that is the open check `root1_unify_live_verify`
(due 2026-06-18). Per `feedback_checks-prod-evidence-not-dev-attestation`: do NOT
close it on "code looks right" — wait for the live signal after the Vercel deploy.

---

## What shipped (file-by-file)

1. **`app/api/welcome/chat/route.ts`** — voice split.
   - Parses `mode: "analyst" | "welcome" | "summarize"` (default `"welcome"`).
     **The public welcome landing sends no `mode` → funnel behavior is byte-for-byte
     unchanged** (the existing tests still assert the funnel hook).
   - `ANALYST_SYSTEM` — project-aware analyst premise, same no-invention floor as
     `WELCOME_SYSTEM`, no email-hook pitch. (Deliberately avoids the literal string
     "auto-email" so the funnel/analyst split is test-assertable.)
   - No-location analyst → `buildAnalystSystem(lastUser, origin)`: fetches the
     `master` read, `buildDossier` → `renderBlock` (now **exported** from
     `lib/highlighter/grounding.ts`) under a clean label `"Southwest Florida
     (region-wide)"` (never the internal id "master"), closes with the analyst
     speak line. **Failsafe**: if `fetchBrain("master")` throws, it falls back to
     the un-grounded analyst premise — still no-invention, just no live numbers.
   - Location analyst → existing `buildWelcomeGroundedSystem` with a new
     `voice:"analyst"` arg (threaded into `welcomeGroundedSpeakLine`): the close
     offers to file into a project instead of the recurring-email pitch.
   - `mode:"summarize"` → early branch (before location detection) calling
     `buildSummarizeSystem(alreadyFiled)`; synthesizes the thread, instructed to
     fold in (not repeat) already-filed Q&A.
   - The `place` prelude frame now carries `freshness_token` (used client-side to
     pin a filed Q&A). Backward-compatible (clients ignore unknown fields).

2. **`lib/welcome/grounded.ts`** — `welcomeGroundedSpeakLine(token, voice)` exported;
   the data-reader floor is shared, only the CLOSING line branches on `voice`.
   `WelcomeGroundedInput` gained `voice?: "welcome" | "analyst"`.

3. **`lib/welcome/frames.ts`** — `place` frame variant gained `freshness_token?: string`.

4. **`lib/highlighter/grounding.ts`** — `renderBlock` is now `export`ed (the canonical
   per-block serializer, reused so the analyst answer matches the `/api/converse`
   answer format). No behavior change.

5. **`lib/chat/use-chat-stream.ts`** — `UseChatStreamOptions.body?: Record<string,unknown>`;
   `send()` posts `{ ...opts.body, messages: next }` — **spread first so `messages`
   always wins** on a key collision (pre-execution check [1]).

6. **`components/briefcase/BriefcaseChat.tsx`** — runs `mode:"analyst"`; `onFrame`
   captures the latest `place` + `freshness_token` into refs; teal **"File this
   answer"** on the **last assistant message only**; persistent **"Summarize
   conversation → file to project"** button (visible once the convo starts,
   disabled until ≥ 4 messages). Both file via the shared `buildQaItem`.

7. **`components/briefcase/BriefcasePanel.tsx`** — one pitch-state copy line
   ("Answers and figures you file land here — open a project to build & send").

8. **`components/highlighter/AskAiDock.tsx`** — capability-parity **"File this
   answer"** next to "Ask another →" in the answer stage (reuses the existing
   `filed`/`setTimeout` transient pattern, mirrors `fileChart`).

9. **`lib/briefcase/qa-item.ts`** (NEW) — `buildQaItem(...)`: one builder for both
   "File this answer" surfaces, so they produce identical, schema-valid `qa`
   `ProjectItem`s. Unit-tested against `projectItemsSchema`.

10. **`app/project/[id]/ProjectDetail.tsx`** (BTN-1) — the disabled "Coming soon"
    button is replaced by a template `<select>` (4 ids) + **"Build deliverable"** →
    `POST /api/projects/[id]/build {template}` → `window.location.assign("/p/"+id)`.
    Disabled while building or when the project has zero items (with a hint);
    backend errors render inline.

**Untouched (by design):** MCP surface (`swfl_*` tools), `/api/b/*`, `/api/converse`,
`buildGroundedSystemPrompt`. R2 (deliverable content quality / caveat density) is
out of scope — the button only has to fire, navigate, and report failure.

---

## Decisions / deviations a reviewer should know

- **Summarize needs a final user turn.** The route's "last message must be user"
  gate (a cost guard) would 400 a summarize POST, because a conversation ends on an
  assistant turn. Rather than special-casing the validator, the **client appends a
  synthetic `{role:"user", content:"Summarize the important findings…"}`** before
  POSTing. The summarize system prompt does the real work; the appended turn is a
  harmless explicit instruction. (Plan step 4 said "the full conversation"; this
  ships the **last `MAX_HISTORY` (12)** turns, consistent with the route's existing
  cost slice. F-3 is the enhancement.)
- **Analyst no-location grounds on `master` via the exported `renderBlock`**, not a
  bespoke serializer — keeps the analyst answer format identical to converse, one
  code path to maintain. The block label is the clean `"Southwest Florida
  (region-wide)"`, never "master" (CLEAN rule).
- **Shared `buildQaItem`** instead of inlining the `fileItem` call in each surface —
  makes the "valid qa item" assertion a real unit test (no DOM renderer needed) and
  guarantees the two surfaces never drift.
- **`buildAnalystSystem` is failsafe** — master fetch failure degrades to the
  un-grounded analyst premise, never an error to the user.

---

## Prod live-verify checklist (closes `root1_unify_live_verify`)

After the Vercel deploy:

1. **No public regression.** `/welcome` (no `?demo`, no `mode`) — still funnel-voiced,
   still pitches the recurring-email hook, hero cards still paint for an in-scope ZIP.
2. **Off `/r/*`** (e.g. `/project`, `/charts`, `/`): open the pill → ask *"what's the
   bottom line right now?"* → **grounded cited answer, not a pitch**. Ask a ZIP → a
   grounded read. Teal **"File this answer"** on the last answer → click → item lands
   in the draft list, badge bumps.
3. **Summarize**: after ≥ 2 exchanges the button enables → click → one
   `"Conversation summary"` item is filed.
4. **`/r/cre-swfl`** (dock): unchanged behavior; new "File this answer" files a `qa`.
5. **`/project/[id]`** with ≥ 1 filed item: pick a template → **Build deliverable** →
   lands on `/p/[slug]`. Empty project → button disabled + hint. Backend error
   (e.g. needs an item) → renders inline.
6. MCP `_meta` / `/api/converse` responses unchanged.

---

## Follow-ups — DO NOT fold into Root 1; build only AFTER prod-verify

These were designed alongside R1 and all depend on filing working in prod first.

### F-1 — Project-context awareness

When filing from any surface while the user is **inside a project** (`/project/[id]`),
the filed item should go to **that project**, not the general briefcase. No project
context → current behavior unchanged.

- Pointer: `BriefcaseProvider` (`components/briefcase/BriefcaseProvider.tsx`) owns the
  draft. Thread the active `projectId` (from the route) into the provider so
  `fileItem` can stamp the destination without the user choosing. The two file
  surfaces already funnel through `buildQaItem` → `briefcase.fileItem`, so this is a
  provider-level change, not a per-surface one.

### F-2 — Post-file cross-project AI suggestion

After a file/summarize, if the user is logged in and has ≥ 1 other project, surface
1–2 inline suggestions ("some of this fits [Project X] — add it there?"; "want a
Weekly Email Project for all your contacts?"; "this is investor-tier — add to your
investor update?"). User can add-to-existing / start-new / both / dismiss.

- What the AI needs: the user's project list + each project's `branding.name`/purpose
  + whether a Weekly Email Project already exists (query by name pattern).
- Note: different Weekly Email Projects may target different audiences (general vs.
  investors); surface the right one by content type. Splitting the underlying email
  lists is separate, later work — not blocked here.

### F-3 — Summarize smart dedup (enhancement to the shipped basic version)

Step 4 ships a basic dedup (passes all filed `qa` questions as `alreadyFiled`). The
full version tracks which items were filed **in this session** (by `added_at` ≥ a
mount-time `useRef` timestamp) and passes only those, so the summary synthesizes the
session without repeating this-session items verbatim.

- Pointer: `BriefcaseChat.summarize()` already builds `alreadyFiled` from
  `briefcase.draftItems` filtered to `kind:"qa"`. Add a session-start `useRef` stamp
  and filter `added_at >= sessionStart`.

---

## Tier-2 deferrals / known limitations (not bugs)

- Summarize covers the last 12 turns (the route's cost slice), not an unbounded
  transcript. Fine for v1; revisit if users have very long sessions.
- "File this answer" can be re-clicked after the 1.8s "Filed ✓" resets (mirrors the
  dock's `fileChart`); a determined user can file the same answer twice. Acceptable.
- No paywall / Stripe gate (FUN-1) — out of scope until the product works (R1's point).
