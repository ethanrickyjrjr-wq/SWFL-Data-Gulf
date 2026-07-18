// lib/buyer-leverage/types.ts
import type { RelistFact } from "@/lib/back-on-market/relist-fact";

export interface CutEvent {
  /** Cut date, MM/DD/YYYY (as-of convention). */
  date: string;
  /** Positive dollar size of the cut. */
  sizeUsd: number;
}

export interface CutHistory {
  count: number;
  totalCutUsd: number;
  events: CutEvent[];
  /** false when the subject is floored — pre-window cuts may be censored, so the count is a lower bound. */
  complete: boolean;
}

export interface DomRead {
  domDays: number | null;
  /** dom_is_floor — first_seen ≤ 07/03/2026 with no vendor date/relist → dom_days is a lower bound. */
  isFloor: boolean;
  cdomDays: number | null;
  /** listing_state.state — only 'active' gets the leverage framing. */
  state: string | null;
}

export interface ZipBenchmark {
  /** Median dom_days of active for-sale listings in the ZIP, floored rows excluded. */
  medianDomDays: number | null;
  /** Share of the ZIP's active listings that have taken a cut (reused own-data aggregate). */
  priceReducedShare: number | null;
  /** Count of listings behind the median — used to drop a thin benchmark. */
  sampleSize: number;
}

export interface LeverageRead {
  zip: string;
  place: string;
  /** null when there is no per-home match (area-only read). */
  dom: DomRead | null;
  cuts: CutHistory | null;
  relist: RelistFact | null;
  benchmark: ZipBenchmark | null;
  /** Render-ready, already-composed fact sentences. Empty = nothing real to say. */
  lines: string[];
}
