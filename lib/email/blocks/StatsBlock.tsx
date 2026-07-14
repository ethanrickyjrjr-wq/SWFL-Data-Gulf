// lib/email/blocks/StatsBlock.tsx — PURE. 2–3 KPI cells side by side; inside a
// narrow grid column the same cells STACK vertically instead. HTML tables expand
// past width:100% when an unbreakable 32px value can't fit its cell — that
// expansion pushed every half-width stats seed ~100px past the 600px container
// (the stair-stepped captures of 07/10/2026).
import { Section, Row, Column, Text } from "@react-email/components";
import type { EmailGlobalStyle, StatItem, StatsProps } from "../doc/types";
import { fontStack, sectionPad, MUTED, BORDER, CARD_BG } from "./styles";
import { EditableText, type EditScope } from "./editable-text";
import { OPEN_SLOT_INK } from "./OpenSlot";
import {
  text,
  label,
  statRole,
  lines,
  pad,
  space,
  WEIGHT,
  TYPE,
  METRIC_ROW_PAD,
  type TypeRole,
} from "./scale";

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

  // ── WHICH NUMBER MATTERS (07/13/2026) ───────────────────────────────────────
  // Operator: "we need to make numbers different sizes and maybe colors in accordance
  // with importance… just looks bad." He was right, and the cause was structural: every
  // cell rendered at identical weight and colour, so $209/sq ft (which wins a listing
  // argument) looked exactly like "Type: Residential" (which nobody cares about).
  //
  // `emphasis` is per-cell and OPTIONAL — an undefined cell renders exactly as before.
  //   primary → larger, in the ACCENT colour. The one the eye should land on.
  //   muted   → smaller and quieter. Present, but not competing.
  // ── IT WAS INVERTED, AND IT WAS DROPPED (both fixed 07/14/2026) ─────────────
  //
  // The old sizeFor() read:
  //     primary → strip ? 20px : 30px    muted → strip ? 13px : 18px    base → 32px (grid)
  //
  // So in the GRID variant a `primary` cell rendered at 30px while a PLAIN cell
  // rendered at 32px — THE IMPORTANT NUMBER WAS SMALLER THAN THE BORING ONE. The
  // dial ran backwards, and only won on colour. And the STACKED path below called
  // valueStyle(empty, "22px") with no emphasis argument at all, so it dropped the
  // dial entirely — the exact path a narrow multi-column column triggers, i.e. the
  // path the fence system exists to produce.
  //
  // Now: `statRole()` (scale.ts) is monotonic BY CONSTRUCTION — primary > plain >
  // muted, at every density, pinned by scale.test.ts. Density is the `strip` flag:
  // a strip walks one step DOWN the real ladder rather than inventing 20/13/17/9px.
  const density = props.variant === "strip" ? "strip" : "grid";
  const colorFor = (e: StatItem["emphasis"]) =>
    e === "primary" ? globalStyle.accentColor : e === "muted" ? MUTED : globalStyle.primaryColor;

  // An open cell on the canvas: the label stays (it IS the instruction — "Baths"
  // tells the user what to type) and the value wears a dashed "fill me" outline with
  // an add affordance instead of a "0" placeholder that reads as a real figure.
  //
  // `numeric: true` — a stat value is ALWAYS a figure, and the design system requires
  // tabular figures on every numeric cell so columns of numbers align. Before today
  // that rule had zero implementations anywhere in the email renderer.
  // ── THE LABEL BASELINE (07/14/2026) ─────────────────────────────────────────
  //
  // Making the important number BIGGER immediately staggered the label row: with
  // $209 at a taller step than "3" and "Residential", each cell's label sat at a
  // different height and the row read as ragged — the exact "uneven" complaint,
  // reappearing one layer down. Emphasis without a shared baseline just moves the
  // mess around.
  //
  // So the VALUE ROW reserves ONE line box, sized at the tallest step present in
  // THIS row. Every label then starts at the same y, whatever the emphasis. Derived
  // from the scale (`lines()`), never a hand-typed height, so it tracks the type.
  const tallest = cells.reduce<TypeRole>(
    (max, { stat }) => {
      const r = statRole(stat.emphasis, density);
      return TYPE[r] > TYPE[max] ? r : max;
    },
    statRole(undefined, density),
  );

  const valueStyle = (empty: boolean, emphasis?: StatItem["emphasis"]) => ({
    fontFamily: font,
    ...(empty && scope
      ? text("body", { weight: WEIGHT.emphasis })
      : text(statRole(emphasis, density), { numeric: true })),
    color: empty && scope ? MUTED : colorFor(emphasis),
    margin: 0,
    // One shared line box → one shared label baseline across the whole row.
    minHeight: lines(tallest, 1),
    ...(empty && scope ? { ...OPEN_SLOT_INK, padding: pad(4, 8) } : {}),
  });

  if (stacked) {
    return (
      <Section style={sectionStyle} data-stats-variant="stacked">
        {cells.map(({ stat, i, empty }, pos) => (
          <Row key={i}>
            <Column
              style={{
                textAlign: "left",
                padding: pos === cells.length - 1 ? pad(4, 8) : space(4, 8, 16),
              }}
            >
              <EditableText
                as={Text}
                value={stat.value}
                path={`stats.${i}.value`}
                scope={scope}
                placeholder="+ Add"
                style={valueStyle(empty, stat.emphasis)}
              />
              <EditableText
                as={Text}
                value={stat.label}
                path={`stats.${i}.label`}
                scope={scope}
                placeholder="Label"
                style={{ fontFamily: font, ...label(), color: MUTED, margin: space(4, 0, 0) }}
              />
            </Column>
          </Row>
        ))}
      </Section>
    );
  }

  // THE SPEC STRIP — one delicate hairline-ruled row, the spec line a real listing flyer
  // runs under the price. Five cells in a STRIP read as a spec line; five cells in a GRID
  // read as a wall. Same data, entirely different email.
  if (density === "strip") {
    return (
      <Section
        style={{
          ...sectionStyle,
          borderTop: `1px solid ${globalStyle.accentColor}`,
          borderBottom: `1px solid ${globalStyle.accentColor}`,
          padding: pad(12, 16),
        }}
        data-stats-variant="strip"
      >
        <Row>
          {cells.map(({ stat, i, empty }) => (
            <Column key={i} style={{ textAlign: "center", padding: pad(4, 8) }}>
              <EditableText
                as={Text}
                value={stat.value}
                path={`stats.${i}.value`}
                scope={scope}
                placeholder="+ Add"
                style={valueStyle(empty, stat.emphasis)}
              />
              <EditableText
                as={Text}
                value={stat.label}
                path={`stats.${i}.label`}
                scope={scope}
                placeholder="Label"
                style={{ fontFamily: font, ...label(), color: MUTED, margin: space(4, 0, 0) }}
              />
            </Column>
          ))}
        </Row>
        {/* The provenance of a DERIVED cell, stated where the reader can see it — the
            sample says "*Computed from list price ÷ listed square footage" and it should. */}
        {props.footnote ? (
          <Text
            style={{
              fontFamily: font,
              ...text("mono"),
              color: MUTED,
              textAlign: "center",
              margin: space(8, 0, 0),
            }}
          >
            {props.footnote}
          </Text>
        ) : null}
      </Section>
    );
  }

  return (
    <Section style={sectionStyle}>
      <Row>
        {cells.map(({ stat, i, empty }) => (
          <Column key={i} style={{ textAlign: "center", padding: pad(METRIC_ROW_PAD, 8) }}>
            <EditableText
              as={Text}
              value={stat.value}
              path={`stats.${i}.value`}
              scope={scope}
              placeholder="+ Add"
              style={valueStyle(empty, stat.emphasis)}
            />
            <EditableText
              as={Text}
              value={stat.label}
              path={`stats.${i}.label`}
              scope={scope}
              placeholder="Label"
              style={{ fontFamily: font, ...label(), color: MUTED, margin: space(4, 0, 0) }}
            />
          </Column>
        ))}
      </Row>
    </Section>
  );
}
