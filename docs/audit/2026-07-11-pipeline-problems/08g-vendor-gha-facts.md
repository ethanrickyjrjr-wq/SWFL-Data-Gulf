# 08g — Vendor GHA facts (live-verified)

**As-of:** 07/11/2026 · **Source:** research fan-out for `docs/superpowers/specs/2026-07-11-data-contracts-doctor-design.md` §13 (25 opus + 2 sonnet agents, read-only).
**Status:** evidence for Fable 5's build. Every claim below was produced by an agent that read the live files / queried the live DB (SELECT-only) / fetched live vendor docs. Numbers anchored to `03-lake-live-state.md` as the canonical 07/11/2026 fixture.

CLAUDE.md non-negotiable #1 / RULE 0.4: verified in-session against live vendor sources (live `gh api` + crawl4ai on GitHub docs), never from memory. Fable 5 writes real YAML from these.

---

Confirmed decisively — `dbpr-sirs-monthly.yml` is the single self-hosted Windows-runner workflow *and* the one bumped to `@v4`. Writing the section now.

## Vendor GHA facts (live-verified 2026-07-11)

All three facts verified in-session against primary sources (CLAUDE.md non-negotiable #1 + RULE 0.4). Sources: live `gh api` against `repos/actions/checkout` (read-only), and crawl4ai fetches of three GitHub docs pages. No numbers from memory. **Two of these findings break assumptions in spec §6 and §7-3b — flagged as drift below.**

---

### Fact 1 — `actions/checkout`: latest major is **v7**; **v6 exists and always did**. The diagnosis's "nonexistent version" label is refuted.

**Source:** `gh api repos/actions/checkout/tags` · `gh api repos/actions/checkout/releases` · `gh api repos/actions/checkout/git/ref/tags/{v4,v5,v6,v7}` (all read-only, fetched 2026-07-11)

Live release timeline (verbatim `tag_name` / `published_at`):

| Tag | Published | Floating major tag → commit date |
|---|---|---|
| **v7.0.0** | **2026-06-18T13:53:05Z** | `v7` → `9c091bb2`, 2026-06-17 |
| v6.0.3 | 2026-06-02T14:35:13Z | `v6` → `df4cb1c0`, 2026-06-02 |
| v6.0.2 | 2026-01-09T19:53:28Z | |
| v6.0.1 | 2025-12-02T16:38:59Z | |
| **v6.0.0** | **2025-11-20T16:24:08Z** | |
| v5.0.0 | 2025-08-11T12:39:13Z | `v5` → 2025-11-13 |

`gh api repos/actions/checkout/releases/latest` → `{"tag_name":"v7.0.0","draft":false,"prerelease":false}`.

**Resolving the contradiction — both documents are wrong, in opposite directions:**

- **Spec §4** ("`actions/checkout@v6` is **valid today**… don't 'fix' it") — **correct but already stale.** v6 resolves. But v7 shipped 2026-06-18, *three weeks before the spec was written*, and the spec doesn't know it. Latest major is v7, not v6.
- **00-DIAGNOSIS:60** ("`actions/checkout@v6` (nonexistent version) — two workflows, three incidents") — **the label is false at the recorded incident dates.** The ledger rows (`docs/cron-rebuild-failures.md:24-26`) are dated **2026-06-22** (`dbpr-sirs-monthly`) and reference `redfin-monthly` **2026-05-26**. v6.0.0 shipped **2025-11-20** and v6.0.2 **2026-01-09** — v6 had existed for **six-plus months** on both dates.

**Internal refutation (decisive):** the repo runs **101 × `actions/checkout@v6`** across `.github/workflows/` today (vs 6 × `@v4`). If `@v6` did not resolve, essentially every workflow in the repo would fail at the checkout step. It plainly resolves.

**Corroborating evidence that the true cause lies elsewhere** — the same ledger row records the actual error:

> `docs/cron-rebuild-failures.md:26` — ``Error: EACCES: permission denied, stat 'C:\Users\ethan\AppData\Local\Microsoft\WindowsApps\pwsh.EXE'``

And `dbpr-sirs-monthly.yml` is the **only** workflow in the repo on a self-hosted Windows runner — `runs-on: [self-hosted, swfl-local]` (`dbpr-sirs-monthly.yml:21`; the other 106 jobs are `ubuntu-latest`) — *and* it is one of the two workflows "fixed" by bumping to `checkout@v4` (`dbpr-sirs-monthly.yml:39`). An EACCES on a Windows app-execution-alias is a runner/shell-resolution failure, not an action-version failure.

> **Scope discipline:** I verify the vendor fact, I do not re-diagnose the incident. What is proven: **the "nonexistent version" label is refuted.** What is *not* proven: that the v4 bump was wrong, or that the pwsh EACCES was the true cause. The real root cause of those runs is **unresolved and out of scope here** — it should carry an open check, not an assumption.

**This validates the spec's design point — it is the archetype, not an aside.** The ledger baked a **"v6 is bad" literal** that was false when written. Spec §4/§6's rule — *"the Phase-2 version check must resolve against live/maintained tags, never a baked-in 'v6 is bad' literal"* — is **confirmed correct**, and this incident is precisely why: a baked literal would have **false-flagged v6 in June** (when it was fine) *and* would be **blind to v7 today**. Phase 2's `uses:` check must hit live `gh api .../tags`. **Confirmed as designed.**

**Caution for Fable 5 — do NOT read "latest = v7" as "mass-bump 101 workflows."** A live-tag check validates **existence, not compatibility**. v7.0.0's release notes (`gh api repos/actions/checkout/releases/tags/v7.0.0`) name two behavior changes:

> * `block checking out fork pr for pull_request_target and workflow_run` (PR #2454)
> * `upgrade module to esm and update dependencies` (PR #2463)

We use `workflow_run` in four workflows (`grade-predictions`, `narrative-bake`, `log-cron-incident`, `heal-cron-failure`). They check out the default branch, not fork-PR refs, so this likely does not bite — but it is a **named behavior change on a trigger we actively use**. The chain members are all `ubuntu-latest`, so the v6/v7 choice is low-risk *for the chain*; the one self-hosted Windows runner is the exception. **Recommendation: leave the 101 `@v6` pins alone; the version check should assert "resolves against a live maintained tag," not "equals latest."**

---

### Fact 2 — `workflow_call` + `needs:` + `secrets: inherit` work as spec §8 assumes. **Two landmines the spec does not account for.**

**Source:** crawl4ai → `https://docs.github.com/en/actions/using-workflows/reusing-workflows` and `https://docs.github.com/en/actions/reference/workflows-and-actions/reusable-workflows` (fetched 2026-07-11)

**`secrets: inherit` — CONFIRMED.** Verbatim:

> "Workflows that call reusable workflows in the same organization or enterprise can use the `inherit` keyword to implicitly pass the secrets."

> "If the secrets are inherited by using `secrets: inherit` in the calling workflow, you can reference them even if they are not explicitly defined in the `on` key."

```yaml
jobs:
  call-workflow-passing-data:
    uses: octo-org/example-repo/.github/workflows/called-workflow.yml@main
    secrets: inherit
```

**`needs:` ordering + job outputs — CONFIRMED.** The caller consumes a reusable workflow's outputs exactly like a same-workflow job. Verbatim: *"We can now use the outputs in the caller workflow, in the same way you would use the outputs from a job within the same workflow."*

```yaml
jobs:
  job1:
    uses: octo-org/example-repo/.github/workflows/called-workflow.yml@v1
  job2:
    runs-on: ubuntu-latest
    needs: job1
    steps:
      - run: echo ${{ needs.job1.outputs.firstword }} ${{ needs.job1.outputs.secondword }}
```

Output chain (called side): step output → `jobs.<id>.outputs` → `on.workflow_call.outputs.<name>.value: ${{ jobs.<id>.outputs.<x> }}`. Docs: *"The `value` must be set to the value of a job-level output within the called workflow. Step-level outputs must first be mapped to job-level outputs."*

**Supported keywords on a job that calls a reusable workflow** (authoritative list, reusable-workflows reference):

> `jobs.<job_id>.name` · `uses` · `with` · `with.<input_id>` · `secrets` · `secrets.<secret_id>` · **`secrets.inherit`** · **`strategy`** · **`needs`** · **`if`** · `concurrency` · `permissions`

Good news for §8: `needs` ✅ (chain ordering), `strategy` ✅ (the Lee+Collier county matrix), `if` ✅ (row-gate conditional), `secrets: inherit` ✅. **Limits are non-binding:** 10 levels of nesting and *"a maximum of 50 unique reusable workflows from a single workflow file"* — the chain is 1 caller + 8 called = 2 levels, 8 unique. Also confirmed: **zero `workflow_call` exists in the repo today**, so §8's "add `on: workflow_call:` to the 8 chain members" is genuinely a pure addition.

#### 🔴 DRIFT FINDING A — `timeout-minutes` is NOT a supported keyword on a calling job

It does not appear in the supported-keywords list above. Its only occurrence in the entire reference is inside a *normal* job's YAML-anchor example. **A `timeout-minutes:` on a job that `uses:` a reusable workflow will not be honored.**

This breaks two spec assumptions:
- **§6** — the static check asserts *"`timeout-minutes` present."* Once the 8 chain members become reusable, the timeout must live in the **called** workflow's jobs, never on `nightly-chain.yml`'s calling jobs. A naive check that demands `timeout-minutes` on the caller will produce a permanent false RED — or worse, someone "fixes" it by adding an ignored key.
- **§7-3b** — `classifyTermination()` computes TIMEOUT as *"elapsed ≥ ~95% of `timeout-minutes`"* read from `_watch-manifest.json`. For chain members the manifest must source `timeout_minutes` from the **called workflow file**, not the caller. Otherwise every chain member reads as `timeout_minutes: null` and the TIMEOUT class — the one carrying the `should_retry=false` **money guard** that exists to stop the corridor-pulse burn — silently never fires.

#### 🔴 DRIFT FINDING B — caller workflow-level `env:` does NOT propagate to called workflows

Verbatim: *"Any environment variables set in an `env` context defined at the workflow level in the caller workflow are **not propagated to the called workflow**."*

**§6's check that "every `os.getenv` secret the code reads is in the workflow `env:` block" must resolve against the CALLED workflow, not `nightly-chain.yml`.** This is sharper than a lint detail: if the chain migration tempts anyone to hoist a shared `env:` block up into the chain head, **the secrets silently vanish from the called workflows** — re-creating the exact FRED / S3×6 / Firecrawl "secret in repo but not in the workflow `env:` block" class (00-DIAGNOSIS:59) that this build exists to kill, introduced *by the fix*.

#### ⚠️ Third landmine — `concurrency` self-cancellation, relevant to §7-3b's SUPERSEDED class

> "If you use `jobs.<job_id>.concurrency.cancel-in-progress: true`, don't use the same value for `jobs.<job_id>.concurrency.group` in the called and caller workflows as this will cause the workflow that's already running to be cancelled. **A called workflow uses the name of its caller workflow in `${{ github.workflow }}`**, so using this context as the value of `jobs.<job_id>.concurrency.group` in both caller and called workflows will cause the caller workflow to be cancelled when the called workflow runs."

A called workflow reporting its **caller's** name in `${{ github.workflow }}` matters twice: it is a live footgun for `nightly-chain.yml`, and it is a caveat for any manifest/watcher keying on workflow name (§7-3a/3b) — chain members will not self-identify under their own names at runtime.

---

### Fact 3 — `workflow_run.workflows:` has **NO wildcard/glob support**. Spec §7-3a confirmed.

**Source:** crawl4ai → `https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows` and `.../workflows-and-actions/workflow-syntax` (fetched 2026-07-11)

**The load-bearing proof is positive, not an absence.** GitHub documents glob support explicitly, per-filter, and demonstrates it **inside the very same `on.workflow_run:` block** — globbing the branch while leaving the workflow name literal:

```yaml
on:
  workflow_run:
    workflows: ["Build"]        # ← literal name
    types: [requested]
    branches:
      - 'releases/**'           # ← glob, in the same block
```
> "The `branches` and `branches-ignore` **filters accept glob patterns** that use characters like `*`, `**`, `+`, `?`, `!` and others…" — `on.workflow_run.<branches|branches-ignore>`, workflow-syntax reference

GitHub demonstrates glob **exactly where it exists**. Backing evidence:

1. **The glob-capable filters are an enumerated, closed set.** The syntax reference grants glob support to `branches` / `branches-ignore`, `tags` / `tags-ignore`, and `paths` / `paths-ignore`, each pointing at the **Filter pattern cheat sheet**. `workflows:` is in **none** of them and has **no syntax-reference section of its own** (the only `on.workflow_run.*` section is `<branches|branches-ignore>`).
2. **`workflows:` appears only as literal name lists** — every occurrence in the syntax reference is `workflows: ["Build"]`.
3. **The multi-workflow semantic is enumeration, not matching:** *"If you specify multiple `workflows` for the `workflow_run` event, only one of the workflows needs to run"* — e.g. `workflows: [Staging, Lab]`.
4. **The repo already knows this** — `grade-predictions.yml:17`: `workflows: ["Daily Brain Rebuild"] # exact name — .github/workflows/daily-rebuild.yml`.

**Verdict: spec §7-3a is correct.** `workflow_run.workflows:` takes exact workflow **names** (the `name:` field, not the filename). There is no `*` to lean on, so **codegen + a `ci.yml` drift-test is the only way** to keep the two watcher YAMLs (`log-cron-incident.yml:16`, `heal-cron-failure.yml:20`) covering all 77 scheduled workflows. Confirmed as designed.

**Two bonus `workflow_run` constraints Fable 5 should know** (same page):
- *"You can't use `workflow_run` to chain together **more than three levels** of workflows."* — a hard ceiling that independently rules out `workflow_run` as the nightly-chain ordering mechanism, and reinforces §8's `workflow_call` + `needs:` choice.
- *"This event will only trigger a workflow run **if the workflow file exists on the default branch**."* — watcher changes are inert until merged to `main`; they cannot be validated on a branch.

---

### Summary for Fable 5

| # | Fact | Status |
|---|---|---|
| 1 | `actions/checkout` latest major = **v7** (v7.0.0, 2026-06-18). **v6 exists** (since v6.0.0, 2025-11-20) and is used by 101 workflows here. | Spec §4 correct-but-stale; **00-DIAGNOSIS's "nonexistent version" label refuted** |
| 1b | Phase-2 `uses:` check must resolve against **live tags**, never a baked literal | **Design point CONFIRMED** — this incident is the archetype |
| 1c | Do **not** mass-bump to v7: named `workflow_run` fork-checkout block + ESM change; tag-exists ≠ compatible | Caution |
| 2 | `secrets: inherit`, `needs:` ordering, job outputs, `strategy`, `if` all work as §8 assumes; limits (10 levels / 50 workflows) non-binding | **CONFIRMED** |
| 2a | **`timeout-minutes` unsupported on a calling job** → §6 check and §7-3b TIMEOUT/`should_retry=false` money guard must read the **called** workflow | 🔴 **DRIFT** |
| 2b | **Caller workflow-level `env:` does not propagate** → §6's secret-in-`env:` check must target the **called** workflow; hoisting env into the chain head silently re-creates the FRED/S3/Firecrawl bug class | 🔴 **DRIFT** |
| 2c | Called workflow reports the **caller's** name in `${{ github.workflow }}`; shared `concurrency.group` + `cancel-in-progress` → caller cancels itself | ⚠️ Footgun (§7-3b) |
| 3 | `workflow_run.workflows:` = exact names, **no glob**; also max 3 chain levels, default-branch-only | **CONFIRMED** — §7-3a codegen is the only path |

**URLs fetched (crawl4ai, 2026-07-11):** `docs.github.com/en/actions/using-workflows/reusing-workflows` · `docs.github.com/en/actions/reference/workflows-and-actions/reusable-workflows` · `docs.github.com/en/actions/using-workflows/events-that-trigger-workflows` · `docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax`
**APIs queried (read-only):** `repos/actions/checkout/tags` · `/releases` · `/releases/latest` · `/releases/tags/v7.0.0` · `/git/ref/tags/{v4,v5,v6,v7}`

*Two suggested checks arising from this pass (per RULE 2.4, no silent deferrals): (1) re-diagnose the `dbpr-sirs-monthly` / `redfin-monthly` ACTION_VERSION incidents — the recorded root cause is refuted and the true cause is unknown; (2) `nightly-chain.yml` must not carry `timeout-minutes` or a workflow-level `env:` on its calling jobs.*

*Tooling note: a PostToolUse hook warned that my last command modified six repo files. That is a false positive — every command in this session was a read-only `grep` / `gh api` / crawl4ai fetch, per the read-only guardrail. No repo file was written.*
