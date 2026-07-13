# 27 — Never-dead-end text answer: try-to-find (uploads → cited web), collected sources link, NEVER "I don't know"

**Model: Opus.** It touches the **no-invention moat** — the grounded text-answer prompts (`conversation-path.ts`
+ `grounded-answer.ts`). **Priority: P3.** AI-layer best-practices hardening on the **TEXT answer**, not a daily
red.

> **RESCOPED 2026-06-22 (operator decree — supersedes the original "Citations API + retract-if-no-quote" framing).**
> The original plan imported two things that contradict standing decisions and have been **removed**:
> 1. **The native Anthropic Citations API (inline per-claim `cited_text`) is DROPPED.** Chat prose stays clean
>    — sources never get woven into sentences. The Citations API surfaces inline auditability the operator
>    explicitly does not want in chat. (Bonus: the "Citations + Structured Outputs = 400" incompatibility is
>    now moot — we don't enable it at all.)
> 2. **"Allow the model to say 'I don't know'" is DELETED — it was a stock-advice contaminant.** It was
>    copy-pasted from `round1/brains-anthropic-reduce-hallucinations.md` ("Allow Claude to say 'I don't
>    know'") and never reconciled against this repo's STANDING rule. We do **not** dead-end. The shipped
>    highlighter path already encodes the law (`lib/highlighter/grounding.ts:153`): *"Never dead-end with 'I
>    don't know' or 'not something I hold' … LANE 1 (grounded), LANE 2 (general), or LANE 3 (offer to find).
>    Pick one; do not refuse."* SOLO-27 PORTS that pattern to the text path — it does not reintroduce the shrug.

## The shape (operator-locked 2026-06-22)

1. **Prose stays clean — no inline citations.** A number is stated in plain prose; the source is NOT written
   into the sentence ("(per Colliers)" never appears in chat).
2. **Sources collect in a COLLAPSED box at the END of the answer**, not inline — a short `Sources (n) ▸` row
   that expands to the list. Use the **existing `components/CitationList.tsx` (the single citation root),
   collapsed by default** — NOT a link to a separate surface (a link saves a sliver more space but costs a
   context-switch + a new destination to build/maintain, wrong trade in chat). They are *collected*, not woven
   in. **This saves chat room on purpose:** sources are load-bearing on **deliverables and charts** (those
   already carry them — `CitationList` on deliverables, the `compose-chart.ts` footnote on charts) and the chat
   answer is already grounded structurally, so chat gets the lean collapsed box, not a second heavy citation
   surface.
3. **For a number we don't hold, the AI TRIES to find it — it does not punt.** The ladder:
   **(a) check the user's uploads first** (`currentProjectUploadsText` is already threaded into the
   conversation path — Increment D), **(b) then web-search for a citable source** (reuse the proven
   `lib/assistant/gap-fill.ts` `web_search_20250305` verbatim-cite engine — the same one charts use). A figure
   found this way is stated with its source dropping into the collected list.
4. **If it can't find it — NEVER "I don't know."** It ends with an action: **suggest the user google it,
   surface the search link, and invite the user to hand it over** ("give it to me and I'll use it" — the
   operator sources or writes it into the answer). Find-it-or-give-it-to-me, never a dead-end.

**Trigger is bounded (not "re-search everything").** The find-attempt fires on the SAME condition LANE 3
already fires on today: a SWFL number the user's question needs that is *finer than the grounded blocks hold*
— not a blanket re-verification of numbers we DO hold (those are grounded; leave them). So a normal answer
about held data costs nothing extra; the web call only runs on a genuine gap.

## The gap (verified — probe confirms it's real)

`lib/highlighter/grounding.ts` (the **highlighter / in-page** path) already does all of the above: LANE 3 =
*"do NOT invent it. Offer to find it — say we can pull it, or that they can hand the report to their own
Claude. An offer, never a fabricated number."* + the never-dead-end floor at line 153.

The **conversational text path does not** — `conversation-path.ts` + `grounded-answer.ts`
(`buildGroundedSystemPrompt`) still carry a weaker "offer to pull" on a gap (offer to pull OUR data) and have
**no upload→web find-ladder and no collected sources link**. This is the exact gap MEMORY flags
(`project_four-lane-provenance-moat`: *"the live TEXT-answer prompts … still say 'offer to pull' on a gap —
teaching the text answer to actively use lanes 2–4 is SOLO-27's implementation"*). So SOLO-27 = **port the
grounding.ts lane pattern to the text path + wire the upload→cited-web find-ladder + add the collected sources
link.** No Citations API. No "I don't know."

This complements — does **not** replace — the structural moat (the payload still controls the model's baseline
context). It is belt-and-suspenders on top of that floor.

## Dependencies / file-conflicts

- **Build 20 (charts on the conversation path) is DONE** — chart increments A–D
  (`51997bb0` / `8d647077` / `304e5aa8` / `00975527`). Both this build and 20 touch `conversation-path.ts` +
  `grounded-answer.ts`, so **rebase on current `main` and re-probe** before editing — any line numbers below
  predate A–D and are dead.
- **REUSE, do not rebuild:**
  - `lib/assistant/gap-fill.ts` — the cited web-search engine (`fillExternalPoint`, `parseCitedSpans`,
    `valueAppearsInCitations`, the blocked-domain self-heal). This is the "(b) web-search for a source" rung.
    SOLO-27 calls it for the TEXT answer's gap; it must NOT alter the chart wiring of it.
  - `currentProjectUploadsText(projectId)` in `conversation-path.ts` — the cookie-authed, RLS-scoped read of
    the current project's uploaded-doc text. This is the "(a) check uploads first" rung. Reuse it; the
    verbatim-digit check is `valueAppearsInText` (already in `gap-fill.ts`).
  - `lib/citations/clean-url.ts` + `components/CitationList.tsx` — the SINGLE citation root (per MEMORY). The
    end-of-answer collected sources link renders through THIS, not a new component.
- **DO NOT REGRESS the shipped chart surfaces (NOT this build's job):** `lib/assistant/compose-chart.ts`
  (4-lane `source.citation` footnote + `lintChartBlock`) and the `conversation-path.ts` chart wiring
  (`chartForConversation`, the `=== CHART ON SCREEN ===` block). SOLO-27 edits the grounded **TEXT** system
  assembly only; leave the chart block, its tool schema, and its composition untouched.

## Steps

1. **Probe first (RULE 0.5 — read the actual files, the line numbers above may be stale):**
   - `lib/highlighter/grounding.ts` — the LANE 1/2/3 pattern + the never-dead-end floor (line ~153). This is
     the SOURCE pattern to port; copy its lane wording so the two paths read identically.
   - `lib/assistant/conversation-path.ts` — the inline grounded-prompt assembly (the path that actually runs),
     where `currentProjectUploadsText` is already threaded, and where the gap-fill call would attach.
   - `lib/grounded-answer.ts` — the second `buildGroundedSystemPrompt` assembly; confirm it shares the dossier
     builder with conversation-path so the lane port lands in **both** without diverging.
   - `lib/assistant/gap-fill.ts` — the upload (`valueAppearsInText`) + cited-web (`valueAppearsInCitations`)
     engine to reuse for the find-ladder.
   - `lib/citations/clean-url.ts` + `components/CitationList.tsx` — the collected-sources render root.
2. **Vendor-first (RULE 1 — `WebFetch` the LIVE docs in-session before coding ONLY the surface you actually
   use):** the find-ladder's web rung uses the **`web_search_20250305` server tool** (already proven live in
   `gap-fill.ts`) — reconfirm its request/response + `cited_text` span shape at build time if the call shape
   changes. **The native Citations API document-block feature is NOT used** (dropped above), so do NOT fetch or
   wire it, and the Citations↔Structured-Outputs 400 caveat does not apply here.
3. **RULE 3.5 brainstorm at execution time** — the shape is LOCKED (operator decree 2026-06-22); no open
   design calls remain. Locked decisions to implement, not re-litigate:
   - **Find runs INLINE on a gap.** The find-ladder fires **at answer time, on a genuine gap only** (a number
     the question needs that we don't hold — the LANE-3 trigger), so it never fires for held data. This is the
     default and ships first.
   - **One-click is a user-requestable fallback, not the default.** If a user doesn't like the inline find, a
     one-click "Want me to go find this?" affordance can be offered later — build it only on request, do not
     gate v1 on it.
   - **Sources box is the collapsed `CitationList`, collapsed by default** (per the shape, point 2) — never
     rendered into the prose.
   - Keep the structural moat intact — additive only, never a replacement.
4. **Implement on the path that actually runs (`conversation-path.ts`) AND the shared `grounded-answer.ts`
   assembly together** so the two do not silently diverge. Port the grounding.ts LANE 1/2/3 wording (incl. the
   never-dead-end floor and the find-it-or-give-it-to-me LANE 3) into both. Wire the find-ladder (uploads →
   cited web) on the gap. Render the collected sources in the end-of-answer collapsed box via `CitationList`
   (collapsed by default) — do not rebuild the citation root.

## Done when

- A live conversation-path follow-up about **held** data states the number in **clean prose with NO inline
  citation**, and its source is reachable in the **end-of-answer collapsed sources box** (`CitationList`,
  collapsed by default — not woven into the sentence).
- A follow-up that needs a number we **don't hold** triggers the find-ladder: the answer either (a) states it
  **with a source** found in the user's uploads or via cited web search (source in the collected link), or
  (b) when nothing is found, ends with the **action** — "google this, here's the link, hand it to me and I'll
  use it" — and **NEVER** with "I don't know" / "not something I hold" / a flat refusal.
- The structural moat is unchanged (no payload fact is reachable that wasn't before); the
  `buildGroundedSystemPrompt` golden snapshot still passes (or is updated deliberately, diff reviewed).
- The shipped chart surfaces are untouched and green
  (`bun test lib/assistant/compose-chart.test.ts lib/assistant/gap-fill.test.ts`).
- A proof line is appended to `verification/answer-proofs.jsonl` (the answer-fix-proof gate, per MEMORY)
  against a **deployed request** — showing a live, non-deflecting, leak-free answer that (i) cites a held
  number to the collected list, (ii) finds a gap number with a real source, and (iii) on a not-found gap
  offers find-it-or-give-it-to-me, never a shrug. Live-verify after deploy (sibling to build 20's
  `one_assistant_unify_live_verify`).

## Risk

Medium (no-invention surface + two prompt assemblies + a live web-search call on a paid public endpoint).
Contained by: serializing **after** build 20, keeping the structural floor intact (additive only), reusing the
already-proven `gap-fill.ts` find engine (no new vendor surface beyond the web rung), and the
`verification/answer-proofs.jsonl` live-proof gate. Opus for the moat-sensitivity.

## References (updated 2026-06-22)

- `lib/highlighter/grounding.ts` — the SHIPPED never-dead-end LANE 1/2/3 pattern this build ports to the text
  path (line ~153: never "I don't know"; LANE 3: offer to find, never fabricate).
- `lib/assistant/gap-fill.ts` — the proven upload (`valueAppearsInText`) + cited-web (`web_search_20250305`,
  `valueAppearsInCitations`) find engine to reuse.
- `docs/audit/2026-06-21-best-practices-research/round1/brains-anthropic-reduce-hallucinations.md` — quote-first
  grounding; cite a source per claim. **NOTE:** its "allow 'I don't know'" line is explicitly OVERRIDDEN by
  this repo's never-dead-end rule and is NOT adopted.
- **Ties to existing builds:** build 20 / chart increments A–D — **SHIPPED**; charts already carry per-lane
  provenance + a verbatim-source check, so SOLO-27 is scoped to the prose TEXT answer ONLY and must not touch
  those surfaces. Structural payload moat: `CLAUDE.md` / `THE-GOAL.md`.
