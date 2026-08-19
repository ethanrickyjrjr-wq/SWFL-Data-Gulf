# cal.diy — can it be the "easy scheduling widget" for agents? (evaluated 08/19/2026)

Source: https://github.com/calcom/cal.diy (README fetched via crawl4ai from
https://raw.githubusercontent.com/calcom/cal.diy/main/README.md, 08/19/2026)
Operator question: "Can we use this for projects page or making schedules? Should at least be
an easy widget people can use somehow if they don't have one already."

## What cal.diy actually is

- The **community fork of the full Cal.com platform**, MIT-licensed, with all
  enterprise/commercial code removed (Teams, Organizations, Insights, Workflows, SSO/SAML gone).
- It is **not a widget or embeddable component** — it's the whole monorepo (16,485 commits,
  Next.js + tRPC + Prisma + PostgreSQL + Daily.co), self-hosted only, no hosted version.
- The README's own warning, verbatim: "It is strictly recommended for personal, non-production
  use." And: "For any commercial and enterprise-ready scheduling infrastructure, use Cal.com,
  not Cal.diy."

## Verdict: DO NOT self-host cal.diy — it's the highway (RULE 0.9)

Hosting it for our users means running a second full production app (its own Postgres, auth,
upgrades of a 16k-commit monorepo) and custodianship of agents' Google/Outlook calendar OAuth
tokens — against the vendor's explicit non-production warning, on the fork with multi-tenant
(Teams/Orgs) support stripped out. Scheduling infra is plumbing, not ours.

## What our surfaces already hold (probed 08/19/2026)

- `lib/project/schedule-calendar.ts` + `schedule-chips` — the projects-hub calendar card is
  **send schedules** (email/social cadences via `computeNextRunAt`), a different concept from
  meeting booking. cal.diy adds nothing there.
- `user_brand_profiles` (38 columns, registry `lib/brand/profile-ledger.ts`, carried onto
  projects by `lib/project/apply-brand.ts`) holds `website_url` + contact fields but **no
  booking-link field** — grep for booking/calendly/cal.com over lib/brand, lib/email/social,
  components/, app/project returned zero hits.

## The cheap path that delivers the operator's actual ask

1. Add ONE registry field to the brand profile: `booking_url` — the agent pastes their existing
   Calendly / Cal.com / whatever link. Render it as a "Book time with me" button on the
   projects page and in email footers/CTAs. Registry-driven, so it flows to projects like every
   other carry field.
2. Agents WITHOUT a link: point them at a free hosted cal.com individual account (free tier
   covers individuals) — we never host anything. If we later want the booking flow inline on a
   page, Cal.com ships an official embed snippet (@calcom/embed-react / vanilla) that works
   against their hosted links; that's the "widget," not cal.diy.

Status: assessment only — nothing built. If greenlit, this goes through
superpowers:brainstorming + `node scripts/new-build.mjs booking-url-brand-field`.
