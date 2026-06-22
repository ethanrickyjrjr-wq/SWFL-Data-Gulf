import { inferScopeFromItems } from "@/lib/project/derive-name";
import type { ProjectItem } from "@/lib/project/items";

/**
 * The scope to build an `"email"` deliverable with, derived from the project's own items.
 *
 * An email builds at WHATEVER grain the project holds — the dominant ZIP, else the named
 * place — and NEVER refuses for a missing ZIP. When the items name neither a ZIP nor a
 * place, this returns `null`, which the build path reads as **whole-region** (NULL/NULL
 * scope → a Southwest Florida read), NOT as a refusal. The numbers themselves are the
 * frozen filed items, so the header's grain never invents precision — it only frames.
 * Reuses the one scope root (`inferScopeFromItems`). Pure — no I/O.
 */
export function emailDeliverableScope(
  items: ProjectItem[],
): { scope_kind: "zip" | "place"; scope_value: string } | null {
  const { zip, place } = inferScopeFromItems(items);
  if (zip) return { scope_kind: "zip", scope_value: zip };
  if (place) return { scope_kind: "place", scope_value: place };
  return null; // whole-region — the caller builds a SWFL read, never refuses
}
