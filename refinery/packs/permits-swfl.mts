import type { PackDefinition } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import { permitsSource } from "../sources/permits-source.mts";
import { makeBrainInputSource } from "../sources/brain-input-source.mts";

/**
 * permits-swfl pack — scaffolded by refinery/scaffold.mts.
 *
 * TODO list to ship this brain:
 *   1. Implement permitsSource.fetch() in refinery/sources/permits-source.mts
 *   2. Set the correct trust_tier on the source connector
 *   3. Tune fitScore (deterministic pack-fit) for this brain's signal
 *   4. Add an optional corpusSummary if you have deterministic aggregates
 *   5. Replace the placeholder preferences / activeProject / prompts
 *   6. Run `npm run refinery permits-swfl --dry-run` to validate
 *   7. Run `npm run refinery permits-swfl` to render brains/permits-swfl.md
 */
export const permitsSwfl: PackDefinition = {
  id: "permits-swfl",
  brain_id: "permits-swfl",
  domain: "real-estate",
  scope:
    "TODO: one-line scope statement — what this brain COVERS, never who it serves.",
  ttl_seconds: 604800, // 7 days — adjust to your data's refresh cadence
  sources: [permitsSource, makeBrainInputSource("storm-history-swfl")],
  input_brains: [{ id: "storm-history-swfl", edge_type: "input" }],
  fitScore: (_fragment: RawFragment): number => 5, // TODO: deterministic pack-fit
  preferences: [
    "TODO: third-person line about how the user reads this brain's data.",
  ],
  activeProject: "permits-swfl: TODO one-line active-project description.",
  prompts: {
    triageContext:
      "TODO: pack-specific Haiku triage context — what makes a fragment decision-relevant for this brain.",
    synthesisContext:
      "TODO: pack-specific Sonnet synthesis context — what facts to produce, in what voice, with what guardrails.",
  },
};
