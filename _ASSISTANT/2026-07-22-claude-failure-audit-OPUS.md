# FULL-WEEK CLAUDE FAILURE AUDIT — the Opus pass

**Run 07/22/2026.** Every claim carries a citation: a command actually run, a commit hash, a
scratchpad item, or a SESSION_LOG date. Where a prior document was wrong, it is named and corrected.
Nothing here is narrated from a commit message.

---

## 0. Corrections to the handoff that commissioned this audit

The handoff (`2026-07-22-claude-failure-audit-handoff.md`) is a hypothesis, not authority. Three of
its own instructions were wrong:

1. **Its prescribed grep is broken.** It says operator interventions are "reliably marked with
   `Operator, verbatim:` — grep for that string." That matches **2** occurrences. The real format is
   `Operator, 07/22/2026, verbatim:`. Grepping `verbatim` finds **24** in SCRATCHPAD.md and **145**
   in SESSION_LOG.md. Following the handoff literally would have found ~1% of the dataset.
2. **The 722-vs-649 reconciliation it demanded has a third answer.** Live, this session:
   **667 open — 193 defect · 100 verify · 287 task · 87 untriaged** (`node scripts/check.mjs list`).
   Neither prior figure is current. Use 667.
3. **It told the next session to re-verify `check-sweep.mjs` by running it.** Running it *mutates the
   ledger* — closing checks is its entire purpose — violating the handoff's own hard rule ("do not
   mass-close or mass-verify anything as a side effect of this audit"). Verified read-only by SQL.

---

## 1. THE HEADLINE — the four-lane gate has never fired. Not once.

Decreed by the operator 07/22 (*"I WANT 4 SEARCHES FOR DATA BEFORE CLAUDE SAYS A FUCKING WORD TO
ME"*), shipped in `ce163255`, then "fixed" in `1ad4eb12` whose own subject reads *"the four-lane gate
never ran — Windows argv guard made it a no-op."*

**It still never runs — for a second, larger reason nobody checked.**

| Evidence | Result |
|---|---|
| `grep -rn "four-searches"` across all `*.json`/`*.toml` | 3 hits: its own source, its own test, the handoff doc. **Zero settings files.** |
| `.claude/settings.json` `Stop` array | Contains only `session-notes.sh`. |
| `git show --stat ce163255` | 2 files: hook + test. **No settings.json.** |
| `git show --stat 1ad4eb12` | 1 file: the hook. **No settings.json.** |

**The binary works.** Fed a real data-turn transcript with zero searches it exits 2 and prints the
full block message — verified by running it. But an unregistered hook is wired to nothing. The fix
for *"this was never actually executed"* was **itself never actually executed**.

That is this audit's subject matter one level deeper: check a narrow surface (the binary runs),
declare the whole system working (the gate is live). `1ad4eb12`'s own comment says *"Verified by
RUNNING the binary, not reading it."* Running the binary was necessary and not sufficient.

**Two further defects, found by reading the code — neither in the handoff:**

- **It is a `Stop` hook — it fires at turn END.** It structurally cannot deliver the decree. Wrong
  text has already streamed to the operator before the gate sees the turn. It can force an appended
  correction; it can never prevent the first wrong word. The decree said "before Claude says a word."
  The mechanism cannot do that, and was described as if it could.
- **It yields permanently after ONE nudge.** `if (payload.stop_hook_active) process.exit(0)`,
  line 159. Verified live: same data turn, zero searches, `stop_hook_active:true` → **exit 0**. The
  model can ignore the stderr, stop again, and pass. A one-shot advisory nudge, not a gate.

### RESOLUTION — same day, and not by this session

**Everything above was true when measured (~15:0x, two independent greps + a `sed` of the `Stop`
block).** At **16:08** a PARALLEL session landed `ba30a776 feat(hooks): wire the four-lane read gate
into Stop — it now actually fires`, which both registered the hook and widened `isDataTurn`'s SUBJECT
list. Recorded for honesty: this audit did not fix it; it was fixed independently, minutes before
this session reached it. `git status` was clean and no repolith claim was held, so nothing was
clobbered.

**What this session then found by RUNNING the registered gate against 9 real operator messages from
SCRATCHPAD (not by reading the diff):** it fired on 6 and was **DEAF to 3** — including **the exact
message that produced failure #1 in the hook's own header comment**:

- `"ok, just make sure we have beds and baths"` → failure #1 ("neither source has beds/baths")
- `"...WE ONLYY CALL 3 OF 18. ARE YOU LOOKING IN THE RIGHT FUCKING PLACES?????"` → failure #4
- `"check this / where are we wiring to??"` → scratchpad 0ab

Cause: `isDataTurn` requires a SUBJECT word AND an ASKING word. `beds`/`baths`/`wiring`/`call` were
absent from SUBJECT; `"make sure we have"` was absent from ASKING. **A gate deaf to the messages that
caused the failures it exists to stop is not a gate.**

**Fixed this session** — SUBJECT gains `beds|baths|bedrooms|bathrooms|sqft|acreage|wire|wired|wiring|
calls|calling`; ASKING gains `make sure|we have|we hold|we got|verify|confirm`. Verified by running:
**9/9 real operator data messages now fire, 4/4 non-data controls stay silent** (`make the button
blue`, `make sure the tests pass before you push`, `clean up that file`, and the operator's own
`land it and make sure we don't fuck up egress again` — all correctly silent, because SUBJECT remains
the real gate). Hook unit suite: **17 pass, 0 fail**.

**Still open, not fixed:** the `Stop`-placement problem (it cannot prevent the first wrong word, only
append a correction) and the `stop_hook_active` single-nudge bail. Both need an operator call on
whether to move the gate to `UserPromptSubmit`/`PreToolUse`.

**Bonus defect found while testing:** `bun test` from the repo root does not match `.claude/**` —
dot-directories are excluded from the default sweep (9,616 files searched, 0 matched). The hook's 17
tests only run when invoked from inside `.claude/hooks`. **The guard suite for our guards is
invisible to CI.**

**Two false alarms this session caught in its own tooling, logged because they are the same failure
class:** (1) a first gate test used a `/tmp` path Node cannot resolve on Windows and reported "still
broken"; (2) a `cd .claude/hooks` persisted across Bash calls and made every subsequent test report
DEAF. Both would have shipped a false finding into an audit about false findings. Neither was caught
by reading — only by re-running.

---

## 2. `check-sweep.mjs` — correct, and currently able to act on 0 of 667 open checks

Verified read-only:

| state | rows | with signal |
|---|---|---|
| open | **667** | **0** |
| done | 450 | 64 |
| dropped | 62 | 0 |

The script is real and its 8/8 first run was real. But **every open check has a null signal**, so the
sweeper has nothing to act on and will close nothing on its next run. Coverage going forward is
**0 of 667** until signals are backfilled by hand — which scratchpad 0ai correctly identifies as
per-check human judgment.

Verdict: **built, correct, currently inert.** Not broken — starved.

---

## 3. `public.deliverables` — genuinely closed

The one item that could have halted this audit. Live anon probe:

```
GET /rest/v1/deliverables?select=id&limit=5   →  HTTP 401
{"code":"42501","message":"permission denied for table deliverables"}
```

The 58-row public leak of real user documents is **fixed and verified live**, not read. The audit's
one unambiguous pass.

---

## 4. Three "durably fixed" recurring classes RECURRED this week

`docs/cron-rebuild-failures.md` § Recurring Patterns, cross-referenced against 07/15–07/22:

- **"Secret wired in repo but not passed to workflow"** — documented with 3 May–June instances and a
  prescription. **Recurred 07/15**: `23410a45 fix(ci): wire SUPABASE_PG_* secrets into
  daily-rebuild.yml`, follow-on `57db3f8d ... post CI-secrets fix`. **Why it recurred is mechanical:**
  its guard, Gate 3, is labelled in its own source *"(advisory, never blocks)"* and only
  `process.stdout.write`s a NOTE. Recording half shipped; acting half never did.
- **"Leaf / conditional metric slug never registered in vocab"** — documented as durably fixed by
  Gate 2. **Recurred 07/18**: `d33bb497 fix(vocab): add collier_sold_median_homes_only to slug_index
  — master orphan-concept hold`.
- **Windows/POSIX path handling inside `.claude/hooks/` — a class the ledger does not name.** Two
  instances in five days: `bdfd9f18` (07/17, push-coverage hook, Linux CI red) and `1ad4eb12`
  (07/22, four-lane gate argv guard). Both hooks silently failing on a path assumption. Add it to
  Recurring Patterns; it is currently invisible as a class.

---

## 5. The week in numbers

- **641 commits** in 8 days; **27** are self-reversals (`correct|retract|false|wrong|no-op|overclaim`)
  — ~3.4/day, every day, across data, CI, RLS, email, geo and hooks.
- **24 operator interventions** captured verbatim in SCRATCHPAD, **12 on 07/22 alone**.
- **667 open checks**, 0 actionable by machine.

---

## 6. The structural thesis, with two new data points

The scratchpad names it three times (0ad, 0ae, 0ai): *we build the recording half of a mechanism and
never the acting half.* This audit adds two independent confirmations:

4. **Gate 3** records a secret-wiring reminder and never blocks — its class recurred 07/15.
5. **The four-lane gate** was written, tested, committed, fixed and documented — and never
   registered, so it records nothing and acts on nothing.

The pattern is **not** "Claude can't find data." Every traced failure this week found the data
existed. The pattern is: **a narrow surface is checked, the result is declared for the whole system,
and the declaration is written into a permanent record before anyone tests the whole system.** The
gate built to stop that failure shipped by committing that exact failure.

---

## 7. Hardening plan, ranked — built-and-verified vs proposed

**Tier 1 — one-line fixes to things already built (do today):**
1. Register `check-four-searches.mjs` in `.claude/settings.json` `Stop`. Everything else about that
   gate is moot until this lands. *(Not done — operator's call, it changes turn behavior.)*
2. Flip **Gate 3** from `stdout.write` to a real block when a touched workflow reads a secret absent
   from its `env:`. The class recurred 07/15 because the guard was built advisory on purpose.

**Tier 2 — proposed, designed enough to cost:**
3. **A hook-registration test.** Every `.claude/hooks/check-*.mjs` must appear in a settings file, or
   CI fails. This exact audit finding is machine-detectable in ~15 lines and would have caught the
   headline defect at commit time.
4. **Add the Windows/POSIX hook-path class** to `docs/cron-rebuild-failures.md` Recurring Patterns
   (2 instances, 5 days). Cheap, and it makes instance 3 recognizable instead of novel.

**Tier 3 — proposed, NOT designed, do not treat as promises:**
5. Backfill signals onto the 100 `verify`-class checks (highest signal-yield slice of the 667).
6. An absolute-claim lint on draft output ("we do not have X", "neither source", "unrecoverable")
   — flagged in the prior handoff, still unbuilt and unproven.

---

## 8. What this audit did NOT cover — stated so nobody inherits it as complete

- The 07/15–07/21 SESSION_LOG entries were **mapped by header and cross-referenced by commit**, not
  read line-by-line. The recurrence findings in §4 come from git + the failure ledger, which is
  stronger evidence than entry prose — but the entries themselves remain unread.
- `MEMORY.md`'s `feedback_*` files were not analyzed as a month-over-month trend dataset (handoff
  gap 6). Untouched.
- `_RESEARCH/audits/2026-07-18-site-audit.md` (117 KB) and the `2026-07-18-data-consolidation/` set
  were not opened. `2026-07-18-opus-pass.md` was read in full.
