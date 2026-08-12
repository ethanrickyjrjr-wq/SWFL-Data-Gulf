# HANDOFF — Open House: what the operator DECIDED, what got found, and everything still owed

**Written 08/12/2026.** This session started as "fan out sonnets and get plans going" on the four
Open House work packages and ended somewhere else entirely — a settled RSVP design, a correction to
how our own click tracking works, and a guard gap. **Nothing in this session was committed.** This
document exists so none of it has to be rediscovered.

**Read order for a session picking this up:**
1. This file — the decisions and the owed list.
2. `docs/handoff/2026-08-12-open-house-build-plan-parallel-sonnet-assignments.md` — the package
   split, now carrying a COORDINATION section added this session (collisions, corrections).
3. The four plan docs: `docs/superpowers/plans/2026-08-12-open-house-pkg{1,2,3,4}-*.md`.
4. `_RESEARCH/email-and-social/2026-08-12-open-house-invitation-craft.md` §7 and §8 — the RSVP
   evidence and the verbatim calendar link formats.

---

## 1. OPERATOR DECISIONS — settled, do not relitigate

**1a. ONE call to action. The listing goes in as a plain text LINK, not a second button.**
Verbatim: *"JUST DO 1. CAN'T WE ADD A LINK TO THE LISTING AT THE BOTTOM?"* — and he was right that
this needs no test exception. `lib/deliverable/campaign-coherence.test.ts:123` counts blocks of type
`button` only (`s.filter((x) => x === "button").length` must be `1`, asserted across every lifecycle
email). A text link is not a `button` block. The chrome already has a `tail` slot
(`lib/email/lifecycle-chrome.ts:149-152`) for blocks riding after the narrative, which the seam's
zone fence sorts into the CLOSE zone; that is what the sources list already uses. **So: RSVP is the
sole button, the listing link rides the tail, no guard is amended.** Package 2 shrinks.

**1b. RSVP = CALENDAR.** Not a mailto reply, not a form. His reasoning, recorded because it is
product judgment we should not re-derive: *"I don't see many people replying to an open house email
about a rsvp. Hard to get them to sign their info when they are at the open house."*

**1c. The QR appears AFTER the click, never in the email.** It encodes the destination page so a
desktop reader can hand the event to their phone — *"If on computer, they can scan with phone
still."* This also happens to dodge the one documented QR anti-pattern (§7c of the research: a
deliverability vendor names "using a QR code when a button would work better" as its #1 mistake,
which is exactly the same-device objection the operator raised himself).

**1d. Invitation copy band: ~60–70 words.** Chosen over both the live 15–35 constraint
(`lib/deliverable/recipes/shared.ts:602`) and the 50–125 email body band
(`docs/standards/email-build-playbook.md:397`, encoded at `lib/narratives/length.ts:29-36`). It
matches the real published open-house template found in this session's research — a sourced middle
point, NOT an average of the two bands. **This number is needed in two places:** Package 4's length
assertion AND Package 3's grounding feed, because the grounded AI gets told which constraint is
true and citing the wrong one is itself the drift failure that package exists to prevent.

**1e. The invitation validator is a KEYED REGISTRY, not a file-placement choice.** Verbatim:
*"HOW CAN WE NOT JUST TAG IT OR CONNECT IT WITH OPEN HOUSE EMAILS AND ALL OTHER THINGS THAT NEED IT
IN THE FUTURE ARE WIRED INTO IT? WHY IS THIS SO HARD?????"* A surface declares its validation SHAPE
and registers; open house declares itself an invitation; the next recipe declares its own; nothing
forks. **We already use this pattern three times — copy one of them, don't invent a fourth shape:**
`lib/email/social/platforms.ts` (8 platforms, one root), `lib/email/lab/capabilities.ts` (tier dial,
routing DERIVED not hand-maintained), `apply-brand.ts:74-109` (button destinations by ROLE).

---

## 2. THE BIG CORRECTION — click tracking already exists, and the page was never the mechanism

**I told the operator the RSVP landing page was what bought us click tracking. That was wrong, and
he caught it by asking.** The correction matters for the build, so it is recorded plainly:

`lib/email/campaign-click-alert.ts` — the click event carries `data.click.link` (**the exact URL
clicked**), `data.to[0]` (the recipient), and `data.broadcast_id` (the campaign). Its own comment:
*"The exact URL clicked — recorded now, filtered on later (per-button intent tiers are a
fast-follow, not v1)."* **Every link in an email is tracked individually.** Four in-email calendar
links would each report separately — you would learn not just that someone raised their hand but
which calendar they use.

**So the landing page buys ZERO tracking.** What it actually buys: (a) you don't know whether a
reader uses Google / Apple / Outlook / Yahoo, so in-email it's a four-link fan-out that collides
with decision 1a, (b) somewhere for the QR to live, (c) somewhere for directions to live. That is
the real trade — one CTA plus a page, versus four links and no page. **Not tracking vs. no
tracking.**

**Note also:** a `mailto:` RSVP could never have been tracked this way — no URL to rewrite. Decision
1b is the one that keeps the data.

### 2b. THE FINDING NOBODY WAS LOOKING FOR — five click roots, zero catalog entries

`app/api/webhooks/resend/route.ts` writes engagement into **five different tables**, selected by
**four different keying schemes** (market-alert tag, `broadcast_id`, send tag, outreach tag):

- `market_alert_engagement` (:266) · `campaign_click_events` (:322) · `outreach_events` (:406) ·
  `buyer_intent_events` (:612-659) · `email_events` — upserted from THREE lanes (:397 outreach,
  :476 deliverable blast, :526 schedules).

**`docs/standards/data-roots.md` has NO engagement root at all** — its only click-adjacent line
(:1353) is the DataForSEO search-volume root, explicitly marked a demand proxy and *"NOT our own
engagement data."* The code itself carries `KNOWN-DEBT(market_alert_engagement /
campaign_click_events are new public tables not yet in Database types)`.

**Consequence:** "who clicked anything in the last 30 days" is a five-way union that requires
knowing which lane sent what. `email_events` is already shared by three lanes and is the obvious
single root; the other two should either write there or be catalogued as deliberate exceptions with
a stated reason. **This is bigger than the Open House build, and the RSVP click will silently become
the sixth variant if it ships first.** Operator decision needed before that.

---

## 3. RSVP MECHANICS — verified vs. NOT verified. Do not code the unverified half from memory.

There is **no integration, no OAuth, no account link** between us and anyone's calendar. A web deep
link opens their provider with the event pre-filled and they press save; a `.ics` download is handed
by the OS to the default calendar app. The operator's *"most people probably have all this hooked
up, I just don't"* has no prerequisite to satisfy.

**VERIFIED live this session** via crawl4ai against
`github.com/InteractionDesignFoundation/add-event-to-calendar-docs` (459 stars; Google's own docs
cover only the v3 API, not the template URL) — full detail in research §8:
- **Google** — `https://calendar.google.com/calendar/render?action=TEMPLATE&text=&dates=<YYYYMMDDTHHmmSSZ>/<YYYYMMDDTHHmmSSZ>&details=&location=`
- **Outlook Live / Office 365** — `https://outlook.live.com/calendar/deeplink/compose` /
  `https://outlook.office.com/calendar/deeplink/compose` (BASE URL ONLY — see below)
- **Yahoo** — `https://calendar.yahoo.com/?v=60&TITLE=&ST=&ET=&DESC=&in_loc=` (`v=60` required)

**The address-in-phone answer is the LOCATION parameter** — Google `location=`, Yahoo `in_loc=`,
`.ics` `LOCATION`. Once saved, calendar apps render it tappable straight into maps. **That one field
answers both "a map" and "add address to phone" — no vCard, no static map image, no separate
directions build.**

**NOT VERIFIED — crawl before writing:**
1. The `.ics` / RFC 5545 `VEVENT` field spec. Apple Calendar and desktop Outlook depend on it and it
   is the one variant that is a FILE, not a URL.
2. Outlook's deeplink PARAMETER NAMES (only the base URL was read). Crawl
   `services/outlook-web.md` in full.
3. Whether click tracking is switched ON for our sending domain — it is a per-domain setting and was
   never confirmed.
4. Which send lane the Open House email uses, which decides WHICH of the five extractors catches its
   click (§2b).

**Ruled out by evidence, do not build:** an in-email interactive map (iframes are unsupported
everywhere email renders — not even tracked as a feature on caniemail), a vCard button (no
marketing/event precedent found; every source describes person-to-person contact sharing), a QR
inside the email (§1c). AMP for Email exists but requires per-provider sender registration —
wrong for us at our volume; its support matrix was NOT read.

---

## 4. THE FOUR PLANS — written, uncommitted, with cross-package problems already found

All four are on disk and each was written against real code. `docs/superpowers/plans/`:
`2026-08-12-open-house-pkg1-datetime-capture.md` · `-pkg2-rsvp-layout.md` · `-pkg3-ai-two-feeds.md`
· `-pkg4-narrator-validator.md`.

**The split had a hole: `lib/email/build-doc.ts` is owned by NO package and needed by TWO.** Package
1 needs `BuildScope` (:100-107) plus a 4-line insert in `authorDoc` (after :1272) — the only
server-side point a captured date/time can reach `facts` before `buildOpenHouse`. Package 3 needs
`contentPatchSystem` (:446) and its call sites (:576, :895) — the route only dispatches; the system
prompt the model reads is assembled there. Regions don't overlap so git will merge, but **sequence
them or the second isolates via `scripts/worktree.mjs`.**

**Assertion numbering collides:** Package 2 claims 9 and 10 in `scripts/email/render-open-house.mts`,
Package 4 claims 9. Whichever lands second renumbers off the live array length, never a literal.

**A stale-project hazard found by Package 3 lives in Package 1's file:** `EmailLabGridShell` is keyed
`grid-${buildKey}`, not `grid-${id}-${buildKey}`, at the embedded mount — a client-side move between
two projects' email-lab pages could serve a stale project id, which is exactly the
confidently-wrong-project failure Package 3's guard exists to prevent. Unverified without a live
browser trace. **Package 1 owns the one-line key fix.**

**Two handoff claims the plans DISPROVED — don't act on them:** the `applyBrand` "single global
website_url override" is dead code (`apply-brand.ts:74-109` resolves by ROLE since 08/03/2026; the
live risk is a NEW button omitting `props.role`); and "reuse `validateNarrative()`" is blocked as
literally written — its input type mandates a 1-3 item `outlook` array with `[INFERENCE]` tags,
hedges, a numeric base and a 20+ char falsifier (`lib/narratives/types.ts:17-22`, hard-failed at
`lib/narratives/validate.ts:109-111`). Decision 1e supersedes that question entirely.

---

## 5. OWED — nothing here is done. Each names what blocks it.

1. **`_ASSISTANT/STRIKES.md` — two strike lines owed** on the new shape
   `handed-the-operator-my-design-choice` (text drafted in `_ASSISTANT/SCRATCHPAD.md`'s
   08/12 entry). **Blocked:** file held under another session's repolith claim all session; not
   overridden.
2. **`_ASSISTANT/STRIKES.md` — the 5th `paid-before-free` strike line**, owed since before this
   session (Package 5 of the split doc). Same block.
3. ~~**`CLAUDE.md` RULE 0.5 sharpening**~~ — ✅ **DONE 08/12/2026.** Applied after a backgrounded
   `claim wait` acquired the file on release; anchor re-verified before the edit. See the Appendix.
4. **`docs/standards/data-roots.md`** — no engagement/click root exists (§2b). Needs an operator
   call on whether `email_events` becomes the single root.
5. **Database types regeneration** — `market_alert_engagement` and `campaign_click_events` are live
   tables absent from the generated types, per the code's own KNOWN-DEBT comment.
6. **The four unverified vendor/wiring facts** in §3.
7. **A Stop-hook proposal awaiting sign-off on the hook point** (§6).
8. **RSVP page-vs-four-links** — decision 1a and the §2 correction reframe it; the operator has NOT
   ruled on this final shape.

**Working tree note:** four plan files, `brains/collier-official-records-swfl.md`, and a
`.claude/settings.json.graphify-bak` backup were sitting STAGED in the shared index and this session
did not stage them. That backup file should not be committed. `.claude/settings.json` was also
modified by the graphify hook during the session. **Check what is staged before any push.**

---

## 6. THE GUARD GAP — why 79999900 guards didn't catch three wrong answers

Operator: *"How much fucking time does Claude waste guessing the wrong thing instead of looking??
How do we make Claude do anything right? We have 79999900 guards."*

**Three structural claims this session were made before opening the file that owned them, and all
three were caught by the operator asking a question, not by any guard.** The worst was §2 — the
landing-page-buys-tracking claim, in a turn where `check-four-searches` PASSED.

**The diagnosis:** nearly every guard we own is a PRE-PUSH gate on an ARTIFACT (session log,
lockfile, vocab, secrets, ingest, pack tests, doc index). All three failures happened in
CONVERSATION, where nothing gates anything — nothing wrong was ever pushed. The one conversational
gate that fired verifies TOPIC coverage (did you search the subject), never CLAIM coverage (did you
read the file that owns the specific sentence). **Passing it is not evidence the sentence is true.**

**The fix is not an 18th guard — it is the ratio of process-shaped guards to claim-shaped ones.**
The RULE 0.5 sharpening in §5 item 3 states the bar: before any sentence asserting how our system
behaves, the file that owns that behavior must have been opened IN THAT TURN; otherwise the honest
sentence is "I have not read X yet."

**Candidate mechanism, needs the operator's call on the hook point:** a Stop-hook in the
`answer-fix-proof` family that blocks when an answer asserts our own system's behavior and no
source-file read appears in that turn's transcript. It would have caught the tracking claim. It
would NOT have caught the design-menu failure (1e) — that one is judgment, and its guard is the
registry-first posture now written into the scratchpad and owed to RULE 3.

---

## APPENDIX — THE RULE 0.5 SHARPENING. ✅ APPLIED 08/12/2026, same session.

The operator ordered this rule fix on 08/12/2026. `CLAUDE.md` was under another session's active
repolith claim for 40+ minutes across two attempts and **the claim was NOT overridden** — clobbering
a parallel session's rule edits is real damage. A backgrounded `claim wait` held the queue position
and acquired the file the moment the holder released it; **the anchor was re-grepped to confirm it
still existed exactly once before the edit was applied** (the same verification any auto-apply queue
would need — see §7). It is now live in `CLAUDE.md` under RULE 0.5, immediately after *"Never answer
without opening something…"*.

The text is retained below as the record of what was added and why.

---

**SHARPENED 08/12/2026 — "OPENING SOMETHING" IS NOT THE BAR. OPEN THE FILE THAT OWNS *THIS
SENTENCE*.** Operator: *"How much fucking time does Claude waste guessing the wrong thing instead of
looking?? We have 79999900 guards."* Three structural claims in ONE session were made before opening
the file that owned them, and **all three were caught by him asking a question, not by any guard** —
including a turn where `check-four-searches` PASSED. That gate verifies TOPIC coverage (did you
search the subject), never CLAIM coverage (did you read the file that owns the specific sentence).
**Passing it is not evidence the sentence is true.**

**The failure shape, so it is recognizable:** a sentence describing how one of OUR OWN subsystems
behaves — what a page is for, what a guard checks, where data lands, what a button does — spoken
from the SHAPE of the system rather than from its code. Not a memory failure; answering at the wrong
altitude. The tell is a load-bearing "because": *"the landing page is what gives you the tracking."*
One read of `lib/email/campaign-click-alert.ts` showed the click event already carries the exact URL,
the recipient and the campaign — so **every link tracks and the page was never the mechanism.** The
operator got there by asking; the guards did not.

**THE BAR: before any sentence asserting how our system behaves, the file that owns that behavior
must have been opened IN THIS TURN.** Not a sibling file, not the doc describing it, not the same
subsystem last week. If it has not been opened, the honest sentence is "I have not read X yet" —
then go read it. One tool call, always cheaper than him finding it.

**WHY NOT AN 18th GUARD:** nearly every guard we own is a PRE-PUSH gate on an ARTIFACT. All three
failures happened in CONVERSATION, where nothing gates anything — nothing wrong was ever pushed.
Adding guards is not the fix; the ratio of process-shaped guards to claim-shaped ones is. Candidate
mechanism, pending operator sign-off on the hook point: a Stop-hook in the `answer-fix-proof` family
that blocks when an answer asserts our own system's behavior and no source-file read appears in that
turn's transcript. Full postmortem:
`docs/handoff/2026-08-12-open-house-decisions-owed-work-and-the-tracking-finding.md` §6.

Twin failure, same session, same root: **when two placements of the same function look like the
choice, the choice is usually wrong — reach for the keyed one-root registry we already use three
times (`lib/email/social/platforms.ts`, `lib/email/lab/capabilities.ts`, `apply-brand.ts:74-109`)
instead of handing the operator a menu.**
