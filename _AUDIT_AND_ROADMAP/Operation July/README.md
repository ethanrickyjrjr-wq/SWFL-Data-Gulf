# Operation July

Task breakdown of the 2026-07-04 autopsy & handoff
(`_AUDIT_AND_ROADMAP/2026-07-04-CLAUDE-AUTOPSY-AND-HANDOFF.md`), split into one file per
build/action with an owner and a live-proof done criterion.

## How this folder works

- **One file = one build/action.** Each file names its owner, source section, existing check
  key (if any), the steps, and a **done-when that is a live assertion** (not "code merged" —
  the entire autopsy is about `built ≠ works`).
- **A file leaves the folder when finished.** Flip its `Status` to ✅ and
  `git mv "Operation July/<file>.md" "Operation-July-DONE/"`. This folder should always show
  only what's still open.
- **The `checks` ledger stays source of truth.** Per CLAUDE.md RULE 2 and §10 of the autopsy,
  open obligations live in `public.checks` (`node scripts/check.mjs list`) — NOT in ⬜/✅
  markers in docs. These files are the human-readable brief + the leaves-the-folder mechanic;
  where a task already has a check key, the file references it rather than replacing it. Close
  the check in the same action that moves the file out.

## Owner legend

| Owner | Meaning |
|---|---|
| **OPERATOR** | Ricky at the keyboard — prod config, secrets, plan upgrades, live sends, the `git push` confirmation. Not delegable. |
| **SESSION** | Any Claude session — bounded code edits, deletes, relocations, CI wiring. |
| **`<agent>`** | Larger build best handed to a named subagent (deliverable-builder, ingest-engineer, etc.). Brainstorm/plan first per RULE 3.5. |

## The critical path

The launch goal — *recipe → edit → schedule → **SEND*** — was blocked ONLY on the send terminus.
That work (**`01-turn-on-send.md`**) is ✅ **taken care of by the operator** (2026-07-04) and has moved
to `../Operation-July-DONE/`. Next-most-load-bearing open items: the PowerShell push-gate hole (`02`)
and pushing the §6 local fixes (`03`).

## Index

### Launch spine
- [x] `01-turn-on-send.md` — OPERATOR — ✅ DONE, moved to `../Operation-July-DONE/`

### Guards & pushing the local fixes
- [ ] `02-fix-powershell-pushgate-bypass.md` — SESSION — close the PowerShell push-gate hole
- [ ] `03-push-session-local-fixes.md` — OPERATOR — review + push the §6 working-tree fixes

### Prod config (independent of send)
- [ ] `04-set-mcp-bearer-token.md` — OPERATOR — paywall keystone
- [ ] `05-social-go-live.md` — OPERATOR — OAuth creds + crypto key + cron
- [ ] `06-set-pexels-api-key.md` — OPERATOR — media picker
- [ ] `07-upgrade-resend-plan.md` — OPERATOR — off the 1-email/day free tier
- [ ] `08-publish-firewall-ratelimit.md` — OPERATOR — rate-limit `/api/b/*` + `/api/mcp`

### Backlog closure
- [ ] `09-close-done-not-marked-checks.md` — OPERATOR/SESSION — the ~34 built-but-never-run checks

### Cleanup (delete / relocate)
- [ ] `10-delete-dead-code.md` — SESSION — 6 zero-importer modules
- [ ] `11-delete-dead-docs-plans-specs.md` — SESSION — orphan plans/specs
- [ ] `12-delete-phantom-spec-close-check.md` — SESSION — the 9-line phantom (A3)
- [ ] `13-relocate-root-clutter.md` — SESSION — git mv + fix code-comment paths
- [ ] `14-reconcile-goal9-sql.md` — OPERATOR/SESSION — apply or correct the log

### Decision needed
- [ ] `15-decide-daily-email-digest-fate.md` — OPERATOR — the one live cron that sends to itself (A5)

### Product improvements (long run — plan before build)
- [ ] `16-uncloseable-check-live-proof.md` — needs plan — make checks require prod proof (P1)
- [ ] `17-collapse-5-send-engines.md` — deliverable-builder — one scheduler spine (P2)
- [ ] `18-content-freshness-guards.md` — ingest-engineer — MAX(content_date) on 11 pipelines (P3)
- [ ] `19-anthropic-credit-alert.md` — SESSION — credit-balance alarm (P4)
- [ ] `20-wire-knip-deadcode-ci.md` — SESSION — catch orphan modules at PR time (P5)
- [ ] `21-unify-contact-stores.md` — needs plan — public.contacts vs email_contacts (P6)
- [ ] `22-flywheel-calibration-parked.md` — PARKED until 08/30/2026 — don't ship accuracy claim (P7)

_Derived from the autopsy on 2026-07-04. Each task is the autopsy's claim; probe-verify against
live code/DB before executing (the autopsy itself warns several agent claims were overstated)._
