// scripts/migrate-email-events.mts
//
// SUPERSEDED, KEPT ONLY AS A RE-RUNNABLE MIRROR OF THE SHIPPED MIGRATION.
// `public.email_events` was created by `migrations/20260628_email_events.sql`, then extended
// by `docs/sql/20260709_email_events_{blast_scope,contact_id,variant_column}.sql`. That file
// set is the source of truth. This script exists because two plans cite it as the idempotent
// Bun.SQL migration pattern; if you want the pattern, prefer `scripts/migrate-apify-records.mts`.
//
// TWO THINGS WERE WRONG HERE, both found 09/03/2026 when scripts/ was typechecked for the
// first time:
//
//  1. Every statement called `db.query(...)`, which does not exist on Bun.SQL
//     (bun-types/sql.d.ts has `unsafe`, `close`, `end` and the tagged template — no `query`).
//     The script threw on its first line, so it had NEVER run. DDL now goes through
//     `.unsafe()`, the count through the tagged template.
//
//  2. Fixing (1) made it executable — and its RLS block DIVERGED from prod. It created a
//     policy named `users_read_own_events` guarded by `IF NOT EXISTS (… policyname =
//     'users_read_own_events')`, i.e. guarded on its own name. Live prod carries exactly one
//     policy, `email_events_owner_select` (measured 09/03/2026 against pg_policies), so the
//     guard would have passed and ADDED A SECOND SELECT POLICY with a different predicate.
//     Postgres ORs SELECT policies together, so that would have silently widened read access
//     on email-event data. It also granted SELECT to `authenticated`, which the shipped
//     migration deliberately does not ("no user policy yet (operator-internal data)").
//     Both are removed. What remains is byte-faithful to migrations/20260628_email_events.sql.
//
// Run: bun scripts/migrate-email-events.mts
import { readFileSync } from "fs";
import { parse } from "dotenv";

const secrets = parse(readFileSync(".dlt/secrets.toml", "utf-8"));
const connStr =
  secrets["destination.credentials"] ??
  `postgresql://${secrets["destination__credentials__username"] ?? "postgres"}:${secrets["destination__credentials__password"]}@${secrets["destination__credentials__host"]}/${secrets["destination__credentials__database"]}?sslmode=require`;

const db = new Bun.SQL(connStr);

await db.unsafe(`
  CREATE TABLE IF NOT EXISTS public.email_events (
    id            bigserial PRIMARY KEY,
    resend_email_id text,
    rid           text,
    event         text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT email_events_event_check
      CHECK (event IN ('sent','delivered','opened','clicked','bounced','unsubscribed'))
  );
`);

await db.unsafe(`CREATE INDEX IF NOT EXISTS email_events_rid_idx ON public.email_events (rid);`);
await db.unsafe(
  `CREATE INDEX IF NOT EXISTS email_events_resend_email_id_idx ON public.email_events (resend_email_id);`,
);

// Dedupe guard: a given (resend_email_id, event) pair is immutable once recorded.
await db.unsafe(`
  CREATE UNIQUE INDEX IF NOT EXISTS email_events_dedupe_idx
    ON public.email_events (resend_email_id, event)
    WHERE resend_email_id IS NOT NULL;
`);

// RLS on, service-role only. NO user-facing policy and NO grant to `authenticated` — the
// owner-scoped read is `email_events_owner_select`, which lives in the SQL migrations and is
// not this script's to define. See note 2 in the header before adding anything here.
await db.unsafe(`ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;`);
await db.unsafe(`GRANT INSERT, SELECT ON public.email_events TO service_role;`);
await db.unsafe(`GRANT USAGE ON SEQUENCE public.email_events_id_seq TO service_role;`);
await db.unsafe(`NOTIFY pgrst, 'reload schema';`);

const [{ n }] = await db`SELECT COUNT(*)::int AS n FROM public.email_events`;
console.log("email_events table ready — rows:", n);

await db.close();
