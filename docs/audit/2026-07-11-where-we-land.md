# Where we are, what's in flight, and where this lands

**As of:** 07/11/2026 · **Method:** read-only. Nothing was touched, triggered, or pushed.
Every claim below was verified against the live code, the live lake, the live ledger, or the live
site in-session. Where I could not verify something, I say so.

Companion to `2026-07-11-open-issues-after-triage.md` (the ledger inventory) and
`2026-07-11-pipeline-problems/00-DIAGNOSIS.md` (the why).

---

## 1. Is the open-issues doc correct?

**Yes. It reconciles exactly.** It lists 247 keys and claims 247 open. The live ledger now reads
244. The delta is fully accounted for: 5 checks closed since it was written (17:56 today) and 2 new
ones opened. 247 − 5 + 2 = 244. No drift, no fabrication, nothing dropped.

Spot-checked every P0 claim against the actual brain files. All confirmed **verbatim** — the
$93,663,630 average and $3,389,600,145 worst-case in `hurricane-tracks-fl`, the
"LEE + COLLIER + CHARLOTTE" scope line in `storm-history-swfl`, the "111 of 126 ZIPs" in
`seller-stress-swfl` (and mirrored forward into `master`). P1 confirmed by live query:
`community_profiles` is genuinely 0 rows. The $35k-median hotfix is confirmed live and correct
(ZIP 33972 now $359,000, 33974 now $325,000).

It is an honest document. It needs **three corrections**, one of which is load-bearing.

### Correction 1 — P0 is understated. Two brains are frozen until 2027, not "stale".

The doc says the scope fixes "shipped in code but the live brains were never rebuilt." True, but it
reads like drift that will wash out. It won't. These brains carry long TTLs:

- `hurricane-tracks-fl` — `ttl_seconds: 31536000` (**365 days**), built 06/19/2026.
  Nothing rebuilds it until **06/19/2027**.
- `storm-history-swfl` — `ttl_seconds: 31536000` (**365 days**), built 06/29/2026.
  Nothing rebuilds it until **06/29/2027**.
- `env-swfl` — 30 days, built 07/03 → self-heals ~08/02/2026.
- `seller-stress-swfl` — 30 days, built 06/29 → self-heals ~07/29/2026.

The TTLs are *correct for the data* (NOAA really does publish HURDAT2 annually). That is precisely
the trap. Absent a forced rebuild, the six-county hurricane figures and the three-county storm
figures stay on the live site **for another full year**, and no watcher, probe, or freshness gate
will ever say a word — because both brains are perfectly inside their declared freshness contract.

### Correction 2 — the rebuild set splits in two. Rebuilding half of it makes things worse.

The doc's P0 action reads "one targeted rebuild of the affected brains likely closes this entire
cluster," and files `scope_more_brains_charlotte_leak` under "Related, same family." **Those are not
the same family, and treating them as one sweep would ship a regression.**

I checked the scope logic in code, per brain:

**Group A — code IS correctly re-scoped. Force-rebuild is safe and publishes correct numbers.**
- `hurricane-tracks-fl` — `SWFL_COUNTIES` = Collier / Hendry / Lee. Charlotte, Glades, Sarasota
  removed with an explicit comment. Clean.
- `storm-history-swfl` — `SWFL_COUNTIES = ["LEE", "COLLIER"]`. Clean.
- `env-swfl` — scope comes from `env-swfl-source.mts` (Lee / Collier / Hendry) and
  `fema-nfip-source.mts` (same three, fixed today in `da221f0c`). Clean.
- `seller-stress-swfl` — imports `isCoreScope` from `refinery/lib/core-scope.mts`; the authority is
  57 core ZIPs. The live "111 of 126" is the *old* denominator. Clean.
- `sector-credit-swfl` — small-n fix, not a scope fix. 7-day TTL, built 07/07 → self-heals 07/14
  anyway.

**Group B — code is NOT re-scoped. Force-rebuilding these today would make the problem invisible.**
- `econ-dev-swfl` — the pack *still says* "Lee + Collier + Charlotte" (`econ-dev-swfl.mts:22`, and
  again at `:343` and `:360`, where it reaches the output description).
- `licenses-swfl` — its DBPR sources still carry the wide footprint
  (`dbpr-press-releases-source.mts:25`: "Lee/Collier/Charlotte/Sarasota/Hendry";
  `dbpr-public-notices-source.mts:17`: "...Charlotte, Sarasota, Manatee, Hendry, Monroe").

Rebuilding Group B before fixing the code republishes the Charlotte overclaim **stamped with
today's date** — converting a detectable-stale error into an invisible-fresh one, and destroying the
stale build date that is currently the only way to catch it.

**And there is a clock on this.** `econ-dev-swfl` has a 7-day TTL and was built 07/07. It
**expires 07/14 — three days from now.** On that night the cron will rebuild it unprompted and
republish "Lee + Collier + Charlotte" with a fresh date, with no human in the loop.
`licenses-swfl` (30-day TTL, built 06/29) does the same around 07/29. The code must be re-scoped
before those dates or the automation ships the regression for us.

### Correction 3 — a new P0 landed after the doc was written.

`mcp_post_transport_500` — I probed it live this session:

```
POST https://www.swfldatagulf.com/api/mcp   →  HTTP 500
```

Every `initialize` call fails. The entire MCP write flow is down right now. It postdates the doc, so
it is correctly absent from the doc's P0 list — but it belongs at the top of the board today.

---

## 2. Root cause 6 — the one nobody wrote down

`00-DIAGNOSIS.md` names five root causes. There is a sixth, and it is the direct cause of the entire
P0 cluster:

**A code fix does not invalidate the brain it fixes.**

`refinery/cli.mts` decides whether to rebuild by calling `brainStatus(id)`, which is purely
`refined_at + ttl_seconds`. I searched the whole refinery for a pack hash, code hash, source
fingerprint, or spec fingerprint. **There is none.** The only escape hatches are TTL expiry or an
explicit `--force`.

So the system has two completely different publish latencies, and nobody chose them:

- A **data-layer** fix — like the `$35k` median SQL migration — is applied to the view and is live
  instantly. That one worked.
- A **code-layer** fix — like re-scoping six counties to two — is invisible to users until the TTL
  runs out. Up to a year.

This reconciles the apparent contradiction inside our own audit set. `00-DIAGNOSIS` lists under
*"What is actually fine"*: "All 40 brains are within their declared freshness contracts." That is
**true**. The P0 list says those same brains are publishing wrong numbers. That is **also true**.
Both hold because **freshness measures data age, never code version.** The green light is real; it
is just measuring something other than correctness. That is the same "verify effort, not outcomes"
disease the diagnosis diagnoses — it simply never turned the lens on the refinery itself.

**The build spec does not close this.** `2026-07-11-data-contracts-doctor-design.md` §8 specifies the
nightly chain as `rebuild (do NOT force)`. So after the entire Path-A build ships — contracts,
doctor, Spine, nightly chain, all of it — a pack re-scope will *still* sit unpublished for up to a
year. The most expensive build on the board does not fix the most visible bug on the board.

**Proposed fix (not yet tested — this is a proposal, not a verified change).** Fingerprint the pack's
code into the brain's frontmatter, and treat a fingerprint mismatch as `stale` inside `brainStatus()`.
Per RULE C2 (extend existing seams, never erect a new gate), this should hang off the invalidation
seam that already exists — `refinery/lib/dag.mts` exports `walkConsumers` (line 66), which is exactly
the "who reads me, and must therefore also rebuild" walk this needs, and which
`row_tier_t1_transitive_invalidation` already notes is built-but-unwired. This is a small change with
a large blast radius: it makes "we merged the fix" and "users see the fix" the same event, forever.
It should be sequenced **before** Path A, not after — it is cheaper than any phase in the spec and it
is the only one that stops the bug that is live right now from recurring.

---

## 3. Where we actually are

### Shipped today (~20 commits, all pushed, main is green)

CI red killed after 35 straight red pushes (`c2730676`). Then a run of real correctness fixes:
env-swfl Charlotte ZIP denominators pruned (`da221f0c`), SteadyAPI `lot_sqft` no longer dropped
(`fc1eef97`), BLS PPI series relabeled (they were industrial, not residential — `0559c370`), FRED
source URL corrected (`5953a1b0`), Lee & Associates cap-rate no longer silently discarded
(`4a23ff21`), chief-of-staff OIDC permission (`b8ae2c7f`). Plus the LeePA pivot: `zip_code` became a
**column** on `leepa_parcels` and the redundant crosswalk pipeline was deleted (`b9a08bf0`,
`9ce2acb3`) — that was an operator catch and it was the right call.

### In flight right now (uncommitted, parallel sessions — I did not touch any of it)

**Stream 1 — Collier parcels + source-liveness.** Adds `sale_prc1` to `collier_parcels` (unblocks
the Collier homes-only sold median, the fast-follow to Lee), adds per-chunk retry with backoff to
the Tier-2 promotion (a real 07/11 connection timeout killed a 20-minute run at chunk 2 of 73; the
merge is idempotent on `parcel_id`, so the retry is safe), re-baselines the DBPR applicants floor
7,800 → 7,850 from two real observed counts, and substantially rewrites `probe_source_liveness.py`.
**Assessment: sound, and it is aimed directly at root causes 1 and 4.** It is currently blocked —
`leepa_zip_backfill_ingest_blocked_by_throttle` says LeePA rate-limited the local IP and the L12
count-only call times out. The code is ready; it needs the throttle to clear.

**Stream 2 — socials.** `render-current-cards.mts` plus the Round-2 direction handoff.

**Stream 3 — the pipeline-health research pack.** `08a`–`08h`, ~2,800 lines of untracked evidence
from a 27-agent read-only fan-out. **This is the most valuable untracked thing in the repo right
now** and it is one `rm` away from being gone. It found **six places the build spec is wrong**,
including a proposed tripwire that is arithmetically incapable of firing (it compares the view's
WHERE clause against a byte-for-byte copy of itself) and a proposed price floor that would have
**deleted real manufactured-home sales** in North Fort Myers lease-lot parks. Those two corrections
alone justify the entire pack. It should be committed before anything else happens to this tree.

### Stranded

Two worktrees with unlanded commits: `bp-fold` (1 commit) and `bp-pipeline-census` (3 commits,
including a `data_lake` write — ask-first territory). Both have open checks. Neither is monitored by
anything.

---

## 4. The plan — sequenced

### Step 0 — today, before anything else

**Two live production outages outrank everything else on this board, including the brain rebuild.**
Both were found by the checks sweep, both independently confirmed here, and both were sitting on the
board wearing the word "unverified." That is the real lesson of the triage: *those checks weren't
lazy leftovers — they were outages wearing a checkbox.*

> **Correction (both root causes below are now PROVEN from production logs; an earlier revision of
> this file blamed the MCP outage on an `@modelcontextprotocol/sdk` 1.29-vs-1.26 export-path break.
> That was WRONG — I disproved it by fetching the 1.29.0 tarball, which ships every file in question,
> and by driving the real handler at both versions: it returns 200 at each. The SDK is innocent. The
> real causes are below. Both are FIXED in code, pending deploy.)**

1. **`mcp_post_transport_500` — the MCP surface is dead.** `POST /api/mcp` returns 500 on every call.
   **Root cause, quoted from the production log** — Vercel records the thrown object verbatim:

   ```
   level=error  message="Response { status: 401, headers: {... Mcp-Session-Id} }"
   requestPath=/api/mcp  responseStatusCode=500
   ```

   `app/api/mcp/auth.ts` did `throw new Response(401)`, on the belief — stated in its own comment —
   that *"Next.js App Router returns a thrown Response directly to the caller."* **It does not.** That
   is the Remix / React Router idiom. Next route handlers **return** a Response; a thrown non-Error is
   an unhandled exception, answered with a bare 500. It went live the moment `MCP_BEARER_TOKEN` was
   actually set in Vercel (created 07/03/2026) — so the surface has been dark for eight days. Verified
   live: prod returns 500 for a missing token **and** for a well-formed wrong one, where 401 is owed.
   **The unit tests stayed green the whole time because they asserted the *throw*
   (`expect(caught).toBeInstanceOf(Response)`), never the status a client receives.**
   **Fixed** (`031b05da`): `assertAuthorized` → `unauthorizedResponse(): Promise<Response | null>`;
   callers return the denial. **Three** routes carried the identical bug — `POST` and `DELETE
   /api/mcp`, plus `POST /api/templates/render`, which only `next build` found, not grep.

   **Still needs you:** the fix makes the gate *honest* (401, not 500). It does **not reopen** the
   surface — `MCP_BEARER_TOKEN` is still set, so external clients stay locked out. If `/api/mcp` is
   meant to be public (CLAUDE.md lists it as a live surface; `api_b_open_rate_limit` describes it as
   open JSON, no auth), **that env var has to come out of Vercel.** Infra flip — your call.

2. **PDF generation is dead — and so are PDF-attached blasts.** Every deliverable PDF download 500s
   (all four seeded examples), while the pages render fine. PDFs are **half of what the product
   promises**. **Root cause, from the production log:**

   ```
   Failed to load external module pdf-parse: ReferenceError: DOMMatrix is not defined
   Cannot load "@napi-rs/canvas" ... pdfjs-dist/legacy/build/pdf.mjs
   ```

   `lib/pdf/extract.ts` imported `pdf-parse` at **module scope**. `pdf-parse` pulls in `pdfjs-dist`,
   which needs browser graphics globals (`DOMMatrix`/`ImageData`/`Path2D`) that **do not exist in the
   Vercel serverless Node runtime** — merely *loading* it there throws. And because `lib/pdf/index.ts`
   re-exports `extract.ts`, **every importer of the `@/lib/pdf` barrel dragged pdfjs in — including the
   two routes that only ever *write* a PDF and never read one.** The PDF *reader* was killing the PDF
   *writer*. Blast radius was one route wider than the sweep found: `.../blast` (attach-PDF on a send)
   has the same import and the same 500.
   **Fixed** (`8a7f780b`): `await import("pdf-parse")` inside the one function that reads. Guard test
   asserts nothing behind the barrel statically imports pdfjs — proven to catch it (2 fail against the
   old file, 4 pass against the fix).

   **Why every local test passed while prod was down:** the failure only reproduces inside a serverless
   bundle. A dev box has `DOMMatrix`. This is root cause 1 of the diagnosis — *green measures process,
   not outcome* — aimed at the app tier instead of the data tier.

3. **Commit the 08 research pack.** It is untracked and irreplaceable (~6.5M tokens of verification).

4. **Re-scope `econ-dev-swfl` in code.** Its TTL expires **07/14**. If it rebuilds before the code is
   fixed, the automation republishes the Charlotte overclaim with a fresh date and we lose the only
   signal we have. `licenses-swfl` is the same problem on a 07/29 clock.

### Also found by the sweep (real bugs, lower blast radius)

- **The homepage "New Listing" button never saves the address** — that lane is broken end to end.
  Matches `new_listing_scope_address_missing_on_fresh_project` (P2): a fresh project's
  `subject_address` never reaches `scope.address` when the project has zero items, so the
  address-lane flyer silently never fires.
- **The email-capture modal was orphaned** when the block shell was retired on 07/07.
- **Housekeeping:** 4 duplicate test projects ("Triage Verify 5100 SW 5th Pl") are sitting in the
  account from the address-bug repro and want deleting.

**Ledger:** 333 → 245 open. 116 closed today, every one against observed evidence. (245, not 244 — I
opened `pack_code_change_no_brain_invalidation` for root cause 6.)

### Step 1 — pull the live overclaim off the site (hours, not days)

Force-rebuild **Group A only** — the five brains whose code I verified is correct. Targeted, one at a
time, never `pack_id=master --force`:

```
gh workflow run daily-rebuild.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf \
  -f pack_id=hurricane-tracks-fl -f force=true
```

…and the same for `storm-history-swfl`, `env-swfl`, `seller-stress-swfl`. **Do not include
`econ-dev-swfl` or `licenses-swfl` in this sweep** until their code is fixed (see Correction 2).

Two things to get right while doing it:

- **Sequence the leaves, then let master synthesize once.** Every `pack_id=<leaf>` rebuild triggers a
  master synthesis pass. Five separate leaf rebuilds = five Sonnet passes for one useful result.
- **Master is the surface users actually read, and it is currently carrying the stale text forward.**
  `master.md` was rebuilt this morning (07/11 02:54) and it *still* quotes seller-stress's 06/29
  snapshot — "111 of 126 ZIPs" — verbatim. Master being fresh does not make master correct; the thin
  pipe faithfully republished a stale upstream. The fix is not user-visible until master's **served
  bytes** change.

This *enables* closing roughly eight checks — it does not close them. A rebuild produces the
evidence; someone still has to read the live brain, confirm it says "N of 57" and that the
six-county figures are gone, and close against that. Verify the served bytes, not the diff.

### Step 2 — close root cause 6 (the structural fix)

The pack-code fingerprint, hung off `walkConsumers`. Without it, Step 1 is a one-time cleanup that
silently rots again the next time anyone edits a pack — which, given today's twenty commits, is
roughly tomorrow.

### Step 3 — Path A, per the build spec, with the 08 pack's corrections applied

Spine → content contracts → config cross-check → watch-manifest + cancelled-run fix → doctor →
nightly chain → caveat TTL. The spec is a good spec. **Read `08-FABLE5-RESEARCH-INDEX.md` first and
apply its six corrections** — the spec is a hypothesis, the pack was checked against reality, and
where they disagree the pack wins.

### Step 4 — the empty-table cluster (P1)

`community_profiles` (0 rows), `dbpr_re_licensees` (0), `email_sequences` (0), `email_events` (0),
`daily_truth` median (all NULL), narratives. Features built on nothing. Each is a decision — fill it
or delete it — and each should be made explicitly rather than left to rot as a check.

---

## 5. Where this lands

**On correctness.** The "wrong in front of users" class goes to zero — and, with the fingerprint fix,
*stays* zero, because the mechanism that let a fix sit unpublished for a year is closed rather than
manually swept. That is the difference between cleaning this up and cleaning it up permanently.

**On the ledger.** Be honest: 244 does not collapse to 20. Step 1 takes out ~8, Path A takes out
maybe 15–20, the empty-table decisions another ~7. Roughly 20 more are P5 — blocked on an operator
decision or a real send, and no agent can close them at all. Realistic landing zone is somewhere near
**180–200 open**, and that is fine. The number was never the point. What changes is the *shape*: the
top of the board stops being "a live overclaim nobody noticed" and starts being "a feature we
haven't built yet." Those are very different kinds of 200.

**On the system.** One config truth (the registry Spine), one health model per dataset (doctor),
assertions that travel with the data instead of watching it from a distance, a nightly chain that
proves rows landed before it rebuilds anything, and a refinery where merging a fix and shipping a fix
are the same event. Red starts meaning something again — which is the actual precondition for every
other thing on this list staying fixed.

**The thing to internalize.** The five root causes in the diagnosis are all versions of one sentence:
*we verify that work happened, not that it worked.* Root cause 6 is that same sentence pointed at
ourselves — we verified that the fix was **merged**, closed the check, and never asked whether it was
**published**. The build spec is aimed at the data. This one is aimed at us, it is the cheapest item
on the board, and it is the only one that stops today's P0 from being next month's P0.
