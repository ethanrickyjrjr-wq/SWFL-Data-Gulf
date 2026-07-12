// KNOWN-DEBT(data_lake: three of the four dataset defs read data_lake.* views —
// the typed client covers public only, same debt class as lib/charts/gallery-loaders.ts)
// app/api/concoctions/route.ts
//
// Datasets API for the grid lab + author engine. Thin shell over the pure
// dispatcher (lib/concoctions/api-actions.ts). Unauthed like its email-lab
// siblings — builds are free, send is the paywall; UI visibility is gated by
// the `datasets` capability (paid-only, lib/email/lab/capabilities.ts).
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { listDatasets, runConcoctionAction } from "@/lib/concoctions/api-actions";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(listDatasets());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sb = createServiceRoleClientUntyped();
  const result = await runConcoctionAction(body, { sb });
  if (result && "error" in result && typeof result.status === "number") {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
