import type {
  BrainOutputMetric,
  BrainOutputMetricDisplayFormat,
} from "../refinery/types/brain-output.mts";

function fmtNumber(v: number, fmt?: BrainOutputMetricDisplayFormat): string {
  switch (fmt) {
    case "currency":
      return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    case "percent":
      return `${v}%`;
    case "count":
      return v.toLocaleString("en-US");
    default:
      return String(v);
  }
}

export function formatMetricValue(m: BrainOutputMetric): string {
  return typeof m.value === "string" ? m.value : fmtNumber(m.value, m.display_format);
}

export function formatDetailCell(
  v: number | string | boolean,
  fmt?: BrainOutputMetricDisplayFormat,
): string {
  if (typeof v === "boolean") return v ? "yes" : "no";
  return typeof v === "string" ? v : fmtNumber(v, fmt);
}
