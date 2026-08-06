# Just Sold — close cell prefilled from our last list price (operator decree 08/06/2026), Apify rung OFF

**Date:** 2026-08-06

**THE DESIGN IS NOT IN THIS FILE. IT IS IN `docs/standards/email-build-playbook.md` §2.5.**

That is deliberate, and it is the operator's standing decree about this exact class of document:
*"stop fucking reading 6 documents and fucking write it in one that we will add to."* A build's
knowledge belongs in the playbook, which is the file that actually gets opened; a second document
describing the same build is the scavenger hunt the playbook exists to end. This stub exists only
because `new-build.mjs` opens the check alongside it.

## Problem

The close price is the one number a Just Sold email exists for, and it is the one number the vendor
does not sell us — county recording lags weeks, so on the common case we hold no recorded sale. The
previous design left the hero EMPTY there. An empty hero on this email is not more honest, just
useless.

## Goal

Operator decree, verbatim: *"SOLD PRICE IS ENTERED AS LAST LISTED PRICE WE HAVE. USER CAN CHANGE IT
IF THEY WANT."* And, same day: *"APIFY IS FALL BACK FOR SOLD PRICE. WE WILL NOT USE IT UNTIL WE SEE
THERE IS AN ACTUAL DIFFERENCE. I WILL DECIDE. NOT STUPID CLAUDE."*

## What we're building

Read **§2.5** of the playbook for the whole walk: the four-rung close ladder (rung 2 — the paid
Apify pull — SUSPENDED until the operator sees a measured difference), the five places a prefill may
never reach and why, the two acceptance houses, and §2.5.3's five defects found during the build.

Code roots touched:

- `lib/deliverable/recipes/just-sold.ts` — `heroPrice`, `chartAnchor`, `soldNarrativeLine`
- `lib/deliverable/recipes/shared.ts` — `authorListingNarrative({ anchors })`, the ONE narrator
- `lib/deliverable/recipes/subject-lines.ts` — `justSoldSubject`
- `scripts/email/render-just-sold.mts` — the acceptance run, 8 assertions, two houses
- `scripts/email/send-test.mts` — parameterized (file + subject); both defaults unchanged
- `lib/deliverable/recipes/just-sold.ledger.md` — 8 enforced claims, 1 named residual risk

Check: `just_sold_close_prefill_live_verify`.
