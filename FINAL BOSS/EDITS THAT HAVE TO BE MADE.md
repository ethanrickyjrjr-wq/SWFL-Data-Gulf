# EDITS THAT HAVE TO BE MADE

> **What this file is.** A verified punch list of the changes the FINAL BOSS piece docs (00–04) **must** absorb
> from `Piece-5` (the Convergence Plan). "EDIT" = a doc currently states something **false / contradictory**, or
> **omits a real blocker**, such that a builder who follows it as-written would ship a bug or hit a runtime error.
> Soft betterments live in `IMPROVEMENTS.md`, not here.
>
> **Nothing in the existing files was changed to produce this.** This is the map; applying it is a separate go.
>
> **Verification basis (do not take on faith — RULE 3 C1 / "plans are hypotheses, not authority").** Every claim
> below was checked against the live repo on **2026-06-17**. Code evidence is cited inline (`file:line`). Piece-5's
> 7-gap punch list was audited gap-by-gap; **2 of 7 are genuinely actionable doc corrections (G1, G3)**, 4 are
> already correctly captured in the piece docs (G2, G4, G5, G6), and **1 is refuted (G7 — inaccurate line numbers;
> do NOT propagate it).**

---

## Is Piece-5 needed, and where does its information go? (the routing answer)

**Yes — but only its net-new content, and not as the raw file it is today.** Piece-5 is three things stacked: (a)
genuinely new material no other doc has, (b) a gap punch list that mostly duplicates the piece docs, and (c) prose
that is a verbatim re-statement of `00-MASTER-PLAN.md`. Route it like this:

| Piece-5 element | Net-new? | Destination | Disposition |
|---|---|---|---|
| **J1–J4 user journeys** (backward-from-the-broker) | **Yes** — pieces are layer-organized; no doc has the journey lens | cleaned-up `05-…md` (or a new 00 §) | → `IMPROVEMENTS` |
| **Per-journey "flawless" acceptance bar** | **Yes** | `05-…` + each piece's Verification | → `IMPROVEMENTS` |
| **Wave sequence W0–W3** (flagship-vertical-first) | **Yes** — *differs* from 00's horizontal piece order | `00-MASTER-PLAN` (a sequencing decision) | → `IMPROVEMENTS` (decision) |
| **G1** — chat backend anonymous | Partial — P2 §D covers grounding, not actions | **02** (reconcile) + name in 00/01 | **→ EDIT (this file)** |
| **G3** — `20260616_deliverables_scope.sql` unapplied | **Contradicts** 00 + P1 §I ("columns exist") | **00 + 01** | **→ EDIT (this file)** |
| G2 — branding on import/claim | No | — | already in P1 §G + HANDOFF |
| G4 — build route + MCP enum omit scope/"email" | No (verified accurate) | — | already in P1 §I + P2 §H |
| G5 — seed-on-load missing | No | — | already in P1 §I |
| G6 — page.tsx doesn't load `email_schedules`/`ui_state` | No | — | already in P1 §A |
| **G7** — "ConnectYourAI is 307 lines (:282–589)" | **Inaccurate** | — | **DROP** (see 01 below) |
| spine / context-bus / convergence / who-this-is-for prose | No | pointer, not copy | → `IMPROVEMENTS` (drift risk) |
| Audit verdict ("engine built, rewire not rebuild") | No | — | already in HANDOFF / 00 / README |

**The file itself** (`Piece-5`, no extension, box-drawing `╭│└` borders, a table that renders as broken ASCII) needs
to be renamed to a real `.md` and cleaned before it's anyone's source of truth — recorded as a cleanup in
`IMPROVEMENTS.md`, not done here.

---

## 00 — MASTER-PLAN.md (+ HANDOFF.md / README.md)

### E00.1 — Reconcile the "scope columns already exist" premise with G3 (the migration is reportedly unapplied)
- **Source:** Piece-5 **G3**; corroborated by `03-piece-3-signal-layer.md` ("`20260616_deliverables_scope.sql` …
  latter unapplied").
- **Verdict — ⚠ real contradiction inside FINAL BOSS.** `00-MASTER-PLAN.md` (flagship-flow §, the "(b)" gap) says the
  scope wiring is *"only the route/tool lag"* — i.e. it asserts everything else, columns included, is ready. But P3 and
  Piece-5 both say the `deliverables` scope migration is **unapplied**. Verified: the migration **file exists**
  (`docs/sql/20260616_deliverables_scope.sql`, 997 bytes, dated Jun 16) and the engine genuinely supports email+scope
  (`lib/deliverable/assemble.ts:21-26,56` — `"email"` is a real `TemplateId`, `templates.ts:83`). What I **did not**
  verify is prod table state (no prod query run — out of scope for a doc pass). So the docs disagree and one of them is
  wrong.
- **The edit:** before W0/J4 threads scope, **verify prod** (`information_schema.columns` on `public.deliverables`) and
  then either (a) apply `20260616_deliverables_scope.sql` and keep the "only the route/tool lag" wording, or (b) if it's
  already applied, leave 00 as-is and correct P3/Piece-5. Until verified, soften 00's "only the route/tool lag" to *"the
  route/tool lag **and** the `deliverables` scope migration must be confirmed-applied first (see G3)."*
- **Why it's a must-fix, not a nicety:** a builder reading "columns exist" skips the migration step; threading
  `scope_kind/scope_value` into the build path then throws on a missing column at runtime. This is the exact failure
  the FINAL BOSS sequencing was meant to prevent.

### E00.2 — Name G1 (the anonymous chat backend) as the known J2/J4 blocker
- **Source:** Piece-5 **G1** ("the missing spine of the always-prepared AI").
- **Verdict — ✓ real.** `app/api/welcome/chat/route.ts:36` describes itself as a *"public, **unauthenticated**,
  paid-Haiku surface"*; it reads an IP-derived `clientIdFromRequest`, **never** `auth.getUser()`, `user_id`, or
  `project_id` (grep for those tokens → no matches). 00's spine + flagship-flow sections describe the project-aware AI
  and the "Ready to send?" step as if the mounted pill is sufficient; they never flag that the chat *route* it posts to
  cannot see the project or the user.
- **The edit:** add one line to 00's spine/flagship sections marking the chat backend as anonymous/text-only today, and
  pointing at the **02** reconciliation (E02.1) as the load-bearing dependency for J2 ("AI greets you") and J4 ("Ready
  to send?"). Keep the heavy decision in 02; 00 just must not imply the AI is project-aware for free.

### E00.3 — HANDOFF/00 "branding follows every project (all creation paths)" must read as a target, not a fact
- **Source:** Piece-5's own doc-correction note ("HANDOFF 'branding follows all paths' should be marked not yet true").
- **Verdict — ⚠ partly already handled.** Verified G2 is real: `app/api/projects/import/route.ts:36-41` inserts only
  `id/user_id/title/items` (**no branding**); `app/api/claim/route.ts` has no branding copy; only
  `app/api/projects/route.ts:48` copies it. **But** HANDOFF:98 already phrases this as an instruction (*"Branding **must**
  follow ALL creation paths — copy … in import/claim too"*), i.e. a TODO, not a claim-of-done. The place that reads as
  already-true is `00-MASTER-PLAN.md:20` (*"follows every project after (all creation paths)"*), inside the locked
  north-star description.
- **The edit (small, but do it):** at `00-MASTER-PLAN.md:20` add a parenthetical *"(target; not yet wired on
  import/claim — see G2 / P1 §G)"* so the north-star line can't be misread as current state. HANDOFF needs no change.

---

## 01 — piece-1-workspace-shell.md

### E01.1 — P1 §I asserts "the `deliverables.scope_*` columns exist" — this is the load-bearing half of the G3 contradiction
- **Source:** Piece-5 **G3**.
- **Verdict — ⚠ contradicts P3 + Piece-5.** P1 §I (line ~111) says verbatim: *"`assembleDeliverable` already supports
  email+scope and the `deliverables.scope_*` columns exist — only the route/tool lag."* P3 + Piece-5 say the migration is
  unapplied. Same conflict as E00.1, but **this is the more dangerous instance** because P1 §I is the build instruction a
  coder executes step-by-step (it's the only piece marked "ready to build").
- **The edit:** replace "the `deliverables.scope_*` columns exist" with *"the `deliverables.scope_*` columns are defined
  in `docs/sql/20260616_deliverables_scope.sql` — **verify it's applied to prod and apply if not** before threading
  scope."* Add the verify step to the P1 build sequence as a precondition of the scope/email work.
- **Engine side is fine:** the verified part of P1 §I ("`assembleDeliverable` already supports email+scope") stands —
  `lib/deliverable/assemble.ts:56` documents the email ZIP scope. Only the "columns exist" clause is suspect.

### E01.2 — Do NOT adopt Piece-5 G7's ConnectYourAI numbers; P1's existing citation is the correct one
- **Source:** Piece-5 **G7** ("ConnectYourAI is 307 lines (:282-589), not a one-liner. P1 decomposition underscopes it").
- **Verdict — ✗ refuted.** Verified in `app/project/[id]/ProjectDetail.tsx`: the function is **defined at line 446** and
  **ends at 589** (`function ConnectYourAI({` … `}` → ≈ **144 lines**); line **283** is the *render site*
  (`<ConnectYourAI … />`), not the definition. Piece-5 spanned the render site to the function end and double-counted to
  get "307 lines." Moreover P1 §A **already** cites the correct range — `ConnectYourAI:446-589` — and scopes
  `ConnectMcpBlock` as a thin wrapper that renders the existing component **unchanged**, which is the right call.
- **The edit:** **none to P1.** The required action is *negative*: when folding Piece-5 into the docs, **drop G7** — do
  not "re-budget" ConnectMcpBlock against a phantom 307-line component. (If anything, add a half-line to P1's build
  sequence noting ConnectYourAI is ~144 lines and moves verbatim — that's an `IMPROVEMENTS` item, not a must-fix.)

> G2 (branding), G4 (build route + MCP enum), G5 (seed-on-load), G6 (page.tsx load of `email_schedules`/`ui_state`) are
> **already correctly specified** in P1 §G / §I / §A respectively, and each was verified real in code. No edit needed —
> Piece-5 adds cross-reference value (→ `IMPROVEMENTS`), not correction.

---

## 02 — piece-2-project-aware-ai.md

### E02.1 — Reconcile G1: P2 must (a) acknowledge the anonymous/text-only chat surface and (b) name the authed surface for project *actions*
- **Source:** Piece-5 **G1** (its "big one"); reconciled against P2 §D + the context-bus mechanism §.
- **Verdict — ⚠ Piece-5 is partly right and partly overstated, and P2 has a real residual gap.** Three verified facts:
  1. `app/api/welcome/chat/route.ts` is **public, unauthenticated, text-only** (`:36`; and P2 §D itself notes
     charts/actions "live in `/api/converse` — a future port, noted not built").
  2. **P2 §D already solves project-aware _answers_ without auth** — it pushes a client-computed `projectContext` block
     into the POST body via `getExtraBody` → the existing `buildClientContextBlock` channel (framed as DATA). So
     Piece-5's claim that project-awareness is *"in none of the piece docs"* and needs an *"auth + projectId → chat
     bridge"* is **overstated** — grounding doesn't need a server auth bridge.
  3. **The real residual neither doc closes:** J4's *"Ready to send?"* and the seed/build handoffs are **actions**, not
     answers. They cannot ride the anonymous, text-only `welcome/chat` surface — they need an **authenticated** path
     (the deferred `/api/converse` port, or a dedicated project-action route). P2 names `/api/converse` only as
     out-of-scope/future, so today there is no specified surface for the flagship action.
- **The edit (to P2):** add an explicit subsection that (1) states `welcome/chat` stays anonymous + text-only; (2)
  confirms answer-grounding rides client-pushed `projectContext` (already P2 §D — keep it, it's the cheap win); (3)
  **names the authenticated surface for project actions** as a locked open-decision — `/api/converse` port vs. a new
  authed route — because "Ready to send?" is the monetizing journey (J4) and currently has no home.
- **The edit (to the Piece-5 fold):** when G1 migrates into the docs, **correct its wording** — drop "in none of the
  piece docs" (P2 §D exists) and re-scope G1 from "the AI can't be project-aware at all" to "project *actions* have no
  authenticated surface yet."

---

## 03 — piece-3-signal-layer.md

**No mandatory edits from Piece-5.** P3 already names the G3 migration state correctly ("latter unapplied"), already
carries the scope contract verbatim, and its signal kinds are the durable half Piece-5 only references. The
cross-references between P3's signal kinds and the journeys they fuel are betterments → see `IMPROVEMENTS.md`.

---

## 04 — piece-4-editing-refresh-trash.md

**No mandatory edits from Piece-5.** J3's gap narrative in Piece-5 restates P4's own resolved plan (live refresh,
guided edit, `deleted_at` trash, fork-on-content-edit, frozen-link integrity) — all already present and internally
consistent. One coordination note (P4's `deleted_at`/`supersedes_id` migration touches the **same** `deliverables`
table as the unverified scope migration in G3 — sequence them so both land cleanly) is a betterment →
`IMPROVEMENTS.md`, not a correction.

---

## Piece-5 itself — required dispositions

These are "edits" in the sense that Piece-5 cannot stay as-is and serve as a source of truth:

- **PD.1 — Strip the two refuted/overstated claims before anything cites Piece-5:** **G7** (wrong line count — drop) and
  **G1's** "in none of the piece docs / auth bridge" framing (overstated — re-scope per E02.1). Leaving them in means
  the next session edits the piece docs against a phantom and an over-claim.
- **PD.2 — Resolve the G3 status line** ("unapplied") against prod once, so 00/01/03/Piece-5 stop disagreeing with each
  other about whether the columns exist.

(Renaming `Piece-5` → `05-…md` and cleaning the box-drawing rendering are quality items, not correctness — they live in
`IMPROVEMENTS.md`.)
