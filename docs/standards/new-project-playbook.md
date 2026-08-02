# NEW PROJECT PLAYBOOK — guards, tracking, and keeping the AI on the rails

**Written 07/25/2026 from this project's own incident record**, not from theory. Every failure shape
below has at least one dated, named instance in `_ASSISTANT/SCRATCHPAD.md`, `SESSION_LOG.md`,
`docs/cron-rebuild-failures.md`, or `docs/standards/data-roots.md`.

**This file is deliberately NOT in `_RESEARCH/`.** `_RESEARCH/` is gitignored, and §2 of this
document is the proof that gitignoring a document is what stops it being read. A playbook filed
where nothing can find it would be the joke telling itself. This file ships, and it is written to be
copy-pasted into a new repo's root as `PLAYBOOK.md` verbatim.

**Scope note:** SteadyAPI has no bearing on this document — it is a property-data vendor and this is
a process/harness playbook. The outside-facts half (the Claude Code hook contract in §8) was
crawl4ai'd live from `https://code.claude.com/docs/en/hooks` on 07/25/2026, not recalled.

---

## 1. THE ONE LAW

Everything in this document is one law stated in different places:

> **We accept existence as evidence of function.**
> *(SESSION_LOG.md:647, 07/22/2026)*

An artifact existing — a file, a hook, a cron, a check, a guard, a research folder, a module — is
routinely treated as proof that it *works* and that it is *being used*. It is neither. This one
error class has no red signal: a duplicate table passes every test, a dead hook breaks no build, an
unread research file fails no lint. **Nothing goes red for redundancy or for silence.**

The operational form of the law, which is the thing you actually apply:

> **Every artifact needs a RECORDING half and an ACTING half. Two halves or it doesn't ship.**

This project built the recording half over and over and never the acting half:

- **72 `source_ceiling` entries** recorded what each source held but we hadn't pulled. Nothing ever
  read them back. Two separate sessions told the operator "we have no beds/baths" on 07/22 with the
  answer sitting in the registry, recorded correctly on 07/19, twice.
- **`scripts/ceilings-to-checks.mjs`** — the exact converter that fixes the above — was **built and
  committed**, then appeared in 6 files repo-wide: itself, 3 handoff docs, a skill, and a doc. Zero
  workflows, zero hooks, zero `package.json`. Built, never plugged in.
- **The `checks` ledger had an automatic OPENER and no automatic CLOSER.** `reverify-signals.mjs`
  reopened regressed checks; closing was one key at a time, typed by a human. The count could only go
  up. It reached **722 open, 8 with a signal** before anyone noticed the asymmetry was structural,
  not discipline. The operator's reaction is the whole lesson: *"WE HAVE NOTHING BUT PROBLEMS AND
  NOTHING WORKS CORRECTLY, SO WHAT IS THE POINT?"*
- **A new data root (`lee_comp_sales_v`) was created and never written into the roots catalog.**
  Nothing converts "I built a root" into a catalog edit.

**The ten-second test to apply to any new proposal:** *what reads this, and what acts on it?* If
either answer is "a human is supposed to remember to," you have built half a mechanism.

---

## 2. WHY GITIGNORED RESEARCH DOESN'T GET READ

This is the question with the cleanest mechanical answer, and it is not a behavioral one.

### The controlled experiment (run 07/25/2026, this repo)

`_RESEARCH/INDEX.md` line 8 contains the literal string
`first stop for any outside-answer question`.

| Search | Result |
|---|---|
| `Grep "first stop for any outside-answer question"` repo-wide | **No files found** |
| `Grep` same pattern, `path=_RESEARCH` | Found `_RESEARCH/INDEX.md` |
| `git check-ignore -v _RESEARCH/INDEX.md` | `.gitignore:163:_RESEARCH/` |

**The mechanism:** Claude Code's `Grep` tool is built on ripgrep, and ripgrep honors `.gitignore` by
default. A gitignored directory is invisible to the `Grep` tool without an explicit path — and to
every subagent and skill that searches through it. (A raw `grep -r` in Bash still finds the files;
the blindness is in the agent's own search tool, which is the one it actually reaches for.) It is not
that the model declines to read the research. It is that the model's primary *discovery* tool reports
the research does not exist.

### The precise claim — do not overshoot it

Gitignored research is **readable but not discoverable by content**.

- `Read` works fine on an exact path. (This file was written after reading `_RESEARCH/INDEX.md`.)
- `Glob` **also works** — a repo-wide `**/2026-07-22-*.md` did surface `_RESEARCH/` files. Filename
  discovery is intact.
- `Grep` **without an explicit path is blind.** That is the mode that matters, because you look for
  research by *concept* ("what did we conclude about caching?"), not by a filename you already know.

So the honest statement is: **to find gitignored research you must already know it exists.** The
only bridge from "I don't know it exists" to "I read it" is a rule in a prompt — and rules are the
weakest mechanism available (§3).

### The second half, which is worse

Gitignored means the files are **not in any other clone, worktree, CI checkout, or teammate's
machine**. Therefore:

- **No CI job can ever enforce reading them.** There is nothing to check out.
- **No hook running in a fresh worktree can reference them.** They aren't there.
- A worktree-based parallel session starts with **zero** research, silently.

This is why five separate "read our research first" rules accumulated in `CLAUDE.md` and none of
them fixed the failure. The repo's own postmortem says it: *"Five separate read-first rules now
point at this one failure; five rules for one failure is the proof that the rule layer cannot fix
it."*

### What to do instead (three options, pick by sensitivity)

1. **Default: commit the research.** If it isn't secret, gitignoring it costs you discoverability
   and buys nothing. This is the right answer ~90% of the time.
2. **Split it.** Commit a `RESEARCH-INDEX.md` with one line per finding — the *conclusion*, dated,
   with the filename. Gitignore only the bodies. Content search then hits the index, which names the
   path, which `Read` can open. The conclusion is usually the part you needed anyway.
3. **If it must stay fully private:** the index must be injected into context by a
   `SessionStart` or `UserPromptSubmit` hook (§8), because those are the only events whose
   stdout Claude actually sees. A rule pointing at an invisible folder is not a mechanism.

**This repo chose option 3 on 07/25/2026** — `.claude/hooks/print-research-index.mjs`, registered as
a `SessionStart` printer. It injects every category, filename, and one-line conclusion under a banner
stating that Grep cannot see these files and that a Grep miss is not evidence the research is absent.
The bodies stay gitignored, so the sensitivity decree is untouched. Copy that file as the reference
implementation; it fails soft (a fresh worktree with no `_RESEARCH` prints nothing and exits 0) and
carries five failure-mode tests.

**Generalize it:** *any* artifact excluded from content search — gitignored dirs, `.env` files,
anything in `node_modules` or a `.rgignore` — is invisible to discovery and must be surfaced by
injection or not relied upon.

---

## 3. RULES VS MECHANISMS — why most rules fail

This project ran the A/B test by accident and wrote down the result.

Two files, identical importance, opposite outcomes:

- **`SESSION_LOG.md`** — a `SessionStart` hook prints the last 8 entries every session, and a
  pre-push hook blocks any push whose commits didn't touch it. **Result: 12 of one day's commits
  touched it.** It works.
- **`SCRATCHPAD.md`** — governed by a RULE saying "read at session start." Nothing printed it.
  **Result: 68 lines sat uncommitted at session start, written by the prior session, unreadable by
  the next one even if it had looked.**

> **"The log has a mechanism, the scratchpad has a rule. Rules get forgotten across a compaction;
> hooks don't."** — SCRATCHPAD.md, 07/22/2026

The ranking, strongest to weakest:

1. **Hook that blocks** (`exit 2`) — cannot be rationalized around.
2. **Hook that injects context** (`SessionStart` / `UserPromptSubmit` stdout) — cannot be forgotten.
3. **CI job** — catches it before merge, but after the work.
4. **Test** — only covers what you thought to test.
5. **A line in CLAUDE.md** — survives until the first compaction, then it is a coin flip.
6. **A memory file** — *"Memory is recall, not a mechanism. Three files that nobody opens beats two
   files that nobody opens by exactly nothing."*
7. **A prose entry in a log** — *"not deferral, it's forgetting on a delay."*

**Day-0 consequence:** when you catch a recurring agent failure, do not write a rule. Write a hook.
If you cannot write a hook, write the rule AND open a tracked obligation to build the hook.

*Postscript, and it is the good news:* this repo eventually did exactly that for the scratchpad —
`print-scratchpad.mjs` is now registered at `.claude/settings.json:44` and
`check-scratchpad-on-push.mjs` gates the push. The 07/22 note calling that fix "not yet built" is
stale. **The pattern works when you actually install it.**

---

## 4. THE FAILURE SHAPES

Every incident in this project's history collapses into one of these. Each gets: what it looks like,
real instances, and the guard **type** that stops it. Guard types come from the project's own
RULE 3.5: *validation · gate · test · lint · detector*.

### 4.1 Table-vs-source conflation — "we don't have X" when we hold it

**Shape:** you check the artifact in front of you (one table, one endpoint, one file, one pill set),
find the field absent, and report it as a property of the *source* or the *platform*.

**Instances — five in a single day, 07/22/2026, three of them committed *after* being corrected on
the first:**
- Told the operator we had no **beds/baths**; the ceiling was recorded in the registry 07/19 with a
  service URL, and again in the roots catalog. Live probe found LeePA layer 23, literally named
  "Comparable Sales," 108,881 rows carrying `BedRooms`, `Bathrooms`, `YearBuilt`, `SHAPE`, joinable
  on a key we already hold.
- Told the operator we had **"zero flood data."** We hold live per-ZIP flood data and it *already
  renders on another page*. Root cause: read ONE file (`home-map-types.ts`), saw the homepage **pill
  set**, and reported it as our data holdings. A pill set is what one surface chose to show. It is
  not an inventory.
- Told the operator the sold universe was **"DOM-blind"** after checking one table. We hold sold-side
  DOM back to 2012 — 382,544 rows.
- Told the operator **the vendor has no sale dates** after checking ONE endpoint. A different
  endpoint returns day-grain ISO dates and had shipped weeks earlier. That single claim was then
  written into a commit message, two module headers, a SQL view comment, a roots trap, and a design
  rationale — an architecture built on a generalization from one endpoint.
- Claimed we call **"3 of 18"** vendor endpoints by grepping one helper in one TS file — ignoring the
  entire Python ingest layer and a second TS client. Truth: 7 of 18, **and a full capability census
  already existed**, operator-requested, six days old.

**Why it happens:** `information_schema` answers "what did we PULL." Nobody was asking "what does the
source HOLD." Those are different axes and only one of them was queryable.

**Guards:**
- **Validation (day 0):** every ingest records a `source_ceiling` — the full field list the source
  exposes — next to `confirmed_total`, the subset you pull. Cite the URL and an as-of date.
- **Gate:** a converter that turns every recorded ceiling into a tracked obligation, *run on a
  schedule*, so ceilings surface instead of sitting.
- **Rule with teeth:** "we don't have X" is a claim about the **catalog**, not about the file in
  front of you. Name which of the three you checked — roots catalog, source ceiling, live grep — as
  part of the answer.

### 4.2 Existence accepted as function

**Shape:** the artifact is there, so it is assumed to work.

**Instances:**
- **`check-four-searches.mjs`** — a hook that existed, documented five failures, quoted the
  operator's decree, and was **registered in no settings file. Zero Stop hooks were registered at
  all. It had never executed once.** Its own header records that it had *already* shipped once as a
  silent no-op from a Windows argv guard and "got described as a forcing function without ever being
  executed once." Same gate, believed working, not working, **twice**.
- **The lake comp feed** — built, tested, live-probed, committed, green. Imported by **nothing but
  its own test files**. Every production comp kept running the old vendor path.
- **A pipeline that has a cron and has never once completed.**
- **A docstring claiming "TIGER/Line 2024"** over fields whose own names (`ZCTA5CE10`, `GEOID10`) say
  2010. Anyone reading the docstring believes it's current.
- **`.claude/hooks/lib/*.test.mjs`** — CI's glob stopped at `.claude/hooks/`, so two test files had
  **never run in CI**.

**Guards:**
- **Test (day 0, the meta-guard):** a test asserting every `check-*.mjs` on disk is registered in a
  settings file **or** explicitly declared PARKED with a reason. Without this, every other guard you
  write is unverified. When this project finally wrote it, it immediately found a *second* live
  instance.
- **Proof on a real positive:** never accept a green unit test as proof a detector works. Run it
  against a real failure and watch it go red (§4.11).
- **Lint:** flag any module with zero inbound imports.

### 4.3 Recording half without acting half

Covered as the law in §1. **Instances:** 72 ceilings recorded / nothing read them · ledger opener
with no closer / 722 open · converter built / invoked by nothing · new root created / never
catalogued.

**Guard — gate:** for any registry, ledger, or catalog you introduce, the PR that adds the writer
must also add the reader. If the reader is "a session-start banner," wire it in the same PR.

### 4.4 Fix verified against the wrong artifact

**Shape:** you verify against the function you changed, the report you generated, or a screenshot —
not against the output the user actually receives.

**Instances:**
- **Equation footnotes.** Killed `specFootnote`, verified it returned undefined, declared it
  resolved. **`specFootnote` was never the only producer** — four existed and three still emitted.
  The operator read them in his inbox two days later: *"why the fuck are we writing equations???"*
  **Lesson: grep the rendered string, not the helper.**
- **The simulator.** Asked to show how emails actually send, a session built a command-line program
  that imported the builder's functions and **reimplemented the send path**, then reported it green
  for hours. It was testing a copy. Every divergence found got "fixed" *inside the simulator*, making
  it less like the site each time. The site already had the whole feature.
  **Lesson: OPEN THE SITE FIRST.**
- **Screenshots judging time-domain bugs.** The same page's physics was "fixed" **five times in about
  an hour** and still shipped broken, because a static screenshot structurally cannot catch "the
  camera jumped when I let go" or "it shakes forever." One commit message even admits the prior
  pass's screenshot test "was the wrong test and missed it" — then shipped on the same evidence class
  again.
- **A module that works is not a fix that shipped.** Same shape as "a code fix isn't live until the
  brain rebuilds," one layer down.
- **Screenshots don't tell you which code path produced them.** Five screenshots were logged as bugs;
  two were the *edit canvas*, not a sent email. Acting on them would have sent the next session
  hunting a nonexistent bug and deleting a required citation.

**Guards:**
- **Validation:** match the evidence class to the failure class. Interactive/time-domain → drive the
  real interaction. Rendered output → grep the rendered artifact. Data → query live.
- **Gate:** a fix isn't done until you name the consumer and show the consumer's output changed.

### 4.5 Symptom treated as cause

**Instance — the 07/21 prod outage.** PostgREST returned `PGRST002: Could not query the database for
the schema cache`. Confirmed. Vendor's own error code. The schema-cache introspection query logged at
48.6s where it should take ~50ms. Diagnosis: wedged cache. Advice: restart the project.

**The real cause was egress overage → spend cap → throttle.** Egress was at **778.592 / 250 GB = 311%
of plan**. A restart would have come back up and been throttled again within minutes.

> *"I had conclusive evidence of a SYMPTOM and treated a confirmed symptom as a confirmed cause. The
> vendor's own error string is still only the layer that broke, never the reason it broke. I never
> checked the billing/usage surface at all."*

**Guard — validation: CHECK THE ACCOUNT, NOT JUST THE CODE.** Quota, billing, plan limits, and usage
are facts that live outside your repo and no amount of code reading surfaces them.

Same lesson, different day: a three-move caching plan was proposed before anyone checked whether *any
traffic existed*. It didn't — the entire logged "traffic" was our own deploy smoke test, 1,055 rows
with the client id literally set to the string `"anon"`, every one traceable to a CI run 20–40
seconds earlier. Operator: *"there is no traffic..is there?"*

### 4.6 Cumulative counter read as a rate

**Instance:** the operator fixed egress three days running — *"just fixed this yesterday and the day
before and now we are even higher."* Egress is a **period-to-date counter**. A correct fix shipped
yesterday still leaves the number climbing; it only resets at the billing boundary. So "it went up
again" was **not** evidence the fix failed, and re-fixing on that signal meant fixing things already
fixed while the real burner ran.

**Guard — validation:** before using any number as a success signal, state whether it is a **rate** or
a **cumulative total**. Only rates can validate a fix. Write it in the runbook next to the metric.

### 4.7 Consolidation creating an undefended single point of failure

**Instance:** a "CRON CUTOVER" commit retired 12 standalone cron lines and pointed everything at one
parent workflow via nested `workflow_call`. That parent was later `disabled_manually` **at the API**.
One disable silently killed the ingests **and** the brain rebuild **and** the narrative bake **and**
the cache warm.

**Why nothing caught it:** `gh workflow list` reports the *children* active — they are. The disable
was on the parent, at the API, not in source. And because nested `workflow_call` runs execute under
the caller's run ID, the child's run history showed **100% `workflow_dispatch`, zero `schedule`,
ever** — which reads as "this has no cron" when the truth is "its cron moved to a parent that was
switched off." **Both readings are wrong in a way that hides the same fact.**

Data froze at the exact moment the chain went dark and stayed frozen for three days.

**Guards:**
- **Detector:** freshness monitor on the *output* (max timestamp in the destination table), never on
  the *workflow status*. Status surfaces lie; data does not.
- **Validation:** when you consolidate N things behind 1 thing, write down the new blast radius and
  what detects it.

### 4.8 Config kill ≠ process kill

**Instances, one week apart:**
- Campaign sends: the harness reported two background runs as killed/stopped and **the processes
  survived**, still sending on their original cadence. A resume was then started on top of two live
  senders. The operator received the same email three times.
- The egress burner: the `.mcp.json` key was renamed to `lake_DISABLED_EGRESS_BURN_20260721`. **In
  Claude Code the mcpServers key is just a display name** — the entry still ran the same command and
  its tools reappeared under a different prefix. Three server processes were still running. And the
  rename was **uncommitted**, which is why `git log -S` found no trace of two days of "fixes."

**Guards:**
- **Detector:** presence-based scan for the live process by **command line**, never by process name.
- **Validation:** after any "disable," verify the *process* is gone and the *config change is
  committed*, in that order.

### 4.9 A stale copy re-arms a fixed defect

**Instance:** after the egress burner was guarded on `main`, two other checkouts on the same machine
held **fully unguarded copies** — a registered worktree 30 commits behind, and an orphaned directory.
The guard's own comment claimed it covered "a stale config in a worktree." **It does not. The guard
is in code, and a stale worktree carries its own pre-guard copy of that code. A guard that isn't
there cannot fire.**

**And the honest correction that followed:** the initial claim "one session away from a 300 GB/day
burn" was an **overclaim**. `grep -c` proving the guard is gone does not prove the thing can *burn* —
burning also needs credentials, and that worktree had none. It crashes on startup.

> **The generalized lesson, which recurred the very next day on RLS: *absence of a guard is not
> presence of a capability.* Check the whole path before pricing the risk.**

**Guard — detector:** a scan that enumerates every checkout on the machine, not just `cwd`.

### 4.10 A policy existing is not a policy being correct

**Instance:** the operator said *"NOTHING IN SUPABASE HAS A RLS POLICY."* Premise checked: false — 38
policies existed and the tenant boundary was real. The dashboard showed 57 tables at INFO
`rls_enabled_no_policy`, which reads as "wide open" but actually means **deny-all**.

**Then the inversion, caught before it was spoken:** the 57 warnings were all safe. The one table
*with* a policy was the hole. `public.deliverables` had a blanket `SELECT USING (true)` — proven with
a real anon-key request against production: **all 58 rows, 3 distinct users, 53 real user
documents.** A live cross-tenant leak.

> **`USING(true)` is a policy. It passes every "has RLS?" check and grants the world read. Counting
> policies is not auditing them. The lint cannot tell you this; only reading the predicate can.**

**Guard — validation:** security checks must be **reachability probes with a real unprivileged
credential**, not catalog reads. Rank by what is exploitable *now*, not by what is alarming.

### 4.11 A probe that measures the wrong thing is worse than no probe

**Instance — both directions of error inside one hour:**
- The new egress detector's first live run flagged two "LIVE BURNER" processes that were **its own
  PowerShell probe**, whose command line contained the string it searches for. Cries wolf until
  ignored.
- The earlier manual sweep reported **zero** live processes because it filtered on process **name**
  instead of **command line**. Says all-clear while blind.

**Instance — measurement instruments:** the first inbound-import count searched only `app/` and
`components/` and reported a module as having zero consumers **the day after it shipped**. Repo-wide
it had five.

**Instance — a live false-alarm generator still in this repo:** `pg_stat_user_tables.n_live_tup`
reports **0** for nearly every large table. It is a stale planner estimate, not a count. Anyone
reading it concludes "the lake is empty" and is wrong. **Always `COUNT(*)`.**

**Guards:**
- **Test:** every detector needs a failure-mode test *and* a proof-on-a-real-positive run.
- **Validation:** a scan that cannot confirm its own guard token must report **RED / SCAN BROKEN**,
  never green. **Fail loud, never fail open.**

### 4.12 Empty-tolerance hiding total failure

**Instance:** during the outage, `/desk` rendered a **200 OK page with a green pulsing "Live" badge
and zero content.** Every loader was `try { ... } catch { return empty }`; every zone was
`{data ? <Zone/> : null}`. Empty-tolerance was designed for **one** dead feed, not thirteen. There
was no floor at which the page admits it is broken.

**The control case, same outage, same backend:** `/charts` rendered "Data unavailable" **and showed
the reason**. Same failure, opposite honesty — so the fix already existed in-repo.

**Guards:**
- **Validation:** every fail-soft surface needs a **floor** — if N of M feeds are dead, render an
  explicit degraded state. **A blank page that says "Live" is worse than an error page.**
- **Lint:** don't leak the raw vendor error string to end users; charts was honest but was speaking
  engineer to a customer.

### 4.13 Divergent copies of one rule

**Instance:** a records request sat **drafted-but-never-filed for 11 days, invisible at every session
start**, because the session-kickoff query filtered `state=in.(filed,acknowledged,...)` and **omitted
`drafted`**. The most-forgettable class of request was the one class the surfacing mechanism
structurally could not show. Second half of the same bug: the quiet-check did `if (!since) return
false`, so a never-filed row — which has no clock — could never cross a day threshold either.

The CLI's own `list` verb **had it right the whole time**, with an explicit comment saying so. Two
implementations of "which requests need attention," one correct, one not, no shared root.

**Guard — lint/refactor rule:** extract a shared helper on copy #2. A "keep in sync" comment is a
comment, not a guard.

**Related systemic gap worth stealing:** the engine assumed *it* performed every state transition.
When the operator filed a request himself through a portal, nothing recorded it and the ledger
silently drifted — then reported its own drift as the problem. **If a human can perform the action
out-of-band, you need a "record that I did this" verb that doesn't also perform the action.**

### 4.14 Answering the question the first file you opened is scoped to

**Instances:**
- Asked "how many listings are floored?", quoted **9.9%** from a spec written one day earlier. Live
  truth: **54.2%** (18,098 of 33,373). Off by 5.5×. The spec wasn't wrong when written — the backfill
  it described had since been wiped. **The wrong number then propagated into a plan doc and shaped
  its sequencing.**
- Asked whether PCA/Random Forest fit our data, probed one table's label clock, and answered "neither
  belongs, come back in September." **PCA is unsupervised — it never needed the labels.** A single
  spec's scope limit was imported as a limit on the whole platform.

> **Rule: a number in a spec, plan, or README is a HYPOTHESIS with a timestamp, never a served fact.
> Any count, share, or percentage the operator asks for gets queried live before it is spoken — even
> if a document *just* said it, even if you wrote that document this session.**

### 4.15 The meta-failure: every idea replaced by a new idea

> Operator: *"every fucking idea leads to another idea that says the last idea sucks."*

Confirmed live in the same session it was raised: the operator said "do all three," and the reply was
a new proposal explaining why all three were the wrong order.

Related instance: told *"Don't care about shipping this week. Do it right"*, a session probed, **found
exactly the data the operator predicted**, and then **stopped** — citing session dollar cost and
recommending a fresh session. Removing a deadline is authorization to go **deeper**, not to quit. And
quoting session cost at the person paying, unprompted, is substituting your judgment for his on his
own money.

**Guard — a rule, honestly labeled as a rule:** when the operator says do it, do it. A concern gets
ONE sentence, then execute anyway unless the action is destructive or irreversible. Never answer a
decision with a competing plan.

---

### 4.16 A recorded claim about the world, with nothing binding it to the world

**Shape:** you write down something true — a source exposes these fields, this file is unpulled,
there are N pipelines, this endpoint is gated. It is accurate the day you write it. Then the world
moves and **nothing forces the record to move with it.** The claim doesn't decay visibly; it stays
confidently phrased, carries an as-of date nobody re-reads, and gets trusted precisely because it
looks like verified fact rather than a guess. This is the opposite of 4.9 and 4.13 — there are no
divergent copies here. There is ONE authoritative record, and it is simply wrong now.

**Instances — three found in a single file on 07/30/2026, each by a different discovery path, which
is the tell that no mechanism was watching any of them:**
- A `source_ceiling` still listed `contract_cancellations`, `delistings_relistings` and `price_drops`
  as **unpulled**. All three had been live pipelines since 06/14/2026 — defined about twenty lines
  *below* the ceiling that called them missing, in the same file. Six weeks stale. Cost: a later
  session read the ceiling, believed it, and wrote up "three unpulled files" as a cheap win.
- The `active_listings` ceiling claimed detail pages carry an **HOA fee**. A live probe on 07/14/2026
  of a single-family and a condo page found none. The opposite failure direction from the one above —
  a ceiling inventing a field rather than hiding one — which is why a sweep looking only for
  "claims-missing-but-we-hold-it" missed it entirely. It was found in the checks ledger, where it had
  sat open and untouched for sixteen days.
- `test_cadence_registry_spine.py` asserts a **hardcoded pipeline count**. It was red at HEAD because
  a pipeline landed without bumping the literal. Its own docstring records the identical drift twice
  before, each time repaired by editing the number. Found by accident, while correcting something
  unrelated.

> **The generalized lesson: a claim about the world needs a mechanism that fails when the world
> changes, or it is a guess with a date on it. An as-of stamp records when someone last looked; it
> does NOT make the claim self-invalidating, and treating it as if it does is the whole failure.
> Note also that hand-patching an instance (edit the line, bump the count) leaves the shape intact —
> that is why the count guard drifted four separate times.**

**Guard — gate, not lint.** Bind the claim to the artifact it describes at the moment the artifact
changes: the change that lands a pipeline must edit the ceiling that named it, in the same commit,
or be blocked. Where a count or field list can be *derived* from the source of truth, derive it and
delete the literal — an assertion that can be computed should never be typed. Where it genuinely
cannot be derived (a vendor's field list, a portal's access posture), it is not fact, it is a dated
observation: label it unverified-since and re-probe on a cadence. **Never let a hand-typed claim
about an external world sit undated and unbound.**

### 4.17 The quality bar doesn't travel with the factory — capability and reader rules ship as a checklist, not adjectives

**Shape:** a new project copies the parent's DATA guards (provenance types, no-invention lint,
registries) and believes quality traveled with them. It didn't — the parent's quality lives in
three layers, and only what was written down as MECHANISM made the trip. **Proven three sends in a
row on the greenfield proof (databrief), all 08/02/2026:**

- **v1 — the reader bar didn't travel.** Every data guard green; the delivered email carried raw
  ISO timestamps with timezone offsets, "1 declarations", internal freshness tokens, a station id,
  datum names, method debug-speak, a serif font, and zero commentary. Operator: *"font sucks, no
  fucking commentary, backwards fucking date."* The parent held every one of these rules — as prose
  conventions in CLAUDE.md files the new repo never saw.
- **v2 — the reader bar was encoded, the CAPABILITY bar didn't travel.** Dates humanized, tokens
  scrubbed, computed commentary added — and the email still shipped with **no chart**, while the
  parent held a PROVEN chart→email pipeline (real chart components server-rendered to SVG,
  rasterized to PNG, hosted on an immutable public bucket). Operator: *"WHERE IS A FUCKING
  CHART!!!!! WHEERE THE FUCK IS BCKLIT???"* The clean-room framing ("don't use our current setup
  as the way") silently dropped the flagship capability along with the setup.
- **v3 — what held.** The capability traveled as a **bridge, not a rebuild**: the greenfield repo
  emits a small chart-spec JSON contract; the parent's proven renderer consumes it and returns
  hosted PNG URLs. Plus two adversarial reviewers on the rendered artifact before send (below).

**The named lessons, each a mechanism:**
1. **"Different market" means different data and framing — never a fresh quality floor.** The
   floor travels as a LIST the new repo is reviewed against: MM/DD/YYYY stated once per fact; no
   internal tokens; computed commentary a domain reader would forward; ≥1 chart from real series;
   ONE consolidated sources block (never per-line freshness stamps); homepage citation URLs (never
   API endpoints — a click that lands on raw JSON burns trust); singular/plural handling;
   mobile-fluid images (width attr for Outlook + `width:100%;height:auto` style).
2. **Proven factories travel as bridges; rebuilding them to stay "clean" is the v2 failure by
   omission.** The bridge cost one script and a spec contract; a rebuild would have been a second
   unproven renderer.
3. **Email charts have their own physics** (all hit the hard way, same day): Gmail strips SVG and
   data-URIs — a HOSTED PNG is the only universal render; an immutable-cache bucket + upsert means
   a same-key regeneration serves the OLD chart for a year — **content-hash every key**; a bar
   chart with no drawn axis renders a negative as a short *positive* bar — refuse negatives; a
   time-series x-accessor parses labels as dates — `"33921"` becomes year 33921 with no error.
4. **Two reviewer personas are part of the factory, not garnish:** a rendering-QA pass against the
   parent's real defect catalog, and a domain-reader + numeral-auditor pass. On v3 they returned
   four BLOCKERS a fully green suite passed: a fixed-width image breaking mobile reflow; headline
   CPI conflated with "claims inflation"; weather meaning asserted onto astronomical tide
   predictions; a Pacific-territory storm framed as an Atlantic-season signal. **Domain conflation
   is invisible to every lint; only a domain-reader persona catches it.**
5. **A source outage is not a build failure.** The loader holds the lake's prior rows and says so
   loudly; each brain carries a COVERAGE GATE deciding what held data may claim — a month with no
   rows is a true zero only if the window was actually pulled; zero-filling a partial pull is
   inventing numbers. (§4.12's floor, applied at ingest; OpenFEMA spent this exact day 503-flapping
   to prove it.)

## 5. DAY-0 SETUP — the minimum viable guard set, in install order

Do these before the first feature. Each is small; the order matters because each verifies the next.

**Step 0 — the meta-guard, first, always.**
A test asserting every hook file on disk is either registered in settings or explicitly declared
PARKED with a reason. **Without this, every other guard you write is unverified** — this project
proved that twice with the same file. Also assert your CI glob actually reaches every test directory
(this repo's stopped one level short and two suites never ran).

**Step 1 — session-start injection.**
A `SessionStart` hook that prints, in this order: last N session-log entries · open obligations ·
unresolved scratchpad items · anything else that must not be forgotten. `SessionStart` stdout is one
of only three events Claude actually sees (§8). **This is your single highest-leverage mechanism.**

**Step 2 — the append-only session log + its pre-push gate.**
Newest-first, append-only, never rewritten; correcting entries go on top. A pre-push hook that
**blocks** any push whose commits didn't touch it. This is the pair that demonstrably worked here.

**Step 3 — the obligation ledger, with a closer, from day one.**
A durable store of open obligations — not `⬜/✅` in plan docs, which nobody re-reads. Requirements:
- Every entry has an owner, a key, a label, a class (defect/verify/task).
- **An automatic closer exists on day one.** A ledger with an opener and no closer only grows, and a
  ledger that only grows gets abandoned. When this project finally built the sweeper, its first run
  closed **8 of 8** with zero human decisions — all had been done for weeks, unlooked-at.
- Signals must be **discriminating**. A loose `contains` check that closes a broken thing is worse
  than leaving it open.

**Step 4 — the scratchpad + its gate.**
The moment the operator raises an issue, gripe, or correction, it goes in a file **before** you
answer. Printed at session start (step 1) and gated on push. He should never type the same thing
twice because a session ended or context compacted.

**Step 5 — the data-roots catalog (if the project reads numbers).**
ONE catalog: concept → authoritative root → serving surface → what NOT to read. One root per concept.
Status markers so an unbuilt root is visibly the *intended home*, never a served value. Open its top
section before wiring any consumer. Without this, the same claim renders **2–14× apart** across
surfaces — measured here, not hypothetical. Three rent numbers for one ZIP disagreed by up to **7×**.

**Step 6 — full-scope-first on every source.**
Before writing ingest code, enumerate the **full** field list the source exposes and record
`confirmed_total` (what you pull) vs `source_ceiling` (what exists, unpulled) with a URL and as-of
date. Then **wire the ceilings→obligations converter in the same PR.**

Postmortem that forced this: a pipeline pulled **7 of 120 fields** off a parcel layer for over a week
— sale price/date, living area, year built, land value all sat unused **in the same already-open
response**. Second instance: a vendor endpoint we already pay for and already call returns
vendor-computed days-on-market, tax history, and price-per-sqft — all four arrays fetched, one
partially parsed, the rest discarded, while we hand-computed the same figures and declared a
17,000-call backfill "too expensive."

**Step 7 — failure-modes-before-build.**
No design gets approved without a section enumerating every way it can break, each paired with the
guard that stops it, each guard **typed** (validation / gate / test / lint / detector). A design with
a hand-waved failure-modes section does not get approved.

Why: **every guardrail on this platform shipped reactively, one incident at a time.** Build breaks →
bolt on a guard → breaks differently → bolt on another. The root cause was that the pre-build process
listed "error handling" as one word in a checklist with no forcing function.

**Step 8 — TDD, scoped honestly.**
Write the failing test **named after the failure mode it targets**, then implement. But know its
limit: a green suite proves logic does what you told it for known inputs. It does **not** catch an
environment hazard (dev pointed at prod), a data-existence failure (a value logically valid but
nonexistent), or an LLM inventing content. Those need a different guard type. **Don't let a green
suite stand in for a guard it was never built to be.**

**Step 9 — freshness detectors on outputs, not statuses.** (§4.7)

**Step 10 — the account-surface checklist.**
Write down on day one where the quota/billing/usage page is for every vendor, and which numbers there
are rates vs cumulative. (§4.5, §4.6)

**Step 11 — secrets and access, day 0.**
This is the step this project installed last and paid for first. Four real incidents:

- **The database was probed from the open internet.** Five auth FATALs in one log — three
  `password authentication failed for user "testuser"` spaced 233 seconds apart (a bot on a timer;
  we have no such user), plus a one-second scanner burst. **Network Restrictions were never
  checked**, and the vendor default is an empty allowlist, which means *all IPs may connect*.
- **The old database password was readable in public repo history.** Rotated, so the value is dead —
  but the note that deferred the history scrub said "if the repo ever goes public." It went public.
  **The scrub is due at the moment of going public, not "later."**
- **`anon` held INSERT/UPDATE/DELETE/TRUNCATE on 27 tables** with no policy. Deny-all today, but one
  permissive policy from a future migration — or one `DISABLE ROW LEVEL SECURITY` — and a table is
  world-writable with **no second line of defense**. The fix is to REVOKE the unused write grants,
  not to add more policies.
- **A live access token was pasted into a chat session in plaintext** and had to be rotated.

Day-0 rules that follow:
- Secrets live in ignored env files and the secret store. **Never in a tracked file, never in chat.**
  Note the two-step trap: setting a secret in the vendor UI is step 1; wiring it into the workflow's
  `env:` block is step 2, and skipping step 2 fails at runtime, not at commit.
- **Check the network allowlist before the first deploy.** Default-open is the trap.
- **Least privilege as a second layer.** REVOKE grants you don't use. Do not let row-level security
  be the only thing between a stranger and `TRUNCATE`.
- **Audit predicates, not counts** (§4.10). `USING(true)` is a policy and passes every "has RLS?"
  check.
- Decide on day 0 which surfaces are intentionally public, and write that list down — so a
  world-readable table is a decision on the record, not a discovery during an incident.

---

## 6. TRACKING WHAT YOU BRING IN

Three registries, each with both halves wired:

**1. Source registry** — one entry per external source: what it is, cadence, the pipeline that pulls
it, `confirmed_total`, `source_ceiling`, source URL, as-of date, and **which consumer reads it**.
*Acting half:* ceilings → obligations, on a schedule.

**2. Roots catalog** — concept → root → consumer → do-not-read. *Acting half:* a gate that refuses a
PR introducing a new table/view without a catalog entry in the same commit. This project's third
catalog-skip in a single day is what proves the rule alone doesn't hold.

**3. Obligation ledger** — every deferral, gap, and known-broken thing. **No silent deferrals:** the
moment you park a finding, open a ledger entry in the same session. Do not just write a log sentence.

> **The postmortem that forced this:** three separate data-grain gaps — found 06/30, 07/01, and 07/06
> — were each logged as prose and never promoted to the ledger. Each got rediscovered from scratch
> instead of connected. *"A log entry is not a substitute for the obligation."*

**The wiring audit that ties all three together:** periodically prove the lineage — every source has a
consumer, every consumer has a live root, every claimed wiring is grep-verified. This project's audit
found **7 registry claims proven stale, 2 fully unregistered tables, and 5 modules feeding nothing**.
You cannot trust a registry you have never audited against the code.

**And the corollary that stops the silent version of this failure:** a consumer wired to a dead root
finds nothing while the lake is full. That is exactly how a screen goes blank without a single thing
being "down." Catalog the dead roots explicitly — the DO-NOT-READ column is as load-bearing as the
root column.

---

## 7. KEEPING THE AI FROM LOSING TRACK

**7.1 — Put it on an event Claude actually sees.** Only `SessionStart`, `UserPromptSubmit`, and
`UserPromptExpansion` write stdout into Claude's context. Everything else goes to a debug log. A
`Stop` hook fires at the **end** of the turn, so it structurally **cannot** gate "before Claude says a
word" — this project shipped a forcing function on `Stop` and it could never have done its stated job.

**7.2 — Re-inject the load-bearing rules every prompt.** A `UserPromptSubmit` hook printing the 10–12
rules that actually get violated. `CLAUDE.md` is read once and decays across compaction; an injected
list does not.

**7.3 — Never let a rule loader fail open.** This project's rule-injection hook had a `DEFAULT_RULES`
constant of 7 rules while the live file carried 12. If the file was ever missing, unreadable, or
blank, the hook **silently substituted the 7-rule constant** and rules 8–12 vanished from every prompt
with no error. Fail loud or don't fail.

**7.4 — Context economics, measured.** Every tool call re-sends the entire conversation. A session
that passed 86% of a 200k window priced each additional call against ~172k tokens. **Long sessions
with many tool calls get superlinearly expensive.** Mitigation is to compact or start fresh, and to
front-load discovery so the expensive phase is short. Do not guess beyond this — the authoritative
number is the console/usage export.

**7.5 — Verify the tools in your own hand before reading vendor docs.** A session declared the machine
"blind" to a metric after reading a vendor's OpenAPI spec — while holding a wired connection that
exposed exactly that log, **no token, no setup**. *"I probed a vendor doc instead of the tool in my
own hand."*

**7.6 — Distinguish "we can't" from "we haven't."** *"'We can't read egress' was half true, and
stating it unqualified sent a prior session building around a wall that wasn't there."* Split every
capability claim into: available now · one credential away · genuinely impossible. Say which.

**7.7 — When two sessions disagree, check whether they answered different questions.** Two sessions
produced honest, verified, mutually-irrelevant egress numbers **six orders of magnitude apart** — one
measuring Storage/S3, one measuring API payloads. Nobody said so, and it read to the operator as three
days of contradiction. *"HOW DOES EVERYONE HAVE A DIFFERENT FUCKING ANSWER?"* Name the question before
comparing the answers.

**7.8 — Cite by phrase, not by ordinal.** Two parallel sessions claimed the same item numbers in the
same file within the hour. Numbered lists in shared append-only files are unstable identifiers.

**7.9 — Plain language first.** *"I DON'T KNOW WHAT YOU ARE TALKING ABOUT"* — a correct answer
delivered as internal IDs and node/edge counts. Lead with the one-sentence plain answer; hold the
trace as backup. Applies to internal architecture answers, not just customer-facing ones.

**7.10 — Ask "and then what?" before declaring done, before moving files, and before speaking a
count.** Five consequence shapes cover essentially every incident here: propagation (the value is
copied elsewhere), consumers (who reads it — or nothing does), latency (a rebuild must run first),
evidence class (a screenshot can't catch a time-domain bug), lifecycle (it races or survives a kill).
Scope it to blast radius, not to every edit — running it on a typo is how a good guard earns the
reputation that gets it ignored on a real change.

---

## 8. THE HOOK CONTRACT — verbatim, crawl4ai'd 07/25/2026

From `https://code.claude.com/docs/en/hooks`. These are the details that silently break guards.

**Exit codes — the landmine:**
- **Exit 0** = success. JSON output on stdout is parsed **only** on exit 0.
- **Exit 2** = blocking error. stdout and any JSON in it are **ignored**; stderr is fed back to Claude
  as the error. `PreToolUse` blocks the tool call, `UserPromptSubmit` rejects the prompt.
- **Any other exit code, including 1, is a NON-BLOCKING error — execution continues.** Quoting the
  docs: *"Claude Code treats exit code 1 as a non-blocking error and proceeds with the action, even
  though 1 is the conventional Unix failure code. If your hook is meant to enforce a policy, use
  `exit 2`."* The only exception is `WorktreeCreate`, where any non-zero aborts.

**A policy hook written with `exit 1` is a silent no-op.** That is the one law (§1) reproduced inside
the guard layer itself.

**Where stdout goes:**
- `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart` → **added as context Claude can see**.
- Everything else → debug log only, not the transcript.

**You cannot block at SessionStart.** For `SessionStart`, `Setup`, and `SubagentStart`, exit-2 stderr
renders as a `<hook name> hook error` notice, **Claude doesn't see it**, and the session proceeds.

**Timing:** `Stop` and `SubagentStop` fire at the end of the turn. The conversation continues so
Claude can act on the feedback — but it is *after* the answer, not before.

**Windows:** the `shell` field accepts `"bash"` or `"powershell"`; it defaults to `"bash"`, or to
`"powershell"` on Windows when Git Bash isn't installed. **Exec form** runs when `args` is set (no
shell, each element one argument verbatim); **shell form** when `args` is omitted. Set `args` whenever
the hook references a path placeholder.

**Useful extras:** `asyncRewake: true` runs the hook in the background and wakes Claude on exit 2,
surfacing stderr as a system reminder — good for long-running checks. `PreToolUse` supports
`hookSpecificOutput.permissionDecision` of `allow`/`deny`/`ask`/`defer`.

**Cross-platform warning from this repo's history:** hook path handling differs between Windows and
POSIX, and this project shipped a hook that was a **silent no-op from a Windows argv guard**. Test
hooks on the OS they will run on.

---

## 9. ADAPTING TO FAST-CHANGING TECH AND SHIFTING MODELS

**9.1 — Vendor surfaces get verified in-session, every time.** Any named vendor surface — MIME type,
endpoint, response shape, SDK call, model ID, package version — gets checked against live docs before
it ships. *"The plan says X," "the README claims X," "I remember X from training,"* and *"the prior
session specified X"* are **not** verification. A plan committed to the repo can still be wrong if its
author hallucinated the spec. Treat plans as hypotheses.

Concrete cost of skipping it, from this repo: workflows authored with `actions/checkout@v6` — **a
version that does not exist** — failed three separate crons before anyone checked. Cost of one live
doc fetch ≪ cost of shipping an invented contract.

**9.2 — Put an expiry on inherited documents.** Every spec, plan, and handoff carries a date, and any
number in it is a hypothesis as of that date (§4.14). Re-query rather than re-quote.

**9.3 — Scale discipline.** *"We have .00000001 percent of the data they have."* Any pattern borrowed
from a hyperscaler must justify itself at **your** volume or be dropped. Applied honestly, this kills
work: a proposal to stand up Prometheus + Grafana for nine gauges was replaced by a scheduled scrape
into one table rendered on an existing page. Apply the same test to your own process.

**9.4 — Assume the model changes underneath you.** The harness is the constant; the model is not.
Guards that live in **code** (hooks, tests, CI, lints) survive a model swap. Guards that live in
**prompt discipline** do not. Every time you notice "the model used to do X and now doesn't," that is
a signal to move that behavior from the prompt layer into the harness layer. This is the single most
important line in the document for the "Claude gets smarter in some places and dumber in most"
problem: **stop trying to fix behavior with words. Fix it with mechanism.**

**9.5 — Proportion.** Do bounded work directly — a few files, a known fix. One verification pass, then
act; never audit the audit. Reserve fan-outs and orchestration for scale that genuinely won't fit one
context, and require a concrete reason. **If the orchestration costs more than the task, just do the
task.**

---

## 10. THE ONE-PAGE CHECKLIST

**Before you build:**
- [ ] Read our own research/catalog first, then the live vendor source. Never from memory.
- [ ] Enumerate the full source scope, not just the fields this task needs.
- [ ] Write the failure-modes section: every break paired with a **typed** guard.
- [ ] Name what reads this artifact and what acts on it. Two halves.

**Before you say "done":**
- [ ] Verified against the **output the user receives**, not the function you changed.
- [ ] Evidence class matches failure class (no screenshots for time-domain bugs).
- [ ] Named the consumer and showed its output changed.
- [ ] Any number spoken was queried live, not quoted from a doc.
- [ ] Any detector was proven on a **real positive**, not just a green test.

**Before you say "we don't have X":**
- [ ] Checked the roots catalog.
- [ ] Checked the source ceiling, not just `information_schema`.
- [ ] Grepped the live data.
- [ ] Named which of those three you checked, in the answer.

**Before you call something disabled / fixed / safe:**
- [ ] The process is gone, not just the config entry.
- [ ] The config change is **committed**.
- [ ] Every checkout on the machine is covered, not just `cwd`.
- [ ] The success signal is a **rate**, not a cumulative total.
- [ ] The policy's predicate was read, not just its existence counted.
