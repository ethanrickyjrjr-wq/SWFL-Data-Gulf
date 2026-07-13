# ULTRA PLAN — Root 1: Unify the AI + project flow (R1 + BTN-1)

## Context

End-user verdict: *"I feel like I'm on 50 different sites."* The inventory
(`docs/superpowers/plans/2026-06-15-MASTER-PROBLEM-INVENTORY.md`) collapses ~47
problems to ~5 roots. This plan attacks **Root 1** only, tightly scoped. The
other roots are handed off as standalone briefs:
- Root 3 (data) → `docs/superpowers/plans/2026-06-15-root-R3-data-truth.md`
- Roots 4+5 (visuals/discoverability) → `docs/superpowers/plans/2026-06-15-root-R4R5-visuals-discoverability.md`

**What the code actually shows (grounded 2026-06-15):**

- The one pill (`components/briefcase/AiBriefcasePill.tsx:36`) forks on `reportId`
  into two unrelated experiences hitting two backends:
  - `/r/*` → `AskAiDock` → `/api/converse` — **grounded** on a brain dossier,
    has charts + "file this chart". This is the GOOD experience (operator: keep it).
  - everywhere else → `BriefcasePanel` → `BriefcaseChat` → `/api/welcome/chat`.
- `/api/welcome/chat` runs `WELCOME_SYSTEM` (`route.ts:57-80`): a **cold-lead
  funnel premise** — asserts *"you just clicked through from a branded email,"*
  is ordered to *"lead with [the auto-email] hook,"* and bounces for a ZIP. It
  DOES have a grounded path (`buildWelcomeGroundedSystem`) once a location is
  named, but even that **closes with the funnel email hook** and **no surface can
  file a Q&A to a project**. Hence: pitches instead of answers (BRF-8), starter
  prompts guarantee a non-answer (BRF-9), the AI denies the project system while
  running inside it (BRF-10).
- `ProjectDetail.tsx:323-330`: "Build deliverable" is hardcoded `disabled` +
  "Coming soon" with **zero callers**, while `POST /api/projects/[id]/build`
  (→ `assembleDeliverable`) is fully built and also used by MCP (BTN-1).

**The operator already decided** (build-queue, A-3): ONE pill, **dock preserved
on `/r/*`**. Root 1 is NOT a widget rebuild. It is: (1) give the standalone
in-app chat an **analyst, project-aware, grounded** voice instead of the funnel
bot, without breaking the public welcome landing page; (2) give **both** chat
surfaces the missing **"File this answer"** capability; (3) **wire the Build
button**. That is the whole "50 sites / prompts produce shit / can't build
anything" complaint.

---

## Pre-Execution Checks (code-verified 2026-06-15)

Four issues caught before writing code. All four verified against the actual
files — not assumptions.

### [1] Spread order in `useChatStream` — CONFIRMED BUG, FIXED IN STEP 2

`lib/chat/use-chat-stream.ts:80` currently posts:
```ts
body: JSON.stringify({ messages: next }),
```
When `opts.body` is added, the spread must go **before** `messages`:
```ts
body: JSON.stringify({ ...opts.body, messages: next }),
```
`opts.body` after `messages` would silently override the real conversation array
if any key collides. `messages: next` must always win.

### [2] Master-read injection pattern — VERIFIED, USE `buildDossier()` OUTPUT

`app/api/converse/route.ts:129-136` shows the exact pattern:
```ts
const { output, freshness_token } = await fetchBrain(report_id, { tier: 2, origin });
primary = { label: report_id, dossier: buildDossier(output, freshness_token) };
```
`buildDossier()` returns a `Dossier` object (not a string). The system prompt
is assembled via `buildGroundedSystemPrompt({ blocks: [primary, ...reachBlocks], ... })`
from `@/lib/grounded-answer`. For the analyst no-location path, use:
```ts
const { output, freshness_token } = await fetchBrain("master", { tier: 2, origin });
const block = { label: "master", dossier: buildDossier(output, freshness_token) };
// pass to buildGroundedSystemPrompt or ANALYST_SYSTEM inject
```
**Do NOT** try to use `fetchBrain().text` directly as a string inject — `buildDossier`
is the correct serializer.

### [3] Build route `instruction` field — NO FIX NEEDED

`app/api/projects/[id]/build/route.ts:44`:
```ts
const instruction = typeof body.instruction === "string" ? body.instruction : "";
```
The route already defaults `instruction` to `""` when omitted. The plan's POST
body `{ template }` (no `instruction`) is safe — `assembleDeliverable` receives
`instruction: ""` and that is valid.

### [4] "File this answer" button placement — LAST MESSAGE ONLY, TEAL LINK

`BriefcaseChat.tsx` renders messages as a flat `messages.map()` with no per-
message actions today. The file link must render on **only the last assistant
message**:
```ts
i === messages.length - 1 && m.role === "assistant" && !busy && m.content.length > 0
```
Use `filed` + `setTimeout(..., 1800)` transient state to reset — mirror
`AskAiDock.fileChart` exactly. Style: teal text link (`text-[#0a8078]`), not a
full button. **Never** render it on every bubble in the history.

---

## Shape of the change

```mermaid
flowchart TB
  subgraph BEFORE
    P1[AiBriefcasePill]
    P1 -->|/r/*| D1[AskAiDock → /api/converse<br/>grounded · files CHART only]
    P1 -->|elsewhere| B1[BriefcaseChat → /api/welcome/chat<br/>FUNNEL premise · cannot file Q&A]
    PD1[ProjectDetail 'Build' = disabled]
  end
  subgraph AFTER
    P2[AiBriefcasePill - unchanged fork]
    P2 -->|/r/*| D2[AskAiDock → /api/converse<br/>grounded + NEW teal 'File this answer']
    P2 -->|elsewhere| B2[BriefcaseChat → /api/welcome/chat?mode=analyst<br/>ANALYST premise · grounded · teal 'File this answer'<br/>+ persistent 'Summarize conversation' below window]
    WC[/api/welcome/chat]
    WC -->|mode=welcome default| FUN[funnel voice — PUBLIC landing UNCHANGED]
    WC -->|mode=analyst| AN[analyst voice — location dossier OR master read]
    PD2[ProjectDetail 'Build' → template picker → POST build → /p/id]
  end
  BEFORE --> AFTER
```

---

## Implementation (in order)

### 1. Split the chat voice: add `mode: "analyst" | "welcome"` to `/api/welcome/chat`

**`app/api/welcome/chat/route.ts`**

- Parse `mode` from the body (default `"welcome"` → today's behavior, untouched).
- Add `ANALYST_SYSTEM` next to `WELCOME_SYSTEM`: same no-invention floor, premise
  is *"You are a Southwest Florida market analyst helping this person build a
  cited, client-ready project. Answer the question directly from cited data. You
  CAN file answers, figures, and charts into their project — when they file
  something, it lands in their briefcase to build into a deliverable. When no
  place is named yet, ask which ZIP or area they want — do not pitch."* No
  "branded email you just saw," no "auto-email your clients" hook.
- **No-location branch (`mode==="analyst"`):** ground on the master read instead
  of the un-grounded funnel explainer. Pattern from `app/api/converse/route.ts`:
  ```ts
  const { output, freshness_token } = await fetchBrain("master", { tier: 2, origin });
  const block = { label: "master", dossier: buildDossier(output, freshness_token) };
  ```
  Inject into `ANALYST_SYSTEM` + the no-invent speak line. This makes
  *"What's the bottom line on SWFL right now?"* actually answer (kills BRF-9).
  Keep existing per-IP/weekly caps unchanged.
- **Location branch (`mode==="analyst"` + detected ZIP/place):** reuse
  `buildWelcomeGroundedSystem`, but parameterize its closing line. In
  **`lib/welcome/grounded.ts`**, thread `voice: "welcome" | "analyst"` (default
  `"welcome"`) through `buildWelcomeGroundedSystem` — the `welcome` close stays
  the email-hook pitch; the `analyst` close offers to file the read into a
  project. Public landing unaffected.
- **Prelude frame:** add `freshness_token` to the grounded prelude frame (already
  carries `{zip, name}`). Backward-compatible — clients ignore unknown fields.
  Client pins it on filed Q&A items (step 3).

### 2. Let `useChatStream` pass extra body fields

**`lib/chat/use-chat-stream.ts`**

Add `body?: Record<string, unknown>` to `UseChatStreamOptions`. In `send()`:
```ts
body: JSON.stringify({ ...opts.body, messages: next }),
```
Spread order: `opts.body` FIRST, `messages: next` LAST — `messages` always wins
(see pre-execution check [1]). Backward-compatible: welcome page passes nothing
→ `mode` absent → funnel default.

### 3. Standalone chat: analyst mode + "File this answer" + persistent summarize

**`components/briefcase/BriefcaseChat.tsx`**

- Pass `body: { mode: "analyst" }` and `onFrame` to `useChatStream`:
  ```ts
  const { messages, busy, send } = useChatStream("/api/welcome/chat", {
    body: { mode: "analyst" },
    onFrame,
  });
  ```
- Capture grounding identity from prelude via `onFrame`: store latest `place`
  (`{zip, name}`) and `freshness_token` in refs. Filed item's `report_id` =
  `place.zip` if present, else `"swfl"`.
- Add `useBriefcase()` and `const [filed, setFiled] = useState<string | null>(null)`.
- In the message list, render a teal **"File this answer"** link on the last
  assistant message only:
  ```ts
  condition: i === messages.length - 1 && m.role === "assistant" && !busy && m.content.length > 0
  ```
  On click: `briefcase.fileItem({ id: crypto.randomUUID(), added_at: new Date().toISOString(),
  origin: "web", kind: "qa", report_id, question: lastUserMsg, answer: m.content, freshness_token })`.
  Show `"Filed ✓"` → `setTimeout(() => setFiled(null), 1800)`. Style: `text-xs text-[#0a8078]`
  inline link, not a full button.
- **Persistent "Summarize Important Data Of Entire Conversation To File"** button
  below the answer/scroll window (always visible, not conditional on end-of-convo):
  - Disabled when `messages.length < 4` (needs ≥ 2 exchanges to summarize).
  - On click: POST to `/api/welcome/chat` with
    `{ mode: "summarize", messages, alreadyFiled: <qa items filed this session> }`.
    See step 1 for the summarize path. Files the result as a single `kind: "qa"` item
    with `question: "Conversation summary"`.
  - Style: subdued secondary button (`border border-[#0a8078]/40 text-gray-400`),
    not teal-primary — it should not compete with the file link.

**`components/briefcase/BriefcasePanel.tsx`**

- One copy fix (BRF-2/BRF-3): in the `pitch` state, add one line below the chat:
  *"Answers and figures you file land here — open a project to build & send."*

### 4. Add "Summarize" path to `/api/welcome/chat`

**`app/api/welcome/chat/route.ts`**

- New `mode: "summarize"` branch: receives `{ messages, alreadyFiled: ProjectItem[] }`.
- Build a synthesis prompt: *"You are summarizing a SWFL market research session.
  Below is the full conversation. The user has already filed these items: [filed
  Q&A list]. Write one concise summary of the important findings — include key
  numbers, cite the source topics, do not repeat items already filed verbatim.
  Plain text only."*
- Returns a single streamed text block. Client files it as `kind: "qa"`,
  `question: "Conversation summary"`, `answer: <streamed text>`, `freshness_token`
  from the last prelude frame captured in the session.
- Smart dedup: `alreadyFiled` is passed in from the client — the model is
  instructed to synthesize including those facts without repeating the exact
  wording.

### 5. Capability parity on the dock: "File this answer"

**`components/highlighter/AskAiDock.tsx`**

- Dock already has `useBriefcase()` (line 75) and `filed` state (line 83).
- In the `stage === "answer"` block, next to "Ask another →", add teal
  **"File this answer"** link when `!streaming && !error && !isSummaryAnswer`:
  ```ts
  briefcase?.fileItem({ kind: "qa", report_id: reportId, question: activeQuestion,
    answer, freshness_token: freshnessToken })
  setFiled("qa")
  setTimeout(() => setFiled((k) => k === "qa" ? null : k), 1800)
  ```
  Reuse the existing `filed` / `setTimeout` transient-state pattern — `fileChart`
  at line 244 is the exact model. Both surfaces now file Q&A → true parity.

### 6. Wire the Build button (BTN-1)

**`app/project/[id]/ProjectDetail.tsx:320-332`**

Replace the disabled button + TODO comment with:
- A compact `<select>` over the 4 template ids from `DELIVERABLE_TEMPLATES`
  (`lib/deliverable/assemble.ts:21`): `market-overview`, `bov-lite`,
  `client-email`, `one-pager`.
- A "Build deliverable" button. `onClick`:
  ```ts
  POST /api/projects/${id}/build  body: { template }
  // instruction omitted → route defaults to "" (verified, check [3])
  on { id } → window.location.assign("/p/" + id)
  ```
  Disable while building. On non-ok: surface `error` text inline (e.g. "needs at
  least one filed item"). Gate: disabled when `items.length === 0`, hint to file
  something first.
- **Out of scope:** deliverable content quality (`lib/deliverable/build.ts`) is
  R2. The button just has to fire, navigate, and report failure.

### 7. Tests + housekeeping

- Route test for `/api/welcome/chat`: `mode:"welcome"` → funnel system prompt +
  never grounds on master; `mode:"analyst"` (no location) → grounds on master,
  never emits email-hook language. Pattern: existing `lib/welcome/grounded.test.ts`.
- Unit assertion: "File this answer" calls `briefcase.fileItem` with a valid `qa`
  item (validate against `projectItemsSchema`).
- SESSION_LOG entry + `node scripts/check.mjs` ledger reconcile + push via
  `node scripts/safe-push.mjs`.

---

## Verification

1. `bun test` green; `next build` clean (routes stay static).
2. Public welcome landing: funnel-voiced, pitches email hook (no `mode` → default
   funnel). **No regression.**
3. Off `/r/*` (e.g. `/project`, `/charts`, `/`): open pill → ask *"What's the
   bottom line on SWFL right now?"* → grounded cited answer, not a pitch.
   Ask a ZIP → grounded read. Teal "File this answer" appears on last answer →
   click → item in draft list, badge bumps. "Summarize" button visible below
   window; click after ≥2 exchanges → summary filed as one item.
4. On `/r/cre-swfl`: dock works unchanged; new "File this answer" files a `qa`.
5. On `/project/[id]` with ≥1 filed item: pick template → Build → lands on
   `/p/[slug]`. Empty project → disabled + hint. Backend error → renders inline.
6. MCP `_meta` / `/api/converse` unchanged.

---

## Out of scope for this PR (noted, not dropped)

- R2 (caveat-dump density + facts-only deliverable content) — separate root.
- R3 → `2026-06-15-root-R3-data-truth.md`.
- R4/R5 → `2026-06-15-root-R4R5-visuals-discoverability.md`.
- Stripe/checkout (FUN-1): no paywall until the product works.

---

## Follow-ups (build AFTER Root 1 is verified in prod)

These were designed in the same session. Do not fold into Root 1 — they depend
on filing working first.

### F-1: Project-context awareness

When filing (any surface), check whether the user is currently inside a project
(`/project/[id]`). If yes, filed items go to **that project** automatically
rather than the general briefcase. If no project context, current behavior (general
briefcase) unchanged.

Implementation hint: `useBriefcase()` already knows the active project from
`BriefcaseProvider`. Pass `projectId` from the URL into the provider context so
`fileItem` can stamp the correct destination without the user choosing.

### F-2: Post-file cross-project AI suggestion

After any file or summarize action, if the user is logged in and has ≥1 other
project, the AI checks:
- What other projects does this user have, and what are they for?
- Does a Weekly Email Project already exist? More than one (different audiences)?
- Based on the content just filed, surface 1-2 suggestions inline:
  - *"Some of this would fit well in [Project X] — add it there?"*
  - *"This looks like general market news — want me to start a Weekly Email
    Project for all your contacts?"*
  - *"You have a monthly investor update project — some of this is investor-tier.
    Add it there?"*

User can: add to existing project, start a new one, both, or dismiss.

What the AI needs to know: the user's project list + their `branding.name`/purpose
fields + whether a Weekly Email Project already exists (query by name pattern).

**Note on email lists:** different Weekly Email Projects may target different
client types (general contacts vs. investors). The AI surfaces the right one
based on content type. Separating the underlying email lists is future work —
not blocked here.

### F-3: Persistent summarize — smart dedup (enhancement to step 4)

Step 4 above ships a basic version. The full version (F-3) tracks which `qa`
items were filed *in this specific session* (by `added_at` ≥ session start) and
passes them as `alreadyFiled`. The summarize prompt then explicitly synthesizes
including those items without verbatim repetition. Session start timestamp stored
in a `useRef` initialized at component mount.
