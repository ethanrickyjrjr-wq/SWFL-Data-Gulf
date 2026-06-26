// database.types.ts — app-facing Database type. Overrides jsonb columns with concrete types
// so reads of items/doc/narrative are not the opaque `Json` union. Pattern: Supabase docs (MergeDeep).
import type { MergeDeep } from "type-fest";
import type { Database as DatabaseGenerated } from "./database-generated.types";
import type { ProjectItem } from "@/lib/project/items";
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
        // More jsonb overrides (deliverables.doc, narrative, etc.) get added during Task 3/4
        // triage, once the compiler shows exactly which columns need concrete types.
      };
    };
  }
>;
