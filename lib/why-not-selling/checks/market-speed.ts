// lib/why-not-selling/checks/market-speed.ts — check 1: subject DOM vs the ZIP's
// typical (exact-only median) and the subject's own price band. DOM wording via
// formatDom ONLY. Flag threshold 1.5x is a spec judgment value.
import { formatDom } from "../../listings/dom";
import { MIN_BAND_SAMPLE, MIN_ZIP_SAMPLE } from "../types";
import type { BandRow, CheckResult, SubjectHome, ZipDomMedian } from "../types";

const SPEED_FLAG_RATIO = 1.5;

export function marketSpeed(
  subject: SubjectHome,
  zipMedian: ZipDomMedian | null,
  bands: BandRow[] | null,
): CheckResult {
  const base = { id: "market-speed", title: "Market speed" };
  const domPhrase = formatDom({
    domDays: subject.domDays,
    isFloor: subject.domIsFloor,
    cdomDays: subject.cdomDays,
  });
  if (!domPhrase || !zipMedian || zipMedian.sampleSize < MIN_ZIP_SAMPLE) {
    return { ...base, status: "unavailable", headline: null, detail: null, figures: [] };
  }
  const figures = [
    { label: "This home", value: domPhrase, source: "SWFL Data Gulf", asOf: zipMedian.asOf },
    {
      label: `Typical in ${subject.zip} (active listings)`,
      value: `${Math.round(zipMedian.medianDom)} days`,
      source: "SWFL Data Gulf",
      asOf: zipMedian.asOf,
    },
  ];
  const band =
    subject.listPrice != null && bands
      ? bands.find((b) => subject.listPrice! >= b.priceLo && subject.listPrice! <= b.priceHi)
      : undefined;
  if (band && band.medianDom != null && band.sampleSize >= MIN_BAND_SAMPLE) {
    figures.push({
      label: "Homes priced like this one here",
      value: `${Math.round(band.medianDom)} days typical`,
      source: "SWFL Data Gulf",
      asOf: zipMedian.asOf,
    });
  }
  const flagged =
    subject.domDays != null && subject.domDays >= SPEED_FLAG_RATIO * zipMedian.medianDom;
  return {
    ...base,
    status: flagged ? "flag" : "clear",
    headline: flagged
      ? `${domPhrase} — typical for an active listing in ${subject.zip} is ${Math.round(zipMedian.medianDom)} days.`
      : `${domPhrase} — in line with the ${Math.round(zipMedian.medianDom)}-day typical for ${subject.zip}.`,
    detail: null,
    figures,
  };
}
