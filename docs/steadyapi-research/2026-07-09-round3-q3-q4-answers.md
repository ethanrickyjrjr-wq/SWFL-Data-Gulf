# Round 3 — Q3 + Q4 answers (document research, run 07/09/2026)

> **Recommended model:** ⚡ Sonnet

The two crawl4ai-only Tier-1 questions from `2026-07-09-round3-question-backlog.md`, researched
live 07/09/2026 by the Fable session per the scope split in
`docs/handoff/2026-07-09-round3-sonnet-run-handoff.md`. Q1/Q2 (SteadyAPI) belong to the Sonnet
run and are NOT covered here. Raw page dumps live in the session scratchpad, not the repo.

---

## Q3. Does click/redirect link-tracking hurt Gmail placement? — ANSWERED: not our variant of it

**Sources read (all live-pulled 07/09/2026):**

1. **Google Email Sender Guidelines** (support.google.com/mail/answer/81126). No prohibition on
   redirect/tracked links anywhere in the document. The only link guidance: "Web links in the
   message body should be visible and easy to understand. Recipients should know what to expect
   when they click a link." Hard requirements are elsewhere: SPF+DKIM aligned, DMARC, one-click
   unsubscribe, spam rate below 0.10% (never ≥0.30%) in Postmaster Tools. Also stated verbatim:
   "Google doesn't track open rates" and — load-bearing for the staggered-send build — "Start with
   a low sending volume to engaged users, and slowly increase the volume over time" plus "Send
   email at a consistent rate. Avoid sending email in bursts."
2. **Resend docs** (knowledge-base, "maximize deliverability"): "link tracking rewrites the links
   in the email to point to **Resend's servers** first... can be seen as suspicious by the inbox
   provider and hurt your deliverability." The stated mechanism is the rewrite to a THIRD-PARTY
   SHARED domain (plus the 1×1 open pixel); their advice is aimed at transactional/auth mail.
3. **MailReach** ("What's custom tracking domain? Why it matters"): deliverability harm comes from
   tracking through a shared platform domain — "you get penalized if spammers use the same
   platform" — and the fix is a custom tracking domain "aligned with your sending domain to
   strengthen sender reputation."

**Verdict for OUR code:** the Reddit tactic #2 ("cut tracking links") generalizes from ESP
shared-tracking-domain setups. Our wrapping (`lib/email/tracked-links/wrap.ts`) rewrites to
`${origin}/api/r/<token>` — **first-party, on our own origin, aligned with today's shared-From
sending domain, CTA-link-only, env-gated**. That does not match the harm mechanism any source
describes. **Do NOT build a "high-deliverability mode" toggle** — no evidence supports removing
first-party aligned tracking, and we'd lose the `link_events` funnel for nothing.

**The one real constraint (recorded as check `tracked_links_domain_alignment_on_custom_sender`):**
when per-agent custom sending domains ship (domain-verify backend exists, UI doesn't), a send from
`agent-domain.com` with links rewritten to `swfldatagulf.com/api/r/...` becomes exactly the
misaligned pattern the sources warn about. At that point wrapped links must ride the sender's
domain (CNAME-style tracking subdomain) or wrapping must be skipped for those sends.

---

## Q4. Seed-test mechanics: vendor, API, or DIY? — ANSWERED: vendor API, two viable candidates

**Sources read (all live-pulled 07/09/2026):**

1. **GlockApps** (glockapps.com/pricing): Free = 2 spam-test credits; Essential $59/mo (360
   credits, 1 sending account); Growth $99/mo (1,080 credits, 10 accounts); Enterprise $129/mo
   (1,800 credits, 20 accounts); annual −30%. Has a **Developer API v2**
   (glockapps.com/api-documentation-v2) and per-provider inbox-placement testing plus DMARC
   analytics bundled.
2. **MailReach** (mailreach.co/email-spam-test-api + /pricing): a dedicated **Spam Test API** —
   "Inbox placement view by provider," "balanced mailbox distribution across providers" (Gmail/
   Google Workspace, Outlook/O365, Zoho, + ESP relays). Warmer is $25/mailbox/mo and includes 20
   spam-test credits; credits scale on a slider (50→10,000+) whose per-credit price renders only
   in-app — exact credit pricing needs signup/contact (not invented here).
3. **mail-tester.com**: free "send to this address" scoring with an API — but it scores
   content/auth spammyness (SpamAssassin-style); it does NOT report Gmail tab/folder placement.
   Useful as a free pre-send lint, not a seed test.

**Verdict:** pre-send seed-testing is **buildable as a vendor API integration, not a DIY build**
(running our own seed inboxes polled over IMAP re-implements the vendors' core asset — provider-
distributed mailboxes — with ToS and maintenance risk). The feature shape the round-2 finding
validated: a pre-send step that submits the rendered email to the vendor seed list and surfaces
per-provider placement (Primary / Promotions / Spam) before the real blast goes out. Entry cost
~$59/mo (GlockApps Essential, 360 tests ≈ 1/day) or MailReach credits. This is a paid-vendor
decision → parked as check `seed_test_prestep_decision` with the evidence above; spec only after
the operator picks a vendor lane (or rejects the monthly cost).

---

## Backlog state after this file

- Round3 Q3: CLOSED (no build; one alignment constraint recorded as a check).
- Round3 Q4: CLOSED as research (build decision parked on operator vendor choice).
- Q1/Q2 + Tier 2 remain with the Sonnet run per the handoff.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 17, Task 17 |  |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
