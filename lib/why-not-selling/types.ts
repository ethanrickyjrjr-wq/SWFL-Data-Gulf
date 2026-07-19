// lib/why-not-selling/types.ts — shared shapes for the Why Isn't It Selling check engine.
export type CheckStatus = "flag" | "clear" | "unavailable";
export interface CheckFigure {
  label: string;
  value: string;
  source: string;
  asOf: string;
}
export interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  headline: string | null; // null iff unavailable
  detail: string | null;
  figures: CheckFigure[];
}
export interface SubjectHome {
  addressKey: string;
  display: string;
  zip: string;
  city: string | null;
  county: string | null;
  listPrice: number | null;
  sqft: number | null;
  domDays: number | null;
  domIsFloor: boolean;
  cdomDays: number | null;
  listedDate: string | null;
  propertyId: string | null;
  status: string | null;
}
export interface ZipDomMedian {
  medianDom: number;
  sampleSize: number;
  asOf: string;
}
export interface BandRow {
  band: number;
  priceLo: number;
  priceHi: number;
  medianDom: number | null;
  sampleSize: number;
}
export interface StaleShare {
  activeCount: number;
  exactCount: number;
  over90: number;
  over180: number;
  asOf: string;
}
export interface PricePosition {
  pricePctile: number | null;
  ppsfPctile: number | null;
  priceN: number;
  ppsfN: number;
}
export interface ParcelFact {
  salePrice: number;
  saleYear: number;
  saleMonth: number;
  yearBuilt: number | null;
  livingAreaSqft: number | null;
  county: "Lee" | "Collier";
}
export interface ZhviChange {
  pctChange: number;
  fromMdy: string;
  asOf: string;
}
export interface CutEvent {
  at: string;
  price: number;
  delta: number;
}
/** Shared sample floor: a ZIP aggregate below this many exact rows is suppressed. Judgment value (spec §checks). */
export const MIN_ZIP_SAMPLE = 8;
/** Band aggregates tolerate a smaller floor (quintiles of one ZIP). Judgment value. */
export const MIN_BAND_SAMPLE = 5;
