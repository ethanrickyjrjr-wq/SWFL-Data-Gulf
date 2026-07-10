// lib/email/blocks/StatsBlock.tsx — PURE. 2–3 KPI cells side by side; inside a
// narrow grid column the same cells STACK vertically instead. HTML tables expand
// past width:100% when an unbreakable 32px value can't fit its cell — that
// expansion pushed every half-width stats seed ~100px past the 600px container
// (the stair-stepped captures of 07/10/2026).
import { Section, Row, Column, Text } from "@react-email/components";
import type { EmailGlobalStyle, StatsProps } from "../doc/types";
import { fontStack, sectionPad, MUTED, BORDER, CARD_BG } from "./styles";

/** Side-by-side needs ~180px per cell for a "$630,000"-class value at 32px.
 *  Full width (600/3 = 200) keeps the classic row; any grid column tighter
 *  than that per cell stacks. */
const MIN_CELL_PX = 180;

export function StatsBlock({
  props,
  globalStyle,
  colPx,
}: {
  props: StatsProps;
  globalStyle: EmailGlobalStyle;
  /** Rendered column width in px when the block sits in a grid column
   *  (compile-grid passes it; the free stacker and the canvas don't). */
  colPx?: number;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const stats = props.stats ?? [];
  const stacked = colPx !== undefined && stats.length > 0 && colPx / stats.length < MIN_CELL_PX;
  const sectionStyle = {
    backgroundColor: props.sectionBg ?? globalStyle.surfaceColor ?? CARD_BG,
    padding: sectionPad(props.paddingY),
    borderBottom: `1px solid ${BORDER}`,
  };

  if (stacked) {
    return (
      <Section style={sectionStyle} data-stats-variant="stacked">
        {stats.map((s, i) => (
          <Row key={i}>
            <Column
              style={{
                textAlign: "left",
                padding: i === stats.length - 1 ? "4px 8px" : "4px 8px 14px",
              }}
            >
              <Text
                style={{
                  fontFamily: font,
                  fontSize: "22px",
                  fontWeight: 700,
                  letterSpacing: "0.01em",
                  color: globalStyle.primaryColor,
                  margin: 0,
                }}
              >
                {s.value}
              </Text>
              <Text style={{ fontFamily: font, fontSize: "11px", color: MUTED, margin: "2px 0 0" }}>
                {s.label}
              </Text>
            </Column>
          </Row>
        ))}
      </Section>
    );
  }

  return (
    <Section style={sectionStyle}>
      <Row>
        {stats.map((s, i) => (
          <Column key={i} style={{ textAlign: "center", padding: "8px" }}>
            <Text
              style={{
                fontFamily: font,
                fontSize: "32px",
                fontWeight: 700,
                letterSpacing: "0.01em",
                color: globalStyle.primaryColor,
                margin: 0,
              }}
            >
              {s.value}
            </Text>
            <Text style={{ fontFamily: font, fontSize: "11px", color: MUTED, margin: "4px 0 0" }}>
              {s.label}
            </Text>
          </Column>
        ))}
      </Row>
    </Section>
  );
}
