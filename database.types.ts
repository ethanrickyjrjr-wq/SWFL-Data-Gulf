// database.types.ts — app-facing Database type. Overrides jsonb columns with concrete types
// so reads of items/doc/narrative are not the opaque `Json` union, and corrects two
// generator defects (see below). Pattern: Supabase docs (MergeDeep).
//
// GENERATOR DEFECTS corrected here (both live in `database-generated.types.ts`, produced by
// `scripts/gen-supabase-types.ts`; see task-34-report.md):
//   1. IDENTITY `id` columns are emitted as REQUIRED in `Insert` because the generator only
//      marks a column optional when it has a `column_default` (line 48) — but a
//      `GENERATED ALWAYS AS IDENTITY` column has a NULL `column_default` in information_schema.
//      Postgres AUTO-generates (and REJECTS explicit values for) these ids, so the app code
//      correctly omits them; we re-mark them optional. Verified against the live DB:
//      buyer_intent_events / data_requests / project_feed / usage_events / welcome_chat_usage
//      are all `is_identity=YES, identity_generation=ALWAYS`.
//   2. (Reported, NOT fixed here) `Functions: Record<string, never>` is hardcoded (line 59) —
//      the generator never introspects functions, so EVERY `.rpc(...)` fails to type. Callers
//      route to the untyped service-role hatch with KNOWN-DEBT. The functions DO exist.
import type { MergeDeep } from "type-fest";
import type { Database as DatabaseGenerated } from "./database-generated.types";
import type { ProjectItem } from "@/lib/project/items";
import type { EmailDoc } from "@/lib/email/doc/types";
import type { FrozenPost } from "@/lib/social/types";
export type { Json } from "./database-generated.types";

export type Database = MergeDeep<
  DatabaseGenerated,
  {
    public: {
      Tables: {
        projects: {
          Row: { items: ProjectItem[] };
          Insert: { items?: ProjectItem[] };
          Update: { items?: ProjectItem[] };
        };
        // deliverables.doc is the EmailDoc block-canvas document (lib/email/doc/types).
        // Concrete so reads (email-lab, blast) are typed and the EmailDoc-interface write
        // in ai-material conforms (the interface lacks an implicit index signature, so the
        // raw `Json` union rejected it).
        deliverables: {
          Row: { doc: EmailDoc | null };
          Insert: { doc?: EmailDoc | null };
          Update: { doc?: EmailDoc | null };
        };
        // social_schedules.frozen_post is the freeze-on-confirm artifact (lib/social/types
        // FrozenPost). Same rationale as deliverables.doc: the FrozenPost interface has no
        // implicit index signature, so the raw `Json` union rejects the INSERT written by
        // app/api/social/schedule. Concrete here so the lab schedule write typechecks.
        social_schedules: {
          Row: { frozen_post: FrozenPost | null };
          Insert: { frozen_post?: FrozenPost | null };
          Update: { frozen_post?: FrozenPost | null };
        };
        // IDENTITY-id Insert fix (defect #1 above): re-mark the auto-generated id optional.
        buyer_intent_events: { Insert: { id?: number } };
        data_requests: { Insert: { id?: number } };
        project_feed: { Insert: { id?: number } };
        usage_events: { Insert: { id?: number } };
        welcome_chat_usage: { Insert: { id?: number } };
      };
    };
  }
>;
