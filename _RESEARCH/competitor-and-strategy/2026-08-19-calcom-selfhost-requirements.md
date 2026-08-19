# Cal.diy / Cal.com self-hosting — the honest bill of materials

**Filed for LATER.** Not building now. Operator wants us positioned to "offer self host when
ready." This is the go/no-go research pass, not a build plan.

**Fetched 08/19/2026 via crawl4ai.** Sources crawled this session:

- `https://raw.githubusercontent.com/calcom/cal.diy/main/README.md` (deployment + integrations sections)
- `https://raw.githubusercontent.com/calcom/cal.diy/main/.env.example`
- `https://raw.githubusercontent.com/calcom/cal.diy/main/LICENSE`
- `https://raw.githubusercontent.com/calcom/cal.diy/main/docker-compose.yml`
- `https://raw.githubusercontent.com/calcom/cal.com/main/LICENSE` (redirects — see finding 6)
- `https://api.github.com/repos/calcom/cal.diy` (repo metadata, live activity, latest release)
- `https://api.github.com/repos/calcom/cal.diy/contents/packages` and
  `.../contents/packages/features` (directory listing, to verify the "EE removed" claim against
  actual code, not just the README's own marketing copy)
- `https://api.github.com/repos/calcom/docker` (the Render-deploy fallback repo's activity status)
- `https://hub.docker.com/r/calcom/cal.diy` (Docker Hub listing)
- `https://cal.com/docs` and `https://cal.com/docs/llms.txt` (official docs index — to check
  whether cal.com's own docs site still covers self-hosting)

---

## 1. Minimum stack

- **Node.js** ≥ 18.x
- **PostgreSQL** ≥ 13.x
- **Yarn** (recommended package manager; monorepo uses Yarn workspaces)
- **Docker + Docker Compose** if going the container route (both bundled in Docker Desktop /
  Rancher Desktop)
- No official CPU/RAM sizing guidance found anywhere in the README, `.env.example`, or
  `docker-compose.yml`. The only memory signal is a **build-time** Node heap flag,
  `MAX_OLD_SPACE_SIZE` (default `4096` MB), required because the Next.js build itself is
  memory-hungry; the dev docs separately recommend `NODE_OPTIONS="--max-old-space-size=16384"` for
  local dev machines. Treat 4–16 GB of build-time RAM headroom as the working assumption — this is
  an INFERENCE from the build flags, not a stated requirement. UNVERIFIED: production runtime
  RAM/CPU floor.
- `docker-compose.yml` topology: `database` (plain `postgres` image, no pinned version tag —
  UNVERIFIED which major version it resolves to at pull time), `redis` (for the separate API v2
  service), `calcom` (the web app), `calcom-api` (a **separate** API v2 service — its own
  Dockerfile at `apps/api/v2/Dockerfile`, its own env block referencing `CALCOM_LICENSE_KEY`,
  Stripe price IDs, `IS_TEAM_BILLING_ENABLED` — see finding 7), and an optional `studio` service
  (Prisma Studio, explicitly flagged in the compose file comment as unsafe to leave running in
  production).

## 2. Docker path

- Official image path per the compose file: **`calcom.docker.scarf.sh/calcom/cal.diy`** — pulled
  through Scarf's gateway, not directly off Docker Hub, despite the README's Docker Hub badge and
  link (`https://hub.docker.com/r/calcom/cal.diy`). Scarf is a download-analytics proxy; the image
  itself resolves through it.
- **Docker Hub listing itself currently shows zero pushed tags** ("This repository doesn't have an
  overview" / "No tags have been pushed to this repository yet"), fetched live 08/19/2026 — the
  Docker Pulls badge and the direct `docker pull calcom/cal.diy:v5.6.19-arm` example in the README
  don't reconcile with what the Hub page shows. Flag this as a build-time verification step, not an
  assumption: confirm the actual pull path resolves before committing to it.
- Required env vars, run-time (from the README's own table + `.env.example`):
  - `DATABASE_URL` (required)
  - `NEXTAUTH_SECRET` (required — cookie encryption, `openssl rand -base64 32`)
  - `CALENDSO_ENCRYPTION_KEY` (required — AES256, `openssl rand -base64 24`)
  - `NEXT_PUBLIC_WEBAPP_URL` (optional, defaults `http://localhost:3000`)
  - `NEXTAUTH_URL` (optional, defaults to `{NEXT_PUBLIC_WEBAPP_URL}/api/auth`)
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (required once web push is touched —
    otherwise a hard runtime error, `Error: No key set vapidDetails.publicKey`; generated via
    `npx web-push generate-vapid-keys`)
  - `CRON_API_KEY` (present with a literal placeholder value in `.env.example` — must be rotated)
  - Build-time-only vars (baked into the static bundle, require a rebuild to change):
    `DATABASE_URL`, `MAX_OLD_SPACE_SIZE`, `NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY`,
    `NEXT_PUBLIC_WEBAPP_URL`, `NEXT_PUBLIC_WEBSITE_TERMS_URL`,
    `NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL`, `CALCOM_TELEMETRY_DISABLED`
- Vercel deploy path exists but the README states **a paid Vercel Pro plan is required** — the
  free tier's serverless-function count ceiling blocks it.
- Render's one-click deploy button points at `https://github.com/calcom/docker`, which is
  **archived** (`archived: true`, last push 2025-10-29, per GitHub API) and is explicitly labeled
  in its own description as community-maintained, unsupported by Cal.com Inc., "use at your own
  risk." That deploy path is a dead end as shipped.
- Railway and Northflank buttons point at maintained third-party blog posts, not Cal.com-owned
  infra — same "vendor doesn't own the deploy path" caveat applies, just not stale.

## 3. Calendar integrations — Google OAuth burden

Straight from the README's own walkthrough (`Obtaining the Google API Credentials`):

1. Enable the Google Calendar API in Google Cloud Console.
2. Configure an OAuth consent screen, choosing **Internal or External** app type.
3. Add the `calendar.events` and `calendar.readonly` scopes.
4. Add test users, generate an OAuth Client ID (Web application type), set redirect URIs to
   `<URL>/api/integrations/googlecalendar/callback` and `<URL>/api/auth/callback/google`.
5. The README's own security note: **"When self-hosting please ensure you configure the Google
   integration as an Internal app so no one else can login to your instance."**

The catch for a multi-agent offering (not stated in the README — flagged here as our own read,
UNVERIFIED against current Google Cloud policy, needs a live Google Workspace docs check before
we commit to this in a pitch): **"Internal" app type in Google Cloud requires a Google Workspace
organization** — it is not selectable for an OAuth consent screen tied to a personal Gmail
account. If each independent agent brings their own personal Google Calendar (not Workspace),
the instance owner cannot lock the app to "Internal," which pushes toward "External" — meaning
Google's app-verification review (scope justification, homepage, privacy policy, possibly a
security assessment for sensitive scopes) becomes load-bearing, not optional. `calendar.readonly`
and `calendar.events` are both listed by Google as sensitive-but-not-restricted scopes as of
Google's general OAuth policy, so verification is a real gate, not a rubber stamp — but the exact
current review requirements need a direct Google Cloud Console policy pull before this goes in
front of Ricky as fact, not just the README's secondhand framing. Microsoft Graph (Office 365 /
Outlook), Zoom, Daily.co, Basecamp, HubSpot, Zoho (CRM/Calendar/Bigin), and Pipedrive integrations
all follow the same per-integration OAuth-app pattern — each is its own credential pair, its own
redirect URI, obtained by hand per the README's step lists.

## 4. Email / SMTP requirements

From `.env.example`'s "E-MAIL SETTINGS" block:

- Cal.diy sends mail via **nodemailer**, configured through generic SMTP env vars:
  `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`,
  `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD`.
- Default dev config points at a local Mailhog container (`localhost:1025`) — not usable in
  production.
- Two SMTP configs the maintainers state are **verified working**: Office 365
  (`smtp.office365.com:587`, app password if 2FA is on) and Gmail
  (`smtp.gmail.com:465`, app password required).
- A commented-out `RESEND_API_KEY` line exists — Resend is a supported alternative but disabled by
  default. `SENDGRID_API_KEY` / `SENDGRID_EMAIL` are also present, described as used for
  "email reminders in workflows and internal sync services" — note the word **workflows**, a
  feature this fork does not ship (see finding 7); UNVERIFIED whether the SendGrid path is dead
  code in cal.diy or still wired to something live.

## 5. Upgrade / migration story

Straight from the README's "Upgrading from earlier versions" section:

1. `git pull`
2. `yarn` (pick up dependency changes)
3. `yarn workspace @calcom/prisma db-deploy` in production (`db-migrate` in dev — the README
   notes `db-migrate` "can clear your development database in some cases," i.e. it is NOT the
   production-safe command; `db-deploy` (Prisma's `migrate deploy`) is)
4. `yarn predev` to surface `.env` variable changes
5. `yarn build && yarn start`

Docker path is simpler on paper: `docker compose down` → `docker compose pull` → update env vars
as needed → `docker compose up -d`. No stated rollback story, no stated migration-failure
recovery path, no canary/staged-rollout guidance — this is a stop-the-world upgrade with a manual
Prisma migration step baked in. Self-managed backups (Postgres dump before every upgrade) are on
us to build in, not provided.

## 6. License position — verbatim, and the bigger finding

- `calcom/cal.diy/LICENSE` = **MIT**, copyright "Cal.com, Inc.," 2020-present.
- The README states directly: *"Cal.diy is fully open source, licensed under the MIT License...
  Unlike Cal.com's 'Open Core' model, Cal.diy has no commercial/enterprise code. The entire
  codebase is available under the same open-source license."*
- **Bigger finding, confirmed via the GitHub API, not just the README's own claim:**
  `https://api.github.com/repos/calcom/cal.com` and `https://api.github.com/repos/calcom/cal.diy`
  resolve to the **same repository** (`id: 350360184`, `full_name: "calcom/cal.diy"`). The org's
  historically-named `calcom/cal.com` repo has been **renamed** to `calcom/cal.diy` — this is not
  an independent community fork living beside the original; it IS the original open-source repo,
  rebranded. Fetching `raw.githubusercontent.com/calcom/cal.com/main/LICENSE` returns the same MIT
  text at the same path, consistent with a rename+redirect rather than two separate license
  regimes.
- Read together with cal.com's own docs site (`cal.com/docs`) now covering **only API v2 for the
  hosted commercial product** — no self-hosting section survives in the 369-line docs index
  (`cal.com/docs/llms.txt`) fetched live this session — the picture is: Cal.com Inc. split its
  brand into (a) **Cal.com**, the hosted/commercial product, sales-gated (`cal.com/sales` for
  "on-prem enterprise access"), whose docs site now only documents the API, and (b) **Cal.diy**,
  the fully-MIT, no-EE-split, self-host-only community edition, whose entire operational
  documentation now lives in ONE place — the GitHub README. If we build a self-host offering, the
  README (checked for freshness against `pushed_at`) is the only authoritative deploy doc; there
  is no separate self-hosting doc site to cross-check against.
- Repo health, confirmed live: 47,801 stars, 1,428 open issues, last push 2026-08-08, latest
  tagged release `v6.2.0` — actively maintained, not abandoned.

## 7. What the enterprise-stripped fork lacks — verified against the actual directory tree, not just the README's claim

The README claims: *"No enterprise features — Teams, Organizations, Insights, Workflows,
SSO/SAML, and other EE-only features have been removed."* Checked directly:

- `packages/` top level has **no `ee` directory** (contents fetched live: `app-store-cli`,
  `app-store`, `config`, `coss-ui`, `dayjs`, `debugging`, `emails`, `embeds`, `features`, `i18n`,
  `kysely`, `lib`, `platform`, `prisma`, `sms`, `testing`, `trpc`, `tsconfig`, `types`, `ui` — no
  `ee`).
- `packages/features/` (the folder where SAML lived in the parent project, per a still-present
  `.env.example` comment pointing at `packages/features/ee#setting-up-saml-login` — that path
  **404s** live) has **no `ee`, `teams`, `organizations`, `insights`, or `workflows`
  subdirectory** in the 60+ feature folders listed. This is a directory-level confirmation, not
  just marketing copy — the removal claim holds up.
- **What this means for "many independent agents on one instance":** Teams/Organizations was the
  layer that provided round-robin/collective-availability booking pages, org-level admin
  separation, shared branding per team, and org-scoped SSO. None of that exists in cal.diy. A
  multi-agent offering on ONE cal.diy instance means **N flat user accounts with no grouping,
  routing, or permission boundary between them** — every agent is a peer-level user, there's no
  "org owner manages N agent sub-accounts" primitive. The only way to get org-like separation
  today is **one cal.diy instance per agent** (or per brokerage, accepting zero isolation between
  agents on the same instance) — which changes the self-host pitch from "one shared install" to
  "N installs, N sets of secrets, N upgrade cycles," a materially bigger ops bill than "self-host"
  sounds like at first read.
- The `calcom-api` (API v2) service in `docker-compose.yml` still references `CALCOM_LICENSE_KEY`,
  `IS_TEAM_BILLING_ENABLED`, and several Stripe team/org price-ID env vars even though the web app
  itself has no Teams code — UNVERIFIED whether this is dead scaffolding left over from the
  parent project's compose file or an active dependency; worth a direct read of
  `apps/api/v2/Dockerfile` and its startup path before promising API v2 works cleanly in cal.diy.
  Flag, don't assume either way.
- Insights (usage analytics/reporting) is also absent from `packages/features`; the still-present
  `cal.com/docs` API v2 insights endpoints (`get-average-booking-duration`, `get-booking-kpi-stats`,
  etc.) belong to the **hosted** Cal.com product's API, not confirmed reachable against a
  self-hosted cal.diy instance — UNVERIFIED, don't assume API parity between the hosted API docs
  and what a self-hosted `calcom-api` container actually serves.

---

## Open questions before this becomes a real offering

1. Docker Hub tag mismatch (finding 2) needs a live pull test, not a README read, before any
   deploy script depends on it.
2. Google OAuth "Internal vs External" app-type policy for non-Workspace agents (finding 3) needs
   a direct Google Cloud OAuth consent-screen policy pull — this doc's framing is our own
   inference from the README's warning, not confirmed against current Google policy.
3. `apps/api/v2` license-key/Stripe scaffolding (finding 7) needs a source read to know if it's
   live code path or dead weight in the MIT fork.
4. No official CPU/RAM sizing exists anywhere in the vendor docs (finding 1) — any capacity
   planning for a self-host tier has to come from our own load testing, not a vendor number.
5. Per-agent vs. shared-instance topology (finding 7) is the real strategic fork in the road: the
   "one shared instance" pitch doesn't hold up against how cal.diy actually models users. This
   changes unit economics for a self-host tier and should be surfaced to Ricky before any pricing
   gets attached to "self-host."
