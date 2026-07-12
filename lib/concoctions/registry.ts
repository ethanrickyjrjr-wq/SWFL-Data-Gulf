// lib/concoctions/registry.ts — the curated set. Adding a definition = one
// import + one array entry; the index below is what the picker and the AI see.
import type { ConcoctionDef } from "./types";
import { corridorProfiles } from "./defs/corridor-profiles";
import { zipListingActivity } from "./defs/zip-listing-activity";
import { nfipStormYears } from "./defs/nfip-storm-years";
import { askingPriceTrend } from "./defs/asking-price-trend";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CONCOCTIONS: ConcoctionDef<any>[] = [
  corridorProfiles,
  zipListingActivity,
  nfipStormYears,
  askingPriceTrend,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getConcoction(id: string): ConcoctionDef<any> | undefined {
  return CONCOCTIONS.find((d) => d.id === id);
}

export interface DatasetParamMeta {
  key: string;
  required: boolean;
  /** Enum values when the param is a closed choice — the picker renders a select. */
  options?: string[];
}

/** Introspect a zod object shape into picker metadata. Defensive: anything the
 *  walk doesn't recognize degrades to a required free-text param (never throws).
 *  registry.test.ts pins the real defs' output, so a zod upgrade that moves
 *  these internals turns RED here instead of silently breaking the picker. */
function paramMetaOf(params: unknown): DatasetParamMeta[] {
  const shape = (params as { shape?: Record<string, unknown> }).shape ?? {};
  return Object.entries(shape).map(([key, schema]) => {
    type Def = {
      type?: string;
      typeName?: string;
      innerType?: unknown;
      values?: unknown;
      entries?: unknown;
    };
    let required = true;
    let node = schema as { _def?: Def };
    const defType = (d?: Def) => d?.type ?? d?.typeName; // zod v4 `type` / v3 `typeName`
    if (defType(node._def) === "optional" || defType(node._def) === "ZodOptional") {
      required = false;
      node = node._def!.innerType as typeof node;
    }
    let options: string[] | undefined;
    if (defType(node._def) === "enum" || defType(node._def) === "ZodEnum") {
      const raw = node._def?.entries ?? node._def?.values; // v4 entries (record) / v3 values (array)
      const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object"
          ? Object.values(raw)
          : [];
      const strings = list.filter((v): v is string => typeof v === "string");
      if (strings.length) options = strings;
    }
    return { key, required, ...(options ? { options } : {}) };
  });
}

/** Picker/AI-facing index — product copy only, no loaders, no digits
 *  (registry.test.ts pins digit-free descriptions so a figure can never
 *  smuggle through the authoring context). */
export function concoctionIndex() {
  return CONCOCTIONS.map((d) => ({
    id: d.id,
    label: d.label,
    description: d.description,
    category: d.category,
    tags: d.tags,
    paramKeys: Object.keys((d.params as unknown as { shape?: object }).shape ?? {}),
    params: paramMetaOf(d.params),
  }));
}
