# HANDOFF — Outreach Engine Increment 2: live send + our-own tracking + click-to-stop

**Paste this to a fresh Claude session in `brain-platform` (work on `main`).**

Read `CLAUDE.md` first (RULE 0 session log, RULE 0.5 probe-first, RULE 1 push gate — this
increment touches **live `/api` + new DB tables**, so it is **diff-review-before-push**, RULE 3.5
brainstorm). **Verify every file:line below against the real code before trusting it** — accurate as
of `main` @ `41e34be`, but probe, don't assume.

---

## The mission

Make the cold-outreach drip **actually send**, on the model the operator confirmed:

> **"Do we send through Resend, but we track? Resend doesn't track so we have to, right? We need
> internal numbers on what is working."**

Exactly right. **Resend is the delivery pipe; WE own the data and the logic:**

1. Send each recipient their per-recipient branded drip email **through Resend**.
2. Every recipient has a **row in our DB** (an id). Email links carry that id.
3. **Resend webhooks** (delivered / opened / clicked / bounced) ping us → we write them to **our**
   tables → **our internal numbers** (sent/delivered/opened/clicked/unsub per campaign + per recipient).
4. **Click → stop:** the first click from a recipient flips them to "engaged" and the drip stops
   sending to them (they've entered the funnel — hand off to the existing claim/activation flow).
5. **CAN-SPAM:** a working, per-recipient unsubscribe link that we honor.

## What Increment 1 already gives you (the reusable spine — all on `main`)

- **`lib/email/outreach/targets.ts`** — `parseTargetsCsv` (email,name,domain,zip; dedupe; shape-validate).
- **`lib/email/outreach/drip-email.ts`** — `renderDripEmail(input)` → branded ONE-chart + explainer
  HTML + subject. Unsub footer injected post-render by `ensureUnsubscribeToken`.
- **`lib/email/outreach/campaign.ts`** — `composeCampaign(targets, deps)`: per-recipient brand scrape
  → confidence gate (<0.5 → SWFL house brand) → `buildArrivalUrl` click-back → render. Never throws
  per recipient. Returns `ComposedMessage[]` + a summary. **This is the compose layer; Increment 2
  adds the SEND + TRACK layers around it.**
- **`scripts/email/outreach-campaign.mts`** — the CLI. DRY_RUN today; `refuseLiveSend()` lists exactly
  the three prerequisites this increment resolves. Live send wires in here (or a new `send` lib it calls).

## What to build, and WHERE

### 1. DB — two (maybe three) tables. Files: `docs/sql/20260620_outreach_*.sql`
Apply directly via psycopg with `.dlt/secrets.toml` creds (CLAUDE.md RULE 1 SQL policy); idempotent
(`CREATE TABLE IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`). Verify row counts after.

- **`outreach_recipients`** — one row per (campaign, email). Suggested cols: `id uuid pk`,
  `campaign_id text`, `email text`, `name text`, `domain text`, `zip text`, `brand jsonb`
  (the scraped brand + `brand_source`/`confidence`), `arrival_url text`, `status text`
  (`active`/`engaged`/`unsubscribed`/`bounced`), `step int default 0`, `next_send_at timestamptz`,
  `created_at`. UNIQUE `(campaign_id, email)`. **This is the unsubscribe id AND the suppression state
  AND the drip cursor — one table.**
- **`outreach_events`** — append-only analytics. `id bigserial`, `recipient_id uuid fk`,
  `event text` (`sent`/`delivered`/`opened`/`clicked`/`bounced`/`unsubscribed`), `at timestamptz`,
  `meta jsonb`. Index `(recipient_id, event)` + `(campaign_id, event, at)` for the numbers.
- *(Optional)* **`outreach_campaigns`** — `id`, `label`, `created_at`, `csv_sha` — so a re-run is
  idempotent and the /ops board can list campaigns. Skip if the CLI passes a `--campaign` label that
  just namespaces `outreach_recipients`.

> Don't reuse `contacts`/`email_contacts` (CLAUDE.md note: two unmerged tables already — don't add a
> third by overloading them; outreach prospects are a distinct, suppressible cold cohort).

### 2. Live send. File: `scripts/email/outreach-campaign.mts` (replace `refuseLiveSend`) + new `lib/email/outreach/send.ts`
- Model the batch send on **`app/api/deliverables/[id]/blast/route.ts:130-175`** (verified): `getMarketingResend()`
  (`lib/email/marketing-client.ts`) → `resend.batch.send(messages)` in **chunks of 100**, each message
  carrying `headers: { "List-Unsubscribe": "<…>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }`.
- **Per-recipient unsubscribe URL** = `${ORIGIN}/api/unsubscribe?rid=<recipient.id>` (see step 3).
  Replace the `{{{RESEND_UNSUBSCRIBE_URL}}}` token in the rendered HTML with this real URL before send
  (Increment 1 leaves the token in place via `ensureUnsubscribeToken`).
- **Enable Resend open/click tracking** on the send so the webhook fires (Resend dashboard / send opts).
- On send: upsert `outreach_recipients`, write a `sent` event, set `step`/`next_send_at`.
- Keep DRY_RUN the default; live send only on `DRY_RUN=false` (it now WORKS instead of refusing).

### 3. Unsubscribe for cold recipients. File: extend `app/api/unsubscribe/route.ts`
- Today it keys on `?id=<contact_id>` → flips `contacts.unsubscribed=true` (verified, `route.ts:9-13`).
- Add an `?rid=<recipient_id>` branch → flip `outreach_recipients.status='unsubscribed'` + write an
  `unsubscribed` event. Stateless, service-role, GET+POST (mail clients one-click). Keep it dependency-light.

### 4. Resend webhook → our events + click-to-stop. File: extend `app/api/webhooks/resend/route.ts`
- Today: POST, verifies the **Svix signature**, handles only inbound **`email.received`** (verified,
  `route.ts:5,40` + `InboundDeps`/`InboundEvent`). KEEP that path.
- Add handling for outbound events: **`email.delivered` / `email.opened` / `email.clicked` /
  `email.bounced`**. Map the Resend message back to a `recipient_id` (set a custom `headers`/tag with
  the rid at send time, or look up by `to` + campaign). Write an `outreach_events` row for each.
- **On `email.clicked`** (and `email.bounced`): flip `outreach_recipients.status` to `engaged`
  (resp. `bounced`) so the drip runner skips them next cycle. This IS the "click → stop."
- Reuse the existing Svix verification — do not add a second verifier.

### 5. The recurring drip (cadence). File: `scripts/email/outreach-drip-run.mts` + GHA wrapper
- The simplest correct shape: a daily runner that selects `outreach_recipients WHERE status='active'
  AND next_send_at <= now()`, re-runs `composeCampaign` for them (fresh data each send → the chart
  updates), sends, advances `step`/`next_send_at`. Model the cron+`--dry-run` pattern on
  `scripts/project-feed/change-detection.mts` + its GHA; register in `ingest/cadence_registry.yaml`
  (probe-EXCLUDED — event-driven). **Don't** rebuild a scheduler: `lib/email/scheduler.ts`
  (`computeNextRunAt`, `ensureUnsubscribeToken`) already exists; reuse it.
- Alternative (heavier): generalize `lib/email/activation/sequence.ts` (2-step → N-step). Only if the
  simple runner proves insufficient. RULE 3 C2: extend the existing seam, don't erect a new one.

### 6. Internal numbers. File: a SQL view `docs/sql/20260620_outreach_metrics_view.sql` (+ optional /ops panel)
- A `outreach_campaign_metrics` view: per campaign, counts of sent/delivered/opened/clicked/unsub +
  rates. That's the "what is working" dashboard substrate. The standalone **`swfldatagulf-ops`** repo
  renders /ops — surface it there later, not in this repo.

## Constraints / gotchas (each has bitten before)

- **RULE 1: diff-review before push.** New `/api` behavior (webhook + unsubscribe) + new tables → show
  the operator the diff; do not auto-ship the live send.
- **Per-recipient brand re-render is the core technical gap** (handoff-outreach-engine.md): the blast
  route renders the body ONCE and only swaps the footer. The drip MUST render per recipient — Increment
  1's `composeCampaign` already does; keep that (don't fall back to a single-body batch).
- **CAN-SPAM:** every send needs the working unsub link + a physical address line. Honor unsubscribes
  before the next send (the runner's `WHERE status='active'` does this).
- **Confidence gate:** `enrichBrand` confidence `<0.5` → SWFL house brand, never a guessed color
  (already in `campaign.ts`).
- **Secrets:** `RESEND_AUDIENCES_KEY` (full-access, already used by `marketing-client.ts`), the Svix
  webhook signing secret (already wired for `email.received` — reuse), and `SITE_ORIGIN`. A secret
  isn't live until it's in every workflow `env:` block (RULE 1 gate 3).
- **Idempotency:** webhook deliveries retry — make `outreach_events` writes idempotent (dedupe on
  Resend's `email_id`+event) so opens aren't double-counted.

## Suggested build order

1. Migrations (tables) — apply + verify.
2. Live send in the CLI (upsert recipients + `sent` events + real unsub URL) — test against 1–2 of
   your own addresses with `DRY_RUN=false`.
3. Unsubscribe `?rid=` branch.
4. Webhook outbound events + click→`engaged` flip.
5. The daily drip runner + GHA (dry-run first).
6. The metrics view.

## State as of handoff (`main` @ `41e34be`)

- **Increment 1 shipped** (`591a4a9`): compose + DRY-RUN CLI + tests (`lib/email/outreach/*`, 16/0).
- **Rich `/r/zip-report`** (`d218232`→`b59c7f8`): metro trend chart in; **choropleth map pulled**
  (33931 welds to mainland) — tracked OPEN in build-queue, re-add after the corrected contractor SVG.
- Nothing of Increment 2 is built yet — greenfield on the spine above.
