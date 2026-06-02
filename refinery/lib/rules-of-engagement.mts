/**
 * RULES_OF_ENGAGEMENT — the lean (~200-token) block that travels in every
 * fetch payload's `_meta.rules`, so a downstream (Tier-3) Claude stays honest
 * after the handoff: cite, tag inference, stop at the data grain, only master
 * speculates, plain English.
 *
 * This is a VERBATIM mirror of the lean block in
 * `docs/consumption-contract.md` (the "Lean rules of engagement" section). The
 * doc is the human-facing reference; this constant is the machine-embeddable
 * copy. `rules-of-engagement.test.mts` guards both the token budget AND that
 * this string still appears verbatim in the doc (drift guard).
 *
 * Do NOT embed the full ~2000-token contract in payloads — it is 10× the token
 * cost for zero additional discipline. The lean block is the whole point.
 *
 * TOKEN BUDGET — this block is hard-capped at 350 tokens (chars/4 proxy) by
 * `rules-of-engagement.test.mts`. Rule 7 (STAY IN SCOPE) is load-bearing: it
 * stops the consuming Claude from fetching the lake for off-topic questions
 * (weather, other regions) or framing an ordinary question as a SWFL data gap —
 * the failures that shipped a SWFL pitch onto a Texas-weather question and would
 * have made "is the Arby's open?" return "we don't hold that grain" instead of a
 * normal answer. TWO behaviors, not three: (1) in-grain SWFL lake question
 * (county down to ZIP/named-place) → fetch+route; (2) EVERYTHING else — off-topic
 * OR an ordinary question Claude can just answer (store hours, general knowledge,
 * coding) → be Claude, no fetch, no lake framing, no pitch. CRITICAL: the grain
 * floor is ZIP/named-place, NOT "metro/area" — a named town/beach/ZIP (Fort Myers
 * Beach = 33931) IS in grain and MUST fetch+route (the flagship query). The ONLY
 * hard "don't" is never inventing a SWFL data NUMBER (flood loss, price, stat)
 * for a spot finer than we hold — that's about not fabricating, never about
 * refusing to answer. The cap moved 250 → 350 to fit the explicit ZIP example.
 * Whatever you change here, change the verbatim mirror in
 * `docs/consumption-contract.md` in the same commit — a CI drift test
 * (`toContain`) fails the build otherwise.
 */
export const RULES_OF_ENGAGEMENT = `RULES OF ENGAGEMENT — SWFL Data Gulf
1. CITE. Every number traces to a source in this payload. No number, no claim.
2. TAG INFERENCE. Anything beyond the cited facts is marked [INFERENCE], with the
   value it builds on and one condition that would prove it wrong.
3. STOP AT THE GRAIN. Answer at the grain the data holds. Name what the payload
   lacks plainly — you may offer to pull it, never invent it. A gap is an offer,
   not a dead end.
4. ONLY MASTER SPECULATES. Tier-1 facts carry no opinion. Direction calls and
   predictions come only from master's grounded, conditional thesis.
5. PLAIN ENGLISH. No internal IDs, no jargon (NNN = triple-net rent, never a place
   name), no hedging that re-encodes a hard number into vague words. Quote the
   freshness token once.
6. SPEAK IN PLACES. Answer at metro/area level; zoom to one spot only when the user
   names it — and map any real SWFL place to the area we cover.
7. STAY IN SCOPE. In grain = SWFL (Lee/Collier FL) lake data, county down to ZIP/place
   — a named town, beach or ZIP (Fort Myers Beach = 33931) IS in grain: fetch and route.
   Anything else — off-topic (weather, other regions) or a question you can just answer
   (is a store open, general knowledge, coding) — answer as you normally would: no fetch,
   no lake framing, no pitch. One guard: never invent a SWFL number (flood, price, stat)
   below ZIP.`;
