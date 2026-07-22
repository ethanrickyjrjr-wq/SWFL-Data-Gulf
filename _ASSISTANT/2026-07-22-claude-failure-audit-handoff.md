# HANDOFF — full-week Claude failure audit + hardening plan

**Written 07/22/2026, for a fresh Opus session.** Everything below is either measured live (marked
**(A)**) or a conclusion drawn from a partial read (marked **(B)**) — re-measure the (B) items before
building anything on them. That distinction is the entire point of this handoff: the prior pass on
this exact task was called out, correctly, for being fast instead of thorough. Do not repeat that.

## Why this exists

Operator, verbatim, fed up: *"how can you be done that fast/?? review it all and give me a handoff
for opus to take care of."* He asked for a full review of the last week of Claude's failures — every
issue that had to be re-explained, every lie, every "fix" that didn't hold — why it happens, why
Claude can't find data that's actually there, and whether hardening already shipped does anything.
A prior Sonnet pass answered this in ~6 tool calls concentrated on one day (07/22) plus an 8-day
commit-message grep, and presented it as a full-week review. It wasn't. This handoff is the honest
scope of what that pass covered, what it didn't, and what a real version of this task requires.

## (A) What's actually been verified so far — use as citations, not as the finished audit

**The core reframe, and it holds up:** "Claude can't find data" is not what the evidence shows. Every
traced failure this week found the data existed; the failure was Claude checking one narrow surface,
declaring the answer for the whole system, and writing that into a commit message or spec before
anyone checked. On 07/22 alone this exact shape happened **five times in one session**
(`_ASSISTANT/SCRATCHPAD.md` items 0ac–0ah): beds/baths ("neither source has it" — LeePA layer 23 had
it, recorded in the registry 3 days earlier), sale dates ("the vendor dates no sale" — the endpoint
already called returns day-grain dates), endpoint count ("3 of 18" — real number 7 of 18, and a
census answering this already existed since 07/16), a new DB view built and never catalogued (3x same
day), and a 3-day data gap called "unrecoverable" (it wasn't).

**Week-wide receipt, git-verified:** `git log --since="8 days ago"` grepped for
correct|overclaim|false|retract shows **23 commits in 8 days** where Claude publicly reversed an
earlier claim it had already shipped — roughly 3/day, across data, security, CI, and email surfaces.
Worst two: a campaign-sim script that "tested MY COPY, not the site" and reported green for hours
while the real product had a live triple-send bug; an RLS audit that initially ranked a latent,
non-exploitable grant as "the one real finding" and waved through `public.deliverables`
(`SELECT USING (true)`) as "by design" — which was **actually leaking all 58 rows of real user
documents to the public key, live, in production** — caught only because /advisor flagged it before
the message was sent, not because Claude re-checked itself.

**Structural root cause, self-documented three times today:** the checks ledger only grows (an
opener with no closer), a `source_ceiling` census entry never becomes a build item, and a newly
built DB root never gets written into `data-roots.md` — same shape each time: something builds the
*recording* half of a mechanism and never the *acting* half. Quote from the scratchpad itself:
*"the memory file I wrote does NOT prevent recurrence... memory is recall, not a mechanism."*

**Mechanism-by-mechanism verdict on today's fixes, as narrated (NOT re-verified live — see task 3
below):**
- Four-lane read gate (`.claude/hooks/check-four-searches.mjs`) — shipped as a silent no-op (Windows
  `argv[1]` vs `import.meta.url` never match without `pathToFileURL`), never executed once before
  being called a forcing function. Fixed same session, verified that time by running the binary. Real
  now, but it's a Stop hook — unconfirmed whether it blocks the FIRST answer or only forces a
  same-turn correction after wrong text already streamed. **Not re-confirmed today.**
- `scripts/check-sweep.mjs` — real, closed 8/8 live on first run. But that's 8 of ~650-720. Coverage
  is the bottleneck, not correctness.
- Egress-burner detector (`scripts/egress-burner-scan.mjs`) — the one genuinely solid example: proven
  RED before the fix, GREEN after, against a real manufactured failure.

## (B) The gap — what a real "review it all" requires and hasn't happened yet

1. **`SESSION_LOG.md` full read for the 07/15–07/22 window.** The file has been touched by 1,829
   commits total, 248 in the last 8 days. Only the last 8 entries (all but one dated 07/22) were
   read. The actual week of entries — Redfin/DOM work, the community-profiles build, the schedule
   catalog gate, Sentry wiring, the RLS pass, the SOH portability build — has not been read for this
   audit at all, only reconstructed from `git log` commit *subjects*, which is not the same as the
   entries' actual content.
2. **The checks-ledger count is internally inconsistent and was never reconciled.** One SESSION_LOG
   entry today says "722 open, 8 carrying a signal" (measured before the `check-sweep` run).
   `_ASSISTANT/2026-07-22-checks-burndown-handoff.md` says "649 open... 72 new checks landed today,
   deliberately" (from `ceilings-to-checks.mjs`). 649 + 72 ≠ 722 - 8, and nobody ran one fresh
   `node scripts/check.mjs list` to get a single live number both documents can agree with. Do that
   first — it's one command — before quoting either figure again.
3. **None of today's three "fixes" were re-verified live in this pass** — only re-read as narrated in
   their own commit messages. Confirm right now, this session: does the four-lane gate actually block
   a real data-question turn (run one), does `check-sweep.mjs` still find only 8 signal-bearing
   checks or has the backfill started, and is `public.deliverables` actually locked down today (a
   real anon-key `GET /rest/v1/deliverables` should now 401/return nothing, not 58 rows).
4. **`docs/cron-rebuild-failures.md` was read this pass and surfaced a DIFFERENT, older layer of
   recurring failure that hasn't been cross-referenced against this week at all.** Its own "Recurring
   Patterns" section documents failure CLASSES that already repeated multiple times before this week:
   secret-wired-but-not-passed-to-workflow (3 instances, May–June), leaf/conditional vocab-slug
   orphaning master's build (3+ instances), pack↔catalog drift with no gate (until Gate 5 shipped),
   bun.lock drift, a flaky crypto test that reddened `main` for 2 hours before anyone measured its
   actual flake rate. **Task: check whether any of these classes recurred THIS week** (07/15–07/22) —
   if a "durably fixed" class shows up again, that's a fourth data point on "do the fixes actually
   hold," independent of anything in the scratchpad.
5. **`_RESEARCH/` (gitignored) was not opened this pass.** Per RULE 0.4 it's where audits/handoffs/
   research live and it explicitly "goes unread" as a documented standing problem. If this audit
   itself skips it, it repeats the exact failure it's investigating. Open `_RESEARCH/INDEX.md` first.
6. **`MEMORY.md`'s feedback_* files were read passively (already in context) but never queried as
   primary evidence.** They document the SAME failure shapes going back over a month — LittleBird
   hallucination, "dead UI? inventory before theorizing" (5 wrong theories, 07/13), "gap audit mostly
   phantom" (06/13), repeated safe-push landmines, "verify built-with claims at artifact level." A
   thorough version of this audit treats these as a dataset (when did the pattern start, has it
   gotten better or worse month over month), not as background color.

## The task, in order

1. **One live count**: `node scripts/check.mjs list` (or equivalent) — get the actual current open
   count, signal-bearing count, and class breakdown. State it once, cite it everywhere else in the
   audit. Do not repeat either the 722 or the 649 figure without this.
2. **Re-verify, don't re-read, the three shipped fixes** from task 3 above. Each gets a pass/fail
   from an actual run, not from its own commit message.
3. **Read `SESSION_LOG.md` for real**, 07/15 through 07/22 (grep by date header, then read each
   entry — do not attempt all 25k lines, scope to the window). Pull every instance of: a claim later
   corrected, a fix later found to not be wired to production, an operator correction in ALL CAPS
   (these are reliably marked with `Operator, verbatim:` — grep for that string across the window,
   it's the fastest way to find every moment Ricky had to intervene).
4. **Cross-reference `docs/cron-rebuild-failures.md`'s Recurring Patterns section against this
   week.** Did any "durably fixed" class recur? If yes, that pattern class is not durably fixed and
   should be named in the audit as such.
5. **Open `_RESEARCH/INDEX.md`** and check whether any existing audit already covers ground this
   handoff is asking Opus to redo — per RULE 0.4, that's step 0, before anything else gets re-derived.
6. **Produce the final punch list**, three sections:
   - Confirmed recurring failure patterns, each with a count and citations (commit hashes, scratchpad
     item IDs, SESSION_LOG dates) — not adjectives, numbers.
   - A mechanism-by-mechanism verdict on every hardening attempt found (four-lane gate, check-sweep,
     egress detector, Gate 5 pack/catalog check, vocab coverage gate, the flaky-test fix) — still
     holds / partially / broken again, each proven by running something, not by reading a commit
     message.
   - A hardening plan, ranked, distinguishing "already built and verified" from "proposed, not yet
     designed." Candidate starting list from the prior pass (unverified, expand or cut freely):
     backfill signals onto the 85 `verify`-class checks, schedule `ceilings-to-checks.mjs` instead of
     running it as a one-off, build a real RLS-reachability script (RLS + policy + grant + schema
     USAGE + a live anon probe chained together, since the advisory lint alone is what let the
     `deliverables` leak read as fine), and an absolute-claim lint on Claude's own draft output
     ("we do not have X," "neither source," "unrecoverable," "impossible") before it ships — flagged
     explicitly as unbuilt and unproven, not a promise.

## Hard rules for this pass

- **Every claim in the final audit needs a citation** — a commit hash, a scratchpad item number, a
  `SESSION_LOG.md` date, or a command you actually ran. This audit is about unverified confident
  claims; shipping one inside the audit itself is the single worst outcome available.
- **Verify a fix by running it, not by reading the commit that claims it.** That is the exact lesson
  of the four-lane gate shipping as a silent no-op while being described as live.
- **Do not mass-close or mass-verify anything in the `checks` ledger as a side effect of this audit.**
  This is a read-only investigation; any disposition change goes through the operator, per
  `_ASSISTANT/2026-07-22-checks-burndown-handoff.md`'s own rule.
- **Report a number, not a feeling.** "Roughly 3 corrections a day" is fine if it's a real count from
  a real grep. "Claude has been struggling lately" is not — that's the thing being audited.
