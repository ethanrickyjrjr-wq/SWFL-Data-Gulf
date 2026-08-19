## Enforced
- Claim: an ask price is never mislabeled as a close (`closeFrom` refuses a last-list price)
  Test: lib/deliverable/recipes/just-sold.test.ts > "REFUSES a last-list price — an ask is not a sale"
- Claim: the close cell PREFILLS from the last list price we hold, verbatim, and carries no
  sold-date kicker when it does (operator decree 08/06/2026)
  Test: lib/deliverable/recipes/just-sold.test.ts > "F6 · NO recorded sale → the last list price PREFILLS it, with NO sold-date kicker"
  Test: lib/deliverable/recipes/just-sold.test.ts > "F9 · the prefill is our list price VERBATIM — never reformatted"
- Claim: nothing held at all is an OPEN SLOT, never a zero
  Test: lib/deliverable/recipes/just-sold.test.ts > "F8 · nothing held at all → an OPEN SLOT, never a zero"
- Claim: a prefill never reaches a COMPARISON cell (`List-to-Sale`, `List Price`) or a footnote.
  `$/Sq Ft` LEFT this claim 08/19/2026 by operator decree ("SQ FT IS JUST LISTED AS THE LAST
  PRICE WE HAD... IT'S SIMPLE MATH"): it rides the hero's own ladder — recorded close first,
  else the last-held price — and the send-time sale-price confirm recomputes it from the
  agent's answer.
  Test: lib/deliverable/recipes/just-sold.test.ts > "F1/F3 · with a prefill in the hero, the COMPARISON cells stay OPEN — but $/Sq Ft fills"
  Test: lib/deliverable/recipes/just-sold.test.ts > "F2 · the footnote claims nothing when nothing was computed"
  Live: scripts/email/render-just-sold.mts assertion 4, read off the rendered HTML
- Claim: a prefill is never a chart bar — the comps chart anchors on a RECORDED close or is dropped
  Test: lib/deliverable/recipes/just-sold.test.ts > "F4 · a prefill is NEVER a bar"
  Live: render-just-sold.mts assertion 6
- Claim: the closer prose is digit-free — it can never name a sale price or restate the prefill
  (the 08/09 sentence-bank rebuild made the old narrator guard stronger: no figure at all)
  Test: lib/deliverable/recipes/just-sold.test.ts > "F5 · the CLOSER names no figure, speaks to the READER, and asks the one question"
  Live: render-just-sold.mts assertion 8
- Claim: no paid sold-price lane (Apify / property-tax) is wired into this recipe — SUSPENDED by
  operator decree 08/06/2026 until he decides there is a measured difference
  Test: lib/deliverable/recipes/just-sold.test.ts > "this recipe reaches for no paid sold-price lane"
- Claim: the seller's for-sale description does NOT ship on a sold email (a pitch is stale once the
  house closes; "don't miss this opportunity" under a JUST SOLD ribbon, measured by rendering it)
  Test: lib/deliverable/recipes/just-sold.test.ts > "no `description:` is handed to the chrome — the pitch is stale once it closes"
  Live: render-just-sold.mts assertion 7

## Unenforced
- Claim: an agent who edits nothing ships a list price under a "Just Sold" headline. The stated
  mitigation is that the cell is VISIBLE, LABELLED and EDITABLE — that is a property of the editing
  surface, not of this recipe, and nothing here tests it. §2.5.0 rules that a stronger guard belongs
  at SEND (confirm the close before the send completes), never at BUILD — blocking the build
  re-creates the empty-hero failure the decree struck. Named so the residual risk is deliberate.
