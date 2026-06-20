// scripts/email/enroll-prospect.mts
//
// The funnel ENTRY POINT (FINAL BOSS 05, Unit 4) — enroll one prospect into the
// "It's Alive" activation sequence and print their branded ARRIVAL URL. This closes
// the gap that `enrollProspect` had zero production callers.
//
// SAFE BY DEFAULT — DRY_RUN unless DRY_RUN=false. In DRY_RUN it enriches the brand,
// assembles + renders email #1 (proving the whole path), and PRINTS the branded
// arrival URL — it never sends and never inserts. The arrival URL is the testable
// artifact: open it in a browser to exercise the new arrival → claim → ZIP-seeded,
// branded project takeover WITHOUT needing live email.
//
// LIVE SEND IS PHASE D, NOT WIRED (same gate as run-activation.mts): the 1:1 send
// mechanism + CAN-SPAM address + secrets must be chosen/verified first. A DRY_RUN=false
// invocation refuses — but still prints the arrival URL so the click-test works now.
//
// Usage:
//   bun scripts/email/enroll-prospect.mts --email you@x.com --zip 33931 --domain acme.com
//   optional: --name "Acme" --primary "#0a7" --secondary "#012" --logo https://… --cadence daily-trial
//   env: SITE_ORIGIN (default https://www.swfldatagulf.com), DRY_RUN (default true)

import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { enrichBrand, type BrandEnrichment } from "@/lib/prospects/enrich-brand";
import { buildArrivalUrl } from "@/lib/prospects/build-arrival-url";
import {
  enrollProspect,
  type ActivationDeps,
  type SendResult,
} from "@/lib/email/activation/sequence";
import type { ActivationBrand } from "@/lib/email/activation/types";

const DRY_RUN = process.env.DRY_RUN !== "false"; // default true — must opt OUT to send
const SITE_ORIGIN = process.env.SITE_ORIGIN ?? "https://www.swfldatagulf.com";

/** Parse `--key value` and `--key=value` from argv. Flags with no value → "". */
function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}`) return argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "";
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}

const FALLBACK_BRAND: BrandEnrichment = {
  primary: null,
  secondary: null,
  logo_url: null,
  confidence: 0,
  source: "fallback",
  company_name: null,
};

function liveSendNotWired(): Promise<SendResult> {
  throw new Error(
    "Live activation send is not wired (Phase D) — choose + verify the 1:1 send mechanism, " +
      "swap the CAN-SPAM address, and set the secrets first. The arrival URL above is click-testable now.",
  );
}

async function main(): Promise<void> {
  const email = arg("email");
  const zip = arg("zip");
  const domain = arg("domain");
  const cadence = arg("cadence") === "daily-trial" ? "daily-trial" : "delta";

  if (!email || !zip || !/^\d{5}$/.test(zip)) {
    console.error(
      "usage: --email <addr> --zip <5-digit> [--domain <d>] [--name --primary --secondary --logo --cadence]",
    );
    process.exit(1);
  }

  // Brand: enrich from the domain (best-effort, never throws), then apply flag overrides.
  const enriched = domain ? await enrichBrand(domain) : FALLBACK_BRAND;
  const brand: BrandEnrichment = {
    ...enriched,
    primary: arg("primary") || enriched.primary,
    secondary: arg("secondary") || enriched.secondary,
    logo_url: arg("logo") || enriched.logo_url,
    company_name: arg("name") || enriched.company_name,
  };
  const name = arg("name") || brand.company_name || undefined;

  // The testable artifact: the branded arrival URL the email CTA points to.
  const arrivalUrl = buildArrivalUrl({ name, brand, zip, base: SITE_ORIGIN });
  console.log("\n========================================================================");
  console.log(`ARRIVAL URL (open to test the funnel):\n  ${arrivalUrl}`);
  console.log(`  brand source=${brand.source} primary=${brand.primary ?? "-"} cadence=${cadence}`);
  console.log("========================================================================\n");

  const activationBrand: ActivationBrand = {
    primary: brand.primary,
    accent: brand.secondary,
    logoUrl: brand.logo_url,
    companyName: brand.company_name ?? null,
  };

  if (!DRY_RUN) {
    console.error(
      "[enroll] live send refused — Phase D not wired (see header). Arrival URL above is click-testable.",
    );
    process.exit(1);
  }

  const deps: ActivationDeps = {
    dryRun: true,
    send: liveSendNotWired,
    insertEnrollment: async () => {
      throw new Error("insertEnrollment must not be called in DRY_RUN");
    },
    completeStep: async () => {
      throw new Error("completeStep must not be called in DRY_RUN");
    },
    ctaUrl: arrivalUrl, // the email #1 CTA lands on the branded arrival, not /pricing
    cadence,
    now: new Date(),
    log: (line) => console.log(line),
  };
  // service-role client is constructed lazily by the real assembler when needed; the
  // import keeps the live-send path one flag away once Phase D lands.
  void createServiceRoleClient;

  const outcome = await enrollProspect({ email, scope: { zip }, brand: activationBrand }, deps);
  console.log(`[enroll] DRY_RUN outcome: ${JSON.stringify(outcome)}`);
  if (outcome.kind === "parked") {
    console.log(`[enroll] ${zip} is out of the 6-county footprint — nothing enrolled.`);
  }
}

main().catch((err) => {
  console.error(`[enroll] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
