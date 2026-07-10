/**
 * Baked narrative contract — ONE root for every report surface (spec
 * 2026-07-09-zip-page-destination-design.md §One root). Surfaces differ only
 * in how BakeInputs are assembled; sections, validation, prompt, storage, and
 * rendering are shared.
 */

export interface OutlookItem {
  /** The speculation itself — must carry the literal "[INFERENCE]" tag and hedged language. */
  text: string;
  /** The audited base value the speculation stands on — restates an input figure verbatim. */
  base: string;
  /** One concrete observation that would prove the speculation wrong. */
  falsifier: string;
}

export interface NarrativeSectionsData {
  /** "What's going on here" — plain-language read of the surface's signals. */
  narration: string;
  /** "Down the road" — 1–3 hedged [INFERENCE] items. */
  outlook: OutlookItem[];
}

export interface SourceRef {
  label: string;
  url: string;
}

export interface NarrativeRow {
  surface: string;
  surface_key: string;
  sections: NarrativeSectionsData;
  inputs_hash: string;
  sources: SourceRef[];
  model: string;
  baked_at: string;
}

/** One already-held figure handed to the writer. Never invented — every fact
 *  arrives with the source it was published under. */
export interface BakeFact {
  label: string;
  display: string;
  sub?: string | null;
  why?: string | null;
  source: string;
}

export interface BakeInputs {
  /** Report surface this bake belongs to — mirrors public.narratives.surface
   *  ("zip" | "corridor" | "brain" | …); adapters, not this type, own the set. */
  surface: string;
  key: string;
  place: string | null;
  county: string | null;
  /** MM/DD/YYYY — stated once in the narration. */
  asOf: string | null;
  facts: BakeFact[];
  /** Cited context prose (dossier lines) — background only. */
  context: string[];
  sources: SourceRef[];
}
