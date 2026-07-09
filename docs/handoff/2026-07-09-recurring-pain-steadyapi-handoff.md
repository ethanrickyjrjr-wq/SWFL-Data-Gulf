# HANDOFF — recurring-pain filter + live SteadyAPI research (round 2)

## What was asked

Operator: "go through ops page, all my repeats of problems in chats and things that constantly
break and figure out what questions we need to ask to get the answers we want then start finding
answers to the most important issues and design wants with steadyapi."

## What was done

1. **Scanned for recurring problems** across: `node scripts/check.mjs list` (200 open checks),
   `docs/cron-rebuild-failures.md`'s "Recurring Patterns" section, the operator's own archived
   `_archive/2026-06-26-snicklefritz-and-problems-audit/CLAUDE IS STUPID AS FUCK PROBLEMS.md` (35
   items of AI-collaboration friction, dated 06/25–06/26), and `SESSION_LOG.md`.
2. **Applied one filter**: "is this answerable by what real agents/brokers/buyers/marketers say on
   Reddit/X/Insta?" — confirmed with `advisor()` before spending anything. This ruled out the
   SNICKLEFRITZ doc (internal AI discipline), the cron ledger's recurring patterns (internal
   engineering — bun.lock drift, WAF blocks, flaky tests), and the ~150 `*_live_verify` checks
   (unfinished-build tracking, not a customer question).
3. **Three questions survived the filter**: willingness-to-pay for AI real-estate tools, Gmail
   Promotions-tab avoidance, and reconfirming "Showing Prep Packet." Got explicit operator sign-off
   via AskUserQuestion before spending live SteadyAPI credits (an auto-mode classifier blocked the
   first live call attempt, citing the paid-API-approval rule — operator said "run as many calls as
   you need").
4. **Ran ~14 live SteadyAPI Reddit calls** (`new_steady` key — the working key; `PHOTOS_API` is
   suspended per the `steadyapi_subscription_suspended` check) against r/realtors, r/RealEstate,
   r/Emailmarketing, r/SaaS, r/CommercialRealEstate (posts + one full post-detail fetch + two
   generic `/search` probes). Raw JSON saved to this session's scratchpad, not committed (same
   treatment as prior sweeps — real Reddit usernames stay local).
5. **Wrote up findings** in
   `docs/steadyapi-research/2026-07-09-recurring-pain-questions-and-answers.md` and folded the two
   real answers (CRE pricing comps, Gmail playbook) back into
   `docs/steadyapi-research/2026-07-09-pain-point-questions-round1.md` as items 17–18, narrowing
   items 3 and 12 to match. Updated the folder `README.md` index.

## Key findings (see round2 doc for full detail + sources)

- **Pricing:** real CRE brokers pay $157–700/mo/seat for a comparable data tool (Reonomy); CoStar
  (incumbent) runs 3×+ that; API-tier ~$30k/year. Our $39–79/mo sits well below this category —
  we're not priced high. Pricing in this category is admittedly opaque/negotiable at renewal
  (confirmed by a proptech founder commenting in-thread). Residential-agent-specific price
  reaction at our exact price point is still genuinely unanswered — searched, not found.
- **Gmail Promotions tab:** a real, ranked 5-tactic playbook exists (engagement-staggered sending
  first, cut tracking links, real reply-to + conversational tone, consistent cadence, pre-send
  seed-testing). Two tactics conflict with things we do/plan — click-tracking trades against
  deliverability; engagement-staggered sending and pre-send seed-testing are both new feature
  candidates not in our scheduler today.
- **Showing Prep Packet:** still hot on r/realtors two days after the 07/08 sweep first found it —
  durable signal, no new action needed (already flagged HIGH-priority in round1).
- **Photo-hotlink-rot:** searched, not found on social — likely too technical a complaint for
  public Reddit. Stays open; may need a different research method (not social listening) to close.
- **Vendor-quirk note:** confirmed a 4th time that generic `/v1/reddit/search` is unusable for
  niche queries (site-wide relevance ranking). Also found `/v1/reddit/post`'s comment objects use
  field `content`, not `body` — worth a docs-only fold-in to
  `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md`.

## What's next (not done this session)

- **Docs-only, low-effort:** fold the `content`-not-`body` comment-field correction into
  `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md`'s Reddit quirks section.
- **Continue the sweep:** residential-agent pricing reaction (try r/proptech, r/newagent, or a
  directly-targeted search phrase) and photo-hotlink-rot (try r/Emailmarketing "image
  hosting"/"CDN" threads, or accept this is a vendor-docs question, not a social-listening one).
- **Design follow-through (needs `superpowers:brainstorming` before any code per RULE 3.5):**
  engagement-staggered send ordering and pre-send seed-testing are both new feature candidates
  surfaced this round — neither is speced yet.
- **Per the operator's stated workflow** ("we will focus on different areas and make a new file,
  then we will run out and look for answers once we have everything together") — this round2 file
  IS that "different area" file for the recurring-pain angle. Next area, if the operator wants one,
  gets its own dated file per this same pattern.

## State

All work is local, uncommitted at the time this handoff was written. Docs-only changes
(`docs/steadyapi-research/*`, `docs/handoff/*`) — no code touched. Per the operator's standing
"never push without explicit confirmation" rule, this session will commit locally and stop before
`git push`, showing the log and asking first.
