// lib/why-not-selling/checks/cross-check.ts — check 7: the discrepancy-reporting rule made
// visible. Our live daily median DOM for the ZIP, set beside realtor.com's monthly figure,
// both labeled with their own source and as-of. This check NEVER flags — two honestly
// different methodologies disagreeing is information, not a problem — so its status is
// "clear" whenever both sides exist and "unavailable" otherwise.
import { MIN_ZIP_SAMPLE } from "../types";
import type { CheckResult, ZipDomMedian } from "../types";

export function crossCheck(
  zipMedian: ZipDomMedian | null,
  heat: { medianDom: number; asOf: string } | null,
  zip: string,
): CheckResult {
  const base = { id: "cross-check", title: "Two reads, side by side" };
  if (!zipMedian || zipMedian.sampleSize < MIN_ZIP_SAMPLE || !heat) {
    return { ...base, status: "unavailable", headline: null, detail: null, figures: [] };
  }
  const ours = Math.round(zipMedian.medianDom);
  const theirs = Math.round(heat.medianDom);
  return {
    ...base,
    status: "clear",
    headline: `Our live daily read for ${zip}: ${ours} days typical · realtor.com's monthly figure: ${theirs} days (as of ${heat.asOf}).`,
    detail: null,
    figures: [
      {
        label: `Live daily median, active listings in ${zip}`,
        value: `${ours} days`,
        source: "SWFL Data Gulf",
        asOf: zipMedian.asOf,
      },
      {
        label: `Monthly median for ${zip}`,
        value: `${theirs} days`,
        source: "realtor.com",
        asOf: heat.asOf,
      },
    ],
  };
}
