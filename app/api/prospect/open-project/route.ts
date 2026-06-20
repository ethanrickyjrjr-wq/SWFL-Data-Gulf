import { NextResponse, type NextRequest } from "next/server";
import { mintClaimToken, type ClaimBrand } from "@/lib/claim/claim-store";
import { planOpenProject } from "@/lib/prospects/open-project";

export const runtime = "nodejs";

/**
 * POST /api/prospect/open-project — the funnel "Open your project" bridge (Unit 2).
 *
 * A branded /welcome arrival posts its scope + brand here. We gate the ZIP through
 * the 6-county MOAT (planOpenProject → resolveZip), then mint a claim token carrying
 * the brand + a one-click email seed, and hand back `/claim?t=…`. The token is the
 * durable carrier across the OTP login round-trip; on claim the project lands branded
 * and ZIP-seeded. Unauthenticated by design — the prospect has no account yet.
 *
 * No auth.uid exists, so there is NOTHING to leak here: the only inputs are the
 * prospect's own arrival params. An out-of-scope ZIP is refused (422), never seeded
 * with an invented place.
 */

/** Keep only clean string brand fields (the page already validated on arrival; this
 *  is defense-in-depth against a hand-crafted POST). Returns null when nothing maps. */
function sanitizeBrand(raw: unknown): ClaimBrand | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const brand: ClaimBrand = {};
  if (typeof r.primary === "string") brand.primary = r.primary;
  if (typeof r.secondary === "string") brand.secondary = r.secondary;
  if (typeof r.logo_url === "string") brand.logo_url = r.logo_url;
  if (typeof r.company_name === "string") brand.company_name = r.company_name;
  return Object.keys(brand).length ? brand : null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const zip = typeof body?.zip === "string" ? body.zip : "";
  const brand = sanitizeBrand(body?.brand);

  const plan = planOpenProject({ zip, brand });
  if (!plan.inScope) {
    return NextResponse.json({ error: "out_of_scope" }, { status: 422 });
  }

  const token = await mintClaimToken([], plan.title, { brand: plan.brand, seed: plan.seed });
  return NextResponse.json({ url: `/claim?t=${token}` });
}
