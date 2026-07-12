// lib/concoctions/social-export.ts
//
// Flatten a block selection into a social PNG: the canvas keeps its layers —
// only the EXPORTED COPY is flattened (operator rule: "export as", never a
// destructive merge). The model feeds lib/social/render-social-image, whose
// own no-invention moat omits any stat without a real value. Provenance
// (source line + as-of) rides the watermark; the internal freshness token
// never ships.
import {
  renderSocialImage,
  type SocialModel,
  type SocialFormat,
} from "@/lib/social/render-social-image";
import type { EmailBlock } from "@/lib/email/doc/types";

/** Deterministically distill a block selection into the card model. */
export function blocksToSocialModel(blocks: EmailBlock[]): SocialModel {
  let headline = "";
  for (const b of blocks) {
    if (b.type === "hero") {
      const p = b.props as { value?: string; label?: string; prose?: string };
      headline = [p.label, p.value].filter(Boolean).join(": ") || p.prose || "";
      if (headline) break;
    }
    if (b.type === "signal") {
      const p = b.props as { title?: string };
      if (p.title) {
        headline = p.title;
        break;
      }
    }
    if (b.type === "text") {
      const p = b.props as { body?: string };
      if (p.body) {
        headline = p.body;
        break;
      }
    }
  }

  let stat: SocialModel["stat"];
  for (const b of blocks) {
    if (b.type === "metric-card") {
      const p = b.props as { metricValue?: string; metricLabel?: string; sub?: string };
      if (p.metricValue) {
        stat = { label: p.metricLabel ?? "", value: p.metricValue, caption: p.sub };
        break;
      }
    }
    if (b.type === "stats") {
      const p = b.props as { stats?: { value: string; label: string }[] };
      const cell = p.stats?.find((s) => s.value);
      if (cell) {
        stat = { label: cell.label, value: cell.value };
        break;
      }
    }
  }

  const binding = blocks.find((b) => b.binding)?.binding;

  return {
    headline: headline || "Southwest Florida, by the numbers",
    ...(stat ? { stat } : {}),
    ...(binding ? { as_of: binding.asOf, source: binding.sourceLine } : {}),
  };
}

export async function exportSocialPng(
  blocks: EmailBlock[],
  format: SocialFormat,
  deps?: { render?: typeof renderSocialImage; now?: Date },
): Promise<Buffer> {
  const model = blocksToSocialModel(blocks);
  return (deps?.render ?? renderSocialImage)({ model, format, now: deps?.now });
}
