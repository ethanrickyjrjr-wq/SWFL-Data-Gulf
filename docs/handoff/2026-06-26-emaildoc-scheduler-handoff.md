# HANDOFF — EmailDoc → Scheduler (the missing send wire, N6)

> For a fresh Opus session to run in parallel. Goal: a built `EmailDoc` (Email Lab) can be **scheduled and sent**, re-rendered with fresh data each occurrence. Today it cannot — that's the heartbreak in code.
> RULES: probe code first (RULE 0.5); prove every wire by running it, not "it compiles"; do NOT re-fork — reuse the roots below. Never push without operator confirmation.

## The goal
User builds an email in the Lab → persists it → schedules it (send now + same time the next N days, or recurring) → each scheduled occurrence **re-runs the build** so it carries fresh data + fresh AI commentary + a fresh chart → sends via Resend.

## Current state (proven this session — verify before trusting)
- **Build root (use this, don't re-fork):** `lib/email/build-doc.ts` `buildContentDoc({ prompt, rawDoc, scope, mode })` → returns the patched, chart-injected `EmailDoc`. This is the ONE pipeline (route is a thin wrapper). It pulls the lake context, picks a chart via the shared `buildChartForQuestion` root, and fills content. Re-running it = fresh data + commentary + chart. That's your "self-update on schedule."
- **EmailDoc → HTML:** `lib/email/blocks/EmailDocRenderer.tsx` `EmailDocEmail({ doc })` via `@react-email/render`, exposed at `app/api/email-lab/render/route.ts`.
- **EmailDoc → PDF:** `lib/pdf` `renderEmailDocToBuffer(doc, opts)` via `app/api/deliverables/[id]/pdf/route.ts`.
- **Persistence hint:** `app/api/deliverables/[id]/pdf/route.ts` GET reads `deliverables.doc` (a saved `EmailDoc`) and `deliverables.data_as_of`. So a `deliverables` row already holds an `EmailDoc`. **VERIFY:** what writes `deliverables.doc` (the Email Lab save path), and the `deliverables` table schema (columns: doc, branding, project_id, status, data_as_of, …).
- **THE MISSING WIRE:** `scripts/email/run-schedules.mts` has ZERO reference to `EmailDoc` — it only renders/sends grounded-report TEMPLATES (`renderGroundedReport`). So a Lab-built `EmailDoc` is never scheduled or sent. Also see `lib/email/recurring-report.ts` (template-based recurring).
- **Send pattern:** transactional sends inline `new Resend(process.env.RESEND_API_KEY).emails.send({ from, to, subject, html })` (e.g. `scripts/email/build-digest.mts`, `send-test.mts`). There is NO shared transactional helper — extract a tiny `lib/email/transactional-send.ts` or inline. Blast route requires auth (401); do NOT route scheduled sends through it.

## The wire (plan — adjust to what you find)
1. **Persist** the built `EmailDoc` as a `deliverables` row (reuse the existing save path that already feeds `deliverables.doc`). Carry `scope`, `mode`, `branding`, `data_as_of`.
2. **Schedule** — a row per send schedule: `{ run_id, deliverable_id, recipient(s), occurrences[], cadence }`. Either extend the existing scheduler tables or add a new one (NEEDS A MIGRATION — `Bun.SQL`, idempotent; creds in `.dlt/secrets.toml`; see `docs/standards` + the `reference_run-migrations-via-bun-sql` memory). Idempotency: a `(run_id, occurrence)` unique key so a re-run can't double-send.
3. **Run** — teach the schedule runner to handle an `EmailDoc` deliverable: re-run `buildContentDoc` with the saved `{ prompt, doc-skeleton, scope, mode }` to regenerate fresh content/chart for THIS occurrence → render with `EmailDocEmail` → send via Resend transactional (and/or attach the `renderEmailDocToBuffer` PDF). Keep the template path intact alongside.
4. **Future occurrences** — Resend `scheduledAt` (camelCase, ISO-8601, ≤30 days) for "+24h/+48h" sends, OR a GHA cron that fires the runner daily. **VENDOR-VERIFY** `scheduledAt` live (crawl4ai → resend.com/docs) before relying on it — a wrong field name silently sends immediately.

## Proof gate (the anti-fake-done)
- Build in Email Lab → schedule → assert a persisted schedule row exists → run the runner → assert it rendered THAT `EmailDoc` to HTML and sent (or dry-ran) → show the rendered HTML.
- Self-update: run two occurrences against two data snapshots → the rendered HTML differs (numbers + commentary + chart changed).
- Send to two operator inboxes only until verified; gate live send behind an explicit env flag.

## Key files
`lib/email/build-doc.ts` · `lib/email/blocks/EmailDocRenderer.tsx` · `lib/pdf/` · `app/api/email-lab/render/route.ts` · `app/api/deliverables/[id]/pdf/route.ts` (persistence hint) · `scripts/email/run-schedules.mts` (extend) · `lib/email/recurring-report.ts` · `lib/email/scheduler.ts` · the Resend transactional pattern in `scripts/email/build-digest.mts`.

## Landmines
- Don't re-fork the build — call `buildContentDoc`.
- Idempotency table needs its migration in the same PR or re-runs double-send.
- `scheduledAt` is unused in the repo today — it's a NEW vendor surface; verify it.
- Env var name: `NEXT_PUBLIC_SITE_URL` (blast route reads this), not `NEXT_PUBLIC_URL`.
- CAN-SPAM: visible unsubscribe + a real physical address in every scheduled send.
