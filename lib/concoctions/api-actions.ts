// lib/concoctions/api-actions.ts — the pure dispatcher behind /api/concoctions.
// The route is a thin shell (mirrors app/api/email-lab/* — builds are free/unauthed;
// the paid gate is the UI capability dial, send stays the paywall). Everything
// testable lives here.
import { z } from "zod";
import type { EmailBlock } from "@/lib/email/doc/types";
import { getConcoction, concoctionIndex } from "./registry";
import {
  materializeLoad,
  rebindBlock,
  turnIntoBlock,
  BindingUnrefreshable,
  type MaterializeDeps,
} from "./materialize";
import { checkDocFreshness } from "./freshness";

const ParamsRecord = z.record(z.string(), z.union([z.string(), z.number()]));

/** Shapes a binding may re-render as (turn-into targets). */
const TURN_TARGETS = ["hero", "stats", "list", "metric-card", "image"] as const;

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("load"), id: z.string().min(1), params: ParamsRecord.optional() }),
  z.object({ action: z.literal("rebind"), block: z.unknown(), params: ParamsRecord.optional() }),
  z.object({
    action: z.literal("turn-into"),
    block: z.unknown(),
    newType: z.enum(TURN_TARGETS),
  }),
  z.object({ action: z.literal("freshness"), blocks: z.array(z.unknown()).max(40) }),
]);

export type ConcoctionActionBody = z.infer<typeof ActionSchema>;

export interface ActionError {
  error: string;
  status: number;
}

export function listDatasets() {
  return { datasets: concoctionIndex() };
}

export async function runConcoctionAction(
  body: unknown,
  deps: MaterializeDeps,
): Promise<Record<string, unknown> | ActionError> {
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return { error: "invalid action", status: 400 };
  const a = parsed.data;

  try {
    switch (a.action) {
      case "load": {
        const def = getConcoction(a.id);
        if (!def) return { error: `unknown dataset ${a.id}`, status: 404 };
        const { blocks, asOf } = await materializeLoad(def, a.params ?? {}, deps);
        return { blocks, asOf };
      }
      case "rebind": {
        try {
          const block = await rebindBlock(a.block as EmailBlock, a.params ?? {}, deps);
          return { block };
        } catch (e) {
          if (e instanceof BindingUnrefreshable) return { unrefreshable: true, reason: e.message };
          throw e;
        }
      }
      case "turn-into": {
        try {
          const block = await turnIntoBlock(a.block as EmailBlock, a.newType, deps);
          return { block };
        } catch (e) {
          if (e instanceof BindingUnrefreshable) return { unrefreshable: true, reason: e.message };
          throw e;
        }
      }
      case "freshness": {
        const staleness = await checkDocFreshness(a.blocks as EmailBlock[], { sb: deps.sb });
        return { staleness };
      }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "action failed", status: 502 };
  }
}
