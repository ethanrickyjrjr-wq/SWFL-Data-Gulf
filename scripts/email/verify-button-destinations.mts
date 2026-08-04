// scripts/email/verify-button-destinations.mts
//
// LIVE verifier for role-keyed button destinations (08/04/2026).
//
// WHY THIS EXISTS: the feature shipped with 2,765 green unit tests and a prod column,
// and none of that proves the pieces agree with each other in production. Unit tests
// over fixtures prove the FUNCTION; they do not prove the column, the token bridge,
// and the overlay agree. Operator, 08/04/2026: "set destinations in my profile!!!
// do whatever you need to do to test. come on man." He was right — 0 rows were
// populated and I reported that as a fact instead of fixing it.
//
// Writes real destinations onto a real brand row, then drives the REAL read path
// (brandingToTokens -> applyBrand -> auditDocLinks) and prints what each button
// resolved to and whether the popup would still fire.
//
//   bun scripts/email/verify-button-destinations.mts <email>        # write + verify
//   bun scripts/email/verify-button-destinations.mts <email> --read # verify only
//
// Reads Postgres creds from .dlt/secrets.toml (psql is not installed on this box).

import { readFileSync } from "node:fs";
import { brandingToTokens } from "../../lib/email/brand/branding-to-tokens";
import { applyBrand } from "../../lib/email/brand/apply-brand";
import { auditDocLinks } from "../../lib/email/link-audit";
import { destinationTokenKey, BUTTON_ROLE_KEYS } from "../../lib/email/button-destinations";
import type { EmailDoc } from "../../lib/email/doc/types";

const email = process.argv[2];
const readOnly = process.argv.includes("--read");
if (!email) {
  console.error("usage: bun scripts/email/verify-button-destinations.mts <email> [--read]");
  process.exit(1);
}

const secrets = readFileSync(".dlt/secrets.toml", "utf8");
const tomlStr = (key: string) => {
  const m = secrets.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  if (!m) throw new Error(`Could not find ${key} in .dlt/secrets.toml`);
  return m[1];
};
const port = (secrets.match(/^port\s*=\s*(\d+)/m) ?? [, "5432"])[1];
const sql = new Bun.SQL(
  `postgres://${tomlStr("username")}:${encodeURIComponent(tomlStr("password"))}@${tomlStr("host")}:${port}/${tomlStr("database")}?sslmode=require`,
);

const users = await sql`select id from auth.users where email = ${email}`;
if (users.length === 0) throw new Error(`no auth user for ${email}`);
const userId = (users[0] as { id: string }).id;
console.log(`user ${email} -> ${userId}\n`);

// Every URL below was checked live (curl -o /dev/null -w %{http_code} -> 200) BEFORE
// being written — never save a destination we have not proven serves. `listing` is
// deliberately LEFT UNSET: its destination travels with each listing, so it must stay
// an open slot rather than acquire a sticky brand default.
const DESTINATIONS = {
  "primary-cta": "https://www.swfldatagulf.com",
  community: "https://www.swfldatagulf.com/z/33990",
  booking: "https://www.swfldatagulf.com/support",
};

if (!readOnly) {
  await sql`update public.user_brand_profiles
              set button_destinations = ${JSON.stringify(DESTINATIONS)}::jsonb,
                  updated_at = now()
            where user_id = ${userId}`;
  console.log("WROTE:", JSON.stringify(DESTINATIONS, null, 2), "\n");
}

const rows = await sql`select * from public.user_brand_profiles where user_id = ${userId}`;
const profile = rows[0] as Record<string, unknown>;
console.log("READ BACK FROM PROD:", JSON.stringify(profile.button_destinations), "\n");

// ── the REAL read path ───────────────────────────────────────────────────────
const tokens = brandingToTokens(profile as unknown as Record<string, string>);
console.log("BRAND TOKENS (button destinations only):");
for (const role of BUTTON_ROLE_KEYS) {
  const k = destinationTokenKey(role);
  if (tokens[k]) console.log(`  ${k} = ${tokens[k]}`);
}
console.log(`  WEBSITE_URL = ${tokens.WEBSITE_URL ?? "(none)"}\n`);

// The button shapes the real emitters produce, one per role in play.
const doc = {
  globalStyle: {},
  blocks: [
    { id: "cta", type: "button", props: { role: "primary-cta", label: "See what's for sale" } },
    { id: "hood", type: "button", props: { role: "community", label: "Ask about Cape Coral" } },
    { id: "book", type: "button", props: { role: "booking", label: "Book a call" } },
    { id: "listing", type: "button", props: { role: "listing", label: "Take a look" } },
    {
      id: "reply",
      type: "button",
      props: { role: "primary-cta", label: "Reply with REVIEW", url: "mailto:hello@x.com" },
    },
    {
      id: "mine",
      type: "button",
      props: {
        role: "community",
        label: "My own link",
        url: "https://example.com/i-typed-this",
        urlSource: "user",
      },
    },
  ],
} as unknown as EmailDoc;

const branded = applyBrand(doc, tokens);
console.log("AFTER THE REAL BRAND OVERLAY:");
for (const b of branded.blocks) {
  const p = b.props as { label?: string; url?: string; role?: string };
  console.log(`  [${p.role}] "${p.label}" -> ${p.url || "(OPEN SLOT — prompts the agent)"}`);
}

const asks = auditDocLinks(branded);
console.log(
  `\nLINK ASKS (the fill-in popup): ${asks.length === 0 ? "none" : asks.map((a) => `"${a.label}"`).join(", ")}`,
);

await sql.end();
