# HANDOFF FOR FABLE 5 — drive Chrome, prove the builder + the send

**Written 07/11/2026 by Sonnet 5 (research-only session, no Chrome available here).** This is the
one thing to do first, before anything else on the punch list (`2026-07-11-fable5-master-punch-list.md`).

---

## THE RULE — READ THIS TWICE

**THE BUILDER BUILDS. NOT YOU. NOT FABLE 5.**

Every build in this handoff must come from typing a plain-English request into the product's own
AI builder chat (`POST /api/email-lab/ai`, the input box inside `/project/[id]/email-lab`) and letting
**it** fill the content. Do not hand-write HTML, do not pre-fill fields, do not "help" the AI by editing
its numbers afterward (the BUILDER-GUIDE explicitly warns against this — it reintroduces stale/invented
values and breaks the no-invention moat). Your job is to click, type the request, and observe what the
real product does — the same thing a real user would do. If the builder produces something wrong,
that IS the finding. Don't fix it by doing its job for it.

Drive this through **Chrome** (claude-in-chrome / chrome-devtools tools), against the live site —
not localhost, not a script that calls the API directly. The point is to prove the thing a user
actually clicks through works.

---

## Preconditions — check these FIRST, in this order

A failed send can come from four different places. Check them in order so a failure gets attributed
correctly instead of blamed on "the builder is broken."

1. **Auth.** The builder and send both require a signed-in Supabase user (`/login` is email-OTP —
   "Enter your email. We'll send you a sign-in code," no password). Chrome automation cannot read an
   inbox to complete OTP blind. **First check whether the Chrome profile you're driving already has an
   active session** (navigate to `/project` — if it doesn't bounce to `/login`, you're in). If it
   bounces to `/login`, STOP and tell Ricky you need either (a) an already-authenticated Chrome profile,
   or (b) someone to hand you the OTP code as it arrives. Do not guess a password field that doesn't exist.

2. **Sender configured.** `POST /api/deliverables/[id]/blast` reads `process.env.DIGEST_SENDER_ADDRESS`
   or `RESEND_FROM_EMAIL`. If neither is set in Vercel, the route returns `503 sender_not_configured`
   immediately — not a builder bug. Open check `email_first_live_send` says this needs
   `DIGEST_SENDER_ADDRESS=hello@swfldatagulf.com` set in Vercel + `DIGEST_BROADCAST_SECRET` matching the
   `gh` secret. If the send 503s, that's the first thing to report — it's an env-var gap, not a broken AI.

3. **Resend account health.** Open check `resend_account_upgraded` (29 days untouched) warns the free
   Resend tier may be capped at "1/day, 19/month" — unclear if that number still describes the current
   account or only ever described the scheduled-digest cron path specifically. Also unresolved: check
   `steadyapi_subscription_suspended` was about a *different* vendor (SteadyAPI, not Resend), so don't
   confuse the two — but it's a live example that a vendor account going past-due silently 403s
   everything, so if the blast call errors, check whether it's a Resend account-status problem before
   assuming code is broken.

4. **Send quota (should NOT block this test).** `lib/email/usage.ts` gives the free tier 50 sends/month;
   3 recipients is nowhere near that. If `checkUsageLimit` still 402s with `quota_reached`, something's
   wrong with the usage counter, not with volume — worth a check if it happens.

5. **`hello@swfldatagulf.com` is double-booked.** It's the platform's own SENDER identity
   (`DIGEST_SENDER_ADDRESS`) *and* one of the 3 test recipients here. Confirm it's actually a receivable
   mailbox (someone can check that inbox) before treating a non-delivery there as a builder/send bug —
   a from==to bounce or spam-fold would look identical to a real failure otherwise.

If all four are clear, proceed. If any is blocked, **stop, report exactly which one, and do not fake a
workaround** (e.g. don't call the Resend API directly to "prove it would have worked" — that isn't
driving the product, it's doing the builder's job for it, which is the one thing this handoff forbids).

---

## The three test recipients

Send the real, live test to all three, in one blast, from inside the product's Contacts flow:

- `hello@swfldatagulf.com`
- `ethanrickyjrjr@gmail.com`
- `allstatecoop@gmail.com`

These need to exist as rows in `public.contacts` owned by the signed-in user before a blast can select
them (`POST /api/deliverables/[id]/blast` requires `contact_ids` resolving to owned, non-unsubscribed
contacts). Add them through the product's own Contacts UI/flow inside the send modal (or via the visible
"add contact" affordance) — again, use the product surface, not a raw API call from a script.

---

## What "every build we set up for it" means, concretely

The builder ships **27 starter templates** (`lib/email/doc/default-docs.ts` → `SEED_DOCS`, previewable
live at `/showcase`):

```
market-spotlight, just-sold, market-letter, listing-feature, welcome, minimal, agent-spotlight,
luxury-market-report, new-listing, weekly-pulse, skeleton-clean-white, skeleton-dark-pro,
skeleton-agent-feature, skeleton-listing-showcase, open-house, price-reduced, just-sold-grid,
neighborhood-report, investment-brief, rate-watch, monthly-digest, year-in-review, listing-digest,
stay-in-touch, trend-snapshot, editorial-letter, magazine-issue
```

**Building** and **sending** are two different axes here — don't let coverage on one stand in for the
other:

- **Building is the cheap axis — do NOT sample it.** Nothing about driving the AI builder chat 27 times
  costs money, spams anyone, or touches a quota. So **build all 27 live, through the actual chat, one at
  a time** (open `/project/[id]/email-lab`, pick the "Start from" seed, type a real natural-language
  request — e.g. "Fill this in for Fort Myers Beach 33931" or "make this for a Cape Coral listing" — and
  read what comes back). For each one, confirm the reply fills real cited figures, not empty slots and
  not a baked placeholder. **Do not substitute `/showcase` for this.** `/showcase`'s 27 tiles are
  **static webp screenshots captured and committed 07/09/2026** — looking at them proves what the builder
  produced that day, not that the live AI fill works right now. If driving all 27 live turns out to be
  genuinely infeasible in the time you have, say so explicitly and name which ones you skipped — don't
  let a partial pass read as "every build confirmed."
  - **Known live risk to watch for on every one:** check `seed_static_figures_bypass_invention_gate` says
    some seeds (`rate-watch`'s 6.75% APR, `agent-spotlight`'s baked stats, etc.) may ship hard demo
    numbers in fields meant to be AI-owned, and the no-invention lint doesn't cover seed-static numbers —
    if the same suspiciously specific number shows up unchanged across different scopes/prompts, that's
    this bug, not a coincidence.
- **Sending is the expensive/limited axis — sample it to ONE.** No reason to send 27 real emails to 3
  live inboxes. Pick whichever of the 27 built cleanest, Save it, and run that single one through the
  full send flow below. This is the ONE send this handoff asks for.

---

## Step-by-step Chrome procedure

1. `tabs_context_mcp` → see what's already open. Create a new tab if needed (never reuse another
   session's tab).
2. Navigate to `https://www.swfldatagulf.com/project`. If redirected to `/login`, stop per Precondition 1.
3. Open (or create) a project, land on its Email tab → `/project/[id]/email-lab`.
4. Pick a "Start from" seed (one of the representative spread above).
5. Type a real request into the AI builder's chat input. **Do not edit the doc by hand first.** Let it
   fill.
6. Read the result (`read_page` / screenshot). Confirm: real figures with sources, not empty strings,
   not a repeat of the seed's baked demo number (see the risk flagged above).
7. Save the deliverable (the Save action in the lab UI — this writes the `deliverables` row and is what
   flips `status` toward `"ready"`).
8. Open the Send flow (Contacts picker). Add the 3 test addresses as contacts if not already present.
9. Select all 3, hit Send.
10. Read the result banner. Success reads "Sent to 3 contacts" (per `ContactPickerModal`). Report any
    `failed` count, or an error banner (`quota_reached`, `sender_not_configured`, or a network error) —
    verbatim.
11. Screenshot/GIF the whole run (`gif_creator`) so Ricky can see exactly what happened without re-running
    it.

---

## Reporting back

- If everything works: say so plainly, with the screenshot/GIF and which template you used.
- If something blocks it: name the exact precondition or step that failed, quote the exact error text,
  and **open a check** for it (`node scripts/check.mjs open brain-platform <key> "<label>"`) per the
  platform's no-silent-deferrals rule — don't just narrate it and move on.
- Do not push any code from this session unless something concrete needs fixing and you fix it — this
  handoff is a verification pass, not a build task. If a real bug surfaces, describe it; let Ricky decide
  whether to fix it now or file it.
