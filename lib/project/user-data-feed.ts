// lib/project/user-data-feed.ts
// Server loader + pure formatter for the TYPED user-data lane, the sibling
// of uploads-text.ts (the blob lane). Every block names its ORIGIN — a
// user-stated figure or user-brought listing is quotable ONLY with its
// provenance attached (spec 2026-08-03 §5). Fail-open: any miss → "".
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { ProjectItem } from "@/lib/project/items";

export interface UserListingFeedRow {
  address: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  status: string | null;
  county: string | null;
  updated_at: string;
}

export function formatUserData(items: ProjectItem[], listings: UserListingFeedRow[]): string {
  const parts: string[] = [];
  for (const it of items) {
    if (it.kind !== "user_figure") continue;
    const unit = it.unit ? ` ${it.unit}` : "";
    const asOf = it.as_of ? `, as of ${it.as_of}` : "";
    parts.push(`USER FIGURE (stated by the user${asOf}): ${it.label} = ${it.value}${unit}`);
  }
  for (const l of listings) {
    const fields = [
      l.price != null ? `price ${l.price}` : null,
      l.beds != null ? `${l.beds} beds` : null,
      l.baths != null ? `${l.baths} baths` : null,
      l.sqft != null ? `${l.sqft} sqft` : null,
      l.status ? `status ${l.status}` : null,
      l.county ? `county ${l.county}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    parts.push(
      `USER LISTING (brought by the user, imported ${l.updated_at.slice(0, 10)}): ${l.address}${fields ? ` — ${fields}` : ""}`,
    );
  }
  return parts.join("\n\n");
}

export async function loadUserDataText(projectId: string): Promise<string> {
  if (!projectId) return "";
  try {
    const supabase = createClient(await cookies());
    const { data: proj } = await supabase
      .from("projects")
      .select("items")
      .eq("id", projectId)
      .maybeSingle();
    const items = (proj?.items ?? []) as ProjectItem[];
    const { data: listings } = await supabase
      .from("user_listings")
      .select("address, price, beds, baths, sqft, status, county, updated_at")
      .limit(50);
    return formatUserData(items, (listings ?? []) as UserListingFeedRow[]);
  } catch {
    return "";
  }
}
