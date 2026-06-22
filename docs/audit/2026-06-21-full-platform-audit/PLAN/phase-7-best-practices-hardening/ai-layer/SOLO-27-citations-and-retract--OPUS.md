# 27 — Citations API + "retract if no supporting quote" self-check on the conversation path

**Model: Opus.** It touches the **no-invention moat** — the two grounded-prompt assemblies a no-invention
fix must touch (per NOTES §1) — plus a vendor surface (Anthropic Citations API) whose request/response
shape and model-id support drift. **Priority: P3.** This is AI-layer best-practices hardening (a
belt-and-suspenders layer on the **TEXT answer**), not a daily red.

> **SCOPE NARROWED 2026-06-22 — build 20 (charts on the conversation path) HAS LANDED** as the chart
> increments A–D (commits `51997bb0` select-rows, `8d647077` web gap-fill, `304e5aa8` user-provided lane,
> `00975527` upload-scan). Those builds **already gave every charted number a per-lane provenance + a
> verbatim-source check** (see "Dependencies" below). **SOLO-27 is now ONLY about the prose TEXT answer's
> per-claim citations / retract self-check. It must NOT touch, reroute, or re-implement chart provenance** —
> that floor is shipped. Do not regress the chart surfaces listed below.

> **PROVENANCE MODEL — READ FIRST (locked 2026-06-22).** The moat is **"sourced, not payload-only."** A
> number is allowed when it NAMES a real source in plain words: **(1) our data, (2) the user's uploaded
> document, (3) a named web source, (4) a figure the user gave us** (RULES OF ENGAGEMENT rule 1, the same
> four lanes the chart engine enforces). The ONLY thing forbidden is an **invented** number. So this build's
> "retract" self-check is **NOT** "retract anything not in the payload" — that would wrongly delete a
> user/upload/web number and is exactly the behavior we removed. It is **"retract a number that names NO real
> source"** (i.e. an invented one). Citations attach to lane (1); lanes (2)/(3)/(4) are named by their own
> footnote, not retracted.

## The gap (verified)
We ground the conversational answer **structurally** — the payload controls the model's *baseline* context.
That floor is strong, but the prose answer has no claim-by-claim provenance surface and no post-generation
"is every number actually sourced?" pass. On the **conversational follow-up path**, two things are absent:
- **No per-claim citation surface.** The grounded prompt is assembled inline in
  `lib/assistant/conversation-path.ts` (the path that actually runs — `:204-215`, `:245/:446/:527` per build
  20's verification) and again in `lib/grounded-answer.ts` (`buildGroundedSystemPrompt`, ~`:85`). Neither emits
  a machine-checkable `cited_text` per claim — the answer is grounded but not **auditable** claim-by-claim.
  Anthropic's native **Citations API** returns `cited_text` per claim, and `cited_text` does **not** count
  toward output tokens (`round3/q-anthropic-citations.md`).
- **No "name the source or retract" self-check.** The authoritative reduce-hallucinations guidance is: cite a
  source per claim, and **have the model check each number after generating; if it can name no real source,
  retract it** (`round1/brains-anthropic-reduce-hallucinations.md`). Here "real source" = the **four lanes**
  (our data / the user's doc / a named web source / a figure the user gave) — NOT "the payload." A number that
  names one of the four lanes STAYS; only an invented number (no lane) is retracted. "I don't know" is allowed.

This complements — does **not** replace — the structural moat. REPORT verdict for this row: *"✅ aligned
(arguably stronger: structural vs prompt) — ⚠️ could add the native Citations API + the 'retract if no quote'
self-check on the conversation path"* (REPORT "BRAINS / AI LAYER" no-invention row + P3 #11).

Repo anchors confirmed present (probe still required — do NOT trust these blindly): `lib/assistant/
conversation-path.ts`, `lib/grounded-answer.ts`, the Anthropic client `refinery/agents/anthropic.mts`
(`getAnthropic`/`TRIAGE_MODEL`, imported by grounded-answer), and the existing citation-render surface
`lib/citations/clean-url.ts` + `components/CitationList.tsx` (the single citation root per MEMORY — route any
new UI citation through it, don't rebuild).

## Dependencies / file-conflicts
- **Build 20 (charts on the conversation path) is DONE — do not run against a stale picture.** It shipped as
  chart increments A–D. Both this build and 20 touch `conversation-path.ts` + `grounded-answer.ts`, so REBASE
  on current `main` and re-probe before editing — the line numbers in this doc predate A–D and are dead.
- **DO NOT REGRESS the shipped chart surfaces (these are NOT this build's job):**
  - `lib/assistant/compose-chart.ts` — the chart composer. It owns chart provenance via a **4-lane
    `source.citation` footnote** (`SWFL Data Gulf — …` · `From your upload (<file>)` · `Peer data (web): …` ·
    `Provided by you: …`) and a belt `lintChartBlock` over an expanded number set. Leave its tool schema,
    lanes, and footnote format intact.
  - `lib/assistant/gap-fill.ts` — **already does per-claim citation verification for charted web numbers**
    (`valueAppearsInText` / `valueAppearsInCitations`: a web figure is plotted only if its digits appear
    verbatim in a returned `web_search_20250305` `cited_text` span). This is the chart's citation surface; it
    is separate from the prose Citations API SOLO-27 adds. Do not merge, reroute, or replace it.
  - `conversation-path.ts` chart wiring — `chartForConversation(...)`, the `uploadsText` thread, and the
    injected `=== CHART ON SCREEN === / <groundingNote>` block + the `streamAnswer(system + chartBlock + …)`
    composition. SOLO-27 edits the **grounded TEXT system assembly** (`buildGroundedRegionSystem` /
    `buildGroundedSystemPrompt`); it must leave the chart block and its composition untouched.
- **Chart provenance is ALREADY shipped — this build does NOT add it.** A chart number with no citable/
  verifiable source is already **dropped, not emitted** per-lane (held = `lintChartBlock` anchor; web =
  `cited_text` verbatim check; upload = `valueAppearsInText` against the doc; user = footnoted as theirs).
  SOLO-27 does **not** re-implement or move that floor; the earlier "chart must cite via this build" coupling
  is **void**.

## Steps
1. **Probe first (RULE 0.5 — read the actual files, do not trust the line numbers above):**
   - `lib/assistant/conversation-path.ts` — the inline grounded-prompt assembly + how the dossier/`key_metrics`
     reach the model (the path that actually runs); confirm where `cited_text` would attach.
   - `lib/grounded-answer.ts` — the second `buildGroundedSystemPrompt` assembly; whether it shares the dossier
     builder (`buildDossier`/`fetchBrain`) with conversation-path so a fix lands in **both** without diverging.
   - `refinery/agents/anthropic.mts` — the `getAnthropic` client + model id; the request must be built here, not
     hand-rolled.
   - `lib/citations/clean-url.ts` + `components/CitationList.tsx` — the existing single citation root; any
     surfaced citation reuses it.
2. **Vendor-first (RULE 1, MANDATORY — `WebFetch` the LIVE docs in-session before coding):**
   - Citations API: `https://platform.claude.com/docs/en/build-with-claude/citations` — confirm the request
     shape (`document` block with `source` + `citations:{enabled:true}`), the **response** shape (multiple text
     blocks, each `citations[].cited_text` + `document_index` + char/page/block location), streaming
     (`citations_delta`), and current model support. **Load-bearing caveat from the live doc:** *Citations and
     Structured Outputs are incompatible* — enabling `citations` on a document **and** `output_config.format`
     returns **400**. Build 26 adds `strict:true` Structured Outputs to the JSON path; the conversation answer
     is **prose, not strict-JSON**, so they don't collide here — but the brainstorm must confirm this path does
     not also carry an `output_config.format`. Do not hardcode any of this from memory or from the round
     capture; the captured `round3/q-anthropic-citations.md` is a starting pointer, not authority.
   - **Keep the Citations API on the PROSE answer call only.** The chart composer (`compose-chart.ts`) already
     issues its own Anthropic calls — a **forced `tool_use`** selection call and a `web_search_20250305`
     gap-fill call. Do **not** add `citations:{enabled:true}` to those; charts have their own verbatim-source
     check (`gap-fill.ts`). SOLO-27's Citations request belongs solely to the grounded TEXT answer.
3. **RULE 3.5 brainstorm (this is a behavior change — invoke `superpowers:brainstorming` at execution time):**
   decide the layering. The two designs to weigh:
   - **(a) Native Citations API** — pass the grounded dossier rows as `document`/custom-content blocks with
     `citations:{enabled:true}` so the model returns `cited_text` per claim natively. Pro: structurally
     reliable pointers, `cited_text` free on output tokens. Con: changes the request shape on the live
     conversational surface; verify it composes with the existing streaming + chart-frame emit (build 20).
   - **(b) Name-the-source-or-retract self-check** — a lighter prompt-level pass: after the answer, the model
     checks each NUMBER and keeps it only if it can name one of the **four lanes** (our data / the user's doc /
     a named web source / a figure the user gave); a number that names NO lane (invented) is retracted; allow
     "I don't know." **Do NOT retract a user/upload/web number for being absent from the payload** — that is
     the removed payload-only behavior. Pro: minimal surface change, additive to the structural floor. Con:
     prompt-level, not machine-guaranteed.
   - These are **complementary, not exclusive** — (a) for the citation surface (esp. for build-20 chart
     rows), (b) as the cheap self-check. Decide whether to ship one, both, or stage (b) first then (a). Keep
     the structural moat intact either way — this is belt-and-suspenders, never a replacement.
4. Implement on the path that **actually runs** (conversation-path inline) and the shared `grounded-answer.ts`
   assembly **together** so the two do not silently diverge (the exact divergence build 20 calls out). Wire any
   surfaced citation through `lib/citations/clean-url.ts` + `components/CitationList.tsx` — do not rebuild the
   citation root.

## Done when
- A live conversation-path follow-up that states a number either (a) carries a `cited_text` pointer back to a
  real grounding row (lane 1), OR (b) names its lane (your doc / a web source / a figure you gave), OR (c) is
  retracted only when it can name NO real source (invented) — verified against a deployed request, not a unit
  mock. A properly-sourced user/upload/web number must **survive**, not be retracted. Add a proof line to
  `verification/answer-proofs.jsonl` (the answer-fix-proof gate, per MEMORY) showing a live, non-deflecting,
  leak-free, four-lane-honest answer.
- ~~A build-20 chart with no citable grounding row is dropped, not emitted via this build~~ — **VOID, already
  shipped by builds A–D** (per-lane drop: held/web/upload/user). SOLO-27 neither adds nor changes this; just
  confirm at review that the chart surfaces in "Dependencies" are untouched and still green
  (`bun test lib/assistant/compose-chart.test.ts lib/assistant/gap-fill.test.ts`).
- The structural moat is unchanged (no payload fact is reachable that wasn't before); the
  `buildGroundedSystemPrompt` golden snapshot test still passes (or is updated deliberately, with the diff
  reviewed). Live-verify after deploy (sibling to build 20's `one_assistant_unify_live_verify`).

## Risk
Medium (no-invention surface + two prompt assemblies + a live vendor request-shape change on a paid public
endpoint). Contained by: serializing **after** build 20, keeping the structural floor intact (additive only),
the Citations↔Structured-Outputs 400 incompatibility check in the vendor-first step, and the
`verification/answer-proofs.jsonl` live-proof gate. Opus for the moat-sensitivity.

## References (added 2026-06-22)
**best-practices-research (docs/audit/2026-06-21-best-practices-research/):**
- `docs/audit/2026-06-21-best-practices-research/round3/q-anthropic-citations.md` — native Citations API returns cited_text per claim
- `docs/audit/2026-06-21-best-practices-research/round1/brains-anthropic-reduce-hallucinations.md` — quote-first grounding; cite a source per claim, retract if no supporting quote; allow "I don't know"
**crawl4ai-live (docs/audit/2026-06-21-crawl4ai-live/):**
- (n/a — AI-layer build)
**Ties to existing builds:** build 20 / chart increments A–D — **SHIPPED**; charts already carry per-lane provenance + a verbatim-source check (`compose-chart.ts` + `gap-fill.ts`), so SOLO-27 is scoped to the prose TEXT answer ONLY and must not touch those surfaces. Structural payload moat: CLAUDE.md THE-GOAL.
**Verified (live docs, 2026-06-22 — re-fetch at build time):** Citations API request = `document` block + `citations:{enabled:true}`; response = text blocks each carrying `citations[].cited_text` + `document_index` + location (char/page/block); `cited_text` is free on output tokens; **Citations + Structured Outputs are incompatible (400)** — folded into Steps 2/3 above.
