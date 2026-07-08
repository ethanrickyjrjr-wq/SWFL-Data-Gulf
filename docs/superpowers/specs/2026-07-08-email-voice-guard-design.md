# voiceGuard banned-phrase lint on AI email commentary

**Date:** 2026-07-08 · **Recommended model:** ⚡ Sonnet · **Check:** `email_voice_guard_live_verify`

## Problem

The email AI writes the connective prose around the coded data grid (the New-Listing-pill commentary
path: `author-doc.ts` → `build-doc.ts`). Unconstrained LLM prose regresses to a recognizable "robot
register" — over-formal openers ("I hope this email finds you well"), corporate filler ("circle back",
"in today's fast-paced market"), and hedges ("it's worth noting that"). This was the single
highest-engagement finding in the 07/08/2026 AI-design/email social sweep (a ~22.9k-upvote / 2,409-comment
r/ChatGPT thread: "a simple email that didn't sound like a robot"). A deliverable that reads as templated
AI is the one an agent won't pay to send — and "send is the paywall," so voice quality is revenue-adjacent.

We already guarantee **no invented number** via `lintAuthoredProse` (the sentence-level strip + one
regeneration in `build-doc.ts`). We have **no** guard on robotic *phrasing*.

## Goal

A `voiceGuard` that flags corporate-AI "tells" in authored email prose and removes them — composed into
the EXISTING author repair loop (no second LLM round-trip), phrase-surgical so a co-located cited number
is never lost. The list starts conservative (universal corporate-AI tells only, near-zero false positives)
and grows from real sends.

## Design decisions (locked with operator 07/08/2026)

- **Remedy = regenerate + phrase-strip.** On the first draft, banned phrases are added to the *existing*
  single regeneration ask; any that survive the retry are surgically deleted (just the phrase, not the
  sentence — unlike an invented number, a tell is not an invention, so whole-sentence strip is wrong and
  would risk deleting a real figure).
- **List scope = corporate-AI tells only** for v1. No real-estate clichés ("nestled", "boasts",
  "stunning"), no debatable common words ("reach out", "leverage") — agents genuinely use those. Grow later.
- **ONE root** for the list: `lib/email/voice-guard.ts` exports `VOICE_TELLS`.

## What we're building

### 1. New module `lib/email/voice-guard.ts` (pure — mirrors `lintAuthoredProse`)

```
export interface VoiceTell { pattern: RegExp; label: string }

export const VOICE_TELLS: VoiceTell[]     // the ONE authoritative list (below)

export interface VoiceGuardResult {
  ok: boolean;                 // no tells found
  tells: string[];             // distinct matched phrases, for the regeneration ask
  stripped: EmailDoc;          // doc with each tell phrase surgically removed + whitespace tidied
}

export function detectVoiceTells(doc: EmailDoc): string[]        // matched phrases (distinct)
export function stripVoiceTells(doc: EmailDoc): EmailDoc         // phrase-level removal + tidy
export function voiceGuard(doc: EmailDoc): VoiceGuardResult      // convenience: detect + strip in one pass
```

**Field coverage — no drift.** voiceGuard walks the SAME prose surfaces `lintAuthoredProse` walks. To
guarantee they can't diverge, `author-doc.ts` exports its `PROSE_FIELDS` and the two nested field lists
(columns: `["heading","body","linkLabel"]`, items: `["lead","text"]`); `voice-guard.ts` imports them. A
shared `walkProseFields(doc, fn)` helper (added to `author-doc.ts`, or a small `prose-fields.ts` both
import) is the cleanest — decide at implementation, but the field lists MUST have one source.

**Strip semantics.** For each match, replace the phrase with `""`, then tidy: collapse resulting double
spaces, drop a space left before punctuation, and if the strip left an orphaned lowercase sentence start,
capitalize it. Never touch numbers. If stripping empties a field, leave it empty (assembly already
tolerates empty prose fields).

### 2. `VOICE_TELLS` — v1 list (corporate-AI tells only)

Case-insensitive, boundary-aware. Patterns (label in parens):
- `I hope this (email )?finds you well` / `I hope you('re| are) (doing )?well` (greeting-cliché)
- `circle back` (corporate-filler)
- `in today's (fast-paced|ever-changing|competitive|dynamic) (world|market|landscape|environment)` (filler-opener)
- `(please )?don't hesitate to` (hedge)
- `seamless(ly)?` (buzzword)
- `delve into|\bdelve\b` (ai-tell)
- `at the end of the day` (filler)
- `it's worth noting( that)?|it's important to note( that)?` (hedge)
- `unlock your|elevate your` (buzzword)
- `we('re| are) (thrilled|excited) to` (filler-opener)
- `look no further` (cliché)
- `rest assured` (hedge)

Apostrophes match both `'` and `'`. Each entry keeps its `label` for future analytics; v1 only uses the
matched text.

### 3. Author-prompt nudge (belt-and-suspenders)

One line added to the author instructions (`AUTHOR_TOOL.description` or `authorSystem`): *"Write like a
real person, not corporate AI — no filler like 'I hope this finds you well', 'circle back', or 'in today's
fast-paced market'."* Keeps first drafts usually clean so the lint rarely has to fire; the lint is the
structural backstop, not the only defense.

### 4. Wire into the repair loop (`build-doc.ts`)

Extend the existing gate (currently: `lintAuthoredProse` → regenerate once if `!lint.ok` → strip):
- After the first assemble+parse, compute `const tells = detectVoiceTells(doc)` alongside `lint`.
- Trigger the single regeneration when `!lint.ok || tells.length > 0` (was: `!lint.ok`).
- Build the retry `retryUser` from BOTH: the existing number-offender lines (only when `!lint.ok`) AND,
  when `tells.length`, a voice block: *"These phrases read as robotic AI filler — rewrite the copy without
  them:"* + the tells.
- After the retry parse: apply the number strip (existing `lint2.stripped` when `!lint2.ok`) and THEN
  `stripVoiceTells` on the result (number-strip is sentence-level and must run first; voice-strip is
  phrase-level on what remains).
- Track a `voiceStripped: boolean` in the returned meta beside `stripped`/`regenerations`.

**Cost:** one extra author call only when a tell is present on the first draft — identical to today's
invention path. No detection round-trip (detection is pure/local).

### 5. Tests — `lib/email/voice-guard.test.ts`

- Each `VOICE_TELLS` entry is detected in a `text` block body.
- `stripVoiceTells` removes the phrase AND a sentence sharing it keeps its cited number
  ("I hope this finds you well — the median in 33914 is $485,000" → number survives).
- Whitespace/punctuation tidy after a mid-sentence strip.
- Nested surfaces: a tell inside a `multi-column` column body and a `list` item text is caught.
- A clean doc returns `ok:true` and an unchanged `stripped` doc (referential-ish: same content).
- Apostrophe variants (`don't` vs `don't`) both match.
- False-positive guard: "reach out", "leverage", "stunning", "boasts" are NOT flagged in v1.

## Out of scope (v1 — YAGNI)

Per-user custom banned lists; severity tiers; a config surface; real-estate clichés; the "reach
out"/"leverage" aggressive set. The list is a static array grown from observed sends.

## Files touched

- **new** `lib/email/voice-guard.ts`
- **new** `lib/email/voice-guard.test.ts`
- **edit** `lib/email/author-doc.ts` — export shared prose-field lists (or add `walkProseFields`)
- **edit** `lib/email/build-doc.ts` — compose voiceGuard into the repair loop + `voiceStripped` meta
- **edit** author prompt string (in `author-doc.ts`) — the one-line human-voice nudge

## Verification

- `bun test lib/email/voice-guard.test.ts` + the existing `author-doc.test.ts` stays green.
- `bunx next build` clean (per memory: verify with next build, not npx tsc).
- Live-verify (`email_voice_guard_live_verify`, operator-run): author a New-Listing email whose draft
  would normally open "I hope this email finds you well…" and confirm the shipped commentary is clean and
  the cited figures are intact.
