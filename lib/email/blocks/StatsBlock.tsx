// lib/email/blocks/StatsBlock.tsx — PURE. 2–3 KPI cells side by side; inside a
// narrow grid column the same cells STACK vertically instead. HTML tables expand
// past width:100% when an unbreakable 32px value can't fit its cell — that
// expansion pushed every half-width stats seed ~100px past the 600px container
// (the stair-stepped captures of 07/10/2026).
import { Section, Row, Column, Text } from "@react-email/components";
import type { EmailGlobalStyle, StatsProps } from "../doc/types";
import { fontStack, sectionPad, MUTED, BORDER, CARD_BG } from "./styles";
import { EditableText, type EditScope } from "./editable-text";
import { OPEN_SLOT_INK } from "./OpenSlot";

/** Side-by-side needs ~180px per cell for a "$630,000"-class value at 32px.
 *  Full width (600/3 = 200) keeps the classic row; any grid column tighter
 *  than that per cell stacks. */
const MIN_CELL_PX = 180;

export function StatsBlock({
  props,
  globalStyle,
  colPx,
  emailRender,
  scope,
}: {
  props: StatsProps;
  globalStyle: EmailGlobalStyle;
  /** Rendered column width in px when the block sits in a grid column
   *  (compile-grid passes it; the free stacker and the canvas don't). */
  colPx?: number;
  /** True on the sendable-HTML paths — THE OPEN-SLOT CONTRACT: a cell we could not
   *  source is an invitation to the USER, never a naked label (and never a zero) to
   *  a recipient. An unsourced cell is dropped here; a row with no surviving cell
   *  does not exist at all. */
  emailRender?: boolean;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  // Keep each cell's ORIGINAL index — the canvas edit paths (`stats.<i>.value`)
  // address props.stats, so filtering must never renumber them.
  const cells = (props.stats ?? [])
    .map((stat, i) => ({ stat, i, empty: !(stat.value ?? "").trim() }))
    .filter((c) => !(emailRender && c.empty));

  // Every cell in this row was unsourced → the row itself does not exist in the email.
  if (emailRender && cells.length === 0) return null;

  const stacked = colPx !== undefined && cells.length > 0 && colPx / cells.length < MIN_CELL_PX;
  const sectionStyle = {
    backgroundColor: props.sectionBg ?? globalStyle.surfaceColor ?? CARD_BG,
    padding: sectionPad(props.paddingY),
    borderBottom: `1px solid ${BORDER}`,
  };

  // An open cell on the canvas: the label stays (it IS the instruction — "Baths"
  // tells the user what to type) and the value wears a dashed "fill me" outline with
  // an add affordance instead of a "0" placeholder that reads as a real figure.
  const valueStyle = (empty: boolean, size: string) => ({
    fontFamily: font,
    fontSize: empty && scope ? "18px" : size,
    fontWeight: 700,
    letterSpacing: "0.01em",
    color: empty && scope ? MUTED : globalStyle.primaryColor,
    margin: 0,
    ...(empty && scope ? { ...OPEN_SLOT_INK, padding: "4px 8px" } : {}),
  });

  if (stacked) {
    return (
      <Section style={sectionStyle} data-stats-variant="stacked">
        {cells.map(({ stat, i, empty }, pos) => (
          <Row key={i}>
            <Column
              style={{
                textAlign: "left",
                padding: pos === cells.length - 1 ? "4px 8px" : "4px 8px 14px",
              }}
            >
              <EditableText
                as={Text}
                value={stat.value}
                path={`stats.${i}.value`}
                scope={scope}
                placeholder="+ Add"
                style={valueStyle(empty, "22px")}
              />
              <EditableText
                as={Text}
                value={stat.label}
                path={`stats.${i}.label`}
                scope={scope}
                placeholder="Label"
                style={{ fontFamily: font, fontSize: "11px", color: MUTED, margin: "2px 0 0" }}
              />
            </Column>
          </Row>
        ))}
      </Section>
    );
  }

  return (
    <Section style={sectionStyle}>
      <Row>
        {cells.map(({ stat, i, empty }) => (
          <Column key={i} style={{ textAlign: "center", padding: "8px" }}>
            <EditableText
              as={Text}
              value={stat.value}
              path={`stats.${i}.value`}
              scope={scope}
              placeholder="+ Add"
              style={valueStyle(empty, "32px")}
            />
            <EditableText
              as={Text}
              value={stat.label}
              path={`stats.${i}.label`}
              scope={scope}
              placeholder="Label"
              style={{ fontFamily: font, fontSize: "11px", color: MUTED, margin: "4px 0 0" }}
            />
          </Column>
        ))}
      </Row>
    </Section>
  );
}
