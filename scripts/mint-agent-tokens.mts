// scripts/mint-agent-tokens.mts -- Task 6, hermes-email-driver spec (2026-08-10).
//
// Mints the 3 bearer tokens Hermes (operator's box) needs to drive the email
// pipe: agent_feed_read, agent_test_inject (both OPERATOR-owned -- reading
// the feed and injecting a rehearsal event are operator actions), and
// agent_build (DEMO-account-owned -- Task 5's route.ts scopes
// `findProjectId` to the calling token's OWNER, so a build token minted
// under the operator's own account could never resolve a project it
// doesn't own; see route.ts's header comment "TOKEN-OWNER CONSEQUENCE FOR
// TASK 6").
//
// Uses the SAME .dlt/secrets.toml Bun.SQL connection pattern as
// scripts/run-migration.ts (psql is not installed on this box) -- a direct
// Postgres connection, not the Supabase client, so it can read auth.users
// (no email->user_id lookup RPC/table exists anywhere in this repo; every
// other consumer that needs one -- lib/agent-feed/test-inject-source.ts,
// app/api/webhooks/resend/route.ts -- pages through
// supabase.auth.admin.listUsers() instead, but that requires an
// authenticated Supabase client this bare script doesn't construct; a
// direct `select id from auth.users where lower(email) = ...` against the
// same Postgres database is the equivalent read over the connection this
// script already has open, not a second lookup mechanism).
//
// Hashing MUST match lib/api-tokens/token.ts exactly (sha256 hex of the raw
// token) -- imported directly, not reimplemented, so a hashing-algorithm
// drift between this script and the route's verifier is structurally
// impossible.
//
// OPERATOR RESOLUTION (documented choice): OPERATOR_EMAIL env var if set,
// else the earliest-created auth.users row whose email is NOT the demo
// account email -- mirrors "the account that was here before the demo
// account was seeded". Verified against live data before writing this:
// ethanrickyjrjr@gmail.com (created 2026-05-20) is earliest; the demo
// account (allstatecoop@gmail.com) was created 2026-06-10, three weeks
// later; two more @gmail.com/@icloud.com rows are later still.
//
// Prints the 3 RAW tokens to stdout EXACTLY ONCE. Never logs them anywhere
// else, never writes them to a file itself -- the caller redirects stdout
// to a gitignored path (`.superpowers/` is gitignored in its entirety).
import { readFileSync } from "fs";
import { mintToken, hashToken } from "../lib/api-tokens/token";

const DEMO_EMAIL = process.env.DEMO_ACCOUNT_EMAIL ?? "allstatecoop@gmail.com";
const OPERATOR_EMAIL_OVERRIDE = process.env.OPERATOR_EMAIL ?? null;

const secrets = readFileSync(".dlt/secrets.toml", "utf8");
function tomlStr(key: string): string {
  const m = secrets.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  if (!m) throw new Error(`Could not find ${key} in .dlt/secrets.toml`);
  return m[1];
}
const host = tomlStr("host");
const password = tomlStr("password");
const username = tomlStr("username");
const database = tomlStr("database");
const portMatch = secrets.match(/^port\s*=\s*(\d+)/m);
const port = portMatch ? portMatch[1] : "5432";

const connStr = `postgres://${username}:${encodeURIComponent(password)}@${host}:${port}/${database}?sslmode=require`;
const sql = new Bun.SQL(connStr);

async function resolveUserByEmail(email: string): Promise<string> {
  const rows = await sql`select id from auth.users where lower(email) = lower(${email}) limit 1`;
  const row = rows[0] as { id: string } | undefined;
  if (!row) throw new Error(`No auth.users row for email ${email}`);
  return row.id;
}

async function resolveOperatorId(): Promise<{ id: string; email: string }> {
  if (OPERATOR_EMAIL_OVERRIDE) {
    return {
      id: await resolveUserByEmail(OPERATOR_EMAIL_OVERRIDE),
      email: OPERATOR_EMAIL_OVERRIDE,
    };
  }
  const rows = await sql`
    select id, email from auth.users
    where lower(email) != lower(${DEMO_EMAIL})
    order by created_at asc
    limit 1
  `;
  const row = rows[0] as { id: string; email: string } | undefined;
  if (!row) throw new Error("No non-demo auth.users row found for operator resolution");
  return { id: row.id, email: row.email };
}

async function mintAndInsert(userId: string, scope: string, label: string): Promise<string> {
  const raw = mintToken();
  const hash = hashToken(raw);
  await sql`
    insert into public.user_api_tokens (user_id, token_hash, label, scope)
    values (${userId}, ${hash}, ${label}, ${scope})
  `;
  return raw;
}

const demoUserId = await resolveUserByEmail(DEMO_EMAIL);
const operator = await resolveOperatorId();

const feedToken = await mintAndInsert(operator.id, "agent_feed_read", "hermes-feed-read");
const testInjectToken = await mintAndInsert(operator.id, "agent_test_inject", "hermes-test-inject");
const buildToken = await mintAndInsert(demoUserId, "agent_build", "hermes-build");

await sql.end();

console.log("# Minted 2026-08-10 -- Task 6, hermes-email-driver.");
console.log(`# Operator: ${operator.email} (${operator.id})`);
console.log(`# Demo:     ${DEMO_EMAIL} (${demoUserId})`);
console.log("# Raw tokens shown ONCE below -- store them, they are never shown again.");
console.log("");
console.log(`SWFL_FEED_TOKEN=${feedToken}`);
console.log(`SWFL_TEST_INJECT_TOKEN=${testInjectToken}`);
console.log(`SWFL_BUILD_TOKEN=${buildToken}`);
