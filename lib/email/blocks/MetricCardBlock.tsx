// lib/email/blocks/MetricCardBlock.tsx — PURE. One ranked metric: value, label,
// sub, an optional percentile bar, and rank/movement captions.
//
// The bar is a two-cell <table> (filled cell width = percentile, remainder =
// track) — the standard cross-client email meter: no image, no CSS gradient, no
// JS, and it survives Outlook, Gmail, and dark mode. It renders ONLY when a held
// percentile exists; an absent/undefined `barPct` shows no bar at all (a bar is a
// restatement of a held percentile, never a decoration). An out-of-range value is
// clamped to 0–100 so it can never overflow the track cell.
//
// Values are DATA-SEEDED (metricValue/metricLabel restated verbatim from the
// ranked-candidate pool) — the AI content-patch can never write them (those field
// names live outside BlockContentPatchSchema's allowlist).
import { Section, Text } from "@react-email/components";
import type { EmailGlobalStyle, MetricCardProps } from "../doc/types";
import { fontStack, sectionPad, MUTED, BORDER, CARD_BG } from "./styles";
import { isDarkBg, legibleAccent, ON_DARK_TITLE, ON_DARK_MUTED } from "./on-dark";

export function MetricCardBlock({
  props,
  globalStyle,
}: {
  props: MetricCardProps;
  globalStyle: EmailGlobalStyle;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const bg = props.sectionBg ?? globalStyle.surfaceColor ?? CARD_BG;
  const onDark = isDarkBg(bg);
  const muted = onDark ? ON_DARK_MUTED : MUTED;
  const accent = onDark ? legibleAccent(globalStyle.accentColor, bg) : globalStyle.accentColor;

  const pct = typeof props.barPct === "number" ? Math.max(0, Math.min(100, props.barPct)) : null;

  const captions = [props.rankText, props.movementText].filter((c): c is string => Boolean(c));

  return (
    <Section
      style={{
        backgroundColor: bg,
        padding: sectionPad(props.paddingY),
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      {props.metricValue ? (
        <Text
          style={{
            fontFamily: font,
            fontSize: "30px",
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "0.01em",
            color: onDark ? ON_DARK_TITLE : globalStyle.primaryColor,
            margin: 0,
          }}
        >
          {props.metricValue}
        </Text>
      ) : null}
      {props.metricLabel ? (
        <Text
          style={{
            fontFamily: font,
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: muted,
            margin: "6px 0 0",
          }}
        >
          {props.metricLabel}
        </Text>
      ) : null}
      {props.sub ? (
        <Text style={{ fontFamily: font, fontSize: "12px", color: muted, margin: "2px 0 0" }}>
          {props.sub}
        </Text>
      ) : null}

      {pct !== null ? (
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ borderCollapse: "collapse", width: "100%", margin: "12px 0 0" }}
        >
          <tbody>
            <tr>
              <td
                width={`${pct}%`}
                style={{
                  width: `${pct}%`,
                  backgroundColor: accent,
                  height: "6px",
                  fontSize: 0,
                  lineHeight: 0,
                }}
              >
                &nbsp;
              </td>
              <td style={{ backgroundColor: BORDER, height: "6px", fontSize: 0, lineHeight: 0 }}>
                &nbsp;
              </td>
            </tr>
          </tbody>
        </table>
      ) : null}

      {captions.length > 0 ? (
        <Text
          style={{
            fontFamily: font,
            fontSize: "12px",
            fontWeight: 600,
            color: accent,
            margin: "8px 0 0",
          }}
        >
          {captions.join("  ·  ")}
        </Text>
      ) : null}
    </Section>
  );
}
