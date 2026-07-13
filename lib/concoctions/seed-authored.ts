// KNOWN-DEBT(data_lake: three of the four dataset defs read data_lake.* views —
// the typed client covers public only, same debt class as lib/charts/gallery-loaders.ts)
// lib/concoctions/seed-authored.ts
//
// Author-path dataset seeding: when the build prompt clearly names a dataset
// and its params are derivable from the build's scope, materialize the dataset
// and APPEND its blocks under the authored layout — figures baked by the
// engine, bindings remembered, prose untouched. Additive and fail-soft: any
// miss (no match, unsatisfiable params, loader error, block-cap overflow)
// returns the doc unchanged — seeding can never fail a build.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import type { EmailDoc } from "@/lib/email/doc/types";
import { getConcoction } from "./registry";
import { materializeLoad, type MaterializeDeps } from "./materialize";
import { insertDatasetBlocks } from "./place-blocks";
import { resolveConcoction, paramsFromScope } from "./author-section";

/** EmailDocSchema's block cap — seeding never pushes a doc over it. */
const MAX_DOC_BLOCKS = 20;

export async function seedResolvedDataset(
  doc: EmailDoc,
  prompt: string,
  scope: { kind?: string | null; value?: string | null } | null | undefined,
  deps?: Partial<MaterializeDeps>,
): Promise<{ doc: EmailDoc; seededLabel: string | null }> {
  const id = resolveConcoction(null, prompt);
  if (!id) return { doc, seededLabel: null };
  const params = paramsFromScope(id, scope);
  if (params === null) return { doc, seededLabel: null };
  const def = getConcoction(id);
  if (!def) return { doc, seededLabel: null };
  try {
    const sb = deps?.sb ?? createServiceRoleClientUntyped();
    const { blocks } = await materializeLoad(def, params, { sb, hostPng: deps?.hostPng });
    // The authored doc already carries its own sources accordion — don't stack a second.
    const loaded = doc.blocks.some((b) => b.type === "sources")
      ? blocks.filter((b) => b.type !== "sources")
      : blocks;
    if (loaded.length === 0 || doc.blocks.length + loaded.length > MAX_DOC_BLOCKS) {
      return { doc, seededLabel: null };
    }
    // Above the footer — same rule as the lab (insertDatasetBlocks is the one
    // authority; a blind append put seeded data under the unsubscribe line).
    return {
      doc: { ...doc, blocks: insertDatasetBlocks(doc.blocks, loaded) },
      seededLabel: def.label,
    };
  } catch {
    return { doc, seededLabel: null };
  }
}
