# PENDING PLAYBOOK EDIT — §1.9 distance rule (blocked by another session's claim 08/10/2026)

Insert the block below into `docs/standards/email-build-playbook.md`, at the END of the §1.9
bullet list — directly after the line `- **Close on an open-ended question**, not a figure.` and
before the `### 1.9a Zip codes` heading. Then delete this file and close check
`playbook_distance_rule_line`.

The CODE side already shipped in commit 31436091 (humanDistance + AREA instruction + tests +
showcase rebake). Only this doc line is owed.

---

- **DISTANCES SPEAK LIKE A PERSON — quarters and halves, never decimals.** Operator decree
  08/10/2026, off "a grocery store 0.57 miles away" in a live render: *"NEED TO MAKE SURE THESE ARE
  1/2 MILE OR QUARTER MILE OR HALF MILE. WE AREN'T BEING EXACT HERE."* A distance in email prose is
  "about a quarter mile", "about half a mile", "about three-quarters of a mile", "about a mile" —
  never "0.57 miles". **THE ONE ROOT: `humanDistance()` in `lib/listings/neighborhood-amenities.ts`**
  — it formats the distance INSIDE the amenity fact line every address-spine narrator reads
  (§1.14b's lesson: hand the writer the string exactly as it should appear, never a raw value plus a
  restraint), and the AREA instruction in `recipes/shared.ts` orders the model to repeat it as
  written. Any new surface that renders a distance calls `humanDistance` — never formats miles
  inline. (Same lesson as the 08/06/2026 open-house correction — *"No one says a fucking golf course
  .57 miles away"* — which had only been applied to the invitation branch, not the fact line.)
