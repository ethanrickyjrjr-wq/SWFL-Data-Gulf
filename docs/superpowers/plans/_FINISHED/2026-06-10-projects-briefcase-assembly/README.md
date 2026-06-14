# Projects ("Briefcase") + Assembly Engine — Master Index

> **For agentic workers:** This is a **multi-session plan**, decomposed into 10 independently-shippable sessions. Each session is a folder named `session-N-<name>__<MODEL>/` with its own `README.md` (the session brief) and one file per task. **Pick the session you've been assigned, read its `README.md`, then execute its task files in order**, one at a time. Steps use checkbox (`- [ ]`) syntax. REQUIRED SUB-SKILL when you execute: `superpowers:subagent-driven-development` (fresh subagent per task) or `superpowers:executing-plans`.

**Goal:** A realtor/broker/investor researches on `/r/` pages with the AI highlighter, *files* what they find (answers, charts, metrics, citations, their own photos/PDFs) into ONE **project**, then says what they want ("client email", "PDF one-pager") and the system **assembles a professional, fully-cited deliverable in seconds**. Projects persist and resume. Their own Claude (via our MCP) co-builds the same project.

**The moat:** Every filed item is a **snapshot** with its citation + `freshness_token` pinned at save time. The assembly LLM sees ONLY filed items and writes connective prose — it **structurally cannot invent a number**. CoStar charges $10K+/yr for branded reporting without this provenance.

---

## How this plan was produced

This is the audited, decomposed form of the single-doc plan the operator handed over (2026-06-10). Before decomposing, every "Verified ground truth" claim in the source plan was checked against the live code. The corrections are recorded in **[`AUDIT.md`](./AUDIT.md)** — read it once; the corrections are already baked into the relevant task files (search for the tag `[AUDIT-FIX C#]`). Added features (not in the source plan) are tagged `[ADDED]` and listed in [`AUDIT.md`](./AUDIT.md) §Added.

---

## Sessions, model assignment & dependency graph

Model rule used: **Opus** for novel architecture, first-of-kind security (first RLS, auth gates, storage scoping), and anti-hallucination LLM work — anywhere a mistake is hard to reverse or has a security/correctness blast radius. **Sonnet** for well-specified mechanical work following an existing pattern (SQL, CSS, glue, UI wiring with precedent).

| Session | Model | Days | Depends on | Ships (queue) |
|---|---|---|---|---|
| `session-0-metering-foundations` | **SONNET** | 0.5 | — | prereq of item 1 |
| `session-1-highlighter-thread-briefcase` | **OPUS** | 2.5–3 | S0 | queue item 1 |
| `session-2-charts-tierB-inchat` | **SONNET** | 2 | S0, S1 | queue item 2 |
| `session-3-saved-charts-c-route` | **SONNET** | 1 | S2 | item 3 (part 1) |
| `session-4-projects-rls-authgate` | **OPUS** | 2–2.5 | S1 (draft items), S3 (chart ref) | item 3 (part 2) |
| `session-5-print-css-pdf` | **SONNET** | 1 | S3, S4 | item 3 (part 3) |
| `session-6-assembly-engine` | **OPUS** | 3 | S4 (projects), S3 (chart resolve) | net-new |
| `session-7-delivery-surfaces` | **SONNET** | 1 | S6 | net-new |
| `session-8-uploads` | **OPUS** | 2 | S4 | net-new |
| `session-9-mcp-cobuild` | **OPUS** | 2 | S4, S6 | net-new |

```
S0 ─┬─> S1 ──> S2 ──> S3 ──┬──> S4 ──┬──> S5
    │                      │         ├──> S6 ──> S7
    └──────────────────────┘         ├──> S8
                                      └──> S9 (also needs S6)
```

**Critical path:** S0 → S1 → S2 → S3 → S4 → S6. S5, S7, S8, S9 hang off the path and can be done by separate Claudes once their dependency lands. **Do not start a session until its dependencies have shipped to `main`** — later sessions consume the *real* surfaces earlier ones create, and freezing code against a hypothetical surface is exactly the invented-contract failure this repo guards against (CLAUDE.md RULE 0 / Vendor-First).

---

## Code-fidelity policy (read this — it explains why some task files end with "expand against the live surface")

`writing-plans` demands complete code with no placeholders. That is honored **for every task whose upstream surface exists in `main` today** — Sessions **0, 1, 2** are coded in full. For Sessions 3–9, task files give exact files, interfaces, acceptance criteria, verify commands, and code wherever the surface is already real; where a task's final code depends on the *output* of an earlier unshipped session (e.g. S6's templates depend on S4's `ProjectItem` rows as actually stored), the task file specifies the interface + acceptance and instructs the executing Claude to run `superpowers:writing-plans` to freeze its own code against the live upstream. This is not a placeholder cop-out — it is the repo's own discipline: **don't ship code written against a contract that doesn't exist yet.** When you execute one of those sessions, its dependency will be live, so you'll have the real surface.

---

## Shared contracts (every session reads these)

- **[`shared/data-model.md`](./shared/data-model.md)** — the `ProjectItem` discriminated union (the spine of the whole feature). Lives at `lib/project/items.ts`, zod-validated, unit-tested. Sessions 1, 4, 6, 9 all depend on it byte-for-byte.
- **[`shared/conventions.md`](./shared/conventions.md)** — the per-session ship checklist (SESSION_LOG + safe-push + checks reconcile), the locked v1 decisions, the Vendor-First WebFetch list, and the locked names (`projects`, `/project/[id]`, `saved_charts`, `/c/[id]`, `deliverables`, `/p/[id]`).
- **[`AUDIT.md`](./AUDIT.md)** — audit corrections (`[AUDIT-FIX C#]`) + added features (`[ADDED]`).

## Spec amendments

The source-of-truth spec being extended is `docs/superpowers/specs/2026-06-07-boards-pdf-composed-export-design.md`. Amendments **A1–A8** (rename boards→projects, widen the item union, add the `deliverables` table + `/p/[id]` LLM assembly, meter-everything-enforcement-off, etc.) are committed to that spec by **Session 0** before anything else builds. The full amendment text is in `session-0-metering-foundations/task-01-spec-amendments-and-checks.md`.

## Open checks this plan creates (RULE 2 ledger — prod evidence, not dev attestation)

Opened by the session that needs the runtime signal, closed only on a live signal:
- `cookie_mint_live_verify` (S0) · `projects_rls_live_verify` (S4) · `deliverable_anchor_lint` (S6) · `storage_rls_scope_verify` (S8) · `mcp_project_tools_live_verify` (S9)
