# IMPROVEMENTS

> **What this file is.** The *non-mandatory* betterments the FINAL BOSS docs (00–04) could absorb from `Piece-5` — the
> things that make the program clearer, harder to drift, and easier to build, but which are **not** corrections of
> anything false. (False/contradictory items live in `EDITS THAT HAVE TO BE MADE.md`.)
>
> Same sectioning as the EDITS file: 00, 01, 02, 03, 04, then a Piece-5 disposition. **Nothing existing was changed.**
>
> The single highest-value improvement is structural: **most of Piece-5's real worth is one lens the piece docs don't
> have — the four user journeys — and one decision they don't force — wave order.** Capture those two and the rest of
> Piece-5 is either already covered or pure duplication.

---

## 00 — MASTER-PLAN.md (+ HANDOFF / README)

### I00.1 — Add the **user-journey lens** (J1–J4) alongside the piece decomposition
The four pieces are organized by **system layer** (Shell → AI → Signal → Editing). Piece-5's J1–J4 organize the same
work by **what the broker experiences end-to-end** (create-from-anywhere → arrives-prepared → build/edit-live →
email-through-projects-and-send). That backward-from-the-user view is genuinely new and is the best tool for catching
"this seam is built but the journey still feels broken." Add a short "User journeys" section to 00 (or keep it in the
cleaned `05-…` doc) that maps each journey to the seams + pieces it rides. This is the part of Piece-5 most worth
keeping.

### I00.2 — Surface the **wave-order vs. piece-order** decision explicitly
00 sequences **horizontally**: P1 first, then P2/P4, with P3 partly parallel. Piece-5 proposes a **vertical, flagship-
first** order: **W0** light up the built engine on the project surface (G2/G3/G4 — no UI, each ships alone) → **W1** P1
thin shell → **W2** the J4 flagship + the auth/action spine → **W3** widen into full P2/P3/P4. These are different
strategies (ship a complete monetizing journey early vs. complete each layer). They're not in conflict mechanically,
but the operator should **pick deliberately**. Add the wave option to 00's "Sequencing & why" as a named alternative
(or adopt it) rather than letting two orderings float across two files.

### I00.3 — Replace Piece-5's duplicated spine prose with a pointer (kill the drift)
Piece-5 restates "one persistent AI / two contexts," the context bus, the REAL/SELECTIVE/REACH convergence engine, and
"who this is for" — all already canonical in `00-MASTER-PLAN.md` + `HANDOFF.md`. Two copies of the spine is exactly the
"prose drifts" failure CLAUDE.md warns about. Whatever survives of Piece-5 should **link** to 00's spine section, not
re-paragraph it.

### I00.4 — Fold in the per-journey "flawless" acceptance bar
Piece-5's "how we know it's done" lines (J1: lands auto-named + branded; J2: pill never reloads, prompts reference this
project; J3: rebuild passes spec-validator + 3 lints; J4: saw-it-before-send) are crisp acceptance criteria. They
belong next to 00's "What bringing it all together means" and/or distributed into each piece's Verification block.

---

## 01 — piece-1-workspace-shell.md

### I01.1 — Note ConnectYourAI's real size in the build sequence (the *correct* version of G7)
Verified: `ConnectYourAI` is `ProjectDetail.tsx:446-589` (~144 lines), rendered at `:283`, moves verbatim under
`ConnectMcpBlock`. P1 §A already cites `446-589`; a half-line in the build sequence ("ConnectYourAI ≈144 lines, lifts
unchanged into ConnectMcpBlock") would pre-empt the next reader re-deriving it — and inoculate against Piece-5 G7's
wrong "307 lines." (The *correction* of G7 is in the EDITS file; this is just the helpful residue.)

### I01.2 — Cross-link P1 §I (seed-on-load / scope-thread / branding) to the W0 "light up the engine" framing
G2/G4/G5 already live in P1 §G/§I, but Piece-5's framing — that they're a **no-UI Wave 0 that ships before the shell** —
is a useful reorganization. A pointer from P1 §I to "these three are independently shippable ahead of the decomposition
(Piece-5 W0)" lets the engine get reachable+branded from every path without waiting on the 743-line decomposition.

### I01.3 — Tag P1's verification steps with journey IDs
P1's verification list and Piece-5's J1/J3/J4 acceptance bars test the same surfaces. Annotating P1's checks with
`(J1)/(J3)/(J4)` makes "did this piece actually unblock the journey?" answerable at build time.

---

## 02 — piece-2-project-aware-ai.md

### I02.1 — Make the "grounding (free, anonymous-OK) vs. action (needs auth)" split a first-class distinction
Even beyond the G1 reconciliation in the EDITS file, P2 would read more clearly if it stated the principle up front:
**reading** project context to phrase a better answer rides the cheap client-pushed channel (P2 §D); **doing** something
on the project's behalf ("Ready to send?", seed, prebuild) needs an authenticated surface. That one sentence prevents a
builder from trying to fire actions through the text-only welcome/chat route.

### I02.2 — Cross-link the "Ready to send?" prompt to J4's acceptance bar
P2's prompt engine (§C) generates "Ready to send?"; Piece-5 J4 defines when it's *done* (broker saw exactly what's
going out before it went). Link them so the prompt isn't built without its acceptance test.

---

## 03 — piece-3-signal-layer.md

### I03.1 — Map P3 signal kinds → the journeys/prompts they fuel
P3 lists kinds (`outside-action`, `data-change`, `engagement`, `external-event`, `platform-feature`); Piece-5 shows
which **prompt** each becomes ("7 clicks", "the new data shows X", "Walmart nearby", "new charts that fit this"). A
small "kind → prompt → journey" column in P3 makes the otherwise-invisible reporter's payoff legible.

### I03.2 — Note the sequencing nuance: `outside-action` can ship ahead of its Piece-5 wave
P3's own text says `outside-action` emit depends on the existing claim/import seams and "can ship before or in parallel
with Piece 1." Piece-5's W3 lumps **all** of P3 into the final wave. Flag in P3 that the `outside-action` half is
pullable earlier than W3 if the operator wants "together while apart" sooner — so the wave plan doesn't accidentally
defer the one P3 slice that has no P1 dependency.

---

## 04 — piece-4-editing-refresh-trash.md

### I04.1 — Cross-link J3's acceptance bar to P4 verification, and coordinate the two `deliverables` migrations
P4's verification and Piece-5 J3 cover the same ground (open big → edit → rebuild passes the lints → frozen-link
intact → restore from trash). Tag them together. Also worth a one-liner: P4's `deleted_at`/`supersedes_id` migration
and the G3 scope migration both alter `public.deliverables` — note the ordering so whoever runs them does it once,
cleanly, rather than discovering a half-applied table.

---

## Piece-5 — disposition (cleanup, not correctness)

### I05.1 — Rename and clean the file
`Piece-5` has **no extension** and is wrapped in box-drawing characters (`╭ │ └`) with a gap table that renders as
broken ASCII — it won't display as markdown and reads as a pasted terminal dump. Rename to `05-convergence-and-
journeys.md` and re-flow to real markdown (proper headings, a real gap table). It earns a `05-` slot because the
journey lens is a peer to the four pieces, not a sub-part of one.

### I05.2 — Reduce it to its net-new core
After the EDITS file pulls G1/G3 into the piece docs and drops G7, and after I00.3 replaces the duplicated spine prose
with a pointer, what should remain in `05-…` is the **unique** material: the four journeys, the per-journey acceptance
bar, the wave sequence, and the journey→seam→gap traceability table. That's the convergence layer the four pieces
genuinely lack — everything else in Piece-5 is already said better elsewhere.

### I05.3 — Keep it labeled as a *map*, not a status board
Piece-5 already says "no code this turn — this is the map the build follows." Preserve that framing and keep live
status out of it (per CLAUDE.md RULE 2 — status lives in `SESSION_LOG.md`, the `checks` ledger, and the build queue,
never in a plan doc).
