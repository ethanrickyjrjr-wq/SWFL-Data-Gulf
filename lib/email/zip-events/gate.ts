// lib/email/zip-events/gate.ts
//
// Movement gate + fill ladder + alert/roundup batching (spec §3-4). Pure.
// Ladder: subject ZIP events → market-area sibling events → city pulse →
// county trends. A genuinely flat week ⇒ NO send (reported skip) — never a
// padded or bare email. Alerts batch to ≤1/subscriber/day (Zillow overnight-
// queue pattern); an alert inside the roundup window absorbs the roundup.

import type { MarketArea } from "./market-areas";
import type { MarketEvent, MarketEventGrain } from "./types";

export const ROUNDUP_ABSORB_HOURS = 24; // [PROVISIONAL]

export interface WeeklySelection {
  send: boolean;
  used: MarketEvent[];
  fill_grains: MarketEventGrain[];
  skip_reason?: "flat_week";
}

export function selectWeeklyContent(
  subjectZip: string,
  area: MarketArea,
  events: MarketEvent[],
): WeeklySelection {
  const inArea = events.filter(
    (e) => e.area_id === area.area_id && (e.class === "weekly" || e.class === "alert"),
  );
  const subject = inArea.filter((e) => e.zip === subjectZip);
  const siblings = inArea.filter((e) => e.zip != null && e.zip !== subjectZip);
  const areaGrain = inArea.filter((e) => e.zip == null && e.grain === "area");
  const city = inArea.filter((e) => e.zip == null && e.grain === "city");
  const county = inArea.filter((e) => e.zip == null && e.grain === "county");

  const used = [...subject, ...siblings, ...areaGrain, ...city, ...county];
  if (used.length === 0) {
    return { send: false, used: [], fill_grains: [], skip_reason: "flat_week" };
  }

  const fill_grains = [
    ...new Set(used.map((e) => (e.zip != null ? "zip" : e.grain))),
  ] as MarketEventGrain[];
  return { send: true, used, fill_grains };
}

/** The alert-class events that justify TODAY's single alert email for this
 *  subscriber. Empty = no alert today. Baseline never rides an alert. */
export function pickDailyAlert(
  events: MarketEvent[],
  subjectZip: string,
  area: MarketArea,
): MarketEvent[] {
  return events.filter(
    (e) =>
      e.class === "alert" &&
      e.area_id === area.area_id &&
      (e.zip == null || area.zips.includes(e.zip)),
  );
}

export function alertAbsorbsRoundup(alertSentAtIso: string | null, nowIso: string): boolean {
  if (!alertSentAtIso) return false;
  const dtMs = new Date(nowIso).getTime() - new Date(alertSentAtIso).getTime();
  return dtMs >= 0 && dtMs <= ROUNDUP_ABSORB_HOURS * 3600 * 1000;
}
