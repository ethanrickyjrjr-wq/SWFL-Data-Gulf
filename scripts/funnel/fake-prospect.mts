/**
 * scripts/funnel/fake-prospect.mts — seed a FAKE branded prospect for funnel + branding testing.
 *
 * Solo test fixture (operator: "no one else is using this crap"). Idempotent + safe to re-run.
 *
 * WHAT IT DOES
 *   1. Creates (or reuses) a fake, already-confirmed auth user — FAKE_EMAIL.
 *   2. Seeds that user's `user_brand_profiles` row with a DISTINCT, obviously-fake brand
 *      (electric violet + amber + a placeholder logo + a fake agent identity), so when you
 *      see it on a project you KNOW it came from the profile, not your real brand.
 *   3. Mints a direct admin login link so you can click straight in — no email wait,
 *      no OTP typing. (You click it yourself, so the email-prefetch-expiry bug that
 *      killed magic links in the inbox does not apply.)
 *   4. Prints a fake BRANDED ARRIVAL url so you can also run the full email-funnel path
 *      (arrival → "Open your project" → claim) end to end.
 *
 * RUN (env names match utils/supabase/service-role.ts):
 *   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… bun run scripts/funnel/fake-prospect.mts
 *   # optional overrides:  SITE_URL (default prod)  FAKE_EMAIL  FAKE_ZIP
 *
 * TWO TEST MODES once it has run:
 *   A) "Just show me a branded fake account" — click the LOGIN LINK → /project → open/create
 *      a project → it lands in the fake violet/amber brand (applyUserBrandToProject reads the
 *      seeded profile). Easiest.
 *   B) "Test the full funnel incl. profile auto-create" — open the ARRIVAL URL in a CLEAN
 *      (logged-out / incognito) window → branded arrival → "Open your project" → log in with a
 *      BRAND-NEW email → the claim creates the project AND auto-creates that new user's brand
 *      profile from the carried colors (persistClaimBrandToProfile). Use a fresh email so there
 *      is no existing profile to test the create path.
 */

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

// ── config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.BRAINS_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.BRAINS_SUPABASE_SERVICE_KEY;
const SITE_URL = (process.env.SITE_URL ?? "https://www.swfldatagulf.com").replace(/\/$/, "");
const FAKE_EMAIL = process.env.FAKE_EMAIL ?? "funnel-demo@swfldatagulf.com";
const FAKE_ZIP = process.env.FAKE_ZIP ?? "33931"; // Fort Myers Beach — in the 6-county MOAT

// Vivid + obviously-fake so it can never be confused with the operator's real brand.
const FAKE_BRAND = {
  primary: "#7C3AED", // electric violet
  secondary: "#F59E0B", // amber
  logo_url: "https://placehold.co/240x80/7C3AED/FFFFFF/png?text=MIRAGE+REALTY",
  company_name: "Mirage Realty Group",
  agent_name: "Dakota Testfield",
  brokerage: "Mirage Realty Group (TEST)",
  license: "SL-FAKE-0001",
} as const;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "\n  Missing creds. Set SUPABASE_URL + SUPABASE_SERVICE_KEY (or legacy BRAINS_SUPABASE_*).\n",
  );
  process.exit(1);
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── helpers ───────────────────────────────────────────────────────────────--
/** Create the fake user, or find+reuse it if it already exists (idempotent). */
async function findOrCreateUser(email: string): Promise<User> {
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true, // mark confirmed → no confirmation email, login works immediately
    user_metadata: { fake: true, purpose: "funnel-branding-test" },
  });
  if (created.data?.user) return created.data.user;

  // Already registered (or any create error) → page through and find by email.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break; // last page
  }
  throw new Error(`Could not create or find user ${email}: ${created.error?.message ?? "unknown"}`);
}

/** Build the funnel arrival URL (inlined from lib/prospects/build-arrival-url.ts to keep this
 *  script import-free of the app graph). Honors the welcome page's validators. */
function buildArrivalUrl(): string {
  const p = new URLSearchParams();
  p.set("name", FAKE_BRAND.company_name);
  p.set("primary", FAKE_BRAND.primary);
  p.set("secondary", FAKE_BRAND.secondary);
  p.set("logo", FAKE_BRAND.logo_url);
  p.set("zip", FAKE_ZIP);
  return `${SITE_URL}/welcome?${p.toString()}`;
}

// ── run ───────────────────────────────────────────────────────────────────--
async function main() {
  // 1. fake user
  const user = await findOrCreateUser(FAKE_EMAIL);

  // 2. seed the DISTINCT fake brand onto the account profile (upsert, onConflict user_id —
  //    same shape PATCH /api/user/brand writes).
  const { error: profErr } = await admin.from("user_brand_profiles").upsert(
    {
      user_id: user.id,
      primary_color: FAKE_BRAND.primary,
      accent_color: FAKE_BRAND.secondary,
      logo_url: FAKE_BRAND.logo_url,
      agent_name: FAKE_BRAND.agent_name,
      brokerage: FAKE_BRAND.brokerage,
      license: FAKE_BRAND.license,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (profErr) throw new Error(`seed user_brand_profiles: ${profErr.message}`);

  // 3. direct login link (no email, no OTP typing)
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: FAKE_EMAIL,
    options: { redirectTo: `${SITE_URL}/auth/callback?next=/project` },
  });
  const props = link.data?.properties;

  // 4. arrival URL for the full-funnel path
  const arrivalUrl = buildArrivalUrl();

  // ── report ──
  const line = "─".repeat(72);
  console.log(`\n${line}\n  FAKE BRANDED PROSPECT — ready\n${line}`);
  console.log(`  user id      : ${user.id}`);
  console.log(`  email        : ${FAKE_EMAIL}`);
  console.log(
    `  brand        : ${FAKE_BRAND.primary} / ${FAKE_BRAND.secondary}  ·  ${FAKE_BRAND.company_name}`,
  );
  console.log(`  logo         : ${FAKE_BRAND.logo_url}`);
  console.log(`  profile      : seeded on user_brand_profiles (carries to every new project)`);

  console.log(`\n  ── MODE A: just log in as the branded fake account (easiest) ──`);
  if (link.error) {
    console.log(`  ! login-link mint failed: ${link.error.message}`);
    console.log(
      `    Fallback: go to ${SITE_URL}/login, enter ${FAKE_EMAIL}, use the emailed code.`,
    );
  } else if (props?.action_link) {
    console.log(`  CLICK THIS to drop straight into /project (logged in):`);
    console.log(`    ${props.action_link}`);
    if (props.email_otp) {
      console.log(`  (or go to ${SITE_URL}/login, enter ${FAKE_EMAIL}, code: ${props.email_otp})`);
    }
  } else {
    // Defensive: print whatever the API returned so you can see the link shape.
    console.log(`  generateLink returned (inspect for the clickable link):`);
    console.log(`    ${JSON.stringify(props, null, 2)}`);
  }

  console.log(`\n  ── MODE B: run the WHOLE funnel (arrival → claim → auto-create profile) ──`);
  console.log(`  Open in a CLEAN/incognito window (logged OUT), then log in with a NEW email:`);
  console.log(`    ${arrivalUrl}`);
  console.log(`\n${line}\n`);
}

main().catch((e) => {
  console.error("\n  fake-prospect failed:", e instanceof Error ? e.message : e, "\n");
  process.exit(1);
});
