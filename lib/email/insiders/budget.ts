// lib/email/insiders/budget.ts
//
// Per-issue spend ledger (operator ruling 07/10/2026: $20/issue default cap —
// room to run on early issues; the cap is a HARD abort-before-next-call, never a
// mid-stream kill and never silence). Rates come from the ONE metered client's
// computeCostUsd, so a refusal-fallback pass served by claude-opus-4-8 prices at
// opus rates automatically (response.model names the model that produced it).
import { computeCostUsd, type UsageLike } from "@/refinery/agents/anthropic.mts";

export class IssueBudgetError extends Error {
  constructor(spentUsd: number, estimateUsd: number, capUsd: number) {
    super(
      `[insiders-budget] next pass (~$${estimateUsd.toFixed(2)}) would breach the issue cap: ` +
        `$${spentUsd.toFixed(2)} spent + estimate > $${capUsd.toFixed(2)}. ` +
        `Raise INSIDERS_MAX_SPEND_USD deliberately or ship the draft pass.`,
    );
    this.name = "IssueBudgetError";
  }
}

export interface LedgerEntry {
  pass: string; // "draft" | "editor" | ...
  model: string;
  usage: UsageLike;
  costUsd: number;
}

export class IssueBudget {
  readonly entries: LedgerEntry[] = [];
  constructor(readonly capUsd: number) {}

  spentUsd(): number {
    return this.entries.reduce((s, e) => s + e.costUsd, 0);
  }

  record(pass: string, model: string, usage: UsageLike): LedgerEntry {
    const entry = { pass, model, usage, costUsd: computeCostUsd(model, usage) };
    this.entries.push(entry);
    return entry;
  }

  assertRoom(nextPassEstimateUsd: number): void {
    if (this.spentUsd() + nextPassEstimateUsd > this.capUsd)
      throw new IssueBudgetError(this.spentUsd(), nextPassEstimateUsd, this.capUsd);
  }
}
