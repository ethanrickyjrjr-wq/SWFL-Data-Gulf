// app/api/export/[surface]/route.ts
// Paid CSV download of user-owned tables (spec 2026-08-03-csv-export-paid).
// ONE gated route; which tables/columns exist is lib/export/surfaces.ts —
// adding an export is one registry entry, never a sibling route.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { resolveEffectiveTier } from "@/lib/billing/effective-tier";
import { selectAllPaged, type PagedQuery } from "@/refinery/lib/paginate.mts";
import { EXPORT_SURFACES } from "@/lib/export/surfaces";
import { buildCsv } from "@/lib/export/build-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAID = new Set(["starter", "growth", "pro"]);

export async function GET(_req: Request, { params }: { params: Promise<{ surface: string }> }) {
  const { surface } = await params;
  const def = EXPORT_SURFACES[surface];
  if (!def) return NextResponse.json({ error: "unknown export" }, { status: 404 });

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Tier gate. Service role touches ONLY the billing tables inside
  // resolveEffectiveTier. `degraded: true` (or a thrown lookup) fails OPEN —
  // same contract as sends (lib/email/usage.ts#checkUsageLimit): a billing
  // outage never blocks a paying customer; worst case a free user gets one
  // CSV during an outage.
  let allowed: boolean;
  try {
    const { tier, degraded } = await resolveEffectiveTier(createServiceRoleClient(), user.id);
    allowed = degraded || PAID.has(tier);
  } catch {
    allowed = true;
  }
  if (!allowed) {
    return NextResponse.json(
      { error: "upgrade required", upgrade_url: "/billing" },
      { status: 402 },
    );
  }

  // Data read on the RLS cookie client — the cross-user guard is structural,
  // not a WHERE clause we have to remember. Paged (PostgREST caps a bare
  // select at 1000 rows with NO error); selectAllPaged owns the ordering.
  let rows: Record<string, unknown>[];
  try {
    rows = await selectAllPaged<Record<string, unknown>>(
      () => supabase.from(def.table).select("*") as unknown as PagedQuery<Record<string, unknown>>,
      def.orderCols,
    );
  } catch {
    // NEVER a valid-looking empty file on a failed read.
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(buildCsv(def, rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${def.filenameBase}-${date}.csv"`,
    },
  });
}
