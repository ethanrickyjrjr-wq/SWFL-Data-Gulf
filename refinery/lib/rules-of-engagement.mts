/**
 * RULES_OF_ENGAGEMENT — the lean (~200-token) block that travels in every
 * fetch payload's `_meta.rules`, so a downstream (Tier-3) Claude stays honest
 * after the handoff: cite, tag inference, stop at the data grain, only master
 * speculates, plain English, stay in scope.
 *
 * FORM — seven verb-keyed rules (CITE / [INFERENCE] / GRAIN / MASTER ONLY /
 * CLEAN / PLACES / SCOPE). This is the compressed form: the same discipline the
 * old full-sentence block carried, verb-keyed.
 *
 * PROVENANCE MODEL (locked 2026-06-22 — "sourced, not payload-only"). Rule 1 is
 * the FOUR-LANE rule the chart engine already enforces, now universal to every
 * answer: a number is allowed when it NAMES a real source in plain words —
 *   (1) our data,  (2) the user's uploaded document,  (3) a named web source,
 *   (4) a figure the user gave us.
 * The ONLY thing forbidden is an INVENTED number (one with no real source). The
 * old "no source in THIS PAYLOAD → no claim" framing was payload-only — it wrongly
 * refused user/upload/web numbers; that is gone. "Never invent" stays absolute.
 * Rule 5 keeps "NNN = triple-net rent, never a place name" (the acronym's meaning
 * AND the place-name-misread guard).
 *
 * VERBATIM MIRROR — this constant is the machine-embeddable copy. Three
 * human-facing mirrors must stay byte-identical, all guarded by
 * `rules-of-engagement.test.mts` (`toContain` drift checks):
 *   - `docs/consumption-contract.md` (the lean-block fence)
 *   - `THE-CONTRACT.md` (the displayed lean block)
 *   - `CLAUDE.md` ("Rules of engagement" fenced block)
 * Whatever you change here, change all three in the SAME commit or the build
 * fails. (Previously only consumption-contract.md was guarded, which is why
 * CLAUDE.md silently drifted to a stale 5-rule copy.)
 *
 * Do NOT embed the full ~2000-token contract in payloads — it is 10× the token
 * cost for zero additional discipline. The lean block is the whole point.
 *
 * TOKEN BUDGET — hard-capped at 280 tokens (chars/4 proxy) by the test. The cap
 * is a re-bloat guard, not a context constraint. (Bumped 220→280 when rules 1/3/7
 * adopted the four-lane provenance model above — naming all four real sources in
 * plain words costs ~46 tokens and is the whole point; +46 tokens per payload is
 * negligible against the clarity it buys.)
 *
 * RULE 7 (SCOPE) is load-bearing — TWO behaviors + ONE guard:
 *   (1) An in-grain SWFL lake question (county down to ZIP / named place — Fort
 *       Myers Beach = 33931 IS in grain) → fetch + route.
 *   (2) Everything else → be Claude: no fetch, no lake framing, no pitch. This
 *       covers off-topic asks (weather, other regions) AND ordinary questions a
 *       model just answers. The "Arby's on Cleveland Ave" anchor is deliberate:
 *       a named SWFL place can still be an operational question (store hours),
 *       not a market-data one — answer it normally, do NOT fetch.
 *   GUARD: never invent a SWFL data NUMBER finer than we hold (below ZIP) — that
 *   is about not fabricating, never about refusing to answer.
 * The two failures this prevents: a SWFL pitch fired onto a non-SWFL question,
 * and a store-hours question answered with "we don't hold that grain."
 */
export const RULES_OF_ENGAGEMENT = `RULES OF ENGAGEMENT — SWFL Data Gulf
1. CITE: every number names its real source in plain words — our data, your uploaded doc, a named web source, or a figure you gave us. No real source → don't state it; never invent one.
2. [INFERENCE]: mark anything beyond cited facts; give the base value + one falsifier.
3. GRAIN: answer at the grain held; a gap = fill it from a named source (rule 1), never invent.
4. MASTER ONLY: tier-1 = fact, no opinion; direction/prediction from master's thesis only.
5. CLEAN: no internal IDs, no jargon (NNN = triple-net rent, never a place name), no hedge-encoding hard numbers; state the as-of date (MM/DD/YYYY) once, never the raw token.
6. PLACES: SWFL; named places = Florida, not elsewhere; zoom on named spot.
7. SCOPE: in-grain = SWFL lake data (Lee/Collier, county→ZIP; named town/beach = ZIP) → fetch + route. Else be Claude — no fetch/framing/pitch: off-topic, other regions, OR ordinary answerables (Arby's on Cleveland Ave = answer normally). GUARD: never invent a SWFL number — state only one with a named source (rule 1).`;
