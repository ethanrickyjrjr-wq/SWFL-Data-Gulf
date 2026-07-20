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

/** Content identity of an event — what "the same fact" means across sends.
 *  Same type + scope + headline fact (label AND value) = the subscriber already
 *  read this; a re-detected event with a NEW value is genuinely new content.
 *  Why this exists: the baseline welcome shows ALL current area events, alerts
 *  bypass cadence, and lifecycle bursts re-fire all week from the same counts —
 *  so without an identity to dedupe on, the next day's "alert" was the baseline
 *  again (the 07/19 two-identical-emails inbox). */
export function eventKey(e: MarketEvent): string {
  const scope = e.zip ?? `${e.grain}:${e.area_id}`;
  if (e.type === "nearby_news") {
    return ["nearby_news", scope, ...e.facts.map((f) => f.label)].join("|");
  }
  const f = e.facts[0];
  return [e.type, scope, f?.label ?? "", String(f?.value ?? "")].join("|");
}

export interface WeeklySelection {
  send: boolean;
  used: MarketEvent[];
  fill_grains: MarketEventGrain[];
  skip_reason?: "flat_week" | "nothing_new";
}

export function selectWeeklyContent(
  subjectZip: string,
  area: MarketArea,
  events: MarketEvent[],
  /** eventKey()s the subscriber's LAST email already showed — never resent. */
  exclude?: ReadonlySet<string>,
): WeeklySelection {
  const inAreaAll = events.filter(
    (e) => e.area_id === area.area_id && (e.class === "weekly" || e.class === "alert"),
  );
  const inArea = exclude ? inAreaAll.filter((e) => !exclude.has(eventKey(e))) : inAreaAll;
  const subject = inArea.filter((e) => e.zip === subjectZip);
  const siblings = inArea.filter((e) => e.zip != null && e.zip !== subjectZip);
  const areaGrain = inArea.filter((e) => e.zip == null && e.grain === "area");
  const city = inArea.filter((e) => e.zip == null && e.grain === "city");
  const county = inArea.filter((e) => e.zip == null && e.grain === "county");

  const used = [...subject, ...siblings, ...areaGrain, ...city, ...county];
  if (used.length === 0) {
    // Distinguish a genuinely flat market from "moved, but the subscriber was
    // already told" — run reports read differently for the two.
    const skip_reason = inAreaAll.length > 0 ? "nothing_new" : "flat_week";
    return { send: false, used: [], fill_grains: [], skip_reason };
  }

  const fill_grains = [
    ...new Set(used.map((e) => (e.zip != null ? "zip" : e.grain))),
  ] as MarketEventGrain[];
  return { send: true, used, fill_grains };
}

/** The alert-class events that justify TODAY's single alert email for this
 *  subscriber. Empty = no alert today. Baseline never rides an alert. An event
 *  the subscriber's last email already showed (`exclude`) never re-fires — an
 *  alert repeating the welcome snapshot is a duplicate, not an alert. */
export function pickDailyAlert(
  events: MarketEvent[],
  subjectZip: string,
  area: MarketArea,
  exclude?: ReadonlySet<string>,
): MarketEvent[] {
  return events.filter(
    (e) =>
      e.class === "alert" &&
      e.area_id === area.area_id &&
      (e.zip == null || area.zips.includes(e.zip)) &&
      !(exclude?.has(eventKey(e)) ?? false),
  );
}

export function alertAbsorbsRoundup(alertSentAtIso: string | null, nowIso: string): boolean {
  if (!alertSentAtIso) return false;
  const dtMs = new Date(nowIso).getTime() - new Date(alertSentAtIso).getTime();
  return dtMs >= 0 && dtMs <= ROUNDUP_ABSORB_HOURS * 3600 * 1000;
}
