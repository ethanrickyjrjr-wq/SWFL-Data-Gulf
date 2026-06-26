import type { ChartSpec } from "../chart-spec";
import { lineBandSvg, type LineBandPoint } from "@/lib/charts/svg/line-band";
import type { ValueFormat } from "@/lib/charts/format";

/**
 * LineBandFrame — frameId "line-band". The React surface of the ONE
 * line-with-confidence-band renderer. Thin by contract: pull the points from
 * `spec.options.data`, resolve accent from `spec.theme`/`spec.options`, and hand
 * everything to the SAME pure `lineBandSvg` builder the email PNG path uses. The
 * frame never draws its own SVG — it wraps the builder's string so web + email
 * can never drift.
 *
 * spec.options shape:
 *   data: Array<{ label: string; value: number; lo?: number; hi?: number }>
 *   accent?: string        — overrides spec.theme.accent
 *   valueFormat?: ValueFormat
 *
 * The shaded lo/hi band is the visual home for an [INFERENCE] projection's
 * uncertainty; observed points carry no lo/hi and render as a plain trend.
 */

function extractPoints(options: Record<string, unknown> | undefined): LineBandPoint[] {
  const raw = options?.data;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is Record<string, unknown> => p !== null && typeof p === "object" && !Array.isArray(p),
    )
    .map((p) => ({
      label: typeof p.label === "string" ? p.label : "",
      value: typeof p.value === "number" ? p.value : 0,
      lo: typeof p.lo === "number" ? p.lo : undefined,
      hi: typeof p.hi === "number" ? p.hi : undefined,
    }));
}

export function LineBandFrame({ spec }: { spec: ChartSpec }) {
  const points = extractPoints(spec.options);

  const accent =
    typeof spec.options?.accent === "string"
      ? (spec.options.accent as string)
      : (spec.theme?.accent ?? "#e05c2e");

  // The pure builder speaks the chart-format vocabulary (ValueFormat); ChartBlock's
  // value_format is a wider union, so accept only the members that actually overlap.
  const VALUE_FORMATS: ValueFormat[] = ["usd", "rent", "count", "pct", "index"];
  const isValueFormat = (s: unknown): s is ValueFormat =>
    typeof s === "string" && (VALUE_FORMATS as string[]).includes(s);
  const vfOption = spec.options?.valueFormat;
  const vfBlock = spec.value_format;
  const valueFormat: ValueFormat | undefined = isValueFormat(vfOption)
    ? vfOption
    : isValueFormat(vfBlock)
      ? vfBlock
      : undefined;

  if (points.length === 0) {
    return (
      <div
        style={{ padding: "1.5rem", textAlign: "center", color: "#6b7280", fontSize: 13 }}
        data-frame="line-band"
      >
        No projection points to display.
      </div>
    );
  }

  const svg = lineBandSvg(points, {
    title: spec.title,
    accent,
    valueFormat,
    source: spec.source?.citation,
    asOf: spec.asOf,
  });

  // The builder returns a self-contained, sanitized SVG string (no <script>/
  // <style>, every data label run through esc()). Wrapping it is the only place
  // the React surface touches the chart — the same string the email PNG path
  // rasterizes, so the two surfaces can never fork.
  return (
    <div
      data-frame="line-band"
      style={{ width: "100%", maxWidth: 600 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
